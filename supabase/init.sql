-- =====================================================================
-- Flexform : sondages du BDE (tables sondage_*)
-- Idempotent : relançable tel quel, sur une base vierge comme sur la production existante (rien n'est
-- perdu : ce qui manque est ajouté, les règles de sécurité sont remises à leur version actuelle).
-- Toute évolution du schéma de l'appli se fait dans ce fichier.
--
-- À appliquer APRÈS supabase/init.sql du dépôt flexstaff (droits de la suite) :
--   En local      : npm run db:setup (base en place) ou npm run db:reset (base vierge), dans flexstaff
--   En production : SQL Editor de Supabase, flexstaff d'abord, puis ce fichier
-- =====================================================================

do $$
begin
  if to_regprocedure('public.suite_has_app_role(text, text[])') is null then
    raise exception 'Appliquer d''abord supabase/init.sql du dépôt flexstaff (droits de la suite).';
  end if;
end
$$;

-- Inscription dans la suite : ses admins et son staff se gèrent dans app_roles (Flexstaff)
insert into public.suite_apps (app, name) values ('flexform', 'Flexform') on conflict (app) do nothing;

-- Tables préfixées « sondage_ » dans le schéma public.
--
-- Qui accède à quoi :
--   * votants     : jamais d'accès direct. Le serveur de l'appli agit pour eux avec la clé service_role,
--                   après avoir vérifié leur session (cookie).
--   * admin/staff : comptes Supabase Auth, rôle flexform dans app_roles. Leurs requêtes arrivent avec leur
--                   propre jeton : la sécurité par ligne (RLS) ci-dessous s'applique.
--   * anon        : rien.

create table if not exists public.sondage_polls (
  id text primary key,
  position int not null default 0,
  kind text not null check (kind in ('choice', 'text')),
  question text not null check (char_length(question) between 1 and 200),
  -- [{ "id": "0", "label": "Pour" }, ...]
  options jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  reveal boolean not null default false,
  hub boolean not null default false,
  category text not null default '' check (char_length(category) <= 40),
  reward text not null default '' check (char_length(reward) <= 80),
  created_at timestamptz not null default now(),
  -- Première mise en ligne, pour le succès « Plus rapide que la lumière »
  published_at timestamptz
);

-- Sondage réservé au staff : jamais montré aux votants. Le staff et les admins y répondent depuis la
-- page /staff de Flexstaff, avec leur compte, tant qu'il est « dans le hub ». Pas de récompense : les codes de
-- récompense appartiennent aux votants.
alter table public.sondage_polls add column if not exists staff_only boolean not null default false;
alter table public.sondage_polls drop constraint if exists sondage_polls_staff_no_reward;
alter table public.sondage_polls add constraint sondage_polls_staff_no_reward check (not staff_only or reward = '');

-- Réglages globaux (une seule ligne)
create table if not exists public.sondage_settings (
  id int primary key default 1 check (id = 1),
  active_poll_id text references public.sondage_polls (id) on delete set null
);
-- Ancien lien d'apparence avec Flexfolio, retiré : Flexform garde son propre thème
alter table public.sondage_settings drop column if exists theme_linked;
-- Thème Flexdesign lié (réglage d'admin, vide = thème du BDE). Pas de clé étrangère : Flexdesign est
-- facultatif, et un thème supprimé ou introuvable ramène simplement le thème du BDE.
alter table public.sondage_settings add column if not exists design_theme_id uuid;
insert into public.sondage_settings (id) values (1) on conflict (id) do nothing;

-- Votants. L'id sert aussi de jeton de session (cookie HttpOnly).
create table if not exists public.sondage_participants (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null check (char_length(pseudo) between 2 and 24),
  prenom text not null default '' check (char_length(prenom) <= 40),
  nom text not null default '' check (char_length(nom) <= 40),
  formation text not null default '' check (char_length(formation) <= 60),
  -- { version, acceptedAt, marketing, sponsors, updatedAt } : consentement RGPD
  consent jsonb,
  -- false après déconnexion : le profil reste pour l'export, le pseudo est libéré
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Un pseudo n'est réservé que par une session ouverte
create unique index if not exists sondage_participants_active_pseudo
  on public.sondage_participants (lower(pseudo)) where active;

create table if not exists public.sondage_votes (
  poll_id text not null references public.sondage_polls (id) on delete cascade,
  participant_id uuid not null references public.sondage_participants (id) on delete cascade,
  -- optionId pour un choix, texte pour une réponse libre
  value text not null check (char_length(value) between 1 and 280),
  voted_at timestamptz not null default now(),
  primary key (poll_id, participant_id)
);
create index if not exists sondage_votes_participant on public.sondage_votes (participant_id);

-- Réponses du staff aux sondages réservés au staff, une par compte et par sondage. Séparées de
-- sondage_votes : ce ne sont pas des votants (pas de pseudo, pas de classement, pas de « Mes données »).
create table if not exists public.sondage_staff_votes (
  poll_id text not null references public.sondage_polls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- optionId pour un choix, texte pour une réponse libre
  value text not null check (char_length(value) between 1 and 280),
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

-- Récompenses : un code à usage unique par votant et par sondage
create table if not exists public.sondage_reward_codes (
  code text primary key,
  poll_id text not null references public.sondage_polls (id) on delete cascade,
  participant_id uuid not null references public.sondage_participants (id) on delete cascade,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  unique (poll_id, participant_id)
);

-- Limitation de débit, partagée entre toutes les fonctions serverless
create table if not exists public.sondage_rate_limits (
  key text primary key,
  hits int not null,
  reset_at timestamptz not null
);

-- ---------------------------------------------------------------------
-- Fonctions
-- ---------------------------------------------------------------------

-- Rôle du compte connecté dans Flexform : 'admin', 'staff' ou null (droits de la suite)
create or replace function public.sondage_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.suite_app_role('flexform')
$$;
revoke execute on function public.sondage_role() from public, anon;
grant execute on function public.sondage_role() to authenticated, service_role;

-- Compte une tentative et renvoie le nombre de tentatives dans la fenêtre en cours.
create or replace function public.sondage_hit_rate_limit(p_key text, p_window_seconds int)
returns int
language sql
volatile
set search_path = ''
as $$
  insert into public.sondage_rate_limits as r (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set hits = case when r.reset_at < now() then 1 else r.hits + 1 end,
        reset_at = case when r.reset_at < now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning hits
$$;
revoke execute on function public.sondage_hit_rate_limit(text, int) from public, anon, authenticated;
grant execute on function public.sondage_hit_rate_limit(text, int) to service_role;

-- Anciennes bases : l'équipe Flexform était dans sondage_staff, elle passe dans app_roles
do $$
begin
  if to_regclass('public.sondage_staff') is not null then
    insert into public.app_roles (user_id, app, role)
    select user_id, 'flexform', role from public.sondage_staff
    on conflict (user_id, app) do nothing;
    drop table public.sondage_staff;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Sécurité par ligne
-- ---------------------------------------------------------------------

alter table public.sondage_polls enable row level security;
alter table public.sondage_settings enable row level security;
alter table public.sondage_participants enable row level security;
alter table public.sondage_votes enable row level security;
alter table public.sondage_staff_votes enable row level security;
alter table public.sondage_reward_codes enable row level security;
alter table public.sondage_rate_limits enable row level security;

-- Aucun accès pour les visiteurs non connectés, sur aucune table
revoke all on public.sondage_polls, public.sondage_settings, public.sondage_participants,
  public.sondage_votes, public.sondage_staff_votes, public.sondage_reward_codes, public.sondage_rate_limits
  from anon;
-- Les comptes connectés passent ensuite par les règles ci-dessous ; rate_limits reste réservé au serveur
revoke all on public.sondage_rate_limits from authenticated;

-- Sondages : lecture admin et staff (le staff voit la question liée à une récompense), écriture admin
drop policy if exists "sondage_polls_read" on public.sondage_polls;
create policy "sondage_polls_read" on public.sondage_polls
  for select to authenticated using ((select public.sondage_role()) in ('admin', 'staff'));
drop policy if exists "sondage_polls_admin" on public.sondage_polls;
create policy "sondage_polls_admin" on public.sondage_polls
  for all to authenticated
  using ((select public.sondage_role()) = 'admin')
  with check ((select public.sondage_role()) = 'admin');

-- Réglages : admin uniquement
drop policy if exists "sondage_settings_admin" on public.sondage_settings;
create policy "sondage_settings_admin" on public.sondage_settings
  for all to authenticated
  using ((select public.sondage_role()) = 'admin')
  with check ((select public.sondage_role()) = 'admin');

-- Votants : l'admin voit et gère tout le monde ; le staff ne voit que les personnes qui ont une
-- récompense (nom et formation affichés au moment de la remise)
drop policy if exists "sondage_participants_admin" on public.sondage_participants;
create policy "sondage_participants_admin" on public.sondage_participants
  for all to authenticated
  using ((select public.sondage_role()) = 'admin')
  with check ((select public.sondage_role()) = 'admin');
drop policy if exists "sondage_participants_staff" on public.sondage_participants;
create policy "sondage_participants_staff" on public.sondage_participants
  for select to authenticated using (
    (select public.sondage_role()) = 'staff'
    and exists (select 1 from public.sondage_reward_codes c where c.participant_id = sondage_participants.id)
  );

-- Votes : admin uniquement
drop policy if exists "sondage_votes_admin" on public.sondage_votes;
create policy "sondage_votes_admin" on public.sondage_votes
  for all to authenticated
  using ((select public.sondage_role()) = 'admin')
  with check ((select public.sondage_role()) = 'admin');

-- Réponses du staff. Lecture : chacun ses propres réponses ; l'admin les lit toutes (résultats)
drop policy if exists "sondage_staff_votes_read" on public.sondage_staff_votes;
create policy "sondage_staff_votes_read" on public.sondage_staff_votes
  for select to authenticated using (
    (select public.sondage_role()) = 'admin'
    or (user_id = (select auth.uid()) and (select public.sondage_role()) = 'staff')
  );

-- Réponse : en son propre nom, à un sondage réservé au staff et ouvert (dans le hub)
drop policy if exists "sondage_staff_votes_insert" on public.sondage_staff_votes;
create policy "sondage_staff_votes_insert" on public.sondage_staff_votes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select public.sondage_role()) in ('admin', 'staff')
    and exists (select 1 from public.sondage_polls p where p.id = poll_id and p.staff_only and p.hub)
  );
drop policy if exists "sondage_staff_votes_update" on public.sondage_staff_votes;
create policy "sondage_staff_votes_update" on public.sondage_staff_votes
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.sondage_role()) in ('admin', 'staff'))
  with check (
    user_id = (select auth.uid())
    and (select public.sondage_role()) in ('admin', 'staff')
    and exists (select 1 from public.sondage_polls p where p.id = poll_id and p.staff_only and p.hub)
  );

-- Effacement (remise à zéro d'un sondage) : admin uniquement
drop policy if exists "sondage_staff_votes_admin_delete" on public.sondage_staff_votes;
create policy "sondage_staff_votes_admin_delete" on public.sondage_staff_votes
  for delete to authenticated using ((select public.sondage_role()) = 'admin');

-- Récompenses : admin et staff lisent ; les deux peuvent valider une remise
drop policy if exists "sondage_rewards_read" on public.sondage_reward_codes;
create policy "sondage_rewards_read" on public.sondage_reward_codes
  for select to authenticated using ((select public.sondage_role()) in ('admin', 'staff'));
drop policy if exists "sondage_rewards_redeem" on public.sondage_reward_codes;
create policy "sondage_rewards_redeem" on public.sondage_reward_codes
  for update to authenticated
  using ((select public.sondage_role()) in ('admin', 'staff'))
  with check ((select public.sondage_role()) in ('admin', 'staff'));
drop policy if exists "sondage_rewards_admin_delete" on public.sondage_reward_codes;
create policy "sondage_rewards_admin_delete" on public.sondage_reward_codes
  for delete to authenticated using ((select public.sondage_role()) = 'admin');
-- Une remise ne modifie que ces deux colonnes : impossible de réattribuer un code
revoke insert, update on public.sondage_reward_codes from authenticated;
grant update (redeemed_at, redeemed_by) on public.sondage_reward_codes to authenticated;

-- ---------------------------------------------------------------------
-- Sondages de l'AG : créés seulement sur une base sans aucun sondage (relancer ce fichier ne fait
-- pas réapparaître un sondage supprimé)
-- ---------------------------------------------------------------------
insert into public.sondage_polls (id, position, kind, question, options, category)
select v.id, v.position, v.kind, v.question, v.options::jsonb, v.category
from (values
  ('ag-roles', 1, 'choice', 'Quel rôle voudrais-tu prendre ou soutenir ?',
    '[{"id":"0","label":"Événementiel"},{"id":"1","label":"Communication"},{"id":"2","label":"Partenariats"},{"id":"3","label":"Respo projets"},{"id":"4","label":"Chargé·e de projet"},{"id":"5","label":"Autre"}]', 'Idées'),
  ('ag-event', 2, 'text', 'Quel type d''événement manque au BDE ?', '[]', 'Idées'),
  ('ag-comm', 3, 'text', 'Comment mieux communiquer avec tous les étudiants ?', '[]', 'Idées'),
  ('ag-vote-roles', 4, 'choice', 'Valides-tu les nouveaux rôles hors bureau ?',
    '[{"id":"0","label":"Pour"},{"id":"1","label":"Contre"},{"id":"2","label":"Abstention"}]', 'Votes AG'),
  ('ag-vote-projets', 5, 'choice', 'Valides-tu l''organisation par projets (respo projets + chargé·e·s de projet) ?',
    '[{"id":"0","label":"Pour"},{"id":"1","label":"Contre"},{"id":"2","label":"Abstention"}]', 'Votes AG'),
  ('ag-vote-whatsapp', 6, 'choice', 'Valides-tu la nouvelle communauté WhatsApp ?',
    '[{"id":"0","label":"Pour"},{"id":"1","label":"Contre"},{"id":"2","label":"Abstention"}]', 'Votes AG')
) as v (id, position, kind, question, options, category)
where not exists (select 1 from public.sondage_polls);

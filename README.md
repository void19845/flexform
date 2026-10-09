# Flexform

Application de sondages du BDE Montreuil (« Sondages AG · BDE Montreuil » côté participants), en
Next.js 16 (App Router, React 19, TypeScript), hébergeable sur Vercel, avec les données dans Supabase.
Fait partie de **Flex Suite** avec
le portfolio [Flexfolio](https://github.com/void19845/flexfolio) : même projet Supabase. L'apparence est
celle du BDE (variables CSS de `src/app/globals.css`), sauf si l'admin lie un thème
[Flexdesign](https://github.com/void19845/flexdesign) (onglet **Apparence**, désactivé par défaut).

- `/` : les participants entrent prénom, nom, formation et pseudo, et donnent leur consentement RGPD
  (politique obligatoire, communication et sponsors facultatifs). Le sondage lancé en direct apparaît
  en haut de la page ; en dessous, le **hub** liste les sondages ouverts sans limite de temps, puis le
  **classement** des votants (pseudos uniquement, affiché même avant la première réponse) et les **succès**
  (voir `src/lib/shared/achievements.ts`).
  Les récompenses gagnées s'affichent dans **Mes récompenses**, chacune avec un QR code à usage unique.
  **Mes données** permet de voir, télécharger ou supprimer ses données et de changer ses consentements.
- `/admin` (compte admin) : lancer, clôturer et afficher les résultats des sondages. Chaque sondage peut
  être mis dans le hub, rangé dans une catégorie et doté d'une récompense (ex. « 1 café offert »).
  Un sondage **réservé au staff** (case à cocher à la création) n'est jamais montré aux votants et ne compte
  ni dans le classement ni dans les succès : le staff y répond depuis la page `/staff` de **Flexstaff**
  tant qu'il est ouvert (bouton « Ouvrir au staff »). Il ne se lance pas en direct et n'a pas de récompense.
  L'onglet **Répondants & export** liste qui a répondu, avec filtres par jour, catégorie, sondage et
  consentement, recherche, classement, répartition par formation et exports CSV (pour Excel).
  L'onglet **Apparence** lie le site à un thème Flexdesign (couleurs du mode clair, polices des titres et
  du texte) ou le ramène au thème du BDE.
- `/confidentialite` : politique de confidentialité (les passages entre crochets sont à compléter).

La remise des récompenses (scan du QR code, qui contient le code seul, puis validation) et les réponses
aux sondages réservés au staff se font dans **Flexstaff**, page `/staff`, avec un compte staff ou admin
Flexform. Flexform n'a plus de page staff ; un compte staff peut toujours s'y connecter, mais n'a pas
accès à l'administration.

## Données et sécurité

Tables `sondage_*` dans le schéma public du projet Supabase partagé de Flex Suite. Leur SQL (tables, règles)
est dans `supabase/init.sql`, fichier unique et idempotent, qui s'applique après celui du dépôt
**flexstaff** (droits de la suite). La sécurité par ligne (RLS) est activée sur toutes :

| Qui | Accès |
|---|---|
| Visiteur (clé anon) | Rien |
| Votant | Jamais d'accès direct : le serveur agit pour lui (clé service_role) après avoir vérifié sa session |
| Compte **staff** | Lit les codes de récompense, les sondages et le nom des personnes qui ont une récompense ; peut seulement marquer un code comme remis, et répondre en son nom aux sondages réservés au staff ouverts (il ne lit que ses propres réponses) |
| Compte **admin** | Tout sur les tables `sondage_*`, et gère l'équipe Flexform |

Les rôles viennent de la table commune `app_roles` (appli `flexform`) ; un super admin de la suite est
admin partout. Voir le README de flexstaff.

Les requêtes admin (dans Flexform) et staff (depuis Flexstaff) arrivent à la base avec le jeton du compte
connecté : c'est Postgres qui applique ces règles, pas seulement l'appli. Les jetons restent dans des cookies HttpOnly.

Côté navigateur, `src/proxy.ts` pose une Content-Security-Policy avec un nonce différent à chaque
requête : seuls les scripts de l'appli s'exécutent (pas de script inline ni de CDN). Les styles inline
restent autorisés, car React écrit des attributs `style` au rendu serveur ; les feuilles de style ne
viennent que du site lui-même, les polices du site et du bucket public `design-fonts` de Supabase (thème
Flexdesign). Les autres en-têtes (nosniff, noindex) sont dans `next.config.ts`.

### Thème Flexdesign

Réglage `sondage_settings.design_theme_id` (vide par défaut), modifiable par l'admin seulement, avec son
propre jeton (RLS). Toutes les pages chargent `/api/theme`, une feuille de style générée par le serveur : vide
sans thème lié, sinon les couleurs du thème (rôles `background`, `surface`, `text`, `muted`, `border`,
`primary`, `onPrimary`, `accent`, `onAccent`, `success`, `warning`, `danger` du mode clair, posés sur les
variables de `globals.css`) et les polices de titre et de texte (`@font-face` vers le bucket `design-fonts`).
Le thème est lu avec la clé anon dans les tables `design_*` de Flexdesign, qui sont publiques en lecture ;
Flexform n'y écrit jamais. Chaque couleur, nom de police et chemin de fichier est revérifié avant d'entrer
dans le CSS. Le thème est gardé une minute en mémoire : un changement dans Flexdesign s'applique en une
minute environ. Sans Flexdesign, avec un thème supprimé ou si Supabase ne répond pas, le site garde le thème
du BDE (ou le dernier thème connu).

## Mise en place

1. Base : dans le SQL Editor de Supabase, exécuter `supabase/init.sql` du dépôt **flexstaff** (droits de la
   suite, voir son README), puis `supabase/init.sql` de ce dépôt. Relancer ce dernier après chaque
   modification du schéma : il est idempotent.
2. Dans Vercel, importer le dépôt avec le preset **Next.js** (détecté automatiquement), Node.js 22.x,
   puis **Settings → Environment Variables** :

   | Variable | Valeur |
   |---|---|
   | `SUPABASE_URL` | URL du projet (la même que `NEXT_PUBLIC_SUPABASE_URL` de Flexfolio) |
   | `SUPABASE_ANON_KEY` | Clé anon (la même que `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (Supabase → Project Settings → API). Secrète : jamais côté navigateur |

3. Comptes de l'équipe : depuis flexstaff, `npm run role -- prenom.nom@exemple.fr flexform staff`
   (`admin` pour un admin, `remove` pour retirer l'accès).
4. Redéployer.

Lien vers un thème Flexdesign : appliquer `supabase/init.sql` (colonne `sondage_settings.design_theme_id`)
avant de déployer cette version. Les thèmes viennent du `supabase/init.sql` de **flexdesign** ; sans lui,
l'onglet Apparence indique que Flexdesign n'est pas installé et le site garde le thème du BDE.

Fin du lien d'apparence avec Flexfolio : `supabase/init.sql` supprime la colonne
`sondage_settings.theme_linked`, que les versions de Flexform d'avant ce changement lisent à chaque
chargement des sondages : déployer Flexform avant d'appliquer `init.sql`. Les variables `FLEXFOLIO_SUPABASE_URL` et
`FLEXFOLIO_SUPABASE_ANON_KEY` ne servent plus et peuvent être retirées de Vercel.

## Tester en local

La base locale est celle de Flex Suite (Docker Desktop requis) : `npm run db:start` dans
flexstaff, copier `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` de son `.env` dans
le `.env` de Flexform, et créer des comptes avec `npm run role` (voir le README de flexstaff). Puis :

```bash
npm install
npm run dev
```

Ouvre http://localhost:8787 (serveur de développement Next.js, qui lit `.env`).
`npm run build` puis `npm start` lancent la version de production sur le même port.

Vérifications avant un commit :

```bash
npm run lint
npm run build
node --env-file=.env scripts/e2e.mjs http://localhost:8787
```

`scripts/e2e.mjs` teste les parcours et la RLS contre la base locale (il refuse de tourner sur une
autre base). La partie Apparence crée puis supprime un thème de test dans les tables de Flexdesign : le
`supabase/init.sql` de flexdesign doit être appliqué à la base locale.

## Structure

| Dossier | Contenu |
|---|---|
| `src/app/` | Pages (`/`, `/admin`, `/confidentialite`), mise en page et `globals.css` |
| `src/app/api/` | Route Handlers, un dossier par route (`/api/state`, `/api/vote`, `/api/admin/...`, `/api/auth/...`) |
| `src/components/` | Composants React des pages (`vote/`, `admin/`) et composants partagés |
| `src/lib/server/` | Logique serveur (jamais importée côté navigateur) : accès Supabase, sessions, sondages, thème Flexdesign |
| `src/lib/client/` | Outils des pages : appels API, interrogation régulière, mise en forme, téléchargements |
| `src/lib/shared/` | Types et succès communs au serveur et aux pages |
| `src/proxy.ts` | Content-Security-Policy avec nonce (polices : hôte Supabase de `SUPABASE_URL`) |
| `scripts/` | Test de bout en bout |

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Projet Supabase (les noms `NEXT_PUBLIC_*` de Flexfolio marchent aussi) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur, pour les actions des votants et la gestion de l'équipe |

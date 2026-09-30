import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import {
  MAX_ANSWER_LENGTH,
  PRIVACY_VERSION,
  type AdminState,
  type Consent,
  type LeaderboardEntry,
  type LeaderboardState,
  type MyData,
  type MyReward,
  type Poll,
  type PollKind,
  type PollOption,
  type PollResults,
  type Profile,
  type PublicPoll,
  type PublicState,
  type Respondent,
  type RespondentsState,
  type RewardCheck,
} from "@/lib/shared/types";
import {
  ACHIEVEMENTS,
  EXPLORER_CATEGORIES,
  LIGHTSPEED_MS,
  REGULAR_COUNT,
  WRITER_LENGTH,
  type AchievementId,
  type AchievementState,
} from "@/lib/shared/achievements";
import { HttpError } from "./errors";
import { Db, DbError, eq, inList, serviceDb } from "./supabase";

/*
 * Données dans Supabase (voir supabase/migrations) :
 *   sondage_polls, sondage_settings, sondage_participants, sondage_votes, sondage_reward_codes.
 * Les fonctions des votants utilisent serviceDb() : le serveur a vérifié leur session.
 * Les fonctions admin et staff reçoivent la connexion du compte connecté : la RLS s'applique.
 */

// --- Lignes de la base ----------------------------------------------------

interface PollRow {
  id: string;
  position: number;
  kind: PollKind;
  question: string;
  options: PollOption[];
  status: Poll["status"];
  reveal: boolean;
  hub: boolean;
  category: string;
  reward: string;
  created_at: string;
  published_at: string | null;
}

interface SettingsRow {
  active_poll_id: string | null;
  theme_linked: boolean;
}

interface ParticipantRow {
  id: string;
  pseudo: string;
  prenom: string;
  nom: string;
  formation: string;
  consent: Consent | null;
  active: boolean;
}

interface VoteRow {
  poll_id: string;
  participant_id: string;
  value: string;
  voted_at: string;
}

interface CodeRow {
  code: string;
  poll_id: string;
  participant_id: string;
  redeemed_at: string | null;
}

const PARTICIPANT_COLUMNS = "id,pseudo,prenom,nom,formation,consent,active";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ms = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);
const nowIso = (): string => new Date().toISOString();

function toPoll(r: PollRow): Poll {
  return {
    id: r.id,
    kind: r.kind,
    question: r.question,
    options: r.options,
    status: r.status,
    reveal: r.reveal,
    hub: r.hub,
    category: r.category,
    reward: r.reward,
    createdAt: Date.parse(r.created_at),
    ...(r.published_at ? { publishedAt: Date.parse(r.published_at) } : {}),
  };
}

function toProfile(r: ParticipantRow): Profile {
  return { pseudo: r.pseudo, prenom: r.prenom, nom: r.nom, formation: r.formation, ...(r.consent ? { consent: r.consent } : {}) };
}

interface Meta {
  polls: Poll[];
  activePollId: string | null;
}

async function loadMeta(db: Db): Promise<Meta> {
  const [rows, settings] = await Promise.all([
    db.select<PollRow>("sondage_polls", "select=*&order=position.asc,created_at.asc"),
    db.one<SettingsRow>("sondage_settings", "select=active_poll_id,theme_linked&id=eq.1"),
  ]);
  return { polls: rows.map(toPoll), activePollId: settings?.active_poll_id ?? null };
}

function findPoll(meta: Meta, id: string): Poll {
  const poll = meta.polls.find((p) => p.id === id);
  if (!poll) throw new HttpError(404, "Sondage introuvable");
  return poll;
}

function computeResults(poll: Poll, values: string[]): PollResults {
  if (poll.kind === "text") return { counts: {}, answers: values, total: values.length };
  const counts: Record<string, number> = Object.fromEntries(poll.options.map((o) => [o.id, 0]));
  for (const optionId of values) counts[optionId] = (counts[optionId] ?? 0) + 1;
  return { counts, answers: [], total: values.length };
}

/** Réponses groupées par sondage : pollId -> (participantId -> vote) */
function votesByPoll(votes: VoteRow[]): Map<string, Map<string, VoteRow>> {
  const map = new Map<string, Map<string, VoteRow>>();
  for (const v of votes) {
    let m = map.get(v.poll_id);
    if (!m) map.set(v.poll_id, (m = new Map()));
    m.set(v.participant_id, v);
  }
  return map;
}

// --- Sessions -------------------------------------------------------------

export async function pseudoOf(sessionId: string): Promise<string | null> {
  if (!UUID.test(sessionId)) return null;
  const row = await serviceDb().one<{ pseudo: string }>("sondage_participants", `select=pseudo&id=${eq(sessionId)}&active=eq.true`);
  return row?.pseudo ?? null;
}

/** Crée le votant. L'index unique sur les pseudos actifs empêche deux sessions avec le même pseudo. */
export async function login(profile: Profile): Promise<string> {
  try {
    const [row] = await serviceDb().insert<{ id: string }>("sondage_participants", {
      pseudo: profile.pseudo,
      prenom: profile.prenom,
      nom: profile.nom,
      formation: profile.formation,
      consent: profile.consent ?? null,
    });
    return row!.id;
  } catch (err) {
    if (err instanceof DbError && err.code === "23505") throw new HttpError(409, "Ce pseudo est déjà pris");
    throw err;
  }
}

/** Ferme la session : le pseudo est libéré, le profil et les réponses restent pour l'export. */
export async function logout(sessionId: string): Promise<void> {
  if (!UUID.test(sessionId)) return;
  await serviceDb().update("sondage_participants", `id=${eq(sessionId)}`, { active: false });
}

/** Déconnecte un participant (admin) et libère son pseudo. */
export async function kick(db: Db, participantId: string): Promise<void> {
  if (!UUID.test(participantId)) throw new HttpError(404, "Participant introuvable");
  const rows = await db.update("sondage_participants", `id=${eq(participantId)}&active=eq.true`, { active: false });
  if (!rows.length) throw new HttpError(404, "Participant introuvable");
}

// --- Données personnelles (RGPD) ------------------------------------------

/** Tout ce que l'appli garde sur le votant : profil, consentement, réponses et récompenses. */
export async function myData(sessionId: string): Promise<MyData> {
  const db = serviceDb();
  const [meta, me, votes, codes] = await Promise.all([
    loadMeta(db),
    db.one<ParticipantRow>("sondage_participants", `select=${PARTICIPANT_COLUMNS}&id=${eq(sessionId)}`),
    db.select<VoteRow>("sondage_votes", `select=*&participant_id=${eq(sessionId)}`),
    db.select<CodeRow>("sondage_reward_codes", `select=*&participant_id=${eq(sessionId)}`),
  ]);
  if (!me) throw new HttpError(401, "Connecte-toi avec un pseudo");
  const byId = new Map(meta.polls.map((p) => [p.id, p]));
  return {
    profile: toProfile(me),
    answers: votes.flatMap((v) => {
      const poll = byId.get(v.poll_id);
      if (!poll) return [];
      const answer = poll.kind === "choice" ? (poll.options.find((o) => o.id === v.value)?.label ?? v.value) : v.value;
      return [{ question: poll.question, answer, at: ms(v.voted_at) }];
    }),
    rewards: codes.flatMap((c) => {
      const poll = byId.get(c.poll_id);
      return poll?.reward ? [{ reward: poll.reward, question: poll.question, redeemedAt: ms(c.redeemed_at) }] : [];
    }),
  };
}

/** Modifie les consentements facultatifs. Le retrait est aussi simple que l'accord. */
export async function setConsent(sessionId: string, marketing: boolean, sponsors: boolean): Promise<Consent> {
  const db = serviceDb();
  const me = await db.one<ParticipantRow>("sondage_participants", `select=consent&id=${eq(sessionId)}`);
  const now = Date.now();
  const consent: Consent = {
    version: me?.consent?.version ?? PRIVACY_VERSION,
    acceptedAt: me?.consent?.acceptedAt ?? now,
    marketing,
    sponsors,
    updatedAt: now,
  };
  await db.update("sondage_participants", `id=${eq(sessionId)}`, { consent });
  return consent;
}

/** Droit à l'effacement : supprimer le votant efface aussi ses réponses et récompenses (on delete cascade). */
export async function eraseMyData(sessionId: string): Promise<void> {
  await serviceDb().remove("sondage_participants", `id=${eq(sessionId)}`);
}

// --- Votes ----------------------------------------------------------------

/** Un sondage du hub reste ouvert tant qu'il y est ; sinon seul le sondage en direct ouvert accepte les votes. */
function acceptsVotes(meta: Meta, poll: Poll): boolean {
  return Boolean(poll.hub) || (poll.id === meta.activePollId && poll.status === "open");
}

/** Enregistre ou remplace la réponse : optionId pour un choix, texte pour une réponse libre. */
export async function vote(sessionId: string, pollId: string, value: string): Promise<void> {
  const db = serviceDb();
  const meta = await loadMeta(db);
  const poll = findPoll(meta, pollId);
  if (!acceptsVotes(meta, poll)) throw new HttpError(409, "Le vote est clôturé");
  if (poll.kind === "choice" && !poll.options.some((o) => o.id === value)) {
    throw new HttpError(400, "Choix invalide");
  }
  if (poll.kind === "text" && (value.length < 1 || value.length > MAX_ANSWER_LENGTH)) {
    throw new HttpError(400, `Ta réponse doit faire entre 1 et ${MAX_ANSWER_LENGTH} caractères`);
  }
  await db.insert(
    "sondage_votes",
    { poll_id: pollId, participant_id: sessionId, value, voted_at: nowIso() },
    { onConflict: "poll_id,participant_id", resolution: "merge" },
  );
}

export async function publicState(sessionId: string, pseudo: string): Promise<PublicState> {
  const db = serviceDb();
  const [meta, myVotes, participants] = await Promise.all([
    loadMeta(db),
    db.select<VoteRow>("sondage_votes", `select=poll_id,value&participant_id=${eq(sessionId)}`),
    db.count("sondage_participants", "active=eq.true"),
  ]);
  const mine = new Map(myVotes.map((v) => [v.poll_id, v.value]));
  const live = meta.polls.find((p) => p.id === meta.activePollId) ?? null;
  const hub = meta.polls.filter((p) => p.hub && p.id !== meta.activePollId);
  const shown = [...(live ? [live] : []), ...hub];

  // Résultats seulement pour les sondages affichés dont l'admin a rendu les résultats visibles
  const revealedIds = shown.filter((p) => p.reveal).map((p) => p.id);
  const [revealed, rewards] = await Promise.all([
    revealedIds.length ? db.select<VoteRow>("sondage_votes", `select=poll_id,value&poll_id=${inList(revealedIds)}`) : [],
    myRewards(db, meta, sessionId, mine),
  ]);
  const valuesByPoll = new Map<string, string[]>();
  for (const v of revealed) valuesByPoll.set(v.poll_id, [...(valuesByPoll.get(v.poll_id) ?? []), v.value]);

  const toPublic = (poll: Poll): PublicPoll => ({
    id: poll.id,
    kind: poll.kind,
    question: poll.question,
    options: poll.options,
    status: acceptsVotes(meta, poll) ? "open" : "closed",
    results: poll.reveal ? computeResults(poll, valuesByPoll.get(poll.id) ?? []) : null,
    myVote: mine.get(poll.id) ?? null,
    reward: poll.reward || null,
  });
  return { pseudo, participants, poll: live && toPublic(live), hub: hub.map(toPublic), rewards };
}

// --- Récompenses ----------------------------------------------------------

/** Sans 0/O ni 1/I pour pouvoir le taper à la main sans confusion. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12; // 60 bits : impossible à deviner

function newCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Accepte le contenu du QR code (adresse de la page staff) ou le code tapé à la main, avec ou sans tirets. */
export function normalizeCode(raw: string): string {
  let text = raw.trim();
  try {
    text = new URL(text).searchParams.get("code") ?? "";
  } catch {
    // pas une adresse : c'est le code lui-même
  }
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

/**
 * Récompenses gagnées : une par sondage avec récompense auquel le votant a répondu.
 * Les codes manquants sont créés ici ; la contrainte unique (sondage, votant) garantit un seul code.
 */
async function myRewards(db: Db, meta: Meta, sessionId: string, mine: Map<string, string>): Promise<MyReward[]> {
  const rewarded = meta.polls.filter((p) => p.reward && mine.has(p.id));
  if (!rewarded.length) return [];
  const filter = `select=code,poll_id,redeemed_at&participant_id=${eq(sessionId)}`;
  let codes = await db.select<CodeRow>("sondage_reward_codes", filter);
  const missing = rewarded.filter((p) => !codes.some((c) => c.poll_id === p.id));
  if (missing.length) {
    await db.insert(
      "sondage_reward_codes",
      missing.map((p) => ({ code: newCode(), poll_id: p.id, participant_id: sessionId })),
      { onConflict: "poll_id,participant_id", resolution: "ignore" },
    );
    codes = await db.select<CodeRow>("sondage_reward_codes", filter);
  }
  return rewarded.flatMap((poll) => {
    const c = codes.find((x) => x.poll_id === poll.id);
    return c ? [{ pollId: poll.id, question: poll.question, text: poll.reward!, code: c.code, redeemedAt: ms(c.redeemed_at) }] : [];
  });
}

/** Propriétaire d'un code (le QR code n'est servi qu'à lui). */
export async function rewardOwner(code: string): Promise<string | null> {
  const row = await serviceDb().one<{ participant_id: string }>("sondage_reward_codes", `select=participant_id&code=${eq(code)}`);
  return row?.participant_id ?? null;
}

interface CodeLookup {
  code: string;
  redeemed_at: string | null;
  poll: { question: string; reward: string } | null;
  participant: { pseudo: string; prenom: string; nom: string; formation: string } | null;
}

/** Ce que voit le staff après un scan (lu avec son propre jeton : la RLS s'applique). */
export async function checkReward(db: Db, rawCode: string): Promise<RewardCheck> {
  const code = normalizeCode(rawCode);
  const row = code
    ? await db.one<CodeLookup>(
        "sondage_reward_codes",
        `select=code,redeemed_at,poll:sondage_polls(question,reward),participant:sondage_participants(pseudo,prenom,nom,formation)&code=${eq(code)}`,
      )
    : null;
  if (!row) return { status: "invalid", code, message: "Code inconnu, ou annulé (sondage remis à zéro ou supprimé)." };
  const person = row.participant ? { ...row.participant } : undefined;
  if (!row.poll?.reward) return { status: "invalid", code, person, message: "Code annulé : la récompense a été retirée de ce sondage." };
  const base = { code, person, reward: row.poll.reward, question: row.poll.question };
  if (row.redeemed_at) return { ...base, status: "used", redeemedAt: ms(row.redeemed_at) };
  return { ...base, status: "valid", redeemedAt: null };
}

/**
 * Valide la remise. La mise à jour ne touche que les codes pas encore remis :
 * si deux membres du staff valident en même temps, un seul réussit.
 */
export async function redeemReward(db: Db, userId: string, rawCode: string): Promise<RewardCheck> {
  const check = await checkReward(db, rawCode);
  if (check.status !== "valid") return check;
  const at = nowIso();
  const rows = await db.update("sondage_reward_codes", `code=${eq(check.code)}&redeemed_at=is.null`, {
    redeemed_at: at,
    redeemed_by: userId || null,
  });
  if (!rows.length) return checkReward(db, check.code);
  return { ...check, status: "done", redeemedAt: Date.parse(at) };
}

// --- Admin : lecture -------------------------------------------------------

export async function adminState(db: Db): Promise<AdminState> {
  const [meta, people, votes, codes] = await Promise.all([
    loadMeta(db),
    db.select<ParticipantRow>("sondage_participants", `select=${PARTICIPANT_COLUMNS}&active=eq.true`),
    db.select<VoteRow>("sondage_votes", "select=poll_id,participant_id,value"),
    db.select<CodeRow>("sondage_reward_codes", "select=poll_id,redeemed_at"),
  ]);
  const byPoll = votesByPoll(votes);
  const activeVotes = byPoll.get(meta.activePollId ?? "") ?? new Map();
  return {
    activePollId: meta.activePollId,
    polls: meta.polls.map((p) => {
      const pollCodes = codes.filter((c) => c.poll_id === p.id);
      return {
        ...p,
        results: computeResults(p, [...(byPoll.get(p.id)?.values() ?? [])].map((v) => v.value)),
        rewards: { issued: pollCodes.length, redeemed: pollCodes.filter((c) => c.redeemed_at).length },
      };
    }),
    participants: people
      .map((r) => ({ ...toProfile(r), id: r.id, voted: activeVotes.has(r.id) }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo)),
  };
}

/** Toutes les personnes ayant répondu, avec l'heure de chaque réponse, y compris les sessions terminées. */
export async function respondents(db: Db): Promise<RespondentsState> {
  const [meta, people, votes] = await Promise.all([
    loadMeta(db),
    db.select<ParticipantRow>("sondage_participants", `select=${PARTICIPANT_COLUMNS}`),
    db.select<VoteRow>("sondage_votes", "select=*"),
  ]);
  const profiles = new Map(people.map((p) => [p.id, p]));
  const bySession = new Map<string, Respondent>();
  for (const v of votes) {
    let r = bySession.get(v.participant_id);
    if (!r) {
      const p = profiles.get(v.participant_id);
      r = { ...(p ? toProfile(p) : { pseudo: "", prenom: "", nom: "", formation: "" }), answers: {}, values: {} };
      bySession.set(v.participant_id, r);
    }
    r.answers[v.poll_id] = ms(v.voted_at);
    r.values[v.poll_id] = v.value;
  }
  return {
    polls: meta.polls.map((p) => ({ id: p.id, question: p.question, kind: p.kind, options: p.options, category: p.category ?? "" })),
    respondents: [...bySession.values()],
  };
}

// --- Classement et succès -------------------------------------------------

const LEADERBOARD_SIZE = 10;

/** Classement par nombre de sondages répondus. Seuls les pseudos sont montrés aux votants. */
export async function leaderboard(sessionId: string, pseudo: string): Promise<LeaderboardState> {
  const db = serviceDb();
  const [meta, votes, people, myCodes] = await Promise.all([
    loadMeta(db),
    db.select<VoteRow>("sondage_votes", "select=poll_id,participant_id,value,voted_at"),
    db.select<{ id: string; pseudo: string }>("sondage_participants", "select=id,pseudo"),
    db.select<CodeRow>("sondage_reward_codes", `select=redeemed_at&participant_id=${eq(sessionId)}&redeemed_at=not.is.null`),
  ]);
  const pseudos = new Map(people.map((p) => [p.id, p.pseudo]));
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.participant_id, (counts.get(v.participant_id) ?? 0) + 1);

  const sorted = [...counts.entries()]
    .map(([id, count]) => ({ id, count, pseudo: pseudos.get(id) || "Anonyme" }))
    .sort((a, b) => b.count - a.count || a.pseudo.localeCompare(b.pseudo));
  // Ex æquo : même rang (1, 1, 3…)
  const ranked = sorted.map((e): LeaderboardEntry & { id: string } => ({ ...e, rank: 0 }));
  ranked.forEach((e, i) => (e.rank = i > 0 && e.count === ranked[i - 1]!.count ? ranked[i - 1]!.rank : i + 1));
  const strip = ({ rank, pseudo, count }: LeaderboardEntry): LeaderboardEntry => ({ rank, pseudo, count });
  const mine = ranked.find((e) => e.id === sessionId);
  return {
    pseudo,
    totalPolls: meta.polls.length,
    top: ranked.slice(0, LEADERBOARD_SIZE).map(strip),
    me: mine ? strip(mine) : null,
    achievements: achievements(
      meta,
      votes.filter((v) => v.participant_id === sessionId),
      mine?.rank ?? null,
      myCodes.length > 0,
    ),
  };
}

const parisHourFmt = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Paris" });

/** Heure (0-23) à Paris. formatToParts car le format français écrit « 23 h ». */
function parisHour(time: number): number {
  return Number(parisHourFmt.formatToParts(time).find((p) => p.type === "hour")?.value);
}

/** Succès d'un votant, calculés à partir de ses réponses. */
function achievements(meta: Meta, myVotes: VoteRow[], rank: number | null, redeemedOne: boolean): AchievementState[] {
  const byId = new Map(meta.polls.map((p) => [p.id, p]));
  const answered = myVotes.flatMap((v) => {
    const poll = byId.get(v.poll_id);
    return poll ? [{ poll, value: v.value, at: Date.parse(v.voted_at) }] : [];
  });
  const count = answered.length;
  const categories = new Set(answered.map((a) => a.poll.category).filter(Boolean));
  const total = meta.polls.length;
  const progress = (n: number, of: number): string => `${Math.min(n, of)} / ${of}`;

  const unlocked: Record<AchievementId, boolean> = {
    first: count >= 1,
    lightspeed: answered.some((a) => a.poll.publishedAt !== undefined && a.at - a.poll.publishedAt <= LIGHTSPEED_MS),
    regular: count >= REGULAR_COUNT,
    explorer: categories.size >= EXPLORER_CATEGORIES,
    writer: answered.some((a) => a.poll.kind === "text" && a.value.length >= WRITER_LENGTH),
    nightowl: answered.some((a) => parisHour(a.at) >= 22 || parisHour(a.at) < 6),
    completionist: total >= 3 && count === total,
    podium: rank !== null && rank <= 3,
    collector: redeemedOne,
  };
  const progresses: Partial<Record<AchievementId, string>> = {
    regular: progress(count, REGULAR_COUNT),
    explorer: progress(categories.size, EXPLORER_CATEGORIES),
    completionist: progress(count, total),
  };
  return ACHIEVEMENTS.map(({ id }) => ({ id, unlocked: unlocked[id], progress: unlocked[id] ? undefined : progresses[id] }));
}

// --- Admin : actions -------------------------------------------------------

export interface PollExtras {
  hub?: boolean;
  category?: string;
  reward?: string;
}

export async function createPoll(db: Db, question: string, kind: PollKind, labels: string[], extras: PollExtras): Promise<void> {
  const last = await db.one<{ position: number }>("sondage_polls", "select=position&order=position.desc");
  await db.insert("sondage_polls", {
    id: randomUUID().slice(0, 8),
    position: (last?.position ?? 0) + 1,
    kind,
    question,
    options: kind === "choice" ? labels.map((label, i) => ({ id: String(i), label })) : [],
    hub: extras.hub ?? false,
    category: extras.category ?? "",
    reward: extras.reward ?? "",
    // Créé directement dans le hub : il est en ligne dès maintenant
    published_at: extras.hub ? nowIso() : null,
  });
}

/** Modifie un sondage ; 404 s'il n'existe pas (ou n'est pas visible pour ce compte). */
async function patchPoll(db: Db, id: string, patch: object): Promise<void> {
  const rows = await db.update("sondage_polls", `id=${eq(id)}`, patch);
  if (!rows.length) throw new HttpError(404, "Sondage introuvable");
}

async function getPoll(db: Db, id: string): Promise<PollRow> {
  const row = await db.one<PollRow>("sondage_polls", `select=*&id=${eq(id)}`);
  if (!row) throw new HttpError(404, "Sondage introuvable");
  return row;
}

export const setCategory = (db: Db, id: string, category: string): Promise<void> => patchPoll(db, id, { category });
export const setReveal = (db: Db, id: string, reveal: boolean): Promise<void> => patchPoll(db, id, { reveal });
export const closePoll = (db: Db, id: string): Promise<void> => patchPoll(db, id, { status: "closed" });

/** Change la récompense. Une récompense vide annule les codes pas encore utilisés. */
export const setReward = (db: Db, id: string, reward: string): Promise<void> => patchPoll(db, id, { reward });

/** Met le sondage dans le hub de l'accueil (ouvert sans limite de temps) ou l'en retire. */
export async function setHub(db: Db, id: string, hub: boolean): Promise<void> {
  const poll = await getPoll(db, id);
  await patchPoll(db, id, { hub, ...(hub && !poll.published_at ? { published_at: nowIso() } : {}) });
}

/** Affiche le sondage chez tous les votants et ouvre le vote. Un seul vote ouvert à la fois. */
export async function openPoll(db: Db, id: string): Promise<void> {
  const poll = await getPoll(db, id);
  await db.update("sondage_polls", `status=eq.open&id=neq.${encodeURIComponent(id)}`, { status: "closed" });
  await patchPoll(db, id, { status: "open", ...(poll.published_at ? {} : { published_at: nowIso() }) });
  await db.update("sondage_settings", "id=eq.1", { active_poll_id: id });
}

/** Supprime le sondage ; ses votes et codes de récompense partent avec (on delete cascade). */
export async function deletePoll(db: Db, id: string): Promise<void> {
  await getPoll(db, id);
  await db.remove("sondage_polls", `id=${eq(id)}`);
}

/** Efface les réponses et les codes de récompense. La prochaine mise en ligne compte comme une nouvelle publication. */
export async function resetPoll(db: Db, id: string): Promise<void> {
  const [poll, settings] = await Promise.all([getPoll(db, id), db.one<SettingsRow>("sondage_settings", "select=active_poll_id&id=eq.1")]);
  await Promise.all([db.remove("sondage_votes", `poll_id=${eq(id)}`), db.remove("sondage_reward_codes", `poll_id=${eq(id)}`)]);
  const online = poll.hub || settings?.active_poll_id === id;
  await patchPoll(db, id, { reveal: false, published_at: online ? nowIso() : null });
}

/** Plus aucun sondage affiché : les votants voient l'écran d'attente. */
export async function clearActive(db: Db): Promise<void> {
  const settings = await db.one<SettingsRow>("sondage_settings", "select=active_poll_id&id=eq.1");
  if (settings?.active_poll_id) {
    await db.update("sondage_polls", `id=${eq(settings.active_poll_id)}&status=eq.open`, { status: "closed" });
  }
  await db.update("sondage_settings", "id=eq.1", { active_poll_id: null });
}

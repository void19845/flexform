import type { AchievementState } from "./achievements.js";

export type PollStatus = "draft" | "open" | "closed";

/** choice = choix parmi des options, text = réponse libre */
export type PollKind = "choice" | "text";

export const MAX_ANSWER_LENGTH = 280;

export interface PollOption {
  id: string;
  label: string;
}

export interface Poll {
  id: string;
  kind: PollKind;
  question: string;
  options: PollOption[];
  status: PollStatus;
  /** Résultats visibles par les votants */
  reveal: boolean;
  /** Dans le hub de l'accueil : on peut y répondre à tout moment, sans être lancé en direct */
  hub?: boolean;
  /** Catégorie libre (ex. « Votes AG »), pour filtrer et exporter */
  category?: string;
  /** Récompense gagnée en répondant (ex. « 1 café offert »), remise par le staff via un QR code */
  reward?: string;
  createdAt: number;
  /** Première mise en ligne (lancé en direct ou mis dans le hub), pour le succès « Plus rapide que la lumière » */
  publishedAt?: number;
}

export const MAX_CATEGORY_LENGTH = 40;
export const MAX_REWARD_LENGTH = 80;

export interface PollResults {
  /** Nombre de votes par option (sondages à choix) */
  counts: Record<string, number>;
  /** Réponses libres, anonymes (sondages texte) */
  answers: string[];
  total: number;
}

/** Un sondage tel que le voit un votant, avec sa propre réponse */
export interface PublicPoll extends Omit<Poll, "createdAt" | "reveal" | "hub" | "category" | "reward"> {
  /** null tant que l'admin n'a pas rendu les résultats visibles */
  results: PollResults | null;
  /** optionId pour un choix, texte pour une réponse libre */
  myVote: string | null;
  /** Récompense promise à qui répond, null s'il n'y en a pas */
  reward: string | null;
}

/** Récompense gagnée par le votant : un code à usage unique, montré en QR code au staff */
export interface MyReward {
  pollId: string;
  question: string;
  text: string;
  code: string;
  /** Heure de remise par le staff, null tant qu'elle n'est pas utilisée */
  redeemedAt: number | null;
}

/** Ce que voit un votant connecté */
export interface PublicState {
  pseudo: string;
  /** Sondage lancé en direct par l'admin */
  poll: PublicPoll | null;
  /** Sondages du hub, ouverts sans limite de temps (hors sondage en direct) */
  hub: PublicPoll[];
  rewards: MyReward[];
  participants: number;
}

/**
 * Résultat d'un scan côté staff.
 * valid = à remettre, done = remise validée à l'instant, used = déjà remise, invalid = code inconnu ou annulé
 */
export interface RewardCheck {
  status: "valid" | "done" | "used" | "invalid";
  code: string;
  message?: string;
  reward?: string;
  question?: string;
  person?: Profile;
  redeemedAt?: number | null;
}

/** Identité saisie à la connexion, gardée après la déconnexion pour l'export des répondants. */
export interface Profile {
  pseudo: string;
  prenom: string;
  nom: string;
  formation: string;
  /** Absent pour un compte créé avant la mise en place du consentement */
  consent?: Consent;
}

/**
 * Version de la politique de confidentialité (public/confidentialite.html).
 * À augmenter si les finalités changent : le consentement est enregistré avec sa version.
 */
export const PRIVACY_VERSION = 1;

/** Consentement RGPD, donné à la création du compte et modifiable ensuite dans « Mes données ». */
export interface Consent {
  version: number;
  /** Politique de confidentialité acceptée (obligatoire pour participer) */
  acceptedAt: number;
  /** Utilisation des données pour la communication du BDE (facultatif) */
  marketing: boolean;
  /** Transmission des données aux partenaires et sponsors (facultatif) */
  sponsors: boolean;
  updatedAt: number;
}

/** Palette et polices lues dans la table site_settings de Flexfolio */
export interface FlexfolioTheme {
  bg: string;
  ink: string;
  card: string;
  accent: string;
  fontTitle: string | null;
  fontBody: string | null;
}

/** Réglage d'apparence, dans l'onglet Apparence de l'admin */
export interface ThemeState {
  /** Variables FLEXFOLIO_SUPABASE_URL et FLEXFOLIO_SUPABASE_ANON_KEY définies */
  configured: boolean;
  /** false : le site est délié et garde le thème du BDE */
  linked: boolean;
  theme: FlexfolioTheme | null;
  error?: string;
}

/** Ce que le votant peut consulter et télécharger dans « Mes données » */
export interface MyData {
  profile: Profile;
  answers: { question: string; answer: string; at: number | null }[];
  rewards: { reward: string; question: string; redeemedAt: number | null }[];
}

export const PROFILE_MAX_LENGTH = { prenom: 40, nom: 40, formation: 60 } as const;

export interface Participant extends Profile {
  id: string;
  /** A répondu au sondage affiché */
  voted: boolean;
}

/** Ce que voit l'administrateur */
export interface AdminState {
  /** rewards : codes distribués et remis, pour les sondages avec récompense */
  polls: (Poll & { results: PollResults; rewards: { issued: number; redeemed: number } })[];
  activePollId: string | null;
  participants: Participant[];
}

/** Une personne ayant répondu à au moins un sondage. */
export interface Respondent extends Profile {
  /** pollId -> heure de la dernière réponse (ms), null pour une réponse antérieure à l'horodatage */
  answers: Record<string, number | null>;
  /** pollId -> réponse : optionId pour un choix, texte pour une réponse libre */
  values: Record<string, string>;
}

/** Données de l'onglet Répondants de l'admin */
export interface RespondentsState {
  polls: Pick<Poll, "id" | "question" | "kind" | "options" | "category">[];
  respondents: Respondent[];
}

export interface LeaderboardEntry {
  rank: number;
  pseudo: string;
  /** Nombre de sondages répondus */
  count: number;
}

/** Classement des votants, par nombre de sondages répondus. */
export interface LeaderboardState {
  /** Pseudo du votant connecté */
  pseudo: string;
  totalPolls: number;
  top: LeaderboardEntry[];
  /** Place du votant connecté, null s'il n'a encore rien répondu */
  me: LeaderboardEntry | null;
  /** Succès du votant connecté, dans l'ordre de ACHIEVEMENTS */
  achievements: AchievementState[];
}

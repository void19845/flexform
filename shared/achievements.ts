/** Succès débloqués par les votants. Le calcul est fait côté serveur (lib/store.ts). */
export const ACHIEVEMENTS = [
  { id: "first", title: "Premier pas", description: "Répondre à un premier sondage." },
  { id: "lightspeed", title: "Plus rapide que la lumière", description: "Répondre moins de 10 minutes après la mise en ligne d'un sondage." },
  { id: "regular", title: "Habitué·e", description: "Répondre à 5 sondages." },
  { id: "explorer", title: "Touche-à-tout", description: "Répondre dans 3 catégories différentes." },
  { id: "writer", title: "Plume d'or", description: "Écrire une réponse libre de 100 caractères ou plus." },
  { id: "nightowl", title: "Oiseau de nuit", description: "Répondre entre 22 h et 6 h." },
  { id: "completionist", title: "Complétiste", description: "Répondre à tous les sondages (au moins 3)." },
  { id: "podium", title: "Sur le podium", description: "Être dans le top 3 du classement." },
  { id: "collector", title: "Chasseur de récompenses", description: "Récupérer une récompense auprès du staff." },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

/** Délai pour « Plus rapide que la lumière » */
export const LIGHTSPEED_MS = 10 * 60 * 1000;
export const REGULAR_COUNT = 5;
export const EXPLORER_CATEGORIES = 3;
export const WRITER_LENGTH = 100;

export interface AchievementState {
  id: AchievementId;
  unlocked: boolean;
  /** Avancement lisible, ex. « 3 / 5 » */
  progress?: string;
}

import "server-only";

import type { FlexfolioTheme, ThemeState } from "@/lib/shared/types";
import { Db, serviceDb } from "./supabase";

/**
 * Apparence liée à Flexfolio : la palette (4 couleurs) et les polices sont lues dans la table
 * `site_settings` de la base Supabase du portfolio (lecture publique avec la clé anon, comme le
 * site public de Flexfolio). L'admin peut délier le site pour revenir au thème du BDE.
 */

const CACHE_MS = 60_000;

const HEX = /^#[0-9a-f]{6}$/i;
// Même règle que Flexfolio (src/lib/typography.ts) : sûr à placer dans du CSS et dans une URL
const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,58}[A-Za-z0-9]$|^[A-Za-z0-9]$/;

/** Par défaut, le même projet Supabase que les sondages ; FLEXFOLIO_* permet d'en viser un autre. */
function config(): { url: string; key: string } | null {
  const url = (process.env.FLEXFOLIO_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "");
  const key = process.env.FLEXFOLIO_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

let cache: { at: number; theme: FlexfolioTheme } | null = null;

/** Réglages d'apparence de Flexfolio, gardés une minute pour ne pas interroger Supabase à chaque page. */
async function fetchFlexfolio(): Promise<FlexfolioTheme> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.theme;
  const cfg = config();
  if (!cfg) throw new Error("Flexfolio non configuré");
  const res = await fetch(
    `${cfg.url}/rest/v1/site_settings?id=eq.1&select=palette_bg,palette_ink,palette_card,palette_accent,font_title,font_body`,
    { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }, signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const [row] = (await res.json()) as Record<string, unknown>[];
  if (!row) throw new Error("Aucun réglage dans site_settings");
  const hex = (v: unknown): string => {
    if (typeof v !== "string" || !HEX.test(v)) throw new Error("Couleur invalide dans site_settings");
    return v.toLowerCase();
  };
  const font = (v: unknown): string | null => (typeof v === "string" && FONT_NAME.test(v.trim()) ? v.trim() : null);
  const theme: FlexfolioTheme = {
    bg: hex(row.palette_bg),
    ink: hex(row.palette_ink),
    card: hex(row.palette_card),
    accent: hex(row.palette_accent),
    fontTitle: font(row.font_title),
    fontBody: font(row.font_body),
  };
  cache = { at: Date.now(), theme };
  return theme;
}

/** Réglage dans sondage_settings (lié par défaut) ; si la base ne répond pas, on reste lié. */
async function isLinked(): Promise<boolean> {
  const row = await serviceDb()
    .one<{ theme_linked: boolean }>("sondage_settings", "select=theme_linked&id=eq.1")
    .catch(() => null);
  return row?.theme_linked ?? true;
}

/** Réservé à l'admin : db est la connexion de son compte (la RLS n'autorise que le rôle admin). */
export async function setLinked(db: Db, linked: boolean): Promise<void> {
  await db.update("sondage_settings", "id=eq.1", { theme_linked: linked });
}

export async function themeState(): Promise<ThemeState> {
  const configured = config() !== null;
  const linked = await isLinked();
  if (!configured) return { configured, linked, theme: null };
  try {
    return { configured, linked, theme: await fetchFlexfolio() };
  } catch (err) {
    // Supabase injoignable : on garde la dernière palette connue plutôt que de changer d'apparence
    return { configured, linked, theme: cache?.theme ?? null, error: (err as Error).message };
  }
}

/**
 * Feuille de style qui remplace les couleurs et polices du thème BDE (public/style.css).
 * Vide si le site est délié ou si Flexfolio est indisponible : le thème du BDE s'applique alors.
 */
export async function themeCss(): Promise<string> {
  const state = await themeState();
  if (!state.linked || !state.theme) return "/* Thème du BDE (non lié à Flexfolio) */\n";
  const t = state.theme;
  const fonts = [t.fontTitle, t.fontBody].filter((f): f is string => f !== null);
  const families = [...new Set(fonts)].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`);
  return [
    "/* Apparence liée à Flexfolio (site_settings) */",
    families.length ? `@import url("https://fonts.googleapis.com/css2?${families.join("&")}&display=swap");` : "",
    // :root:root l'emporte sur le :root de globals.css quel que soit l'ordre de chargement des feuilles
    ":root:root {",
    `  --bg: ${t.bg};`,
    `  --ink: ${t.ink};`,
    `  --dark: ${t.card};`,
    `  --violet: ${t.accent};`,
    `  --pink: ${t.accent};`,
    `  --muted: color-mix(in srgb, ${t.ink} 60%, ${t.bg});`,
    `  --line: color-mix(in srgb, ${t.ink} 14%, ${t.bg});`,
    t.fontTitle ? `  --font-title: "${t.fontTitle}", serif;` : "",
    t.fontBody ? `  --font-body: "${t.fontBody}", sans-serif;` : "",
    "}",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

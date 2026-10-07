import "server-only";

import type { DesignThemePreview, ThemeState } from "@/lib/shared/types";
import { HttpError } from "./errors";
import { anonDb, Db, DbError, eq, serviceDb, supabaseConfig } from "./supabase";

/**
 * Apparence liée à un thème Flexdesign (facultatif, désactivé par défaut). Le réglage est
 * sondage_settings.design_theme_id ; le thème est lu dans les tables design_* de Flexdesign avec la
 * clé anon (lecture publique), Flexform n'y écrit jamais. Sans lien, ou si le thème est introuvable
 * ou Flexdesign injoignable, le thème du BDE (globals.css) s'applique.
 */

const CACHE_MS = 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Mêmes règles que les contraintes des tables de Flexdesign, revérifiées avant d'écrire du CSS
const HEX = /^#[0-9a-f]{6}$/;
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,62}$/;
const FONT_PATH = /^[0-9a-f-]{36}\/[a-z0-9-]{1,80}\.(woff2|woff|ttf|otf)$/;
const UNICODE_RANGE = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(,U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;
const FALLBACKS = new Set(["sans-serif", "serif", "monospace", "cursive", "system-ui"]);
const FORMATS = new Set(["woff2", "woff", "truetype", "opentype"]);

/** Variable de globals.css -> rôle de couleur Flexdesign (mode clair) */
const COLOR_VARS: [string, string][] = [
  ["--bg", "background"],
  ["--card", "surface"],
  ["--ink", "text"],
  ["--dark", "text"],
  ["--muted", "muted"],
  ["--line", "border"],
  ["--violet", "primary"],
  ["--on-violet", "onPrimary"],
  ["--pink", "accent"],
  ["--on-pink", "onAccent"],
  ["--yellow", "warning"],
  ["--ok", "success"],
  ["--danger", "danger"],
];

interface FontFile {
  weight: number;
  style: string;
  unicode_range: string | null;
  format: string;
  path: string;
}

interface ThemeFont {
  family: string;
  fallback: string;
  files: FontFile[];
}

interface Theme {
  name: string;
  colors: Record<string, string>;
  heading: ThemeFont | null;
  body: ThemeFont | null;
}

interface ThemeRow {
  name: string;
  design_theme_colors: { mode: string; kind: string; name: string; hex: string }[];
  design_theme_fonts: { role: string; fallback: string; design_fonts: { family: string; design_font_files: FontFile[] } | null }[];
}

const SELECT =
  "select=name,design_theme_colors(mode,kind,name,hex),design_theme_fonts(role,fallback,design_fonts(family,design_font_files(weight,style,unicode_range,format,path)))";

function validFile(f: FontFile): boolean {
  return (
    Number.isInteger(f.weight) &&
    f.weight >= 100 &&
    f.weight <= 900 &&
    (f.style === "normal" || f.style === "italic") &&
    FORMATS.has(f.format) &&
    FONT_PATH.test(f.path) &&
    (f.unicode_range === null || UNICODE_RANGE.test(f.unicode_range))
  );
}

function toFont(row: ThemeRow, role: string): ThemeFont | null {
  const f = row.design_theme_fonts.find((x) => x.role === role);
  if (!f?.design_fonts || !FAMILY.test(f.design_fonts.family) || !FALLBACKS.has(f.fallback)) return null;
  return { family: f.design_fonts.family, fallback: f.fallback, files: f.design_fonts.design_font_files.filter(validFile) };
}

function toTheme(row: ThemeRow): Theme {
  const colors: Record<string, string> = {};
  for (const c of row.design_theme_colors) {
    if (c.mode === "light" && c.kind === "role" && HEX.test(c.hex)) colors[c.name] = c.hex;
  }
  return { name: row.name, colors, heading: toFont(row, "heading"), body: toFont(row, "body") };
}

/** Message pour l'admin quand Flexdesign ne répond pas comme prévu */
function describe(err: unknown): string {
  if (err instanceof DbError && (err.code === "PGRST205" || err.code === "42P01")) return "Flexdesign n'est pas installé sur cette base";
  if (err instanceof DbError) return `Lecture de Flexdesign impossible (erreur ${err.status})`;
  return "Flexdesign injoignable";
}

let cache: { id: string; at: number; theme: Theme | null } | null = null;

/** Thème lu dans Flexdesign, gardé une minute pour ne pas interroger Supabase à chaque page ; null s'il n'existe plus. */
async function fetchTheme(id: string): Promise<Theme | null> {
  if (cache?.id === id && Date.now() - cache.at < CACHE_MS) return cache.theme;
  const row = await anonDb().one<ThemeRow>("design_themes", `${SELECT}&id=${eq(id)}`);
  const theme = row ? toTheme(row) : null;
  cache = { id, at: Date.now(), theme };
  return theme;
}

/** Dernier thème connu, si Flexdesign devient injoignable : on le garde plutôt que de changer d'apparence. */
function staleTheme(id: string): Theme | null {
  return cache?.id === id ? cache.theme : null;
}

function preview(theme: Theme | null): DesignThemePreview | null {
  if (!theme) return null;
  return { name: theme.name, colors: theme.colors, fontTitle: theme.heading?.family ?? null, fontBody: theme.body?.family ?? null };
}

/**
 * Réglage lu avec la clé serveur : la feuille de style sert aussi les pages des votants, et
 * sondage_settings n'est lisible que par l'admin. Seul l'identifiant du thème est lu.
 */
async function linkedThemeId(): Promise<string | null> {
  const row = await serviceDb().one<{ design_theme_id: string | null }>("sondage_settings", "select=design_theme_id&id=eq.1");
  return row?.design_theme_id ?? null;
}

/** Réservé à l'admin : db est la connexion de son compte. */
export async function themeState(db: Db): Promise<ThemeState> {
  const row = await db.one<{ design_theme_id: string | null }>("sondage_settings", "select=design_theme_id&id=eq.1");
  const themeId = row?.design_theme_id ?? null;
  const state: ThemeState = { themeId, themes: [], theme: null };
  try {
    state.themes = await anonDb().select<{ id: string; name: string }>("design_themes", "select=id,name&order=name.asc");
    if (themeId) state.theme = preview(await fetchTheme(themeId));
  } catch (err) {
    state.error = describe(err);
    if (themeId) state.theme = preview(staleTheme(themeId));
  }
  return state;
}

/** Réservé à l'admin : db est la connexion de son compte (la RLS n'autorise que le rôle admin). null délie le site. */
export async function setTheme(db: Db, value: unknown): Promise<void> {
  if (value !== null) {
    if (typeof value !== "string" || !UUID.test(value)) throw new HttpError(400, "Identifiant de thème invalide");
    const found = await anonDb()
      .one<{ id: string }>("design_themes", `select=id&id=${eq(value)}`)
      .catch((err: unknown) => {
        throw new HttpError(502, describe(err));
      });
    if (!found) throw new HttpError(404, "Thème introuvable dans Flexdesign");
  }
  await db.update("sondage_settings", "id=eq.1", { design_theme_id: value });
  cache = null;
}

function fontFaces(font: ThemeFont, base: string): string[] {
  return font.files.map((f) =>
    [
      "@font-face {",
      `  font-family: "${font.family}";`,
      `  src: url("${base}${f.path}") format("${f.format}");`,
      `  font-weight: ${f.weight};`,
      `  font-style: ${f.style};`,
      "  font-display: swap;",
      f.unicode_range ? `  unicode-range: ${f.unicode_range};` : "",
      "}",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );
}

/**
 * Feuille de style qui remplace les couleurs et polices du thème BDE (globals.css).
 * Presque vide si aucun thème n'est lié ou s'il est introuvable : le thème du BDE s'applique alors.
 * Les polices viennent du bucket public design-fonts de Supabase (font-src dans src/proxy.ts).
 */
export async function themeCss(): Promise<string> {
  const id = await linkedThemeId().catch(() => null);
  const theme = id ? await fetchTheme(id).catch(() => staleTheme(id)) : null;
  if (!theme) return "/* Thème du BDE (aucun thème Flexdesign lié) */\n";
  const base = `${supabaseConfig().url}/storage/v1/object/public/design-fonts/`;
  const fonts = [theme.heading, theme.body].filter((f): f is ThemeFont => f !== null);
  const families = new Set<string>();
  const faces = fonts.flatMap((f) => {
    if (families.has(f.family)) return [];
    families.add(f.family);
    return fontFaces(f, base);
  });
  return [
    "/* Apparence liée à un thème Flexdesign */",
    ...faces,
    // :root:root l'emporte sur le :root de globals.css quel que soit l'ordre de chargement des feuilles
    ":root:root {",
    ...COLOR_VARS.filter(([, role]) => theme.colors[role]).map(([name, role]) => `  ${name}: ${theme.colors[role]};`),
    theme.heading ? `  --font-title: "${theme.heading.family}", ${theme.heading.fallback};` : "",
    theme.body ? `  --font-body: "${theme.body.family}", ${theme.body.fallback};` : "",
    "}",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

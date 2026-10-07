import { json, readJson, requireAdmin, route } from "@/lib/server/http";
import { setTheme, themeState } from "@/lib/server/theme";

/** État de l'apparence : thème lié, thèmes proposés par Flexdesign, aperçu. */
export const GET = route(async (req) => {
  const { db } = await requireAdmin(req);
  return json(await themeState(db));
});

/** Lie un thème Flexdesign ou délie le site : { themeId } (null : thème du BDE). */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  await setTheme(db, (await readJson(req)).themeId ?? null);
  return json(await themeState(db));
});

import { json, readJson, requireAdmin, route } from "@/lib/server/http";
import { setLinked, themeState } from "@/lib/server/theme";

/** État de l'apparence : lien avec Flexfolio, palette et polices lues. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await themeState());
});

/** Lie ou délie l'apparence du site de Flexfolio : { linked }. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  await setLinked(db, (await readJson(req)).linked === true);
  return json(await themeState());
});

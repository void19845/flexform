import { json, requireAdmin, route } from "../../lib/http.js";
import { clearActive } from "../../lib/store.js";

/** Revient à l'écran d'attente chez les votants. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  await clearActive(db);
  return json({ ok: true });
});

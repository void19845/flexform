import { json, requireAdmin, route } from "@/lib/server/http";
import { clearActive } from "@/lib/server/store";

/** Revient à l'écran d'attente chez les votants. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  await clearActive(db);
  return json({ ok: true });
});

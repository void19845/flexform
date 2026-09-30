import { json, readJson, requireAdmin, route, str } from "@/lib/server/http";
import { kick } from "@/lib/server/store";

/** Déconnecte un participant et libère son pseudo : { id }. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  await kick(db, str((await readJson(req)).id));
  return json({ ok: true });
});

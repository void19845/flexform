import { json, readJson, requireAdmin, route, str } from "../../lib/http.js";
import { kick } from "../../lib/store.js";

/** Déconnecte un participant et libère son pseudo : { id }. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  await kick(db, str((await readJson(req)).id));
  return json({ ok: true });
});

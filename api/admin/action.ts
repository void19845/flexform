import { HttpError, json, readJson, requireAdmin, route, str } from "../../lib/http.js";
import { closePoll, deletePoll, openPoll, resetPoll, setHub, setReveal } from "../../lib/store.js";
import type { Db } from "../../lib/supabase.js";

const ACTIONS: Record<string, (db: Db, id: string) => Promise<void>> = {
  open: openPoll,
  close: closePoll,
  reveal: (db, id) => setReveal(db, id, true),
  hide: (db, id) => setReveal(db, id, false),
  hub: (db, id) => setHub(db, id, true),
  unhub: (db, id) => setHub(db, id, false),
  reset: resetPoll,
  delete: deletePoll,
};

/** Action sur un sondage : { id, action }. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin(req);
  const body = await readJson(req);
  const run = ACTIONS[str(body.action)];
  if (!run) throw new HttpError(400, "Action inconnue");
  await run(db, str(body.id));
  return json({ ok: true });
});

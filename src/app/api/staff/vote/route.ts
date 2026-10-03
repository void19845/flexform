import { json, readJson, requireStaff, route, str } from "@/lib/server/http";
import { staffVote } from "@/lib/server/store";

/** Réponse du staff à un sondage qui lui est réservé : { pollId, value }. */
export const POST = route(async (req) => {
  const { db, userId } = await requireStaff(req);
  const body = await readJson(req);
  await staffVote(db, userId, str(body.pollId), str(body.value));
  return json({ ok: true });
});

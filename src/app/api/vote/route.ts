import { json, rateLimit, readJson, requireSession, route, str } from "@/lib/server/http";
import { vote } from "@/lib/server/store";

export const POST = route(async (req) => {
  const { sessionId } = await requireSession(req);
  await rateLimit(req, "vote", 60);
  const body = await readJson(req);
  await vote(sessionId, str(body.pollId), str(body.value));
  return json({ ok: true });
});

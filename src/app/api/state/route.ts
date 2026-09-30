import { json, requireSession, route } from "@/lib/server/http";
import { publicState } from "@/lib/server/store";

/** Interrogé régulièrement par la page de vote. */
export const GET = route(async (req) => {
  const { sessionId, pseudo } = await requireSession(req);
  return json(await publicState(sessionId, pseudo));
});

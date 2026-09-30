import { json, requireSession, route } from "../lib/http.js";
import { publicState } from "../lib/store.js";

/** Interrogé régulièrement par la page de vote. */
export const GET = route(async (req) => {
  const { sessionId, pseudo } = await requireSession(req);
  return json(await publicState(sessionId, pseudo));
});

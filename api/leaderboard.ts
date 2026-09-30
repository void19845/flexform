import { json, requireSession, route } from "../lib/http.js";
import { leaderboard } from "../lib/store.js";

/** Classement des votants, interrogé moins souvent que l'état du sondage. */
export const GET = route(async (req) => {
  const { sessionId, pseudo } = await requireSession(req);
  return json(await leaderboard(sessionId, pseudo));
});

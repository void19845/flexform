import { json, requireSession, route } from "@/lib/server/http";
import { leaderboard } from "@/lib/server/store";

/** Classement des votants, interrogé moins souvent que l'état du sondage. */
export const GET = route(async (req) => {
  const { sessionId, pseudo } = await requireSession(req);
  return json(await leaderboard(sessionId, pseudo));
});

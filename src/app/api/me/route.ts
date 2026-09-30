import { json, route, sessionIdOf } from "@/lib/server/http";
import { pseudoOf } from "@/lib/server/store";

/** Pseudo de la session en cours, ou null si pas connecté. */
export const GET = route(async (req) => {
  const sessionId = sessionIdOf(req);
  return json({ pseudo: sessionId ? await pseudoOf(sessionId) : null });
});

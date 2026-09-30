import { json, route, sessionIdOf } from "../lib/http.js";
import { pseudoOf } from "../lib/store.js";

/** Pseudo de la session en cours, ou null si pas connecté. */
export const GET = route(async (req) => {
  const sessionId = sessionIdOf(req);
  return json({ pseudo: sessionId ? await pseudoOf(sessionId) : null });
});

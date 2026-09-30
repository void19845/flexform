import { json, readJson, requireSession, route, sessionCookie } from "@/lib/server/http";
import { eraseMyData, myData, setConsent } from "@/lib/server/store";

/** Mes données : consultation et téléchargement (droit d'accès et de portabilité). */
export const GET = route(async (req) => {
  const { sessionId } = await requireSession(req);
  return json(await myData(sessionId));
});

/** Modifie les consentements facultatifs : { marketing, sponsors }. */
export const POST = route(async (req) => {
  const { sessionId } = await requireSession(req);
  const body = await readJson(req);
  return json(await setConsent(sessionId, body.marketing === true, body.sponsors === true));
});

/** Droit à l'effacement : supprime toutes les données du votant et le déconnecte. */
export const DELETE = route(async (req) => {
  const { sessionId } = await requireSession(req);
  await eraseMyData(sessionId);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, null) });
});

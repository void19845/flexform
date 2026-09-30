import { HttpError, json, rateLimit, readJson, route, sessionCookie, sessionIdOf, str } from "@/lib/server/http";
import { login, pseudoOf } from "@/lib/server/store";
import { PRIVACY_VERSION, PROFILE_MAX_LENGTH } from "@/lib/shared/types";

/** Texte d'un champ, espaces multiples réduits, entre 1 et max caractères. */
function field(value: unknown, label: string, max: number): string {
  const text = str(value).replace(/\s+/g, " ");
  if (!text || text.length > max) throw new HttpError(400, `${label} : entre 1 et ${max} caractères`);
  return text;
}

export const POST = route(async (req) => {
  const current = sessionIdOf(req);
  const existing = current ? await pseudoOf(current) : null;
  if (existing) return json({ pseudo: existing });

  await rateLimit(req, "login", 20);
  const body = await readJson(req);
  const prenom = field(body.prenom, "Prénom", PROFILE_MAX_LENGTH.prenom);
  const nom = field(body.nom, "Nom", PROFILE_MAX_LENGTH.nom);
  const formation = field(body.formation, "Formation", PROFILE_MAX_LENGTH.formation);
  const pseudo = str(body.pseudo).replace(/\s+/g, " ");
  if (pseudo.length < 2 || pseudo.length > 24) throw new HttpError(400, "Ton pseudo doit faire entre 2 et 24 caractères");
  if (body.privacy !== true) throw new HttpError(400, "Pour participer, accepte la politique de confidentialité.");
  const now = Date.now();
  // Consentements facultatifs : seul un true explicite vaut accord (jamais coché par défaut)
  const consent = { version: PRIVACY_VERSION, acceptedAt: now, marketing: body.marketing === true, sponsors: body.sponsors === true, updatedAt: now };
  const sessionId = await login({ pseudo, prenom, nom, formation, consent });
  return json({ pseudo }, 200, { "Set-Cookie": sessionCookie(req, sessionId) });
});

import { HttpError, json, readJson, route, signIn, str } from "../../lib/http.js";

/** Connexion admin / staff avec un compte Supabase : { email, password }. */
export const POST = route(async (req) => {
  const body = await readJson(req);
  const email = str(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw new HttpError(400, "E-mail et mot de passe requis");
  return json(await signIn(req, email, password));
});

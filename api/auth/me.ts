import { json, requireStaff, route } from "../../lib/http.js";

/** Compte admin / staff connecté et son rôle (401 si personne n'est connecté). */
export const GET = route(async (req) => {
  const { role, email } = await requireStaff(req);
  return json({ role, email });
});

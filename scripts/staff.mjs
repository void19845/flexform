/**
 * Crée un compte admin ou staff pour les sondages, ou change son rôle.
 *
 *   node --env-file=.env scripts/staff.mjs <email> <admin|staff> [mot-de-passe]
 *   node --env-file=.env scripts/staff.mjs <email> remove
 *
 * Utilise la clé service_role (SUPABASE_SERVICE_ROLE_KEY) : à lancer sur ton poste, jamais dans le navigateur.
 * Sans mot de passe, un mot de passe aléatoire est généré et affiché une seule fois.
 * Si le compte existe déjà dans Supabase Auth (ex. ton compte admin Flexfolio), seul le rôle est ajouté.
 */
import { randomBytes } from "node:crypto";

const [email, role, givenPassword] = process.argv.slice(2);
const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !["admin", "staff", "remove"].includes(role ?? "")) {
  console.error("Usage : node --env-file=.env scripts/staff.mjs <email> <admin|staff|remove> [mot-de-passe]");
  process.exit(1);
}
if (!url || !key) {
  console.error("Définis SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (dans .env).");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function call(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${body?.msg ?? body?.message ?? JSON.stringify(body)}`);
  return body;
}

/** Cherche le compte par e-mail (l'API admin pagine les utilisateurs). */
async function findUser() {
  for (let page = 1; ; page++) {
    const { users } = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found || users.length < 200) return found ?? null;
  }
}

let user = await findUser();

if (role === "remove") {
  if (user) await call(`/rest/v1/sondage_staff?user_id=eq.${user.id}`, { method: "DELETE" });
  console.log(`${email} n'a plus accès aux sondages (le compte Supabase est conservé).`);
  process.exit(0);
}

let password = null;
if (!user) {
  password = givenPassword ?? randomBytes(12).toString("base64url");
  user = await call("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) });
}
await call("/rest/v1/sondage_staff?on_conflict=user_id", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ user_id: user.id, role }),
});

console.log(`${email} : rôle ${role}.`);
if (password && !givenPassword) console.log(`Mot de passe généré (à transmettre puis à changer) : ${password}`);

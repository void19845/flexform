/**
 * Test de bout en bout contre la base Supabase LOCALE de Flex Suite (npm run db:start dans
 * flexstaff, comptes créés avec npm run role) et l'appli lancée en local.
 * Vérifie les parcours (votant, admin, staff) et la sécurité par ligne en interrogeant la base
 * directement avec chaque rôle. Ne jamais lancer contre la base de production : il crée et supprime des données.
 *
 *   node --env-file=.env scripts/e2e.mjs [adresse de l'appli, défaut http://localhost:8787]
 */
const APP = process.argv[2] ?? "http://localhost:8787";
const { SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE } = process.env;
if (!SB?.includes("127.0.0.1") && !SB?.includes("localhost")) {
  console.error("Refusé : SUPABASE_URL ne pointe pas vers une base locale.");
  process.exit(1);
}

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail ? ` -> ${detail}` : ""}`);
}

/** Client HTTP avec ses propres cookies, comme un navigateur. */
function browser() {
  const jar = new Map();
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(APP + path, {
      method,
      headers: { "Content-Type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      if (/Max-Age=0/.test(c)) jar.delete(k);
      else jar.set(k, v.join("="));
    }
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}

/** Accès direct à la base (PostgREST) avec une clé ou un jeton donné. */
async function rest(bearer, path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function token(email, password) {
  const res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await res.json()).access_token;
}

// Base propre : on retire les votants et les codes des tests précédents, et on remet les sondages en brouillon
await rest(SERVICE, "sondage_participants?id=not.is.null", { method: "DELETE" });
await rest(SERVICE, "sondage_polls?staff_only=eq.true", { method: "DELETE" });
await rest(SERVICE, "sondage_polls?id=not.is.null", { method: "PATCH", body: { status: "draft", hub: false, reward: "", reveal: false, published_at: null } });
await rest(SERVICE, "sondage_settings?id=eq.1", { method: "PATCH", body: { active_poll_id: null, design_theme_id: null } });
await rest(SERVICE, "sondage_rate_limits?key=not.is.null", { method: "DELETE" });

console.log("\n# Votants");
const lea = browser();
const tom = browser();
const profile = { prenom: "Léa", nom: "Martin", formation: "BUT Info 2", pseudo: "lea" };
check("inscription refusée sans la politique", (await lea("/api/login", { method: "POST", body: profile })).status === 400);
check("inscription avec consentement", (await lea("/api/login", { method: "POST", body: { ...profile, privacy: true, sponsors: true } })).status === 200);
check("pseudo déjà pris (casse différente)", (await tom("/api/login", { method: "POST", body: { ...profile, pseudo: "LEA", privacy: true } })).status === 409);
check("autre votant", (await tom("/api/login", { method: "POST", body: { prenom: "Tom", nom: "Petit", formation: "GEA", pseudo: "tom", privacy: true } })).status === 200);
check("vote refusé tant que rien n'est ouvert", (await lea("/api/vote", { method: "POST", body: { pollId: "ag-roles", value: "0" } })).status === 409);

console.log("\n# Comptes admin et staff");
const admin = browser();
const staff = browser();
check("mauvais mot de passe refusé", (await admin("/api/auth/login", { method: "POST", body: { email: process.env.TEST_ADMIN_EMAIL, password: "nope" } })).status === 401);
const adminLogin = await admin("/api/auth/login", { method: "POST", body: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } });
check("connexion admin", adminLogin.status === 200 && adminLogin.data.role === "admin", JSON.stringify(adminLogin.data));
const staffLogin = await staff("/api/auth/login", { method: "POST", body: { email: process.env.TEST_STAFF_EMAIL, password: process.env.TEST_STAFF_PASSWORD } });
check("connexion staff", staffLogin.status === 200 && staffLogin.data.role === "staff", JSON.stringify(staffLogin.data));
check("un votant n'accède pas à l'admin", (await lea("/api/admin/state")).status === 401);
check("le staff n'accède pas à l'admin", (await staff("/api/admin/state")).status === 403);
check("le staff ne peut pas lancer un sondage", (await staff("/api/admin/action", { method: "POST", body: { id: "ag-roles", action: "open" } })).status === 403);

console.log("\n# Sondages");
const state0 = await admin("/api/admin/state");
check("l'admin voit les 6 sondages de l'AG", state0.data.polls?.length === 6, JSON.stringify(state0.data).slice(0, 200));
check("hub + récompense", (await admin("/api/admin/action", { method: "POST", body: { id: "ag-roles", action: "hub" } })).status === 200 &&
  (await admin("/api/admin/reward", { method: "POST", body: { id: "ag-roles", reward: "1 café offert" } })).status === 200);
check("lancer en direct", (await admin("/api/admin/action", { method: "POST", body: { id: "ag-vote-roles", action: "open" } })).status === 200);
check("vote hub", (await lea("/api/vote", { method: "POST", body: { pollId: "ag-roles", value: "2" } })).status === 200);
check("vote direct", (await lea("/api/vote", { method: "POST", body: { pollId: "ag-vote-roles", value: "0" } })).status === 200);
check("changement d'avis", (await lea("/api/vote", { method: "POST", body: { pollId: "ag-vote-roles", value: "1" } })).status === 200);
check("choix invalide refusé", (await tom("/api/vote", { method: "POST", body: { pollId: "ag-vote-roles", value: "9" } })).status === 400);
await tom("/api/vote", { method: "POST", body: { pollId: "ag-vote-roles", value: "0" } });
const pub = await lea("/api/state");
check("état votant : direct + hub + récompense", pub.data.poll?.id === "ag-vote-roles" && pub.data.poll.myVote === "1" && pub.data.hub.length === 1 && pub.data.rewards.length === 1, JSON.stringify(pub.data).slice(0, 300));
const code = pub.data.rewards[0]?.code;
check("même code au rafraîchissement", (await lea("/api/state")).data.rewards[0]?.code === code);
check("QR servi au propriétaire seulement", (await lea(`/api/reward-qr?code=${code}`)).status === 200 && (await tom(`/api/reward-qr?code=${code}`)).status === 404);
const admin1 = await admin("/api/admin/state");
const votePoll = admin1.data.polls.find((p) => p.id === "ag-vote-roles");
check("résultats admin", votePoll.results.total === 2 && votePoll.results.counts["1"] === 1, JSON.stringify(votePoll.results));
check("2 participants actifs", admin1.data.participants.length === 2);
const board = await lea("/api/leaderboard");
check("classement + succès", board.data.me?.rank === 1 && board.data.achievements.find((a) => a.id === "first")?.unlocked === true && board.data.achievements.find((a) => a.id === "lightspeed")?.unlocked === true, JSON.stringify(board.data).slice(0, 300));
const resp = await admin("/api/admin/respondents");
check("répondants avec consentement", resp.data.respondents.find((r) => r.pseudo === "lea")?.consent?.sponsors === true);

console.log("\n# Récompenses (staff)");
const checked = await staff("/api/staff/check", { method: "POST", body: { code: `${APP}/staff?code=${code}` } });
check("scan : valide, avec le nom", checked.data.status === "valid" && checked.data.person?.nom === "Martin", JSON.stringify(checked.data));
const [a, b] = await Promise.all([
  staff("/api/staff/redeem", { method: "POST", body: { code } }),
  admin("/api/staff/redeem", { method: "POST", body: { code: code.toLowerCase().replace(/(.{4})/g, "$1-") } }),
]);
check("double validation simultanée : une seule réussit", [a.data.status, b.data.status].sort().join() === "done,used", `${a.data.status} ${b.data.status}`);
check("code inconnu", (await staff("/api/staff/check", { method: "POST", body: { code: "ZZZZZZZZZZZZ" } })).data.status === "invalid");
check("succès « Chasseur de récompenses »", (await lea("/api/leaderboard")).data.achievements.find((x) => x.id === "collector")?.unlocked === true);

console.log("\n# Sondages réservés au staff");
const staffPollBody = { question: "Dispo pour la réunion staff ?", kind: "choice", options: ["Oui", "Non"], staffOnly: true, hub: true };
check("sondage staff avec récompense refusé", (await admin("/api/admin/polls", { method: "POST", body: { ...staffPollBody, reward: "1 café" } })).status === 400);
check("création d'un sondage staff ouvert", (await admin("/api/admin/polls", { method: "POST", body: staffPollBody })).status === 201);
const staffPollId = (await admin("/api/admin/state")).data.polls.find((p) => p.staffOnly)?.id;
const leaState = (await lea("/api/state")).data;
check("le votant ne voit pas le sondage staff", staffPollId && leaState.poll?.id !== staffPollId && !leaState.hub.some((p) => p.id === staffPollId), JSON.stringify(leaState.hub));
check("le votant ne peut pas répondre au sondage staff", (await lea("/api/vote", { method: "POST", body: { pollId: staffPollId, value: "0" } })).status === 404);
check("le votant n'accède pas aux sondages staff", (await lea("/api/staff/polls")).status === 401 && (await lea("/api/staff/vote", { method: "POST", body: { pollId: staffPollId, value: "0" } })).status === 401);
check("lancer en direct refusé pour un sondage staff", (await admin("/api/admin/action", { method: "POST", body: { id: staffPollId, action: "open" } })).status === 409);
check("le sondage staff ne compte pas dans le classement", (await lea("/api/leaderboard")).data.totalPolls === 6);
check("le staff voit le sondage staff", (await staff("/api/staff/polls")).data.some?.((p) => p.id === staffPollId && p.myVote === null));
check("le staff répond", (await staff("/api/staff/vote", { method: "POST", body: { pollId: staffPollId, value: "1" } })).status === 200);
check("l'admin répond aussi depuis /staff", (await admin("/api/staff/vote", { method: "POST", body: { pollId: staffPollId, value: "0" } })).status === 200);
check("le staff retrouve sa réponse", (await staff("/api/staff/polls")).data.find?.((p) => p.id === staffPollId)?.myVote === "1");
check("choix invalide refusé au staff", (await staff("/api/staff/vote", { method: "POST", body: { pollId: staffPollId, value: "9" } })).status === 400);
check("le staff ne peut pas répondre à un sondage normal par /staff", (await staff("/api/staff/vote", { method: "POST", body: { pollId: "ag-roles", value: "0" } })).status === 404);
const staffResults = (await admin("/api/admin/state")).data.polls.find((p) => p.id === staffPollId)?.results;
check("résultats du sondage staff dans l'admin", staffResults?.total === 2 && staffResults.counts["1"] === 1, JSON.stringify(staffResults));
check("aucune réponse du staff parmi les votes des votants", (await rest(SERVICE, `sondage_votes?select=poll_id&poll_id=eq.${staffPollId}`)).data.length === 0);
await admin("/api/admin/action", { method: "POST", body: { id: staffPollId, action: "unhub" } });
check("réponse du staff refusée une fois le sondage fermé", (await staff("/api/staff/vote", { method: "POST", body: { pollId: staffPollId, value: "0" } })).status === 409);
check("sondage fermé absent de /staff", (await staff("/api/staff/polls")).data.length === 0);
check("remise à zéro : réponses du staff effacées", (await admin("/api/admin/action", { method: "POST", body: { id: staffPollId, action: "reset" } })).status === 200 &&
  (await rest(SERVICE, `sondage_staff_votes?select=user_id&poll_id=eq.${staffPollId}`)).data.length === 0);

console.log("\n# Sécurité par ligne (accès direct à la base)");
const staffJwt = await token(process.env.TEST_STAFF_EMAIL, process.env.TEST_STAFF_PASSWORD);
const adminJwt = await token(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
for (const table of ["sondage_participants", "sondage_votes", "sondage_reward_codes", "sondage_polls", "sondage_settings", "sondage_staff_votes", "app_roles"]) {
  const r = await rest(ANON, `${table}?select=*`);
  check(`anon ne lit rien dans ${table}`, r.status === 401 || r.status === 403 || (Array.isArray(r.data) && r.data.length === 0), `${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
}
check("anon ne peut pas s'inscrire directement", (await rest(ANON, "sondage_participants", { method: "POST", body: { pseudo: "pirate" } })).status >= 400);
check("anon ne peut pas appeler la limitation de débit", (await rest(ANON, "rpc/sondage_hit_rate_limit", { method: "POST", body: { p_key: "x", p_window_seconds: 60 } })).status >= 400);
const staffPeople = await rest(staffJwt, "sondage_participants?select=pseudo");
check("le staff ne voit que les personnes avec une récompense", staffPeople.data.length === 1 && staffPeople.data[0].pseudo === "lea", JSON.stringify(staffPeople.data));
check("le staff ne lit pas les votes", (await rest(staffJwt, "sondage_votes?select=*")).data.length === 0);
const staffEdit = await rest(staffJwt, "sondage_polls?id=eq.ag-roles", { method: "PATCH", body: { question: "piraté" }, prefer: "return=representation" });
check("le staff ne modifie pas les sondages", staffEdit.status >= 400 || staffEdit.data.length === 0, JSON.stringify(staffEdit));
const steal = await rest(staffJwt, `sondage_reward_codes?code=eq.${code}`, { method: "PATCH", body: { participant_id: "00000000-0000-0000-0000-000000000000" } });
check("le staff ne peut pas réattribuer un code", steal.status >= 400, `${steal.status}`);
// Droits de la suite (table app_roles) : les règles détaillées sont testées par npm run test:rls dans Flex Suite
const promote = await rest(staffJwt, "app_roles?app=eq.flexform", { method: "PATCH", body: { role: "admin" }, prefer: "return=representation" });
check("le staff ne peut pas se donner le rôle admin", promote.status >= 400 || promote.data.length === 0, `${promote.status}`);
const own = await rest(staffJwt, "app_roles?select=role&app=eq.flexform");
check("le staff lit seulement sa propre ligne d'équipe", own.data.length === 1 && own.data[0].role === "staff");
check("l'admin lit tous les votes", (await rest(adminJwt, "sondage_votes?select=*")).data.length === 3);
check("l'admin lit toute l'équipe Flexform", (await rest(adminJwt, "app_roles?select=role&app=eq.flexform")).data.length >= 2);

console.log("\n# Apparence (thème Flexdesign)");
// Thème de test créé directement dans les tables de Flexdesign (supabase/init.sql du dépôt flexdesign, appliqué par db:setup)
await rest(SERVICE, "design_themes?name=eq.e2e-flexform", { method: "DELETE" });
await rest(SERVICE, "design_fonts?family=eq.Flexdesign%20e2eflexform", { method: "DELETE" });
const themeId = (await rest(SERVICE, "design_themes", { method: "POST", body: { name: "e2e-flexform" }, prefer: "return=representation" })).data[0].id;
const roles = { background: "#fafaf5", surface: "#ffffff", text: "#111111", muted: "#555555", border: "#dddddd", primary: "#0b6e4f", onPrimary: "#ffffff", accent: "#e4572e", onAccent: "#ffffff", success: "#2e7d32", warning: "#f2a900", danger: "#c62828" };
await rest(SERVICE, "design_theme_colors", { method: "POST", body: Object.entries(roles).map(([name, hex]) => ({ theme_id: themeId, mode: "light", kind: "role", name, hex })) });
const fontRow = (await rest(SERVICE, "design_fonts", { method: "POST", body: { family: "Flexdesign e2eflexform", label: "Police e2e", source: "upload", category: "sans-serif", license: "own" }, prefer: "return=representation" })).data[0];
await rest(SERVICE, "design_font_files", { method: "POST", body: { font_id: fontRow.id, weight: 400, style: "normal", format: "woff2", path: `${fontRow.id}/e2e-regular.woff2` } });
await rest(SERVICE, "design_theme_fonts", { method: "POST", body: { theme_id: themeId, role: "body", font_id: fontRow.id, fallback: "sans-serif" } });

check("sans lien : thème du BDE", !(await lea("/api/theme")).data.includes(":root"));
check("le votant n'accède pas à l'apparence", (await lea("/api/admin/theme")).status === 401 && (await lea("/api/admin/theme", { method: "POST", body: { themeId } })).status === 401);
check("le staff ne peut pas lier un thème", (await staff("/api/admin/theme", { method: "POST", body: { themeId } })).status === 403);
const themes0 = await admin("/api/admin/theme");
check("l'admin voit les thèmes de Flexdesign", themes0.data.themeId === null && themes0.data.themes?.some((t) => t.id === themeId), JSON.stringify(themes0.data).slice(0, 200));
check("identifiant de thème invalide refusé", (await admin("/api/admin/theme", { method: "POST", body: { themeId: "x" } })).status === 400);
check("thème inconnu refusé", (await admin("/api/admin/theme", { method: "POST", body: { themeId: "00000000-0000-0000-0000-000000000000" } })).status === 404);
const linked = await admin("/api/admin/theme", { method: "POST", body: { themeId } });
check("l'admin lie un thème", linked.status === 200 && linked.data.themeId === themeId && linked.data.theme?.colors.primary === "#0b6e4f" && linked.data.theme.fontBody === "Flexdesign e2eflexform", JSON.stringify(linked.data).slice(0, 300));
const css = (await lea("/api/theme")).data;
check("feuille du thème : couleurs", css.includes("--violet: #0b6e4f;") && css.includes("--bg: #fafaf5;") && css.includes("--on-violet: #ffffff;"), css.slice(0, 300));
check("feuille du thème : police du bucket design-fonts", css.includes('font-family: "Flexdesign e2eflexform";') && css.includes(`${SB}/storage/v1/object/public/design-fonts/${fontRow.id}/e2e-regular.woff2`) && css.includes('--font-body: "Flexdesign e2eflexform", sans-serif;'), css.slice(0, 400));
const csp = (await fetch(`${APP}/`)).headers.get("content-security-policy") ?? "";
check("CSP : polices autorisées depuis Supabase", csp.includes(`font-src 'self' ${new URL(SB).origin}`), csp);
const staffTheme = await rest(staffJwt, "sondage_settings?id=eq.1", { method: "PATCH", body: { design_theme_id: null }, prefer: "return=representation" });
check("le staff ne modifie pas le thème lié en base", staffTheme.status >= 400 || staffTheme.data.length === 0, JSON.stringify(staffTheme));
check("le thème lié reste en place", (await rest(SERVICE, "sondage_settings?select=design_theme_id&id=eq.1")).data[0]?.design_theme_id === themeId);
check("l'admin délie le site", (await admin("/api/admin/theme", { method: "POST", body: { themeId: null } })).data.themeId === null && !(await lea("/api/theme")).data.includes(":root"));
// Thème supprimé dans Flexdesign alors qu'il est encore lié : retour au thème du BDE
await rest(SERVICE, "sondage_settings?id=eq.1", { method: "PATCH", body: { design_theme_id: themeId } });
await rest(SERVICE, `design_themes?id=eq.${themeId}`, { method: "DELETE" });
await rest(SERVICE, `design_fonts?id=eq.${fontRow.id}`, { method: "DELETE" });
check("thème supprimé : thème du BDE", !(await lea("/api/theme")).data.includes(":root"));
const gone = await admin("/api/admin/theme");
check("thème supprimé : signalé à l'admin", gone.data.themeId === themeId && gone.data.theme === null, JSON.stringify(gone.data).slice(0, 200));
await rest(SERVICE, "sondage_settings?id=eq.1", { method: "PATCH", body: { design_theme_id: null } });

console.log("\n# RGPD et remise à zéro");
check("remise à zéro : codes annulés", (await admin("/api/admin/action", { method: "POST", body: { id: "ag-roles", action: "reset" } })).status === 200 &&
  (await staff("/api/staff/check", { method: "POST", body: { code } })).data.status === "invalid");
const mine = await tom("/api/privacy");
check("Mes données", mine.status === 200 && mine.data.answers.length === 1 && mine.data.profile.pseudo === "tom");
check("modifier ses consentements", (await tom("/api/privacy", { method: "POST", body: { marketing: true, sponsors: false } })).data.marketing === true);
check("effacement", (await tom("/api/privacy", { method: "DELETE" })).status === 200 && (await tom("/api/state")).status === 401);
check("plus aucune trace en base", (await rest(SERVICE, "sondage_votes?select=participant_id")).data.every((v) => v.participant_id !== mine.data.profile.id) &&
  (await rest(SERVICE, "sondage_participants?pseudo=eq.tom")).data.length === 0);
check("déconnexion admin", (await admin("/api/auth/logout", { method: "POST" })).status === 200 && (await admin("/api/admin/state")).status === 401);

console.log(`\n${failures ? `${failures} échec(s)` : "Tout est passé."}`);
process.exit(failures ? 1 : 0);

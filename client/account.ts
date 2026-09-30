import { api, ApiError, h } from "./dom.js";

/** Compte admin / staff (Supabase Auth). Les jetons restent dans des cookies HttpOnly côté serveur. */
export interface Account {
  role: "admin" | "staff";
  email: string;
}

/** Compte connecté, ou null s'il faut se connecter. */
export async function currentAccount(): Promise<Account | null> {
  try {
    return await api<Account>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

export async function signOut(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/** Formulaire de connexion par e-mail et mot de passe. onSignedIn reçoit le compte et son rôle. */
export function loginForm(opts: {
  eyebrow: string;
  title: string;
  intro?: string;
  message?: string;
  onSignedIn: (account: Account) => void;
}): HTMLFormElement {
  const email = h("input", { type: "email", placeholder: "prenom.nom@exemple.fr", autocomplete: "username", required: true });
  const password = h("input", { type: "password", placeholder: "Mot de passe", autocomplete: "current-password", required: true });
  const error = h("p", { class: "error", role: "alert" }, opts.message ?? "");
  const submit = h("button", { type: "submit", class: "btn primary big" }, "Se connecter");
  const form = h(
    "form",
    { class: "card login" },
    h("p", { class: "eyebrow" }, opts.eyebrow),
    h("h1", {}, opts.title),
    opts.intro ? h("p", { class: "muted" }, opts.intro) : "",
    h("label", { class: "field" }, h("span", {}, "E-mail"), email),
    h("label", { class: "field" }, h("span", {}, "Mot de passe"), password),
    error,
    submit,
    h("p", { class: "muted small" }, "Compte créé par un admin du BDE dans Supabase. Pas de compte ? Demande au bureau."),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    error.textContent = "";
    try {
      const account = await api<Account>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.value, password: password.value }),
      });
      opts.onSignedIn(account);
    } catch (err) {
      error.textContent = (err as Error).message;
      submit.disabled = false;
      password.select();
    }
  });
  queueMicrotask(() => email.focus());
  return form;
}

import { api, isAuthError } from "./api";

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
    if (isAuthError(err)) return null;
    throw err;
  }
}

export async function signOut(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

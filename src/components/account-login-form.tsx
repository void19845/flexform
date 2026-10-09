"use client";

import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import type { Account } from "@/lib/client/account";

/** Connexion admin / staff par e-mail et mot de passe (compte Supabase). onSignedIn reçoit le compte et son rôle. */
export function AccountLoginForm({
  eyebrow,
  title,
  message = "",
  onSignedIn,
}: {
  eyebrow: string;
  title: string;
  message?: string;
  onSignedIn: (account: Account) => void;
}) {
  const [error, setError] = useState(message);
  const [pending, setPending] = useState(false);
  const password = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      const account = await api<Account>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      onSignedIn(account);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
      password.current?.select();
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <label className="field">
        <span>E-mail</span>
        <input name="email" type="email" placeholder="prenom.nom@exemple.fr" autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        <span>Mot de passe</span>
        <input ref={password} name="password" type="password" placeholder="Mot de passe" autoComplete="current-password" required />
      </label>
      <p className="error" role="alert">
        {error}
      </p>
      <button type="submit" className="btn primary big" disabled={pending}>
        Se connecter
      </button>
      <p className="muted small">Compte créé par un admin du BDE dans Supabase. Pas de compte ? Demande au bureau.</p>
    </form>
  );
}

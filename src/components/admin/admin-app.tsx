"use client";

import { useEffect, useState } from "react";
import { AccountLoginForm } from "@/components/account-login-form";
import { AdminPanel } from "@/components/admin/admin-panel";
import { currentAccount, type Account } from "@/lib/client/account";

const STAFF_ONLY = "Ce compte a le rôle staff : il donne accès à la page staff, pas à l'administration.";

/**
 * loading : en attente de /api/auth/me ; login : connexion, avec un message éventuel ; panel : tableau de bord.
 * id change à chaque retour à la connexion : le formulaire est recréé (message affiché, bouton réactivé), comme sur l'ancienne page.
 * origin : adresse du site, pour la carte « Rejoindre ».
 */
type View =
  | { name: "loading" }
  | { name: "login"; message: string; id: number }
  | { name: "panel"; account: Account; origin: string };

function toLogin(message: string): (view: View) => View {
  return (view) => ({ name: "login", message, id: view.name === "login" ? view.id + 1 : 0 });
}

/** À n'appeler que hors du rendu : location n'existe pas côté serveur. */
function toPanel(account: Account): View {
  return { name: "panel", account, origin: location.origin };
}

/** Page admin : connexion par compte (rôle admin), puis pilotage des sondages. */
export function AdminApp() {
  const [view, setView] = useState<View>({ name: "loading" });

  useEffect(() => {
    let ignore = false;
    void currentAccount()
      .catch(() => null)
      .then((account) => {
        if (ignore) return;
        if (account?.role === "admin") setView(toPanel(account));
        else setView(toLogin(account ? STAFF_ONLY : ""));
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (view.name === "loading") return null;
  if (view.name === "panel") {
    return <AdminPanel account={view.account} origin={view.origin} onSignedOut={(message) => setView(toLogin(message))} />;
  }
  return (
    <div className="narrow">
      <AccountLoginForm
        key={view.id}
        eyebrow="AG · BDE Montreuil"
        title="Administration"
        message={view.message}
        onSignedIn={(account) => setView(account.role === "admin" ? toPanel(account) : toLogin(STAFF_ONLY))}
      />
    </div>
  );
}

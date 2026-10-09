"use client";

import { useEffect, useState } from "react";
import { AppearanceTab } from "@/components/admin/appearance-tab";
import { CreatePollForm } from "@/components/admin/create-poll-form";
import { JoinCard } from "@/components/admin/join-card";
import { LiveBar } from "@/components/admin/live-bar";
import { PeopleCard } from "@/components/admin/people-card";
import { PollCard } from "@/components/admin/poll-card";
import { RespondentsTab } from "@/components/admin/respondents-tab";
import { signOut as endSession, type Account } from "@/lib/client/account";
import { api } from "@/lib/client/api";
import { usePolling } from "@/lib/client/use-polling";
import type { AdminState } from "@/lib/shared/types";

/** Lance une action de l'admin : un succès rafraîchit l'état, une erreur s'affiche dans le toast. */
export type Run = (action: () => Promise<unknown>) => void;

const TABS = [
  { id: "polls", label: "Sondages" },
  { id: "respondents", label: "Répondants & export" },
  { id: "appearance", label: "Apparence" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** Tableau de bord. origin : adresse du site ; onSignedOut : session terminée, retour à la connexion avec ce message. */
export function AdminPanel({
  account,
  origin,
  onSignedOut,
}: {
  account: Account;
  origin: string;
  onSignedOut: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("polls");
  const [state, setState] = useState<AdminState | null>(null);
  const [connected, setConnected] = useState(true);
  /** Déconnexion en cours : plus aucune interrogation du serveur */
  const [stopped, setStopped] = useState(false);
  /** Objet neuf à chaque message : le même message affiché deux fois relance les 3,5 s */
  const [toast, setToast] = useState<{ text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const flash = (text: string): void => setToast({ text });

  const signOut = (message = ""): void => {
    setStopped(true);
    void endSession().then(() => onSignedOut(message));
  };

  const refresh = usePolling(
    () => api<AdminState>("/api/admin/state"),
    2000,
    {
      onState: (s) => setState(s),
      onStatus: setConnected,
      onUnauthorized: () => signOut("Session expirée ou accès retiré, reconnecte-toi."),
    },
    !stopped,
  );

  // Après chaque action, on rafraîchit tout de suite au lieu d'attendre le prochain tour
  const run: Run = (action) => {
    action()
      .then(() => refresh())
      .catch((err: unknown) => flash((err as Error).message));
  };

  // Catégories existantes, proposées dans le formulaire de création
  const categories = [...new Set(state?.polls.map((p) => p.category).filter((c): c is string => Boolean(c)))];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">AG · BDE Montreuil</p>
          <h1>Pilotage des sondages</h1>
        </div>
        <div className="topbar-actions">
          <span className="muted small">{account.email}</span>
          <button type="button" className="btn ghost small" onClick={() => signOut()}>
            Déconnexion
          </button>
        </div>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="btn tab" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <p className="status" hidden={connected}>
        Connexion perdue, reconnexion…
      </p>
      {/* Onglets : le pilotage continue de se rafraîchir en arrière-plan, les répondants seulement quand ils sont affichés */}
      <div hidden={tab !== "polls"}>
        <LiveBar state={state} run={run} />
        <div className="layout">
          <main>
            <div className="polls">
              {state?.polls.map((p, i) => (
                <PollCard key={p.id} poll={p} num={i + 1} active={state.activePollId === p.id} run={run} />
              ))}
            </div>
            <CreatePollForm categories={categories} run={run} flash={flash} />
          </main>
          <aside>
            <JoinCard origin={origin} />
            <PeopleCard state={state} run={run} />
          </aside>
        </div>
      </div>
      <RespondentsTab active={tab === "respondents" && !stopped} onUnauthorized={() => signOut("Session expirée, reconnecte-toi.")} />
      <AppearanceTab active={tab === "appearance"} />
      <p className="toast" role="status" hidden={!toast}>
        {toast?.text}
      </p>
    </>
  );
}

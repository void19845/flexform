"use client";

import { useState } from "react";
import { Achievements } from "@/components/vote/achievements";
import { Leaderboard } from "@/components/vote/leaderboard";
import { MyDataPanel } from "@/components/vote/my-data-panel";
import { PollCard, WaitingCard } from "@/components/vote/poll-card";
import { Rewards } from "@/components/vote/rewards";
import { api, post } from "@/lib/client/api";
import { plural } from "@/lib/client/format";
import { usePolling } from "@/lib/client/use-polling";
import type { AchievementState } from "@/lib/shared/achievements";
import type { LeaderboardState, PublicState } from "@/lib/shared/types";

/** Succès affichés avant la première réponse du classement */
const NO_ACHIEVEMENTS: AchievementState[] = [];

/**
 * Page de vote : sondage en direct, récompenses, hub, classement et succès.
 * onSignedOut : retour au formulaire de connexion, avec un message éventuel.
 */
export function VotePage({ onSignedOut }: { onSignedOut: (message?: string) => void }) {
  /** Dernier état lu, avec l'heure de départ de sa requête */
  const [polled, setPolled] = useState<{ state: PublicState; startedAt: number } | null>(null);
  const [connected, setConnected] = useState(true);
  const [board, setBoard] = useState<LeaderboardState | null>(null);
  const [dataOpen, setDataOpen] = useState(false);

  // Classement, rafraîchi moins souvent que le sondage
  const refreshBoard = usePolling(() => api<LeaderboardState>("/api/leaderboard"), 10000, {
    onState: (s) => setBoard(s),
  });
  const refreshState = usePolling(() => api<PublicState>("/api/state"), 2000, {
    onState: (state, startedAt) => setPolled({ state, startedAt }),
    onStatus: setConnected,
    // Session supprimée (déconnecté·e par l'admin ou cookie expiré)
    onUnauthorized: () => onSignedOut("Ta session a pris fin, reconnecte-toi."),
  });
  // Après un vote, le sondage et le classement sont rafraîchis tout de suite
  const onVoted = (): void => {
    refreshState();
    refreshBoard();
  };

  function logout(): void {
    void post("/api/logout")
      .catch(() => undefined)
      .then(() => onSignedOut());
  }

  const state = polled?.state;
  const startedAt = polled?.startedAt ?? 0;
  return (
    <>
      <section className="poll-slot">
        {state &&
          (state.poll ? (
            <PollCard key={state.poll.id} poll={state.poll} startedAt={startedAt} live onVoted={onVoted} />
          ) : (
            <WaitingCard hubBelow={state.hub.length > 0} />
          ))}
      </section>
      <p className="status" hidden={connected}>
        Connexion perdue, reconnexion…
      </p>
      <Rewards rewards={state?.rewards ?? []} />
      <section className="hub" hidden={!state?.hub.length}>
        <h2 className="hub-title">Sondages en libre accès</h2>
        <p className="muted">Réponds quand tu veux, ils restent ouverts.</p>
        <div className="hub-list">
          {state?.hub.map((poll) => (
            <PollCard key={poll.id} poll={poll} startedAt={startedAt} live={false} onVoted={onVoted} />
          ))}
        </div>
      </section>
      <Leaderboard state={board} />
      <Achievements list={board?.achievements ?? NO_ACHIEVEMENTS} pseudo={board?.pseudo ?? ""} />
      <footer className="me">
        <div>
          <strong>{state?.pseudo}</strong>
          <span className="muted">{state && ` · ${plural(state.participants, "participant")}`}</span>
        </div>
        <div className="me-actions">
          <button type="button" className="btn ghost small" onClick={() => setDataOpen((open) => !open)}>
            Mes données
          </button>
          <button type="button" className="btn ghost small" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </footer>
      {dataOpen && <MyDataPanel onErased={() => onSignedOut("Tes données ont été supprimées.")} />}
    </>
  );
}

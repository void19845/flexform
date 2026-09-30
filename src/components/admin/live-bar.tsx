import type { Run } from "@/components/admin/admin-panel";
import { post } from "@/lib/client/api";
import type { AdminState } from "@/lib/shared/types";

/** Ce que voient les votants : le sondage affiché ou l'écran d'attente. Carte vide tant que le premier état n'est pas arrivé. */
export function LiveBar({ state, run }: { state: AdminState | null; run: Run }) {
  if (!state) return <div className="card live-bar" />;
  const poll = state.polls.find((p) => p.id === state.activePollId);
  return (
    <div className="card live-bar">
      {poll ? (
        <div>
          {poll.status === "open" ? (
            <p className="eyebrow live">Vote en cours chez les votants</p>
          ) : (
            <p className="eyebrow">Affiché chez les votants · vote clôturé</p>
          )}
          <strong>{poll.question}</strong>
        </div>
      ) : (
        <div>
          <p className="eyebrow">{"Rien d'affiché"}</p>
          <span className="muted">{"Les votants voient l'écran d'attente."}</span>
        </div>
      )}
      {poll && (
        <button type="button" className="btn ghost" onClick={() => run(() => post("/api/admin/clear"))}>
          {"Écran d'attente"}
        </button>
      )}
    </div>
  );
}

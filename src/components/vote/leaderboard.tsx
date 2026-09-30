"use client";

import type { LeaderboardEntry, LeaderboardState } from "@/lib/shared/types";

/** Les trois premières places ont leur couleur (or, argent, bronze) */
const PODIUM = ["gold", "silver", "bronze"];

function Row({ entry, total, mine }: { entry: LeaderboardEntry; total: number; mine: boolean }) {
  return (
    <li className={mine ? "me-row" : undefined}>
      <span className={`rank ${PODIUM[entry.rank - 1] ?? ""}`.trim()}>{entry.rank}</span>
      <span className="pseudo">
        {entry.pseudo}
        {mine && <small>toi</small>}
      </span>
      <span className="score">{`${entry.count} / ${total}`}</span>
    </li>
  );
}

/** Classement des votants, caché tant que personne n'a répondu. */
export function Leaderboard({ state }: { state: LeaderboardState | null }) {
  if (!state || state.top.length === 0) return null;
  const { top, me, totalPolls } = state;
  const isMe = (e: LeaderboardEntry): boolean => me !== null && e.rank === me.rank && e.pseudo === me.pseudo;
  const meInTop = top.some(isMe);
  return (
    <section className="card leaderboard">
      <h2>Classement</h2>
      <p className="muted">Qui a répondu au plus de sondages ?</p>
      <ol className="rank-list">
        {/* Clé par position : un pseudo libéré à la déconnexion peut revenir, ex æquo compris */}
        {top.map((e, i) => (
          <Row key={i} entry={e} total={totalPolls} mine={isMe(e)} />
        ))}
        {me && !meInTop && (
          <>
            <li className="rank-gap" aria-hidden="true">
              …
            </li>
            <Row entry={me} total={totalPolls} mine />
          </>
        )}
      </ol>
      {!me && <p className="hint">Réponds à un sondage pour entrer dans le classement.</p>}
    </section>
  );
}

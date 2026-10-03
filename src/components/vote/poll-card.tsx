"use client";

import { useState, type ReactNode } from "react";
import { Answers, Bars } from "@/components/results";
import { post } from "@/lib/client/api";
import { plural } from "@/lib/client/format";
import { MAX_ANSWER_LENGTH, type PublicPoll } from "@/lib/shared/types";

/** Écran d'attente du sondage en direct. hubBelow : des sondages du hub sont affichés en dessous. */
export function WaitingCard({ hubBelow }: { hubBelow: boolean }) {
  return (
    <div className={hubBelow ? "card waiting compact" : "card waiting"}>
      <div className="pulse" />
      <h2>En attente du prochain sondage</h2>
      <p className="muted">
        {hubBelow
          ? "La question de l'AG apparaîtra ici. En attendant, réponds aux sondages ci-dessous."
          : "Garde cette page ouverte : la question apparaîtra ici dès qu'elle sera lancée."}
      </p>
    </div>
  );
}

/**
 * Carte d'un sondage : celui lancé en direct (live) ou un sondage du hub. À afficher avec key={poll.id} :
 * la carte est gardée d'un rafraîchissement à l'autre pour ne pas effacer une réponse en cours de saisie.
 * startedAt : heure de départ de la requête qui a lu ce sondage.
 * staff : sondage réservé au staff, répondu depuis /staff avec le compte connecté.
 */
export function PollCard({
  poll,
  startedAt,
  live,
  onVoted,
  staff = false,
}: {
  poll: PublicPoll;
  startedAt: number;
  live: boolean;
  onVoted: () => void;
  staff?: boolean;
}) {
  /** Dernier vote envoyé et son heure : un état lu avant cette heure garde le vote local. */
  const [sent, setSent] = useState<{ value: string; at: number } | null>(null);
  const myVote = sent && startedAt < sent.at ? sent.value : poll.myVote;
  /** Statut pour lequel la carte a été construite */
  const [shownStatus, setShownStatus] = useState(poll.status);
  const [error, setError] = useState("");
  const [text, setText] = useState(myVote ?? "");
  // La carte n'est reconstruite que lorsque le statut change : erreur effacée, réponse libre reprise de mon vote
  if (shownStatus !== poll.status) {
    setShownStatus(poll.status);
    setError("");
    setText(myVote ?? "");
  }
  const open = poll.status === "open";

  /** at : heure du clic, prise dans le gestionnaire d'événement (pas pendant le rendu) */
  async function send(value: string, at: number): Promise<void> {
    if (!open) return;
    if (!value) {
      setError("Écris une réponse avant d'envoyer.");
      return;
    }
    setError("");
    const previous = sent;
    setSent({ value, at });
    try {
      await post(staff ? "/api/staff/vote" : "/api/vote", { pollId: poll.id, value });
      onVoted();
    } catch (err) {
      // Vote refusé : on revient au vote affiché avant l'envoi
      setSent(previous);
      setError((err as Error).message);
    }
  }

  let body: ReactNode;
  if (poll.kind === "choice") {
    body = (
      <div className="choices">
        {poll.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            className={`btn choice c${i % 4}${myVote === o.id ? " selected" : ""}`}
            disabled={!open}
            onClick={() => void send(o.id, Date.now())}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  } else if (open) {
    body = (
      <>
        <textarea
          rows={3}
          maxLength={MAX_ANSWER_LENGTH}
          placeholder="Ta réponse…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className={live ? "btn primary big" : "btn primary"} onClick={() => void send(text.trim(), Date.now())}>
          Envoyer
        </button>
      </>
    );
  } else {
    body = myVote ? <blockquote className="my-answer">{myVote}</blockquote> : <p className="muted">{"Tu n'as pas répondu."}</p>;
  }

  const until = live ? "jusqu'à la clôture" : "quand tu veux";
  let hint: string;
  if (error) hint = error;
  else if (!open) hint = "Le vote est terminé.";
  else if (poll.kind === "text") hint = myVote ? `Réponse envoyée. Tu peux la modifier ${until}.` : "Écris ta réponse puis envoie-la.";
  else hint = myVote ? `Vote enregistré. Tu peux changer d'avis ${until}.` : "Choisis une réponse.";

  const Question = live ? "h1" : "h3";
  const r = poll.results;
  return (
    <article className={live ? "card poll-card" : "card poll-card hub-card"}>
      {live ? (
        <p className={open ? "eyebrow live" : "eyebrow"}>{open ? "Sondage en cours" : "Sondage clôturé"}</p>
      ) : (
        <p className="eyebrow">{staff ? "Réservé au staff" : "En libre accès"}</p>
      )}
      <Question className="question">{poll.question}</Question>
      {poll.reward && (
        <p className={myVote ? "reward-hint won" : "reward-hint"}>
          {myVote
            ? `Récompense débloquée : ${poll.reward}. Ton QR code est dans « Mes récompenses ».`
            : `Réponds pour gagner : ${poll.reward}`}
        </p>
      )}
      <div className="vote-body">{body}</div>
      <p className={error ? "hint error" : "hint"}>{hint}</p>
      <div className="results">
        {r && (
          <>
            <h3>{`Résultats · ${plural(r.total, "réponse")}`}</h3>
            {poll.kind === "choice" ? <Bars options={poll.options} results={r} mine={myVote} /> : <Answers list={r.answers} />}
          </>
        )}
      </div>
    </article>
  );
}

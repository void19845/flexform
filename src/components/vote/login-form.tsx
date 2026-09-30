"use client";

import { useRef, useState, type FormEvent } from "react";
import { post } from "@/lib/client/api";
import { PROFILE_MAX_LENGTH } from "@/lib/shared/types";

/** Connexion par pseudo, avec les consentements RGPD. message : affiché à l'ouverture (session terminée...). */
export function LoginForm({ message, onJoined }: { message: string; onJoined: () => void }) {
  const [error, setError] = useState(message);
  const [pending, setPending] = useState(false);
  const pseudo = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      await post("/api/login", {
        prenom: data.get("prenom"),
        nom: data.get("nom"),
        formation: data.get("formation"),
        pseudo: data.get("pseudo"),
        privacy: data.has("privacy"),
        marketing: data.has("marketing"),
        sponsors: data.has("sponsors"),
      });
      onJoined();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
      pseudo.current?.focus();
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <p className="eyebrow">AG · BDE Montreuil</p>
      <h1>{"Sondages de l'AG"}</h1>
      <p className="muted">Présente-toi pour participer aux votes. Ton nom et ta formation ne sont visibles que par le BDE.</p>
      <div className="field-row">
        <label className="field">
          <span>Prénom</span>
          <input
            type="text"
            name="prenom"
            placeholder="Ton prénom"
            maxLength={PROFILE_MAX_LENGTH.prenom}
            autoComplete="given-name"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Nom</span>
          <input type="text" name="nom" placeholder="Ton nom" maxLength={PROFILE_MAX_LENGTH.nom} autoComplete="family-name" required />
        </label>
      </div>
      <label className="field">
        <span>Formation</span>
        <input
          type="text"
          name="formation"
          placeholder="Ex. : BUT Info 2e année"
          maxLength={PROFILE_MAX_LENGTH.formation}
          autoComplete="off"
          required
        />
      </label>
      <label className="field">
        <span>Pseudo</span>
        <input
          ref={pseudo}
          type="text"
          name="pseudo"
          placeholder="Affiché pendant les votes et dans le classement"
          maxLength={24}
          autoComplete="nickname"
          required
        />
      </label>
      {/* Consentements RGPD : le premier est obligatoire, les deux autres sont facultatifs et jamais pré-cochés */}
      <fieldset className="consents">
        <legend>Tes données</legend>
        <label className="check">
          <input type="checkbox" name="privacy" required />
          <span>
            {"J'ai lu la "}
            <a href="/confidentialite" target="_blank" rel="noopener">
              politique de confidentialité
            </a>
            {" et j'accepte que mes réponses soient utilisées pour les sondages du BDE. "}
            <em>(obligatoire)</em>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" name="marketing" />
          <span>
            {"J'accepte que le BDE utilise mes réponses, mon nom et ma formation pour sa communication et ses actions marketing. "}
            <em>(facultatif)</em>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" name="sponsors" />
          <span>
            {"J'accepte que le BDE transmette mes réponses, mon nom et ma formation à ses partenaires et sponsors. "}
            <em>(facultatif)</em>
          </span>
        </label>
        <p className="muted small">
          Les cases facultatives ne changent rien à ta participation. Tu peux modifier tes choix ou supprimer tes données à tout moment
          dans « Mes données ».
        </p>
      </fieldset>
      <p className="error" role="alert">
        {error}
      </p>
      <button type="submit" className="btn primary big" disabled={pending}>
        Rejoindre
      </button>
    </form>
  );
}

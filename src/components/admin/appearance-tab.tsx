"use client";

import { useEffect, useState } from "react";
import { api, post } from "@/lib/client/api";
import type { ThemeState } from "@/lib/shared/types";

/** Contenu de l'onglet : null pendant le chargement, puis l'état lu ou l'erreur de lecture. */
type Loaded = { theme: ThemeState } | { error: string } | null;

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="swatch">
      <span className="swatch-chip" style={{ background: color }} />
      <span>
        <strong>{label}</strong>
        <small>{color}</small>
      </span>
    </div>
  );
}

function ThemeCard({ state: s, onChange }: { state: ThemeState; onChange: (state: ThemeState) => void }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");

  async function toggle(): Promise<void> {
    setPending(true);
    try {
      onChange(await post<ThemeState>("/api/admin/theme", { linked: !s.linked }));
      setNote("");
    } catch (err) {
      setNote((err as Error).message);
    }
    setPending(false);
  }

  const status = !s.configured
    ? "Flexfolio n'est pas configuré : le site utilise le thème du BDE."
    : s.linked
      ? "Le site utilise la palette et les polices de Flexfolio."
      : "Le site est délié : il utilise le thème du BDE, quels que soient les réglages de Flexfolio.";

  return (
    <div className="card">
      <h2>Apparence</h2>
      <p>{status}</p>
      {s.error ? <p className="error">{`Lecture de Flexfolio impossible : ${s.error}.${s.theme ? " Dernière palette connue affichée." : ""}`}</p> : null}
      {!s.configured ? (
        <p className="muted small">
          {
            "Pour lier le site, définis FLEXFOLIO_SUPABASE_URL et FLEXFOLIO_SUPABASE_ANON_KEY (les mêmes valeurs que NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY du portfolio) dans les variables d'environnement, puis redéploie."
          }
        </p>
      ) : null}
      {s.theme ? (
        <div className={s.linked ? "theme-preview" : "theme-preview off"}>
          <p className="eyebrow">Réglages de Flexfolio</p>
          <div className="swatches">
            <Swatch label="Fond" color={s.theme.bg} />
            <Swatch label="Texte" color={s.theme.ink} />
            <Swatch label="Blocs foncés" color={s.theme.card} />
            <Swatch label="Accent" color={s.theme.accent} />
          </div>
          <p className="muted small">{`Titres : ${s.theme.fontTitle ?? "police du BDE"} · Texte : ${s.theme.fontBody ?? "police du BDE"}`}</p>
        </div>
      ) : null}
      <div className="actions">
        <button type="button" className={s.linked ? "btn ghost" : "btn primary"} disabled={!s.configured || pending} onClick={toggle}>
          {s.linked ? "Délier de Flexfolio" : "Lier à Flexfolio"}
        </button>
      </div>
      <p className="hint">{note}</p>
      <p className="muted small">
        {"Les changements (ici ou dans l'admin de Flexfolio) apparaissent chez les visiteurs en une minute environ. Recharge la page pour voir le résultat."}
      </p>
    </div>
  );
}

/** Onglet Apparence : lier le site à la palette et aux polices de Flexfolio, ou le délier. */
export function AppearanceTab({ active }: { active: boolean }) {
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [shown, setShown] = useState(active);
  // Relu à chaque ouverture de l'onglet : « Chargement… » d'abord
  if (active !== shown) {
    setShown(active);
    if (active) setLoaded(null);
  }

  useEffect(() => {
    if (!active) return;
    let current = true;
    api<ThemeState>("/api/admin/theme")
      .then((theme) => {
        if (current) setLoaded({ theme });
      })
      .catch((err: unknown) => {
        if (current) setLoaded({ error: (err as Error).message });
      });
    return () => {
      current = false;
    };
  }, [active]);

  return (
    <section className="appearance" hidden={!active}>
      {loaded === null ? (
        <div className="card">
          <p className="muted">Chargement…</p>
        </div>
      ) : "error" in loaded ? (
        <div className="card">
          <p className="error">{loaded.error}</p>
        </div>
      ) : (
        <ThemeCard state={loaded.theme} onChange={(theme) => setLoaded({ theme })} />
      )}
    </section>
  );
}

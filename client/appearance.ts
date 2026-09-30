import type { ThemeState } from "../shared/types.js";
import { button, h } from "./dom.js";

export interface AppearanceView {
  el: HTMLElement;
  show(): void;
  hide(): void;
}

/** Onglet Apparence : lier le site à la palette et aux polices de Flexfolio, ou le délier. */
export function appearanceView(request: (method: "GET" | "POST", body?: unknown) => Promise<ThemeState>): AppearanceView {
  const el = h("section", { class: "appearance", hidden: true });

  function swatch(label: string, color: string): HTMLElement {
    const chip = h("span", { class: "swatch-chip" });
    chip.style.background = color;
    return h("div", { class: "swatch" }, chip, h("span", {}, h("strong", {}, label), h("small", {}, color)));
  }

  function render(s: ThemeState): void {
    const toggle = button(s.linked ? "Délier de Flexfolio" : "Lier à Flexfolio", async () => {
      toggle.disabled = true;
      try {
        render(await request("POST", { linked: !s.linked }));
      } catch (err) {
        note.textContent = (err as Error).message;
        toggle.disabled = false;
      }
    }, s.linked ? "ghost" : "primary");
    toggle.disabled = !s.configured;
    const note = h("p", { class: "hint" });

    const status = !s.configured
      ? "Flexfolio n'est pas configuré : le site utilise le thème du BDE."
      : s.linked
        ? "Le site utilise la palette et les polices de Flexfolio."
        : "Le site est délié : il utilise le thème du BDE, quels que soient les réglages de Flexfolio.";

    el.replaceChildren(
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Apparence"),
        h("p", {}, status),
        s.error ? h("p", { class: "error" }, `Lecture de Flexfolio impossible : ${s.error}.${s.theme ? " Dernière palette connue affichée." : ""}`) : "",
        !s.configured
          ? h(
              "p",
              { class: "muted small" },
              "Pour lier le site, définis FLEXFOLIO_SUPABASE_URL et FLEXFOLIO_SUPABASE_ANON_KEY (les mêmes valeurs que NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY du portfolio) dans les variables d'environnement, puis redéploie.",
            )
          : "",
        s.theme
          ? h(
              "div",
              { class: s.linked ? "theme-preview" : "theme-preview off" },
              h("p", { class: "eyebrow" }, "Réglages de Flexfolio"),
              h(
                "div",
                { class: "swatches" },
                swatch("Fond", s.theme.bg),
                swatch("Texte", s.theme.ink),
                swatch("Blocs foncés", s.theme.card),
                swatch("Accent", s.theme.accent),
              ),
              h("p", { class: "muted small" }, `Titres : ${s.theme.fontTitle ?? "police du BDE"} · Texte : ${s.theme.fontBody ?? "police du BDE"}`),
            )
          : "",
        h("div", { class: "actions" }, toggle),
        note,
        h("p", { class: "muted small" }, "Les changements (ici ou dans l'admin de Flexfolio) apparaissent chez les visiteurs en une minute environ. Recharge la page pour voir le résultat."),
      ),
    );
  }

  return {
    el,
    show(): void {
      el.hidden = false;
      el.replaceChildren(h("div", { class: "card" }, h("p", { class: "muted" }, "Chargement…")));
      request("GET")
        .then(render)
        .catch((err: unknown) => el.replaceChildren(h("div", { class: "card" }, h("p", { class: "error" }, (err as Error).message))));
    },
    hide(): void {
      el.hidden = true;
    },
  };
}

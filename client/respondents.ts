import type { Respondent, RespondentsState } from "../shared/types.js";
import { button, h, plural, startPolling, type Poller } from "./dom.js";

type PollInfo = RespondentsState["polls"][number];

/** Valeur du filtre pour les sondages sans catégorie */
const NO_CATEGORY = "__sans__";

/** Une ligne après filtrage : les réponses retenues selon le jour, la catégorie et le sondage choisis. */
interface Row {
  r: Respondent;
  /** Sondages répondus, dans l'ordre de la liste */
  kept: PollInfo[];
  /** Numéros (à partir de 1) des sondages répondus */
  polls: number[];
  first: number | null;
  last: number | null;
}

/** Jour local au format du champ date (AAAA-MM-JJ). */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Minuscules sans accents, pour une recherche tolérante. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

function fullName(r: Respondent): string {
  return [r.prenom, r.nom].filter(Boolean).join(" ") || "—";
}

// --- Export CSV -----------------------------------------------------------

/** Cellule CSV entre guillemets. Un début en = + - @ est neutralisé pour qu'Excel n'exécute pas de formule. */
function cell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Point-virgule et BOM UTF-8 : Excel en français ouvre le fichier directement avec les accents. */
function csv(header: string[], lines: (string | number)[][]): string {
  return "﻿" + [header, ...lines].map((line) => line.map(cell).join(";")).join("\r\n");
}

const CONSENT_HEADER = ["Accord communication", "Accord sponsors", "Consentement mis à jour le"];

/** Consentements RGPD de la personne, pour savoir ce qu'on a le droit de faire de la ligne. */
function consentCells(r: Respondent): string[] {
  const c = r.consent;
  return [c?.marketing ? "Oui" : "Non", c?.sponsors ? "Oui" : "Non", c ? dateTimeFmt.format(c.updatedAt) : ""];
}

/** Une ligne par personne. */
function respondentsCsv(rows: Row[]): string {
  return csv(
    ["Nom", "Prénom", "Formation", "Pseudo", "Nombre de réponses", "Sondages", "Première réponse", "Dernière réponse", ...CONSENT_HEADER],
    rows.map(({ r, polls, first, last }) => [
      r.nom,
      r.prenom,
      r.formation,
      r.pseudo,
      polls.length,
      polls.join(", "),
      first ? dateTimeFmt.format(first) : "",
      last ? dateTimeFmt.format(last) : "",
      ...consentCells(r),
    ]),
  );
}

/** Texte de la réponse : libellé du choix, ou réponse libre telle quelle. */
function answerLabel(poll: PollInfo, value: string | undefined): string {
  if (value === undefined) return "";
  return poll.kind === "choice" ? (poll.options.find((o) => o.id === value)?.label ?? value) : value;
}

/** Une ligne par réponse, avec son contenu : pour exporter un sondage ou une catégorie. */
function answersCsv(rows: Row[], allPolls: PollInfo[]): string {
  const index = new Map(allPolls.map((p, i) => [p.id, i + 1]));
  return csv(
    ["Nom", "Prénom", "Formation", "Pseudo", "Catégorie", "N°", "Sondage", "Réponse", "Date", ...CONSENT_HEADER],
    rows.flatMap(({ r, kept }) =>
      kept.map((p) => {
        const at = r.answers[p.id];
        return [r.nom, r.prenom, r.formation, r.pseudo, p.category ?? "", index.get(p.id) ?? "", p.question, answerLabel(p, r.values[p.id]), at ? dateTimeFmt.format(at) : "", ...consentCells(r)];
      }),
    ),
  );
}

/** Morceau de nom de fichier sans accents ni espaces. */
function slug(text: string): string {
  return fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
}

function download(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Vue ------------------------------------------------------------------

export interface RespondentsView {
  el: HTMLElement;
  show(): void;
  hide(): void;
}

/**
 * Onglet Répondants : qui a répondu, filtré par jour (aujourd'hui par défaut), par sondage
 * et par recherche, avec répartition par formation et export CSV de la liste affichée.
 */
export function respondentsView(
  fetchState: () => Promise<RespondentsState>,
  onUnauthorized: () => void,
): RespondentsView {
  let state: RespondentsState | null = null;
  let poller: Poller | null = null;
  let rows: Row[] = [];

  const day = h("input", { type: "date", "aria-label": "Jour" });
  day.value = dayKey(Date.now());
  const category = h("select", { "aria-label": "Catégorie" });
  const poll = h("select", { "aria-label": "Sondage" });
  const search = h("input", { type: "search", placeholder: "Nom, prénom, pseudo ou formation…", "aria-label": "Rechercher" });
  // Avant d'envoyer des données à un sponsor ou de les utiliser en communication, filtrer sur l'accord correspondant
  const consent = h(
    "select",
    { "aria-label": "Consentement" },
    h("option", { value: "" }, "Tout le monde (usage interne)"),
    h("option", { value: "marketing" }, "Accord communication"),
    h("option", { value: "sponsors" }, "Accord sponsors"),
  );

  /** Nom de fichier qui reprend les filtres : sondage ou catégorie, consentement, puis jour. */
  function fileName(kind: string): string {
    const index = state?.polls.findIndex((p) => p.id === poll.value) ?? -1;
    const scope = index >= 0 ? `sondage-${index + 1}` : category.value ? slug(category.value) : "tous-les-sondages";
    const who = consent.value ? `-accord-${consent.value}` : "";
    return `${kind}-${scope}${who}-${day.value || "tous-les-jours"}.csv`;
  }
  const exportPeople = button("Répondants (CSV)", () => download(fileName("repondants"), respondentsCsv(rows)), "primary");
  const exportAnswers = button("Réponses (CSV)", () => {
    if (state) download(fileName("reponses"), answersCsv(rows, state.polls));
  }, "primary");
  exportPeople.title = "Une ligne par personne";
  exportAnswers.title = "Une ligne par réponse, avec son contenu";

  const today = button("Aujourd'hui", () => {
    day.value = dayKey(Date.now());
    render();
  }, "ghost small");
  const allDays = button("Tous les jours", () => {
    day.value = "";
    render();
  }, "ghost small");

  const stats = h("div", { class: "stats" });
  const formations = h("div", { class: "card" });
  const ranking = h("div", { class: "card leaderboard" });
  const table = h("div", { class: "card table-card" });
  const status = h("p", { class: "status", hidden: true }, "Connexion perdue, reconnexion…");

  for (const input of [day, poll, consent]) input.addEventListener("change", render);
  category.addEventListener("change", () => {
    if (state) renderSelects(state);
    render();
  });
  search.addEventListener("input", render);

  const el = h(
    "section",
    { class: "respondents" },
    h(
      "div",
      { class: "card filters" },
      h("div", { class: "field" }, h("span", {}, "Jour"), day, h("div", { class: "quick-days" }, today, allDays)),
      h("label", { class: "field" }, h("span", {}, "Catégorie"), category),
      h("label", { class: "field" }, h("span", {}, "Sondage"), poll),
      h("label", { class: "field" }, h("span", {}, "Consentement"), consent),
      h("label", { class: "field grow" }, h("span", {}, "Recherche"), search),
    ),
    status,
    stats,
    h("div", { class: "resp-layout" }, table, h("div", { class: "resp-side" }, ranking, formations)),
  );

  /** Remplit les listes Catégorie et Sondage en gardant le choix en cours. */
  function renderSelects(s: RespondentsState): void {
    const cats = [...new Set(s.polls.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort();
    const selectedCat = category.value;
    category.replaceChildren(
      h("option", { value: "" }, "Toutes les catégories"),
      ...cats.map((c) => h("option", { value: c }, c)),
      s.polls.some((p) => !p.category) ? h("option", { value: NO_CATEGORY }, "Sans catégorie") : "",
    );
    category.value = cats.includes(selectedCat) || selectedCat === NO_CATEGORY ? selectedCat : "";

    const selected = poll.value;
    const visible = s.polls.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => inCategory(p));
    poll.replaceChildren(
      h("option", { value: "" }, category.value ? "Tous les sondages de la catégorie" : "Tous les sondages"),
      ...visible.map(({ p, n }) => h("option", { value: p.id }, `${n}. ${p.question}`)),
    );
    poll.value = visible.some(({ p }) => p.id === selected) ? selected : "";
  }

  function inCategory(p: PollInfo): boolean {
    if (!category.value) return true;
    return category.value === NO_CATEGORY ? !p.category : p.category === category.value;
  }

  function computeRows(s: RespondentsState): Row[] {
    const query = fold(search.value);
    const polls = s.polls.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => inCategory(p) && (!poll.value || p.id === poll.value));
    const result: Row[] = [];
    for (const r of s.respondents) {
      if (query && !fold(`${r.prenom} ${r.nom} ${r.pseudo} ${r.formation}`).includes(query)) continue;
      if (consent.value === "marketing" && !r.consent?.marketing) continue;
      if (consent.value === "sponsors" && !r.consent?.sponsors) continue;
      const kept = polls.filter(({ p }) => {
        if (!(p.id in r.answers)) return false;
        const at = r.answers[p.id]!;
        return !day.value || (at !== null && dayKey(at) === day.value);
      });
      if (!kept.length) continue;
      const times = kept.map(({ p }) => r.answers[p.id]).filter((at): at is number => typeof at === "number");
      result.push({
        r,
        kept: kept.map(({ p }) => p),
        polls: kept.map(({ n }) => n),
        first: times.length ? Math.min(...times) : null,
        last: times.length ? Math.max(...times) : null,
      });
    }
    return result.sort((a, b) => fold(`${a.r.nom} ${a.r.prenom}`).localeCompare(fold(`${b.r.nom} ${b.r.prenom}`)));
  }

  /** Les personnes qui ont répondu au plus de sondages parmi ceux filtrés. Ex æquo : même rang. */
  function renderRanking(): void {
    const sorted = [...rows].sort((a, b) => b.polls.length - a.polls.length || (a.last ?? Number.MAX_SAFE_INTEGER) - (b.last ?? Number.MAX_SAFE_INTEGER));
    const top: { rank: number; row: Row }[] = [];
    sorted.slice(0, 10).forEach((row, i) => {
      const prev = top[i - 1];
      top.push({ rank: prev && prev.row.polls.length === row.polls.length ? prev.rank : i + 1, row });
    });
    ranking.replaceChildren(
      h("h2", {}, "Classement"),
      top.length
        ? h(
            "ol",
            { class: "rank-list" },
            ...top.map(({ rank, row }) =>
              h(
                "li",
                {},
                h("span", { class: "rank" }, String(rank)),
                h("span", { class: "pseudo" }, fullName(row.r), h("small", {}, [row.r.pseudo, row.r.formation].filter(Boolean).join(" · "))),
                h("span", { class: "score" }, String(row.polls.length)),
              ),
            ),
          )
        : h("p", { class: "muted" }, "Aucune donnée."),
    );
  }

  function render(): void {
    if (!state) return;
    rows = computeRows(state);
    const answers = rows.reduce((n, row) => n + row.polls.length, 0);

    // Formations regroupées sans tenir compte des majuscules ni des accents
    const groups = new Map<string, { label: string; n: number }>();
    for (const { r } of rows) {
      const key = fold(r.formation) || "?";
      const g = groups.get(key) ?? { label: r.formation || "Non renseignée", n: 0 };
      g.n++;
      groups.set(key, g);
    }
    const sortedGroups = [...groups.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

    const stat = (value: number, label: string): HTMLElement =>
      h("div", { class: "card stat" }, h("strong", {}, String(value)), h("span", { class: "muted" }, label));
    stats.replaceChildren(
      stat(rows.length, rows.length > 1 ? "répondants" : "répondant"),
      stat(answers, answers > 1 ? "réponses" : "réponse"),
      stat(groups.size, groups.size > 1 ? "formations" : "formation"),
    );

    const max = sortedGroups[0]?.n ?? 1;
    formations.replaceChildren(
      h("h2", {}, "Par formation"),
      sortedGroups.length
        ? h(
            "div",
            { class: "bars" },
            ...sortedGroups.map((g) => {
              const fill = h("div", { class: "bar-fill c0" });
              fill.style.width = `${Math.round((g.n / max) * 100)}%`;
              return h(
                "div",
                { class: "bar" },
                h("div", { class: "bar-label" }, h("span", {}, g.label), h("span", { class: "bar-num" }, String(g.n))),
                h("div", { class: "bar-track" }, fill),
              );
            }),
          )
        : h("p", { class: "muted" }, "Aucune donnée."),
    );

    renderRanking();
    exportPeople.disabled = exportAnswers.disabled = !rows.length;
    exportPeople.textContent = `Répondants (CSV · ${rows.length})`;
    exportAnswers.textContent = `Réponses (CSV · ${answers})`;
    table.replaceChildren(
      h(
        "div",
        { class: "table-head" },
        h("h2", {}, plural(rows.length, "répondant")),
        h("div", { class: "export" }, exportPeople, exportAnswers),
      ),
      rows.length
        ? h(
            "div",
            { class: "table-scroll" },
            h(
              "table",
              {},
              h(
                "thead",
                {},
                h("tr", {}, ...["Nom", "Formation", "Pseudo", "Sondages", day.value ? "Heure" : "Dernière réponse"].map((t) => h("th", {}, t))),
              ),
              h(
                "tbody",
                {},
                ...rows.map(({ r, polls, last }) =>
                  h(
                    "tr",
                    {},
                    h("td", { class: "strong" }, r.nom ? `${r.nom.toUpperCase()} ${r.prenom}` : fullName(r)),
                    h("td", {}, r.formation || "—"),
                    h("td", { class: "muted" }, r.pseudo),
                    h("td", {}, polls.join(", ")),
                    h("td", { class: "num-cell" }, last ? (day.value ? timeFmt : dateTimeFmt).format(last) : "—"),
                  ),
                ),
              ),
            ),
          )
        : h("p", { class: "muted" }, search.value ? "Aucun résultat pour cette recherche." : "Personne n'a répondu ce jour-là."),
    );
  }

  return {
    el,
    show(): void {
      el.hidden = false;
      poller ??= startPolling(fetchState, 5000, {
        onState: (s) => {
          state = s;
          renderSelects(s);
          render();
        },
        onStatus: (connected) => {
          status.hidden = connected;
        },
        onUnauthorized,
      });
      poller.refresh();
    },
    hide(): void {
      el.hidden = true;
      poller?.stop();
      poller = null;
    },
  };
}

import { dateTimeFmt, fold } from "@/lib/client/format";
import type { Respondent, RespondentsState } from "@/lib/shared/types";

export type PollInfo = RespondentsState["polls"][number];

/** Valeurs des filtres de l'onglet Répondants. */
export interface Filters {
  /** Jour au format du champ date (AAAA-MM-JJ), vide pour tous les jours */
  day: string;
  category: string;
  poll: string;
  consent: string;
  search: string;
}

/** Une ligne après filtrage : les réponses retenues selon le jour, la catégorie et le sondage choisis. */
export interface Row {
  /** Clé de liste stable (le pseudo seul peut revenir après une déconnexion) */
  key: string;
  r: Respondent;
  /** Sondages répondus, dans l'ordre de la liste */
  kept: PollInfo[];
  /** Numéros (à partir de 1) des sondages répondus */
  polls: number[];
  first: number | null;
  last: number | null;
}

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
export function respondentsCsv(rows: Row[]): string {
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
export function answersCsv(rows: Row[], allPolls: PollInfo[]): string {
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

/** Nom de fichier qui reprend les filtres : sondage ou catégorie, consentement, puis jour. */
export function fileName(kind: string, polls: PollInfo[], f: Filters): string {
  const index = polls.findIndex((p) => p.id === f.poll);
  const scope = index >= 0 ? `sondage-${index + 1}` : f.category ? slug(f.category) : "tous-les-sondages";
  const who = f.consent ? `-accord-${f.consent}` : "";
  return `${kind}-${scope}${who}-${f.day || "tous-les-jours"}.csv`;
}

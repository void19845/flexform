import {
  MAX_ANSWER_LENGTH,
  PROFILE_MAX_LENGTH,
  type LeaderboardEntry,
  type LeaderboardState,
  type MyData,
  type MyReward,
  type PublicPoll,
  type PublicState,
} from "../shared/types.js";
import { ACHIEVEMENTS, type AchievementState } from "../shared/achievements.js";
import { answers, api, bars, button, h, plural, startPolling, type Poller } from "./dom.js";

const app = document.getElementById("app")!;
let poller: Poller | null = null;
/** Classement, rafraîchi moins souvent que le sondage */
let rankPoller: Poller | null = null;

async function boot(): Promise<void> {
  const { pseudo } = await api<{ pseudo: string | null }>("/api/me");
  if (pseudo) showPoll();
  else showLogin();
}

// --- Connexion par pseudo -------------------------------------------------

function showLogin(message = ""): void {
  poller?.stop();
  rankPoller?.stop();
  poller = rankPoller = null;
  const text = (name: string, placeholder: string, maxlength: number, autocomplete: string): HTMLInputElement =>
    h("input", { type: "text", name, placeholder, maxlength: String(maxlength), autocomplete, required: true });
  const prenom = text("prenom", "Ton prénom", PROFILE_MAX_LENGTH.prenom, "given-name");
  const nom = text("nom", "Ton nom", PROFILE_MAX_LENGTH.nom, "family-name");
  const formation = text("formation", "Ex. : BUT Info 2e année", PROFILE_MAX_LENGTH.formation, "off");
  const pseudo = text("pseudo", "Affiché pendant les votes et dans le classement", 24, "nickname");
  // Consentements RGPD : le premier est obligatoire, les deux autres sont facultatifs et jamais pré-cochés
  const privacy = h("input", { type: "checkbox", name: "privacy", required: true });
  const marketing = h("input", { type: "checkbox", name: "marketing" });
  const sponsors = h("input", { type: "checkbox", name: "sponsors" });
  const policyLink = h("a", { href: "/confidentialite", target: "_blank", rel: "noopener" }, "politique de confidentialité");
  const error = h("p", { class: "error", role: "alert" }, message);
  const submit = h("button", { type: "submit", class: "btn primary big" }, "Rejoindre");
  const form = h(
    "form",
    { class: "card login" },
    h("p", { class: "eyebrow" }, "AG · BDE Montreuil"),
    h("h1", {}, "Sondages de l'AG"),
    h("p", { class: "muted" }, "Présente-toi pour participer aux votes. Ton nom et ta formation ne sont visibles que par le BDE."),
    h(
      "div",
      { class: "field-row" },
      h("label", { class: "field" }, h("span", {}, "Prénom"), prenom),
      h("label", { class: "field" }, h("span", {}, "Nom"), nom),
    ),
    h("label", { class: "field" }, h("span", {}, "Formation"), formation),
    h("label", { class: "field" }, h("span", {}, "Pseudo"), pseudo),
    h(
      "fieldset",
      { class: "consents" },
      h("legend", {}, "Tes données"),
      h(
        "label",
        { class: "check" },
        privacy,
        h("span", {}, "J'ai lu la ", policyLink, " et j'accepte que mes réponses soient utilisées pour les sondages du BDE. ", h("em", {}, "(obligatoire)")),
      ),
      h(
        "label",
        { class: "check" },
        marketing,
        h("span", {}, "J'accepte que le BDE utilise mes réponses, mon nom et ma formation pour sa communication et ses actions marketing. ", h("em", {}, "(facultatif)")),
      ),
      h(
        "label",
        { class: "check" },
        sponsors,
        h("span", {}, "J'accepte que le BDE transmette mes réponses, mon nom et ma formation à ses partenaires et sponsors. ", h("em", {}, "(facultatif)")),
      ),
      h("p", { class: "muted small" }, "Les cases facultatives ne changent rien à ta participation. Tu peux modifier tes choix ou supprimer tes données à tout moment dans « Mes données »."),
    ),
    error,
    submit,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    error.textContent = "";
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          prenom: prenom.value,
          nom: nom.value,
          formation: formation.value,
          pseudo: pseudo.value,
          privacy: privacy.checked,
          marketing: marketing.checked,
          sponsors: sponsors.checked,
        }),
      });
      showPoll();
    } catch (err) {
      error.textContent = (err as Error).message;
      submit.disabled = false;
      pseudo.focus();
    }
  });
  app.replaceChildren(form);
  prenom.focus();
}

// --- Page de vote ---------------------------------------------------------

function showPoll(): void {
  const slot = h("section", { class: "poll-slot" });
  const hubList = h("div", { class: "hub-list" });
  const hubSection = h(
    "section",
    { class: "hub", hidden: true },
    h("h2", { class: "hub-title" }, "Sondages en libre accès"),
    h("p", { class: "muted" }, "Réponds quand tu veux, ils restent ouverts."),
    hubList,
  );
  const who = h("strong", {});
  const participants = h("span", { class: "muted" });
  const status = h("p", { class: "status", hidden: true }, "Connexion perdue, reconnexion…");
  const logout = button("Se déconnecter", () => {
    void api("/api/logout", { method: "POST" })
      .catch(() => undefined)
      .then(() => showLogin());
  }, "ghost small");
  const dataPanel = h("section", { class: "card my-data", hidden: true });
  const dataBtn = button("Mes données", () => {
    if (dataPanel.hidden) void openMyData(dataPanel);
    else dataPanel.hidden = true;
  }, "ghost small");

  const rankEl = h("section", { class: "card leaderboard", hidden: true });
  const rewardsEl = h("section", { class: "rewards", hidden: true });
  const renderRewards = rewardsRenderer(rewardsEl);
  const achievementsEl = h("section", { class: "card achievements" });
  const toast = h("p", { class: "toast achievement-toast", role: "status", hidden: true });
  const renderAchievements = achievementsRenderer(achievementsEl, toast);
  app.replaceChildren(
    slot,
    status,
    rewardsEl,
    hubSection,
    rankEl,
    achievementsEl,
    h("footer", { class: "me" }, h("div", {}, who, participants), h("div", { class: "me-actions" }, dataBtn, logout)),
    dataPanel,
    toast,
  );

  rankPoller = startPolling(() => api<LeaderboardState>("/api/leaderboard"), 10000, {
    onState: (s) => {
      renderLeaderboard(rankEl, s);
      renderAchievements(s.achievements, s.pseudo);
    },
  });
  // Après un vote, le sondage et le classement sont rafraîchis tout de suite
  const refresh = (): void => {
    poller?.refresh();
    rankPoller?.refresh();
  };
  const live = new PollView(slot, true, refresh);
  const hub = new HubView(hubList, refresh);
  poller = startPolling(() => api<PublicState>("/api/state"), 2000, {
    onState: (s, startedAt) => {
      who.textContent = s.pseudo;
      participants.textContent = ` · ${plural(s.participants, "participant")}`;
      live.update(s.poll, startedAt, s.hub.length > 0);
      hub.update(s.hub, startedAt);
      hubSection.hidden = s.hub.length === 0;
      renderRewards(s.rewards);
    },
    onStatus: (connected) => {
      status.hidden = connected;
    },
    // Session supprimée (déconnecté·e par l'admin ou cookie expiré)
    onUnauthorized: () => showLogin("Ta session a pris fin, reconnecte-toi."),
  });
}

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Code lisible à l'oral ou à taper : ABCD-EFGH-JKLM */
function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/**
 * Mes récompenses : un QR code à usage unique par récompense gagnée, à montrer au staff.
 * Reconstruit seulement quand une récompense apparaît ou est remise, pour ne pas recharger les images.
 */
function rewardsRenderer(root: HTMLElement): (rewards: MyReward[]) => void {
  let signature = "";
  return (rewards) => {
    const next = rewards.map((r) => `${r.code}:${r.redeemedAt ?? ""}`).join("|");
    if (next === signature) return;
    signature = next;
    root.hidden = rewards.length === 0;
    // Les récompenses à récupérer d'abord
    const sorted = [...rewards].sort((a, b) => Number(a.redeemedAt !== null) - Number(b.redeemedAt !== null));
    root.replaceChildren(
      h("h2", { class: "hub-title" }, "Mes récompenses"),
      ...sorted.map((r) =>
        r.redeemedAt === null
          ? h(
              "article",
              { class: "card reward-card" },
              h("p", { class: "eyebrow" }, "À récupérer"),
              h("h3", { class: "reward-text" }, r.text),
              h("img", { class: "reward-qr", src: `/api/reward-qr?code=${encodeURIComponent(r.code)}`, alt: `QR code de la récompense : ${r.text}`, width: "220", height: "220" }),
              h("p", { class: "reward-code" }, formatCode(r.code)),
              h("p", { class: "muted small" }, `Montre ce QR code à un membre du staff. Il ne fonctionne qu'une fois. Gagné avec « ${r.question} »`),
            )
          : h(
              "article",
              { class: "card reward-card used" },
              h("p", { class: "eyebrow" }, "Récupérée"),
              h("h3", { class: "reward-text" }, r.text),
              h("p", { class: "muted small" }, `Remise le ${dateTimeFmt.format(r.redeemedAt)}`),
            ),
      ),
    );
  };
}

// --- Mes données (RGPD) ---------------------------------------------------

/** Consultation, modification des consentements, téléchargement et suppression des données. */
async function openMyData(panel: HTMLElement): Promise<void> {
  panel.hidden = false;
  panel.replaceChildren(h("p", { class: "muted" }, "Chargement…"));
  let data: MyData;
  try {
    data = await api<MyData>("/api/privacy");
  } catch (err) {
    panel.replaceChildren(h("p", { class: "error" }, (err as Error).message));
    return;
  }
  const { profile } = data;
  const marketing = h("input", { type: "checkbox" });
  const sponsors = h("input", { type: "checkbox" });
  marketing.checked = profile.consent?.marketing ?? false;
  sponsors.checked = profile.consent?.sponsors ?? false;
  const saved = h("p", { class: "hint", role: "status" });

  const save = async (): Promise<void> => {
    saved.textContent = "Enregistrement…";
    try {
      await api("/api/privacy", { method: "POST", body: JSON.stringify({ marketing: marketing.checked, sponsors: sponsors.checked }) });
      saved.textContent = "Choix enregistrés.";
    } catch (err) {
      saved.textContent = (err as Error).message;
    }
  };
  marketing.addEventListener("change", () => void save());
  sponsors.addEventListener("change", () => void save());

  const download = button("Télécharger mes données", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = h("a", { href: url, download: `mes-donnees-${profile.pseudo}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "ghost");
  const erase = button("Supprimer mes données", async () => {
    if (!confirm("Supprimer ton profil, toutes tes réponses et tes récompenses ? C'est définitif.")) return;
    try {
      await api("/api/privacy", { method: "DELETE" });
      showLogin("Tes données ont été supprimées.");
    } catch (err) {
      saved.textContent = (err as Error).message;
    }
  }, "ghost danger");

  panel.replaceChildren(
    h("h2", {}, "Mes données"),
    h(
      "dl",
      { class: "data-list" },
      h("dt", {}, "Nom"),
      h("dd", {}, `${profile.prenom} ${profile.nom}`.trim() || "—"),
      h("dt", {}, "Formation"),
      h("dd", {}, profile.formation || "—"),
      h("dt", {}, "Pseudo"),
      h("dd", {}, profile.pseudo),
      h("dt", {}, "Réponses"),
      h("dd", {}, plural(data.answers.length, "sondage")),
      h("dt", {}, "Politique acceptée"),
      h("dd", {}, profile.consent ? `le ${dateTimeFmt.format(profile.consent.acceptedAt)}` : "—"),
    ),
    h("label", { class: "check" }, marketing, h("span", {}, "Le BDE peut utiliser mes réponses, mon nom et ma formation pour sa communication et ses actions marketing.")),
    h("label", { class: "check" }, sponsors, h("span", {}, "Le BDE peut transmettre mes réponses, mon nom et ma formation à ses partenaires et sponsors.")),
    saved,
    h("div", { class: "actions" }, download, erase),
    h("p", { class: "muted small" }, h("a", { href: "/confidentialite", target: "_blank", rel: "noopener" }, "Politique de confidentialité")),
  );
}

/** Succès déjà vus sur cet appareil, pour n'annoncer que les nouveaux. */
function loadSeen(pseudo: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(`achievements:${pseudo}`);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveSeen(pseudo: string, seen: Set<string>): void {
  try {
    localStorage.setItem(`achievements:${pseudo}`, JSON.stringify([...seen]));
  } catch {
    // stockage indisponible : les succès seront simplement réannoncés au prochain chargement
  }
}

/** Grille des succès, et une annonce quand un succès se débloque. */
function achievementsRenderer(root: HTMLElement, toast: HTMLElement): (list: AchievementState[], pseudo: string) => void {
  let seen: Set<string> | null = null;
  let seenFor = "";
  let toastTimer: number | undefined;
  const queue: string[] = [];

  const showNext = (): void => {
    const next = queue.shift();
    if (!next) {
      toast.hidden = true;
      return;
    }
    toast.textContent = next;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(showNext, 3500);
  };

  return (list, pseudo) => {
    const unlocked = list.filter((a) => a.unlocked);
    // Le pseudo arrive avec l'état du sondage : sans lui, on affiche la grille sans rien annoncer
    if (pseudo && seenFor !== pseudo) {
      seenFor = pseudo;
      // Première visite sur cet appareil : les succès déjà obtenus ne sont pas réannoncés
      seen = loadSeen(pseudo) ?? new Set(unlocked.map((a) => a.id));
      saveSeen(pseudo, seen);
    }
    const fresh = seen ? unlocked.filter((a) => !seen!.has(a.id)) : [];
    if (fresh.length) {
      for (const a of fresh) {
        seen!.add(a.id);
        const def = ACHIEVEMENTS.find((d) => d.id === a.id)!;
        queue.push(`Succès débloqué : ${def.title}`);
      }
      saveSeen(pseudo, seen!);
      if (toast.hidden) showNext();
    }

    root.replaceChildren(
      h("h2", {}, `Succès · ${unlocked.length} / ${list.length}`),
      h(
        "ul",
        { class: "achievement-grid" },
        ...list.map((a) => {
          const def = ACHIEVEMENTS.find((d) => d.id === a.id)!;
          return h(
            "li",
            { class: a.unlocked ? "achievement unlocked" : "achievement", title: def.description },
            h(
              "span",
              { class: "achievement-body" },
              h("span", { class: "achievement-state" }, a.unlocked ? "Débloqué" : a.progress ?? "À débloquer"),
              h("strong", {}, def.title),
              h("small", {}, def.description),
            ),
          );
        }),
      ),
    );
  };
}

/** Les trois premières places ont leur couleur (or, argent, bronze) */
const PODIUM = ["gold", "silver", "bronze"];

function renderLeaderboard(root: HTMLElement, s: LeaderboardState): void {
  root.hidden = s.top.length === 0;
  const row = (e: LeaderboardEntry, mine: boolean): HTMLElement =>
    h(
      "li",
      { class: mine ? "me-row" : "" },
      h("span", { class: `rank ${PODIUM[e.rank - 1] ?? ""}`.trim() }, String(e.rank)),
      h("span", { class: "pseudo" }, e.pseudo, mine && h("small", {}, "toi")),
      h("span", { class: "score" }, `${e.count} / ${s.totalPolls}`),
    );
  const meInTop = s.me !== null && s.top.some((e) => e.rank === s.me!.rank && e.pseudo === s.me!.pseudo);
  root.replaceChildren(
    h("h2", {}, "Classement"),
    h("p", { class: "muted" }, "Qui a répondu au plus de sondages ?"),
    h(
      "ol",
      { class: "rank-list" },
      ...s.top.map((e) => row(e, e.rank === s.me?.rank && e.pseudo === s.me.pseudo)),
      s.me && !meInTop && h("li", { class: "rank-gap", "aria-hidden": "true" }, "…"),
      s.me && !meInTop && row(s.me, true),
    ),
    s.me ? "" : h("p", { class: "hint" }, "Réponds à un sondage pour entrer dans le classement."),
  );
}

/**
 * Sondages du hub : une carte par sondage, gardée d'un rafraîchissement à l'autre
 * pour ne pas effacer une réponse en cours de saisie.
 */
class HubView {
  private views = new Map<string, { root: HTMLElement; view: PollView }>();

  constructor(
    private readonly root: HTMLElement,
    private readonly onVoted: () => void,
  ) {}

  update(polls: PublicPoll[], startedAt: number): void {
    const ids = new Set(polls.map((p) => p.id));
    for (const [id, { root }] of this.views) {
      if (!ids.has(id)) {
        root.remove();
        this.views.delete(id);
      }
    }
    polls.forEach((poll, i) => {
      let entry = this.views.get(poll.id);
      if (!entry) {
        const root = h("div");
        entry = { root, view: new PollView(root, false, this.onVoted) };
        this.views.set(poll.id, entry);
      }
      // On ne déplace une carte que si l'ordre a changé : déplacer un nœud fait perdre le focus
      if (this.root.children[i] !== entry.root) this.root.insertBefore(entry.root, this.root.children[i] ?? null);
      entry.view.update(poll, startedAt);
    });
  }
}

/**
 * Carte d'un sondage : celui lancé en direct (live) ou un sondage du hub. La carte n'est
 * reconstruite que lorsque le sondage ou son statut change, pour ne pas effacer une réponse
 * en cours de saisie.
 */
class PollView {
  private key = "";
  private poll: PublicPoll | null = null;
  private hubBelow = false;
  private body = h("div");
  private hint = h("p");
  private results = h("div");
  private rewardHint = h("p", { class: "reward-hint", hidden: true });
  private error = "";
  /** Heure du dernier vote envoyé : un état lu avant cette heure garde le vote local. */
  private votedAt = 0;
  private localVote: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly live: boolean,
    private readonly onVoted: () => void,
  ) {}

  /** hubBelow : des sondages du hub sont affichés sous l'écran d'attente */
  update(poll: PublicPoll | null, startedAt: number, hubBelow = false): void {
    if (poll && startedAt < this.votedAt && poll.id === this.poll?.id) poll.myVote = this.localVote;
    this.poll = poll;
    const key = poll ? `${poll.id}|${poll.status}` : `none|${hubBelow}`;
    this.hubBelow = hubBelow;
    if (key !== this.key) {
      this.key = key;
      this.error = "";
      this.build();
    }
    this.refresh();
  }

  private build(): void {
    const poll = this.poll;
    if (!poll) {
      this.root.replaceChildren(
        h(
          "div",
          { class: this.hubBelow ? "card waiting compact" : "card waiting" },
          h("div", { class: "pulse" }),
          h("h2", {}, "En attente du prochain sondage"),
          h(
            "p",
            { class: "muted" },
            this.hubBelow
              ? "La question de l'AG apparaîtra ici. En attendant, réponds aux sondages ci-dessous."
              : "Garde cette page ouverte : la question apparaîtra ici dès qu'elle sera lancée.",
          ),
        ),
      );
      return;
    }
    const open = poll.status === "open";
    this.body = h("div", { class: "vote-body" });
    this.hint = h("p", { class: "hint" });
    this.results = h("div", { class: "results" });
    const eyebrow = !this.live
      ? h("p", { class: "eyebrow" }, "En libre accès")
      : h("p", { class: open ? "eyebrow live" : "eyebrow" }, open ? "Sondage en cours" : "Sondage clôturé");
    this.root.replaceChildren(
      h(
        "article",
        { class: this.live ? "card poll-card" : "card poll-card hub-card" },
        eyebrow,
        h(this.live ? "h1" : "h3", { class: "question" }, poll.question),
        this.rewardHint,
        this.body,
        this.hint,
        this.results,
      ),
    );
    if (poll.kind === "text" && open) {
      const textarea = h("textarea", { rows: "3", maxlength: String(MAX_ANSWER_LENGTH), placeholder: "Ta réponse…" });
      textarea.value = poll.myVote ?? "";
      this.body.append(textarea, button("Envoyer", () => void this.send(textarea.value.trim()), this.live ? "primary big" : "primary"));
    }
  }

  private refresh(): void {
    const poll = this.poll;
    if (!poll) return;
    const { myVote } = poll;
    const open = poll.status === "open";

    this.rewardHint.hidden = !poll.reward;
    this.rewardHint.textContent = !poll.reward
      ? ""
      : myVote
        ? `Récompense débloquée : ${poll.reward}. Ton QR code est dans « Mes récompenses ».`
        : `Réponds pour gagner : ${poll.reward}`;
    this.rewardHint.classList.toggle("won", Boolean(myVote));

    if (poll.kind === "choice") {
      this.body.replaceChildren(
        h(
          "div",
          { class: "choices" },
          ...poll.options.map((o, i) => {
            const btn = button(o.label, () => void this.send(o.id), `choice c${i % 4}${myVote === o.id ? " selected" : ""}`);
            btn.disabled = !open;
            return btn;
          }),
        ),
      );
    } else if (!open) {
      this.body.replaceChildren(
        myVote ? h("blockquote", { class: "my-answer" }, myVote) : h("p", { class: "muted" }, "Tu n'as pas répondu."),
      );
    }

    const until = this.live ? "jusqu'à la clôture" : "quand tu veux";
    let hint: string;
    if (this.error) hint = this.error;
    else if (!open) hint = "Le vote est terminé.";
    else if (poll.kind === "text") hint = myVote ? `Réponse envoyée. Tu peux la modifier ${until}.` : "Écris ta réponse puis envoie-la.";
    else hint = myVote ? `Vote enregistré. Tu peux changer d'avis ${until}.` : "Choisis une réponse.";
    this.hint.textContent = hint;
    this.hint.className = this.error ? "hint error" : "hint";

    const r = poll.results;
    this.results.replaceChildren(
      ...(r
        ? [
            h("h3", {}, `Résultats · ${plural(r.total, "réponse")}`),
            poll.kind === "choice" ? bars(poll.options, r, myVote) : answers(r.answers),
          ]
        : []),
    );
  }

  private async send(value: string): Promise<void> {
    const poll = this.poll;
    if (!poll || poll.status !== "open") return;
    if (!value) {
      this.error = "Écris une réponse avant d'envoyer.";
      return this.refresh();
    }
    this.error = "";
    const previous = poll.myVote;
    poll.myVote = this.localVote = value;
    this.votedAt = Date.now();
    this.refresh();
    try {
      await api("/api/vote", { method: "POST", body: JSON.stringify({ pollId: poll.id, value }) });
      this.onVoted();
    } catch (err) {
      this.votedAt = 0;
      poll.myVote = previous;
      this.error = (err as Error).message;
      this.refresh();
    }
  }
}

void boot();

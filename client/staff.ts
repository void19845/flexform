import type { RewardCheck } from "../shared/types.js";
import { currentAccount, loginForm, signOut } from "./account.js";
import { api, ApiError, button, h } from "./dom.js";

/** Lecteur de QR intégré au navigateur (Chrome, Android). Absent sur Safari : on passe alors par jsQR. */
interface QrDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorClass = new (options: { formats: string[] }) => QrDetector;
type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const scope = window as unknown as { BarcodeDetector?: DetectorClass; jsQR?: JsQr };

const app = document.getElementById("app")!;
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Les jetons du compte sont dans des cookies HttpOnly : les requêtes n'ont rien à ajouter. */
function staffApi<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Code reçu dans l'adresse quand le QR a été scanné avec l'appareil photo du téléphone. */
function takeCodeFromUrl(): string {
  const url = new URL(location.href);
  const code = url.searchParams.get("code") ?? "";
  if (code) history.replaceState(null, "", url.pathname);
  return code;
}

async function boot(): Promise<void> {
  const pending = takeCodeFromUrl();
  // Admin et staff ont accès à cette page
  if (await currentAccount().catch(() => null)) showScanner(pending);
  else showLogin(pending);
}

// --- Connexion staff ------------------------------------------------------

function showLogin(pending: string, message = ""): void {
  app.replaceChildren(
    loginForm({
      eyebrow: "BDE Montreuil · Staff",
      title: "Remise des récompenses",
      intro: pending ? "Connecte-toi pour vérifier le QR code scanné." : undefined,
      message,
      onSignedIn: () => showScanner(pending),
    }),
  );
}

// --- Scanner --------------------------------------------------------------

function showScanner(pending: string): void {
  const video = h("video", { playsinline: true, muted: true, autoplay: true, hidden: true });
  const canvas = document.createElement("canvas");
  const cameraHint = h("p", { class: "muted small" }, "Vise le QR code affiché sur le téléphone du participant.");
  const cameraBtn = button("Activer la caméra", () => void (stream ? stopCamera() : startCamera()), "primary big");
  const result = h("section", { class: "scan-result", "aria-live": "polite" });

  const codeInput = h("input", { type: "text", placeholder: "ABCD-EFGH-JKLM", autocomplete: "off", "aria-label": "Code de la récompense" });
  const manual = h(
    "form",
    { class: "manual" },
    codeInput,
    h("button", { type: "submit", class: "btn" }, "Vérifier"),
  );
  manual.addEventListener("submit", (e) => {
    e.preventDefault();
    if (codeInput.value.trim()) void check(codeInput.value);
  });

  const logout = button("Déconnexion", () => {
    stopCamera();
    void signOut().then(() => showLogin(""));
  }, "ghost small");

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("div", {}, h("p", { class: "eyebrow" }, "BDE Montreuil · Staff"), h("h1", {}, "Remise des récompenses")),
      logout,
    ),
    h("div", { class: "card scanner" }, h("div", { class: "video-box" }, video), cameraBtn, cameraHint),
    result,
    h("div", { class: "card" }, h("h2", {}, "Saisie manuelle"), h("p", { class: "muted small" }, "Si le scan ne marche pas, tape le code écrit sous le QR."), manual),
  );

  let stream: MediaStream | null = null;
  let timer: number | undefined;
  /** Scan en pause pendant l'affichage d'un résultat, pour ne pas relire le même code en boucle */
  let paused = false;
  const detector = scope.BarcodeDetector ? new scope.BarcodeDetector({ formats: ["qr_code"] }) : null;

  async function startCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraHint.textContent = "Caméra indisponible ici (il faut une adresse en https). Utilise la saisie manuelle.";
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch {
      cameraHint.textContent = "Accès à la caméra refusé. Autorise-la dans le navigateur, ou utilise la saisie manuelle.";
      return;
    }
    video.srcObject = stream;
    video.hidden = false;
    await video.play().catch(() => undefined);
    cameraBtn.textContent = "Arrêter la caméra";
    cameraBtn.className = "btn ghost big";
    cameraHint.textContent = "Vise le QR code affiché sur le téléphone du participant.";
    scanLoop();
  }

  function stopCamera(): void {
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    cameraBtn.textContent = "Activer la caméra";
    cameraBtn.className = "btn primary big";
  }

  async function readFrame(): Promise<string | null> {
    if (video.readyState < 2 || !video.videoWidth) return null;
    if (detector) {
      const codes = await detector.detect(video).catch(() => []);
      return codes[0]?.rawValue ?? null;
    }
    if (!scope.jsQR) return null;
    // Image réduite : jsQR est bien plus rapide et lit toujours un QR affiché sur un écran
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return scope.jsQR(data, width, height)?.data ?? null;
  }

  function scanLoop(): void {
    clearTimeout(timer);
    if (!stream) return;
    timer = window.setTimeout(async () => {
      if (!paused) {
        const text = await readFrame();
        if (text && !paused) {
          navigator.vibrate?.(80);
          await check(text);
        }
      }
      scanLoop();
    }, 200);
  }

  function next(): void {
    paused = false;
    codeInput.value = "";
    result.replaceChildren();
  }

  async function check(code: string): Promise<void> {
    paused = true;
    result.replaceChildren(h("div", { class: "card result" }, h("p", { class: "muted" }, "Vérification…")));
    try {
      render(await staffApi<RewardCheck>("/api/staff/check", { code }));
    } catch (err) {
      failed(err, code);
    }
  }

  async function redeem(code: string, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    try {
      render(await staffApi<RewardCheck>("/api/staff/redeem", { code }));
    } catch (err) {
      failed(err, code);
    }
  }

  /** Session expirée ou accès retiré : retour à la connexion, en gardant le code à vérifier. */
  function failed(err: unknown, code: string): void {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      stopCamera();
      showLogin(code, err.message);
      return;
    }
    renderError((err as Error).message);
  }

  function renderError(message: string): void {
    result.replaceChildren(
      h("div", { class: "card result invalid" }, h("h2", {}, "Erreur"), h("p", {}, message), button("Réessayer", next, "big")),
    );
  }

  function render(r: RewardCheck): void {
    const titles: Record<RewardCheck["status"], string> = {
      valid: "Récompense valide",
      done: "Remise validée",
      used: "Déjà utilisée",
      invalid: "Code invalide",
    };
    const person = r.person && (r.person.prenom || r.person.nom || r.person.pseudo)
      ? h(
          "p",
          { class: "person" },
          h("strong", {}, [r.person.prenom, r.person.nom.toUpperCase()].filter(Boolean).join(" ") || r.person.pseudo),
          h("span", { class: "muted" }, [r.person.formation, r.person.pseudo && `@${r.person.pseudo}`].filter(Boolean).join(" · ")),
        )
      : "";
    const redeemBtn = button("Valider la remise", () => void redeem(r.code, redeemBtn), "primary big");
    result.replaceChildren(
      h(
        "div",
        { class: `card result ${r.status}` },
        h("h2", {}, titles[r.status]),
        r.reward ? h("p", { class: "reward-text" }, r.reward) : "",
        person,
        r.question ? h("p", { class: "muted small" }, `Sondage : ${r.question}`) : "",
        r.status === "used" && r.redeemedAt ? h("p", {}, `Remise le ${dateTimeFmt.format(r.redeemedAt)}. Ne pas la redonner.`) : "",
        r.message ? h("p", {}, r.message) : "",
        h("p", { class: "muted small code" }, r.code.match(/.{1,4}/g)?.join("-") ?? r.code),
        r.status === "valid" ? redeemBtn : "",
        button(r.status === "valid" ? "Annuler" : "Scanner le suivant", next, r.status === "valid" ? "ghost big" : "big"),
      ),
    );
  }

  if (pending) void check(pending);
}

void boot();

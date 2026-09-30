/**
 * Serveur local qui imite Vercel : fichiers de public/ + fonctions de api/.
 * Les données sont dans Supabase : lancer « npm run db:start » et remplir .env (voir README).
 */
import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

type Handler = (req: Request) => Promise<Response>;

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = fileURLToPath(new URL("../../", import.meta.url)); // .dev/scripts -> racine du projet
const PUBLIC_DIR = join(ROOT, "public");
const API_DIR = fileURLToPath(new URL("../api/", import.meta.url)); // fonctions compilées dans .dev/api

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function toRequest(req: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: "half",
  } as RequestInit);
}

async function loadHandler(pathname: string, method: string): Promise<Handler | "not-found" | "method"> {
  const file = normalize(join(API_DIR, `${pathname.slice("/api/".length)}.js`));
  if (!file.startsWith(API_DIR)) return "not-found";
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") return "not-found";
    throw err;
  }
  const handler = mod[method];
  return typeof handler === "function" ? (handler as Handler) : "method";
}

async function readStatic(pathname: string): Promise<{ data: Buffer; type: string } | null> {
  // Comme cleanUrls sur Vercel : /admin -> admin.html
  const rel = pathname === "/" ? "index.html" : extname(pathname) ? pathname : `${pathname}.html`;
  const file = normalize(join(PUBLIC_DIR, decodeURIComponent(rel)));
  if (!file.startsWith(PUBLIC_DIR + sep)) return null;
  try {
    return { data: await readFile(file), type: TYPES[extname(file)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${PORT}`}`);
  void (async () => {
    if (url.pathname.startsWith("/api/")) {
      const handler = await loadHandler(url.pathname, req.method ?? "GET");
      if (handler === "not-found") return void res.writeHead(404).end();
      if (handler === "method") return void res.writeHead(405).end();
      const response = await handler(toRequest(req, url));
      const headers: Record<string, string | string[]> = {};
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") headers[key] = value;
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) headers["set-cookie"] = cookies;
      res.writeHead(response.status, headers);
      return void res.end(Buffer.from(await response.arrayBuffer()));
    }
    const file = await readStatic(url.pathname);
    if (!file) return void res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
    res.writeHead(200, { "Content-Type": file.type, "Cache-Control": "no-cache" });
    res.end(file.data);
  })().catch((err: unknown) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => {
  const storage = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "Supabase non configuré (voir README)";
  console.log(`\n  Sondage BDE (dev) : http://localhost:${PORT}  ·  admin : /admin  ·  stockage : ${storage}\n`);
});

// Production server for self-hosting (docker compose). Same surface as Vercel:
//   - static files from web/ with the header and redirect rules read from vercel.json
//   - /api/<name> -> api/<name>.js (plain Node (req, res) handlers) with the req.query/req.body/res.status/res.json shims
// Vercel keeps working untouched: this file is only used by `npm start` / the Docker image.
//
// Environment: PORT (default 3000), TRUST_PROXY=1 (trust x-forwarded-for; only set it behind a reverse proxy).
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = __dirname;
const MAX_BODY = 5 * 1024 * 1024; // documents are base64 files of up to ~3 MB
const MAX_URL_LENGTH = 4096;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".apk": "application/vnd.android.package-archive", ".pdf": "application/pdf"
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)/;
// Never served as static files (top-level names inside web/).
const BLOCKED_TOP = new Set(["api", "scripts", "test", "node_modules", "data", "package.json", "package-lock.json", "vercel.json", "server.js", "dockerfile"]);
const DEFAULT_CACHE = "public, max-age=0, must-revalidate";

// vercel.json is the single source of truth for headers and redirects, so both hosts behave the same.
function loadRules(file = path.join(ROOT, "vercel.json")) {
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    headers: (cfg.headers || []).map(r => ({ re: new RegExp("^" + r.source + "$"), headers: r.headers })),
    redirects: (cfg.redirects || []).map(r => ({ from: r.source, to: r.destination, status: r.permanent ? 308 : 307 }))
  };
}

const handlers = new Map();
function loadHandler(dir, name) {
  const file = path.join(dir, name + ".js");
  if (handlers.has(file)) return handlers.get(file);
  const fn = fs.existsSync(file) ? require(file) : null;
  handlers.set(file, fn);
  return fn;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function notFound(res, head) {
  const page = path.join(ROOT, "404.html");
  if (head || !fs.existsSync(page)) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end(head ? undefined : "No encontrado"); }
  res.writeHead(404, { "content-type": TYPES[".html"], "cache-control": "no-store" });
  fs.createReadStream(page).pipe(res);
}

// Resolves a request pathname to a file inside web/, or null (never throws).
function resolveStatic(pathname) {
  if (pathname.length > MAX_URL_LENGTH) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some(p => p === ".." || p === "." || p.startsWith("."))) return null;
  if (parts.length && BLOCKED_TOP.has(parts[0].toLowerCase())) return null;
  let file = path.join(ROOT, ...parts);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  if (st.isDirectory()) {
    if (!decoded.endsWith("/")) return null; // no directory listing, no implicit redirects
    file = path.join(file, "index.html");
    try { st = fs.statSync(file); } catch { return null; }
  }
  return st.isFile() ? { file, st } : null;
}

function serveStatic(req, res, url, rules) {
  const head = req.method === "HEAD";
  if (req.method !== "GET" && !head) { res.writeHead(405, { allow: "GET, HEAD" }); return res.end(); }
  for (const r of rules.redirects) {
    if (url.pathname === r.from) { res.writeHead(r.status, { location: r.to + url.search }); return res.end(); }
  }
  const hit = resolveStatic(url.pathname);
  if (!hit) return notFound(res, head);
  const type = TYPES[path.extname(hit.file).toLowerCase()] || "application/octet-stream";
  const headers = { "content-type": type, "cache-control": DEFAULT_CACHE };
  for (const r of rules.headers) if (r.re.test(url.pathname)) for (const h of r.headers) headers[h.key.toLowerCase()] = h.value;
  headers.etag = `W/"${hit.st.size.toString(16)}-${Math.floor(hit.st.mtimeMs).toString(16)}"`;
  headers["last-modified"] = hit.st.mtime.toUTCString();
  if (req.headers["if-none-match"] === headers.etag) { res.writeHead(304, headers); return res.end(); }
  const gzip = COMPRESSIBLE.test(headers["content-type"]) && hit.st.size > 512 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  if (COMPRESSIBLE.test(headers["content-type"])) headers.vary = "Accept-Encoding";
  if (gzip) headers["content-encoding"] = "gzip"; else headers["content-length"] = hit.st.size;
  res.writeHead(200, headers);
  if (head) return res.end();
  const stream = fs.createReadStream(hit.file);
  stream.on("error", () => res.destroy());
  if (gzip) stream.pipe(zlib.createGzip()).pipe(res); else stream.pipe(res);
}

async function serveApi(req, res, url, handler, trustProxy) {
  if (typeof handler !== "function") { res.writeHead(404); return res.end(); }
  // Client IP: x-forwarded-for is only believed when a trusted reverse proxy sets it.
  const peer = req.socket.remoteAddress || "?";
  if (!trustProxy || !req.headers["x-forwarded-for"]) req.headers["x-forwarded-for"] = peer;
  let raw;
  try { raw = await readBody(req); } catch (e) { if (!res.headersSent) { res.writeHead(e.status || 400); res.end(); } return; }
  req.query = Object.fromEntries(url.searchParams);
  req.body = raw && String(req.headers["content-type"] || "").includes("json") ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); return res; };
  try { await handler(req, res); } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end(); } else res.end();
  }
}

function create(options = {}) {
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === "1";
  const rules = options.rules || loadRules();
  const apiDir = options.apiDir || path.join(ROOT, "api");
  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, "http://localhost"); } catch { res.writeHead(400); return res.end(); }
    if (url.pathname.startsWith("/api/")) {
      const m = /^\/api\/([a-z]+)$/.exec(url.pathname);
      if (!m) { res.writeHead(404); return res.end(); }
      return serveApi(req, res, url, loadHandler(apiDir, m[1]), trustProxy);
    }
    serveStatic(req, res, url, rules);
  });
  // Longer than the reverse proxy's idle timeout, so the proxy never reuses a connection we already closed.
  server.keepAliveTimeout = 125000;
  server.headersTimeout = 130000;
  return server;
}

function start() {
  const port = Number(process.env.PORT || 3000);
  const server = create();
  server.listen(port, () => console.log(`Puente listening on :${port}${process.env.TRUST_PROXY === "1" ? " (trusting x-forwarded-for)" : ""}`));
  let closing = false;
  const stop = signal => {
    if (closing) return; closing = true;
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  return server;
}

if (require.main === module) start();
module.exports = { create, start, loadRules, resolveStatic, MAX_BODY };

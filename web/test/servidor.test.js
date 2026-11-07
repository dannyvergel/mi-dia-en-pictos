// Production server (server.js): static serving, vercel.json headers, redirect, blocked paths, API mapping, health.
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { PGlite } = require("@electric-sql/pglite");
const db = require("../api/_lib/db");
const salud = require("../api/_lib/salud");
const servidor = require("../server");

const ENV = ["DATABASE_URL", "POSTGRES_URL", "DB_DRIVER"];
const guardado = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
for (const k of ENV) delete process.env[k];

// Fake handlers: echo what the shims expose, plus a body-size probe.
const apiDir = fs.mkdtempSync(path.join(os.tmpdir(), "puente-api-"));
fs.writeFileSync(path.join(apiDir, "eco.js"), `module.exports = (req, res) => res.status(201).json({ method: req.method, query: req.query, body: req.body, ip: req.headers["x-forwarded-for"] });`);
fs.writeFileSync(path.join(apiDir, "roto.js"), `module.exports = () => { throw new Error("boom"); };`);

async function arrancar(opciones) {
  const s = servidor.create({ apiDir, ...opciones });
  await new Promise(r => s.listen(0, "127.0.0.1", r));
  return { s, puerto: s.address().port };
}

// Raw request so ".." and encoded segments reach the server untouched (fetch would normalize them).
function pedir(puerto, ruta, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: puerto, path: ruta, method, headers }, res => {
      const trozos = [];
      res.on("data", c => trozos.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(trozos) }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

let srv, puerto;
test.before(async () => { ({ s: srv, puerto } = await arrancar({ trustProxy: false })); });
test.after(async () => {
  await new Promise(r => { srv.close(r); srv.closeAllConnections(); });
  fs.rmSync(apiDir, { recursive: true, force: true });
  db.usarBaseDePrueba(null);
  for (const k of ENV) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; }
});

test("serves index.html at / and a directory index with trailing slash", async () => {
  const r = await pedir(puerto, "/");
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /^text\/html/);
  assert.equal(r.headers["cache-control"], "public, max-age=0, must-revalidate");
  assert.ok(r.body.toString().includes("<html"));
  const en = await pedir(puerto, "/en/");
  assert.equal(en.status, 200);
  assert.ok(en.body.equals(fs.readFileSync(path.join(__dirname, "..", "en", "index.html"))));
});

test("/en redirects permanently to /en/ (vercel.json)", async () => {
  const r = await pedir(puerto, "/en?x=1");
  assert.equal(r.status, 308);
  assert.equal(r.headers.location, "/en/?x=1");
});

test("every header rule of vercel.json is applied to the file it targets", async () => {
  const f = await pedir(puerto, "/fuentes/atkinson-hyperlegible-400-latin.woff2");
  assert.equal(f.status, 200);
  assert.equal(f.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(f.headers["content-type"], "font/woff2");
  for (const apk of ["puente.apk", "comunicador.apk"]) {
    const r = await pedir(puerto, "/descargar/" + apk);
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "application/vnd.android.package-archive");
    assert.equal(r.headers["content-disposition"], `attachment; filename="${apk}"`);
    assert.equal(r.headers["cache-control"], "public, max-age=0, must-revalidate");
  }
  for (const og of ["/og.png", "/og-en.png"]) assert.equal((await pedir(puerto, og)).headers["cache-control"], "public, max-age=86400");
  for (const p of ["/sitemap.xml", "/robots.txt"]) {
    const r = await pedir(puerto, p);
    assert.equal(r.status, 200);
    assert.equal(r.headers["cache-control"], "public, max-age=0, must-revalidate");
  }
  // Parity guard: the rules come from vercel.json, not from a hand-copied list.
  const rules = servidor.loadRules();
  assert.equal(rules.headers.length, JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8")).headers.length);
});

test("blocked paths answer 404: scripts, tests, node_modules, data, api sources, dotfiles, manifests", async () => {
  for (const p of ["/scripts/dev.js", "/test/servidor.test.js", "/node_modules/pg/package.json", "/data/escuelas-santa-fe.json",
    "/api/_lib/db.js", "/api/config.js", "/.env", "/.git/config", "/package.json", "/package-lock.json", "/vercel.json", "/server.js", "/Scripts/dev.js"]) {
    const r = await pedir(puerto, p);
    assert.equal(r.status, 404, p);
  }
});

test("path traversal and malformed paths never leave web/", async () => {
  for (const p of ["/../package.json", "/%2e%2e/package.json", "/%2E%2E%2Fpackage.json", "/fuentes/../../README.md", "/fuentes/%2e%2e/%2e%2e/README.md",
    "/..%5Cpackage.json", "/%00", "/index.html%00.png", "/%E0%A4%A", "/fuentes/..%2f..%2fREADME.md"]) {
    const r = await pedir(puerto, p);
    assert.ok(r.status === 404 || r.status === 400, `${p} -> ${r.status}`);
    assert.ok(!r.body.toString().includes("\"dependencies\""), p);
  }
});

test("no directory listing: a directory without index or without trailing slash is 404", async () => {
  assert.equal((await pedir(puerto, "/fuentes/")).status, 404);
  assert.equal((await pedir(puerto, "/fuentes")).status, 404);
  assert.equal((await pedir(puerto, "/descargar/")).status, 404);
});

test("unknown file serves the site 404 page; POST on a static file is 405; HEAD has no body", async () => {
  const r = await pedir(puerto, "/no-existe.html");
  assert.equal(r.status, 404);
  assert.ok(r.body.length > 0);
  assert.equal((await pedir(puerto, "/index.html", { method: "POST" })).status, 405);
  const h = await pedir(puerto, "/index.html", { method: "HEAD" });
  assert.equal(h.status, 200);
  assert.equal(h.body.length, 0);
});

test("gzip only when the client accepts it; ETag gives 304", async () => {
  const plain = await pedir(puerto, "/estilo.css");
  assert.equal(plain.headers["content-encoding"], undefined);
  const gz = await pedir(puerto, "/estilo.css", { headers: { "accept-encoding": "gzip" } });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.ok(zlib.gunzipSync(gz.body).equals(plain.body));
  const png = await pedir(puerto, "/og.png", { headers: { "accept-encoding": "gzip" } });
  assert.equal(png.headers["content-encoding"], undefined);
  const again = await pedir(puerto, "/estilo.css", { headers: { "if-none-match": plain.headers.etag } });
  assert.equal(again.status, 304);
});

test("/api/<name> runs the handler with query, JSON body and res.status/res.json shims", async () => {
  const r = await pedir(puerto, "/api/eco?a=1&b=dos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hola: "mundo" }) });
  assert.equal(r.status, 201);
  assert.match(r.headers["content-type"], /application\/json/);
  const j = JSON.parse(r.body);
  assert.deepEqual(j.query, { a: "1", b: "dos" });
  assert.deepEqual(j.body, { hola: "mundo" });
  const mal = await pedir(puerto, "/api/eco", { method: "POST", headers: { "content-type": "application/json" }, body: "{no json" });
  assert.equal(JSON.parse(mal.body).body, "{no json");
});

test("/api: unknown or unsafe names are 404, a throwing handler is 500, bodies over the limit are 413", async () => {
  for (const p of ["/api/nada", "/api/", "/api/eco/", "/api/_lib", "/api/../server", "/api/eco.js", "/api/ECO"]) assert.equal((await pedir(puerto, p)).status, 404, p);
  assert.equal((await pedir(puerto, "/api/roto")).status, 500);
  const grande = Buffer.alloc(servidor.MAX_BODY + 1024, "a");
  const r = await pedir(puerto, "/api/eco", { method: "POST", headers: { "content-type": "text/plain" }, body: grande }).catch(e => ({ status: e.code }));
  assert.ok(r.status === 413 || r.status === "ECONNRESET" || r.status === "EPIPE", String(r.status));
  const ok = await pedir(puerto, "/api/eco", { method: "POST", headers: { "content-type": "text/plain" }, body: Buffer.alloc(4 * 1024 * 1024, "a") });
  assert.equal(ok.status, 201);
});

test("x-forwarded-for is ignored unless TRUST_PROXY is on", async () => {
  const h = { "x-forwarded-for": "203.0.113.9" };
  const sin = JSON.parse((await pedir(puerto, "/api/eco", { headers: h })).body);
  assert.notEqual(sin.ip, "203.0.113.9");
  assert.match(sin.ip, /127\.0\.0\.1/);
  const { s, puerto: p2 } = await arrancar({ trustProxy: true });
  try {
    assert.equal(JSON.parse((await pedir(p2, "/api/eco", { headers: h })).body).ip, "203.0.113.9");
    assert.match(JSON.parse((await pedir(p2, "/api/eco")).body).ip, /127\.0\.0\.1/); // no header: fall back to the peer
  } finally { await new Promise(r => { s.close(r); s.closeAllConnections(); }); }
});

test("health endpoint of the real handler answers through the server", async () => {
  db.usarBaseDePrueba(new PGlite());
  salud.olvidar();
  const { s, puerto: p3 } = await arrancar({ apiDir: path.join(__dirname, "..", "api") });
  try {
    const r = await pedir(p3, "/api/config?accion=salud");
    assert.equal(r.status, 200);
    assert.equal(r.headers["cache-control"], "no-store");
    const j = JSON.parse(r.body);
    assert.equal(j.ok, true);
    assert.equal(j.db, "ok");
  } finally { await new Promise(r => { s.close(r); s.closeAllConnections(); }); salud.olvidar(); }
});

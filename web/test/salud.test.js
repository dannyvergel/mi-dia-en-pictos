// Chequeo de salud: GET /api/config?accion=salud → { ok, db, version } con 200 o 503 (lo usa .github/workflows/salud.yml).
// Sin red ni base real: PGlite y bases falsas inyectadas con usarBaseDePrueba.
const test = require("node:test");
const assert = require("node:assert");
const { PGlite } = require("@electric-sql/pglite");
const db = require("../api/_lib/db");
const salud = require("../api/_lib/salud");
const config = require("../api/config");
const { cliente } = require("./ayuda");

const ENV = ["DATABASE_URL", "POSTGRES_URL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA"];
let guardado;
test.beforeEach(() => {
  guardado = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  db.usarBaseDePrueba(null);
  salud.olvidar();
});
test.afterEach(() => {
  for (const k of ENV) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; }
  db.usarBaseDePrueba(null);
  salud.olvidar();
});

const pedir = (query = { accion: "salud" }, method = "GET") => cliente().llamar(config, { method, query });

test("salud con base: 200, { ok, db, version } y sin caché", async () => {
  db.usarBaseDePrueba(new PGlite());
  process.env.VERCEL_GIT_COMMIT_SHA = "A597856ABCDEF0123456789abcdef0123456789";
  const r = await pedir();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, db: "ok", version: "a597856" });
  assert.equal(r.headers["cache-control"], "no-store");
});

test("salud sin base: 200 fuera de producción (modo demo), 503 en producción", async () => {
  let r = await pedir();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, db: "sin_base", version: "local" });
  salud.olvidar();
  process.env.VERCEL_ENV = "production";
  r = await pedir();
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { ok: false, db: "sin_base", version: "local" });
});

test("salud con la base caída: 503 sin el mensaje de error (no filtra host, usuario ni clave)", async () => {
  const secreto = "postgresql://neondb_owner:clave-super-secreta@ep-algo.neon.tech/neondb";
  db.usarBaseDePrueba({ query: async () => { throw Object.assign(new Error("no conecta a " + secreto), { code: "ECONNREFUSED" }); } });
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(" "));
  try {
    const r = await pedir();
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { ok: false, db: "error", version: "local" });
    assert.ok(!JSON.stringify(r.body).includes("clave-super-secreta"));
  } finally { console.error = original; }
  assert.ok(errores.length > 0);
  assert.ok(errores.every(l => !l.includes("clave-super-secreta") && !l.includes("neon.tech")), "el log tampoco lleva el mensaje");
});

test("salud con la base lenta: corta en el tiempo máximo y da 503 (db: lenta)", async () => {
  db.usarBaseDePrueba({ query: () => new Promise(() => {}) });
  const t0 = Date.now();
  const original = console.error;
  console.error = () => {};
  let r;
  try { r = await salud.chequear({ tiempoMaximoMs: 50 }); } finally { console.error = original; }
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(r.status, 503);
  assert.deepEqual(r.cuerpo, { ok: false, db: "lenta", version: "local" });
  assert.ok(salud.TIEMPO_MAXIMO_MS <= 3000, "el tiempo máximo de producción es corto");
});

test("salud: un resultado bueno se recuerda unos segundos; uno malo no", async () => {
  let llamadas = 0;
  let falla = true;
  db.usarBaseDePrueba({ query: async () => { llamadas++; if (falla) throw new Error("caída"); return { rows: [{ ok: 1 }] }; } });
  const original = console.error;
  console.error = () => {};
  try {
    const t = 1_000_000;
    assert.equal((await salud.chequear({ ahora: t })).status, 503);
    falla = false;
    assert.equal((await salud.chequear({ ahora: t + 1 })).status, 200, "después de un fallo vuelve a probar");
    assert.equal(llamadas, 2);
    assert.equal((await salud.chequear({ ahora: t + 10_000 })).status, 200);
    assert.equal(llamadas, 2, "dentro de los 30 s no vuelve a consultar la base");
    await salud.chequear({ ahora: t + 31_000 });
    assert.equal(llamadas, 3);
  } finally { console.error = original; }
});

test("salud no crea tablas: es solo un SELECT 1", async () => {
  const consultas = [];
  db.usarBaseDePrueba({ query: async t => { consultas.push(t); return { rows: [{ ok: 1 }] }; } });
  assert.equal((await salud.chequear()).status, 200);
  assert.deepEqual(consultas, ["SELECT 1 AS ok"]);
});

test("config sin accion sigue igual (caché pública) y solo acepta GET", async () => {
  let r = await pedir({});
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "public, max-age=300");
  assert.ok("legal" in r.body && !("db" in r.body));
  r = await pedir({ accion: "salud" }, "POST");
  assert.equal(r.status, 405);
});

test("version: solo un sha hexadecimal; cualquier otra cosa es local", () => {
  process.env.VERCEL_GIT_COMMIT_SHA = "<script>";
  assert.equal(salud.version(), "local");
  process.env.VERCEL_GIT_COMMIT_SHA = "0123abc";
  assert.equal(salud.version(), "0123abc");
});

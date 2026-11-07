// Environment shim: APP_ENV / APP_COMMIT with VERCEL_ENV / VERCEL_GIT_COMMIT_SHA as the fallback.
const test = require("node:test");
const assert = require("node:assert/strict");
const entorno = require("../api/_lib/entorno");
const correo = require("../api/_lib/correo");
const seguridad = require("../api/_lib/seguridad");
const salud = require("../api/_lib/salud");
const http = require("../api/_lib/http");

const VARS = ["APP_ENV", "VERCEL_ENV", "APP_COMMIT", "VERCEL_GIT_COMMIT_SHA", "RESEND_API_KEY", "SMTP_URL", "SMTP_HOST", "SMTP_DISABLED",
  "SESSION_SECRET", "PUENTE_URL", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "DATABASE_URL", "POSTGRES_URL"];
const guardado = {};
test.beforeEach(() => { for (const k of VARS) { guardado[k] = process.env[k]; delete process.env[k]; } salud.olvidar(); });
test.afterEach(() => { for (const k of VARS) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; } salud.olvidar(); });

test("appEnv: APP_ENV manda, después VERCEL_ENV, por defecto development", () => {
  assert.equal(entorno.appEnv(), "development");
  process.env.VERCEL_ENV = "preview"; assert.equal(entorno.appEnv(), "preview");
  process.env.APP_ENV = "production"; assert.equal(entorno.appEnv(), "production");
  process.env.APP_ENV = "  "; assert.equal(entorno.appEnv(), "preview", "blank counts as unset");
  delete process.env.APP_ENV; process.env.VERCEL_ENV = ""; assert.equal(entorno.appEnv(), "development");
});

test("appCommit: APP_COMMIT, después VERCEL_GIT_COMMIT_SHA, si no vacío", () => {
  assert.equal(entorno.appCommit(), "");
  process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567"; assert.equal(entorno.appCommit(), "abcdef1234567");
  process.env.APP_COMMIT = "1234567abcdef"; assert.equal(entorno.appCommit(), "1234567abcdef");
});

test("solo VERCEL_ENV: el comportamiento de siempre (correo, secreto, salud, URL pública, versión)", async () => {
  process.env.VERCEL_ENV = "production";
  assert.equal(correo.modoCorreo(), "falta");
  assert.throws(() => seguridad.secreto(), /SESSION_SECRET/);
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "puentepictos.app"; process.env.VERCEL_URL = "x-abc.vercel.app";
  assert.equal(http.urlPublica({ headers: {} }), "https://puentepictos.app");
  assert.equal((await salud.chequear()).status, 503, "production without a database is not healthy");
  process.env.VERCEL_ENV = "preview"; salud.olvidar(); process.env.VERCEL_BRANCH_URL = "rama.vercel.app";
  assert.equal(correo.modoCorreo(), "log");
  assert.equal(http.urlPublica({ headers: {} }), "https://rama.vercel.app");
  assert.equal((await salud.chequear()).status, 200);
  delete process.env.VERCEL_ENV; assert.equal(correo.modoCorreo(), "dev");
  process.env.VERCEL_GIT_COMMIT_SHA = "ABCDEF1234567890"; assert.equal(salud.version(), "abcdef1");
});

test("APP_ENV=production activa lo exclusivo de producción aunque no haya VERCEL_ENV", async () => {
  process.env.APP_ENV = "production";
  assert.equal(correo.modoCorreo(), "falta", "no codes in responses, clear error");
  await assert.rejects(correo.mandarCodigo("a@x.org", "123456"), e => e.status === 503);
  assert.equal(seguridad.esProduccion(), true);
  assert.throws(() => seguridad.secreto(), /SESSION_SECRET/);
  process.env.PUENTE_URL = ""; process.env.VERCEL_PROJECT_PRODUCTION_URL = "prod.example"; process.env.VERCEL_BRANCH_URL = "rama.example";
  assert.equal(http.urlPublica({ headers: {} }), "https://prod.example");
  assert.equal((await salud.chequear()).status, 503);
});

test("APP_ENV gana sobre VERCEL_ENV (por ejemplo, producción propia dentro de un build de preview)", () => {
  process.env.VERCEL_ENV = "preview"; process.env.APP_ENV = "production";
  assert.equal(correo.modoCorreo(), "falta");
  process.env.VERCEL_ENV = "production"; process.env.APP_ENV = "development";
  assert.equal(correo.modoCorreo(), "dev");
});

test("un APP_ENV desconocido nunca devuelve códigos en la respuesta", () => {
  process.env.APP_ENV = "staging";
  assert.equal(correo.modoCorreo(), "log");
});

test("APP_COMMIT alimenta la versión de /api/salud", () => {
  process.env.APP_COMMIT = "0123456789abcdef"; assert.equal(salud.version(), "0123456");
  process.env.APP_COMMIT = "no es un sha"; assert.equal(salud.version(), "local");
});

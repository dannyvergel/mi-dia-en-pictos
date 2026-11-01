// Sin base de datos: la demo de siempre (PIN + link con token) tiene que seguir andando.
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../api/_lib/db");
const almacen = require("../api/_lib/almacen");
const { cliente } = require("./ayuda");
const auth = require("../api/auth");
const familia = require("../api/familia");
const dia = require("../api/dia");
const fichas = require("../api/fichas");

delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL; delete process.env.DOCENTE_PIN;
db.usarBaseDePrueba(null);
almacen.usarAlmacenDePrueba(true);

const REG = { alumno: "Juan", fecha: "2026-10-27", animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música", palabra_clave: "música", estado: "bien" }], logros: ["Saludó"], alertas: [], registro_docente: "nota interna" };

test("auth informa modo demo", async () => {
  const r = await cliente().llamar(auth);
  assert.deepEqual(r.body, { modo: "demo", sesion: null });
});

test("publicar exige PIN; con PIN devuelve token y la familia lo lee sin notas internas", async () => {
  const c = cliente();
  const mal = await c.llamar(familia, { method: "POST", body: { accion: "publicar", alumno: "Juan", registros: [REG] }, headers: { "x-docente-pin": "0000" } });
  assert.equal(mal.status, 401);
  const ok = await c.llamar(familia, { method: "POST", body: { accion: "publicar", alumno: "Juan", registros: [REG] }, headers: { "x-docente-pin": "2026" } });
  assert.equal(ok.status, 200);
  assert.match(ok.body.token, /^[a-f0-9]{32}$/);
  const vista = await c.llamar(familia, { query: { t: ok.body.token } });
  assert.equal(vista.status, 200);
  assert.equal(vista.body.alumno, "Juan");
  assert.equal(vista.body.dias.length, 1);
  assert.equal(JSON.stringify(vista.body).includes("nota interna"), false);
});

test("verificar_pin y dia siguen con PIN", async () => {
  const c = cliente();
  assert.equal((await c.llamar(familia, { method: "POST", body: { accion: "verificar_pin" }, headers: { "x-docente-pin": "2026" } })).status, 200);
  assert.equal((await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "x" } })).status, 401);
  delete process.env.OPENROUTER_API_KEY;
  assert.equal((await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "x" }, headers: { "x-docente-pin": "2026" } })).status, 503); // pasa el PIN, sin IA
});

test("las fichas no existen sin base", async () => {
  const r = await cliente().llamar(fichas);
  assert.equal(r.status, 400); assert.equal(r.body.modo, "demo");
});

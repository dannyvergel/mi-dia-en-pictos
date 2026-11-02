// Demo abierto (DEMO_ABIERTO=1, sin base): sin PIN, sin IA aunque haya key y sin publicar links para familias.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const db = require("../api/_lib/db");
const almacen = require("../api/_lib/almacen");
const { cliente } = require("./ayuda");
const auth = require("../api/auth");
const familia = require("../api/familia");
const dia = require("../api/dia");
const agente = require("../api/agente");

delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL; delete process.env.DOCENTE_PIN;
db.usarBaseDePrueba(null);
almacen.usarAlmacenDePrueba(true);
let llamadasIA = 0;
const fetchReal = global.fetch;
global.fetch = async (url, o) => { if (String(url).includes("openrouter")) llamadasIA++; return { ok: false, status: 500, json: async () => ({}) }; };
test.before(() => { process.env.DEMO_ABIERTO = "1"; process.env.OPENROUTER_API_KEY = "sk-prueba"; });
test.after(() => { delete process.env.DEMO_ABIERTO; delete process.env.OPENROUTER_API_KEY; global.fetch = fetchReal; });
const REG = d => ({ alumno: "Juan", fecha: d, animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música", palabra_clave: "música", estado: "bien" }], logros: [], alertas: [] });

test("auth avisa que el demo está abierto", async () => {
  assert.deepEqual((await cliente().llamar(auth)).body, { modo: "demo", sesion: null, abierto: true });
});

test("sin PIN: verificar_pin da ok, pero publicar para familias está bloqueado (no escribe en Blob)", async () => {
  const c = cliente();
  assert.equal((await c.llamar(familia, { method: "POST", body: { accion: "verificar_pin" } })).status, 200);
  const p = await c.llamar(familia, { method: "POST", body: { accion: "publicar", alumno: "Juan", registros: [REG("2026-10-27")] } });
  assert.equal(p.status, 403);
});

test("la IA queda apagada aunque haya key: día y agente en modo demo, sin llamar a OpenRouter", async () => {
  const c = cliente();
  const d = await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "Llegó contento" } });
  assert.equal(d.status, 503);
  const a = await c.llamar(agente, { method: "POST", body: { alumno: "Juan", registros: ["2026-10-27", "2026-10-28", "2026-10-29"].map(REG), ppi: [], perfil: {} } });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.notEqual(a.body.modo, "ia");
  assert.equal(llamadasIA, 0);
});

test("sin DEMO_ABIERTO el demo sigue pidiendo PIN", async () => {
  delete process.env.DEMO_ABIERTO;
  const p = await cliente().llamar(familia, { method: "POST", body: { accion: "publicar", alumno: "Juan", registros: [REG("2026-10-27")] } });
  assert.equal(p.status, 401);
  process.env.DEMO_ABIERTO = "1";
});

test("el cuaderno tiene el modo abierto: cartel de datos de prueba y sin links", () => {
  const h = fs.readFileSync(path.join(__dirname, "..", "cuaderno.html"), "utf8");
  assert.ok(h.includes("if (e.abierto) return modoAbierto();"));
  assert.ok(h.includes("nunca datos reales de chicos"));
  assert.ok(h.includes("if (ABIERTO) return;"));
});

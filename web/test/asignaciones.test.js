// Alumno ↔ docentes: la admin ve todos los alumnos de su escuela; una docente no admin, solo los que tiene asignados.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const db = require("../api/_lib/db");
const auth = require("../api/auth");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const dia = require("../api/dia");
const agente = require("../api/agente");
const correo = require("../api/_lib/correo");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAIL; delete process.env.OPENROUTER_API_KEY;
let pg, ana, beto, caro, zoe, luzId, ids = {};
const post = (c, h, body) => c.llamar(h, { method: "POST", body });
const nombres = async c => (await c.llamar(fichas)).body.alumnos.map(a => a.nombre);
const REG = [{ fecha: "2026-10-01", alumno: "Luz", animo_general: "contento", actividades: [] }];

test.before(async () => {
  pg = await baseNueva();
  correo.usarBuzonDePrueba(true);
  await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@e.edu.ar" });
  await pg.query("INSERT INTO escuelas (nombre) VALUES ('Otra')");
  await pg.query(`INSERT INTO docentes (escuela_id, email, nombre) VALUES (1, 'beto@e.edu.ar', 'Beto'), (1, 'caro@e.edu.ar', 'Caro'), (2, 'zoe@otra.edu.ar', 'Zoe')`);
  for (const d of (await pg.query("SELECT id, email FROM docentes")).rows) ids[d.email.split("@")[0]] = Number(d.id);
  ana = await entrarConCodigo(pg, "ana@e.edu.ar");
  beto = await entrarConCodigo(pg, "beto@e.edu.ar");
  caro = await entrarConCodigo(pg, "caro@e.edu.ar");
  zoe = await entrarConCodigo(pg, "zoe@otra.edu.ar");
});
test.after(() => correo.usarBuzonDePrueba(false));

test("quien crea un alumno queda asignada; la admin lo ve, otra docente no", async () => {
  const r = await post(beto, fichas, { accion: "crear", nombre: "Luz" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  luzId = r.body.alumno.id;
  assert.deepEqual(r.body.alumno.docentes.map(d => d.nombre), ["Beto"]);
  assert.deepEqual(await nombres(beto), ["Luz"]);
  assert.deepEqual(await nombres(ana), ["Luz"]);
  assert.deepEqual(await nombres(caro), []);
  const lista = await caro.llamar(fichas);
  assert.equal(lista.body.es_admin, false);
  assert.deepEqual(lista.body.docentes.map(d => d.nombre).sort(), ["Ana", "Beto", "Caro"]); // para elegir a quién asignar
});

test("una docente sin asignación no ve ni toca al alumno en ninguna API", async () => {
  const id = String(luzId);
  assert.equal((await caro.llamar(fichas, { query: { id } })).status, 404);
  for (const body of [{ accion: "guardar", id: luzId, contactos: [] }, { accion: "borrar", id: luzId }, { accion: "invitar", id: luzId, email: "x@x.com" },
    { accion: "asignar", id: luzId, docente_id: ids.caro }, { accion: "desasignar", id: luzId, docente_id: ids.beto }])
    assert.equal((await post(caro, fichas, body)).status, 404, body.accion);
  assert.equal((await caro.llamar(familia, { query: { alumno: id } })).status, 404);
  assert.equal((await post(caro, familia, { accion: "publicar", alumno_id: luzId, registros: REG })).status, 404);
  assert.equal((await post(caro, familia, { accion: "publicar", alumno: "Luz", registros: REG })).status, 404);
  assert.equal((await post(caro, familia, { accion: "preguntar", alumno_id: luzId, pregunta: "¿Cómo le fue?" })).status, 404);
  assert.equal((await post(caro, dia, { alumno: "Luz", texto: "Llegó contenta" })).status, 404);
  assert.equal((await post(caro, agente, { alumno: "Luz", registros: REG })).status, 404);
  // Las que sí lo tienen pasan los mismos controles
  assert.equal((await post(beto, familia, { accion: "publicar", alumno_id: luzId, registros: REG })).status, 200);
  assert.equal((await beto.llamar(familia, { query: { alumno: id } })).status, 200);
  assert.equal((await post(beto, dia, { alumno: "Luz", texto: "x" })).status, 503); // autorizada; sin IA
  assert.equal((await ana.llamar(fichas, { query: { id } })).status, 200);
  assert.equal((await post(ana, familia, { accion: "publicar", alumno: "Luz", registros: REG })).status, 200);
  // Otra escuela, ni siendo asignada por error
  assert.equal((await zoe.llamar(fichas, { query: { id } })).status, 404);
});

test("asignar: la docente asignada suma a otra de su escuela; no a una de otra escuela", async () => {
  assert.equal((await post(beto, fichas, { accion: "asignar", id: luzId, docente_id: ids.zoe })).status, 404);
  const r = await post(beto, fichas, { accion: "asignar", id: luzId, docente_id: ids.caro });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.alumno.docentes.map(d => d.nombre), ["Beto", "Caro"]);
  assert.deepEqual(await nombres(caro), ["Luz"]);
  assert.equal((await caro.llamar(familia, { query: { alumno: String(luzId) } })).status, 200);
});

test("quitar: una docente no admin no puede sacar a otra, sí a sí misma; la admin a cualquiera", async () => {
  assert.equal((await post(caro, fichas, { accion: "desasignar", id: luzId, docente_id: ids.beto })).status, 403);
  const yo = await post(caro, fichas, { accion: "desasignar", id: luzId, docente_id: ids.caro });
  assert.equal(yo.status, 200); assert.equal(yo.body.alumno, null);
  assert.deepEqual(await nombres(caro), []);
  const r = await post(ana, fichas, { accion: "desasignar", id: luzId, docente_id: ids.beto });
  assert.equal(r.status, 200); assert.deepEqual(r.body.alumno.docentes, []);
  assert.deepEqual(await nombres(beto), []);
  assert.deepEqual(await nombres(ana), ["Luz"]); // la admin lo sigue viendo
  assert.equal((await post(ana, fichas, { accion: "asignar", id: luzId, docente_id: ids.beto })).status, 200);
  assert.deepEqual(await nombres(beto), ["Luz"]);
});

test("migración: alumnos sin asignar quedan asignados una sola vez a las docentes activas de su escuela", async () => {
  await pg.query("UPDATE docentes SET activo = false WHERE email = 'caro@e.edu.ar'");
  const viejo = Number((await pg.query("INSERT INTO alumnos (escuela_id, nombre) VALUES (1, 'Viejo') RETURNING id")).rows[0].id);
  await pg.query("INSERT INTO alumnos (escuela_id, nombre) VALUES (2, 'Ajeno')");
  await pg.query("DELETE FROM migraciones");
  const cli = { query: async (t, p) => (await pg.query(t, p)).rows };
  await db.asegurarEsquema(cli);
  const asign = async nombre => (await pg.query(`SELECT d.email FROM alumno_docentes ad JOIN docentes d ON d.id = ad.docente_id
    JOIN alumnos a ON a.id = ad.alumno_id WHERE a.nombre = $1 ORDER BY d.email`, [nombre])).rows.map(r => r.email);
  assert.deepEqual(await asign("Viejo"), ["ana@e.edu.ar", "beto@e.edu.ar"]); // Caro inactiva: no
  assert.deepEqual(await asign("Ajeno"), ["zoe@otra.edu.ar"]);
  assert.deepEqual(await asign("Luz"), ["beto@e.edu.ar"]); // ya tenía: no se toca
  // Una sola vez: correr el esquema de nuevo no vuelve a asignar
  await pg.query("DELETE FROM alumno_docentes WHERE alumno_id = $1", [viejo]);
  await db.asegurarEsquema(cli);
  assert.deepEqual(await asign("Viejo"), []);
  assert.deepEqual(await nombres(beto), ["Luz"]);
  await pg.query("UPDATE docentes SET activo = true WHERE email = 'caro@e.edu.ar'");
});

test("solo la dirección (admin) puede borrar un alumno, aunque la docente lo tenga asignado", async () => {
  const r = await post(beto, fichas, { accion: "borrar", id: luzId });
  assert.equal(r.status, 403);
  assert.equal((await beto.llamar(fichas, { query: { id: String(luzId) } })).status, 200);
});

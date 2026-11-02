// Roles: plataforma (superadmin) → directoras/admins de escuela → docentes. Ruteo de solicitudes por escuela.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const auth = require("../api/auth");
const solicitudes = require("../api/solicitudes");
const escuelas = require("../api/escuelas");
const docentes = require("../api/docentes");
const correo = require("../api/_lib/correo");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.PUENTE_URL;
const GAVIOTA = "820060800", ALBORADA = "820002100";
let pg, ana, marta, buzon, alborada;
const post = (c, body, h = solicitudes) => c.llamar(h, { method: "POST", body });
const pedir = (extra) => post(cliente(), { accion: "crear", nombre: "X", escuela: "Alguna", ...extra });
const solicitud = async email => (await pg.query("SELECT * FROM solicitudes WHERE email = $1 ORDER BY id DESC LIMIT 1", [email])).rows[0];

test.before(async () => {
  process.env.ADMIN_EMAIL = "ana@plataforma.org";
  pg = await baseNueva();
  buzon = correo.usarBuzonDePrueba(true);
  // ADMIN_EMAIL con escuela propia (como la cuenta de Danny en producción, creada antes de que el alta fuera sin escuela).
  await altaEscuela({ cue: GAVIOTA, nombre: "Ana", email: "ana@plataforma.org" });
  ana = await entrarConCodigo(pg, "ana@plataforma.org");
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.ADMIN_EMAIL; });
test.beforeEach(async () => { await pg.query("DELETE FROM limites"); buzon.length = 0; });

test("la cuenta de ADMIN_EMAIL es de la plataforma", async () => {
  const s = (await ana.llamar(auth)).body.sesion;
  assert.equal(s.es_plataforma, true); assert.equal(s.es_admin, true);
});

test("escuela que no está en Puente → va a la plataforma; aprobar crea la escuela desde el padrón y la deja admin", async () => {
  assert.equal((await pedir({ nombre: "Marta", email: "marta@alborada.edu.ar", escuela: "Alborada", cue: ALBORADA })).status, 200);
  const s = await solicitud("marta@alborada.edu.ar");
  assert.equal(s.destino, "plataforma"); assert.equal(s.escuela_id, null);
  assert.deepEqual(buzon[0].to, ["ana@plataforma.org"]);
  const r = await post(ana, { accion: "aprobar", id: s.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.escuela.cue, ALBORADA); assert.equal(r.body.docente.es_admin, true);
  alborada = Number(r.body.escuela.id);
  marta = await entrarConCodigo(pg, "marta@alborada.edu.ar");
  const yo = (await marta.llamar(auth)).body.sesion;
  assert.equal(yo.es_admin, true); assert.equal(yo.es_plataforma, false);
});

test("escuela que ya está en Puente con admin → va solo a sus admins (mail solo a ellas)", async () => {
  await pedir({ nombre: "Rosa", email: "rosa@alborada.edu.ar", cue: ALBORADA });
  const s = await solicitud("rosa@alborada.edu.ar");
  assert.equal(s.destino, "escuela"); assert.equal(Number(s.escuela_id), alborada);
  assert.equal(buzon.length, 1); assert.deepEqual(buzon[0].to, ["marta@alborada.edu.ar"]);
});

test("\"soy director/a\" o sin CUE → plataforma aunque la escuela exista", async () => {
  await pedir({ nombre: "Directora Nueva", email: "dire@alborada.edu.ar", cue: ALBORADA, es_director: true });
  const d = await solicitud("dire@alborada.edu.ar");
  assert.equal(d.destino, "plataforma"); assert.equal(d.es_director, true); assert.equal(Number(d.escuela_id), alborada);
  assert.deepEqual(buzon[0].to, ["ana@plataforma.org"]);
  assert.match(buzon[0].text, /directora/);
  await pedir({ nombre: "Sin Cue", email: "sincue@x.com" });
  assert.equal((await solicitud("sincue@x.com")).destino, "plataforma");
});

test("una escuela desactivada o sin admins no recibe solicitudes: van a la plataforma", async () => {
  await pg.query("UPDATE docentes SET es_admin = false WHERE email = 'marta@alborada.edu.ar'");
  await pedir({ nombre: "Uno", email: "uno@alborada.edu.ar", cue: ALBORADA });
  assert.equal((await solicitud("uno@alborada.edu.ar")).destino, "plataforma");
  await pg.query("UPDATE docentes SET es_admin = true WHERE email = 'marta@alborada.edu.ar'");
  await pg.query("DELETE FROM solicitudes WHERE email = 'uno@alborada.edu.ar'");
});

test("la admin de escuela ve solo las solicitudes de su escuela y no puede tocar las ajenas", async () => {
  await pedir({ nombre: "Lía", email: "lia@gaviota.edu.ar", cue: GAVIOTA }); // Gaviota: escuela de Ana (admin) → destino escuela 1
  const lia = await solicitud("lia@gaviota.edu.ar");
  assert.equal(lia.destino, "escuela");
  const r = await marta.llamar(solicitudes);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.pendientes.map(s => s.email), ["rosa@alborada.edu.ar"]);
  assert.equal(r.body.plataforma, false);
  assert.deepEqual(r.body.escuelas.map(e => Number(e.id)), [alborada]);
  assert.equal((await post(marta, { accion: "aprobar", id: lia.id })).status, 404);
  assert.equal((await post(marta, { accion: "rechazar", id: lia.id })).status, 404);
  const dire = await solicitud("dire@alborada.edu.ar"); // es de su escuela pero va a la plataforma
  assert.equal((await post(marta, { accion: "aprobar", id: dire.id })).status, 404);
  assert.equal((await solicitud("lia@gaviota.edu.ar")).estado, "pendiente");
});

test("la admin de escuela aprueba en su escuela y no puede elegir otra ni crear escuelas", async () => {
  const rosa = await solicitud("rosa@alborada.edu.ar");
  assert.equal((await post(marta, { accion: "aprobar", id: rosa.id, escuela_id: 1 })).status, 403);
  assert.equal((await post(marta, { accion: "aprobar", id: rosa.id, escuela_nueva: "Otra" })).status, 403);
  assert.equal((await post(marta, { accion: "aprobar", id: rosa.id, desde_padron: true })).status, 403);
  const r = await post(marta, { accion: "aprobar", id: rosa.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(Number(r.body.escuela.id), alborada); assert.equal(r.body.docente.es_admin, false);
});

test("la plataforma ve todas las pendientes; aprobar a una directora de escuela existente la hace admin", async () => {
  const r = await ana.llamar(solicitudes);
  assert.equal(r.body.plataforma, true);
  const emails = r.body.pendientes.map(s => s.email).sort();
  assert.deepEqual(emails, ["dire@alborada.edu.ar", "lia@gaviota.edu.ar", "sincue@x.com"]);
  assert.ok(r.body.escuelas.length >= 2);
  const dire = r.body.pendientes.find(s => s.email === "dire@alborada.edu.ar");
  const a = await post(ana, { accion: "aprobar", id: dire.id });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(Number(a.body.escuela.id), alborada); assert.equal(a.body.docente.es_admin, true);
});

test("lista de escuelas solo para la plataforma, con conteos y aval", async () => {
  await pg.query("INSERT INTO alumnos (escuela_id, nombre) VALUES ($1, 'Tomi')", [alborada]);
  const r = await ana.llamar(escuelas, { query: { todas: "1" } });
  assert.equal(r.status, 200);
  const e = r.body.escuelas.find(x => x.id === alborada);
  assert.equal(e.cue, ALBORADA); assert.equal(e.docentes, 3); assert.equal(e.admins, 2); assert.equal(e.alumnos, 1);
  assert.equal(e.aval_firmado, false); assert.equal(e.activa, true);
  assert.equal((await marta.llamar(escuelas, { query: { todas: "1" } })).status, 403);
  assert.equal((await post(marta, { accion: "desactivar_escuela", id: 1 }, escuelas)).status, 403);
});

test("desactivar una escuela corta sus sesiones y el ingreso; reactivarla lo devuelve", async () => {
  assert.equal((await post(ana, { accion: "desactivar_escuela", id: 1 }, escuelas)).status, 400); // la propia no
  const r = await post(ana, { accion: "desactivar_escuela", id: alborada }, escuelas);
  assert.equal(r.status, 200); assert.equal(r.body.escuela.activa, false);
  assert.equal((await marta.llamar(auth)).body.sesion, null);
  assert.equal((await marta.llamar(solicitudes)).status, 401);
  const p = await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "marta@alborada.edu.ar" }, auth);
  assert.equal(p.status, 200); assert.equal(p.body.codigo_dev, undefined); // no hay cuenta habilitada (respuesta genérica)
  await pedir({ nombre: "Nueva", email: "nueva@alborada.edu.ar", cue: ALBORADA });
  assert.equal((await solicitud("nueva@alborada.edu.ar")).destino, "plataforma");
  assert.equal((await post(ana, { accion: "activar_escuela", id: alborada }, escuelas)).status, 200);
  marta = await entrarConCodigo(pg, "marta@alborada.edu.ar");
  assert.equal((await marta.llamar(auth)).body.sesion.es_admin, true);
});

test("promover a otra cuenta como plataforma está bloqueado (también para ADMIN_EMAIL)", async () => {
  const id = Number((await pg.query("SELECT id FROM docentes WHERE email = 'marta@alborada.edu.ar'")).rows[0].id);
  const anaId = Number((await pg.query("SELECT id FROM docentes WHERE email = 'ana@plataforma.org'")).rows[0].id);
  assert.equal((await post(marta, { accion: "plataforma", id: anaId, valor: false }, docentes)).status, 403);
  const r = await post(ana, { accion: "plataforma", id, valor: true }, docentes);
  assert.equal(r.status, 403); assert.match(r.body.error, /ADMIN_EMAIL/);
  assert.equal((await pg.query("SELECT es_plataforma FROM docentes WHERE id = $1", [id])).rows[0].es_plataforma, false);
});

test("panel admin: una cuenta promovida (es_plataforma en la base) o una directora no hacen nada de plataforma; ADMIN_EMAIL sí", async () => {
  // Simula una cuenta promovida antes del bloqueo: la marca de la base ya no da permisos.
  await pg.query("UPDATE docentes SET es_plataforma = true WHERE email = 'marta@alborada.edu.ar'");
  try {
    const yo = (await marta.llamar(auth)).body.sesion;
    assert.equal(yo.es_plataforma, false); assert.equal(yo.es_admin, true);
    const sol = await marta.llamar(solicitudes);
    assert.equal(sol.body.plataforma, false);
    assert.ok(!sol.body.pendientes.some(s => s.email === "lia@gaviota.edu.ar"), "no ve las solicitudes de otras escuelas");
    for (const [h, pedido] of [
      [escuelas, { query: { todas: "1" } }],
      [escuelas, { query: { ficha: "1", id: "1" } }],
      [escuelas, { method: "POST", body: { accion: "crear_escuela", cue: "820060800" } }],
      [escuelas, { method: "POST", body: { accion: "desactivar_escuela", id: 1 } }],
      [escuelas, { method: "POST", body: { accion: "activar_escuela", id: 1 } }],
      [escuelas, { method: "POST", body: { accion: "guardar_ficha", escuela_id: 1, nombre: "Hackeada" } }],
      [docentes, { method: "POST", body: { accion: "invitacion_crear", escuela_id: 1, es_admin: true } }],
      [docentes, { method: "POST", body: { accion: "invitacion_crear", cue: "820060800", es_admin: true } }],
      [require("../api/feedback"), {}]
    ]) {
      const r = await marta.llamar(h, pedido);
      assert.equal(r.status, 403, `${JSON.stringify(pedido)} → ${r.status} ${JSON.stringify(r.body)}`);
    }
    // El registro de accesos de una directora queda recortado a su escuela.
    const reg = await marta.llamar(require("../api/auditoria"));
    assert.equal(reg.body.plataforma, false);
    assert.ok(reg.body.eventos.every(e => e.escuela_id === alborada));
    // Las invitaciones de la directora: solo su escuela.
    const inv = await marta.llamar(docentes, { query: { invitaciones: "1" } });
    assert.equal(inv.body.plataforma, false);
    assert.deepEqual(inv.body.escuelas.map(e => e.id), [alborada]);
    assert.equal((await pg.query("SELECT nombre FROM escuelas WHERE id = 1")).rows[0].nombre, "ESCUELA ESPECIAL NRO 2085 JUAN SALVADOR GAVIOTA");
  } finally { await pg.query("UPDATE docentes SET es_plataforma = false WHERE email = 'marta@alborada.edu.ar'"); }
  // ADMIN_EMAIL sí puede todo eso.
  assert.equal((await ana.llamar(escuelas, { query: { todas: "1" } })).status, 200);
  assert.equal((await ana.llamar(escuelas, { query: { ficha: "1", id: String(alborada) } })).body.ficha.cue, ALBORADA);
  assert.equal((await ana.llamar(require("../api/feedback"))).status, 200);
  assert.equal((await ana.llamar(require("../api/auditoria"))).body.plataforma, true);
});

test("sin ADMIN_EMAIL no hay plataforma: ni la cuenta marcada es_plataforma entra al panel", async () => {
  const antes = process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_EMAIL;
  await pg.query("UPDATE docentes SET es_plataforma = true WHERE email = 'ana@plataforma.org'");
  try {
    assert.equal((await ana.llamar(auth)).body.sesion.es_plataforma, false);
    assert.equal((await ana.llamar(escuelas, { query: { todas: "1" } })).status, 403);
  } finally { process.env.ADMIN_EMAIL = antes; }
});

test("panel admin: alta de escuela desde el padrón y ficha de cualquier escuela, solo ADMIN_EMAIL", async () => {
  const LA_CUE = "820060800"; // ya está (Gaviota): devuelve la misma, sin duplicar
  const ya = await post(ana, { accion: "crear_escuela", cue: LA_CUE }, escuelas);
  assert.equal(ya.status, 200); assert.equal(ya.body.creada, false); assert.equal(ya.body.escuela.id, 1);
  assert.equal((await post(ana, { accion: "crear_escuela", cue: "12" }, escuelas)).status, 400);
  assert.equal((await post(ana, { accion: "crear_escuela", cue: "829999999" }, escuelas)).status, 404);
  const g = await post(ana, { accion: "guardar_ficha", escuela_id: alborada, nombre: "Alborada", cue: ALBORADA, aval_firmado: true, aval_por: "Directora" }, escuelas);
  assert.equal(g.status, 200, JSON.stringify(g.body)); assert.equal(g.body.ficha.nombre, "Alborada"); assert.equal(g.body.ficha.aval_firmado, true);
  assert.equal((await post(ana, { accion: "guardar_ficha", escuela_id: 999, nombre: "No existe" }, escuelas)).status, 404);
  const t = (await ana.llamar(escuelas, { query: { todas: "1" } })).body.escuelas.find(e => e.id === alborada);
  assert.equal(t.aval_firmado, true); assert.equal(typeof t.links_pendientes, "number");
});

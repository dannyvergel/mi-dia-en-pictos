// Métricas de uso del piloto: contadores diarios por escuela, sin datos de personas.
// Se suman al publicar un día nuevo, cuando la familia lo abre ese mismo día y cuando se acepta un link de invitación.
// Solo ADMIN_EMAIL ve el resumen («Uso del piloto» en admin.html) y la limpieza diaria borra lo de más de 400 días.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const auth = require("../api/auth");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const docentes = require("../api/docentes");
const auditoria = require("../api/auditoria");
const metricas = require("../api/_lib/metricas");
const { hoyLocal } = require("../api/_lib/http");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY;
const ADMIN = "plataforma@puente.test";
const post = (c, h, body) => c.llamar(h, { method: "POST", body });
const get = (c, h, query) => c.llamar(h, { method: "GET", query });
const masDias = (f, n) => new Date(Date.parse(f + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const HOY = hoyLocal(), AYER = masDias(HOY, -1);
const dia = (fecha, alumno = "Juan") => ({ alumno, fecha, animo_general: "contento", actividades: [{ hora: "10:00", actividad: "Recreo", palabra_clave: "recreo", estado: "bien" }] });

let pg, ana, laura, juanId, escuelaId;
const contador = async (clave, fecha = HOY) => (await pg.query(
  "SELECT coalesce(sum(cantidad), 0)::int AS n FROM metricas_diarias WHERE clave = $1 AND fecha = $2::date", [clave, fecha])).rows[0].n;

test.before(async () => {
  process.env.ADMIN_EMAIL = ADMIN;
  process.env.CRON_SECRET = "secreto-de-prueba-123456";
  pg = await baseNueva();
  await require("../api/_lib/db").q("SELECT 1");
  await pg.query("INSERT INTO docentes (email, nombre) VALUES ($1, 'Plataforma')", [ADMIN]);
  escuelaId = (await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" })).escuela_id;
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  juanId = (await post(ana, fichas, { accion: "crear", nombre: "Juan" })).body.alumno.id;
  await post(ana, fichas, { accion: "guardar", id: juanId, nombre: "Juan", contactos: [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com" }] });
  laura = await entrarConCodigo(pg, "laura@mail.com", "familia");
});
test.after(() => { delete process.env.ADMIN_EMAIL; delete process.env.CRON_SECRET; });

test("publicar un día nuevo suma dia_cargado una vez por alumno y fecha (republicar no suma)", async () => {
  const r = await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [dia(AYER)] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await contador("dia_cargado", AYER), 1);
  // Misma fecha otra vez (la seño corrige): no suma. Sumar hoy: suma solo hoy.
  await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [dia(AYER)] });
  await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [dia(HOY), dia(AYER)] });
  assert.equal(await contador("dia_cargado", AYER), 1);
  assert.equal(await contador("dia_cargado", HOY), 1);
  // Una fecha futura no cuenta como día cargado.
  await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [dia(masDias(HOY, 3)), dia(HOY), dia(AYER)] });
  assert.equal(await contador("dia_cargado", masDias(HOY, 3)), 0);
  const fila = (await pg.query("SELECT escuela_id FROM metricas_diarias WHERE clave = 'dia_cargado' AND fecha = $1::date", [HOY])).rows[0];
  assert.equal(Number(fila.escuela_id), escuelaId);
});

test("la familia que abre el día de hoy suma dia_visto_familia una sola vez; la seño que prueba la vista no cuenta", async () => {
  metricas.olvidarVistos();
  const antes = await contador("dia_visto_familia");
  assert.equal((await get(ana, familia, { alumno: juanId })).status, 200);
  assert.equal(await contador("dia_visto_familia"), antes, "la docente no suma");
  assert.equal((await get(laura, familia, { alumno: juanId })).status, 200);
  assert.equal((await get(laura, familia, { alumno: juanId })).status, 200);
  const otra = await entrarConCodigo(pg, "laura@mail.com", "familia"); // otro dispositivo de la misma familia
  assert.equal((await get(otra, familia, { alumno: juanId })).status, 200);
  assert.equal(await contador("dia_visto_familia"), antes + 1);
});

test("si hoy no hay día publicado, abrir el espacio no suma nada", async () => {
  metricas.olvidarVistos();
  const pedroId = (await post(ana, fichas, { accion: "crear", nombre: "Pedro" })).body.alumno.id;
  await post(ana, fichas, { accion: "guardar", id: pedroId, nombre: "Pedro", contactos: [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com" }] });
  await post(ana, familia, { accion: "publicar", alumno_id: pedroId, registros: [dia(AYER, "Pedro")] });
  const antes = await contador("dia_visto_familia");
  assert.equal((await get(laura, familia, { alumno: pedroId })).status, 200);
  assert.equal(await contador("dia_visto_familia"), antes);
});

test("aceptar un link de invitación suma invitacion_aceptada para la escuela", async () => {
  const plataforma = await entrarConCodigo(pg, ADMIN);
  const l = await post(plataforma, docentes, { accion: "invitacion_crear", escuela_id: escuelaId, es_admin: false, etiqueta: "Seño nueva" });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const token = l.body.enlace.url.split("#invitacion=")[1];
  const c = cliente();
  await pg.query("DELETE FROM limites");
  const p = await post(c, auth, { accion: "invitacion_pedir_codigo", token, email: "sol@escuela.edu.ar" });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const v = await post(c, auth, { accion: "invitacion_verificar", token, email: "sol@escuela.edu.ar", codigo: p.body.codigo_dev, nombre: "Sol Gómez" });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const r = (await pg.query("SELECT escuela_id, cantidad FROM metricas_diarias WHERE clave = 'invitacion_aceptada'")).rows;
  assert.deepEqual(r.map(x => [Number(x.escuela_id), x.cantidad]), [[escuelaId, 1]]);
});

test("no se guarda ningún identificador personal: solo fecha, escuela, clave y cantidad", async () => {
  const cols = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'metricas_diarias' ORDER BY ordinal_position`)).rows.map(r => r.column_name);
  assert.deepEqual(cols, ["fecha", "escuela_id", "clave", "cantidad"]);
  const filas = (await pg.query("SELECT * FROM metricas_diarias")).rows;
  assert.ok(filas.length >= 3);
  const todo = JSON.stringify(filas);
  for (const prohibido of ["laura", "ana@", "sol@", "Juan", "Pedro", "Sol Gómez", "10.0.0", "@"]) assert.equal(todo.includes(prohibido), false, prohibido + " en " + todo);
  for (const f of filas) assert.ok(metricas.CLAVES.includes(f.clave));
  // El código tampoco recibe alumno_id para guardarlo: la clave del "visto" vive solo en memoria y con sal diaria.
  const src = fs.readFileSync(path.join(__dirname, "../api/_lib/metricas.js"), "utf8");
  assert.equal(/INSERT INTO metricas_diarias \([^)]*(alumno|usuario|user|email|ip|agent)/i.test(src), false);
});

test("solo ADMIN_EMAIL ve «Uso del piloto»: la dirección de una escuela, una familia o alguien sin sesión, no", async () => {
  assert.equal((await get(ana, auditoria, { accion: "uso" })).status, 403);
  assert.equal((await get(laura, auditoria, { accion: "uso" })).status === 200, false);
  assert.equal((await get(cliente(), auditoria, { accion: "uso" })).status, 401);
  const plataforma = await entrarConCodigo(pg, ADMIN);
  const r = await get(plataforma, auditoria, { accion: "uso" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.semanas.length, 8);
  assert.equal(r.body.retencion_dias, 400);
  const ultima = r.body.semanas[7];
  assert.ok(ultima.desde <= HOY && HOY <= ultima.hasta);
  // admin.html tiene la sección y la pide a este endpoint.
  const html = fs.readFileSync(path.join(__dirname, "../admin.html"), "utf8");
  assert.match(html, /Uso del piloto/); assert.match(html, /api\/auditoria\?accion=uso/);
});

test("el resumen semanal: días cargados, % vistos el mismo día (nunca más de 100) y escuelas activas", async () => {
  await pg.query("DELETE FROM metricas_diarias");
  const hoy = "2026-11-06"; // viernes; la semana va del lunes 2 al domingo 8
  await metricas.sumar("dia_cargado", { escuela_id: 1, fecha: "2026-11-02", cantidad: 4 });
  await metricas.sumar("dia_visto_familia", { escuela_id: 1, fecha: "2026-11-02", cantidad: 3 });
  await metricas.sumar("dia_cargado", { escuela_id: 2, fecha: "2026-11-05", cantidad: 1 });
  await metricas.sumar("dia_visto_familia", { escuela_id: 2, fecha: "2026-11-05", cantidad: 5 }); // de más (dos instancias): se acota a 1
  await metricas.sumar("dia_visto_familia", { escuela_id: 3, fecha: "2026-11-05", cantidad: 2 }); // sin días cargados: no es escuela activa
  await metricas.sumar("dia_cargado", { escuela_id: 1, fecha: "2026-10-30", cantidad: 2 });      // semana anterior
  await metricas.sumar("dia_cargado", { escuela_id: 1, fecha: "2026-08-01", cantidad: 9 });      // fuera de las 8 semanas
  const s = await metricas.resumenSemanas(8, hoy);
  assert.equal(s[0].desde, "2026-09-14");
  assert.deepEqual(s[7], { desde: "2026-11-02", hasta: "2026-11-08", dias_cargados: 5, dias_vistos_mismo_dia: 4, pct_vistos_mismo_dia: 80, escuelas_activas: 2, invitaciones_aceptadas: 0 });
  assert.equal(s[6].dias_cargados, 2); assert.equal(s[6].escuelas_activas, 1);
  assert.equal(s[5].pct_vistos_mismo_dia, null);
  assert.equal(s.reduce((a, x) => a + x.dias_cargados, 0), 7);
  assert.equal(metricas.lunesDe("2026-11-08"), "2026-11-02"); // domingo → lunes anterior
  assert.equal(await metricas.sumar("otra_cosa", { escuela_id: 1 }), false); // claves fuera de la lista no se guardan
});

test("retención: la limpieza diaria borra las métricas de más de 400 días y deja las demás", async () => {
  await pg.query("DELETE FROM metricas_diarias");
  await metricas.sumar("dia_cargado", { escuela_id: 1, fecha: masDias(HOY, -401) });
  await metricas.sumar("dia_cargado", { escuela_id: 1, fecha: masDias(HOY, -399) });
  await metricas.sumar("dia_cargado", { escuela_id: 1, fecha: HOY });
  assert.equal((await get(cliente(), auditoria, { accion: "limpieza" })).status, 401); // sin CRON_SECRET no limpia
  const r = await cliente().llamar(auditoria, { query: { accion: "limpieza" }, headers: { authorization: "Bearer " + process.env.CRON_SECRET } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.plazos.metricas, 400);
  assert.equal(r.body.borrado.metricas_diarias, 1);
  const quedan = (await pg.query("SELECT to_char(fecha, 'YYYY-MM-DD') AS f FROM metricas_diarias ORDER BY fecha")).rows.map(x => x.f);
  assert.deepEqual(quedan, [masDias(HOY, -399), HOY]);
  // Configurable, con el mismo criterio que los otros plazos.
  process.env.METRICAS_RETENCION_DIAS = "abc"; assert.equal(require("../api/_lib/retencion").plazos().metricas, 400);
  process.env.METRICAS_RETENCION_DIAS = "500"; assert.equal(require("../api/_lib/retencion").plazos().metricas, 500);
  delete process.env.METRICAS_RETENCION_DIAS;
});

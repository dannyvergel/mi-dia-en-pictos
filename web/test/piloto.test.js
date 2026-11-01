// Piloto: baja y borrado, retención, auditoría (con alerta de fallos), feedback y config pública.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const auditoriaApi = require("../api/auditoria");
const feedback = require("../api/feedback");
const config = require("../api/config");
const correo = require("../api/_lib/correo");
const A = require("../api/_lib/auditoria");
const R = require("../api/_lib/retencion");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY;
process.env.ADMIN_EMAIL = "ana@escuela.edu.ar";
const post = (c, h, body) => c.llamar(h, { method: "POST", body });
const cuenta = async (sql, p) => (await pg.query(sql, p)).rows[0].n;

let pg, ana, caro, buzon, juanId, sofiId;
const REG = f => ({ alumno: "Juan", fecha: f, animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música", palabra_clave: "música", estado: "bien" }], logros: [], alertas: [] });
const hoy = () => new Date().toISOString().slice(0, 10);

test.before(async () => {
  pg = await baseNueva();
  buzon = correo.usarBuzonDePrueba(true);
  await post(cliente(), auth, { accion: "setup", escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar", pin: "4321" });
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES (1, 'caro@escuela.edu.ar', 'Caro')");
  caro = await entrarConCodigo(pg, "caro@escuela.edu.ar");
  juanId = (await post(ana, fichas, { accion: "crear", nombre: "Juan", contactos: [{ nombre: "Laura", email: "laura@mail.com" }, { nombre: "Pablo", email: "pablo@mail.com" }] })).body.alumno.id;
  sofiId = (await post(ana, fichas, { accion: "crear", nombre: "Sofía", contactos: [{ nombre: "Pablo", email: "pablo@mail.com" }] })).body.alumno.id;
  buzon.length = 0;
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.ADMIN_EMAIL; });

test("auditoría: IP truncada y email hasheado", () => {
  assert.equal(A.ipTruncada("190.12.34.56"), "190.12.34.0");
  assert.equal(A.ipTruncada("2800:810:4a1:1234::1"), "2800:810:4a1::");
  assert.notEqual(A.hashEmail("laura@mail.com"), "laura@mail.com");
  assert.equal(A.hashEmail("Laura@Mail.com"), A.hashEmail("laura@mail.com"));
  assert.equal(A.emailEnmascarado("laura@mail.com"), "l***@mail.com");
});

test("login OK queda registrado sin email en claro", async () => {
  const filas = (await pg.query("SELECT * FROM auditoria WHERE evento = 'login_ok'")).rows;
  assert.ok(filas.length >= 2);
  assert.equal(JSON.stringify(filas).includes("@"), false);
  assert.ok(filas.every(f => /\.0$/.test(f.ip)));
});

test("N códigos incorrectos para una cuenta → alerta por mail a la plataforma (una sola vez por hora)", async () => {
  await pg.query("DELETE FROM limites");
  const c = cliente();
  assert.equal((await post(c, auth, { accion: "pedir_codigo", tipo: "docente", email: "caro@escuela.edu.ar" })).status, 200);
  for (let i = 0; i < 7; i++) await post(cliente(), auth, { accion: "verificar_codigo", tipo: "docente", email: "caro@escuela.edu.ar", codigo: "000000" });
  const alertas = buzon.filter(m => /códigos incorrectos/.test(m.subject));
  assert.equal(alertas.length, 1);
  assert.deepEqual(alertas[0].to, ["ana@escuela.edu.ar"]);
  assert.equal(alertas[0].text.includes("caro@escuela.edu.ar"), false); // enmascarado
  assert.ok(alertas[0].text.includes("c***@escuela.edu.ar"));
  assert.ok(await cuenta("SELECT count(*)::int AS n FROM auditoria WHERE evento = 'login_fallido'") >= 5);
});

test("acceso a fichas y exportación quedan en la auditoría", async () => {
  await ana.llamar(fichas, { query: { id: String(juanId) } });
  const ex = await ana.llamar(fichas, { query: { id: String(juanId), exportar: "1" } });
  assert.equal(ex.status, 200); assert.equal(ex.body.alumno.nombre, "Juan");
  assert.ok(await cuenta("SELECT count(*)::int AS n FROM auditoria WHERE evento = 'ficha_ver' AND objeto_id = $1", [juanId]) >= 1);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM auditoria WHERE evento = 'exportacion'"), 1);
});

test("vista del registro: admin y plataforma sí; docente común no", async () => {
  const r = await ana.llamar(auditoriaApi);
  assert.equal(r.status, 200);
  assert.ok(r.body.eventos.length > 0);
  assert.equal(JSON.stringify(r.body.eventos).includes("@"), false);
  assert.equal((await caro.llamar(auditoriaApi)).status, 403);
  assert.equal((await cliente().llamar(auditoriaApi)).status, 401);
});

test("limpieza por cron: exige CRON_SECRET y borra chat viejo", async () => {
  await pg.query("INSERT INTO chat_turnos (usuario_tipo, usuario_id, alumno_id, rol, texto, creado) VALUES ('familia', 1, $1, 'familia', 'vieja', now() - interval '40 days')", [juanId]);
  delete process.env.CRON_SECRET;
  assert.equal((await cliente().llamar(auditoriaApi, { query: { accion: "limpieza" } })).status, 401);
  process.env.CRON_SECRET = "secreto-de-cron-de-prueba-123";
  assert.equal((await cliente().llamar(auditoriaApi, { query: { accion: "limpieza" }, headers: { authorization: "Bearer otro" } })).status, 401);
  const r = await cliente().llamar(auditoriaApi, { query: { accion: "limpieza" }, headers: { authorization: "Bearer secreto-de-cron-de-prueba-123" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.borrado.chat_turnos, 1);
  assert.equal(r.body.plazos.chat, 30);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM fichas"), 2); // nunca borra fichas
  delete process.env.CRON_SECRET;
});

test("retención de días publicados: configurable, por defecto 365", async () => {
  assert.equal(R.plazos().dias_publicados, 365);
  process.env.DIAS_PUBLICADOS_RETENCION = "30";
  const viejo = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
  assert.deepEqual(R.filtrarDiasVigentes([REG(viejo), REG(hoy())]).map(r => r.fecha), [hoy()]);
  const pub = await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [REG(viejo), REG(hoy())] });
  assert.equal(pub.body.dias, 1);
  delete process.env.DIAS_PUBLICADOS_RETENCION;
  process.env.DIAS_PUBLICADOS_RETENCION = "abc"; assert.equal(R.plazos().dias_publicados, 365); delete process.env.DIAS_PUBLICADOS_RETENCION;
});

test("feedback: docente y familia envían; avisa a la plataforma con límite; solo la plataforma lista", async () => {
  buzon.length = 0;
  const r = await post(caro, feedback, { texto: "Sería bueno <b>poder</b> imprimir la agenda", pagina: "docente.html" });
  assert.equal(r.status, 200); assert.equal(r.body.avisada, true);
  assert.equal(buzon.length, 1); assert.ok(buzon[0].html.includes("&lt;b&gt;"));
  assert.equal((await post(caro, feedback, { texto: "otro" })).body.avisada, false); // mail con límite
  await post(caro, feedback, { texto: "tercero" });
  assert.equal((await post(caro, feedback, { texto: "cuarto" })).status, 429);
  const fam = await entrarConCodigo(pg, "laura@mail.com", "familia");
  assert.equal((await post(fam, feedback, { texto: "Gracias por la app" })).status, 200);
  assert.equal((await post(cliente(), feedback, { texto: "anónimo" })).status, 401);
  assert.equal((await caro.llamar(feedback)).status, 403);
  const l = await ana.llamar(feedback);
  assert.equal(l.status, 200); assert.equal(l.body.comentarios.length, 4);
});

test("config pública: donaciones solo con https y si la variable tiene valor", async () => {
  delete process.env.DONACIONES_AR_URL; delete process.env.DONACIONES_INTL_URL;
  assert.deepEqual((await cliente().llamar(config)).body.donaciones, { ar: null, intl: null });
  process.env.DONACIONES_INTL_URL = "https://github.com/sponsors/dannyvergel";
  process.env.DONACIONES_AR_URL = "javascript:alert(1)";
  const d = (await cliente().llamar(config)).body.donaciones;
  assert.equal(d.intl, "https://github.com/sponsors/dannyvergel"); assert.equal(d.ar, null);
  delete process.env.DONACIONES_AR_URL; delete process.env.DONACIONES_INTL_URL;
});

test("consentimiento de la familia guarda la versión del texto de privacidad", async () => {
  const fam = await entrarConCodigo(pg, "laura@mail.com", "familia");
  const r = await post(fam, fichas, { accion: "consentir", id: juanId, dado: true });
  assert.equal(r.status, 200);
  assert.match(r.body.alumno.consentimiento.version, /^\d{4}-\d{2}-\d{2}/);
  assert.equal(r.body.alumno.consentimiento.texto, "/privacidad.html");
});

test("la familia pide la baja: se borra su cuenta, su contacto, su consentimiento y su chat", async () => {
  const fam = await entrarConCodigo(pg, "laura@mail.com", "familia");
  await pg.query("INSERT INTO chat_turnos (usuario_tipo, usuario_id, alumno_id, rol, texto) SELECT 'familia', id, $1, 'familia', 'hola' FROM familias WHERE email = 'laura@mail.com'", [juanId]);
  assert.equal((await post(fam, fichas, { accion: "baja" })).status, 400); // falta confirmar
  const r = await post(fam, fichas, { accion: "baja", confirmar: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.resumen.cuenta_borrada, true);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM familias WHERE email = 'laura@mail.com'"), 0);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM chat_turnos WHERE texto = 'hola'"), 0);
  const f = (await pg.query("SELECT contactos, consentimiento FROM fichas WHERE alumno_id = $1", [juanId])).rows[0];
  assert.equal(JSON.stringify(f).includes("laura@mail.com"), false);
  assert.equal(f.consentimiento.dado, false);
  assert.equal((await fam.llamar(fichas)).status, 401); // sesión cerrada
  const b = (await pg.query("SELECT * FROM auditoria WHERE evento = 'baja_familia'")).rows[0];
  assert.equal(JSON.stringify(b).includes("laura"), false);
});

test("una docente común no da de baja; la admin borra al alumno con todo (Blob, chat, familias sin otro alumno)", async () => {
  assert.ok(pg.blobs.size >= 1);
  await pg.query("INSERT INTO chat_turnos (usuario_tipo, usuario_id, alumno_id, rol, texto) SELECT 'familia', id, $1, 'familia', 'de pablo' FROM familias WHERE email = 'pablo@mail.com'", [juanId]);
  await pg.query("INSERT INTO alumno_docentes (alumno_id, docente_id) VALUES ($1, 2) ON CONFLICT DO NOTHING", [juanId]);
  assert.equal((await post(caro, fichas, { accion: "borrar", id: juanId })).status, 403);
  const r = await post(ana, fichas, { accion: "borrar", id: juanId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.resumen.blob_borrado, true);
  assert.equal(pg.blobs.size, 0);
  for (const t of ["fichas", "familia_alumno", "alumno_docentes", "invitaciones", "chat_turnos"])
    assert.equal(await cuenta(`SELECT count(*)::int AS n FROM ${t} WHERE alumno_id = $1`, [juanId]), 0, t);
  // Pablo sigue (tiene a Sofía).
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM familias WHERE email = 'pablo@mail.com'"), 1);
  const b = (await pg.query("SELECT * FROM auditoria WHERE evento = 'baja_alumno'")).rows[0];
  assert.equal(Number(b.objeto_id), juanId); assert.equal(Number(b.actor_id), 1);
  assert.equal(JSON.stringify(b).includes("Juan"), false);
});

test("la admin da de baja a una familia de su escuela; si no le quedan alumnos, se borra la cuenta", async () => {
  const r = await post(ana, fichas, { accion: "baja_familia", id: sofiId, email: "pablo@mail.com" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.resumen.cuenta_borrada, true);
  assert.equal(r.body.alumno.contactos.length, 0);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM familias"), 0);
  assert.equal((await post(ana, fichas, { accion: "baja_familia", id: sofiId, email: "nadie@mail.com" })).status, 404);
});

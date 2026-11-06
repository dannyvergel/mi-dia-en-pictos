// Enfoque equipo (docs/enfoques.md): un espacio por chico, la familia es dueña y aprueba a cada profesional.
// Aprobación, permisos (día, ficha, documentos), confidencialidad, cupos, bajas, exportación y auditoría.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const docentes = require("../api/docentes");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const escuelas = require("../api/escuelas");
const correo = require("../api/_lib/correo");
const db = require("../api/_lib/db");
const { SCHEMA } = require("../api/_lib/schema");
const piloto = require("../api/_lib/piloto");
const dia = require("../api/dia");
const agente = require("../api/agente");
const { crearHerramientas } = require("../api/_lib/tools");
const fs = require("fs");
const path = require("path");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY;
process.env.PUENTE_URL = "https://puente.test";
process.env.ADMIN_EMAIL = "plata@puente.test";

let pg, plata, seno, escuelaId;
const post = (c, h, body) => c.llamar(h, { method: "POST", body });
const tokenDe = enlace => enlace.url.split("#invitacion=")[1];
const eventos = async ev => (await pg.query("SELECT * FROM auditoria WHERE evento = $1 ORDER BY id", [ev])).rows;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");

async function usar(token, email, nombre = "Profesional", c = cliente()) {
  await pg.query("DELETE FROM limites");
  const p = await post(c, auth, { accion: "invitacion_pedir_codigo", token, email });
  if (p.status !== 200) return { c, r: p };
  const r = await post(c, auth, { accion: "invitacion_verificar", token, email, codigo: p.body.codigo_dev, nombre });
  return { c, r };
}
async function abrirEquipo(body) {
  const r = await post(plata, docentes, { accion: "invitacion_crear", equipo_nuevo: true, ...body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
// Familia entra con su link y da el consentimiento.
async function entraFamilia(enlace, email) {
  const { c, r } = await usar(tokenDe(enlace), email, "Laura");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
const fichaFamilia = async (fam, alumnoId) => (await fam.llamar(fichas)).body.alumnos.find(a => a.id === alumnoId);
const misAlumnos = async c => (await c.llamar(fichas)).body.alumnos.map(a => a.id);

test.before(async () => {
  pg = await baseNueva();
  process.env.PILOTO_SOLO_INVITACION = "1";
  process.env.PILOTO_MAX_USUARIOS = "0";
  correo.usarBuzonDePrueba(true);
  assert.equal((await post(cliente(), auth, { accion: "setup", nombre: "Plataforma", email: "plata@puente.test", pin: "4321" })).status, 200);
  plata = await entrarConCodigo(pg, "plata@puente.test");
  // Una escuela común con una seño admin (enfoque escuela).
  escuelaId = Number((await pg.query("INSERT INTO escuelas (nombre) VALUES ('Escuela 500') RETURNING id")).rows[0].id);
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, 'seno@500.edu.ar', 'Seño Marta', true)", [escuelaId]);
  seno = await entrarConCodigo(pg, "seno@500.edu.ar");
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.ADMIN_EMAIL; delete process.env.PUENTE_URL; process.env.PILOTO_MAX_USUARIOS = "0"; process.env.PILOTO_SOLO_INVITACION = "0"; });
test.beforeEach(async () => { await pg.query("DELETE FROM limites"); process.env.PILOTO_MAX_USUARIOS = "0"; });

test("migración idempotente: el esquema se puede aplicar dos veces y tipo solo admite escuela, independiente o equipo", async () => {
  await db.asegurarEsquema({ query: (t, p) => pg.query(t, p) });
  await db.asegurarEsquema({ query: (t, p) => pg.query(t, p) });
  assert.ok(SCHEMA.some(s => s.includes("equipo_miembros")));
  for (const t of ["escuela", "independiente", "equipo"]) await pg.query("INSERT INTO escuelas (nombre, tipo, activa) VALUES ('x', $1, false)", [t]);
  await assert.rejects(pg.query("INSERT INTO escuelas (nombre, tipo) VALUES ('x', 'otro')"));
  await pg.query("DELETE FROM escuelas WHERE nombre = 'x'");
});

test("solo la plataforma abre un equipo; respeta los cupos (familia + profesional = 2)", async () => {
  assert.equal((await post(seno, docentes, { accion: "invitacion_crear", equipo_nuevo: true, alumno: "Tomi" })).status, 403);
  const n = (await pg.query("SELECT count(*)::int AS n FROM escuelas")).rows[0].n;
  process.env.PILOTO_MAX_USUARIOS = String((await piloto.usados()) + 1); // queda 1 cupo
  const r = await post(plata, docentes, { accion: "invitacion_crear", equipo_nuevo: true, alumno: "Tomi", abre: "profesional", profesional_nombre: "Lic. Sol", rol: "Fonoaudióloga" });
  assert.equal(r.status, 409);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM escuelas")).rows[0].n, n);
  // Sin rol, si lo abre un/a profesional, no.
  process.env.PILOTO_MAX_USUARIOS = "0";
  assert.equal((await post(plata, docentes, { accion: "invitacion_crear", equipo_nuevo: true, alumno: "Tomi", abre: "profesional" })).status, 400);
});

test("equipo de punta a punta: la familia aprueba, el/la profesional acepta la confidencialidad y recién ahí ve día, ficha y documentos", async () => {
  const usados0 = await piloto.usados();
  const r = await abrirEquipo({ alumno: "Tomi", abre: "profesional", profesional_nombre: "Lic. Sol", rol: "Fonoaudióloga", vinculo: "mamá" });
  const { escuela_id, alumno_id } = r.equipo;
  assert.equal(r.equipo.abierto_por, "profesional");
  const [e] = (await pg.query("SELECT * FROM escuelas WHERE id = $1", [escuela_id])).rows;
  assert.equal(e.tipo, "equipo"); assert.equal(e.abierto_por, "profesional");
  assert.equal(r.enlace.tipo, "familia"); assert.equal(r.enlace.equipo, true);
  assert.match(r.enlace.mensaje, /Vos sos quien decide quién entra/);
  assert.equal(r.enlace_profesional.rol, "Fonoaudióloga");
  assert.match(r.enlace_profesional.mensaje, /La familia tiene que aprobarte/);
  assert.equal((await eventos("equipo_creado")).length >= 1, true);
  // Info pública del link de profesional.
  const inf = await post(cliente(), auth, { accion: "invitacion_info", token: tokenDe(r.enlace_profesional) });
  assert.equal(inf.body.equipo, true); assert.equal(inf.body.rol, "Fonoaudióloga"); assert.equal(inf.body.alumno, "Tomi");

  // El/la profesional usa su link: cuenta sin escuela, PENDIENTE. Entra, pero no ve nada.
  const { c: sol, r: v } = await usar(tokenDe(r.enlace_profesional), "sol@fono.com", "Sol Díaz");
  assert.equal(v.status, 200, JSON.stringify(v.body)); assert.equal(v.body.sesion.equipo_pendiente, true);
  const [d] = (await pg.query("SELECT * FROM docentes WHERE email = 'sol@fono.com'")).rows;
  assert.equal(d.escuela_id, null); assert.equal(d.es_admin, false);
  const [m] = (await pg.query("SELECT * FROM equipo_miembros WHERE docente_id = $1", [d.id])).rows;
  assert.equal(m.estado, "pendiente"); assert.equal(m.rol, "Fonoaudióloga");
  assert.equal(Number((await eventos("miembro_alta")).at(-1).objeto_id), Number(m.id));
  assert.equal(await piloto.usados(), usados0 + 1); // pendiente ya ocupa cupo
  assert.deepEqual(await misAlumnos(sol), []);
  assert.equal((await sol.llamar(familia, { query: { alumno: String(alumno_id) } })).status, 404);
  let eq = (await sol.llamar(docentes, { query: { equipos: "1" } })).body;
  assert.equal(eq.equipos[0].falta, "aprobacion"); assert.equal(eq.confidencialidad.borrador, true);
  assert.match(eq.confidencialidad.texto, /BORRADOR/);
  // Sesión: la plataforma la reconoce como integrante de un equipo.
  assert.equal((await sol.llamar(auth)).body.sesion.equipo, true);

  // Entra la familia y da el consentimiento. Ve al profesional pendiente, con email.
  const fam = await entraFamilia(r.enlace, "laura@familia.com");
  assert.equal(await piloto.usados(), usados0 + 2);
  assert.equal((await post(fam, fichas, { accion: "consentir", id: alumno_id, dado: true })).status, 200);
  let f = await fichaFamilia(fam, alumno_id);
  assert.equal(f.espacio, "equipo");
  assert.deepEqual(f.equipo.miembros.map(x => [x.email, x.estado]), [["sol@fono.com", "pendiente"]]);

  // Aprobada pero sin confidencialidad: todavía no ve.
  assert.equal((await post(fam, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: m.id })).status, 200);
  assert.equal(Number((await eventos("miembro_aprobado")).at(-1).objeto_id), Number(m.id));
  assert.deepEqual(await misAlumnos(sol), []);
  eq = (await sol.llamar(docentes, { query: { equipos: "1" } })).body;
  assert.equal(eq.equipos[0].falta, "confidencialidad");
  assert.equal((await post(sol, docentes, { accion: "equipo_confidencialidad", escuela_id, acepto: false })).status, 400);
  assert.equal((await post(sol, docentes, { accion: "equipo_confidencialidad", escuela_id, acepto: true })).status, 200);
  const [m2] = (await pg.query("SELECT * FROM equipo_miembros WHERE id = $1", [m.id])).rows;
  assert.ok(m2.confidencialidad); assert.equal(m2.confidencialidad_version, "2026-11-05-borrador");
  assert.equal((await eventos("confidencialidad_aceptada")).at(-1).detalle.version, "2026-11-05-borrador");

  // Ahora ve la ficha, el día (vista) y los documentos; puede subir uno.
  assert.deepEqual(await misAlumnos(sol), [alumno_id]);
  assert.equal((await sol.llamar(fichas, { query: { id: String(alumno_id) } })).status, 200);
  assert.equal((await sol.llamar(familia, { query: { alumno: String(alumno_id) } })).status, 200);
  const pub = await post(sol, familia, { accion: "publicar", alumno_id, registros: [{ fecha: "2026-11-05", actividades: [] }] });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  const up = await post(sol, fichas, { accion: "doc_subir", id: alumno_id, tipo: "informe", titulo: "Informe fono", nombre: "fono.pdf", mime: "application/pdf", datos: PDF });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal((await sol.llamar(fichas, { query: { documentos: String(alumno_id) } })).body.documentos.length, 1);
  // Otro equipo / otra escuela: la seño no ve a Tomi ni sus documentos.
  assert.ok(!(await misAlumnos(seno)).includes(alumno_id));
  assert.equal((await seno.llamar(fichas, { query: { documentos: String(alumno_id) } })).status, 404);
});

test("permisos dentro del equipo: los integrantes no tocan contactos, consentimiento, familias, asignaciones ni bajas", async () => {
  const r = await abrirEquipo({ alumno: "Lu", abre: "familia" });
  const { escuela_id, alumno_id } = r.equipo;
  const fam = await entraFamilia(r.enlace, "papa.lu@familia.com");
  assert.equal((await post(fam, fichas, { accion: "consentir", id: alumno_id, dado: true })).status, 200);
  // La familia invita a la seño de la escuela (cuenta existente, admin de SU escuela) como maestra integradora.
  const inv = await post(fam, fichas, { accion: "equipo_invitar", id: alumno_id, nombre: "Marta", rol: "Maestra integradora" });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  assert.equal(inv.body.equipo.links.length, 1);
  const usados = await piloto.usados();
  const { r: v } = await usar(tokenDe(inv.body.enlace), "seno@500.edu.ar", "Seño Marta", seno);
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(await piloto.usados(), usados); // ya ocupaba cupo por su escuela: no suma
  const [d] = (await pg.query("SELECT * FROM docentes WHERE email = 'seno@500.edu.ar'")).rows;
  assert.equal(Number(d.escuela_id), escuelaId); // sigue en su escuela
  const m = (await fichaFamilia(fam, alumno_id)).equipo.miembros.find(x => x.email === "seno@500.edu.ar");
  assert.equal((await eventos("miembro_alta")).at(-1).detalle.invitado_por, "familia");
  await post(fam, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: m.id });
  await post(seno, docentes, { accion: "equipo_confidencialidad", escuela_id, acepto: true });
  assert.ok((await misAlumnos(seno)).includes(alumno_id));

  // Guardar: apoyos y objetivos sí; contactos, nombre y consentimiento no cambian.
  const g = await post(seno, fichas, { accion: "guardar", id: alumno_id, nombre: "Otro", contactos: [{ nombre: "X", email: "intruso@x.com" }],
    apoyos: { comunicacion: "Usa pictos" }, objetivos: ["Pedir ayuda"], consentimiento: { dado: false } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.alumno.nombre, "Lu");
  assert.deepEqual(g.body.alumno.contactos.map(c => c.email), ["papa.lu@familia.com"]);
  assert.equal(g.body.alumno.consentimiento.dado, true);
  assert.equal(g.body.alumno.apoyos.comunicacion, "Usa pictos");
  assert.equal(g.body.alumno.equipo.miembros.length, 1);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM familias WHERE email = 'intruso@x.com'")).rows[0].n, 0);
  // Lo de la familia: 403 aunque sea admin de su escuela.
  for (const accion of ["link_familia", "borrar", "baja_familia", "invitar", "asignar"])
    assert.equal((await post(seno, fichas, { accion, id: alumno_id, email: "papa.lu@familia.com", docente_id: d.id })).status, 403, accion);
  // Un integrante con acceso puede invitar a otro/a profesional; la familia anula el link.
  const inv2 = await post(seno, docentes, { accion: "invitacion_crear", equipo: escuela_id, nombre: "Ana", rol: "TO" });
  assert.equal(inv2.status, 200, JSON.stringify(inv2.body));
  assert.equal((await post(fam, fichas, { accion: "equipo_link_revocar", id: alumno_id, link_id: inv2.body.enlace.id })).status, 200);
  assert.equal((await usar(tokenDe(inv2.body.enlace), "ana@to.com")).r.status, 410);
  // Sin rol no se crea el link.
  assert.equal((await post(fam, fichas, { accion: "equipo_invitar", id: alumno_id, rol: "" })).status, 400);
});

test("rechazo y baja: la familia rechaza o saca; se pierde el acceso, se libera el cupo y queda en la auditoría", async () => {
  const r = await abrirEquipo({ alumno: "Juani", abre: "familia" });
  const { escuela_id, alumno_id } = r.equipo;
  const fam = await entraFamilia(r.enlace, "mama.juani@familia.com");
  assert.equal((await post(fam, fichas, { accion: "consentir", id: alumno_id, dado: true })).status, 200);
  const crear = async (email, rol) => {
    const l = (await post(fam, fichas, { accion: "equipo_invitar", id: alumno_id, rol })).body.enlace;
    const { c, r: v } = await usar(tokenDe(l), email, "Pro " + rol);
    assert.equal(v.status, 200, JSON.stringify(v.body));
    return { c, m: (await fichaFamilia(fam, alumno_id)).equipo.miembros.find(x => x.email === email) };
  };
  const base = await piloto.usados();
  const psp = await crear("psp@x.com", "Psicopedagoga");
  const to = await crear("to@x.com", "TO");
  assert.equal(await piloto.usados(), base + 2);
  // Rechazo: no ve, no puede volver a entrar y libera el cupo.
  assert.equal((await post(fam, fichas, { accion: "equipo_rechazar", id: alumno_id, miembro_id: psp.m.id })).status, 200);
  assert.equal((await post(fam, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: psp.m.id })).status, 409);
  assert.equal(Number((await eventos("miembro_rechazado")).at(-1).objeto_id), Number(psp.m.id));
  assert.equal((await psp.c.llamar(fichas)).status, 401); // sin otro acceso, la sesión ya no vale
  assert.equal(await piloto.usados(), base + 1);
  // Aprobada y con confidencialidad, después la familia la saca.
  await post(fam, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: to.m.id });
  await post(to.c, docentes, { accion: "equipo_confidencialidad", escuela_id, acepto: true });
  assert.deepEqual(await misAlumnos(to.c), [alumno_id]);
  assert.equal((await post(fam, fichas, { accion: "equipo_quitar", id: alumno_id, miembro_id: to.m.id })).status, 200);
  const baja = (await eventos("miembro_baja")).at(-1);
  assert.equal(Number(baja.objeto_id), Number(to.m.id)); assert.equal(baja.detalle.por, "la familia"); assert.equal(baja.actor_tipo, "familia");
  assert.equal((await to.c.llamar(fichas)).status, 401);
  assert.equal(await piloto.usados(), base);
  const est = (await fichaFamilia(fam, alumno_id)).equipo.miembros.map(x => [x.email, x.estado]).sort();
  assert.deepEqual(est, [["psp@x.com", "rechazado"], ["to@x.com", "baja"]]);
  // Puede volver a invitarse: queda pendiente otra vez (sin la confidencialidad de antes).
  const l = (await post(fam, fichas, { accion: "equipo_invitar", id: alumno_id, rol: "TO" })).body.enlace;
  assert.equal((await usar(tokenDe(l), "to@x.com", "Pro TO")).r.status, 200);
  const [mm] = (await pg.query("SELECT estado, confidencialidad FROM equipo_miembros WHERE id = $1", [to.m.id])).rows;
  assert.equal(mm.estado, "pendiente"); assert.equal(mm.confidencialidad, null);
  // Solo la familia resuelve: una docente no tiene esa acción.
  assert.equal((await post(seno, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: to.m.id })).status, 400);
});

test("el/la profesional puede irse; desactivar el espacio libera los cupos de todos", async () => {
  const r = await abrirEquipo({ alumno: "Benja", abre: "profesional", profesional_nombre: "Caro", rol: "Acompañante terapéutico" });
  const { escuela_id, alumno_id } = r.equipo;
  const { c: caro } = await usar(tokenDe(r.enlace_profesional), "caro@at.com", "Caro");
  const fam = await entraFamilia(r.enlace, "fam.benja@familia.com");
  const m = (await fichaFamilia(fam, alumno_id)).equipo.miembros[0];
  await post(fam, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: m.id });
  const conTodo = await piloto.usados();
  // La plataforma lo ve en su lista, con integrantes.
  const lista = (await plata.llamar(escuelas, { query: { todas: "1" } })).body.escuelas.find(e => e.id === escuela_id);
  assert.equal(lista.tipo, "equipo"); assert.equal(lista.miembros, 1); assert.equal(lista.familias, 1);
  // Desactivar: familia y profesional dejan de contar y de entrar.
  assert.equal((await post(plata, escuelas, { accion: "desactivar_escuela", id: escuela_id })).status, 200);
  assert.equal(await piloto.usados(), conTodo - 2);
  assert.equal((await caro.llamar(fichas)).status, 401);
  assert.equal((await post(plata, escuelas, { accion: "activar_escuela", id: escuela_id })).status, 200);
  assert.equal(await piloto.usados(), conTodo);
  // Se va por su cuenta.
  const caro2 = await entrarConCodigo(pg, "caro@at.com"); // la desactivación cortó su sesión
  assert.equal((await post(caro2, docentes, { accion: "equipo_salir", escuela_id })).status, 200);
  assert.equal((await eventos("miembro_baja")).at(-1).detalle.por, "el/la profesional");
  assert.equal(await piloto.usados(), conTodo - 1);
});

test("baja y exportación de la familia incluyen a los integrantes; sin familia el equipo se cierra", async () => {
  const r = await abrirEquipo({ alumno: "Emi", abre: "profesional", profesional_nombre: "Vale", rol: "Psicóloga" });
  const { alumno_id } = r.equipo;
  const { c: vale } = await usar(tokenDe(r.enlace_profesional), "vale@psi.com", "Vale");
  const fam = await entraFamilia(r.enlace, "fam.emi@familia.com");
  const m = (await fichaFamilia(fam, alumno_id)).equipo.miembros[0];
  await post(fam, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: m.id });
  const pend = (await post(fam, fichas, { accion: "equipo_invitar", id: alumno_id, rol: "Fono" })).body.enlace;
  const ex = (await fam.llamar(fichas, { query: { exportar: "1" } })).body;
  assert.equal(ex.equipos.length, 1);
  assert.deepEqual(ex.equipos[0].miembros.map(x => [x.email, x.rol, x.estado]), [["vale@psi.com", "Psicóloga", "aprobado"]]);
  const res = await post(fam, fichas, { accion: "baja", confirmar: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.resumen.miembros_dados_de_baja, 1);
  const [mm] = (await pg.query("SELECT estado, motivo FROM equipo_miembros WHERE id = $1", [m.id])).rows;
  assert.equal(mm.estado, "baja"); assert.equal(mm.motivo, "baja de la familia");
  assert.equal((await eventos("miembro_baja")).at(-1).detalle.por, "baja de la familia");
  assert.equal((await vale.llamar(fichas)).status, 401);
  assert.equal((await usar(tokenDe(pend), "fono@x.com")).r.status, 410); // links pendientes anulados
});

test("enfoque escuela sin cambios: la dirección no puede sumar seños comunes a un equipo y un link de docente a un equipo es de integrante", async () => {
  const r = await abrirEquipo({ alumno: "Santi", abre: "familia" });
  // La plataforma, con el link de docente común sobre un espacio de equipo, crea un link de integrante (pendiente de la familia).
  const l = await post(plata, docentes, { accion: "invitacion_crear", escuela_id: r.equipo.escuela_id, rol: "Docente" });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.equal(l.body.enlace.equipo, true); assert.equal(l.body.enlace.es_admin, false);
  // Una docente de escuela no puede crear links en un equipo ajeno.
  assert.equal((await post(seno, docentes, { accion: "invitacion_crear", equipo: r.equipo.escuela_id, rol: "Docente" })).status, 403);
  // Acciones de equipo sobre un alumno de escuela: 400.
  const al = Number((await pg.query("INSERT INTO alumnos (escuela_id, nombre) VALUES ($1, 'Pepe') RETURNING id", [escuelaId])).rows[0].id);
  await pg.query("INSERT INTO familias (email) VALUES ('fam.pepe@x.com')");
  await pg.query("INSERT INTO familia_alumno (familia_id, alumno_id) SELECT id, $1 FROM familias WHERE email = 'fam.pepe@x.com'", [al]);
  const fp = await entrarConCodigo(pg, "fam.pepe@x.com", "familia");
  assert.equal((await post(fp, fichas, { accion: "equipo_invitar", id: al, rol: "TO" })).status, 400);
  assert.equal((await fichaFamilia(fp, al)).equipo, undefined);
});

// ---------- Ajustes del 2026-11-05 (docs/enfoques.md) ----------
// Arma un equipo con un/a profesional aprobado/a y con la confidencialidad aceptada. consentir: si la familia da el consentimiento.
async function equipoListo({ alumno, emailFam, emailPro, consentir = true, pro = null }) {
  const r = await abrirEquipo({ alumno, abre: "familia" });
  const { escuela_id, alumno_id } = r.equipo;
  const fam = await entraFamilia(r.enlace, emailFam);
  if (consentir) assert.equal((await post(fam, fichas, { accion: "consentir", id: alumno_id, dado: true })).status, 200);
  const l = (await post(fam, fichas, { accion: "equipo_invitar", id: alumno_id, rol: "Fonoaudióloga" })).body.enlace;
  const { c, r: v } = await usar(tokenDe(l), emailPro, "Pro", pro || cliente());
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const m = (await fichaFamilia(fam, alumno_id)).equipo.miembros.find(x => x.email === emailPro);
  assert.equal((await post(fam, fichas, { accion: "equipo_aprobar", id: alumno_id, miembro_id: m.id })).status, 200);
  assert.equal((await post(c, docentes, { accion: "equipo_confidencialidad", escuela_id, acepto: true })).status, 200);
  return { fam, pro: c, escuela_id, alumno_id };
}

test("consentimiento: sin el consentimiento vigente de la familia el/la profesional aprobado/a no ve nada (403 / lista vacía)", async () => {
  const { fam, pro, escuela_id, alumno_id } = await equipoListo({ alumno: "Mora", emailFam: "fam.mora@familia.com", emailPro: "fono.mora@x.com", consentir: false });
  const sinConsentimiento = async () => {
    assert.deepEqual(await misAlumnos(pro), []);
    const eq = (await pro.llamar(docentes, { query: { equipos: "1" } })).body.equipos.find(e => e.escuela_id === escuela_id);
    assert.equal(eq.falta, "consentimiento"); assert.equal(eq.acceso, false); assert.equal(eq.consentimiento, false);
    assert.equal(eq.miembros, undefined);
    const ficha = await pro.llamar(fichas, { query: { id: String(alumno_id) } });
    assert.equal(ficha.status, 403); assert.match(ficha.body.error, /Falta el consentimiento de la familia/);
    // Día (vista y publicar), documentos (lista y subir), Cuaderno (día con IA) y agente: 403.
    assert.equal((await pro.llamar(familia, { query: { alumno: String(alumno_id) } })).status, 403);
    assert.equal((await post(pro, familia, { accion: "publicar", alumno_id, registros: [{ fecha: "2026-11-05", actividades: [] }] })).status, 403);
    const docsL = await pro.llamar(fichas, { query: { documentos: String(alumno_id) } });
    assert.equal(docsL.status, 403); assert.match(docsL.body.error, /Falta el consentimiento/);
    assert.equal((await post(pro, fichas, { accion: "doc_subir", id: alumno_id, tipo: "informe", titulo: "x", nombre: "x.pdf", mime: "application/pdf", datos: PDF })).status, 403);
    assert.equal((await post(pro, dia, { alumno_id, alumno: "Mora", texto: "Llegó contento." })).status, 403);
    assert.equal((await post(pro, agente, { alumno_id, alumno: "Mora", registros: [{ alumno: "Mora", fecha: "2026-11-05", actividades: [] }] })).status, 403);
    // Por nombre (clientes viejos) tampoco lo encuentra.
    assert.equal((await post(pro, agente, { alumno: "Mora", registros: [{ alumno: "Mora", fecha: "2026-11-05", actividades: [] }] })).status, 404);
    // Tampoco puede invitar a otro/a profesional.
    assert.equal((await post(pro, docentes, { accion: "invitacion_crear", equipo: escuela_id, rol: "TO" })).status, 403);
  };
  await sinConsentimiento();

  // La familia da el consentimiento: ahora sí ve.
  assert.equal((await post(fam, fichas, { accion: "consentir", id: alumno_id, dado: true })).status, 200);
  assert.deepEqual(await misAlumnos(pro), [alumno_id]);
  const eq = (await pro.llamar(docentes, { query: { equipos: "1" } })).body.equipos.find(e => e.escuela_id === escuela_id);
  assert.equal(eq.falta, null); assert.equal(eq.acceso, true); assert.equal(eq.consentimiento, true);
  assert.equal((await pro.llamar(fichas, { query: { id: String(alumno_id) } })).status, 200);
  assert.equal((await pro.llamar(fichas, { query: { documentos: String(alumno_id) } })).status, 200);
  assert.equal((await pro.llamar(familia, { query: { alumno: String(alumno_id) } })).status, 200);
  assert.equal((await post(pro, dia, { alumno_id, alumno: "Mora", texto: "Llegó contento." })).status, 503); // pasó el permiso; sin key de IA
  assert.equal((await post(pro, agente, { alumno_id, alumno: "Mora", registros: [{ alumno: "Mora", alumno_id, fecha: "2026-11-05", actividades: [] }] })).status, 200);

  // La familia lo retira: se pierde el acceso otra vez.
  assert.equal((await post(fam, fichas, { accion: "consentir", id: alumno_id, dado: false })).status, 200);
  await sinConsentimiento();

  // docente.html muestra el mensaje claro.
  const html = fs.readFileSync(path.join(__dirname, "..", "docente.html"), "utf8");
  assert.ok(html.includes('e.falta === "consentimiento"'));
  assert.ok(html.includes("Falta el consentimiento de la familia"));
});

test("consentimiento: el enfoque escuela queda como está (la seño ve a su alumno aunque la familia no haya consentido)", async () => {
  const al = Number((await pg.query("INSERT INTO alumnos (escuela_id, nombre) VALUES ($1, 'Rocío') RETURNING id", [escuelaId])).rows[0].id);
  await pg.query(`INSERT INTO fichas (alumno_id, consentimiento) VALUES ($1, '{"dado": false}')`, [al]);
  assert.ok((await misAlumnos(seno)).includes(al));
  assert.equal((await seno.llamar(fichas, { query: { id: String(al) } })).status, 200);
  assert.equal((await seno.llamar(fichas, { query: { documentos: String(al) } })).status, 200);
  assert.equal((await post(seno, dia, { alumno_id: al, alumno: "Rocío", texto: "Bien." })).status, 503);
});

test("cuaderno por id: dos equipos con chicos del mismo nombre no se confunden", async () => {
  const uno_ = await equipoListo({ alumno: "Nico", emailFam: "fam.nico1@familia.com", emailPro: "to.nico@x.com" });
  const dos = await equipoListo({ alumno: "Nico", emailFam: "fam.nico2@familia.com", emailPro: "to.nico@x.com", pro: uno_.pro });
  const pro = uno_.pro;
  assert.notEqual(uno_.alumno_id, dos.alumno_id);
  const lista = (await pro.llamar(fichas)).body.alumnos.filter(a => a.nombre === "Nico");
  assert.equal(lista.length, 2);
  assert.ok(lista.every(a => typeof a.espacio_nombre === "string")); // para distinguirlos en el selector
  // Objetivos distintos en cada ficha: el agente usa los del chico pedido por id, no el primero con ese nombre.
  assert.equal((await post(pro, fichas, { accion: "guardar", id: uno_.alumno_id, apoyos: {}, objetivos: ["Esperar su turno"] })).status, 200);
  assert.equal((await post(pro, fichas, { accion: "guardar", id: dos.alumno_id, apoyos: {}, objetivos: ["Pedir agua con pictos"] })).status, 200);
  const regs = id => [1, 2, 3].map(i => ({ alumno: "Nico", alumno_id: id, fecha: `2026-11-0${i}`, animo_general: "contento",
    actividades: [{ hora: "09:00", actividad: "Pidió agua con pictos", palabra_clave: "agua", estado: "bien" }], logros: [] }));
  const ag = await post(pro, agente, { alumno_id: dos.alumno_id, alumno: "Nico", registros: regs(dos.alumno_id) });
  assert.equal(ag.status, 200, JSON.stringify(ag.body));
  const objs = (ag.body.resultado.ppi || []).map(o => o.objetivo);
  assert.ok(objs.includes("Pedir agua con pictos"), JSON.stringify(objs));
  assert.ok(!objs.includes("Esperar su turno"));
  // El día (IA) por id: pasa el permiso para los dos; un id ajeno da 404.
  assert.equal((await post(pro, dia, { alumno_id: dos.alumno_id, alumno: "Nico", texto: "Bien." })).status, 503);
  assert.equal((await post(pro, dia, { alumno_id: uno_.alumno_id, alumno: "Nico", texto: "Bien." })).status, 503);
  assert.equal((await post(seno, dia, { alumno_id: dos.alumno_id, alumno: "Nico", texto: "Bien." })).status, 404);
  // Publicar por id: cada día va al espacio de su chico.
  assert.equal((await post(pro, familia, { accion: "publicar", alumno_id: dos.alumno_id, registros: regs(dos.alumno_id) })).status, 200);
  const [a1, a2] = (await pg.query("SELECT blob_token FROM alumnos WHERE id = ANY($1::bigint[]) ORDER BY id", [[uno_.alumno_id, dos.alumno_id]])).rows;
  assert.equal(a1.blob_token, null); assert.ok(a2.blob_token);
  // Las herramientas del agente filtran por id cuando lo hay (mismo nombre, otro chico: afuera).
  const h = crearHerramientas({ alumno: "Nico", alumno_id: dos.alumno_id, registros: [...regs(dos.alumno_id), ...regs(uno_.alumno_id).map(r => ({ ...r, fecha: "2026-10-0" + r.fecha.slice(-1) }))] });
  assert.equal(h.leer_historial.run().total_dias, 3);
  // El Cuaderno usa el id como clave y lo manda a api/dia, api/agente y api/familia.
  const cu = fs.readFileSync(path.join(__dirname, "..", "cuaderno.html"), "utf8");
  assert.ok(cu.includes("alumnos.map(a => [String(a.id), a])"));
  assert.ok(!cu.includes("alumnos.map(a => [a.nombre, a])"));
  assert.match(cu, /fetch\("api\/dia"[^\n]*\n?[^\n]*body/);
  assert.ok(cu.includes("alumno_id: idDe(k)"));
});

test("mail de documentos: en un espacio de equipo dice «El equipo compartió», sin título ni contenido", async () => {
  const { pro, alumno_id } = await equipoListo({ alumno: "Dante", emailFam: "fam.dante@familia.com", emailPro: "psp.dante@x.com" });
  const buzon = correo.usarBuzonDePrueba(true);
  try {
    const s = await post(pro, fichas, { accion: "doc_subir", id: alumno_id, tipo: "informe", titulo: "TITULO-SECRETO", nombre: "i.pdf", mime: "application/pdf",
      datos: PDF, mostrar_familia: true, notificar: true });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(buzon.length, 1);
    const m = buzon[0];
    assert.deepEqual(m.to, ["fam.dante@familia.com"]);
    assert.equal(m.subject, "Nuevo informe de Dante en Puente");
    assert.match(m.text, /El equipo compartió un informe de Dante/);
    assert.match(m.html, /El equipo compartió un <b>informe<\/b>/);
    // (El pie de marca «de la escuela a casa» es igual para todos los mails y no se tocó.)
    for (const t of [m.text, m.html, m.subject]) { assert.equal(/la escuela compartió/i.test(t), false); assert.equal(t.includes("TITULO-SECRETO"), false); }
    assert.equal("attachments" in m, false);
  } finally { correo.usarBuzonDePrueba(false); }
});

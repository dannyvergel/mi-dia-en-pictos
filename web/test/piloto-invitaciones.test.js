// Piloto cerrado: links de invitación (docente y familia), modo solo invitación y tope de cupos.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const solicitudes = require("../api/solicitudes");
const docentes = require("../api/docentes");
const fichas = require("../api/fichas");
const correo = require("../api/_lib/correo");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY;
process.env.PUENTE_URL = "https://puente.test";
process.env.ADMIN_EMAIL = "ana@plataforma.org";
let pg, ana, dire, buzon, escuelaB;
const post = (c, h, body) => c.llamar(h, { method: "POST", body });
const tokenDe = enlace => enlace.url.split("#invitacion=")[1];
const eventos = async ev => (await pg.query("SELECT * FROM auditoria WHERE evento = $1 ORDER BY id", [ev])).rows;
const sinTope = () => { process.env.PILOTO_MAX_USUARIOS = "0"; };

// Usa un link de punta a punta: pide el código y lo valida. Devuelve { c, r } con la respuesta de verificar.
async function usar(token, email, nombre = "Seño Nueva", c = cliente()) {
  await pg.query("DELETE FROM limites");
  const p = await post(c, auth, { accion: "invitacion_pedir_codigo", token, email });
  if (p.status !== 200) return { c, r: p };
  const r = await post(c, auth, { accion: "invitacion_verificar", token, email, codigo: p.body.codigo_dev, nombre });
  return { c, r };
}

test.before(async () => {
  pg = await baseNueva();
  // Este archivo prueba los valores por defecto (sin variables): solo invitación y tope 15.
  delete process.env.PILOTO_SOLO_INVITACION; delete process.env.PILOTO_MAX_USUARIOS;
  buzon = correo.usarBuzonDePrueba(true);
  assert.equal((await post(cliente(), auth, { accion: "setup", escuela: "Escuela Uno", nombre: "Ana", email: "ana@plataforma.org", pin: "4321" })).status, 200);
  ana = await entrarConCodigo(pg, "ana@plataforma.org");
  // Escuela B con su directora (admin de escuela).
  escuelaB = Number((await pg.query("INSERT INTO escuelas (nombre) VALUES ('Escuela Dos') RETURNING id")).rows[0].id);
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, 'dire@dos.edu.ar', 'Directora Dos', true)", [escuelaB]);
  dire = await entrarConCodigo(pg, "dire@dos.edu.ar");
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.ADMIN_EMAIL; delete process.env.PUENTE_URL; delete process.env.PILOTO_MAX_USUARIOS; });
test.beforeEach(async () => { await pg.query("DELETE FROM limites"); buzon.length = 0; });

test("solo invitación por defecto con base: el login lo sabe y la solicitud abierta se bloquea del lado del server", async () => {
  const e = await cliente().llamar(auth);
  assert.equal(e.body.solo_invitacion, true);
  const r = await post(cliente(), solicitudes, { accion: "crear", nombre: "Marta", email: "marta@x.com", escuela: "Escuela Uno" });
  assert.equal(r.status, 403); assert.match(r.body.error, /solo con un link de invitación/);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM solicitudes")).rows[0].n, 0);
  assert.equal(buzon.length, 0);
  process.env.PILOTO_SOLO_INVITACION = "0";
  try { assert.equal((await post(cliente(), solicitudes, { accion: "crear", nombre: "Marta", email: "marta@x.com", escuela: "Escuela Uno" })).status, 200); }
  finally { delete process.env.PILOTO_SOLO_INVITACION; await pg.query("DELETE FROM solicitudes"); }
});

test("link de docente: un solo uso, crea la cuenta aprobada en esa escuela y queda en la auditoría (solo el hash del token)", async () => {
  const cr = await post(dire, docentes, { accion: "invitacion_crear", etiqueta: "Seño Laura" });
  assert.equal(cr.status, 200, JSON.stringify(cr.body));
  const l = cr.body.enlace;
  assert.equal(l.tipo, "docente"); assert.equal(l.escuela_id, escuelaB); assert.equal(l.usos_max, 1); assert.equal(l.estado, "pendiente");
  assert.match(l.url, /^https:\/\/puente\.test\/login\.html#invitacion=[\w-]{20,}$/);
  assert.match(l.whatsapp, /^https:\/\/wa\.me\/\?text=/);
  const dias = (new Date(l.expira) - Date.now()) / 864e5; assert.ok(dias > 6.9 && dias <= 7.01, "vence a los 7 días");
  const token = tokenDe(l);
  const fila = (await pg.query("SELECT * FROM enlaces WHERE id = $1", [l.id])).rows[0];
  assert.notEqual(fila.token_hash, token); assert.ok(!JSON.stringify(fila).includes(token), "no se guarda el token");

  const info = await post(cliente(), auth, { accion: "invitacion_info", token });
  assert.equal(info.status, 200); assert.equal(info.body.escuela, "Escuela Dos"); assert.equal(info.body.nombre, "Seño Laura");

  const { c, r } = await usar(token, "laura@dos.edu.ar", "Laura Pérez");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.sesion.tipo, "docente"); assert.equal(r.body.sesion.es_admin, false);
  const d = (await pg.query("SELECT * FROM docentes WHERE email = 'laura@dos.edu.ar'")).rows[0];
  assert.equal(Number(d.escuela_id), escuelaB); assert.equal(d.activo, true); assert.equal(d.nombre, "Laura Pérez");
  assert.equal((await c.llamar(auth)).body.sesion.email, "laura@dos.edu.ar"); // quedó con sesión

  // Segundo uso: no.
  const otra = await usar(token, "otra@dos.edu.ar");
  assert.equal(otra.r.status, 410); assert.match(otra.r.body.error, /ya se usó/);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM docentes WHERE email = 'otra@dos.edu.ar'")).rows[0].n, 0);

  const creada = (await eventos("invitacion_creada")).find(x => Number(x.objeto_id) === l.id);
  assert.ok(creada); assert.equal(creada.actor_tipo, "docente");
  const usada = (await eventos("invitacion_usada")).find(x => Number(x.objeto_id) === l.id);
  assert.ok(usada); assert.equal(Number(usada.actor_id), Number(d.id)); assert.equal(usada.detalle.cuenta, "nueva");
  assert.ok(!JSON.stringify(usada).includes("laura@"), "sin email en claro");
});

test("un código pedido con un link no sirve para otro link ni para el login normal", async () => {
  const l1 = (await post(dire, docentes, { accion: "invitacion_crear" })).body.enlace;
  const l2 = (await post(dire, docentes, { accion: "invitacion_crear" })).body.enlace;
  const c = cliente();
  const p = await post(c, auth, { accion: "invitacion_pedir_codigo", token: tokenDe(l1), email: "cruce@dos.edu.ar" });
  assert.equal(p.status, 200);
  const v = await post(c, auth, { accion: "invitacion_verificar", token: tokenDe(l2), email: "cruce@dos.edu.ar", codigo: p.body.codigo_dev, nombre: "Cruce" });
  assert.equal(v.status, 401);
  const n = await post(c, auth, { accion: "verificar_codigo", tipo: "docente", email: "cruce@dos.edu.ar", codigo: p.body.codigo_dev });
  assert.equal(n.status, 401);
  for (const l of [l1, l2]) await post(dire, docentes, { accion: "invitacion_revocar", id: l.id });
});

test("link vencido: no se puede ver ni usar", async () => {
  const l = (await post(dire, docentes, { accion: "invitacion_crear" })).body.enlace;
  await pg.query("UPDATE enlaces SET expira = now() - interval '1 minute' WHERE id = $1", [l.id]);
  const info = await post(cliente(), auth, { accion: "invitacion_info", token: tokenDe(l) });
  assert.equal(info.status, 410); assert.match(info.body.error, /venció/);
  const { r } = await usar(tokenDe(l), "vencida@dos.edu.ar");
  assert.equal(r.status, 410);
  const lista = (await dire.llamar(docentes, { query: { invitaciones: "1" } })).body.enlaces;
  assert.equal(lista.find(x => x.id === l.id).estado, "vencido");
});

test("link revocado: no se puede usar, ni a mitad de camino; queda quién lo revocó", async () => {
  const l = (await post(dire, docentes, { accion: "invitacion_crear" })).body.enlace;
  const c = cliente();
  const p = await post(c, auth, { accion: "invitacion_pedir_codigo", token: tokenDe(l), email: "revocada@dos.edu.ar" });
  assert.equal(p.status, 200);
  const rv = await post(dire, docentes, { accion: "invitacion_revocar", id: l.id });
  assert.equal(rv.status, 200); assert.equal(rv.body.enlace.estado, "revocado");
  const v = await post(c, auth, { accion: "invitacion_verificar", token: tokenDe(l), email: "revocada@dos.edu.ar", codigo: p.body.codigo_dev, nombre: "Revocada" });
  assert.equal(v.status, 410); assert.match(v.body.error, /anulado/);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM docentes WHERE email = 'revocada@dos.edu.ar'")).rows[0].n, 0);
  const ev = (await eventos("invitacion_revocada")).find(x => Number(x.objeto_id) === l.id);
  assert.ok(ev); assert.equal(ev.actor_tipo, "docente");
  assert.equal((await post(dire, docentes, { accion: "invitacion_revocar", id: l.id })).status, 409); // ya no está pendiente
});

test("alcance: la admin de escuela invita y revoca solo en la suya; una docente no admin no invita; la plataforma, en cualquiera", async () => {
  const deA = await post(ana, docentes, { accion: "invitacion_crear", escuela_id: 1 });
  assert.equal(deA.status, 200);
  assert.equal((await post(dire, docentes, { accion: "invitacion_crear", escuela_id: 1 })).status, 403);
  assert.equal((await post(dire, docentes, { accion: "invitacion_crear", cue: "820060800" })).status, 403);
  assert.equal((await post(dire, docentes, { accion: "invitacion_revocar", id: deA.body.enlace.id })).status, 404);
  const listaDire = (await dire.llamar(docentes, { query: { invitaciones: "1" } })).body.enlaces;
  assert.ok(listaDire.length && listaDire.every(x => x.escuela_id === escuelaB), "solo ve los de su escuela");
  // La plataforma invita a una directora de la escuela B (admin).
  const paraB = await post(ana, docentes, { accion: "invitacion_crear", escuela_id: escuelaB, es_admin: true });
  assert.equal(paraB.status, 200); assert.equal(paraB.body.enlace.es_admin, true);
  const { r } = await usar(tokenDe(paraB.body.enlace), "vice@dos.edu.ar", "Vicedirectora");
  assert.equal(r.status, 200); assert.equal(r.body.sesion.es_admin, true);
  // Docente no admin.
  const laura = await entrarConCodigo(pg, "laura@dos.edu.ar");
  const nl = await post(laura, docentes, { accion: "invitacion_crear" });
  assert.equal(nl.status, 403);
  assert.equal((await laura.llamar(docentes, { query: { invitaciones: "1" } })).status, 403);
  assert.equal((await post(ana, docentes, { accion: "invitacion_revocar", id: deA.body.enlace.id })).status, 200);
});

test("link de familia desde la ficha: ligado al alumno, suma el contacto y entra como familia; un solo uso", async () => {
  const al = await post(dire, fichas, { accion: "crear", nombre: "Tomi" });
  assert.equal(al.status, 200, JSON.stringify(al.body));
  const id = al.body.alumno.id;
  const cr = await post(dire, fichas, { accion: "link_familia", id, nombre: "Carla", vinculo: "mamá" });
  assert.equal(cr.status, 200, JSON.stringify(cr.body));
  const l = cr.body.enlace;
  assert.equal(l.tipo, "familia"); assert.equal(l.alumno_id, id); assert.equal(l.usos_max, 1);
  assert.equal(cr.body.alumno.links_familia.length, 1);
  assert.match(decodeURIComponent(l.whatsapp), /Tomi/);
  const info = await post(cliente(), auth, { accion: "invitacion_info", token: tokenDe(l) });
  assert.equal(info.body.tipo, "familia"); assert.equal(info.body.alumno, "Tomi");
  const { c, r } = await usar(tokenDe(l), "carla@mail.com", "");
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.sesion.tipo, "familia");
  const ficha = (await pg.query("SELECT contactos FROM fichas WHERE alumno_id = $1", [id])).rows[0];
  assert.deepEqual(ficha.contactos, [{ nombre: "Carla", vinculo: "mamá", email: "carla@mail.com", telefono: "" }]);
  const mias = await c.llamar(fichas);
  assert.equal(mias.body.alumnos.length, 1); assert.equal(mias.body.alumnos[0].nombre, "Tomi");
  assert.equal((await usar(tokenDe(l), "otro@mail.com")).r.status, 410);
  // Otra docente de otra escuela no puede crear links para este alumno.
  assert.equal((await post(ana, fichas, { accion: "link_familia", id })).status, 404);
});

test("tope de cupos: panel X de 15, sin links nuevos, sin usar uno pendiente, sin invitar familias ni importar por encima; la baja libera", async () => {
  // Hoy: dire, laura, vice (escuela B) + carla (familia) = 4. Ana (ADMIN_EMAIL) no cuenta.
  const g = await dire.llamar(docentes);
  assert.deepEqual({ usados: g.body.cupos.usados, max: g.body.cupos.max }, { usados: 4, max: 15 });
  const pendiente = (await post(dire, docentes, { accion: "invitacion_crear" })).body.enlace;
  // Llenamos hasta 15 con familias ficticias de otro alumno.
  const otro = (await post(dire, fichas, { accion: "crear", nombre: "Lucas" })).body.alumno.id;
  const relleno = Array.from({ length: 11 }, (_, i) => `relleno${i}@mail.com`);
  const ids = [];
  for (const e of relleno) {
    await pg.query("INSERT INTO familias (email) VALUES ($1)", [e]);
    ids.push((await pg.query("INSERT INTO familia_alumno (familia_id, alumno_id) SELECT id, $2 FROM familias WHERE email = $1 RETURNING familia_id", [e, otro])).rows[0].familia_id);
  }
  const lleno = await dire.llamar(docentes);
  assert.equal(lleno.body.cupos.usados, 15); assert.equal(lleno.body.cupos.completo, true);
  const COMPLETO = /El piloto está completo/;

  const nuevo = await post(dire, docentes, { accion: "invitacion_crear" });
  assert.equal(nuevo.status, 409); assert.match(nuevo.body.error, COMPLETO);
  const fam = await post(dire, fichas, { accion: "link_familia", id: otro });
  assert.equal(fam.status, 409); assert.match(fam.body.error, COMPLETO);
  const info = await post(cliente(), auth, { accion: "invitacion_info", token: tokenDe(pendiente) });
  assert.equal(info.body.completo, true); assert.match(info.body.mensaje, COMPLETO);
  const uso = await usar(tokenDe(pendiente), "sobra@dos.edu.ar");
  assert.equal(uso.r.status, 409); assert.match(uso.r.body.error, COMPLETO);
  const guardar = await post(dire, fichas, { accion: "guardar", id: otro, contactos: [{ nombre: "Nueva", email: "nueva@mail.com" }] });
  assert.equal(guardar.status, 409); assert.match(guardar.body.error, COMPLETO);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM familias WHERE email = 'nueva@mail.com'")).rows[0].n, 0);
  assert.equal((await post(dire, docentes, { accion: "crear", nombre: "Sobra", email: "sobra2@dos.edu.ar" })).status, 409);
  // Importación: la vista previa avisa y confirmar no escribe.
  const planilla = { docentes: "nombre;email\nImportada;importada@dos.edu.ar\n", alumnos: "nombre;grado\n" };
  const prev = await post(dire, fichas, { accion: "importar_previa", ...planilla });
  assert.equal(prev.status, 200); assert.equal(prev.body.resumen.cupos.excede, true); assert.equal(prev.body.resumen.cupos.nuevas, 1);
  assert.ok(prev.body.errores.some(e => COMPLETO.test(e)));
  const conf = await post(dire, fichas, { accion: "importar_confirmar", ...planilla, huella: prev.body.huella, omitir_errores: true });
  assert.equal(conf.status, 409); assert.match(conf.body.error, COMPLETO);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM docentes WHERE email = 'importada@dos.edu.ar'")).rows[0].n, 0);
  // Una familia que ya tiene cuenta se puede sumar a otro alumno (no ocupa otro cupo).
  assert.equal((await post(dire, fichas, { accion: "guardar", id: otro, contactos: [{ nombre: "Carla", email: "carla@mail.com" }] })).status, 200);
  assert.equal((await dire.llamar(docentes)).body.cupos.usados, 4); // al guardar, los rellenos que no están en la ficha se desvinculan y se borran

  // Volvemos a llenar y probamos que dar de baja una cuenta libera su cupo.
  for (const e of relleno) {
    await pg.query("INSERT INTO familias (email) VALUES ($1) ON CONFLICT DO NOTHING", [e]);
    await pg.query("INSERT INTO familia_alumno (familia_id, alumno_id) SELECT id, $2 FROM familias WHERE email = $1", [e, otro]);
  }
  assert.equal((await dire.llamar(docentes)).body.cupos.usados, 15);
  assert.equal((await post(dire, docentes, { accion: "invitacion_crear" })).status, 409);
  const laura = (await pg.query("SELECT id FROM docentes WHERE email = 'laura@dos.edu.ar'")).rows[0].id;
  assert.equal((await post(dire, docentes, { accion: "desactivar", id: Number(laura) })).status, 200);
  assert.equal((await dire.llamar(docentes)).body.cupos.usados, 14);
  const ahora = await usar(tokenDe(pendiente), "entra@dos.edu.ar", "Entra");
  assert.equal(ahora.r.status, 200, JSON.stringify(ahora.r.body));
  assert.equal((await dire.llamar(docentes)).body.cupos.usados, 15);
  sinTope();
  assert.equal((await post(dire, docentes, { accion: "invitacion_crear" })).status, 200);
  delete process.env.PILOTO_MAX_USUARIOS;
});

test("el alta de la primera cuenta (setup) no depende del modo solo invitación", async () => {
  const { usarBaseDePrueba } = require("../api/_lib/db");
  const { PGlite } = require("@electric-sql/pglite");
  const otra = new PGlite();
  usarBaseDePrueba(otra);
  try {
    const r = await post(cliente(), auth, { accion: "setup", escuela: "Nueva", nombre: "Ana", email: "ana@plataforma.org", pin: "4321" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  } finally { usarBaseDePrueba(pg); }
});

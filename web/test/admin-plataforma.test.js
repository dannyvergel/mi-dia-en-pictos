// Panel de la plataforma (admin.html) y flujo de invitación en cascada:
// setup sin escuela (ADMIN_EMAIL) → la plataforma da de alta la escuela del padrón y genera el link del directivo →
// el directivo invita a las seños → las seños (o la dirección) invitan a las familias desde la ficha.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const docentes = require("../api/docentes");
const escuelas = require("../api/escuelas");
const fichas = require("../api/fichas");
const auditoria = require("../api/auditoria");
const solicitudes = require("../api/solicitudes");
const feedback = require("../api/feedback");
const correo = require("../api/_lib/correo");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY;
const ADMIN = "danny@puente.test", ALBORADA = "820002100", GAVIOTA = "820060800";
let pg, danny, dire, seno, alborada;
const post = (c, h, body) => c.llamar(h, { method: "POST", body });
const tokenDe = enlace => enlace.url.split("#invitacion=")[1];

async function usar(token, email, nombre, c = cliente()) {
  await pg.query("DELETE FROM limites");
  const p = await post(c, auth, { accion: "invitacion_pedir_codigo", token, email });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const r = await post(c, auth, { accion: "invitacion_verificar", token, email, codigo: p.body.codigo_dev, nombre });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { c, sesion: r.body.sesion };
}

test.before(async () => {
  process.env.ADMIN_EMAIL = ADMIN;
  process.env.PUENTE_URL = "https://puente.test";
  pg = await baseNueva();
  delete process.env.PILOTO_SOLO_INVITACION; delete process.env.PILOTO_MAX_USUARIOS; // valores del piloto: solo invitación, 15 cupos
  correo.usarBuzonDePrueba(true);
  await require("../api/_lib/db").q("SELECT 1"); // crea el esquema
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.ADMIN_EMAIL; delete process.env.PUENTE_URL; });
test.beforeEach(async () => { await pg.query("DELETE FROM limites"); });

test("setup sin escuela: la primera cuenta es la de ADMIN_EMAIL, sin escuela, y entra como plataforma", async () => {
  const e = await cliente().llamar(auth);
  assert.equal(e.body.necesita_setup, true);
  const r = await post(cliente(), auth, { accion: "setup", nombre: "Danny", email: ADMIN, pin: "4321" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM escuelas")).rows[0].n, 0);
  danny = await entrarConCodigo(pg, ADMIN);
  const s = (await danny.llamar(auth)).body.sesion;
  assert.deepEqual(s, { tipo: "docente", nombre: "Danny", email: ADMIN, es_admin: false, es_plataforma: true, tiene_escuela: false });
  // Sin escuela: sin alumnos ni docentes propios, pero el panel de la plataforma anda.
  assert.deepEqual((await danny.llamar(fichas)).body.alumnos, []);
  assert.deepEqual((await danny.llamar(escuelas, { query: { todas: "1" } })).body.escuelas, []);
  const inv = await danny.llamar(docentes, { query: { invitaciones: "1" } });
  assert.equal(inv.status, 200); assert.equal(inv.body.plataforma, true);
  assert.deepEqual({ usados: inv.body.cupos.usados, max: inv.body.cupos.max }, { usados: 0, max: 15 }); // ADMIN_EMAIL no cuenta
});

test("link de directivo para una escuela nueva del padrón: la escuela se crea al crear el link y el directivo queda admin", async () => {
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM escuelas WHERE cue = $1", [ALBORADA])).rows[0].n, 0);
  const cr = await post(danny, docentes, { accion: "invitacion_crear", cue: ALBORADA, es_admin: true, etiqueta: "Directora Alborada" });
  assert.equal(cr.status, 200, JSON.stringify(cr.body));
  const l = cr.body.enlace;
  assert.equal(l.tipo, "docente"); assert.equal(l.es_admin, true); assert.match(l.url, /^https:\/\/puente\.test\/login\.html#invitacion=/);
  const e = (await pg.query("SELECT id, nombre, localidad FROM escuelas WHERE cue = $1", [ALBORADA])).rows[0];
  assert.ok(e, "la escuela se creó desde el padrón"); assert.equal(e.localidad, "ROSARIO");
  alborada = Number(e.id); assert.equal(l.escuela_id, alborada);
  // Un segundo link para la misma escuela no la duplica.
  const otro = await post(danny, docentes, { accion: "invitacion_crear", cue: ALBORADA, es_admin: true });
  assert.equal(otro.status, 200); assert.equal(otro.body.enlace.escuela_id, alborada);
  assert.equal((await post(danny, docentes, { accion: "invitacion_revocar", id: otro.body.enlace.id })).status, 200);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM escuelas WHERE cue = $1", [ALBORADA])).rows[0].n, 1);
  // La directora usa el link: queda admin de esa escuela.
  const info = await post(cliente(), auth, { accion: "invitacion_info", token: tokenDe(l) });
  assert.equal(info.body.es_admin, true); assert.match(info.body.escuela, /ALBORADA/);
  const u = await usar(tokenDe(l), "marta@alborada.edu.ar", "Marta Directora");
  dire = u.c;
  assert.equal(u.sesion.es_admin, true); assert.equal(u.sesion.es_plataforma, false); assert.equal(u.sesion.tiene_escuela, true);
  const fila = (await pg.query("SELECT escuela_id, es_admin FROM docentes WHERE email = 'marta@alborada.edu.ar'")).rows[0];
  assert.equal(Number(fila.escuela_id), alborada); assert.equal(fila.es_admin, true);
});

test("alta de escuela desde el padrón en el panel y link de directivo por escuela_id", async () => {
  const a = await post(danny, escuelas, { accion: "crear_escuela", cue: GAVIOTA });
  assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(a.body.creada, true);
  const gaviota = a.body.escuela.id;
  const l = await post(danny, docentes, { accion: "invitacion_crear", escuela_id: gaviota, es_admin: true });
  assert.equal(l.status, 200); assert.equal(l.body.enlace.escuela_id, gaviota); assert.equal(l.body.enlace.es_admin, true);
  const lista = (await danny.llamar(escuelas, { query: { todas: "1" } })).body.escuelas;
  assert.equal(lista.find(e => e.id === gaviota).links_pendientes, 1);
  // La plataforma sin escuela no puede crear un link "para su escuela".
  assert.equal((await post(danny, docentes, { accion: "invitacion_crear" })).status, 404);
});

test("cascada: la directora invita a la seño; la seño (y la dirección) invitan a las familias desde la ficha", async () => {
  // La directora no puede invitar en otra escuela ni por CUE.
  assert.equal((await post(dire, docentes, { accion: "invitacion_crear", cue: GAVIOTA })).status, 403);
  const ls = await post(dire, docentes, { accion: "invitacion_crear", etiqueta: "Seño Laura" });
  assert.equal(ls.status, 200); assert.equal(ls.body.enlace.escuela_id, alborada); assert.equal(ls.body.enlace.es_admin, false);
  const u = await usar(tokenDe(ls.body.enlace), "laura@alborada.edu.ar", "Laura Seño");
  seno = u.c;
  assert.equal(u.sesion.es_admin, false);
  // La seño no invita docentes, pero sí familias de sus alumnos.
  assert.equal((await post(seno, docentes, { accion: "invitacion_crear" })).status, 403);
  const al = await post(seno, fichas, { accion: "crear", nombre: "Tomi" });
  assert.equal(al.status, 200, JSON.stringify(al.body));
  const lf = await post(seno, fichas, { accion: "link_familia", id: al.body.alumno.id, nombre: "Carla", vinculo: "mamá" });
  assert.equal(lf.status, 200, JSON.stringify(lf.body));
  const fam = await usar(tokenDe(lf.body.enlace), "carla@mail.com", "");
  assert.equal(fam.sesion.tipo, "familia");
  // La dirección también invita a otra familia del mismo alumno.
  const ld = await post(dire, fichas, { accion: "link_familia", id: al.body.alumno.id, nombre: "Pablo", vinculo: "papá" });
  assert.equal(ld.status, 200, JSON.stringify(ld.body));
  // El panel de la plataforma ve los cupos y los links de todas las escuelas.
  const inv = (await danny.llamar(docentes, { query: { invitaciones: "1" } })).body;
  assert.equal(inv.cupos.usados, 3); // directora + seño + familia
  assert.ok(inv.enlaces.some(x => x.tipo === "familia" && x.escuela_id === alborada));
  // Registro de accesos de toda la plataforma.
  const reg = (await danny.llamar(auditoria)).body;
  assert.equal(reg.plataforma, true);
  assert.ok(reg.eventos.filter(e => e.evento === "invitacion_usada").length >= 3);
});

test("admin solo con ADMIN_EMAIL: la directora y la seño reciben 403 en cada acción de plataforma", async () => {
  const pedidos = [
    [escuelas, { query: { todas: "1" } }],
    [escuelas, { query: { ficha: "1", id: String(alborada) } }],
    [escuelas, { method: "POST", body: { accion: "crear_escuela", cue: GAVIOTA } }],
    [escuelas, { method: "POST", body: { accion: "desactivar_escuela", id: alborada } }],
    [escuelas, { method: "POST", body: { accion: "guardar_ficha", escuela_id: alborada + 1, nombre: "Hackeada" } }],
    [docentes, { method: "POST", body: { accion: "invitacion_crear", cue: GAVIOTA, es_admin: true } }],
    [docentes, { method: "POST", body: { accion: "plataforma", id: 1, valor: true } }],
    [feedback, {}]
  ];
  for (const c of [dire, seno]) for (const [h, p] of pedidos) {
    const r = await c.llamar(h, p);
    assert.equal(r.status, 403, `${JSON.stringify(p)} → ${r.status}`);
  }
  // La directora sigue con su panel recortado a su escuela.
  const sol = await dire.llamar(solicitudes);
  assert.equal(sol.status, 200); assert.equal(sol.body.plataforma, false);
  assert.equal(Number((await dire.llamar(escuelas, { query: { ficha: "1" } })).body.ficha.id), alborada);
  // Ni siquiera la propia ADMIN_EMAIL puede promover a otra cuenta.
  const id = Number((await pg.query("SELECT id FROM docentes WHERE email = 'marta@alborada.edu.ar'")).rows[0].id);
  assert.equal((await post(danny, docentes, { accion: "plataforma", id, valor: true })).status, 403);
});

test("la plataforma desactiva y reactiva una escuela desde el panel", async () => {
  const r = await post(danny, escuelas, { accion: "desactivar_escuela", id: alborada });
  assert.equal(r.status, 200); assert.equal(r.body.escuela.activa, false);
  assert.equal((await dire.llamar(auth)).body.sesion, null); // se cortó su sesión
  assert.equal((await danny.llamar(auth)).body.sesion.es_plataforma, true); // la plataforma sigue
  assert.equal((await post(danny, escuelas, { accion: "activar_escuela", id: alborada })).status, 200);
});

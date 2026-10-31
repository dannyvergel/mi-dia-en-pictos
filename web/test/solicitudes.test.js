// Solicitudes de acceso de docentes: formulario público, aviso a admins, aprobar / rechazar.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const solicitudes = require("../api/solicitudes");
const docentes = require("../api/docentes");
const correo = require("../api/_lib/correo");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.PUENTE_URL;
process.env.ADMIN_EMAIL = "ana@escuela.edu.ar";
let pg, ana, buzon;
const post = (c, body, h = solicitudes) => c.llamar(h, { method: "POST", body });
const pedido = (extra = {}) => ({ accion: "crear", nombre: "Marta Gómez", email: "marta@escuela.edu.ar", escuela: "Escuela 2001", rol: "Seño de 2.º", mensaje: "Hola!", ...extra });
const pendientes = async () => (await pg.query("SELECT * FROM solicitudes WHERE estado = 'pendiente' ORDER BY id")).rows;

test.before(async () => {
  pg = await baseNueva();
  assert.equal((await post(cliente(), { accion: "setup", escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar", pin: "4321" }, auth)).status, 200);
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  buzon = correo.usarBuzonDePrueba(true);
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.ADMIN_EMAIL; });
test.beforeEach(async () => { await pg.query("DELETE FROM limites"); buzon.length = 0; });

test("pedido válido: queda pendiente, respuesta genérica, aviso a admins con datos escapados y link al panel", async () => {
  const r = await post(cliente(), pedido({ nombre: "Marta <script>alert(1)</script>", mensaje: "Soy <b>seño</b> & \"más\"" }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, mensaje: "Recibimos tu pedido, te avisamos por mail." });
  const [s] = await pendientes();
  assert.equal(s.email, "marta@escuela.edu.ar"); assert.equal(s.estado, "pendiente"); assert.ok(s.creado);
  assert.equal(buzon.length, 1);
  assert.deepEqual(buzon[0].to, ["ana@escuela.edu.ar"]); // ADMIN_EMAIL y admins, sin repetir
  assert.ok(!buzon[0].html.includes("<script>") && buzon[0].html.includes("&lt;script&gt;"));
  assert.ok(buzon[0].html.includes("&lt;b&gt;seño&lt;/b&gt; &amp; &quot;más&quot;"));
  assert.ok(!/[\r\n]/.test(buzon[0].subject));
  assert.match(buzon[0].text, /docente\.html#solicitudes/);
});

test("validación: nombre, email y escuela obligatorios; solo JSON", async () => {
  assert.equal((await post(cliente(), pedido({ nombre: "" }))).status, 400);
  assert.equal((await post(cliente(), pedido({ email: "no-es-email" }))).status, 400);
  assert.equal((await post(cliente(), pedido({ escuela: " " }))).status, 400);
  const form = await cliente().llamar(solicitudes, { method: "POST", body: "accion=crear&nombre=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(form.status, 415);
});

test("trampa para bots: con sitio_web lleno responde igual pero no guarda ni avisa", async () => {
  const antes = (await pendientes()).length;
  const r = await post(cliente(), pedido({ email: "bot@spam.com", sitio_web: "http://spam" }));
  assert.equal(r.status, 200); assert.equal(r.body.mensaje, "Recibimos tu pedido, te avisamos por mail.");
  assert.equal((await pendientes()).length, antes);
  assert.equal(buzon.length, 0);
});

test("no revela si el email ya es docente; un pedido repetido no duplica ni re-avisa", async () => {
  const yaEs = await post(cliente(), pedido({ email: "ana@escuela.edu.ar" }));
  assert.equal(yaEs.status, 200); assert.equal(yaEs.body.mensaje, "Recibimos tu pedido, te avisamos por mail.");
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM solicitudes WHERE email = 'ana@escuela.edu.ar'")).rows[0].n, 0);
  const otra = await post(cliente(), pedido({ escuela: "Escuela 2001 (turno tarde)" }));
  assert.equal(otra.status, 200);
  const ps = (await pendientes()).filter(s => s.email === "marta@escuela.edu.ar");
  assert.equal(ps.length, 1); assert.equal(ps[0].escuela, "Escuela 2001 (turno tarde)");
  assert.equal(buzon.length, 0);
});

test("límite por IP (5 por hora) y por email (3 por día)", async () => {
  const c = cliente("10.9.9.9");
  for (let i = 0; i < 5; i++) assert.equal((await post(c, pedido({ email: `ip${i}@x.com` }))).status, 200);
  assert.equal((await post(c, pedido({ email: "ip9@x.com" }))).status, 429);
  await pg.query("DELETE FROM limites");
  for (let i = 0; i < 3; i++) assert.equal((await post(cliente(), pedido({ email: "repetida@x.com" }))).status, 200);
  assert.equal((await post(cliente(), pedido({ email: "repetida@x.com" }))).status, 429);
});

test("sin sesión o sin ser admin no se ven ni se aprueban solicitudes", async () => {
  assert.equal((await cliente().llamar(solicitudes)).status, 401);
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES (1, 'beto@escuela.edu.ar', 'Beto')");
  const beto = await entrarConCodigo(pg, "beto@escuela.edu.ar");
  const lista = await beto.llamar(solicitudes);
  assert.equal(lista.status, 403); assert.equal(lista.body.pendientes, undefined);
  const id = (await pendientes())[0].id;
  assert.equal((await post(beto, { accion: "aprobar", id })).status, 403);
  assert.equal((await post(beto, { accion: "rechazar", id })).status, 403);
  assert.equal((await post(cliente(), { accion: "aprobar", id })).status, 401);
  assert.equal((await pendientes())[0].estado, "pendiente");
});

test("la admin ve las pendientes y las escuelas para elegir", async () => {
  const r = await ana.llamar(solicitudes);
  assert.equal(r.status, 200);
  assert.ok(r.body.pendientes.some(s => s.email === "marta@escuela.edu.ar"));
  assert.deepEqual(r.body.escuelas.map(e => e.nombre), ["Escuela 2001"]);
  assert.equal(r.body.mi_escuela, r.body.escuelas[0].id);
});

test("aprobar crea la docente sin contraseña en la escuela de la admin, le avisa y ya puede entrar con código", async () => {
  const s = (await pendientes()).find(x => x.email === "marta@escuela.edu.ar");
  await pg.query("DELETE FROM limites");
  // antes de aprobar no hay código
  assert.equal((await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "marta@escuela.edu.ar" }, auth)).body.codigo_dev, undefined);
  const r = await post(ana, { accion: "aprobar", id: s.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.avisada, true); assert.equal(r.body.docente.es_admin, false);
  const d = (await pg.query("SELECT * FROM docentes WHERE email = 'marta@escuela.edu.ar'")).rows[0];
  assert.equal(d.pass_hash, null); assert.equal(d.activo, true); assert.equal(Number(d.escuela_id), 1);
  const fila = (await pg.query("SELECT * FROM solicitudes WHERE id = $1", [s.id])).rows[0];
  assert.equal(fila.estado, "aprobada"); assert.ok(fila.resuelto); assert.equal(Number(fila.docente_id), Number(d.id));
  assert.deepEqual(buzon[0].to, ["marta@escuela.edu.ar"]);
  assert.match(buzon[0].subject, /Ya tenés acceso/); assert.match(buzon[0].text, /\/login\.html/);
  assert.equal((await post(ana, { accion: "aprobar", id: s.id })).status, 404); // ya no está pendiente
  const marta = await entrarConCodigo(pg, "marta@escuela.edu.ar");
  assert.equal((await marta.llamar(auth)).body.sesion.nombre, "Marta Gómez");
  assert.ok((await ana.llamar(docentes)).body.docentes.some(x => x.email === "marta@escuela.edu.ar"));
});

test("aprobar en una escuela nueva la hace admin de esa escuela", async () => {
  await post(cliente(), pedido({ nombre: "Lola", email: "lola@otra.edu.ar", escuela: "Escuela Otra" }));
  const s = (await pendientes()).find(x => x.email === "lola@otra.edu.ar");
  const r = await post(ana, { accion: "aprobar", id: s.id, escuela_nueva: "Escuela Otra", es_admin: false });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.docente.es_admin, true); assert.equal(r.body.escuela.nombre, "Escuela Otra");
  assert.notEqual(Number(r.body.escuela.id), 1);
});

test("rechazar: marca rechazada, avisa solo si se pide, y no da acceso", async () => {
  await post(cliente(), pedido({ nombre: "Pepa", email: "pepa@x.com" }));
  await post(cliente(), pedido({ nombre: "Rita", email: "rita@x.com" }));
  buzon.length = 0;
  const pepa = "pepa@x.com", rita = "rita@x.com";
  const ids = Object.fromEntries((await pendientes()).map(s => [s.email, s.id]));
  const r1 = await post(ana, { accion: "rechazar", id: ids[pepa] });
  assert.equal(r1.status, 200); assert.equal(r1.body.avisada, false); assert.equal(buzon.length, 0);
  const r2 = await post(ana, { accion: "rechazar", id: ids[rita], avisar: true });
  assert.equal(r2.body.avisada, true); assert.deepEqual(buzon[0].to, ["rita@x.com"]);
  assert.match(buzon[0].text, /no pudimos habilitar/);
  assert.equal((await pg.query("SELECT estado FROM solicitudes WHERE id = $1", [ids[rita]])).rows[0].estado, "rechazada");
  assert.equal((await post(ana, { accion: "aprobar", id: ids[rita] })).status, 404);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM docentes WHERE email IN ('pepa@x.com', 'rita@x.com')")).rows[0].n, 0);
});

test("una docente desactivada que vuelve a pedir acceso se reactiva al aprobar", async () => {
  await pg.query("UPDATE docentes SET activo = false WHERE email = 'beto@escuela.edu.ar'");
  await post(cliente(), pedido({ nombre: "Beto", email: "beto@escuela.edu.ar" }));
  const s = (await pendientes()).find(x => x.email === "beto@escuela.edu.ar");
  assert.ok(s);
  assert.equal((await post(ana, { accion: "aprobar", id: s.id })).status, 200);
  assert.equal((await pg.query("SELECT activo FROM docentes WHERE email = 'beto@escuela.edu.ar'")).rows[0].activo, true);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM docentes WHERE email = 'beto@escuela.edu.ar'")).rows[0].n, 1);
});

test("si Resend falla, el pedido igual se guarda y la respuesta es la misma", async () => {
  correo.usarBuzonDePrueba(false);
  process.env.RESEND_API_KEY = "re_test";
  const original = global.fetch;
  global.fetch = async () => new Response("caído", { status: 500 });
  try {
    const r = await post(cliente(), pedido({ nombre: "Sol", email: "sol@x.com" }));
    assert.equal(r.status, 200); assert.equal(r.body.mensaje, "Recibimos tu pedido, te avisamos por mail.");
    assert.ok((await pendientes()).some(s => s.email === "sol@x.com"));
  } finally { global.fetch = original; delete process.env.RESEND_API_KEY; buzon = correo.usarBuzonDePrueba(true); }
});

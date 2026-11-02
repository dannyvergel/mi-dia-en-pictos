// Invitación por mail a las familias que se suman en Contactos de la ficha.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const auth = require("../api/auth");
const fichas = require("../api/fichas");
const correo = require("../api/_lib/correo");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAIL; delete process.env.OPENROUTER_API_KEY;
process.env.PUENTE_URL = "https://puente.test";
let pg, ana, caro, buzon, juanId;
const post = (c, body) => c.llamar(fichas, { method: "POST", body });
const LAURA = { nombre: "Laura <script>x</script>", vinculo: "mamá", email: "laura@mail.com" };
const guardar = (contactos, c = ana) => post(c, { accion: "guardar", id: juanId, nombre: "Juan", contactos });

test.before(async () => {
  pg = await baseNueva();
  buzon = correo.usarBuzonDePrueba(true);
  await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana <b>Seño</b>", email: "ana@e.edu.ar" });
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES (1, 'caro@e.edu.ar', 'Caro')");
  ana = await entrarConCodigo(pg, "ana@e.edu.ar");
  caro = await entrarConCodigo(pg, "caro@e.edu.ar");
  juanId = (await post(ana, { accion: "crear", nombre: "Juan" })).body.alumno.id;
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.PUENTE_URL; });
test.beforeEach(() => { buzon.length = 0; });

test("al sumar un email a la ficha se manda la invitación, con datos escapados y link al login de familia", async () => {
  const r = await guardar([LAURA]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.invitaciones.enviadas, ["laura@mail.com"]);
  assert.equal(buzon.length, 1);
  const m = buzon[0];
  assert.deepEqual(m.to, ["laura@mail.com"]);
  assert.equal(m.subject, "Ana <b>Seño</b> te sumó a Puente para seguir el día de Juan");
  assert.ok(!m.html.includes("<script>") && !m.html.includes("<b>Seño</b>"));
  assert.ok(m.html.includes("Ana &lt;b&gt;Seño&lt;/b&gt;") && m.html.includes("Laura &lt;script&gt;"));
  assert.ok(m.html.includes("https://puente.test/login.html?familia&amp;email=laura%40mail.com"));
  assert.match(m.text, /https:\/\/puente\.test\/login\.html\?familia&email=laura%40mail\.com/);
  assert.match(m.text, /código de 6 números/); assert.match(m.text, /consentimiento/);
  assert.ok(r.body.alumno.invitaciones["laura@mail.com"]);
});

test("guardar de nuevo, o sacar y volver a poner el email en menos de 24 h, no reenvía", async () => {
  assert.deepEqual((await guardar([LAURA])).body.invitaciones.enviadas, []);
  await guardar([]);
  const r = await guardar([LAURA]);
  assert.deepEqual(r.body.invitaciones.recientes, ["laura@mail.com"]);
  assert.equal(buzon.length, 0);
});

test("reenviar invitación: 429 antes de 24 h; después se manda; email fuera de la ficha 404", async () => {
  const r1 = await post(ana, { accion: "invitar", id: juanId, email: "laura@mail.com" });
  assert.equal(r1.status, 429); assert.match(r1.body.error, /24 h/);
  assert.equal(buzon.length, 0);
  await pg.query("UPDATE invitaciones SET enviado = now() - interval '25 hours'");
  const r2 = await post(ana, { accion: "invitar", id: juanId, email: "laura@mail.com" });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(buzon.length, 1);
  assert.equal((await post(ana, { accion: "invitar", id: juanId, email: "laura@mail.com" })).status, 429);
  assert.equal((await post(ana, { accion: "invitar", id: juanId, email: "otro@mail.com" })).status, 404);
  assert.equal((await post(caro, { accion: "invitar", id: juanId, email: "laura@mail.com" })).status, 404); // no la tiene asignada
});

test("crear un alumno con contactos también invita", async () => {
  const r = await post(ana, { accion: "crear", nombre: "Sofía", contactos: [{ nombre: "Pablo", email: "pablo@mail.com" }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.invitaciones.enviadas, ["pablo@mail.com"]);
  assert.match(buzon[0].subject, /el día de Sofía/);
  assert.deepEqual(r.body.alumno.contactos.map(c => c.email), ["pablo@mail.com"]);
});

test("si el mail falla, la ficha se guarda igual y se puede reenviar después", async () => {
  correo.usarBuzonDePrueba(false);
  process.env.RESEND_API_KEY = "re_test";
  const original = global.fetch;
  global.fetch = async () => new Response("caído", { status: 500 });
  try {
    const r = await guardar([LAURA, { nombre: "Tío", email: "tio@mail.com" }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.invitaciones.fallidas, ["tio@mail.com"]);
    assert.deepEqual(r.body.alumno.contactos.map(c => c.email), ["laura@mail.com", "tio@mail.com"]);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM invitaciones WHERE email = 'tio@mail.com'")).rows[0].n, 0);
    assert.equal((await post(ana, { accion: "invitar", id: juanId, email: "tio@mail.com" })).status, 502);
  } finally { global.fetch = original; delete process.env.RESEND_API_KEY; buzon = correo.usarBuzonDePrueba(true); }
  assert.equal((await post(ana, { accion: "invitar", id: juanId, email: "tio@mail.com" })).status, 200);
  assert.deepEqual(buzon[0].to, ["tio@mail.com"]);
});

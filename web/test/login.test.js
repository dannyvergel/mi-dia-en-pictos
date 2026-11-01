// Con base (PGlite): alta de la primera docente, ingreso de docentes con código por email, sesiones, límites y docentes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const docentes = require("../api/docentes");
const dia = require("../api/dia");
const familia = require("../api/familia");
const correo = require("../api/_lib/correo");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.ADMIN_EMAIL; delete process.env.OPENROUTER_API_KEY; delete process.env.RESEND_API_KEY;
let pg;
test.before(async () => { pg = await baseNueva(); });
const post = (c, body) => c.llamar(auth, { method: "POST", body });

const SETUP = { accion: "setup", escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" };

test("estado inicial: modo db, sin sesión, falta setup, métodos de ingreso", async () => {
  const r = await cliente().llamar(auth);
  const { formulario, ...resto } = r.body;
  assert.deepEqual(resto, { modo: "db", sesion: null, necesita_setup: true, metodos: { docente: ["codigo"], familia: ["codigo"] } });
  assert.match(formulario, /^\d+\.[\w-]+$/); // token para buscar escuelas desde los formularios públicos
});

test("setup: PIN incorrecto → 401; ADMIN_EMAIL obliga ese email", async () => {
  const c = cliente();
  assert.equal((await post(c, { ...SETUP, pin: "0000" })).status, 401);
  process.env.ADMIN_EMAIL = "otra@escuela.edu.ar";
  assert.equal((await post(c, { ...SETUP, pin: "4321" })).status, 403);
  delete process.env.ADMIN_EMAIL;
});

test("setup crea la primera docente admin sin contraseña y sin abrir sesión; no se puede repetir", async () => {
  const c = cliente();
  const r = await post(c, { ...SETUP, pin: "4321" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers["set-cookie"], undefined); // el PIN no prueba el email: entra con código
  assert.equal((await c.llamar(auth)).body.sesion, null);
  const fila = (await pg.query("SELECT pass_hash, es_admin FROM docentes WHERE email = 'ana@escuela.edu.ar'")).rows[0];
  assert.equal(fila.pass_hash, null); assert.equal(fila.es_admin, true);
  assert.equal((await post(cliente(), { ...SETUP, email: "x@y.com", pin: "4321" })).status, 409);
});

test("docente entra con código: cookie segura, código hasheado y de un solo uso, logout invalida", async () => {
  const c = cliente();
  const p = await post(c, { accion: "pedir_codigo", tipo: "docente", email: "ANA@escuela.edu.ar " });
  assert.equal(p.status, 200); assert.match(p.body.codigo_dev, /^\d{6}$/);
  const fila = (await pg.query("SELECT codigo_hash, tipo FROM codigos ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(fila.tipo, "docente"); assert.ok(!fila.codigo_hash.includes(p.body.codigo_dev));
  const v = await post(c, { accion: "verificar_codigo", tipo: "docente", email: "ana@escuela.edu.ar", codigo: p.body.codigo_dev });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(v.headers["set-cookie"].includes(flag), flag);
  assert.deepEqual((await c.llamar(auth)).body.sesion, { tipo: "docente", nombre: "Ana", email: "ana@escuela.edu.ar", es_admin: true, es_plataforma: true });
  assert.equal((await post(cliente(), { accion: "verificar_codigo", tipo: "docente", email: "ana@escuela.edu.ar", codigo: p.body.codigo_dev })).status, 401); // ya usado
  const cookieVieja = c.cookie;
  await post(c, { accion: "logout" });
  assert.equal((await c.llamar(auth)).body.sesion, null);
  c.cookie = cookieVieja; // reusar la cookie después del logout no sirve
  assert.equal((await c.llamar(auth)).body.sesion, null);
});

test("pedir código: email desconocido o inactivo da la misma respuesta, sin código", async () => {
  await pg.query("DELETE FROM limites");
  const ok = await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "ana@escuela.edu.ar" });
  const nadie = await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "nadie@x.com" });
  assert.equal(nadie.status, 200); assert.equal(nadie.body.codigo_dev, undefined);
  assert.equal(nadie.body.mensaje, ok.body.mensaje);
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre, activo) VALUES (1, 'baja@escuela.edu.ar', 'Baja', false)");
  const baja = await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "baja@escuela.edu.ar" });
  assert.equal(baja.body.codigo_dev, undefined); assert.equal(baja.body.mensaje, ok.body.mensaje);
  assert.equal((await post(cliente(), { accion: "pedir_codigo", tipo: "admin", email: "ana@escuela.edu.ar" })).status, 400);
});

test("un código de docente no sirve para entrar como familia (ni al revés)", async () => {
  await pg.query("DELETE FROM limites");
  const p = await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "ana@escuela.edu.ar" });
  const r = await post(cliente(), { accion: "verificar_codigo", tipo: "familia", email: "ana@escuela.edu.ar", codigo: p.body.codigo_dev });
  assert.equal(r.status, 401);
  assert.equal((await post(cliente(), { accion: "verificar_codigo", email: "ana@escuela.edu.ar", codigo: p.body.codigo_dev })).status, 401); // sin tipo = familia
});

test("límites: 3 códigos por email cada 15 min; 5 intentos fallidos anulan el código", async () => {
  await pg.query("DELETE FROM limites");
  const c = cliente();
  let p;
  for (let i = 0; i < 3; i++) p = await post(c, { accion: "pedir_codigo", tipo: "docente", email: "ana@escuela.edu.ar" });
  assert.equal((await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "ana@escuela.edu.ar" })).status, 429);
  const malo = p.body.codigo_dev === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await post(c, { accion: "verificar_codigo", tipo: "docente", email: "ana@escuela.edu.ar", codigo: malo })).status, 401);
  assert.equal((await post(c, { accion: "verificar_codigo", tipo: "docente", email: "ana@escuela.edu.ar", codigo: p.body.codigo_dev })).status, 401);
});

test("código vencido no sirve", async () => {
  await pg.query("DELETE FROM limites");
  const p = await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "ana@escuela.edu.ar" });
  await pg.query("UPDATE codigos SET expira = now() - interval '1 minute'");
  assert.equal((await post(cliente(), { accion: "verificar_codigo", tipo: "docente", email: "ana@escuela.edu.ar", codigo: p.body.codigo_dev })).status, 401);
});

test("contraseñas fuera de uso: login_docente y cambiar_password responden 410", async () => {
  assert.equal((await post(cliente(), { accion: "login_docente", email: "ana@escuela.edu.ar", password: "lo-que-sea-123" })).status, 410);
  assert.equal((await post(cliente(), { accion: "cambiar_password", actual: "x", nueva: "y" })).status, 410);
});

test("cookie adulterada no sirve", async () => {
  const c = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  const [token] = c.cookie.split("=")[1].split(".");
  c.cookie = `puente_sesion=${token}.firmafalsa`;
  assert.equal((await c.llamar(auth)).body.sesion, null);
});

test("docentes: la admin suma una docente sin contraseña (le llega un mail); la nueva entra con código pero no suma otras", async () => {
  const admin = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  const buzon = correo.usarBuzonDePrueba(true);
  try {
    const r = await admin.llamar(docentes, { method: "POST", body: { accion: "crear", nombre: "Caro <b>", email: "caro@escuela.edu.ar" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.docente.avisada, true);
    assert.deepEqual(buzon[0].to, ["caro@escuela.edu.ar"]);
    assert.match(buzon[0].text, /login\.html/);
    assert.ok(buzon[0].html.includes("Caro &lt;b&gt;") && !buzon[0].html.includes("Caro <b>"));
  } finally { correo.usarBuzonDePrueba(false); }
  assert.equal((await admin.llamar(docentes)).body.docentes.length >= 2, true);
  const caro = await entrarConCodigo(pg, "caro@escuela.edu.ar");
  assert.equal((await caro.llamar(docentes, { method: "POST", body: { accion: "crear", nombre: "X", email: "x@x.com" } })).status, 403);
  // la admin la desactiva: su sesión muere y no puede pedir código
  const id = (await admin.llamar(docentes)).body.docentes.find(d => d.email === "caro@escuela.edu.ar").id;
  assert.equal((await admin.llamar(docentes, { method: "POST", body: { accion: "desactivar", id } })).status, 200);
  assert.equal((await caro.llamar(auth)).body.sesion, null);
  await pg.query("DELETE FROM limites");
  assert.equal((await post(cliente(), { accion: "pedir_codigo", tipo: "docente", email: "caro@escuela.edu.ar" })).body.codigo_dev, undefined);
});

test("dia y publicar piden sesión de docente (el PIN ya no alcanza)", async () => {
  const c = cliente();
  assert.equal((await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "x" }, headers: { "x-docente-pin": "4321" } })).status, 401);
  assert.equal((await c.llamar(familia, { method: "POST", body: { accion: "publicar", alumno: "Juan", registros: [] }, headers: { "x-docente-pin": "4321" } })).status, 401);
  await entrarConCodigo(pg, "ana@escuela.edu.ar", "docente", c);
  assert.equal((await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "x" } })).status, 404); // Juan no es alumno suyo
  assert.equal((await c.llamar(require("../api/fichas"), { method: "POST", body: { accion: "crear", nombre: "Juan" } })).status, 200);
  assert.equal((await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "x" } })).status, 503); // autorizada; sin IA
});

test("escrituras sin JSON se rechazan (defensa CSRF)", async () => {
  const r = await cliente().llamar(auth, { method: "POST", body: "accion=logout", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(r.status, 415);
});

test("producción sin SESSION_SECRET: error claro", async () => {
  process.env.VERCEL_ENV = "production"; delete process.env.SESSION_SECRET;
  try {
    const r = await cliente().llamar(auth, { headers: { cookie: "puente_sesion=a.b" } });
    assert.equal(r.status, 500); assert.match(r.body.error, /SESSION_SECRET/);
  } finally { delete process.env.VERCEL_ENV; }
});

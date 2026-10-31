// Con base (PGlite): alta de la primera docente, login, sesiones, límites y docentes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente } = require("./ayuda");
const auth = require("../api/auth");
const docentes = require("../api/docentes");
const dia = require("../api/dia");
const familia = require("../api/familia");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.ADMIN_EMAIL; delete process.env.OPENROUTER_API_KEY;
let pg;
test.before(async () => { pg = await baseNueva(); });

const SETUP = { accion: "setup", escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar", password: "clave-segura-1" };

test("estado inicial: modo db, sin sesión, falta setup", async () => {
  const r = await cliente().llamar(auth);
  assert.deepEqual(r.body, { modo: "db", sesion: null, necesita_setup: true });
});

test("setup: PIN incorrecto → 401; ADMIN_EMAIL obliga ese email", async () => {
  const c = cliente();
  assert.equal((await c.llamar(auth, { method: "POST", body: { ...SETUP, pin: "0000" } })).status, 401);
  process.env.ADMIN_EMAIL = "otra@escuela.edu.ar";
  assert.equal((await c.llamar(auth, { method: "POST", body: { ...SETUP, pin: "4321" } })).status, 403);
  delete process.env.ADMIN_EMAIL;
});

test("setup crea la primera docente admin con cookie segura; no se puede repetir", async () => {
  const c = cliente();
  const r = await c.llamar(auth, { method: "POST", body: { ...SETUP, pin: "4321" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sc = r.headers["set-cookie"];
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(sc.includes(flag), flag);
  assert.equal((await c.llamar(auth)).body.sesion.es_admin, true);
  const otra = await cliente().llamar(auth, { method: "POST", body: { ...SETUP, email: "x@y.com", pin: "4321" } });
  assert.equal(otra.status, 409);
  const fila = (await pg.query("SELECT pass_hash FROM docentes WHERE email = 'ana@escuela.edu.ar'")).rows[0];
  assert.ok(fila.pass_hash.startsWith("scrypt$") && !fila.pass_hash.includes("clave-segura-1"));
});

test("login: ok, error genérico, logout invalida la sesión", async () => {
  const c = cliente();
  const mal = await c.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "ana@escuela.edu.ar", password: "mala-clave-xx" } });
  assert.equal(mal.status, 401); assert.equal(mal.body.error, "Email o contraseña incorrectos");
  const nadie = await c.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "nadie@x.com", password: "mala-clave-xx" } });
  assert.equal(nadie.body.error, mal.body.error); // no revela si el email existe
  const ok = await c.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "ANA@escuela.edu.ar ", password: "clave-segura-1" } });
  assert.equal(ok.status, 200);
  const cookieVieja = c.cookie;
  assert.equal((await c.llamar(auth)).body.sesion.tipo, "docente");
  await c.llamar(auth, { method: "POST", body: { accion: "logout" } });
  assert.equal((await c.llamar(auth)).body.sesion, null);
  c.cookie = cookieVieja; // reusar la cookie después del logout no sirve
  assert.equal((await c.llamar(auth)).body.sesion, null);
});

test("cookie adulterada no sirve", async () => {
  const c = cliente();
  await c.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "ana@escuela.edu.ar", password: "clave-segura-1" } });
  const [token] = c.cookie.split("=")[1].split(".");
  c.cookie = `puente_sesion=${token}.firmafalsa`;
  assert.equal((await c.llamar(auth)).body.sesion, null);
});

test("límite: 5 fallos por email bloquean aunque después pongan la clave correcta", async () => {
  const c = cliente();
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre, pass_hash) SELECT escuela_id, 'beto@escuela.edu.ar', 'Beto', pass_hash FROM docentes WHERE email = 'ana@escuela.edu.ar'");
  for (let i = 0; i < 5; i++) assert.equal((await c.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "beto@escuela.edu.ar", password: "nop-nop-nop" } })).status, 401);
  const r = await cliente().llamar(auth, { method: "POST", body: { accion: "login_docente", email: "beto@escuela.edu.ar", password: "clave-segura-1" } });
  assert.equal(r.status, 429);
});

test("docentes: la admin suma una docente; la nueva entra pero no puede sumar otras", async () => {
  const admin = cliente();
  await admin.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "ana@escuela.edu.ar", password: "clave-segura-1" } });
  const r = await admin.llamar(docentes, { method: "POST", body: { accion: "crear", nombre: "Caro", email: "caro@escuela.edu.ar", password: "inicial-1234" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await admin.llamar(docentes)).body.docentes.length >= 2, true);
  const caro = cliente();
  assert.equal((await caro.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "caro@escuela.edu.ar", password: "inicial-1234" } })).status, 200);
  assert.equal((await caro.llamar(docentes, { method: "POST", body: { accion: "crear", nombre: "X", email: "x@x.com", password: "inicial-1234" } })).status, 403);
  // cambia su clave
  assert.equal((await caro.llamar(auth, { method: "POST", body: { accion: "cambiar_password", actual: "inicial-1234", nueva: "mi-clave-nueva-1" } })).status, 200);
  assert.equal((await cliente().llamar(auth, { method: "POST", body: { accion: "login_docente", email: "caro@escuela.edu.ar", password: "mi-clave-nueva-1" } })).status, 200);
  // la admin la desactiva y su sesión muere
  const id = (await admin.llamar(docentes)).body.docentes.find(d => d.email === "caro@escuela.edu.ar").id;
  assert.equal((await admin.llamar(docentes, { method: "POST", body: { accion: "desactivar", id } })).status, 200);
  assert.equal((await caro.llamar(auth)).body.sesion, null);
});

test("dia y publicar piden sesión de docente (el PIN ya no alcanza)", async () => {
  const c = cliente();
  assert.equal((await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "x" }, headers: { "x-docente-pin": "4321" } })).status, 401);
  assert.equal((await c.llamar(familia, { method: "POST", body: { accion: "publicar", alumno: "Juan", registros: [] }, headers: { "x-docente-pin": "4321" } })).status, 401);
  await c.llamar(auth, { method: "POST", body: { accion: "login_docente", email: "ana@escuela.edu.ar", password: "clave-segura-1" } });
  assert.equal((await c.llamar(dia, { method: "POST", body: { alumno: "Juan", texto: "x" } })).status, 503); // autorizada; sin IA
});

test("escrituras sin JSON se rechazan (defensa CSRF)", async () => {
  const r = await cliente().llamar(auth, { method: "POST", body: "accion=logout", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(r.status, 415);
});

test("producción sin SESSION_SECRET: error claro", async () => {
  process.env.VERCEL_ENV = "production"; delete process.env.SESSION_SECRET;
  try {
    const r = await cliente().llamar(auth, { method: "POST", body: { accion: "login_docente", email: "ana@escuela.edu.ar", password: "clave-segura-1" } });
    assert.equal(r.status, 500); assert.match(r.body.error, /SESSION_SECRET/);
  } finally { delete process.env.VERCEL_ENV; }
});

// "Entrar con Google" (OIDC) para docentes: inicio con state/nonce/PKCE, callback, solo cuentas existentes, botón según /api/config.
// fetch a Google está simulado: no sale nada a la red.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { baseNueva, cliente, altaEscuela } = require("./ayuda");
const auth = require("../api/auth");
const config = require("../api/config");

delete process.env.VERCEL_ENV; delete process.env.ADMIN_EMAIL; delete process.env.RESEND_API_KEY;
delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_REDIRECT_URI;
const CLIENTE = "123-abc.apps.googleusercontent.com";
const conGoogle = () => { process.env.GOOGLE_CLIENT_ID = CLIENTE; process.env.GOOGLE_CLIENT_SECRET = "secreto-de-prueba"; process.env.PUENTE_URL = "https://puentepictos.app"; };
const sinGoogle = () => { delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.PUENTE_URL; };

let pg;
const fetchReal = global.fetch;
test.before(async () => {
  pg = await baseNueva();
  await pg.query("SELECT 1");
  await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
});
test.after(() => { global.fetch = fetchReal; sinGoogle(); });

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = claims => `${b64({ alg: "RS256", typ: "JWT" })}.${b64(claims)}.firma`;
// Simula el token endpoint de Google y guarda lo que se le mandó.
function googleDevuelve(claimsDe) {
  const llamadas = [];
  global.fetch = async (url, opc) => {
    llamadas.push({ url, body: new URLSearchParams(opc.body) });
    if (url !== "https://oauth2.googleapis.com/token") throw new Error("URL inesperada " + url);
    return { ok: true, status: 200, json: async () => ({ access_token: "x", id_token: idToken(claimsDe(llamadas.at(-1))) }) };
  };
  return llamadas;
}
const cookieDe = (r, nombre) => [].concat(r.headers["set-cookie"] || []).find(c => c.startsWith(nombre + "="));

// Hace el inicio y devuelve { c, state, nonce, cookieGoogle, location }.
async function iniciar(query = {}) {
  const c = cliente();
  const r = await c.llamar(auth, { query: { accion: "google", ...query } });
  assert.equal(r.status, 302);
  const u = new URL(r.headers.location);
  return { c, r, u, state: u.searchParams.get("state"), nonce: u.searchParams.get("nonce"), cookieGoogle: cookieDe(r, "puente_google").split(";")[0] };
}
const volverDeGoogle = (ini, query) => ini.c.llamar(auth, { query: { accion: "google", ...query }, headers: { cookie: ini.cookieGoogle } });
const claimsOk = (email, nonce) => ({ iss: "https://accounts.google.com", aud: CLIENTE, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000),
  email, email_verified: true, nonce, sub: "1" });

test("sin variables: /api/config da google:false, métodos sin google y ?accion=google vuelve al login", async () => {
  sinGoogle();
  assert.equal((await cliente().llamar(config)).body.google, false);
  assert.deepEqual((await cliente().llamar(auth)).body.metodos, { docente: ["codigo"], familia: ["codigo"] });
  const r = await cliente().llamar(auth, { query: { accion: "google" } });
  assert.equal(r.status, 302); assert.equal(r.headers.location, "/login.html");
  assert.equal(r.headers["set-cookie"], undefined);
});

test("login.html: el botón arranca oculto y solo se muestra si /api/config dice google: true (y no en ?familia)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "login.html"), "utf8");
  assert.match(html, /<div id="dGoogle" hidden>/);
  assert.ok(html.includes('href="/api/auth?accion=google"'));
  assert.ok(html.includes("c.google === true"));
  assert.ok(html.includes('if (location.search.includes("familia")) return;'));
  // El botón vive solo en la vista docente.
  const familia = html.slice(html.indexOf("<!-- FAMILIA -->"), html.indexOf('<section id="demo">'));
  assert.ok(!familia.includes("Google"));
  assert.ok(html.includes("Ese mail no tiene acceso a Puente. Pedí una invitación a tu escuela."));
});

test("con variables: config google:true (sin exponer valores) y el inicio redirige a Google con state, nonce y PKCE en cookie firmada", async () => {
  conGoogle();
  try {
    const cfg = (await cliente().llamar(config)).body;
    assert.equal(cfg.google, true); assert.ok(!JSON.stringify(cfg).includes(CLIENTE));
    assert.deepEqual((await cliente().llamar(auth)).body.metodos.docente, ["codigo", "google"]);
    const { r, u, state, nonce } = await iniciar();
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(u.searchParams.get("client_id"), CLIENTE);
    assert.equal(u.searchParams.get("redirect_uri"), "https://puentepictos.app/api/auth?accion=google");
    assert.equal(u.searchParams.get("scope"), "openid email");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.ok(state.length >= 40 && nonce.length >= 40 && state !== nonce);
    const ck = cookieDe(r, "puente_google");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=600"]) assert.ok(ck.includes(flag), flag);
  } finally { sinGoogle(); }
});

test("callback con state inválido, sin cookie o cookie adulterada: no crea sesión ni llama a Google", async () => {
  conGoogle();
  try {
    const llamadas = googleDevuelve(() => claimsOk("ana@escuela.edu.ar", "x"));
    const ini = await iniciar();
    let r = await volverDeGoogle(ini, { code: "c1", state: "otro-state" });
    assert.equal(r.status, 302); assert.match(r.headers.location, /^\/login\.html\?google=error$/);
    assert.equal(cookieDe(r, "puente_sesion"), undefined);
    r = await ini.c.llamar(auth, { query: { accion: "google", code: "c1", state: ini.state } }); // sin cookie
    assert.match(r.headers.location, /google=error/);
    const [datos] = ini.cookieGoogle.split("=")[1].split(".");
    r = await ini.c.llamar(auth, { query: { accion: "google", code: "c1", state: ini.state }, headers: { cookie: `puente_google=${datos}.firmaFalsa` } });
    assert.match(r.headers.location, /google=error/);
    assert.equal(llamadas.length, 0);
    assert.equal((await ini.c.llamar(auth)).body.sesion, null);
  } finally { sinGoogle(); }
});

test("id_token con nonce, aud, iss, exp o email_verified incorrectos: no entra", async () => {
  conGoogle();
  try {
    const malos = [
      n => ({ ...claimsOk("ana@escuela.edu.ar", n), nonce: "otro" }),
      n => ({ ...claimsOk("ana@escuela.edu.ar", n), aud: "otro-cliente" }),
      n => ({ ...claimsOk("ana@escuela.edu.ar", n), iss: "https://malo.example" }),
      n => ({ ...claimsOk("ana@escuela.edu.ar", n), exp: Math.floor(Date.now() / 1000) - 10 }),
      n => ({ ...claimsOk("ana@escuela.edu.ar", n), email_verified: false })
    ];
    for (const malo of malos) {
      await pg.query("DELETE FROM limites");
      const ini = await iniciar();
      googleDevuelve(() => malo(ini.nonce));
      const r = await volverDeGoogle(ini, { code: "c", state: ini.state });
      assert.match(r.headers.location, /google=error/);
      assert.equal(cookieDe(r, "puente_sesion"), undefined);
    }
  } finally { sinGoogle(); }
});

test("email desconocido: no crea cuenta, vuelve con sin_acceso y registra login_fallido", async () => {
  conGoogle();
  try {
    await pg.query("DELETE FROM limites");
    const antes = (await pg.query("SELECT count(*)::int AS n FROM docentes")).rows[0].n;
    const ini = await iniciar();
    googleDevuelve(() => claimsOk("nadie@gmail.com", ini.nonce));
    const r = await volverDeGoogle(ini, { code: "c", state: ini.state });
    assert.equal(r.status, 302); assert.equal(r.headers.location, "/login.html?google=sin_acceso");
    assert.equal(cookieDe(r, "puente_sesion"), undefined);
    assert.ok(cookieDe(r, "puente_google").includes("Max-Age=0")); // la cookie de estado se borra
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM docentes")).rows[0].n, antes);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM familias WHERE email = 'nadie@gmail.com'")).rows[0].n, 0);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM sesiones")).rows[0].n, 0);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM auditoria WHERE evento = 'login_fallido'")).rows[0].n, 1);
    // Una docente desactivada tampoco entra.
    await pg.query("INSERT INTO docentes (escuela_id, email, nombre, activo) VALUES ((SELECT id FROM escuelas LIMIT 1), 'baja@escuela.edu.ar', 'Baja', false)");
    const ini2 = await iniciar();
    googleDevuelve(() => claimsOk("baja@escuela.edu.ar", ini2.nonce));
    assert.equal((await volverDeGoogle(ini2, { code: "c", state: ini2.state })).headers.location, "/login.html?google=sin_acceso");
  } finally { sinGoogle(); }
});

test("docente activa: crea la misma sesión que el código, audita login_google, manda code + PKCE a Google", async () => {
  conGoogle();
  try {
    await pg.query("DELETE FROM limites"); await pg.query("DELETE FROM sesiones");
    const ini = await iniciar();
    const llamadas = googleDevuelve(() => claimsOk("ANA@escuela.edu.ar", ini.nonce));
    const r = await volverDeGoogle(ini, { code: "codigo-google", state: ini.state, scope: "openid email" });
    assert.equal(r.status, 302); assert.equal(r.headers.location, "/login.html");
    const ses = cookieDe(r, "puente_sesion");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(ses.includes(flag), flag);
    assert.deepEqual((await ini.c.llamar(auth)).body.sesion,
      { tipo: "docente", nombre: "Ana", email: "ana@escuela.edu.ar", es_admin: true, es_plataforma: false, tiene_escuela: true });
    const b = llamadas[0].body;
    assert.equal(b.get("code"), "codigo-google"); assert.equal(b.get("grant_type"), "authorization_code");
    assert.equal(b.get("redirect_uri"), "https://puentepictos.app/api/auth?accion=google");
    const crypto = require("crypto");
    assert.equal(crypto.createHash("sha256").update(b.get("code_verifier")).digest("base64url"), ini.u.searchParams.get("code_challenge"));
    const a = (await pg.query("SELECT * FROM auditoria WHERE evento = 'login_google'")).rows;
    assert.equal(a.length, 1); assert.equal(a[0].actor_tipo, "docente"); assert.ok(a[0].email_hash && !a[0].email_hash.includes("@"));
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM docentes WHERE email = 'ana@escuela.edu.ar'")).rows[0].n, 1);
    // Volver con ?volver=cuaderno se respeta.
    const ini2 = await iniciar({ volver: "cuaderno" });
    googleDevuelve(() => claimsOk("ana@escuela.edu.ar", ini2.nonce));
    assert.equal((await volverDeGoogle(ini2, { code: "c", state: ini2.state })).headers.location, "/login.html?volver=cuaderno");
  } finally { sinGoogle(); }
});

test("la cuenta de la plataforma (ADMIN_EMAIL, sin escuela) entra con Google; usuario que cancela vuelve con aviso", async () => {
  conGoogle(); process.env.ADMIN_EMAIL = "plata@puente.org";
  try {
    await pg.query("DELETE FROM limites");
    await pg.query("INSERT INTO docentes (escuela_id, email, nombre, es_admin, es_plataforma) VALUES (NULL, 'plata@puente.org', 'Plata', false, true)");
    const ini = await iniciar();
    googleDevuelve(() => claimsOk("plata@puente.org", ini.nonce));
    const r = await volverDeGoogle(ini, { code: "c", state: ini.state });
    assert.equal(r.headers.location, "/login.html");
    assert.equal((await ini.c.llamar(auth)).body.sesion.es_plataforma, true);
    const ini2 = await iniciar();
    const r2 = await volverDeGoogle(ini2, { error: "access_denied", state: ini2.state });
    assert.equal(r2.headers.location, "/login.html?google=cancelado");
  } finally { sinGoogle(); delete process.env.ADMIN_EMAIL; }
});

test("límite: más de 30 vueltas de Google por IP en 15 min se cortan", async () => {
  conGoogle();
  try {
    await pg.query("DELETE FROM limites");
    const ini = await iniciar();
    for (let i = 0; i < 30; i++) await pg.query("INSERT INTO limites (clave) VALUES ($1)", ["verif:ip:" + "10.9.9.9"]);
    const c = cliente("10.9.9.9");
    const r = await c.llamar(auth, { query: { accion: "google", code: "c", state: ini.state }, headers: { cookie: ini.cookieGoogle } });
    assert.equal(r.headers.location, "/login.html?google=limite");
  } finally { sinGoogle(); }
});

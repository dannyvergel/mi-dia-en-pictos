// SMTP (nodemailer) and the no-email LAN mode (SMTP_DISABLED=1). A stub transport replaces the network.
const test = require("node:test");
const assert = require("node:assert/strict");
const correo = require("../api/_lib/correo");
const { baseNueva, cliente, altaEscuela } = require("./ayuda");
const auth = require("../api/auth");

const VARS = ["SMTP_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_SECURE", "SMTP_DISABLED",
  "RESEND_API_KEY", "RESEND_FROM", "VERCEL_ENV", "APP_ENV"];
const guardado = {};
test.beforeEach(() => { for (const k of VARS) { guardado[k] = process.env[k]; delete process.env[k]; } });
test.afterEach(() => {
  for (const k of VARS) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; }
  correo.usarTransporteDePrueba(null);
});

function transporteFalso({ falla = false } = {}) {
  const enviados = [];
  return { enviados, sendMail: async m => { if (falla) throw new Error("smtp caído"); enviados.push(m); return { messageId: "x" }; } };
}
function capturarLog(fn) {
  const lineas = [], o = { log: console.log, error: console.error };
  console.log = (...a) => lineas.push(a.join(" ")); console.error = (...a) => lineas.push(a.join(" "));
  return Promise.resolve().then(fn).then(r => ({ r, lineas }), e => { throw e; }).finally(() => { console.log = o.log; console.error = o.error; });
}

test("modoCorreo: sin variables SMTP nada cambia (dev, preview, falta, resend)", () => {
  assert.equal(correo.modoCorreo(), "dev");
  process.env.VERCEL_ENV = "preview"; assert.equal(correo.modoCorreo(), "log");
  process.env.VERCEL_ENV = "production"; assert.equal(correo.modoCorreo(), "falta");
  process.env.RESEND_API_KEY = "re_x"; assert.equal(correo.modoCorreo(), "resend");
});

test("modoCorreo: SMTP_URL o SMTP_HOST activan smtp (y ganan sobre Resend); SMTP_DISABLED gana sobre todo", () => {
  process.env.SMTP_URL = "smtp://u:p@mail:587"; assert.equal(correo.modoCorreo(), "smtp");
  delete process.env.SMTP_URL; process.env.SMTP_HOST = "mail.local"; assert.equal(correo.modoCorreo(), "smtp");
  process.env.RESEND_API_KEY = "re_x"; assert.equal(correo.modoCorreo(), "smtp");
  process.env.SMTP_DISABLED = "1"; assert.equal(correo.modoCorreo(), "sin_correo");
  process.env.SMTP_DISABLED = "0"; assert.equal(correo.modoCorreo(), "smtp");
});

test("configuración del transporte: SMTP_URL tal cual; si no, host/puerto/usuario/secure", () => {
  process.env.SMTP_URL = "smtp://u:p@mail:587";
  assert.equal(correo.opcionesSmtp(), "smtp://u:p@mail:587");
  delete process.env.SMTP_URL;
  process.env.SMTP_HOST = "mail.local"; process.env.SMTP_PORT = "465"; process.env.SMTP_USER = "u"; process.env.SMTP_PASS = "p";
  assert.deepEqual(correo.opcionesSmtp(), { host: "mail.local", port: 465, secure: true, auth: { user: "u", pass: "p" } });
  process.env.SMTP_PORT = "587"; assert.equal(correo.opcionesSmtp().secure, false);
  process.env.SMTP_SECURE = "true"; assert.equal(correo.opcionesSmtp().secure, true);
  delete process.env.SMTP_USER; assert.equal(correo.opcionesSmtp().auth, undefined);
  delete process.env.SMTP_PORT; delete process.env.SMTP_SECURE; assert.equal(correo.opcionesSmtp().port, 587);
});

test("smtp: mandarCorreo y mandarCodigo envían por el transporte con SMTP_FROM", async () => {
  const t = transporteFalso(); correo.usarTransporteDePrueba(t);
  process.env.SMTP_HOST = "mail.local"; process.env.SMTP_FROM = "Puente <puente@escuela.local>";
  const r = await correo.mandarCorreo({ to: ["a@x.org", "a@x.org", "b@x.org"], subject: "Hola\nmundo", text: "t", html: "<p>h</p>" });
  assert.deepEqual(r, { modo: "smtp", enviado: true });
  assert.equal(t.enviados[0].from, "Puente <puente@escuela.local>");
  assert.deepEqual(t.enviados[0].to, ["a@x.org", "b@x.org"]);
  assert.equal(t.enviados[0].subject, "Hola mundo");
  const c = await correo.mandarCodigo("a@x.org", "123456");
  assert.deepEqual(c, { modo: "smtp" }, "the code is never handed back to the caller");
  assert.match(t.enviados[1].text, /123456/);
});

test("smtp: si el transporte falla, mandarCorreo lanza y mandarCodigo da un error público 502", async () => {
  correo.usarTransporteDePrueba(transporteFalso({ falla: true }));
  process.env.SMTP_HOST = "mail.local";
  const { lineas } = await capturarLog(async () => {
    await assert.rejects(correo.mandarCorreo({ to: "a@x.org", subject: "s", text: "t" }), /SMTP/);
    await assert.rejects(correo.mandarCodigo("a@x.org", "123456"), e => e.status === 502);
  });
  assert.ok(lineas.every(l => !l.includes("123456")));
});

test("SMTP_DISABLED: el código va solo al log del servidor con marca clara y no vuelve al que llama", async () => {
  process.env.SMTP_DISABLED = "1";
  for (const app of [undefined, "production"]) {
    if (app) process.env.APP_ENV = app;
    const { r, lineas } = await capturarLog(() => correo.mandarCodigo("ana@escuela.local", "654321"));
    assert.equal(r.codigo_dev, undefined);
    assert.ok(lineas.some(l => l.includes("[puente][codigo-login] email=ana@escuela.local codigo=654321")), lineas.join("|"));
  }
  const { r } = await capturarLog(() => correo.mandarCorreo({ to: "a@x.org", subject: "Aviso", text: "cuerpo" }));
  assert.deepEqual(r, { modo: "sin_correo", enviado: false });
});

test("Resend sigue igual cuando no hay variables SMTP", async () => {
  process.env.RESEND_API_KEY = "re_x";
  const orig = global.fetch; const llamadas = [];
  global.fetch = async (u, o) => { llamadas.push([u, o]); return { ok: true, text: async () => "" }; };
  try {
    const r = await correo.mandarCorreo({ to: "a@x.org", subject: "s", text: "t" });
    assert.deepEqual(r, { modo: "resend", enviado: true });
    assert.equal(llamadas[0][0], "https://api.resend.com/emails");
  } finally { global.fetch = orig; }
});

test("end-to-end en producción con SMTP_DISABLED: ninguna respuesta HTTP lleva el código (solo el log)", async () => {
  const pg = await baseNueva();
  process.env.SMTP_DISABLED = "1"; process.env.APP_ENV = "production"; process.env.SESSION_SECRET = "secreto-de-prueba-largo";
  try {
    await altaEscuela({ escuela: "Escuela 1", nombre: "Ana", email: "ana@escuela.local" });
    await pg.query("DELETE FROM limites");
    const { r, lineas } = await capturarLog(() => cliente().llamar(auth, { method: "POST", body: { accion: "pedir_codigo", tipo: "docente", email: "ana@escuela.local" } }));
    assert.equal(r.status, 200);
    const cuerpo = JSON.stringify(r.body) + JSON.stringify(r.headers);
    const marca = lineas.find(l => l.includes("[puente][codigo-login] email=ana@escuela.local codigo="));
    assert.ok(marca, "the code is in the server log");
    const codigo = marca.match(/codigo=(\d{6})/)[1];
    assert.ok(!cuerpo.includes(codigo));
    assert.equal(r.body.codigo_dev, undefined);
    const v = await cliente().llamar(auth, { method: "POST", body: { accion: "verificar_codigo", tipo: "docente", email: "ana@escuela.local", codigo } });
    assert.equal(v.status, 200, "the logged code really logs in");
  } finally { delete process.env.SESSION_SECRET; }
});

// Ingreso a Puente.
//  GET                      → estado: modo (demo|db), sesión actual, si falta crear la primera docente.
//  POST accion=setup        → crea la primera docente (admin) y la escuela. Protegido con DOCENTE_PIN (+ ADMIN_EMAIL si está).
//  POST accion=login_docente      { email, password }
//  POST accion=pedir_codigo       { email }            (familias: código de 6 dígitos por email)
//  POST accion=verificar_codigo   { email, codigo }
//  POST accion=cambiar_password   { actual, nueva }    (docente con sesión)
//  POST accion=logout
const crypto = require("crypto");
const { dbActiva, q, uno } = require("./_lib/db");
const S = require("./_lib/seguridad");
const { pinOk } = require("./_lib/pin");
const { mandarCodigo } = require("./_lib/correo");
const { cuerpo, exigirJson, manejarError, errorPublico } = require("./_lib/http");

const MAX_LOGIN_EMAIL = 5, MAX_LOGIN_IP = 20, VENTANA = 15;
const MAX_CODIGOS_EMAIL = 3, MAX_CODIGOS_IP = 10, MAX_VERIF_IP = 30, MAX_INTENTOS_CODIGO = 5, VIGENCIA_CODIGO_MIN = 10;
const hashCodigo = (email, codigo) => S.hmac(`codigo:${email}:${codigo}`);
const textoCorto = (s, max) => String(s || "").trim().slice(0, max);

async function hayDocentes() { return !!(await uno("SELECT 1 AS x FROM docentes LIMIT 1")); }

function datosSesion(s) {
  if (!s) return null;
  return s.tipo === "docente"
    ? { tipo: "docente", nombre: s.usuario.nombre, email: s.usuario.email, es_admin: s.usuario.es_admin }
    : { tipo: "familia", email: s.usuario.email };
}

async function setup(req, res, b) {
  if (await hayDocentes()) throw errorPublico("Puente ya tiene docentes. Entrá con tu email y contraseña.", 409);
  if (S.esProduccion() && !process.env.DOCENTE_PIN) throw errorPublico("Para crear la primera cuenta en producción hay que definir DOCENTE_PIN en Vercel.", 403);
  if (await S.superaLimite("setup:" + S.ipDe(req), 10, VENTANA)) throw errorPublico("Demasiados intentos. Esperá 15 minutos.", 429);
  if (!pinOk({ headers: { "x-docente-pin": req.headers["x-docente-pin"] || b.pin || "" } })) {
    await S.registrarIntento("setup:" + S.ipDe(req));
    throw errorPublico("PIN de docente incorrecto", 401);
  }
  const email = S.normEmail(b.email), admin = S.normEmail(process.env.ADMIN_EMAIL);
  if (!S.emailValido(email)) throw errorPublico("Revisá el email");
  if (admin && email !== admin) throw errorPublico("La primera cuenta tiene que ser la de ADMIN_EMAIL.", 403);
  if (!S.passwordValida(b.password)) throw errorPublico("La contraseña tiene que tener al menos 10 caracteres");
  const nombre = textoCorto(b.nombre, 80), escuela = textoCorto(b.escuela, 120) || "Mi escuela";
  if (!nombre) throw errorPublico("Falta tu nombre");
  const e = await uno("INSERT INTO escuelas (nombre) VALUES ($1) RETURNING id", [escuela]);
  const d = await uno("INSERT INTO docentes (escuela_id, email, nombre, pass_hash, es_admin) VALUES ($1, $2, $3, $4, true) RETURNING id",
    [e.id, email, nombre, await S.hashPassword(b.password)]);
  await S.crearSesion(res, "docente", d.id);
  res.status(200).json({ ok: true, sesion: { tipo: "docente", nombre, email, es_admin: true } });
}

async function loginDocente(req, res, b) {
  const email = S.normEmail(b.email), ip = S.ipDe(req);
  const kE = "login:email:" + email, kI = "login:ip:" + ip;
  if (await S.superaLimite(kE, MAX_LOGIN_EMAIL, VENTANA) || await S.superaLimite(kI, MAX_LOGIN_IP, VENTANA))
    throw errorPublico("Demasiados intentos. Esperá 15 minutos y probá de nuevo.", 429);
  const d = S.emailValido(email) ? await uno("SELECT id, nombre, email, es_admin, pass_hash FROM docentes WHERE email = $1 AND activo", [email]) : null;
  const ok = await S.verificarPassword(String(b.password || ""), d?.pass_hash); // corre scrypt aunque no exista (mismo tiempo)
  if (!d || !ok) {
    await S.registrarIntento(kE); await S.registrarIntento(kI);
    throw errorPublico("Email o contraseña incorrectos", 401);
  }
  await S.limpiarIntentos(kE);
  await S.crearSesion(res, "docente", d.id);
  res.status(200).json({ ok: true, sesion: { tipo: "docente", nombre: d.nombre, email: d.email, es_admin: d.es_admin } });
}

async function pedirCodigo(req, res, b) {
  const email = S.normEmail(b.email), ip = S.ipDe(req);
  if (!S.emailValido(email)) throw errorPublico("Revisá el email");
  const kE = "codigo:email:" + email, kI = "codigo:ip:" + ip;
  if (await S.superaLimite(kE, MAX_CODIGOS_EMAIL, VENTANA) || await S.superaLimite(kI, MAX_CODIGOS_IP, VENTANA))
    throw errorPublico("Ya pediste varios códigos. Esperá 15 minutos.", 429);
  await S.registrarIntento(kE); await S.registrarIntento(kI);
  const generico = { ok: true, mensaje: "Si tu email está registrado en la escuela, te mandamos un código. Revisá tu correo (y el spam)." };
  const fam = await uno("SELECT f.id FROM familias f JOIN familia_alumno fa ON fa.familia_id = f.id WHERE f.email = $1 LIMIT 1", [email]);
  if (!fam) return res.status(200).json(generico); // no revelamos si el email existe
  const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  await q("UPDATE codigos SET usado = true WHERE email = $1 AND NOT usado", [email]);
  await q("INSERT INTO codigos (email, codigo_hash, expira) VALUES ($1, $2, now() + ($3 || ' minutes')::interval)", [email, hashCodigo(email, codigo), String(VIGENCIA_CODIGO_MIN)]);
  const envio = await mandarCodigo(email, codigo);
  res.status(200).json({ ...generico, ...(envio.codigo_dev ? { codigo_dev: envio.codigo_dev } : {}) });
}

async function verificarCodigo(req, res, b) {
  const email = S.normEmail(b.email), codigo = String(b.codigo || "").replace(/\D/g, ""), kI = "verif:ip:" + S.ipDe(req);
  if (await S.superaLimite(kI, MAX_VERIF_IP, VENTANA)) throw errorPublico("Demasiados intentos. Esperá 15 minutos.", 429);
  await S.registrarIntento(kI);
  const malo = errorPublico("El código no es correcto o ya venció. Pedí uno nuevo si hace falta.", 401);
  if (!S.emailValido(email) || codigo.length !== 6) throw malo;
  // Suma el intento antes de comparar: así nunca pasa de 5 aunque lleguen pedidos en paralelo.
  const c = await uno(`UPDATE codigos SET intentos = intentos + 1
    WHERE id = (SELECT id FROM codigos WHERE email = $1 AND NOT usado AND expira > now() ORDER BY creado DESC LIMIT 1)
      AND intentos < $2 RETURNING id, codigo_hash`, [email, MAX_INTENTOS_CODIGO]);
  if (!c || !S.igualSeguro(c.codigo_hash, hashCodigo(email, codigo))) throw malo;
  await q("UPDATE codigos SET usado = true WHERE id = $1", [c.id]);
  const fam = await uno("SELECT id FROM familias WHERE email = $1", [email]);
  if (!fam) throw malo;
  await S.crearSesion(res, "familia", fam.id);
  res.status(200).json({ ok: true, sesion: { tipo: "familia", email } });
}

async function cambiarPassword(req, res, b) {
  const s = await S.leerSesion(req);
  if (s?.tipo !== "docente") throw errorPublico("Iniciá sesión como docente", 401);
  const d = await uno("SELECT pass_hash FROM docentes WHERE id = $1", [s.usuario.id]);
  if (!(await S.verificarPassword(String(b.actual || ""), d.pass_hash))) throw errorPublico("La contraseña actual no es correcta", 401);
  if (!S.passwordValida(b.nueva)) throw errorPublico("La contraseña nueva tiene que tener al menos 10 caracteres");
  await q("UPDATE docentes SET pass_hash = $1 WHERE id = $2", [await S.hashPassword(b.nueva), s.usuario.id]);
  res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) {
      if (req.method === "GET") return res.status(200).json({ modo: "demo", sesion: null });
      return res.status(400).json({ error: "Puente está en modo demo (sin base de datos): las docentes entran con PIN y las familias con su link." });
    }
    if (req.method === "GET") {
      return res.status(200).json({ modo: "db", sesion: datosSesion(await S.leerSesion(req)), necesita_setup: !(await hayDocentes()) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    if (!exigirJson(req, res)) return;
    const b = cuerpo(req);
    switch (b.accion) {
      case "setup": return await setup(req, res, b);
      case "login_docente": return await loginDocente(req, res, b);
      case "pedir_codigo": return await pedirCodigo(req, res, b);
      case "verificar_codigo": return await verificarCodigo(req, res, b);
      case "cambiar_password": return await cambiarPassword(req, res, b);
      case "logout": await S.cerrarSesion(req, res); return res.status(200).json({ ok: true });
      default: return res.status(400).json({ error: "Acción desconocida" });
    }
  } catch (e) { manejarError(res, e); }
};

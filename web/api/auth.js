// Ingreso a Puente. Docentes y familias entran con un código de 6 números por email (sin contraseñas).
// La lógica de "qué cuenta corresponde a un email verificado" está en _lib/identidad.js, lista para sumar SSO.
//  GET                            → estado: modo (demo|db), sesión actual, si falta crear la primera docente, métodos de ingreso.
//  POST accion=setup              { escuela, nombre, email, pin } → crea la primera docente (admin) y la escuela.
//                                  Protegido con DOCENTE_PIN (+ ADMIN_EMAIL si está). No abre sesión: después entra con código.
//  POST accion=pedir_codigo       { email, tipo: "docente"|"familia" (por defecto familia) }
//  POST accion=verificar_codigo   { email, codigo, tipo }
//  POST accion=logout
//  (login_docente y cambiar_password con contraseña quedaron fuera de uso: responden 410.)
const { dbActiva, uno } = require("./_lib/db");
const S = require("./_lib/seguridad");
const { pinOk } = require("./_lib/pin");
const codigos = require("./_lib/codigos");
const { datosSesion, metodos } = require("./_lib/identidad");
const { cuerpo, exigirJson, manejarError, errorPublico } = require("./_lib/http");

const VENTANA = 15;
const textoCorto = (s, max) => String(s || "").trim().slice(0, max);

async function hayDocentes() { return !!(await uno("SELECT 1 AS x FROM docentes LIMIT 1")); }

async function setup(req, res, b) {
  if (await hayDocentes()) throw errorPublico("Puente ya tiene docentes. Entrá con tu email y el código que te mandamos.", 409);
  if (S.esProduccion() && !process.env.DOCENTE_PIN) throw errorPublico("Para crear la primera cuenta en producción hay que definir DOCENTE_PIN en Vercel.", 403);
  if (await S.superaLimite("setup:" + S.ipDe(req), 10, VENTANA)) throw errorPublico("Demasiados intentos. Esperá 15 minutos.", 429);
  if (!pinOk({ headers: { "x-docente-pin": req.headers["x-docente-pin"] || b.pin || "" } })) {
    await S.registrarIntento("setup:" + S.ipDe(req));
    throw errorPublico("PIN de docente incorrecto", 401);
  }
  const email = S.normEmail(b.email), admin = S.normEmail(process.env.ADMIN_EMAIL);
  if (!S.emailValido(email)) throw errorPublico("Revisá el email");
  if (admin && email !== admin) throw errorPublico("La primera cuenta tiene que ser la de ADMIN_EMAIL.", 403);
  const nombre = textoCorto(b.nombre, 80), escuela = textoCorto(b.escuela, 120) || "Mi escuela";
  if (!nombre) throw errorPublico("Falta tu nombre");
  const e = await uno("INSERT INTO escuelas (nombre) VALUES ($1) RETURNING id", [escuela]);
  await uno("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, $2, $3, true) RETURNING id", [e.id, email, nombre]);
  // Sin sesión: el PIN no prueba que el email sea suyo. Entra con el código que llega a ese email.
  res.status(200).json({ ok: true, email, mensaje: "Cuenta creada. Ahora entrá con tu email: te mandamos un código." });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) {
      if (req.method === "GET") return res.status(200).json({ modo: "demo", sesion: null });
      return res.status(400).json({ error: "Puente está en modo demo (sin base de datos): las docentes entran con PIN y las familias con su link." });
    }
    if (req.method === "GET") {
      const s = await S.leerSesion(req);
      return res.status(200).json({ modo: "db", sesion: s ? datosSesion(s.tipo, s.usuario) : null, necesita_setup: !(await hayDocentes()), metodos: metodos() });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    if (!exigirJson(req, res)) return;
    const b = cuerpo(req);
    switch (b.accion) {
      case "setup": return await setup(req, res, b);
      case "pedir_codigo": return res.status(200).json(await codigos.pedir(req, b.tipo, b.email));
      case "verificar_codigo": return res.status(200).json({ ok: true, sesion: await codigos.verificar(req, res, b.tipo, b.email, b.codigo) });
      case "login_docente":
      case "cambiar_password":
        return res.status(410).json({ error: "Puente ya no usa contraseñas: entrá con tu email y te mandamos un código." });
      case "logout": await S.cerrarSesion(req, res); return res.status(200).json({ ok: true });
      default: return res.status(400).json({ error: "Acción desconocida" });
    }
  } catch (e) { manejarError(res, e); }
};

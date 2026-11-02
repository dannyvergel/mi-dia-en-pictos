// Ingreso a Puente. Docentes y familias entran con un código de 6 números por email (sin contraseñas).
// La lógica de "qué cuenta corresponde a un email verificado" está en _lib/identidad.js, lista para sumar SSO.
//  GET                            → estado: modo (demo|db), sesión actual, si falta crear la primera docente, métodos de ingreso
//                                  y, sin sesión, el token de formulario para buscar escuelas (/api/escuelas).
//  POST accion=setup              { nombre, email, pin } → crea la primera cuenta: la de la plataforma (ADMIN_EMAIL), SIN escuela.
//                                  Exige ADMIN_EMAIL definida y ese mismo email, y DOCENTE_PIN. No abre sesión: después entra con código.
//                                  Las escuelas se dan de alta después desde el panel de la plataforma (admin.html), desde el padrón,
//                                  y cada directivo entra con un link de invitación (ver _lib/enlaces.js). escuela/cue se ignoran.
//  POST accion=pedir_codigo       { email, tipo: "docente"|"familia" (por defecto familia) }
//  POST accion=verificar_codigo   { email, codigo, tipo }
//  POST accion=logout
//  Piloto cerrado (links de invitación, ver _lib/enlaces.js). El token viaja en el cuerpo, nunca en la URL:
//  POST accion=invitacion_info          { token } → a qué escuela (y alumno) invita, si sigue vigente y si el piloto está completo
//  POST accion=invitacion_pedir_codigo  { token, email } → manda el código al email (aunque todavía no tenga cuenta)
//  POST accion=invitacion_verificar     { token, email, codigo, nombre } → usa el link, crea la cuenta aprobada y abre la sesión
//  GET también devuelve solo_invitacion (PILOTO_SOLO_INVITACION): con true, login.html oculta "Solicitar acceso".
//  GET ?accion=google              → "Entrar con Google" (solo docentes/directivos/plataforma; ver _lib/google.js). Inicio y callback
//                                  usan la MISMA URL: https://puentepictos.app/api/auth?accion=google (Google vuelve con ?code&state).
//                                  Solo con GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET; sin ellas redirige a login.html.
//  (login_docente y cambiar_password con contraseña quedaron fuera de uso: responden 410.)
const { dbActiva, uno } = require("./_lib/db");
const S = require("./_lib/seguridad");
const { pinOk } = require("./_lib/pin");
const codigos = require("./_lib/codigos");
const { datosSesion, metodos } = require("./_lib/identidad");
const enlaces = require("./_lib/enlaces");
const piloto = require("./_lib/piloto");
const google = require("./_lib/google");
const { cuerpo, consulta, exigirJson, manejarError, errorPublico } = require("./_lib/http");

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
  const email = S.normEmail(b.email), admin = S.emailPlataforma();
  if (!admin) throw errorPublico("Para crear la primera cuenta hay que definir ADMIN_EMAIL (la cuenta de la plataforma) en Vercel.", 403);
  if (!S.emailValido(email)) throw errorPublico("Revisá el email");
  if (email !== admin) throw errorPublico("La primera cuenta tiene que ser la de ADMIN_EMAIL.", 403);
  const nombre = textoCorto(b.nombre, 80);
  if (!nombre) throw errorPublico("Falta tu nombre");
  // La primera cuenta es la de la plataforma y no tiene escuela: las escuelas se crean desde el panel admin (padrón).
  await uno("INSERT INTO docentes (escuela_id, email, nombre, es_admin, es_plataforma) VALUES (NULL, $1, $2, false, true) RETURNING id", [email, nombre]);
  // Sin sesión: el PIN no prueba que el email sea suyo. Entra con el código que llega a ese email.
  res.status(200).json({ ok: true, email, mensaje: "Cuenta creada. Ahora entrá con tu email: te mandamos un código." });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET" && consulta(req, "accion") === "google") {
      if (!dbActiva()) { res.setHeader("Location", "/login.html"); res.status(302); return res.end(); }
      return await google.manejar(req, res);
    }
    if (!dbActiva()) {
      if (req.method === "GET") return res.status(200).json({ modo: "demo", sesion: null, ...(require("./_lib/pin").demoAbierto() ? { abierto: true } : {}) });
      return res.status(400).json({ error: "Puente está en modo demo (sin base de datos): las docentes entran con PIN y las familias con su link." });
    }
    if (req.method === "GET") {
      const s = await S.leerSesion(req);
      return res.status(200).json({ modo: "db", sesion: s ? datosSesion(s.tipo, s.usuario) : null, necesita_setup: !(await hayDocentes()), metodos: metodos(),
        solo_invitacion: piloto.soloInvitacion(),
        ...(s ? {} : { formulario: S.tokenFormulario() }) });
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
      case "invitacion_info": return res.status(200).json(await enlaces.info(req, b.token));
      case "invitacion_pedir_codigo": return res.status(200).json(await enlaces.pedirCodigo(req, b.token, b.email));
      case "invitacion_verificar": return res.status(200).json({ ok: true, sesion: await enlaces.verificar(req, res, b) });
      case "logout": await S.cerrarSesion(req, res); return res.status(200).json({ ok: true });
      default: return res.status(400).json({ error: "Acción desconocida" });
    }
  } catch (e) { manejarError(res, e); }
};

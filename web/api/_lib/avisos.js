// Emails de cuentas: solicitud nueva (a las admins de la escuela o a la plataforma), acceso aprobado, solicitud rechazada,
// invitación a una familia.
// Todo dato que escribió una persona pasa por escHtml (HTML) o linea (asunto).
const { q } = require("./db");
const { normEmail } = require("./seguridad");
const { mandarCorreo, escHtml, linea, envolver, PIE } = require("./correo");
const { urlPublica } = require("./http");

// Nunca rompe el pedido por un email: devuelve true/false y deja el error en los logs.
async function intentar(datos) {
  try { return (await mandarCorreo(datos)).enviado; }
  catch (e) { console.error("[puente] no se pudo mandar el email:", e.message); return false; }
}

// Plataforma: solo ADMIN_EMAIL (sin ADMIN_EMAIL, por compatibilidad, las cuentas marcadas es_plataforma). Escuela: sus docentes admin activas.
async function destinatariosPlataforma() {
  const admin = normEmail(process.env.ADMIN_EMAIL);
  if (admin) return [admin];
  return [...new Set((await q("SELECT email FROM docentes WHERE es_plataforma AND activo")).map(a => a.email))];
}
async function destinatariosEscuela(escuelaId) {
  return (await q("SELECT email FROM docentes WHERE escuela_id = $1 AND es_admin AND activo", [escuelaId])).map(a => a.email);
}
async function destinatariosAdmin(s = {}) {
  return s.destino === "escuela" && s.escuela_id ? destinatariosEscuela(s.escuela_id) : destinatariosPlataforma();
}

async function nuevaSolicitud(req, s) {
  const link = urlPublica(req) + "/docente.html#solicitudes";
  const filas = [["Nombre", s.nombre], ["Email", s.email], ["Escuela", s.escuela], ["Rol / grado", s.rol], ["Dice que es", s.es_director ? "directora / director" : ""],
    ["Mensaje", s.mensaje]].filter(([, v]) => v);
  return intentar({
    to: await destinatariosAdmin(s),
    subject: `Nueva solicitud de acceso a Puente: ${linea(s.nombre, 60)}`,
    text: `Hola!\n\nUna docente pidió acceso a Puente:\n\n${filas.map(([k, v]) => `${k}: ${linea(v, 1000)}`).join("\n")}\n\nPara aprobarla o rechazarla: ${link}\n\n${PIE}`,
    html: envolver(`<p>Hola!</p><p>Una docente pidió acceso a <b>Puente</b>:</p>
      <table style="border-collapse:collapse">${filas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6f76;vertical-align:top">${k}</td><td style="padding:4px 0;white-space:pre-wrap">${escHtml(v)}</td></tr>`).join("")}</table>
      <p><a href="${escHtml(link)}" style="display:inline-block;background:#2f4a3e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Ver solicitudes</a></p>`)
  });
}

async function accesoAprobado(req, { nombre, email, escuela }) {
  const link = urlPublica(req) + "/login.html";
  return intentar({
    to: email,
    subject: "Ya tenés acceso a Puente",
    text: `Hola, ${linea(nombre)}!\n\nYa tenés acceso a Puente${escuela ? ` (${linea(escuela, 120)})` : ""}.\nEntrá con tu mail en ${link} : te mandamos un código de 6 números cada vez, sin contraseña.\n\n${PIE}`,
    html: envolver(`<p>Hola, ${escHtml(nombre)}!</p><p>Ya tenés acceso a <b>Puente</b>${escuela ? ` (${escHtml(escuela)})` : ""}.</p>
      <p>Entrá con tu mail: te mandamos un código de 6 números cada vez, sin contraseña.</p>
      <p><a href="${escHtml(link)}" style="display:inline-block;background:#2f4a3e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Entrar a Puente</a></p>`)
  });
}

async function solicitudRechazada(req, { nombre, email }) {
  return intentar({
    to: email,
    subject: "Tu solicitud de acceso a Puente",
    text: `Hola, ${linea(nombre)}!\n\nGracias por tu interés en Puente. Por ahora no pudimos habilitar tu acceso.\nSi creés que es un error, hablalo con la docente administradora de tu escuela.\n\n${PIE}`,
    html: envolver(`<p>Hola, ${escHtml(nombre)}!</p><p>Gracias por tu interés en <b>Puente</b>. Por ahora no pudimos habilitar tu acceso.</p><p>Si creés que es un error, hablalo con la docente administradora de tu escuela.</p>`)
  });
}

// "<docente> te sumó a Puente para seguir el día de <alumno>". Link al login (pestaña familia, email ya escrito).
// Devuelve true/false (nunca lanza): una invitación que falla no frena el guardado de la ficha.
async function invitacionFamilia(req, { email, alumno, docente, contacto }) {
  const link = `${urlPublica(req)}/login.html?familia&email=${encodeURIComponent(email)}`;
  const quien = linea(docente, 80) || "La escuela";
  return intentar({
    to: email,
    subject: `${quien} te sumó a Puente para seguir el día de ${linea(alumno, 40)}`,
    text: `Hola${contacto ? ", " + linea(contacto, 60) : ""}!\n\n${quien} te sumó a Puente para seguir el día de ${linea(alumno, 40)} en la escuela: `
      + `cómo le fue, sus actividades en pictogramas, logros y la agenda del día siguiente.\n\n`
      + `Para entrar: ${link}\nEscribí este mismo email (${email}) y te mandamos un código de 6 números. No hace falta contraseña.\n\n`
      + `La primera vez vas a ver la ficha de ${linea(alumno, 40)} y te vamos a pedir tu consentimiento para que la escuela registre y comparta esta información con vos. `
      + `Lo podés dar o retirar cuando quieras.\n\nSi no conocés a la escuela o no esperabas este mail, ignoralo.\n\n${PIE}`,
    html: envolver(`<p>Hola${contacto ? ", " + escHtml(contacto) : ""}!</p>
      <p><b>${escHtml(quien)}</b> te sumó a <b>Puente</b> para seguir el día de <b>${escHtml(alumno)}</b> en la escuela: cómo le fue, sus actividades en pictogramas, logros y la agenda del día siguiente.</p>
      <p><a href="${escHtml(link)}" style="display:inline-block;background:#2f4a3e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Entrar a Puente</a></p>
      <p>Escribí este mismo email (${escHtml(email)}) y te mandamos un <b>código de 6 números</b>. No hace falta contraseña.</p>
      <p>La primera vez vas a ver la ficha de ${escHtml(alumno)} y te vamos a pedir tu <b>consentimiento</b> para que la escuela registre y comparta esta información con vos. Lo podés dar o retirar cuando quieras.</p>
      <p style="color:#6b6f76">Si no conocés a la escuela o no esperabas este mail, ignoralo.</p>`)
  });
}

// Alerta a la plataforma: muchos códigos incorrectos para una misma cuenta (posible intento de entrar a la fuerza).
// No lleva el email completo (va enmascarado) ni datos del alumno.
async function alertaFallos(req, { cuenta, tipo, intentos, minutos, ip }) {
  const link = urlPublica(req) + "/docente.html#registro";
  return intentar({
    to: await destinatariosPlataforma(),
    subject: `Puente: ${intentos} códigos incorrectos para una cuenta`,
    text: `Hola!\n\nHubo ${intentos} intentos de código incorrectos en los últimos ${minutos} minutos para la cuenta ${cuenta} (${tipo}), desde la red ${ip}.\n`
      + `Cada código vence a los 10 minutos y admite 5 intentos, así que no debería poder adivinarse, pero conviene mirarlo.\n\nRegistro de accesos: ${link}\n\n${PIE}`,
    html: envolver(`<p>Hola!</p><p>Hubo <b>${escHtml(intentos)}</b> intentos de código incorrectos en los últimos ${escHtml(minutos)} minutos para la cuenta <b>${escHtml(cuenta)}</b> (${escHtml(tipo)}), desde la red ${escHtml(ip)}.</p>
      <p>Cada código vence a los 10 minutos y admite 5 intentos, así que no debería poder adivinarse, pero conviene mirarlo.</p>
      <p><a href="${escHtml(link)}">Ver el registro de accesos</a></p>`)
  });
}

// Comentario nuevo (botón "Enviar comentario"). El texto va escapado; de quién, solo tipo y número de cuenta.
async function nuevoFeedback(req, { autor_tipo, autor_id, pagina, texto }) {
  return intentar({
    to: await destinatariosPlataforma(),
    subject: `Puente: comentario nuevo de ${autor_tipo === "familia" ? "una familia" : "una docente"}`,
    text: `Hola!\n\nLlegó un comentario (${autor_tipo} #${autor_id}, página ${linea(pagina, 60) || "?"}):\n\n${linea(texto, 2000)}\n\n${PIE}`,
    html: envolver(`<p>Hola!</p><p>Llegó un comentario (${escHtml(autor_tipo)} #${escHtml(autor_id)}, página ${escHtml(pagina || "?")}):</p>
      <blockquote style="white-space:pre-wrap;border-left:3px solid #ccc;margin:0;padding-left:12px">${escHtml(texto)}</blockquote>`)
  });
}

module.exports = { alertaFallos, nuevoFeedback, nuevaSolicitud, accesoAprobado, solicitudRechazada, invitacionFamilia, destinatariosAdmin, destinatariosPlataforma, destinatariosEscuela };

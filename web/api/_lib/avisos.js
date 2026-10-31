// Emails de cuentas de docentes: solicitud nueva (a las admins), acceso aprobado, solicitud rechazada.
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

async function destinatariosAdmin() {
  const admins = await q("SELECT email FROM docentes WHERE es_admin AND activo");
  return [...new Set([normEmail(process.env.ADMIN_EMAIL), ...admins.map(a => a.email)].filter(Boolean))];
}

async function nuevaSolicitud(req, s) {
  const link = urlPublica(req) + "/docente.html#solicitudes";
  const filas = [["Nombre", s.nombre], ["Email", s.email], ["Escuela", s.escuela], ["Rol / grado", s.rol], ["Mensaje", s.mensaje]].filter(([, v]) => v);
  return intentar({
    to: await destinatariosAdmin(),
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

module.exports = { nuevaSolicitud, accesoAprobado, solicitudRechazada, destinatariosAdmin };

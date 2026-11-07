// Emails con Resend (https://resend.com): códigos de ingreso y avisos de cuentas.
// Sin RESEND_API_KEY: en local/desarrollo el código vuelve en la respuesta y se loguea;
// en preview solo se loguea (los logs de Vercel los ve el dueño del proyecto);
// en producción es un error claro (para códigos) o un aviso en los logs (para avisos).
//
// Autoalojado (ver README): SMTP_URL o SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE) mandan por nodemailer y
// ganan sobre Resend. SMTP_DISABLED=1 (instalaciones en LAN sin correo) no manda nada: el código de ingreso se escribe SOLO en el log
// del servidor (`[puente][codigo-login] email=… codigo=…`) y nunca vuelve en una respuesta HTTP, sea cual sea APP_ENV.
const { errorPublico } = require("./http");
const { appEnv } = require("./entorno");

const activo = v => /^(1|true|yes|on)$/i.test(String(v ?? "").trim());
const hayHost = () => !!(process.env.SMTP_URL || process.env.SMTP_HOST);

// "sin_correo" (SMTP_DISABLED) | "smtp" | "resend" | "falta" | "log" | "dev"
function modoCorreo() {
  if (activo(process.env.SMTP_DISABLED)) return "sin_correo";
  if (hayHost()) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  const env = appEnv();
  if (env === "production") return "falta";
  return env === "development" ? "dev" : "log"; // solo "development" devuelve el código en la respuesta
}

// Todo lo que viene de un usuario pasa por acá antes de ir a un HTML.
const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Asuntos: una sola línea, cortita.
const linea = (s, max = 80) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
const PIE = "Puente · de la escuela a casa, en pictogramas";
const envolver = cuerpoHtml => `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#23364f;line-height:1.45">${cuerpoHtml}<p style="color:#6b6f76">${PIE}</p></div>`;

// Opciones de nodemailer: la URL tal cual, o host/puerto/usuario. Con puerto 465 el TLS es implícito (secure) salvo que SMTP_SECURE diga otra cosa.
function opcionesSmtp() {
  if (process.env.SMTP_URL) return process.env.SMTP_URL;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === undefined || process.env.SMTP_SECURE === "" ? port === 465 : activo(process.env.SMTP_SECURE);
  const o = { host: process.env.SMTP_HOST, port, secure };
  if (process.env.SMTP_USER) o.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" };
  return o;
}
let transporte = null, transporteDePrueba = null;
function transporteSmtp() {
  if (transporteDePrueba) return transporteDePrueba;
  if (!transporte) transporte = require("nodemailer").createTransport(opcionesSmtp());
  return transporte;
}
// Solo para tests: reemplaza el transporte SMTP (algo con sendMail).
function usarTransporteDePrueba(t) { transporteDePrueba = t || null; transporte = null; }

// Solo para tests: guarda los emails en memoria en vez de mandarlos.
let buzon = null;
function usarBuzonDePrueba(on) { buzon = on ? [] : null; return buzon; }

// Manda un email. Devuelve { modo, enviado }. Si Resend falla, lanza (el que llama decide si es grave).
async function mandarCorreo({ to, subject, text, html }) {
  const destinos = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!destinos.length) return { modo: modoCorreo(), enviado: false };
  if (buzon) { buzon.push({ to: destinos, subject: linea(subject, 150), text, html }); return { modo: "prueba", enviado: true }; }
  const modo = modoCorreo();
  if (modo === "smtp") {
    try {
      await transporteSmtp().sendMail({ from: process.env.SMTP_FROM || process.env.RESEND_FROM || "Puente <puente@localhost>", to: destinos, subject: linea(subject, 150), text, html });
    } catch (e) {
      console.error("SMTP", String(e?.message || e).slice(0, 300));
      throw Object.assign(new Error("SMTP falló"), { smtp: true });
    }
    return { modo, enviado: true };
  }
  if (modo !== "resend") {
    console.log(`[puente] email (${modo === "sin_correo" ? "SMTP_DISABLED" : "sin RESEND_API_KEY, modo " + modo}) para ${destinos.join(", ")}: ${subject}\n${text}`);
    return { modo, enviado: false };
  }
  const from = process.env.RESEND_FROM || "Puente <onboarding@resend.dev>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: destinos, subject: linea(subject, 150), text, html })
  });
  if (!r.ok) {
    console.error("Resend", r.status, (await r.text()).slice(0, 300));
    throw Object.assign(new Error("Resend respondió " + r.status), { resend: true });
  }
  return { modo, enviado: true };
}

async function mandarCodigo(email, codigo) {
  const modo = modoCorreo();
  if (modo === "falta") throw errorPublico("El envío de códigos no está configurado todavía (falta RESEND_API_KEY). Avisale a la escuela.", 503);
  if (modo === "sin_correo") {
    // Solo el log del servidor: quien administra la instalación lo lee ahí. Nunca en la respuesta.
    console.log(`[puente][codigo-login] email=${email} codigo=${codigo}`);
    return { modo };
  }
  if (modo !== "resend" && modo !== "smtp") {
    console.log(`[puente] código para ${email}: ${codigo} (sin RESEND_API_KEY, modo ${modo})`);
    return { modo, codigo_dev: modo === "dev" ? codigo : undefined };
  }
  try {
    await mandarCorreo({
      to: email,
      subject: `Tu código para entrar a Puente: ${codigo}`,
      text: `Hola!\n\nTu código para entrar a Puente es: ${codigo}\n\nVence en 10 minutos. Si no lo pediste, ignorá este mensaje.\n\n${PIE}`,
      html: envolver(`<p>Hola!</p><p>Tu código para entrar a <b>Puente</b> es:</p><p style="font-size:32px;letter-spacing:6px;font-weight:700">${escHtml(codigo)}</p><p>Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.</p>`)
    });
  } catch { throw errorPublico("No pudimos mandar el código. Probá en un rato.", 502); }
  return { modo };
}

module.exports = { mandarCodigo, mandarCorreo, usarBuzonDePrueba, usarTransporteDePrueba, opcionesSmtp, modoCorreo, escHtml, linea, envolver, PIE };

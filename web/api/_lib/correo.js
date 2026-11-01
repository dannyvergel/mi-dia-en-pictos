// Emails con Resend (https://resend.com): códigos de ingreso y avisos de cuentas.
// Sin RESEND_API_KEY: en local/desarrollo el código vuelve en la respuesta y se loguea;
// en preview solo se loguea (los logs de Vercel los ve el dueño del proyecto);
// en producción es un error claro (para códigos) o un aviso en los logs (para avisos).
const { errorPublico } = require("./http");

function modoCorreo() {
  if (process.env.RESEND_API_KEY) return "resend";
  const env = process.env.VERCEL_ENV;
  if (env === "production") return "falta";
  return env === "preview" ? "log" : "dev";
}

// Todo lo que viene de un usuario pasa por acá antes de ir a un HTML.
const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Asuntos: una sola línea, cortita.
const linea = (s, max = 80) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
const PIE = "Puente · de la escuela a casa, en pictogramas";
const envolver = cuerpoHtml => `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#23364f;line-height:1.45">${cuerpoHtml}<p style="color:#6b6f76">${PIE}</p></div>`;

// Solo para tests: guarda los emails en memoria en vez de mandarlos.
let buzon = null;
function usarBuzonDePrueba(on) { buzon = on ? [] : null; return buzon; }

// Manda un email. Devuelve { modo, enviado }. Si Resend falla, lanza (el que llama decide si es grave).
async function mandarCorreo({ to, subject, text, html }) {
  const destinos = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!destinos.length) return { modo: modoCorreo(), enviado: false };
  if (buzon) { buzon.push({ to: destinos, subject: linea(subject, 150), text, html }); return { modo: "prueba", enviado: true }; }
  const modo = modoCorreo();
  if (modo !== "resend") {
    console.log(`[puente] email (sin RESEND_API_KEY, modo ${modo}) para ${destinos.join(", ")}: ${subject}\n${text}`);
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
  if (modo !== "resend") {
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

module.exports = { mandarCodigo, mandarCorreo, usarBuzonDePrueba, modoCorreo, escHtml, linea, envolver, PIE };

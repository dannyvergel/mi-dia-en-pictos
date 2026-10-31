// Envío de códigos por email con Resend (https://resend.com).
// Sin RESEND_API_KEY: en local/desarrollo el código vuelve en la respuesta y se loguea;
// en preview solo se loguea (los logs de Vercel los ve el dueño del proyecto);
// en producción es un error claro.
const { errorPublico } = require("./http");

function modoCorreo() {
  if (process.env.RESEND_API_KEY) return "resend";
  const env = process.env.VERCEL_ENV;
  if (env === "production") return "falta";
  return env === "preview" ? "log" : "dev";
}

async function mandarCodigo(email, codigo) {
  const modo = modoCorreo();
  if (modo === "falta") throw errorPublico("El envío de códigos no está configurado todavía (falta RESEND_API_KEY). Avisale a la escuela.", 503);
  if (modo !== "resend") {
    console.log(`[puente] código para ${email}: ${codigo} (sin RESEND_API_KEY, modo ${modo})`);
    return { modo, codigo_dev: modo === "dev" ? codigo : undefined };
  }
  const from = process.env.RESEND_FROM || "Puente <onboarding@resend.dev>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [email],
      subject: `Tu código para entrar a Puente: ${codigo}`,
      text: `Hola!\n\nTu código para entrar a Puente es: ${codigo}\n\nVence en 10 minutos. Si no lo pediste, ignorá este mensaje.\n\nPuente · de la escuela a casa, en pictogramas`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#23364f"><p>Hola!</p><p>Tu código para entrar a <b>Puente</b> es:</p><p style="font-size:32px;letter-spacing:6px;font-weight:700">${codigo}</p><p>Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.</p><p style="color:#6b6f76">Puente · de la escuela a casa, en pictogramas</p></div>`
    })
  });
  if (!r.ok) { console.error("Resend", r.status, (await r.text()).slice(0, 300)); throw errorPublico("No pudimos mandar el código. Probá en un rato.", 502); }
  return { modo };
}

module.exports = { mandarCodigo, modoCorreo };

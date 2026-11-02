// PIN de docente: protege cargar días, correr el agente y publicar para las familias.
// En Vercel se define DOCENTE_PIN; sin variable, el PIN de demo es "2026".
const crypto = require("crypto");
const pinEsperado = () => String(process.env.DOCENTE_PIN || "2026");
// Demo abierto (DEMO_ABIERTO=1, solo sin base de datos): cualquiera prueba el Cuaderno sin PIN, todo queda en su
// navegador, no se publican links para familias (no se escribe en Blob) y la IA queda apagada aunque haya key.
const demoAbierto = () => process.env.DEMO_ABIERTO === "1" && !require("./db").dbActiva();
// IA disponible: hay key de OpenRouter y no es el demo abierto.
const iaActiva = () => !!process.env.OPENROUTER_API_KEY && !demoAbierto();
function pinOk(req) {
  if (demoAbierto()) return true;
  const p = String(req.headers["x-docente-pin"] || "");
  const a = crypto.createHash("sha256").update(p).digest(), b = crypto.createHash("sha256").update(pinEsperado()).digest();
  return crypto.timingSafeEqual(a, b);
}
function exigirPin(req, res) {
  if (pinOk(req)) return true;
  res.status(401).json({ error: "PIN de docente incorrecto" });
  return false;
}
module.exports = { pinOk, exigirPin, demoAbierto, iaActiva };

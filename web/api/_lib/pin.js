// PIN de docente: protege cargar días, correr el agente y publicar para las familias.
// En Vercel se define DOCENTE_PIN; sin variable, el PIN de demo es "2026".
const crypto = require("crypto");
const PIN = String(process.env.DOCENTE_PIN || "2026");
function pinOk(req) {
  const p = String(req.headers["x-docente-pin"] || "");
  const a = crypto.createHash("sha256").update(p).digest(), b = crypto.createHash("sha256").update(PIN).digest();
  return crypto.timingSafeEqual(a, b);
}
function exigirPin(req, res) {
  if (pinOk(req)) return true;
  res.status(401).json({ error: "PIN de docente incorrecto" });
  return false;
}
module.exports = { pinOk, exigirPin };

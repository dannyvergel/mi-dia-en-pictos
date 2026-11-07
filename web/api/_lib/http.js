// Ayudas comunes para las funciones de Vercel.
const { appEnv } = require("./entorno");
function cuerpo(req) {
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
  return req.body || {};
}
function consulta(req, k) { return req.query?.[k] ?? new URL(req.url || "/", "http://x").searchParams.get(k); }

// Las escrituras con sesión exigen JSON: un formulario de otro sitio no puede mandarlo sin CORS (defensa CSRF extra a SameSite=Lax).
function exigirJson(req, res) {
  if (req.method === "GET" || req.method === "OPTIONS") return true;
  if (String(req.headers["content-type"] || "").includes("application/json")) return true;
  res.status(415).json({ error: "Mandá los datos como JSON" });
  return false;
}

function manejarError(res, e) {
  if (e && e.publico) return res.status(e.status || 400).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: "Algo falló, probá de nuevo en un rato." });
}
// Fecha de hoy (AAAA-MM-DD) en la hora de Argentina: con UTC, después de las 21 h ya sería "mañana".
const ZONA = process.env.PUENTE_ZONA || "America/Argentina/Buenos_Aires";
function hoyLocal(d = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }

const errorPublico = (msg, status = 400) => Object.assign(new Error(msg), { publico: true, status });

// URL pública para links en emails. No se arma con el Host del pedido (se podría falsear),
// salvo en local. Orden: PUENTE_URL → dominio de producción → URL de la rama/deploy en Vercel.
function urlPublica(req) {
  if (process.env.PUENTE_URL) return process.env.PUENTE_URL.replace(/\/+$/, "");
  const host = appEnv() === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (host) return "https://" + host;
  return "http://" + (String(req?.headers?.host || "").replace(/[^a-z0-9.:-]/gi, "") || "localhost:3000");
}

module.exports = { cuerpo, consulta, exigirJson, manejarError, errorPublico, urlPublica, hoyLocal };

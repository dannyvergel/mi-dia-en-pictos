// Ayudas comunes para las funciones de Vercel.
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
const errorPublico = (msg, status = 400) => Object.assign(new Error(msg), { publico: true, status });

module.exports = { cuerpo, consulta, exigirJson, manejarError, errorPublico };

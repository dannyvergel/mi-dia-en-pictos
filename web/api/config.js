// Configuración pública (sin sesión, sin datos personales): links de donación y versión de los textos legales.
// Los botones de donación solo aparecen si su variable tiene valor (DONACIONES_AR_URL, DONACIONES_INTL_URL).
// google: true cuando existen GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (login.html muestra "Entrar con Google" a docentes).
// ?accion=salud: chequeo de salud para el monitoreo ({ ok, db, version }, 200 o 503, sin caché; ver _lib/salud.js).
// revisor: true cuando existen REVISOR_EMAIL y REVISOR_CLAVE_HASH (login.html muestra "Acceso para revisión"; ver _lib/revisor.js).
const legal = require("./_lib/legal");
const revisor = require("./_lib/revisor");
const salud = require("./_lib/salud");
const { consulta } = require("./_lib/http");

// Solo https y sin espacios: una variable mal cargada no se muestra.
function urlSegura(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

function armarConfig() {
  return {
    donaciones: { ar: urlSegura(process.env.DONACIONES_AR_URL), intl: urlSegura(process.env.DONACIONES_INTL_URL) },
    legal: { privacidad: legal.VERSION_PRIVACIDAD, terminos: legal.VERSION_TERMINOS },
    beta: true,
    // "Entrar con Google" para docentes: solo si están las dos variables (no expone sus valores).
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    // Cuenta de revisión de Google Play: solo dice si está prendida (no expone el email ni el hash).
    revisor: revisor.habilitado()
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  if (consulta(req, "accion") === "salud") {
    res.setHeader("Cache-Control", "no-store");
    try {
      const r = await salud.chequear();
      return res.status(r.status).json(r.cuerpo);
    } catch {
      return res.status(503).json({ ok: false, db: "error", version: salud.version() });
    }
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json(armarConfig());
};
module.exports.armarConfig = armarConfig;
module.exports.urlSegura = urlSegura;

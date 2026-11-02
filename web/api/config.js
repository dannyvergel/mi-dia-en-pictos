// Configuración pública (sin sesión, sin datos personales): links de donación y versión de los textos legales.
// Los botones de donación solo aparecen si su variable tiene valor (DONACIONES_AR_URL, DONACIONES_INTL_URL).
// google: true cuando existen GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (login.html muestra "Entrar con Google" a docentes).
const legal = require("./_lib/legal");

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
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json(armarConfig());
};
module.exports.armarConfig = armarConfig;
module.exports.urlSegura = urlSegura;

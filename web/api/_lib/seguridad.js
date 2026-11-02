// Sesiones con cookie firmada (HMAC) + tabla, límites de intentos.
const crypto = require("crypto");
const { q, uno } = require("./db");

const esProduccion = () => process.env.VERCEL_ENV === "production";
const COOKIE = "puente_sesion";
const DURACION = { docente: 7 * 864e5, familia: 30 * 864e5 };

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (esProduccion()) throw Object.assign(new Error("Falta SESSION_SECRET (mínimo 16 caracteres) en Vercel."), { status: 500, publico: true });
  return "puente-solo-para-desarrollo-no-usar-en-produccion";
}

// ---------- utilidades ----------
const sha256 = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const hmac = s => crypto.createHmac("sha256", secreto()).update(String(s)).digest("base64url");
function igualSeguro(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const normEmail = e => String(e || "").trim().toLowerCase();
const emailValido = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
function ipDe(req) { return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim(); }

// Plataforma (superadmin, panel admin.html): SOLO la cuenta de ADMIN_EMAIL. Sin ADMIN_EMAIL no hay plataforma.
// La columna docentes.es_plataforma (cuentas promovidas) quedó sin efecto: promover a otras cuentas está bloqueado por ahora.
const emailPlataforma = () => normEmail(process.env.ADMIN_EMAIL);
const esPlataforma = d => !!d && !!emailPlataforma() && normEmail(d.email) === emailPlataforma();
const NO_PLATAFORMA = "Solo la administración de la plataforma (la cuenta de ADMIN_EMAIL) puede hacer esto.";
// Corta (403) si quien pide no es la cuenta de ADMIN_EMAIL. Se usa en cada acción de plataforma, del lado del server.
function exigirPlataforma(yo) {
  if (!esPlataforma(yo)) throw Object.assign(new Error(NO_PLATAFORMA), { publico: true, status: 403 });
  return yo;
}

// ---------- cookies y sesiones ----------
function leerCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function cookie(valor, maxAgeSeg) {
  return `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeg}`;
}

async function crearSesion(res, tipo, usuarioId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DURACION[tipo]);
  await q("INSERT INTO sesiones (token_hash, tipo, usuario_id, expira) VALUES ($1, $2, $3, $4)", [sha256(token), tipo, usuarioId, expira.toISOString()]);
  res.setHeader("Set-Cookie", cookie(`${token}.${hmac(token)}`, Math.floor(DURACION[tipo] / 1000)));
}

// Devuelve { tipo, usuario } o null. Verifica firma, que exista en la tabla y que no esté vencida.
async function leerSesion(req) {
  const v = leerCookies(req)[COOKIE];
  if (!v) return null;
  const [token, firma] = v.split(".");
  if (!token || !firma || !igualSeguro(firma, hmac(token))) return null;
  const s = await uno("SELECT tipo, usuario_id FROM sesiones WHERE token_hash = $1 AND expira > now()", [sha256(token)]);
  if (!s) return null;
  if (s.tipo === "docente") {
    // Docente activa de una escuela activa. La plataforma (ADMIN_EMAIL) entra aunque no tenga escuela o esté desactivada.
    const d = await uno(`SELECT d.id, d.escuela_id, d.email, d.nombre, d.es_admin, d.es_plataforma, e.activa AS escuela_activa
      FROM docentes d LEFT JOIN escuelas e ON e.id = d.escuela_id WHERE d.id = $1 AND d.activo`, [s.usuario_id]);
    if (!d) return null;
    d.es_plataforma = esPlataforma(d);
    if (!d.escuela_activa && !d.es_plataforma) return null;
    if (d.escuela_id == null) d.es_admin = false; // sin escuela no administra ninguna
    delete d.escuela_activa;
    return { tipo: "docente", usuario: d };
  }
  const f = await uno("SELECT id, email FROM familias WHERE id = $1", [s.usuario_id]);
  return f ? { tipo: "familia", usuario: f } : null;
}

async function cerrarSesion(req, res) {
  const v = leerCookies(req)[COOKIE];
  if (v) await q("DELETE FROM sesiones WHERE token_hash = $1", [sha256(v.split(".")[0])]);
  res.setHeader("Set-Cookie", cookie("", 0));
}

// ---------- límites de intentos (en la base, sirven entre instancias) ----------
async function superaLimite(clave, max, minutos) {
  const r = await uno("SELECT count(*)::int AS n FROM limites WHERE clave = $1 AND creado > now() - ($2 || ' minutes')::interval", [clave, String(minutos)]);
  return r.n >= max;
}
async function registrarIntento(clave) {
  await q("INSERT INTO limites (clave) VALUES ($1)", [clave]);
  if (Math.random() < 0.05) await q("DELETE FROM limites WHERE creado < now() - interval '1 day'");
}
async function limpiarIntentos(clave) { await q("DELETE FROM limites WHERE clave = $1", [clave]); }

// ---------- token de formulario público ----------
// GET /api/auth lo entrega a quien no tiene sesión. Habilita usar /api/escuelas desde "Solicitar acceso" y "Primera vez"
// sin abrir la búsqueda a cualquiera que llame la API sin pasar por el login. Vence a las 2 horas.
const VIDA_FORMULARIO = 2 * 3600e3;
function tokenFormulario(ahora = Date.now()) { const t = String(ahora); return `${t}.${hmac("formulario:" + t)}`; }
function formularioOk(tok, ahora = Date.now()) {
  const [t, firma] = String(tok || "").split(".");
  if (!/^\d{10,16}$/.test(t || "") || !firma || !igualSeguro(firma, hmac("formulario:" + t))) return false;
  const edad = ahora - Number(t);
  return edad >= -60e3 && edad <= VIDA_FORMULARIO;
}

module.exports = {
  esPlataforma, emailPlataforma, exigirPlataforma, NO_PLATAFORMA,
  tokenFormulario, formularioOk,
  COOKIE, esProduccion, secreto,
  sha256, hmac, igualSeguro, normEmail, emailValido, ipDe, leerCookies,
  crearSesion, leerSesion, cerrarSesion, superaLimite, registrarIntento, limpiarIntentos
};

// Contraseñas (scrypt), sesiones con cookie firmada (HMAC) + tabla, límites de intentos.
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

// ---------- contraseñas ----------
const SCRYPT = { N: 16384, r: 8, p: 1, len: 64 };
const scrypt = (pw, salt, o = SCRYPT) => new Promise((ok, mal) =>
  crypto.scrypt(String(pw), salt, o.len, { N: o.N, r: o.r, p: o.p, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? mal(e) : ok(k)));

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(pw, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${k.toString("base64")}`;
}
const DUMMY = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
async function verificarPassword(pw, guardado) {
  const [alg, N, r, p, salt, hash] = String(guardado || DUMMY).split("$");
  if (alg !== "scrypt") return false;
  const esperado = Buffer.from(hash, "base64");
  const k = await scrypt(pw, Buffer.from(salt, "base64"), { N: +N, r: +r, p: +p, len: esperado.length });
  return k.length === esperado.length && crypto.timingSafeEqual(k, esperado) && !!guardado;
}
function passwordValida(pw) { return typeof pw === "string" && pw.length >= 10 && pw.length <= 200; }

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
    const d = await uno("SELECT id, escuela_id, email, nombre, es_admin FROM docentes WHERE id = $1 AND activo", [s.usuario_id]);
    return d ? { tipo: "docente", usuario: d } : null;
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

module.exports = {
  COOKIE, esProduccion, secreto, hashPassword, verificarPassword, passwordValida,
  sha256, hmac, igualSeguro, normEmail, emailValido, ipDe, leerCookies,
  crearSesion, leerSesion, cerrarSesion, superaLimite, registrarIntento, limpiarIntentos
};

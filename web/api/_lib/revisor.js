// Cuenta de revisión (Google Play pide un usuario y una contraseña para revisar la app).
// Es la ÚNICA cuenta de Puente que entra con contraseña. Todas las demás siguen con código por mail o Google.
//  · Apagada por defecto: sin REVISOR_EMAIL y REVISOR_CLAVE_HASH, POST /api/auth accion=login_revisor responde 404
//    y /api/config dice revisor: false (login.html no muestra nada).
//  · REVISOR_CLAVE_HASH es un hash scrypt (node:crypto), nunca la contraseña: scrypt$N$r$p$<sal>$<hash> (base64url).
//    Se genera con: node scripts/revisor-clave.js (lee la contraseña por stdin).
//  · Solo sirve para REVISOR_EMAIL, y solo si esa cuenta es docente de una escuela de revisión (escuelas.tipo = 'revision').
//    Si REVISOR_EMAIL apunta a una cuenta real (o a ADMIN_EMAIL), la contraseña no abre nada.
//  · La escuela de revisión, su docente y sus alumnos ficticios los crea scripts/revisor.js. La docente NO es admin:
//    ve solo sus alumnos asignados de esa escuela (los permisos de siempre, _lib/alumnos.js). No ocupa cupo del piloto.
const crypto = require("crypto");
const { promisify } = require("util");
const { uno } = require("./db");
const S = require("./seguridad");
const { errorPublico } = require("./http");

const scrypt = promisify(crypto.scrypt);
const TIPO_ESCUELA = "revision";
const ESCUELA_NOMBRE = "Escuela de prueba (revisión)";
const VENTANA = 15, MAX_IP = 10, MAX_CUENTA = 30, MAX_LARGO = 200;
const N_DEF = 16384, R_DEF = 8, P_DEF = 1, LARGO = 32;

const email = () => S.normEmail(process.env.REVISOR_EMAIL);
const hashConfigurado = () => String(process.env.REVISOR_CLAVE_HASH || "").trim();
// Prendida solo con las dos variables, un email válido y distinto de ADMIN_EMAIL.
function habilitado() {
  const e = email();
  return !!(e && S.emailValido(e) && hashConfigurado() && e !== S.emailPlataforma());
}
const esRevisor = u => !!u && habilitado() && S.normEmail(u.email) === email();

const memoria = (N, r) => 256 * N * r + 32 * 1024 * 1024;
async function hashClave(clave, { N = N_DEF, r = R_DEF, p = P_DEF, sal = crypto.randomBytes(16) } = {}) {
  const h = await scrypt(String(clave).normalize("NFC"), sal, LARGO, { N, r, p, maxmem: memoria(N, r) });
  return `scrypt$${N}$${r}$${p}$${sal.toString("base64url")}$${h.toString("base64url")}`;
}

// Compara en tiempo constante. Un hash mal formado (o con parámetros fuera de rango) nunca valida.
async function claveOk(clave, guardado) {
  const m = /^scrypt\$(\d{1,7})\$(\d{1,2})\$(\d)\$([\w-]{16,128})\$([\w-]{32,128})$/.exec(String(guardado || "").trim());
  if (!m) return false;
  const [N, r, p] = [m[1], m[2], m[3]].map(Number);
  if (N < 16384 || N > 131072 || (N & (N - 1)) !== 0 || r < 8 || r > 16 || p < 1 || p > 4) return false;
  const sal = Buffer.from(m[4], "base64url"), esperado = Buffer.from(m[5], "base64url");
  if (sal.length < 16 || esperado.length < 32) return false;
  const h = await scrypt(String(clave).normalize("NFC"), sal, esperado.length, { N, r, p, maxmem: memoria(N, r) });
  return crypto.timingSafeEqual(h, esperado);
}

// La cuenta de revisión: docente activa de una escuela activa de tipo 'revision'. null si no existe (falta correr el script).
async function cuenta() {
  return uno(`SELECT d.id, d.escuela_id, d.nombre, d.email, d.es_admin, d.es_plataforma FROM docentes d JOIN escuelas e ON e.id = d.escuela_id
    WHERE d.email = $1 AND d.activo AND e.activa AND e.tipo = $2`, [email(), TIPO_ESCUELA]);
}

// POST /api/auth accion=login_revisor { email, clave }. Devuelve los datos de sesión.
async function entrar(req, res, b) {
  if (!habilitado()) throw errorPublico("No encontrado", 404);
  const auditoria = require("./auditoria");
  const { datosSesion } = require("./identidad");
  const ip = S.ipDe(req), kI = "revisor:ip:" + ip, kC = "revisor:cuenta";
  if (await S.superaLimite(kI, MAX_IP, VENTANA) || await S.superaLimite(kC, MAX_CUENTA, VENTANA))
    throw errorPublico("Demasiados intentos. Esperá 15 minutos.", 429);
  await S.registrarIntento(kI); await S.registrarIntento(kC);
  const malo = errorPublico("El email o la contraseña no son correctos.", 401);
  const pedido = S.normEmail(b.email), clave = String(b.clave ?? "");
  if (!clave || clave.length > MAX_LARGO) throw malo;
  // Mismo trabajo (scrypt) exista o no el email: la respuesta no dice si el email es el de revisión.
  const ok = await claveOk(clave, hashConfigurado());
  if (pedido !== email()) throw malo;
  if (!ok) { await auditoria.loginFallido(req, "docente", pedido); throw malo; }
  const d = await cuenta();
  if (!d) { console.error("[puente] login de revisor: la cuenta no existe o no es de una escuela de revisión (correr scripts/revisor.js)"); throw malo; }
  await S.crearSesion(res, "docente", d.id);
  await auditoria.registrar(req, { evento: "login_revisor", actor_tipo: "docente", actor_id: d.id, email: d.email, escuela_id: d.escuela_id, detalle: { metodo: "clave" } });
  console.log(`[puente] ingreso docente #${d.id} vía clave de revisión`);
  return datosSesion("docente", d);
}

module.exports = { TIPO_ESCUELA, ESCUELA_NOMBRE, email, habilitado, esRevisor, hashClave, claveOk, cuenta, entrar, MAX_IP };

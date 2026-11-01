// Registro de accesos (auditoría) para el piloto: login OK/fallido, acceso a fichas, exportaciones, bajas.
// Sin datos personales: el email se guarda como HMAC (no reversible sin SESSION_SECRET), la IP truncada,
// y el detalle solo lleva contadores o marcas, nunca nombres, emails ni texto libre.
// Ante N intentos fallidos de código para una misma cuenta, avisa por mail a la plataforma (como mucho 1 por hora por cuenta).
const { q, uno } = require("./db");
const S = require("./seguridad");

const EVENTOS = ["login_ok", "login_fallido", "ficha_ver", "fichas_listar", "ficha_editar", "exportacion",
  "baja_alumno", "baja_familia", "feedback", "alerta_fallos"];

// IPv4 → a.b.c.0 ; IPv6 → primeros 3 bloques (/48) + "::".
function ipTruncada(ip) {
  const s = String(ip || "").trim();
  const v4 = s.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (s.includes(":")) return s.split(":").slice(0, 3).join(":") + "::";
  return "?";
}
const hashEmail = email => email ? S.hmac("auditoria:" + S.normEmail(email)) : null;
// Para mostrar a la plataforma qué cuenta tuvo fallos sin repetir el email completo: l***@mail.com
function emailEnmascarado(email) {
  const [u, d] = S.normEmail(email).split("@");
  return d ? `${(u || "?")[0]}***@${d}` : "***";
}

const umbralFallos = () => { const n = parseInt(process.env.AUDITORIA_ALERTA_FALLOS, 10); return n >= 2 && n <= 100 ? n : 5; };
const VENTANA_FALLOS_MIN = 30;

// Nunca rompe el pedido: si la auditoría falla, queda en los logs.
async function registrar(req, { evento, actor_tipo = null, actor_id = null, email = null, escuela_id = null, objeto_tipo = null, objeto_id = null, detalle = {} }) {
  try {
    await q(`INSERT INTO auditoria (evento, actor_tipo, actor_id, email_hash, escuela_id, objeto_tipo, objeto_id, ip, detalle)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [evento, actor_tipo, actor_id != null ? Number(actor_id) : null, hashEmail(email), escuela_id != null ? Number(escuela_id) : null,
        objeto_tipo, objeto_id != null ? Number(objeto_id) : null, ipTruncada(req ? S.ipDe(req) : ""), JSON.stringify(detalle || {})]);
  } catch (e) { console.error("[puente] auditoría falló:", e.message); }
}
// Atajo para una sesión de docente/familia.
const actor = s => s ? { actor_tipo: s.tipo, actor_id: s.usuario?.id, escuela_id: s.tipo === "docente" ? s.usuario?.escuela_id : null } : {};

// Login fallido: registra y, si la cuenta llega al umbral en la ventana, avisa a la plataforma (máx. 1 por hora por cuenta).
async function loginFallido(req, tipo, email) {
  let escuela_id = null;
  try { if (tipo === "docente") escuela_id = (await uno("SELECT escuela_id FROM docentes WHERE email = $1", [S.normEmail(email)]))?.escuela_id ?? null; } catch {}
  await registrar(req, { evento: "login_fallido", actor_tipo: tipo, email, escuela_id, detalle: { tipo } });
  try {
    const h = hashEmail(email);
    const r = await uno(`SELECT count(*)::int AS n FROM auditoria WHERE email_hash = $1 AND evento = 'login_fallido'
      AND creado > now() - ($2 || ' minutes')::interval`, [h, String(VENTANA_FALLOS_MIN)]);
    if ((r?.n || 0) < umbralFallos()) return false;
    const clave = "alerta:fallos:" + h;
    if (await S.superaLimite(clave, 1, 60)) return false;
    await S.registrarIntento(clave);
    const avisos = require("./avisos");
    await avisos.alertaFallos(req, { cuenta: emailEnmascarado(email), tipo, intentos: r.n, minutos: VENTANA_FALLOS_MIN, ip: ipTruncada(S.ipDe(req)) });
    await registrar(req, { evento: "alerta_fallos", actor_tipo: tipo, email, detalle: { intentos: r.n } });
    return true;
  } catch (e) { console.error("[puente] alerta de fallos:", e.message); return false; }
}

// Vista para admins: plataforma ve todo; admin de escuela, los eventos de su escuela (y de familias de sus alumnos no:
// las familias no tienen escuela fija, por eso sus logins se ven solo en la plataforma).
async function listar(yo, { limite = 200, evento = "" } = {}) {
  const lim = Math.min(Math.max(Number(limite) || 200, 1), 500);
  const ev = EVENTOS.includes(evento) ? evento : null;
  const filas = S.esPlataforma(yo)
    ? await q(`SELECT id, evento, actor_tipo, actor_id, left(email_hash, 10) AS cuenta, escuela_id, objeto_tipo, objeto_id, ip, detalle, creado
        FROM auditoria WHERE ($1::text IS NULL OR evento = $1) ORDER BY id DESC LIMIT $2`, [ev, lim])
    : await q(`SELECT id, evento, actor_tipo, actor_id, left(email_hash, 10) AS cuenta, escuela_id, objeto_tipo, objeto_id, ip, detalle, creado
        FROM auditoria WHERE escuela_id = $1 AND ($2::text IS NULL OR evento = $2) ORDER BY id DESC LIMIT $3`, [yo.escuela_id, ev, lim]);
  return filas.map(f => ({ ...f, id: Number(f.id), actor_id: f.actor_id != null ? Number(f.actor_id) : null,
    escuela_id: f.escuela_id != null ? Number(f.escuela_id) : null, objeto_id: f.objeto_id != null ? Number(f.objeto_id) : null }));
}

module.exports = { EVENTOS, ipTruncada, hashEmail, emailEnmascarado, umbralFallos, registrar, actor, loginFallido, listar };

// Solicitudes de acceso de docentes nuevas.
//  POST accion=crear     (público)  { nombre, email, escuela, cue?, rol?, mensaje?, sitio_web (trampa para bots: vacío) }
//                                   cue = escuela elegida del Padrón Oficial (9 dígitos); si no está en el padrón se ignora.
//                                   Respuesta siempre genérica: no revela si el email ya tiene cuenta o ya pidió.
//  GET                   (admin)    → pendientes + últimas resueltas + escuelas para elegir al aprobar
//  POST accion=aprobar   (admin)    { id, escuela_id? | escuela_nueva? | desde_padron?, es_admin? } → crea (o reactiva) la docente y le avisa por mail.
//                                   Sin escuela elegida: si la solicitud trae CUE, la escuela de Puente con ese CUE o una nueva con los datos
//                                   del padrón (y entonces queda admin); si no, la escuela de la admin.
//  POST accion=rechazar  (admin)    { id, avisar? }  → marca rechazada; si avisar, le manda un mail amable
const { dbActiva, q, uno } = require("./_lib/db");
const S = require("./_lib/seguridad");
const { exigirDocente } = require("./_lib/auth");
const avisos = require("./_lib/avisos");
const padron = require("./_lib/padron");
const { cuerpo, exigirJson, manejarError, errorPublico } = require("./_lib/http");

const MAX_IP = 5, VENTANA_IP = 60;              // 5 pedidos por IP por hora
const MAX_EMAIL = 3, VENTANA_EMAIL = 24 * 60;   // 3 por email por día
const GENERICO = { ok: true, mensaje: "Recibimos tu pedido, te avisamos por mail." };
const limpio = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

function validar(b) {
  const d = {
    nombre: limpio(b.nombre, 80), email: S.normEmail(b.email), escuela: limpio(b.escuela, 120),
    rol: limpio(b.rol, 80), mensaje: limpio(b.mensaje, 1000)
  };
  if (d.nombre.length < 2) throw errorPublico("Falta tu nombre");
  if (!S.emailValido(d.email)) throw errorPublico("Revisá el email");
  if (d.escuela.length < 2) throw errorPublico("Falta la escuela");
  return d;
}

async function crear(req, res, b) {
  const d = validar(b);
  const cue = /^\d{9}$/.test(String(b.cue ?? "").trim()) ? String(b.cue).trim() : "";
  d.cue = cue && await padron.porCue(cue) ? cue : null;
  const ip = S.ipDe(req), kI = "solicitud:ip:" + ip, kE = "solicitud:email:" + d.email;
  // Trampa: un humano no ve ese campo. Al bot le contestamos lo mismo, sin guardar nada.
  if (limpio(b.sitio_web, 200)) { await S.registrarIntento(kI); return res.status(200).json(GENERICO); }
  if (await S.superaLimite(kI, MAX_IP, VENTANA_IP) || await S.superaLimite(kE, MAX_EMAIL, VENTANA_EMAIL))
    throw errorPublico("Ya recibimos varios pedidos. Probá de nuevo más tarde.", 429);
  await S.registrarIntento(kI); await S.registrarIntento(kE);
  // Ya es docente activa: no hace falta pedir nada (y no lo decimos).
  if (await uno("SELECT 1 AS x FROM docentes WHERE email = $1 AND activo", [d.email])) return res.status(200).json(GENERICO);
  // Ya pidió y está pendiente: actualizamos los datos, sin volver a avisar.
  const previa = await uno(`UPDATE solicitudes SET nombre = $2, escuela = $3, rol = $4, mensaje = $5, cue = $6, actualizado = now()
    WHERE id = (SELECT id FROM solicitudes WHERE email = $1 AND estado = 'pendiente' ORDER BY creado DESC LIMIT 1) RETURNING id`,
    [d.email, d.nombre, d.escuela, d.rol, d.mensaje, d.cue]);
  if (previa) return res.status(200).json(GENERICO);
  const s = await uno("INSERT INTO solicitudes (nombre, email, escuela, rol, mensaje, cue) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [d.nombre, d.email, d.escuela, d.rol, d.mensaje, d.cue]);
  await avisos.nuevaSolicitud(req, s);
  res.status(200).json(GENERICO);
}

async function exigirAdmin(req, res) {
  const yo = await exigirDocente(req, res);
  if (!yo) return null;
  if (!yo.es_admin) { res.status(403).json({ error: "Solo una docente administradora puede ver las solicitudes." }); return null; }
  return yo;
}

async function listar(res, yo) {
  const campos = "id, nombre, email, escuela, rol, mensaje, estado, creado, resuelto, cue";
  // Con CUE: si esa escuela ya está en Puente, se sugiere; si no, se ofrece crearla desde el padrón.
  const pendientes = await q(`SELECT s.id, s.nombre, s.email, s.escuela, s.rol, s.mensaje, s.estado, s.creado, s.resuelto, s.cue,
      e.id AS escuela_cue_id FROM solicitudes s LEFT JOIN escuelas e ON e.cue = s.cue AND s.cue IS NOT NULL
    WHERE s.estado = 'pendiente' ORDER BY s.creado`);
  for (const p of pendientes) {
    const pd = p.cue && !p.escuela_cue_id ? await padron.porCue(p.cue) : null;
    p.padron = pd ? { cue: pd.cue, nombre: pd.nombre, localidad: pd.localidad, modalidad: pd.modalidad } : null;
  }
  const resueltas = await q(`SELECT ${campos} FROM solicitudes WHERE estado <> 'pendiente' ORDER BY resuelto DESC NULLS LAST LIMIT 10`);
  const escuelas = await q("SELECT id, nombre, cue FROM escuelas ORDER BY nombre");
  res.status(200).json({ pendientes, resueltas, escuelas, mi_escuela: yo.escuela_id });
}

async function pendiente(id) {
  const s = await uno("SELECT * FROM solicitudes WHERE id = $1 AND estado = 'pendiente'", [Number(id) || 0]);
  if (!s) throw errorPublico("Esa solicitud ya no está pendiente.", 404);
  return s;
}

async function aprobar(req, res, yo, b) {
  const s = await pendiente(b.id);
  // Antes de crear una escuela: si ya hay una docente activa con ese email no se sigue.
  const existe = await uno("SELECT id, activo FROM docentes WHERE email = $1", [s.email]);
  if (existe?.activo) throw errorPublico("Ya hay una docente activa con ese email. Podés rechazar esta solicitud.", 409);
  let esAdmin = !!b.es_admin, escuela;
  const nueva = limpio(b.escuela_nueva, 120);
  const porCue = !nueva && (b.desde_padron || (!b.escuela_id && s.cue));
  if (nueva) {
    escuela = await uno("INSERT INTO escuelas (nombre) VALUES ($1) RETURNING id, nombre", [nueva]);
    esAdmin = true; // una escuela nueva necesita alguien que la administre
  } else if (porCue) {
    if (!s.cue) throw errorPublico("Esta solicitud no tiene una escuela del padrón. Elegí una escuela.");
    const r = await padron.escuelaPorCue(s.cue);
    if (!r) throw errorPublico("Esa escuela ya no está en el padrón. Elegí una escuela o creá una nueva.", 404);
    escuela = r.escuela;
    if (r.creada) esAdmin = true;
  } else {
    escuela = await uno("SELECT id, nombre, cue FROM escuelas WHERE id = $1", [Number(b.escuela_id) || yo.escuela_id]);
    if (!escuela) throw errorPublico("No encontramos esa escuela", 404);
  }
  let d;
  try {
    d = existe
      ? await uno("UPDATE docentes SET activo = true, escuela_id = $2, nombre = $3, es_admin = $4 WHERE id = $1 AND NOT activo RETURNING id, nombre, email, es_admin, activo",
          [existe.id, escuela.id, s.nombre, esAdmin])
      : await uno("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, es_admin, activo",
          [escuela.id, s.email, s.nombre, esAdmin]);
  } catch (e) {
    if (String(e.code) === "23505") throw errorPublico("Ya hay una docente con ese email.", 409);
    throw e;
  }
  if (!d) throw errorPublico("Ya hay una docente activa con ese email.", 409);
  await q("UPDATE solicitudes SET estado = 'aprobada', resuelto = now(), actualizado = now(), resuelto_por = $2, docente_id = $3 WHERE id = $1",
    [s.id, yo.id, d.id]);
  const avisada = await avisos.accesoAprobado(req, { nombre: d.nombre, email: d.email, escuela: escuela.nombre });
  res.status(200).json({ ok: true, docente: d, escuela: { id: escuela.id, nombre: escuela.nombre, cue: escuela.cue || null }, avisada });
}

async function rechazar(req, res, yo, b) {
  const s = await uno("UPDATE solicitudes SET estado = 'rechazada', resuelto = now(), actualizado = now(), resuelto_por = $2 WHERE id = $1 AND estado = 'pendiente' RETURNING nombre, email",
    [Number(b.id) || 0, yo.id]);
  if (!s) throw errorPublico("Esa solicitud ya no está pendiente.", 404);
  const avisada = b.avisar ? await avisos.solicitudRechazada(req, s) : false;
  res.status(200).json({ ok: true, avisada });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) return res.status(400).json({ error: "Modo demo: sin base de datos no hay cuentas de docentes." });
    if (!exigirJson(req, res)) return;
    if (req.method === "POST" && cuerpo(req).accion === "crear") return await crear(req, res, cuerpo(req));
    const yo = await exigirAdmin(req, res);
    if (!yo) return;
    if (req.method === "GET") return await listar(res, yo);
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    const b = cuerpo(req);
    if (b.accion === "aprobar") return await aprobar(req, res, yo, b);
    if (b.accion === "rechazar") return await rechazar(req, res, yo, b);
    res.status(400).json({ error: "Acción desconocida" });
  } catch (e) { manejarError(res, e); }
};

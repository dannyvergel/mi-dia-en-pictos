// Canal de feedback: "Enviar comentario" para docentes y familias (con sesión).
//  POST { texto, pagina? }  → se guarda en la tabla feedback y avisa por mail a la plataforma.
//                             Límites por cuenta: 3 cada 10 min y 10 por día; mails a la plataforma: como mucho 1 cada 10 min por cuenta
//                             (los demás quedan guardados igual y se ven en el panel).
//  GET                       → plataforma: últimos comentarios.
const { dbActiva, q, uno } = require("./_lib/db");
const { exigirSesion } = require("./_lib/auth");
const S = require("./_lib/seguridad");
const auditoria = require("./_lib/auditoria");
const avisos = require("./_lib/avisos");
const { cuerpo, exigirJson, manejarError, errorPublico } = require("./_lib/http");

const MAX_TEXTO = 2000;
const LIMITES = [{ max: 3, min: 10 }, { max: 10, min: 1440 }];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) return res.status(400).json({ error: "Los comentarios necesitan la base de datos (modo demo activo)." });
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    if (!exigirJson(req, res)) return;
    const s = await exigirSesion(req, res);
    if (!s) return;
    if (req.method === "GET") {
      if (s.tipo !== "docente" || !S.esPlataforma(s.usuario)) throw errorPublico("Solo la plataforma ve los comentarios.", 403);
      const filas = await q("SELECT id, autor_tipo, autor_id, escuela_id, pagina, texto, estado, creado FROM feedback ORDER BY id DESC LIMIT 200");
      return res.status(200).json({ comentarios: filas.map(f => ({ ...f, id: Number(f.id), autor_id: Number(f.autor_id), escuela_id: f.escuela_id != null ? Number(f.escuela_id) : null })) });
    }
    const b = cuerpo(req);
    const texto = String(b.texto || "").trim().slice(0, MAX_TEXTO);
    if (texto.length < 3) throw errorPublico("Escribí tu comentario");
    const pagina = String(b.pagina || "").replace(/[^a-z0-9._#-]/gi, "").slice(0, 60);
    const clave = `feedback:${s.tipo}:${s.usuario.id}`;
    for (const l of LIMITES) if (await S.superaLimite(clave, l.max, l.min))
      throw errorPublico("Gracias! Ya recibimos varios comentarios tuyos. Probá de nuevo más tarde.", 429);
    await S.registrarIntento(clave);
    const escuela_id = s.tipo === "docente" ? s.usuario.escuela_id : null;
    const f = await uno("INSERT INTO feedback (autor_tipo, autor_id, escuela_id, pagina, texto) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [s.tipo, s.usuario.id, escuela_id, pagina, texto]);
    await auditoria.registrar(req, { evento: "feedback", ...auditoria.actor(s), objeto_tipo: "feedback", objeto_id: f.id });
    // Aviso por mail con límite propio (no inunda la casilla de la plataforma).
    const claveMail = `feedback-mail:${s.tipo}:${s.usuario.id}`;
    let avisada = false;
    if (!(await S.superaLimite(claveMail, 1, 10))) {
      await S.registrarIntento(claveMail);
      avisada = await avisos.nuevoFeedback(req, { autor_tipo: s.tipo, autor_id: Number(s.usuario.id), pagina, texto });
    }
    return res.status(200).json({ ok: true, id: Number(f.id), avisada, mensaje: "¡Gracias! Lo recibimos." });
  } catch (e) { manejarError(res, e); }
};

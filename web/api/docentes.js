// Docentes de la escuela.
//  GET                         → lista de docentes de mi escuela
//  POST accion=crear           { nombre, email, es_admin }  (solo admin; sin contraseña: le llega un mail y entra con código.
//                                                          Si el email era de una docente desactivada, la reactiva en mi escuela)
//  POST accion=desactivar      { id }                                  (solo admin, no a sí misma)
//  POST accion=plataforma      → 403 para todos: promover a otras cuentas como plataforma está bloqueado por ahora
//                                (la plataforma es solo la cuenta de ADMIN_EMAIL; pendiente en docs/CHECKLIST-PILOTO.md).
// Piloto cerrado (links de invitación, _lib/enlaces.js) y cupos (_lib/piloto.js):
//  GET                         → también { cupos: { usados, max, libres, completo } } para admins y plataforma
//  GET ?invitaciones=1         → { enlaces, cupos, escuelas } links de mi escuela (plataforma: todos) (admins y plataforma)
//  POST accion=invitacion_crear   { escuela_id? | cue? (plataforma), es_admin?, etiqueta?, dias? (7), usos? (1) }
//                                 → link para una seño (la admin de escuela, solo para la suya). Devuelve la URL una sola vez.
//                                 La plataforma (ADMIN_EMAIL) lo usa desde admin.html para el link del directivo de una escuela:
//                                 con cue de una escuela que todavía no está en Puente, la escuela se crea desde el padrón al crear el link.
//                                 Con independiente: true (solo plataforma) { nombre, espacio? }: crea el espacio propio de un/a
//                                 profesional sin escuela (terapeuta, acompañante) y el link que lo deja como admin. Ocupa cupo.
//  POST accion=invitacion_revocar { id }   (admins de esa escuela, plataforma, o la docente que ve al alumno en links de familia)
//  "crear" respeta el tope de cupos.
// Enfoque equipo (docs/enfoques.md):
//  POST accion=invitacion_crear { equipo_nuevo: true, alumno, abre: 'familia'|'profesional', espacio?, vinculo?, familia_nombre?,
//                                 profesional_nombre?, rol? }  (solo plataforma) → abre el espacio de un chico: { equipo, enlace (familia),
//                                 enlace_profesional? }. Respeta cupos.
//  POST accion=invitacion_crear { equipo: escuela_id, nombre?, rol }  → link para sumar un/a profesional (plataforma o integrante con acceso)
//  POST accion=invitacion_revocar { id, equipo: escuela_id }   → anula un link pendiente de ese equipo (integrante con acceso)
//  GET ?equipos=1                → mis equipos { equipos, confidencialidad: { version, texto } }
//  POST accion=equipo_confidencialidad { escuela_id, acepto: true }   → acepta el compromiso (borrador), con fecha y versión
//  POST accion=equipo_salir { escuela_id }   → se va del equipo
const { dbActiva, q, uno } = require("./_lib/db");
const S = require("./_lib/seguridad");
const { exigirDocente } = require("./_lib/auth");
const avisos = require("./_lib/avisos");
const enlaces = require("./_lib/enlaces");
const piloto = require("./_lib/piloto");
const A = require("./_lib/alumnos");
const legal = require("./_lib/legal");
const { cuerpo, consulta, exigirJson, manejarError, errorPublico } = require("./_lib/http");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) return res.status(400).json({ error: "Modo demo: sin base de datos no hay cuentas de docentes." });
    if (!exigirJson(req, res)) return;
    const yo = await exigirDocente(req, res);
    if (!yo) return;
    const admin = yo.es_admin || S.esPlataforma(yo);
    if (req.method === "GET" && consulta(req, "invitaciones") === "1") {
      if (!admin) throw errorPublico("Solo la dirección de la escuela (o la plataforma) ve los links de invitación.", 403);
      const escuelas = S.esPlataforma(yo) ? await q("SELECT id, nombre, cue FROM escuelas WHERE activa ORDER BY nombre")
        : await q("SELECT id, nombre, cue FROM escuelas WHERE id = $1", [yo.escuela_id]);
      return res.status(200).json({ enlaces: await enlaces.listar(yo), cupos: await piloto.cupos(), escuelas: escuelas.map(e => ({ ...e, id: Number(e.id) })),
        mi_escuela: Number(yo.escuela_id), plataforma: S.esPlataforma(yo) });
    }
    if (req.method === "GET" && consulta(req, "equipos") === "1")
      return res.status(200).json({ equipos: await A.misEquipos(yo),
        confidencialidad: { version: legal.VERSION_CONFIDENCIALIDAD_EQUIPO, texto: legal.TEXTO_CONFIDENCIALIDAD_EQUIPO, borrador: true } });
    if (req.method === "GET") {
      if (yo.escuela_id == null) return res.status(200).json({ docentes: [], yo: yo.id, sin_escuela: true, ...(admin ? { cupos: await piloto.cupos() } : {}) });
      const docentes = await q("SELECT id, nombre, email, rol, es_admin, es_plataforma, activo FROM docentes WHERE escuela_id = $1 ORDER BY nombre", [yo.escuela_id]);
      return res.status(200).json({ docentes: docentes.map(d => ({ ...d, es_plataforma: S.esPlataforma(d) })), yo: yo.id,
        ...(admin ? { cupos: await piloto.cupos() } : {}) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    const b = cuerpo(req);
    if (b.accion === "invitacion_crear" && b.equipo_nuevo) {
      const r = await enlaces.crearEquipo(req, yo, b);
      return res.status(200).json({ equipo: r.equipo, enlace: r.familia, ...(r.profesional ? { enlace_profesional: r.profesional } : {}), cupos: await piloto.cupos() });
    }
    if (b.accion === "invitacion_crear" && b.equipo != null && b.equipo !== "")
      return res.status(200).json({ enlace: await enlaces.crearMiembro(req, { tipo: "docente", usuario: yo }, Number(b.equipo), b), cupos: await piloto.cupos() });
    if (b.accion === "invitacion_crear") return res.status(200).json({ enlace: await (b.independiente ? enlaces.crearIndependiente : enlaces.crearDocente)(req, yo, b), cupos: await piloto.cupos() });
    if (b.accion === "invitacion_revocar" && b.equipo != null && b.equipo !== "" && !S.esPlataforma(yo)) {
      if (!(await A.miembroConAcceso(yo.id, b.equipo))) throw errorPublico("No encontramos ese link", 404);
      await enlaces.revocarEnEquipo(req, { tipo: "docente", usuario: yo }, Number(b.equipo), b.id);
      return res.status(200).json({ ok: true });
    }
    if (b.accion === "invitacion_revocar") return res.status(200).json({ enlace: await enlaces.revocar(req, yo, b.id) });
    if (b.accion === "equipo_confidencialidad") { await A.aceptarConfidencialidad(req, yo, b.escuela_id, b.acepto); return res.status(200).json({ ok: true, equipos: await A.misEquipos(yo) }); }
    if (b.accion === "equipo_salir") { await A.salirDelEquipo(req, yo, b.escuela_id); return res.status(200).json({ ok: true, equipos: await A.misEquipos(yo) }); }
    // Promover a otra cuenta como plataforma: bloqueado por ahora para todos (también para ADMIN_EMAIL).
    if (b.accion === "plataforma") throw errorPublico("Por ahora la plataforma es solo la cuenta de ADMIN_EMAIL: no se puede promover a otras cuentas.", 403);
    if (!yo.es_admin || yo.escuela_id == null) throw errorPublico("Solo una docente administradora puede sumar o quitar docentes.", 403);
    if (b.accion === "crear") {
      const email = S.normEmail(b.email), nombre = String(b.nombre || "").trim().slice(0, 80);
      if (!nombre) throw errorPublico("Falta el nombre");
      if (!S.emailValido(email)) throw errorPublico("Revisá el email");
      const existe = await uno("SELECT id, activo FROM docentes WHERE email = $1", [email]);
      if (existe?.activo) throw errorPublico("Ya hay una docente con ese email", 409);
      await piloto.exigirCupo(1);
      const d = existe
        ? await uno("UPDATE docentes SET activo = true, escuela_id = $2, nombre = $3, es_admin = $4 WHERE id = $1 RETURNING id, nombre, email, es_admin, activo", [existe.id, yo.escuela_id, nombre, !!b.es_admin])
        : await uno("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, es_admin, activo", [yo.escuela_id, email, nombre, !!b.es_admin]);
      const escuela = await uno("SELECT nombre FROM escuelas WHERE id = $1", [yo.escuela_id]);
      d.avisada = await avisos.accesoAprobado(req, { nombre, email, escuela: escuela?.nombre });
      return res.status(200).json({ docente: d });
    }
    if (b.accion === "desactivar") {
      const id = Number(b.id);
      if (id === Number(yo.id)) throw errorPublico("No te podés desactivar a vos misma");
      const d = await uno("UPDATE docentes SET activo = false WHERE id = $1 AND escuela_id = $2 RETURNING id", [id, yo.escuela_id]);
      if (!d) throw errorPublico("No encontramos esa docente", 404);
      await q("DELETE FROM sesiones WHERE tipo = 'docente' AND usuario_id = $1", [id]);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "Acción desconocida" });
  } catch (e) { manejarError(res, e); }
};

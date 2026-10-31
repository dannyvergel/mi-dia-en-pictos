// Docentes de la escuela.
//  GET                         → lista de docentes de mi escuela
//  POST accion=crear           { nombre, email, es_admin }  (solo admin; sin contraseña: le llega un mail y entra con código.
//                                                          Si el email era de una docente desactivada, la reactiva en mi escuela)
//  POST accion=desactivar      { id }                                  (solo admin, no a sí misma)
const { dbActiva, q, uno } = require("./_lib/db");
const S = require("./_lib/seguridad");
const { exigirDocente } = require("./_lib/auth");
const avisos = require("./_lib/avisos");
const { cuerpo, exigirJson, manejarError, errorPublico } = require("./_lib/http");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) return res.status(400).json({ error: "Modo demo: sin base de datos no hay cuentas de docentes." });
    if (!exigirJson(req, res)) return;
    const yo = await exigirDocente(req, res);
    if (!yo) return;
    if (req.method === "GET") {
      const docentes = await q("SELECT id, nombre, email, es_admin, activo FROM docentes WHERE escuela_id = $1 ORDER BY nombre", [yo.escuela_id]);
      return res.status(200).json({ docentes, yo: yo.id });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    const b = cuerpo(req);
    if (!yo.es_admin) throw errorPublico("Solo una docente administradora puede sumar o quitar docentes.", 403);
    if (b.accion === "crear") {
      const email = S.normEmail(b.email), nombre = String(b.nombre || "").trim().slice(0, 80);
      if (!nombre) throw errorPublico("Falta el nombre");
      if (!S.emailValido(email)) throw errorPublico("Revisá el email");
      const existe = await uno("SELECT id, activo FROM docentes WHERE email = $1", [email]);
      if (existe?.activo) throw errorPublico("Ya hay una docente con ese email", 409);
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

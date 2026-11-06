// Qué alumnos ve cada docente. Es el ÚNICO lugar con la regla de acceso: todas las APIs que tocan un alumno pasan por acá
// (condVisible / puedeVer), así lo nuevo (días, fichas, documentos) hereda la regla sin repetirla.
// Enfoque escuela (escuelas.tipo 'escuela' o 'independiente'):
// - Admin de la escuela: todos los alumnos de su escuela.
// - Docente (no admin): solo los alumnos que tiene asignados (tabla alumno_docentes), dentro de su escuela.
// Enfoque equipo (escuelas.tipo 'equipo', un espacio por chico; ver docs/enfoques.md):
// - Integrante del equipo (equipo_miembros) APROBADO por la familia y con el compromiso de confidencialidad aceptado,
//   en un espacio activo, y con el CONSENTIMIENTO vigente de la familia (si lo retira, se pierde el acceso). No importa su escuela (puede no tener, o ser seño de otra).
const { q, uno } = require("./db");
const { errorPublico } = require("./http");

// ---- SQL reutilizable (sin parámetros propios: se le pasa la columna o el $n) ----
// ¿El alumno `alumnoRef` tiene el consentimiento de la familia vigente (ficha con consentimiento.dado = true)?
// Si la familia lo retira ({ dado: false, retirado }), deja de estar vigente.
const sqlConsentimiento = alumnoRef => `EXISTS (SELECT 1 FROM fichas fc WHERE fc.alumno_id = ${alumnoRef} AND fc.consentimiento->>'dado' = 'true')`;
// ¿El docente `docRef` es integrante con acceso al espacio `escRef`? Hace falta: aprobado por la familia, confidencialidad
// aceptada, espacio de equipo activo Y consentimiento vigente de la familia (decisión del 2026-11-05). `alumnoRef`: el alumno
// que se mira; si no se pasa, el alumno del espacio (uno por equipo, el de menor id, como alumnoDelEspacio).
const sqlMiembroConAcceso = (escRef, docRef, alumnoRef = null) => `EXISTS (SELECT 1 FROM equipo_miembros m JOIN escuelas me ON me.id = m.escuela_id
  WHERE m.escuela_id = ${escRef} AND m.docente_id = ${docRef} AND m.estado = 'aprobado' AND m.confidencialidad IS NOT NULL
    AND me.activa AND me.tipo = 'equipo'
    AND ${sqlConsentimiento(alumnoRef || "(SELECT ca.id FROM alumnos ca WHERE ca.escuela_id = me.id ORDER BY ca.id LIMIT 1)")})`;
// ¿El docente `docRef` integra (pendiente o aprobado) algún equipo activo? Sirve para entrar y para contar cupos.
const sqlEnEquipoVivo = docRef => `EXISTS (SELECT 1 FROM equipo_miembros mv JOIN escuelas ev ON ev.id = mv.escuela_id
  WHERE mv.docente_id = ${docRef} AND mv.estado IN ('pendiente', 'aprobado') AND ev.activa AND ev.tipo = 'equipo')`;

// Condición SQL sobre el alias `a` (alumnos). n = número del primer parámetro. Devuelve [sql, params] (siempre 3 parámetros).
function condVisible(yo, n = 1, alias = "a") {
  return [`((${alias}.escuela_id = $${n} AND ($${n + 1}::boolean OR EXISTS (SELECT 1 FROM alumno_docentes ad WHERE ad.alumno_id = ${alias}.id AND ad.docente_id = $${n + 2})))
    OR ${sqlMiembroConAcceso(`${alias}.escuela_id`, `$${n + 2}::bigint`, `${alias}.id`)})`,
    [yo.escuela_id ?? null, !!yo.es_admin, yo.id]];
}

// Enfoque equipo: ¿el docente es integrante aprobado, con la confidencialidad aceptada, del espacio (activo) del alumno, pero la
// familia no dio (o retiró) el consentimiento? Sirve para contestar 403 con un mensaje claro en vez de un 404.
const FALTA_CONSENTIMIENTO = "Falta el consentimiento de la familia. Hasta que lo dé, no podés ver nada de este chico o chica.";
async function faltaConsentimiento(yo, alumnoId) {
  if (!yo?.id || yo.demo) return false;
  return !!(await uno(`SELECT 1 AS x FROM alumnos a JOIN escuelas e ON e.id = a.escuela_id JOIN equipo_miembros m ON m.escuela_id = a.escuela_id
    WHERE a.id = $1 AND m.docente_id = $2 AND m.estado = 'aprobado' AND m.confidencialidad IS NOT NULL AND e.activa AND e.tipo = 'equipo'
      AND NOT ${sqlConsentimiento("a.id")}`, [Number(alumnoId) || 0, Number(yo.id) || 0]));
}
// Corta con 403 (FALTA_CONSENTIMIENTO) si ese es el motivo por el que no lo ve. Si no, no hace nada.
async function exigirConsentimiento(yo, alumnoId) {
  if (await faltaConsentimiento(yo, alumnoId)) throw errorPublico(FALTA_CONSENTIMIENTO, 403);
}

// El alumno si el docente tiene acceso (condVisible); la plataforma, cualquiera. null si no. cols sobre el alias `a`.
// Lo usan los documentos (_lib/documentos.js): en escuela, docente asignada o admin; en equipo, integrante aprobado con la
// confidencialidad aceptada y con el consentimiento vigente de la familia. Sin consentimiento: 403 (FALTA_CONSENTIMIENTO).
async function alumnoConAcceso(yo, alumnoId, cols = "a.id, a.nombre, a.escuela_id") {
  const id = Number(alumnoId) || 0;
  if (require("./seguridad").esPlataforma(yo)) return uno(`SELECT ${cols} FROM alumnos a WHERE a.id = $1`, [id]);
  const [c, p] = condVisible(yo, 2);
  const a = await uno(`SELECT ${cols} FROM alumnos a WHERE a.id = $1 AND ${c}`, [id, ...p]);
  if (!a) await exigirConsentimiento(yo, id);
  return a;
}

// Por id (el Cuaderno del día manda el id del alumno). Misma regla que condVisible. En modo demo (yo.demo) no hay base: null.
async function exigirVisible(yo, alumnoId) {
  if (!yo || yo.demo) return null;
  const id = Number(alumnoId) || 0;
  const [c, p] = condVisible(yo, 2);
  const a = await uno(`SELECT a.id, a.nombre FROM alumnos a WHERE a.id = $1 AND ${c}`, [id, ...p]);
  if (a) return a;
  await exigirConsentimiento(yo, id);
  throw errorPublico("Ese alumno no está entre tus alumnos. Pedile a la admin de tu escuela que te lo asigne.", 404);
}

async function puedeVer(yo, alumnoId) {
  const [c, p] = condVisible(yo, 2);
  return !!(await uno(`SELECT 1 AS x FROM alumnos a WHERE a.id = $1 AND ${c}`, [Number(alumnoId) || 0, ...p]));
}

// Por nombre (compatibilidad: clientes viejos y modo PIN mandan el nombre). Si hay dos con el mismo nombre toma uno:
// el Cuaderno con cuentas manda el id (exigirVisible). null si no lo ve.
async function visiblePorNombre(yo, nombre) {
  const [c, p] = condVisible(yo, 2);
  return uno(`SELECT a.id, a.nombre FROM alumnos a WHERE a.nombre = $1 AND ${c}`, [String(nombre || ""), ...p]);
}

// Con base: corta si la docente no tiene a ese alumno. En modo demo (yo.demo) no hay alumnos en la base.
async function exigirVisiblePorNombre(yo, nombre) {
  if (!yo || yo.demo) return null;
  const a = await visiblePorNombre(yo, nombre);
  if (!a) throw errorPublico("Ese alumno no está entre tus alumnos. Pedile a la admin de tu escuela que te lo asigne.", 404);
  return a;
}

// Docentes asignadas a cada alumno: { alumno_id: [{ id, nombre, email }] }
async function asignadas(alumnoIds) {
  if (!alumnoIds.length) return {};
  const filas = await q(`SELECT ad.alumno_id, d.id, d.nombre, d.email FROM alumno_docentes ad JOIN docentes d ON d.id = ad.docente_id
    WHERE ad.alumno_id = ANY($1::bigint[]) AND d.activo ORDER BY d.nombre`, [alumnoIds.map(Number)]);
  const out = {};
  for (const f of filas) (out[Number(f.alumno_id)] ||= []).push({ id: Number(f.id), nombre: f.nombre, email: f.email });
  return out;
}

async function asignar(alumnoId, docenteId, porId) {
  await q("INSERT INTO alumno_docentes (alumno_id, docente_id, asignado_por) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [alumnoId, docenteId, porId ?? null]);
}

// Asignar o quitar a otra docente. Pueden: las admins, y las docentes asignadas (para sumar a la integradora, terapeuta…).
// Quitar: las admins a cualquiera; una docente no admin solo a sí misma.
async function cambiarAsignacion(yo, alumnoId, docenteId, sumar) {
  if (!(await puedeVer(yo, alumnoId))) throw errorPublico("No encontramos ese alumno", 404);
  docenteId = Number(docenteId) || 0;
  const d = await uno("SELECT id, nombre FROM docentes WHERE id = $1 AND escuela_id = $2 AND activo", [docenteId, yo.escuela_id]);
  if (!d) throw errorPublico("Esa docente no es de tu escuela (o no está activa)", 404);
  if (sumar) return asignar(alumnoId, docenteId, yo.id);
  if (!yo.es_admin && docenteId !== Number(yo.id)) throw errorPublico("Solo una admin de la escuela puede quitarle un alumno a otra docente.", 403);
  await q("DELETE FROM alumno_docentes WHERE alumno_id = $1 AND docente_id = $2", [alumnoId, docenteId]);
}

// ======================= Enfoque equipo =======================
// Roles sugeridos (también se acepta texto libre, hasta 40 caracteres).
const ROLES_EQUIPO = ["Fonoaudióloga/o", "Terapista ocupacional", "Psicopedagoga/o", "Maestra/o integrador/a", "Docente", "Acompañante terapéutico", "Psicóloga/o"];
const ESTADOS_VIVOS = ["pendiente", "aprobado"];
const txtRol = r => String(r ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
const auditoria = () => require("./auditoria");
const NO_ES_EQUIPO = "Esto es solo para espacios de equipo.";
const LO_DECIDE_LA_FAMILIA = "En un espacio de equipo esto lo decide la familia, que es la dueña del espacio.";

// Espacio (fila de escuelas) de un alumno: { escuela_id, tipo, activa } o null.
async function espacioDeAlumno(alumnoId) {
  const e = await uno("SELECT e.id, e.tipo, e.activa FROM alumnos a JOIN escuelas e ON e.id = a.escuela_id WHERE a.id = $1", [Number(alumnoId) || 0]);
  return e ? { escuela_id: Number(e.id), tipo: e.tipo, activa: !!e.activa } : null;
}
const esEquipo = async alumnoId => (await espacioDeAlumno(alumnoId))?.tipo === "equipo";
// Corta (403) si el alumno es de un espacio de equipo y quien pide no es la plataforma (contactos, familias, borrar, asignar…).
async function exigirNoEquipo(alumnoId, plataforma) {
  if (!plataforma && await esEquipo(alumnoId)) throw errorPublico(LO_DECIDE_LA_FAMILIA, 403);
}
// El alumno (único) de un espacio de equipo.
const alumnoDelEspacio = escuelaId => uno("SELECT id, nombre FROM alumnos WHERE escuela_id = $1 ORDER BY id LIMIT 1", [Number(escuelaId) || 0]);
async function miembroConAcceso(docenteId, escuelaId) {
  return !!(await uno(`SELECT 1 AS x WHERE ${sqlMiembroConAcceso("$1::bigint", "$2::bigint")}`, [Number(escuelaId) || 0, Number(docenteId) || 0]));
}

const formaMiembro = (m, completo) => ({
  id: Number(m.id), nombre: m.nombre, rol: m.rol || "", estado: m.estado,
  ...(completo ? { email: m.email, creado: m.creado, resuelto: m.resuelto || null, motivo: m.motivo || "",
    confidencialidad: m.confidencialidad || null, confidencialidad_version: m.confidencialidad_version || null,
    invitado_por: m.invitado_por_tipo || null } : {})
});
// Integrantes de un espacio. completo (la familia, dueña): todos, con email, estados y fechas. Si no (otro integrante): solo los aprobados.
async function miembrosDe(escuelaId, { completo = false } = {}) {
  const filas = await q(`SELECT m.*, d.nombre, d.email FROM equipo_miembros m JOIN docentes d ON d.id = m.docente_id
    WHERE m.escuela_id = $1 ${completo ? "" : "AND m.estado = 'aprobado'"} ORDER BY m.estado = 'pendiente' DESC, m.creado`, [Number(escuelaId) || 0]);
  return filas.map(m => formaMiembro(m, completo));
}

// Equipos del docente (para su panel): pendientes y aprobados de espacios activos, con lo que le falta para entrar.
async function misEquipos(yo) {
  const filas = await q(`SELECT m.id, m.escuela_id, m.rol, m.estado, m.confidencialidad, m.confidencialidad_version, e.nombre AS espacio,
      (SELECT a.id FROM alumnos a WHERE a.escuela_id = e.id ORDER BY a.id LIMIT 1) AS alumno_id,
      (SELECT a.nombre FROM alumnos a WHERE a.escuela_id = e.id ORDER BY a.id LIMIT 1) AS alumno,
      ${sqlConsentimiento("(SELECT a.id FROM alumnos a WHERE a.escuela_id = e.id ORDER BY a.id LIMIT 1)")} AS consentimiento_familia
    FROM equipo_miembros m JOIN escuelas e ON e.id = m.escuela_id
    WHERE m.docente_id = $1 AND m.estado = ANY($2::text[]) AND e.activa AND e.tipo = 'equipo' ORDER BY e.nombre`, [yo.id, ESTADOS_VIVOS]);
  const out = [];
  for (const f of filas) {
    const consentimiento = !!f.consentimiento_familia;
    const acceso = f.estado === "aprobado" && !!f.confidencialidad && consentimiento;
    out.push({ miembro_id: Number(f.id), escuela_id: Number(f.escuela_id), espacio: f.espacio, alumno_id: f.alumno_id != null ? Number(f.alumno_id) : null,
      alumno: f.alumno || "", rol: f.rol || "", estado: f.estado, confidencialidad: f.confidencialidad || null, consentimiento, acceso,
      falta: f.estado === "pendiente" ? "aprobacion" : (!f.confidencialidad ? "confidencialidad" : (!consentimiento ? "consentimiento" : null)),
      ...(acceso ? { miembros: await miembrosDe(f.escuela_id) } : {}) });
  }
  return out;
}

async function miembroDe(escuelaId, miembroId) {
  return uno(`SELECT m.*, d.email FROM equipo_miembros m JOIN docentes d ON d.id = m.docente_id WHERE m.id = $1 AND m.escuela_id = $2`,
    [Number(miembroId) || 0, Number(escuelaId) || 0]);
}

// Borra el historial de chat del integrante sobre los alumnos de ese espacio (al salir del equipo).
async function borrarChatDelMiembro(docenteId, escuelaId) {
  await q(`DELETE FROM chat_turnos WHERE usuario_tipo = 'docente' AND usuario_id = $1 AND alumno_id IN (SELECT id FROM alumnos WHERE escuela_id = $2)`,
    [Number(docenteId), Number(escuelaId)]);
}

// La familia aprueba, rechaza o saca a un integrante. accion: 'aprobar' | 'rechazar' | 'quitar'. fam: { id } de la familia,
// ya verificada como familia del alumno del espacio (lo hace quien llama). Queda en la auditoría.
async function resolverMiembro(req, fam, escuelaId, miembroId, accion) {
  const m = await miembroDe(escuelaId, miembroId);
  if (!m) throw errorPublico("No encontramos a esa persona en el equipo", 404);
  const desde = { aprobar: ["pendiente"], rechazar: ["pendiente"], quitar: ["pendiente", "aprobado"] }[accion];
  if (!desde) throw errorPublico("Acción desconocida");
  if (!desde.includes(m.estado)) throw errorPublico(accion === "quitar" ? "Esa persona ya no está en el equipo." : "Esa persona ya no está esperando aprobación.", 409);
  const estado = { aprobar: "aprobado", rechazar: "rechazado", quitar: "baja" }[accion];
  const r = await uno(`UPDATE equipo_miembros SET estado = $3, resuelto = now(), resuelto_por_tipo = 'familia', resuelto_por = $4, motivo = $5
    WHERE id = $1 AND escuela_id = $2 AND estado = ANY($6::text[]) RETURNING id`,
    [m.id, escuelaId, estado, fam.id, accion === "quitar" ? "la familia lo sacó" : "", desde]);
  if (!r) throw errorPublico("Esa persona cambió de estado mientras tanto. Recargá la página.", 409);
  if (estado === "baja") await borrarChatDelMiembro(m.docente_id, escuelaId);
  const evento = { aprobar: "miembro_aprobado", rechazar: "miembro_rechazado", quitar: "miembro_baja" }[accion];
  await auditoria().registrar(req, { evento, actor_tipo: "familia", actor_id: fam.id, escuela_id: escuelaId, objeto_tipo: "miembro", objeto_id: m.id,
    detalle: { docente_id: Number(m.docente_id), ...(accion === "quitar" ? { por: "la familia", estaba: m.estado } : {}) } });
  return estado;
}

// El/la profesional se va del equipo por su cuenta.
async function salirDelEquipo(req, yo, escuelaId) {
  const r = await uno(`UPDATE equipo_miembros SET estado = 'baja', resuelto = now(), resuelto_por_tipo = 'docente', resuelto_por = $2, motivo = 'se fue'
    WHERE escuela_id = $1 AND docente_id = $2 AND estado = ANY($3::text[]) RETURNING id, estado`, [Number(escuelaId) || 0, yo.id, ESTADOS_VIVOS]);
  if (!r) throw errorPublico("No estás en ese equipo", 404);
  await borrarChatDelMiembro(yo.id, escuelaId);
  await auditoria().registrar(req, { evento: "miembro_baja", actor_tipo: "docente", actor_id: yo.id, escuela_id: Number(escuelaId), objeto_tipo: "miembro",
    objeto_id: r.id, detalle: { docente_id: Number(yo.id), por: "el/la profesional" } });
}

// Compromiso de confidencialidad (texto en _lib/legal.js, BORRADOR pendiente de revisión legal). Se guarda la fecha y la versión.
async function aceptarConfidencialidad(req, yo, escuelaId, acepto) {
  if (acepto !== true) throw errorPublico("Para entrar al equipo tenés que aceptar el compromiso de confidencialidad.");
  const { VERSION_CONFIDENCIALIDAD_EQUIPO } = require("./legal");
  const r = await uno(`UPDATE equipo_miembros SET confidencialidad = now(), confidencialidad_version = $3
    WHERE escuela_id = $1 AND docente_id = $2 AND estado = ANY($4::text[]) RETURNING id`, [Number(escuelaId) || 0, yo.id, VERSION_CONFIDENCIALIDAD_EQUIPO, ESTADOS_VIVOS]);
  if (!r) throw errorPublico("No estás en ese equipo", 404);
  await auditoria().registrar(req, { evento: "confidencialidad_aceptada", actor_tipo: "docente", actor_id: yo.id, escuela_id: Number(escuelaId),
    objeto_tipo: "miembro", objeto_id: r.id, detalle: { version: VERSION_CONFIDENCIALIDAD_EQUIPO } });
}

// Fin del equipo de un espacio (la última familia se dio de baja, o se borró al chico): todos los integrantes vivos pasan a
// 'baja', se anulan los links pendientes y cada baja queda en la auditoría. Devuelve cuántos integrantes se dieron de baja.
async function cerrarEquipo(req, escuelaId, { actor_tipo = null, actor_id = null, motivo = "" } = {}) {
  const vivos = await q(`UPDATE equipo_miembros SET estado = 'baja', resuelto = now(), resuelto_por_tipo = $2, resuelto_por = $3, motivo = $4
    WHERE escuela_id = $1 AND estado = ANY($5::text[]) RETURNING id, docente_id`, [Number(escuelaId), actor_tipo, actor_id, motivo, ESTADOS_VIVOS]);
  await q("UPDATE enlaces SET revocado = now() WHERE escuela_id = $1 AND revocado IS NULL AND usos < usos_max", [Number(escuelaId)]);
  for (const m of vivos) {
    await borrarChatDelMiembro(m.docente_id, escuelaId);
    await auditoria().registrar(req, { evento: "miembro_baja", actor_tipo, actor_id, escuela_id: Number(escuelaId), objeto_tipo: "miembro", objeto_id: m.id,
      detalle: { docente_id: Number(m.docente_id), por: motivo || "cierre del equipo" } });
  }
  return vivos.length;
}

module.exports = { condVisible, alumnoConAcceso, exigirVisible, faltaConsentimiento, exigirConsentimiento, FALTA_CONSENTIMIENTO, sqlConsentimiento, puedeVer, visiblePorNombre, exigirVisiblePorNombre, asignadas, asignar, cambiarAsignacion,
  sqlMiembroConAcceso, sqlEnEquipoVivo, ROLES_EQUIPO, ESTADOS_VIVOS, txtRol, NO_ES_EQUIPO, LO_DECIDE_LA_FAMILIA,
  espacioDeAlumno, esEquipo, exigirNoEquipo, alumnoDelEspacio, miembroConAcceso, miembrosDe, misEquipos, resolverMiembro, salirDelEquipo,
  aceptarConfidencialidad, cerrarEquipo };

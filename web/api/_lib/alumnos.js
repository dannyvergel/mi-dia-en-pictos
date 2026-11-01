// Qué alumnos ve cada docente.
// - Admin de la escuela: todos los alumnos de su escuela.
// - Docente (no admin): solo los alumnos que tiene asignados (tabla alumno_docentes).
// Siempre dentro de su propia escuela. Todas las APIs que tocan un alumno pasan por acá.
const { q, uno } = require("./db");
const { errorPublico } = require("./http");

// Condición SQL sobre el alias `a` (alumnos). n = número del primer parámetro. Devuelve [sql, params].
function condVisible(yo, n = 1, alias = "a") {
  return [`${alias}.escuela_id = $${n} AND ($${n + 1}::boolean OR EXISTS (SELECT 1 FROM alumno_docentes ad WHERE ad.alumno_id = ${alias}.id AND ad.docente_id = $${n + 2}))`,
    [yo.escuela_id, !!yo.es_admin, yo.id]];
}

async function puedeVer(yo, alumnoId) {
  const [c, p] = condVisible(yo, 2);
  return !!(await uno(`SELECT 1 AS x FROM alumnos a WHERE a.id = $1 AND ${c}`, [Number(alumnoId) || 0, ...p]));
}

// Por nombre (el Cuaderno del día y el agente mandan el nombre del alumno). null si no lo ve.
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

module.exports = { condVisible, puedeVer, visiblePorNombre, exigirVisiblePorNombre, asignadas, asignar, cambiarAsignacion };

// Piloto cerrado: solo con link de invitación y con un tope de cuentas (cupos).
//  · PILOTO_SOLO_INVITACION: "1" (por defecto cuando hay base) oculta y bloquea el "Solicitar acceso" abierto.
//    "0" lo vuelve a abrir. El alta de la primera cuenta (setup) funciona igual.
//  · PILOTO_MAX_USUARIOS: tope de cuentas activas (por defecto 15). "0" = sin tope.
//    Cuentan: docentes activas (incluye directivos / admins de escuela) de escuelas activas, integrantes pendientes o
//    aprobados de equipos activos (cada persona una sola vez, aunque esté en varios equipos) y familias vinculadas a algún
//    alumno de una escuela activa. No cuenta la cuenta de la plataforma (ADMIN_EMAIL); si ADMIN_EMAIL no está definida,
//    no cuentan las cuentas de plataforma. Dar de baja (o desactivar) una cuenta libera su cupo.
const { uno } = require("./db");
const S = require("./seguridad");
const { errorPublico } = require("./http");

function soloInvitacion() {
  const v = String(process.env.PILOTO_SOLO_INVITACION ?? "").trim().toLowerCase();
  if (["0", "no", "false", "off"].includes(v)) return false;
  if (["1", "si", "sí", "true", "on"].includes(v)) return true;
  return require("./db").dbActiva(); // por defecto: activo con base de datos
}

function maxUsuarios() {
  const v = String(process.env.PILOTO_MAX_USUARIOS ?? "").trim();
  if (v === "") return 15;
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 ? n : 15;
}

// SQL que cuenta los cupos usados. p = índice del parámetro con el email de ADMIN_EMAIL ('' si no hay).
function sqlUsados(p) {
  // Una persona = un cupo: docente activa de escuela activa O integrante (pendiente o aprobado) de un equipo activo.
  const { sqlEnEquipoVivo } = require("./alumnos");
  return `((SELECT count(*) FROM docentes d LEFT JOIN escuelas e ON e.id = d.escuela_id
      WHERE d.activo AND (coalesce(e.activa, false) OR ${sqlEnEquipoVivo("d.id")})
        AND (CASE WHEN $${p}::text = '' THEN NOT d.es_plataforma ELSE d.email <> $${p}::text END))
    + (SELECT count(*) FROM familias f WHERE EXISTS (SELECT 1 FROM familia_alumno fa JOIN alumnos a ON a.id = fa.alumno_id
      JOIN escuelas e ON e.id = a.escuela_id WHERE fa.familia_id = f.id AND e.activa)))::int`;
}
const paramAdmin = () => S.emailPlataforma() || "";

async function usados() { return (await uno(`SELECT ${sqlUsados(1)} AS n`, [paramAdmin()])).n; }

async function cupos() {
  const max = maxUsuarios(), u = await usados();
  return { usados: u, max, libres: max ? Math.max(0, max - u) : null, completo: !!max && u >= max, sin_tope: !max };
}

const textoCompleto = c => `El piloto está completo: ${c.usados} de ${c.max} cupos usados. Para sumar a alguien hay que dar de baja otra cuenta.`;

// Corta (409) si sumar `nuevas` cuentas pasa el tope. Devuelve el estado de los cupos.
async function exigirCupo(nuevas = 1) {
  const c = await cupos();
  if (c.sin_tope || nuevas <= 0) return c;
  if (c.usados + nuevas > c.max) {
    const msg = c.usados >= c.max ? textoCompleto(c)
      : `El piloto está casi completo: quedan ${c.max - c.usados} de ${c.max} cupos y esto suma ${nuevas} cuentas nuevas.`;
    throw Object.assign(errorPublico(msg, 409), { completo: true });
  }
  return c;
}

// Emails que hoy NO ocupan cupo como familia (no existen o no están vinculados a ningún alumno de una escuela activa).
async function familiasNuevas(emails) {
  const lista = [...new Set((emails || []).map(S.normEmail).filter(Boolean))];
  if (!lista.length) return [];
  const r = await require("./db").q(`SELECT f.email FROM familias f WHERE f.email = ANY($1::text[]) AND EXISTS (SELECT 1 FROM familia_alumno fa
    JOIN alumnos a ON a.id = fa.alumno_id JOIN escuelas e ON e.id = a.escuela_id WHERE fa.familia_id = f.id AND e.activa)`, [lista]);
  const ya = new Set(r.map(x => x.email));
  return lista.filter(e => !ya.has(e));
}

module.exports = { soloInvitacion, maxUsuarios, sqlUsados, paramAdmin, usados, cupos, exigirCupo, textoCompleto, familiasNuevas };

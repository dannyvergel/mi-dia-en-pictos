// Invitaciones por mail a las familias que la docente suma en "Contactos" de la ficha.
// Una por email + alumno cada 24 h como mucho (tabla invitaciones). Si el mail falla, se libera para poder reenviar.
const { q, uno } = require("./db");
const avisos = require("./avisos");

const HORAS = 24;

// Reserva el envío (atómico entre instancias). Devuelve la fecha anterior ({ antes }) o null si ya se mandó hace menos de 24 h.
async function reservar(alumnoId, email, docenteId) {
  const prev = await uno("SELECT enviado FROM invitaciones WHERE alumno_id = $1 AND email = $2", [alumnoId, email]);
  const r = await uno(`INSERT INTO invitaciones (alumno_id, email, enviado_por) VALUES ($1, $2, $3)
    ON CONFLICT (alumno_id, email) DO UPDATE SET enviado = now(), enviado_por = EXCLUDED.enviado_por
    WHERE invitaciones.enviado < now() - ($4 || ' hours')::interval RETURNING enviado`, [alumnoId, email, docenteId, String(HORAS)]);
  return r ? { antes: prev?.enviado || null } : null;
}
async function liberar(alumnoId, email, antes) {
  if (antes) await q("UPDATE invitaciones SET enviado = $3 WHERE alumno_id = $1 AND email = $2", [alumnoId, email, antes]);
  else await q("DELETE FROM invitaciones WHERE alumno_id = $1 AND email = $2", [alumnoId, email]);
}

// Manda una invitación. Devuelve "enviada" | "reciente" (ya se mandó hace < 24 h) | "fallo". Nunca lanza.
async function invitar(req, { alumno, email, docente, contacto }) {
  try {
    const res = await reservar(alumno.id, email, docente.id);
    if (!res) return "reciente";
    const ok = await avisos.invitacionFamilia(req, { email, alumno: alumno.nombre, docente: docente.nombre, contacto });
    if (!ok) { await liberar(alumno.id, email, res.antes); return "fallo"; }
    return "enviada";
  } catch (e) {
    console.error("[puente] invitación a familia falló:", e.message);
    return "fallo";
  }
}

// Emails nuevos en los contactos (no estaban antes) → invitación. Devuelve { enviadas, recientes, fallidas } con emails.
async function invitarNuevos(req, { alumno, antes = [], despues = [], docente }) {
  const viejos = new Set(antes.map(c => c.email).filter(Boolean));
  const out = { enviadas: [], recientes: [], fallidas: [] };
  for (const c of despues) {
    if (!c.email || viejos.has(c.email)) continue;
    const r = await invitar(req, { alumno, email: c.email, docente, contacto: c.nombre });
    out[r === "enviada" ? "enviadas" : r === "reciente" ? "recientes" : "fallidas"].push(c.email);
  }
  return out;
}

// { email: fecha del último envío } de un alumno.
async function enviadas(alumnoIds) {
  if (!alumnoIds.length) return {};
  const filas = await q("SELECT alumno_id, email, enviado FROM invitaciones WHERE alumno_id = ANY($1::bigint[])", [alumnoIds.map(Number)]);
  const out = {};
  for (const f of filas) (out[Number(f.alumno_id)] ||= {})[f.email] = f.enviado;
  return out;
}

module.exports = { invitar, invitarNuevos, enviadas, HORAS };

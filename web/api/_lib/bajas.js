// Baja y borrado de datos (Ley 25.326: derecho de supresión).
//  · Baja de un alumno (admin de su escuela o plataforma): ficha, asignaciones, invitaciones, historial de chat,
//    vínculos con familias, las familias que no tengan otro alumno (con sus sesiones y códigos), los días en Blob
//    y sus informes y documentos (las filas y los archivos en Blob).
//  · Baja de una familia (la propia familia, o una admin para los alumnos de su escuela): su contacto en las fichas,
//    su historial de chat, sus vínculos, sesiones, códigos e invitaciones; la cuenta se borra si no le queda otro alumno.
// Cada baja queda en la auditoría: quién (tipo + id), cuándo y cuánto se borró. Nunca nombres ni emails.
const { q, uno, transaccion } = require("./db");
const { borrarFamilia: borrarBlob, borrarArchivo } = require("./almacen");
const auditoria = require("./auditoria");
const { hoyLocal } = require("./http");

const n = rows => (rows || []).length;

// Borra cuentas de familia que quedaron sin alumnos, con todo lo suyo. Devuelve cuántas borró.
async function borrarFamiliasHuerfanas(ids, { invitaciones = true } = {}) {
  ids = [...new Set((ids || []).map(Number))].filter(Boolean);
  if (!ids.length) return 0;
  const huerfanas = await q(`SELECT id, email FROM familias f WHERE f.id = ANY($1::bigint[])
    AND NOT EXISTS (SELECT 1 FROM familia_alumno fa WHERE fa.familia_id = f.id)`, [ids]);
  if (!huerfanas.length) return 0;
  const hid = huerfanas.map(f => Number(f.id)), emails = huerfanas.map(f => f.email);
  await transaccion([
    ["DELETE FROM chat_turnos WHERE usuario_tipo = 'familia' AND usuario_id = ANY($1::bigint[])", [hid]],
    ["DELETE FROM sesiones WHERE tipo = 'familia' AND usuario_id = ANY($1::bigint[])", [hid]],
    ["DELETE FROM codigos WHERE tipo = 'familia' AND email = ANY($1::text[])", [emails]],
    // Al sacar un email de la ficha se conserva la marca de invitación (evita reenviar antes de 24 h); en una baja se borra.
    ...(invitaciones ? [["DELETE FROM invitaciones WHERE email = ANY($1::text[])", [emails]]] : []),
    ["DELETE FROM limites WHERE clave = ANY($1::text[])", [emails.map(e => "codigo:email:" + e)]],
    ["DELETE FROM familias WHERE id = ANY($1::bigint[])", [hid]]
  ]);
  return hid.length;
}

// yo: docente con sesión (ya verificado que puede borrar este alumno). Devuelve el resumen (sin datos personales).
async function bajaAlumno(req, yo, alumnoId) {
  const a = await uno("SELECT id, escuela_id, blob_token FROM alumnos WHERE id = $1", [Number(alumnoId) || 0]);
  if (!a) return null;
  const familias = (await q("SELECT familia_id FROM familia_alumno WHERE alumno_id = $1", [a.id])).map(f => Number(f.familia_id));
  const turnos = await uno("SELECT count(*)::int AS n FROM chat_turnos WHERE alumno_id = $1", [a.id]);
  // Informes y documentos: se leen las rutas antes de borrar las filas, para después borrar los archivos del Blob.
  const rutas = (await q("SELECT blob_ruta FROM documentos WHERE alumno_id = $1", [a.id])).map(r => r.blob_ruta);
  // Todo lo que cuelga del alumno en la base, en una transacción (además de los ON DELETE CASCADE, explícito por las dudas).
  await transaccion([
    ["DELETE FROM chat_turnos WHERE alumno_id = $1", [a.id]],
    ["DELETE FROM invitaciones WHERE alumno_id = $1", [a.id]],
    ["DELETE FROM alumno_docentes WHERE alumno_id = $1", [a.id]],
    ["DELETE FROM familia_alumno WHERE alumno_id = $1", [a.id]],
    ["DELETE FROM enlaces WHERE alumno_id = $1", [a.id]], // links de invitación de su familia
    ["DELETE FROM documentos WHERE alumno_id = $1", [a.id]], // informes y documentos (los archivos, abajo)
    ["DELETE FROM fichas WHERE alumno_id = $1", [a.id]],
    ["DELETE FROM alumnos WHERE id = $1", [a.id]]
  ]);
  const familias_borradas = await borrarFamiliasHuerfanas(familias);
  const dias_borrados = await borrarBlob(a.blob_token); // también sus días publicados
  let documentos_borrados = true;
  for (const r of rutas) if (!(await borrarArchivo(r))) documentos_borrados = false;
  // blob_borrado: true solo si se borró todo lo que había en Blob (días y documentos).
  const blob_borrado = dias_borrados && documentos_borrados;
  const resumen = { familias_desvinculadas: familias.length, familias_borradas, turnos_chat: turnos?.n || 0, dias_publicados: !!a.blob_token,
    documentos: rutas.length, blob_borrado };
  await auditoria.registrar(req, { evento: "baja_alumno", actor_tipo: "docente", actor_id: yo.id, escuela_id: a.escuela_id,
    objeto_tipo: "alumno", objeto_id: a.id, detalle: resumen });
  if (!dias_borrados) console.error(`[puente] baja alumno #${a.id}: los días en Blob no se pudieron borrar; reintentar a mano`);
  if (!documentos_borrados) console.error(`[puente] baja alumno #${a.id}: algunos documentos no se pudieron borrar del Blob (documentos/${a.id}/); reintentar a mano`);
  return resumen;
}

// Baja de una familia. alumnoIds = null → de todos sus alumnos (la familia pide su baja);
// si no, solo de esos alumnos (una admin de escuela, para los alumnos de su escuela).
async function bajaFamilia(req, actorSesion, familiaId, alumnoIds = null) {
  const f = await uno("SELECT id, email FROM familias WHERE id = $1", [Number(familiaId) || 0]);
  if (!f) return null;
  const vinculos = (await q("SELECT alumno_id FROM familia_alumno WHERE familia_id = $1", [f.id])).map(r => Number(r.alumno_id));
  const alcance = alumnoIds ? vinculos.filter(id => alumnoIds.map(Number).includes(id)) : vinculos;
  const hoy = hoyLocal();
  let contactos_quitados = 0, consentimientos_retirados = 0;
  for (const alumnoId of alcance) {
    const ficha = await uno("SELECT contactos, consentimiento, actualizado_por FROM fichas WHERE alumno_id = $1", [alumnoId]);
    if (!ficha) continue;
    const contactos = (ficha.contactos || []).filter(c => c.email !== f.email);
    contactos_quitados += (ficha.contactos || []).length - contactos.length;
    let cons = ficha.consentimiento || { dado: false };
    const deEsta = String(cons.quien || "").includes(f.email) || cons.quien_retiro === f.email;
    if (deEsta) { cons = { dado: false, retirado: hoy, motivo: "baja de la familia" }; consentimientos_retirados++; }
    await q(`UPDATE fichas SET contactos = $1::jsonb, consentimiento = $2::jsonb, actualizado = now(),
      actualizado_por = CASE WHEN actualizado_por = $3 THEN 'baja' ELSE actualizado_por END WHERE alumno_id = $4`,
      [JSON.stringify(contactos), JSON.stringify(cons), f.email, alumnoId]);
  }
  const turnos = alcance.length ? await q("DELETE FROM chat_turnos WHERE usuario_tipo = 'familia' AND usuario_id = $1 AND alumno_id = ANY($2::bigint[]) RETURNING 1 AS x", [f.id, alcance]) : [];
  if (alcance.length) {
    await q("DELETE FROM invitaciones WHERE email = $1 AND alumno_id = ANY($2::bigint[])", [f.email, alcance]);
    await q("DELETE FROM familia_alumno WHERE familia_id = $1 AND alumno_id = ANY($2::bigint[])", [f.id, alcance]);
  }
  const cuenta_borrada = (await borrarFamiliasHuerfanas([f.id])) > 0;
  const resumen = { alumnos: alcance.length, contactos_quitados, consentimientos_retirados, turnos_chat: n(turnos), cuenta_borrada };
  const a = auditoria.actor(actorSesion);
  await auditoria.registrar(req, { evento: "baja_familia", ...a, objeto_tipo: "familia", objeto_id: f.id,
    detalle: { ...resumen, por: actorSesion.tipo === "familia" ? "la familia" : "la escuela" } });
  return resumen;
}

module.exports = { bajaAlumno, bajaFamilia, borrarFamiliasHuerfanas };

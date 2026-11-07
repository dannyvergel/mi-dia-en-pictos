// Plazos de retención (configurables por variable de entorno) y limpieza.
// La limpieza corre "perezosa" (de vez en cuando, en pedidos normales) y también con el cron diario /api/limpieza.
// Nunca borra fichas solas: las fichas sin actividad se informan para que la escuela decida la baja.
const { q, uno } = require("./db");
const almacen = require("./almacen");

// Informes y documentos: 5 años (1825 días) sin actividad del alumno. Actividad = lo más reciente entre el alta del alumno, los
// cambios de su ficha, su última publicación y el último documento subido. La baja del alumno los borra antes (_lib/bajas.js).
// Es un default conservador (los informes clínicos y escolares suelen guardarse varios años); se cambia con DOCUMENTOS_RETENCION_DIAS.
const DOCUMENTOS_RETENCION_DIAS = 1825;
// Archivos del Blob que no se pudieron borrar: la limpieza diaria los reintenta hasta este número de intentos y después avisa en el log.
const HUERFANOS_MAX_INTENTOS = 10;
const HUERFANOS_LOTE = 100, DOCUMENTOS_LOTE = 200;

const entero = (v, def, min = 1, max = 3650) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};

// Días. Defaults pensados para un piloto escolar.
function plazos() {
  return {
    chat: entero(process.env.CHAT_RETENCION_DIAS, 30),                 // historial del chat de la familia
    dias_publicados: entero(process.env.DIAS_PUBLICADOS_RETENCION, 365), // días que ve la familia (Blob)
    fichas_inactivas: entero(process.env.FICHAS_RETENCION_DIAS, 730),  // ficha sin cambios ni publicaciones: se informa
    auditoria: entero(process.env.AUDITORIA_RETENCION_DIAS, 365),     // registro de accesos
    feedback: entero(process.env.FEEDBACK_RETENCION_DIAS, 365),       // comentarios de docentes y familias
    metricas: entero(process.env.METRICAS_RETENCION_DIAS, 400),       // contadores de uso del piloto (sin datos de personas)
    documentos: entero(process.env.DOCUMENTOS_RETENCION_DIAS, DOCUMENTOS_RETENCION_DIAS) // informes y documentos: sin actividad del alumno
  };
}

// Fecha AAAA-MM-DD límite para los días publicados.
function limiteDias(ahora = new Date()) {
  return new Date(ahora.getTime() - plazos().dias_publicados * 864e5).toISOString().slice(0, 10);
}
// Saca los días más viejos que el plazo (se aplica al publicar y al leer el espacio de la familia).
function filtrarDiasVigentes(registros = [], ahora = new Date()) {
  const lim = limiteDias(ahora);
  return (registros || []).filter(r => r && String(r.fecha || "") >= lim);
}

// Reintenta borrar del Blob los archivos anotados en blobs_huerfanos. Si anda, saca el registro; si no, suma un intento y, al llegar
// al tope, deja un error en el log (y no se reintenta más: queda el registro para resolverlo a mano).
async function barrerHuerfanos() {
  const filas = await q("SELECT id, ruta, intentos FROM blobs_huerfanos WHERE intentos < $1 ORDER BY created_at, id LIMIT $2", [HUERFANOS_MAX_INTENTOS, HUERFANOS_LOTE]);
  const out = { reintentados: filas.length, borrados: 0, fallidos: 0, excedidos: 0 };
  for (const f of filas) {
    const r = await almacen.intentarBorrarArchivo(f.ruta);
    if (r.ok) { await q("DELETE FROM blobs_huerfanos WHERE id = $1", [f.id]); out.borrados++; continue; }
    out.fallidos++;
    await q("UPDATE blobs_huerfanos SET intentos = intentos + 1, ultimo_error = $2, ultimo_intento = now() WHERE id = $1", [f.id, r.error || ""]);
    if (Number(f.intentos) + 1 >= HUERFANOS_MAX_INTENTOS) {
      out.excedidos++;
      console.error(`[puente] archivo huérfano sin poder borrar tras ${HUERFANOS_MAX_INTENTOS} reintentos: ${f.ruta}; borrarlo a mano del Blob y sacar la fila de blobs_huerfanos`);
    }
  }
  return out;
}

// Borra los documentos de los alumnos sin actividad en el plazo (DOCUMENTOS_RETENCION_DIAS). Mismo camino seguro que borrar a mano:
// el archivo por almacen.borrarArchivo (si falla queda como huérfano) y después la fila.
async function borrarDocumentosVencidos() {
  const filas = await q(`SELECT d.id, d.blob_ruta FROM documentos d JOIN alumnos a ON a.id = d.alumno_id
    LEFT JOIN fichas f ON f.alumno_id = a.id
    WHERE greatest(a.creado, coalesce(f.actualizado, a.creado), coalesce(a.publicado, a.creado),
      (SELECT max(x.creado) FROM documentos x WHERE x.alumno_id = d.alumno_id)) < now() - ($1 || ' days')::interval
    ORDER BY d.id LIMIT $2`, [String(plazos().documentos), DOCUMENTOS_LOTE]);
  for (const d of filas) {
    await almacen.borrarArchivo(d.blob_ruta);
    await q("DELETE FROM documentos WHERE id = $1", [d.id]);
  }
  return filas.length;
}

async function limpiar() {
  const p = plazos();
  const borrar = async (sql, params) => (await q(sql + " RETURNING 1 AS x", params)).length;
  const out = {
    chat_turnos: await borrar(`DELETE FROM chat_turnos WHERE creado < now() - ($1 || ' days')::interval`, [String(p.chat)]),
    auditoria: await borrar(`DELETE FROM auditoria WHERE creado < now() - ($1 || ' days')::interval`, [String(p.auditoria)]),
    feedback: await borrar(`DELETE FROM feedback WHERE creado < now() - ($1 || ' days')::interval`, [String(p.feedback)]),
    metricas_diarias: await borrar(`DELETE FROM metricas_diarias WHERE fecha < (now() - ($1 || ' days')::interval)::date`, [String(p.metricas)]),
    limites: await borrar(`DELETE FROM limites WHERE creado < now() - interval '2 days'`),
    sesiones: await borrar(`DELETE FROM sesiones WHERE expira < now()`),
    codigos: await borrar(`DELETE FROM codigos WHERE creado < now() - interval '1 day'`)
  };
  // Primero se reintentan los archivos huérfanos de antes y después se borran los documentos vencidos (los que fallen quedan para mañana).
  out.blobs_huerfanos = await barrerHuerfanos();
  out.documentos_vencidos = await borrarDocumentosVencidos();
  // Fichas sin actividad: solo se cuentan (la baja la decide la escuela desde el panel).
  const r = await uno(`SELECT count(*)::int AS n FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id
    WHERE greatest(a.creado, coalesce(f.actualizado, a.creado), coalesce(a.publicado, a.creado)) < now() - ($1 || ' days')::interval`, [String(p.fichas_inactivas)]);
  out.fichas_inactivas_para_revisar = r?.n || 0;
  return out;
}

// Limpieza perezosa: con probabilidad baja en pedidos normales, para no depender solo del cron.
async function quizasLimpiar(prob = 0.02) {
  if (Math.random() >= prob) return;
  try { await limpiar(); } catch (e) { console.error("[puente] limpieza falló:", e.message); }
}

module.exports = { DOCUMENTOS_RETENCION_DIAS, HUERFANOS_MAX_INTENTOS, barrerHuerfanos, borrarDocumentosVencidos, plazos, limiteDias, filtrarDiasVigentes, limpiar, quizasLimpiar };

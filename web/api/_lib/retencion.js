// Plazos de retención (configurables por variable de entorno) y limpieza.
// La limpieza corre "perezosa" (de vez en cuando, en pedidos normales) y también con el cron diario /api/limpieza.
// Nunca borra fichas solas: las fichas sin actividad se informan para que la escuela decida la baja.
const { q, uno } = require("./db");

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
    feedback: entero(process.env.FEEDBACK_RETENCION_DIAS, 365)        // comentarios de docentes y familias
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

async function limpiar() {
  const p = plazos();
  const borrar = async (sql, params) => (await q(sql + " RETURNING 1 AS x", params)).length;
  const out = {
    chat_turnos: await borrar(`DELETE FROM chat_turnos WHERE creado < now() - ($1 || ' days')::interval`, [String(p.chat)]),
    auditoria: await borrar(`DELETE FROM auditoria WHERE creado < now() - ($1 || ' days')::interval`, [String(p.auditoria)]),
    feedback: await borrar(`DELETE FROM feedback WHERE creado < now() - ($1 || ' days')::interval`, [String(p.feedback)]),
    limites: await borrar(`DELETE FROM limites WHERE creado < now() - interval '2 days'`),
    sesiones: await borrar(`DELETE FROM sesiones WHERE expira < now()`),
    codigos: await borrar(`DELETE FROM codigos WHERE creado < now() - interval '1 day'`)
  };
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

module.exports = { plazos, limiteDias, filtrarDiasVigentes, limpiar, quizasLimpiar };

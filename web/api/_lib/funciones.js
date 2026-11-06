// Qué ve la familia. Por defecto, solo lo mínimo: los pictos del día (palabra, hora, voz) y la agenda en pictos.
// El resto queda apagado y se prende a demanda con la variable FAMILIA_FUNCIONES (lista separada por comas):
//   texto     → resumen escrito del día, logros, alertas y mensaje de la escuela
//   objetivos → "En qué estamos trabajando" (objetivos del PPI)
//   chat      → "Preguntale a Puente"
//   ficha     → apoyos y objetivos del PPI dentro de "La ficha de…" (contactos y consentimiento se ven siempre)
//   todas     → todas las anteriores
// Sin base de datos (demo) se ven todas. Ver docs/funciones-familia.md.
const { dbActiva } = require("./db");
const TODAS = ["texto", "objetivos", "chat", "ficha"];

function funcionesFamilia() {
  if (!dbActiva()) return Object.fromEntries(TODAS.map(f => [f, true]));
  const v = String(process.env.FAMILIA_FUNCIONES || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const todas = v.includes("todas");
  return Object.fromEntries(TODAS.map(f => [f, todas || v.includes(f)]));
}

// Al publicar: si no hay texto ni chat, el texto de la seño no se guarda en lo que lee la familia.
function minimoParaPublicar(datos, fx = funcionesFamilia()) {
  if (fx.texto || fx.chat) return datos;
  const solo = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
  return {
    alumno: datos.alumno, actualizado: datos.actualizado,
    registros: (datos.registros || []).map(r => ({
      ...solo(r, ["alumno", "fecha", "animo_general"]),
      actividades: (r.actividades || []).map(a => solo(a, ["hora", "palabra_clave", "estado", "picto_url"]))
    })),
    ppi: fx.objetivos ? datos.ppi || [] : [],
    perfil: {},
    agenda: datos.agenda ? { ...solo(datos.agenda, ["dia"]), pasos: (datos.agenda.pasos || []).map(p => solo(p, ["hora", "palabra_clave", "es_apoyo", "picto_url"])) } : null,
    mensaje_docente: null
  };
}

module.exports = { funcionesFamilia, minimoParaPublicar, TODAS };

// Minimización de datos hacia la IA (OpenRouter y sus proveedores).
// Regla: a la IA va solo el nombre de pila del alumno y lo mínimo para la tarea. Nunca emails, teléfonos, contactos,
// apellidos de familiares, ni datos de salud de la ficha (alimentación, "otros apoyos", observaciones).
// Lo que escribe una persona (relato de la docente, pregunta de la familia) puede traer datos de contacto sin querer:
// se tapan con limpiarTexto() antes de mandarlo.

// Campos del perfil funcional que sí necesita la IA (para adaptar estrategias). Nada de salud ni contactos.
const PERFIL_IA = ["comunicacion", "sensibilidades", "lo_calma", "le_gusta"];
// Tipos de alerta del día que son datos de salud: no van al chat de la familia (se deriva a la docente).
const ALERTAS_SALUD = new Set(["salud", "medicacion"]);

const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Secuencias tipo teléfono / DNI / CUIL: 7 o más dígitos con espacios, puntos, guiones o paréntesis.
const RE_NUMERO = /\+?\d[\d\s().-]{5,}\d/g;
const ES_FECHA = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/;

function limpiarTexto(s, max = 4000) {
  return String(s ?? "")
    .replace(RE_EMAIL, "[email]")
    .replace(RE_NUMERO, m => {
      const t = m.trim();
      if (ES_FECHA.test(t)) return m;
      return (t.match(/\d/g) || []).length >= 7 ? "[número]" : m;
    })
    .slice(0, max);
}

function perfilParaIA(perfil = {}) {
  const out = {};
  for (const k of PERFIL_IA) {
    const v = limpiarTexto(perfil?.[k], 500).trim();
    if (v) out[k] = v;
  }
  return out;
}

function ppiParaIA(ppi = []) {
  return (Array.isArray(ppi) ? ppi : []).slice(0, 20).map(o => ({
    objetivo: limpiarTexto(o?.objetivo, 300),
    palabras: Array.isArray(o?.palabras) ? o.palabras.map(p => String(p).slice(0, 30)).slice(0, 20) : []
  })).filter(o => o.objetivo);
}

// Alertas para el chat: las de salud/medicación se reemplazan por un aviso sin detalle.
function alertasParaChat(alertas = []) {
  const out = [];
  let salud = false;
  for (const a of alertas || []) {
    if (ALERTAS_SALUD.has(String(a?.tipo || "").toLowerCase())) { salud = true; continue; }
    if (a?.detalle) out.push(limpiarTexto(a.detalle, 300));
  }
  if (salud) out.push("hay una nota de salud registrada (para eso, consultar a la docente)");
  return out;
}

module.exports = { PERFIL_IA, ALERTAS_SALUD, limpiarTexto, perfilParaIA, ppiParaIA, alertasParaChat };

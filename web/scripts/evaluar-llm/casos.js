// Loads the synthetic evaluation cases (docs/evaluacion-llm/casos/*.json). Refuses any file that does not declare itself synthetic.
const fs = require("fs");
const path = require("path");

const DIR_CASOS = path.resolve(__dirname, "../../../docs/evaluacion-llm/casos");

function leerArchivos(dir) {
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  if (!archivos.length) throw new Error(`No hay casos .json en ${dir}`);
  return archivos.map(f => {
    let o;
    try { o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { throw new Error(`${f}: JSON inválido (${e.message})`); }
    if (o.sintetico !== true) throw new Error(`${f}: falta "sintetico": true. Solo se evalúa con datos sintéticos, nunca con datos reales.`);
    if (!o.id || !o.tipo) throw new Error(`${f}: faltan id o tipo`);
    return o;
  });
}

// Returns [{...caso}] with chat cases enriched with their context (alumno, perfil, ppi, registros).
function cargarCasos(dir = DIR_CASOS) {
  const todos = leerArchivos(dir);
  const contextos = new Map(todos.filter(c => c.tipo === "contexto").map(c => [c.id, c]));
  const casos = todos.filter(c => c.tipo === "dia" || c.tipo === "chat").map(c => {
    if (c.tipo !== "chat") return c;
    const ctx = contextos.get(c.contexto);
    if (!ctx) throw new Error(`${c.id}: contexto "${c.contexto}" no existe`);
    return { ...c, alumno: ctx.alumno, contextoDatos: { alumno: ctx.alumno, perfil: ctx.perfil, ppi: ctx.ppi, registros: ctx.registros } };
  });
  if (!casos.length) throw new Error("No hay casos de tipo dia ni chat");
  return casos;
}

// Alternates day / chat cases so that a small --max-casos still covers both tasks.
function intercalar(casos) {
  const dia = casos.filter(c => c.tipo === "dia"), chat = casos.filter(c => c.tipo === "chat");
  const out = [];
  for (let i = 0; i < Math.max(dia.length, chat.length); i++) { if (dia[i]) out.push(dia[i]); if (chat[i]) out.push(chat[i]); }
  return out;
}

module.exports = { DIR_CASOS, cargarCasos, intercalar };

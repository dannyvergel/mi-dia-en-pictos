// Estructura el relato del día con IA (alternativa a n8n). Sin key responde 503 y la app usa modo demo.
const SISTEMA = "Sos un asistente para docentes de educación especial en Argentina.\nRecibís el relato informal del día de un alumno, dictado por su docente.\nDevolvé SOLO un JSON válido con esta forma:\n\n{\n  \"alumno\": \"nombre de pila\",\n  \"fecha\": \"YYYY-MM-DD\",\n  \"actividades\": [\n    {\"hora\": \"HH:MM o null\", \"actividad\": \"texto corto\", \"palabra_clave\": \"1 o 2 palabras simples para buscar pictograma\", \"estado\": \"bien|regular|dificil\"}\n  ],\n  \"animo_general\": \"contento|tranquilo|cansado|angustiado|irritable\",\n  \"logros\": [\"...\"],\n  \"alertas\": [{\"tipo\": \"conducta|salud|alimentacion|medicacion|otro\", \"detalle\": \"...\", \"nivel\": \"bajo|medio|alto\"}],\n  \"resumen_familia\": \"3 a 5 oraciones cálidas, claras y sin tecnicismos para la familia, en español rioplatense\",\n  \"registro_docente\": \"versión formal y objetiva para el legajo del alumno\"\n}\n\nReglas:\n- No inventes nada que no esté en el relato. Si falta un dato, usá null o lista vacía.\n- palabra_clave siempre en español, sustantivo o verbo simple (ej: \"desayunar\", \"música\", \"recreo\", \"pintar\").\n- Ordená las actividades cronológicamente.\n- No incluyas diagnósticos médicos.\n- No incluyas emails, teléfonos, apellidos ni datos de contacto.";
const { PRINCIPAL: MODEL, cuerpo, cabeceras } = require("./_lib/modelos");
async function picto(kw) {
  try {
    const j = await (await fetch("https://api.arasaac.org/api/pictograms/es/search/" + encodeURIComponent((kw || "").toLowerCase()))).json();
    const id = Array.isArray(j) && j.length ? j[0]._id : null;
    return { picto_id: id, picto_url: id ? `https://static.arasaac.org/pictograms/${id}/${id}_500.png` : null };
  } catch { return { picto_id: null, picto_url: null }; }
}
const { exigirDocente } = require("./_lib/auth");
const { exigirVisiblePorNombre } = require("./_lib/alumnos");
const { manejarError, hoyLocal } = require("./_lib/http");
const { limpiarTexto } = require("./_lib/minimizar");
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Docente-Pin");
  if (req.method === "OPTIONS") return res.status(204).end();
  let b, nombre;
  try {
    const yo = await exigirDocente(req, res);
    if (!yo) return;
    b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    // Con cuentas: solo alumnos que la docente puede ver (admin: su escuela; si no, sus asignados).
    const a = await exigirVisiblePorNombre(yo, b.alumno);
    nombre = a?.nombre || String(b.alumno || "").slice(0, 40);
  } catch (e) { return manejarError(res, e); }
  if (!require("./_lib/pin").iaActiva()) return res.status(503).json({ error: "sin key" });
  const fecha = b.fecha || hoyLocal();
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: cabeceras(),
      body: JSON.stringify(cuerpo("dia", { temperature: 0.2, response_format: { type: "json_object" }, messages: [
        { role: "system", content: SISTEMA },
        // Minimización: solo el nombre de pila y el relato, con emails y teléfonos tapados.
        { role: "user", content: `Alumno: ${limpiarTexto(nombre, 40)}\nFecha: ${fecha}\nRelato: ${limpiarTexto(b.texto, 6000)}` }] }))
    });
    if (!r.ok) throw new Error("OpenRouter " + r.status);
    const raw = (await r.json()).choices[0].message.content;
    const d = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
    d.alumno = b.alumno || d.alumno; d.fecha = fecha;
    for (const a of d.actividades || []) Object.assign(a, await picto(a.palabra_clave || a.actividad));
    const al = (d.alertas || []).map(x => "⚠️ " + x.detalle).join("\n");
    d.mensaje_familia = `Hola! Así fue el día de ${d.alumno} 🌈\n\n${d.resumen_familia}` + (al ? "\n\n" + al : "") + (d.logros?.length ? "\n\n⭐ Logros: " + d.logros.join(", ") : "");
    res.status(200).json(d);
  } catch (e) { res.status(502).json({ error: e.message }); }
};

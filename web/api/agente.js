// Agente de Progreso: el LLM recibe herramientas, decide qué investigar
// y termina con un plan concreto. Sin API key corre un plan fijo (modo demo).
const { crearHerramientas } = require("./_lib/tools");
const { exigirDocente } = require("./_lib/auth");
const { manejarError } = require("./_lib/http");

const { PRINCIPAL: MODEL, cuerpo } = require("./_lib/modelos");
const MAX_PASOS = 8;

const SISTEMA = `Sos el Agente de Progreso de "Puente", para docentes de educación especial en Argentina.
Tu trabajo: leer el historial de un alumno, encontrar patrones que a ojo no se ven, medir el avance de su PPI y proponer qué cambiar, con evidencia.

Cómo trabajás:
1. Usá las herramientas para investigar. Empezá por leer_perfil, analizar_patrones y evaluar_ppi; usá leer_historial si necesitás detalle.
   Cruzá los patrones con el perfil (ej: si le molesta el ruido y los lunes falla en el recreo, decilo) y adaptá las estrategias a lo que lo calma y le gusta.
2. Para cada problema importante, usá buscar_estrategias. Solo podés recomendar estrategias que devuelva esa herramienta, con su fuente.
3. Armá la agenda visual del próximo día problemático con armar_agenda, agregando los apoyos de anticipación (marcá es_apoyo=true).
4. Terminá respondiendo SOLO un JSON:
{
 "titular": "una frase con el hallazgo más importante",
 "hallazgos": [{"texto": "...", "evidencia": "números concretos de las herramientas"}],
 "ppi": [{"objetivo": "...", "estado": "avanzando|estancado|en retroceso|logrado o casi logrado|estable|sin datos suficientes", "comentario": "..."}],
 "estrategias": [{"nombre": "...", "por_que": "ligado a un hallazgo", "como": "...", "fuente": "...", "url": "..."}],
 "mensaje_familia": "4 a 6 oraciones cálidas en rioplatense, sin tecnicismos ni diagnósticos, con una cosa que la familia puede hacer en casa",
 "nota_docente": "2 o 3 oraciones para el legajo"
}
Reglas: no inventes datos ni porcentajes, citá solo lo que devolvieron las herramientas. Nada de diagnósticos. Sos un apoyo: la docente decide.`;

function aTools(h) {
  return Object.entries(h).map(([name, t]) => ({ type: "function", function: { name, description: t.descripcion, parameters: t.parametros } }));
}
const resumir = (r) => { const s = JSON.stringify(r); return s.length > 220 ? s.slice(0, 217) + "…" : s; };

async function llm(messages, tools) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json", "HTTP-Referer": "https://puente-pictos.vercel.app", "X-Title": "Puente" },
    signal: AbortSignal.timeout(28000),
    body: JSON.stringify(cuerpo("agente", { temperature: 0.2, messages, ...(tools ? { tools, tool_choice: "auto" } : { response_format: { type: "json_object" } }) }))
  });
  if (!r.ok) throw new Error("OpenRouter " + r.status + ": " + (await r.text()).slice(0, 200));
  return (await r.json()).choices[0].message;
}

function parseJSON(s) {
  const m = (s || "").match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : s);
}

// --- Agente con LLM: bucle de herramientas ---
async function correrAgente(ctx, h, traza) {
  const messages = [
    { role: "system", content: SISTEMA },
    { role: "user", content: `Alumno: ${ctx.alumno}. Hoy es ${ctx.hoy}. Objetivos del PPI: ${ctx.ppi.map(o => o.objetivo).join(" | ")}. Analizá su progreso.` }
  ];
  const tools = aTools(h);
  const limite = Date.now() + 30000; // si se estira, cerramos con lo que haya
  for (let i = 0; i < MAX_PASOS && Date.now() < limite; i++) {
    const msg = await llm(messages, tools);
    messages.push(msg);
    if (!msg.tool_calls?.length) return parseJSON(msg.content);
    for (const tc of msg.tool_calls) {
      const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      const t = h[tc.function.name];
      const res = t ? await t.run(args) : { error: "herramienta desconocida" };
      traza.push({ herramienta: tc.function.name, args, resultado: resumir(res), pensamiento: msg.content || null });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(res) });
    }
  }
  messages.push({ role: "user", content: "Ya tenés suficiente. Respondé ahora SOLO el JSON final." });
  return parseJSON((await llm(messages)).content);
}

// --- Plan fijo: mismas herramientas, orden predefinido ---
async function planFijo(ctx, h, traza) {
  const paso = async (n, a = {}) => { const r = await h[n].run(a); traza.push({ herramienta: n, args: a, resultado: resumir(r) }); return r; };
  const perfil = await paso("leer_perfil");
  const pat = await paso("analizar_patrones");
  const ppi = await paso("evaluar_ppi");
  const diaMalo = Object.entries(pat.dias_dificiles_por_dia_semana).map(([d, v]) => [d, ...v.split("/").map(Number)]).sort((a, b) => b[1] / b[2] - a[1] / a[2])[0];
  const actMala = Object.entries(pat.dificultades_por_actividad).sort((a, b) => b[1] - a[1])[0];
  const est1 = await paso("buscar_estrategias", { problema: `${actMala?.[0] || ""} ${perfil.sensibilidades || ""} angustia transicion` });
  const calma = (perfil.lo_calma || "").split(",")[0].trim().toLowerCase();
  const sens = (perfil.sensibilidades || "").split(",")[0].trim().toLowerCase();
  const logro = ppi.find(o => /avanzando|logrado/.test(o.estado_calculado));
  const est2 = logro ? await paso("buscar_estrategias", { problema: "logro autonomia avance" }) : [];
  await paso("armar_agenda", { dia: diaMalo?.[0] || "lunes", pasos: AGENDA_BASE(actMala?.[0] || "recreo") });
  const estrategias = [...est1.slice(0, 2), ...est2.slice(0, 1)];
  return {
    titular: diaMalo ? `${ctx.alumno} tiene sus días más difíciles los ${diaMalo[0]} (${diaMalo[1]} de ${diaMalo[2]}), casi siempre en el ${actMala?.[0] || "mismo momento"}.` : `Sin patrones fuertes todavía para ${ctx.alumno}.`,
    hallazgos: [
      ...pat.patrones_detectados.map(p => ({ texto: p, evidencia: `${pat.dias_analizados} días analizados` })),
      ...(sens && actMala ? [{ texto: `Coincide con su perfil: le molesta ${sens}, y el ${actMala[0]} es el momento más ruidoso del día.`, evidencia: "Perfil funcional + patrones" }] : [])
    ],
    ppi: ppi.map(o => ({ objetivo: o.objetivo, estado: o.estado_calculado, comentario: Object.entries(o.evidencia_por_semana).map(([s, v]) => `${s}: ${v.a_favor}✓ ${v.en_contra}✗`).join(" · ") })),
    estrategias: estrategias.map(e => ({ nombre: e.nombre, por_que: e.practica_ebp + (calma && /antecedentes|anticipacion/.test(e.id) ? `. Usa lo que ya lo calma: ${calma}` : ""), como: e.como, fuente: e.fuente, url: e.url })),
    mensaje_familia: `Hola! Les cuento cómo vienen estas semanas de ${ctx.alumno} 🌈 Viene con muchos avances${logro ? ", sobre todo en " + logro.objetivo.toLowerCase() : ""}. Notamos que los ${diaMalo?.[0] || "lunes"} le cuesta más el ${actMala?.[0] || "recreo"}, así que vamos a anticiparle ese momento con pictogramas y sus auriculares. En casa ayuda mucho contarle el domingo a la noche cómo va a ser el día siguiente. ¡Gracias por acompañar!`,
    nota_docente: `Se analizaron ${pat.dias_analizados} registros. Se propone anticipación visual y ajuste de antecedentes para el ${actMala?.[0] || "recreo"} de los ${diaMalo?.[0] || "lunes"}. Revisar en dos semanas.`
  };
}
const AGENDA_BASE = (critica) => [
  { hora: "08:00", texto: "Llegar a la escuela", palabra_clave: "escuela" },
  { hora: "08:15", texto: "Leer la historia del recreo", palabra_clave: "cuento", es_apoyo: true },
  { hora: "08:30", texto: "Desayunar", palabra_clave: "desayunar" },
  { hora: "09:00", texto: "Música", palabra_clave: "música" },
  { hora: "10:55", texto: "Ponerse los auriculares", palabra_clave: "auriculares", es_apoyo: true },
  { hora: "11:00", texto: critica === "recreo" ? "Recreo largo" : critica, palabra_clave: critica },
  { hora: "11:20", texto: "Si me molesta, pido descanso", palabra_clave: "descansar", es_apoyo: true },
  { hora: "12:00", texto: "Almorzar", palabra_clave: "almorzar" },
  { hora: "14:00", texto: "Pintar", palabra_clave: "pintar" },
  { hora: "15:00", texto: "Saludar y volver a casa", palabra_clave: "saludar" }
];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Docente-Pin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Usá POST" });
  try { if (!(await exigirDocente(req, res))) return; } catch (e) { return manejarError(res, e); }
  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const ctx = { alumno: body.alumno, registros: body.registros || [], ppi: body.ppi || [], perfil: body.perfil || {}, hoy: new Date().toISOString().slice(0, 10) };
  if (!ctx.alumno || !ctx.registros.length) return res.status(400).json({ error: "Faltan alumno o registros" });

  const t0 = Date.now();
  let traza = [], resultado, modo;
  const h = crearHerramientas(ctx);
  try {
    if (!process.env.OPENROUTER_API_KEY) throw Object.assign(new Error("sin key"), { demo: true });
    resultado = await correrAgente(ctx, h, traza);
    modo = "ia";
    if (!ctx.agenda) { // el modelo no armó agenda: la completamos
      const r = await h.armar_agenda.run({ dia: "lunes", pasos: AGENDA_BASE("recreo") });
      traza.push({ herramienta: "armar_agenda", args: { dia: "lunes" }, resultado: resumir(r) });
    }
  } catch (e) {
    if (!e.demo) console.error("Agente IA falló, uso plan fijo:", e.message);
    traza = []; delete ctx.agenda;
    resultado = await planFijo(ctx, h, traza);
    modo = e.demo ? "demo" : "plan-fijo";
  }
  res.status(200).json({ modo, modelo: modo === "ia" ? MODEL : null, ms: Date.now() - t0, traza, agenda: ctx.agenda || null, resultado });
};

// Espacio de familias: cada alumno tiene un link privado (token largo al azar).
// La docente publica; la familia lee y puede preguntarle a Puente sobre su hijo.
const { put, get } = require("@vercel/blob");
const crypto = require("crypto");
const { crearHerramientas, diaSemana } = require("./_lib/tools");

const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
const ruta = t => `familias/${t}.json`;
const tokenOk = t => typeof t === "string" && /^[a-f0-9]{32}$/.test(t);

async function leer(t) {
  const r = await get(ruta(t), { access: "private", useCache: false });
  return r ? JSON.parse(await new Response(r.stream).text()) : null;
}

// Solo lo que la familia necesita ver (sin notas internas del legajo).
function vistaFamilia(d) {
  const regs = (d.registros || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const h = crearHerramientas({ alumno: d.alumno, registros: d.registros, ppi: d.ppi });
  const ppi = d.ppi?.length ? h.evaluar_ppi.run() : [];
  return {
    alumno: d.alumno, actualizado: d.actualizado, escuela: d.escuela || null,
    gustos: d.perfil?.le_gusta || null,
    dias: regs.slice(0, 10).map(r => ({
      fecha: r.fecha, dia: diaSemana(r.fecha), animo: r.animo_general,
      resumen: r.resumen_familia || null, logros: r.logros || [],
      alertas: (r.alertas || []).map(a => a.detalle),
      actividades: (r.actividades || []).map(a => ({ hora: a.hora, palabra_clave: a.palabra_clave, actividad: a.actividad, estado: a.estado, picto_url: a.picto_url }))
    })),
    objetivos: ppi.map(o => ({ objetivo: o.objetivo, estado: o.estado_calculado })),
    agenda: d.agenda || null,
    mensaje_docente: d.mensaje_docente || null
  };
}

function contextoChat(d) {
  return (d.registros || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(r =>
    `${r.fecha} (${diaSemana(r.fecha)}) · ánimo ${r.animo_general}\n` +
    (r.actividades || []).map(a => `  - ${a.hora || "?"} ${a.actividad} [${a.estado}]`).join("\n") +
    (r.logros?.length ? `\n  Logros: ${r.logros.join("; ")}` : "") +
    (r.alertas?.length ? `\n  Alertas: ${r.alertas.map(a => a.detalle).join("; ")}` : "")
  ).join("\n");
}

const SISTEMA_CHAT = (d) => `Sos Puente, el puente entre la escuela y la familia de ${d.alumno}. Respondés preguntas de su familia.
Reglas:
- Respondé SOLO con lo que está en los registros de abajo. Si no está, decí con calidez que no lo tenés registrado y sugerí preguntarle a la docente.
- Español rioplatense, cálido, simple, sin tecnicismos. Máximo 5 oraciones.
- Mencioná fechas o días concretos cuando ayuden ("el martes 27...").
- Nunca des diagnósticos ni consejos médicos. Si preguntan algo de salud, derivá a la docente o al profesional que lo atiende.
- Si sirve, terminá con una idea concreta para hacer en casa.
${d.perfil?.le_gusta ? `Le gusta: ${d.perfil.le_gusta}.` : ""}${d.perfil?.lo_calma ? ` Lo calma: ${d.perfil.lo_calma}.` : ""}

Registros de la escuela:
${contextoChat(d)}`;

async function preguntar(d, pregunta, historial = []) {
  if (!process.env.OPENROUTER_API_KEY) return { respuesta: "Ahora no puedo responder preguntas. Mientras tanto, podés ver sus días acá arriba o escribirle a la docente.", modo: "demo" };
  const messages = [{ role: "system", content: SISTEMA_CHAT(d) }, ...historial.slice(-6).map(m => ({ role: m.rol === "familia" ? "user" : "assistant", content: String(m.texto).slice(0, 800) })), { role: "user", content: pregunta.slice(0, 500) }];
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json", "HTTP-Referer": "https://puente-pictos.vercel.app", "X-Title": "Puente" },
    body: JSON.stringify({ model: MODEL, temperature: 0.3, messages })
  });
  if (!r.ok) throw new Error("OpenRouter " + r.status);
  return { respuesta: (await r.json()).choices[0].message.content.trim(), modo: "ia" };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "GET") {
      const t = req.query?.t || new URL(req.url, "http://x").searchParams.get("t");
      if (!tokenOk(t)) return res.status(400).json({ error: "Link inválido" });
      const d = await leer(t);
      return d ? res.status(200).json(vistaFamilia(d)) : res.status(404).json({ error: "No encontramos este espacio" });
    }
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    if (b.accion === "publicar") {
      if (!b.alumno || !Array.isArray(b.registros)) return res.status(400).json({ error: "Faltan datos" });
      const t = tokenOk(b.token) ? b.token : crypto.randomBytes(16).toString("hex");
      const datos = {
        alumno: b.alumno, actualizado: new Date().toISOString(),
        registros: b.registros.filter(r => r.alumno === b.alumno).slice(0, 60).map(({ registro_docente, ...r }) => r),
        ppi: b.ppi || [], perfil: { le_gusta: b.perfil?.le_gusta || "", lo_calma: b.perfil?.lo_calma || "" },
        agenda: b.agenda || null, mensaje_docente: b.mensaje_docente || null
      };
      await put(ruta(t), JSON.stringify(datos), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
      return res.status(200).json({ token: t, dias: datos.registros.length });
    }

    if (b.accion === "preguntar") {
      if (!tokenOk(b.token) || !b.pregunta) return res.status(400).json({ error: "Faltan datos" });
      const d = await leer(b.token);
      if (!d) return res.status(404).json({ error: "No encontramos este espacio" });
      return res.status(200).json(await preguntar(d, b.pregunta, b.historial));
    }
    res.status(400).json({ error: "Acción desconocida" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Algo falló, probá de nuevo en un rato." });
  }
};

// Espacio de familias.
// Modo demo (sin DATABASE_URL): cada alumno tiene un link privado (token largo al azar) y la docente publica con PIN.
// Con base de datos: la familia entra con su email (código) y ve solo sus alumnos vinculados;
// la docente publica con su sesión. Los días siguen guardados en Vercel Blob (uno por alumno).
const crypto = require("crypto");
const { crearHerramientas, diaSemana } = require("./_lib/tools");
const { PRINCIPAL: MODEL, cuerpo: cuerpoLLM } = require("./_lib/modelos");
const { exigirPin } = require("./_lib/pin");
const { dbActiva, q, uno } = require("./_lib/db");
const { leerSesion } = require("./_lib/seguridad");
const { exigirDocente } = require("./_lib/auth");
const { leerFamilia: leer, guardarFamilia } = require("./_lib/almacen");
const { objetivosAPpi, apoyosAPerfil } = require("./_lib/fichas");
const { cuerpo, consulta, exigirJson, manejarError, errorPublico } = require("./_lib/http");

const tokenOk = t => typeof t === "string" && /^[a-f0-9]{32}$/.test(t);

// Solo lo que la familia necesita ver (sin notas internas del legajo).
function vistaFamilia(d) {
  const regs = (d.registros || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const h = crearHerramientas({ alumno: d.alumno, registros: d.registros || [], ppi: d.ppi || [] });
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
  const messages = [{ role: "system", content: SISTEMA_CHAT(d) }, ...(Array.isArray(historial) ? historial : []).slice(-6).map(m => ({ role: m.rol === "familia" ? "user" : "assistant", content: String(m.texto).slice(0, 800) })), { role: "user", content: String(pregunta).slice(0, 500) }];
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json", "HTTP-Referer": "https://puente-pictos.vercel.app", "X-Title": "Puente" },
    body: JSON.stringify(cuerpoLLM("chat", { temperature: 0.3, messages }))
  });
  if (!r.ok) throw new Error("OpenRouter " + r.status);
  return { respuesta: (await r.json()).choices[0].message.content.trim(), modo: "ia" };
}

function armarDatos(b, nombre, extra = {}) {
  return {
    alumno: nombre, actualizado: new Date().toISOString(),
    registros: b.registros.filter(r => r && r.alumno === nombre).slice(0, 60).map(({ registro_docente, ...r }) => r),
    ppi: b.ppi || [], perfil: { le_gusta: b.perfil?.le_gusta || "", lo_calma: b.perfil?.lo_calma || "" },
    agenda: b.agenda || null, mensaje_docente: b.mensaje_docente || null, ...extra
  };
}

// ---------- modo demo: PIN + token ----------
async function modoDemo(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Docente-Pin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") {
    const t = consulta(req, "t");
    if (!tokenOk(t)) return res.status(400).json({ error: "Link inválido" });
    const d = await leer(t);
    return d ? res.status(200).json(vistaFamilia(d)) : res.status(404).json({ error: "No encontramos este espacio" });
  }
  const b = cuerpo(req);
  if (b.accion === "verificar_pin") return exigirPin(req, res) && res.status(200).json({ ok: true });
  if (b.accion === "publicar") {
    if (!exigirPin(req, res)) return;
    if (!b.alumno || !Array.isArray(b.registros)) return res.status(400).json({ error: "Faltan datos" });
    const t = tokenOk(b.token) ? b.token : crypto.randomBytes(16).toString("hex");
    const datos = armarDatos(b, b.alumno);
    await guardarFamilia(t, datos);
    return res.status(200).json({ token: t, dias: datos.registros.length });
  }
  if (b.accion === "preguntar") {
    if (!tokenOk(b.token) || !b.pregunta) return res.status(400).json({ error: "Faltan datos" });
    const d = await leer(b.token);
    if (!d) return res.status(404).json({ error: "No encontramos este espacio" });
    return res.status(200).json(await preguntar(d, b.pregunta, b.historial));
  }
  res.status(400).json({ error: "Acción desconocida" });
}

// ---------- con base de datos: sesiones ----------
// Una familia ve solo alumnos vinculados; una docente, los de su escuela.
async function alumnoPermitido(s, id) {
  id = Number(id) || 0;
  if (s.tipo === "docente") return uno("SELECT a.id, a.nombre, a.blob_token, f.objetivos, f.apoyos FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id WHERE a.id = $1 AND a.escuela_id = $2", [id, s.usuario.escuela_id]);
  return uno("SELECT a.id, a.nombre, a.blob_token FROM alumnos a JOIN familia_alumno fa ON fa.alumno_id = a.id WHERE a.id = $1 AND fa.familia_id = $2", [id, s.usuario.id]);
}
const vacia = a => ({ alumno: a.nombre, actualizado: null, dias: [], objetivos: [], agenda: null, mensaje_docente: null, sin_publicar: true });

async function modoDb(req, res) {
  if (!exigirJson(req, res)) return;
  if (req.method === "GET") {
    if (consulta(req, "t")) return res.status(410).json({ error: "Los links ya no se usan: ahora la familia entra con su email.", login: "/login.html?familia" });
    const s = await leerSesion(req);
    if (!s) return res.status(401).json({ error: "Iniciá sesión", login: "/login.html?familia" });
    const a = await alumnoPermitido(s, consulta(req, "alumno"));
    if (!a) throw errorPublico("No encontramos este espacio", 404);
    const d = a.blob_token ? await leer(a.blob_token) : null;
    return res.status(200).json({ id: Number(a.id), ...(d ? vistaFamilia({ ...d, alumno: a.nombre }) : vacia(a)) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const b = cuerpo(req);
  if (b.accion === "publicar") {
    const yo = await exigirDocente(req, res);
    if (!yo) return;
    if (!Array.isArray(b.registros)) throw errorPublico("Faltan datos");
    let a = b.alumno_id ? await alumnoPermitido({ tipo: "docente", usuario: yo }, b.alumno_id)
      : await uno("SELECT a.id, a.nombre, a.blob_token, f.objetivos, f.apoyos FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id WHERE a.escuela_id = $1 AND a.nombre = $2", [yo.escuela_id, String(b.alumno || "")]);
    if (!a) throw errorPublico("Ese alumno no está en tu escuela. Crealo primero en Fichas.", 404);
    let t = a.blob_token;
    if (!t) { t = crypto.randomBytes(16).toString("hex"); await q("UPDATE alumnos SET blob_token = $1 WHERE id = $2", [t, a.id]); }
    // La ficha manda: objetivos del PPI y perfil salen de la base, no del navegador.
    const ppi = a.objetivos?.length ? objetivosAPpi(a.objetivos) : (b.ppi || []);
    const perfil = a.apoyos ? apoyosAPerfil(a.apoyos) : b.perfil;
    const datos = armarDatos({ ...b, registros: b.registros.map(r => ({ ...r, alumno: a.nombre })), ppi, perfil }, a.nombre);
    await guardarFamilia(t, datos);
    return res.status(200).json({ alumno_id: Number(a.id), dias: datos.registros.length });
  }
  if (b.accion === "preguntar") {
    const s = await leerSesion(req);
    if (!s) return res.status(401).json({ error: "Iniciá sesión", login: "/login.html?familia" });
    if (!b.pregunta) throw errorPublico("Faltan datos");
    const a = await alumnoPermitido(s, b.alumno_id);
    if (!a) throw errorPublico("No encontramos este espacio", 404);
    const d = a.blob_token ? await leer(a.blob_token) : null;
    if (!d) return res.status(200).json({ respuesta: `Todavía no hay días de ${a.nombre} cargados. Apenas la escuela publique, vas a poder preguntarme.`, modo: "vacio" });
    return res.status(200).json(await preguntar({ ...d, alumno: a.nombre }, b.pregunta, b.historial));
  }
  if (b.accion === "verificar_pin") return res.status(400).json({ error: "Con cuentas activas, la docente entra con email y contraseña.", login: "/login.html" });
  res.status(400).json({ error: "Acción desconocida" });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    return dbActiva() ? await modoDb(req, res) : await modoDemo(req, res);
  } catch (e) { manejarError(res, e); }
};

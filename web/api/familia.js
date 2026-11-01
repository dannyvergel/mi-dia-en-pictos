// Espacio de familias.
// Modo demo (sin DATABASE_URL): cada alumno tiene un link privado (token largo al azar) y la docente publica con PIN.
// Con base de datos: la familia entra con su email (código) y ve solo sus alumnos vinculados;
// la docente publica con su sesión. Los días siguen guardados en Vercel Blob (uno por alumno).
const crypto = require("crypto");
const { crearHerramientas, diaSemana } = require("./_lib/tools");
const chat = require("./_lib/chat");
const { exigirPin } = require("./_lib/pin");
const { dbActiva, q, uno } = require("./_lib/db");
const { leerSesion, ipDe } = require("./_lib/seguridad");
const { exigirDocente } = require("./_lib/auth");
const { leerFamilia: leer, guardarFamilia } = require("./_lib/almacen");
const { objetivosAPpi, apoyosAPerfil } = require("./_lib/fichas");
const { condVisible } = require("./_lib/alumnos");
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
    const pregunta = typeof b.pregunta === "string" ? b.pregunta.trim() : "";
    if (!tokenOk(b.token) || !pregunta) return res.status(400).json({ error: "Faltan datos" });
    const d = await leer(b.token);
    if (!d) return res.status(404).json({ error: "No encontramos este espacio" });
    const limite = chat.limiteMemoria(b.token, ipDe(req));
    if (limite) return res.status(429).json({ error: limite });
    // Modo demo: una sola vuelta. El historial que mande el navegador se ignora.
    const { respuesta, modo } = await chat.preguntar(d, pregunta, { quien: "demo" });
    return res.status(200).json({ respuesta, modo });
  }
  res.status(400).json({ error: "Acción desconocida" });
}

// ---------- con base de datos: sesiones ----------
// Una familia ve solo alumnos vinculados (de escuelas activas); una docente, los que puede ver (admin: su escuela; si no, sus asignados).
async function alumnoPermitido(s, id) {
  id = Number(id) || 0;
  if (s.tipo === "docente") {
    const [c, p] = condVisible(s.usuario, 2);
    return uno(`SELECT a.id, a.nombre, a.blob_token, f.objetivos, f.apoyos FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id WHERE a.id = $1 AND ${c}`, [id, ...p]);
  }
  return uno(`SELECT a.id, a.nombre, a.blob_token FROM alumnos a JOIN familia_alumno fa ON fa.alumno_id = a.id JOIN escuelas e ON e.id = a.escuela_id
    WHERE a.id = $1 AND fa.familia_id = $2 AND e.activa`, [id, s.usuario.id]);
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
      : await (async () => { const [c, p] = condVisible(yo, 2);
          return uno(`SELECT a.id, a.nombre, a.blob_token, f.objetivos, f.apoyos FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id WHERE a.nombre = $1 AND ${c}`, [String(b.alumno || ""), ...p]); })();
    if (!a) throw errorPublico("Ese alumno no está entre tus alumnos. Crealo en Fichas o pedile a la admin que te lo asigne.", 404);
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
    const pregunta = typeof b.pregunta === "string" ? b.pregunta.trim() : "";
    if (!pregunta) throw errorPublico("Faltan datos");
    const a = await alumnoPermitido(s, b.alumno_id);
    if (!a) throw errorPublico("No encontramos este espacio", 404);
    const cuenta = { tipo: s.tipo, id: Number(s.usuario.id) };
    const limite = await chat.limiteDb(cuenta, ipDe(req));
    if (limite) return res.status(429).json({ error: limite });
    const d = a.blob_token ? await leer(a.blob_token) : null;
    if (!d) return res.status(200).json({ respuesta: `Todavía no hay días de ${a.nombre} cargados. Apenas la escuela publique, vas a poder preguntarme.`, modo: "vacio" });
    // El historial sale de la base (por cuenta + alumno), nunca del navegador.
    const historial = await chat.leerHistorial(cuenta, Number(a.id));
    const r = await chat.preguntar({ ...d, alumno: a.nombre }, pregunta, { historial, quien: `${cuenta.tipo}#${cuenta.id}` });
    if (r.en_tema && r.modo === "ia") await chat.guardarTurno(cuenta, Number(a.id), pregunta, r.respuesta);
    return res.status(200).json({ respuesta: r.respuesta, modo: r.modo });
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

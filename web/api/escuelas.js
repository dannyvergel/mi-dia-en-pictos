// Escuelas: búsqueda en el Padrón Oficial (Santa Fe) y ficha de la escuela.
//  GET ?q=texto           → hasta 10 escuelas del padrón por nombre, número ("escuela 2085", "2085"), CUE o localidad.
//                           Docentes con sesión, o el formulario público (header x-puente-formulario con el token de GET /api/auth).
//                           Límite: 120 búsquedas cada 10 min por docente; 40 cada 10 min y 300 por día por IP desde el formulario.
//  GET ?cue=820060800     → una escuela del padrón (docentes)
//  GET ?ficha=1           → ficha de mi escuela (solo admin de esa escuela)
//  POST accion=guardar_ficha { nombre, cue?, domicilio, localidad, departamento, modalidad, email, telefono,
//                              directivo_nombre, directivo_email, responsable_datos_nombre, responsable_datos_email,
//                              aval_firmado, aval_fecha, aval_por, notas }   (solo admin; siempre su propia escuela)
// Plataforma (solo la cuenta de ADMIN_EMAIL; se valida en el server en cada acción, ver S.exigirPlataforma). Lo usa admin.html:
//  GET ?todas=1           → todas las escuelas de Puente: nombre, CUE, #docentes activas, #admins, #alumnos, aval, activa,
//                           links de invitación pendientes
//  GET ?ficha=1&id=N      → ficha de cualquier escuela
//  POST accion=crear_escuela { cue }   → alta de una escuela desde el Padrón Oficial (si ya está en Puente, devuelve esa)
//  POST accion=guardar_ficha { escuela_id, ... } → edita la ficha de cualquier escuela
//  POST accion=desactivar_escuela | activar_escuela { id }   (no su propia escuela). Desactivada: sus docentes
//                              y familias no entran, y sus solicitudes nuevas van a la plataforma.
const { dbActiva, q, uno } = require("./_lib/db");
const S = require("./_lib/seguridad");
const padron = require("./_lib/padron");
const { cuerpo, consulta, exigirJson, manejarError, errorPublico, hoyLocal } = require("./_lib/http");

const LIM = { docente: [120, 10], ip: [40, 10], ipDia: [300, 24 * 60] };
const limpio = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const TEXTOS = { nombre: 120, domicilio: 200, localidad: 100, departamento: 100, modalidad: 300, telefono: 60, directivo_nombre: 120,
  responsable_datos_nombre: 160, aval_por: 120, notas: 2000 };
const EMAILS = ["email", "directivo_email", "responsable_datos_email"];
const CAMPOS_FICHA = `id, nombre, cue, domicilio, localidad, departamento, modalidad, email, telefono, directivo_nombre, directivo_email,
  responsable_datos_nombre, responsable_datos_email, aval_firmado, to_char(aval_fecha, 'YYYY-MM-DD') AS aval_fecha, aval_por, notas,
  actualizado, actualizado_por`;

async function limite(clave, [max, min]) {
  if (await S.superaLimite(clave, max, min)) throw errorPublico("Muchas búsquedas seguidas. Esperá unos minutos y probá de nuevo.", 429);
}

async function buscar(req, res, sesion) {
  const texto = limpio(consulta(req, "q"), 80);
  if (sesion) {
    const k = "escuelas:docente:" + sesion.usuario.id;
    await limite(k, LIM.docente); await S.registrarIntento(k);
  } else {
    const k = "escuelas:ip:" + S.ipDe(req), kd = "escuelas:ipdia:" + S.ipDe(req);
    await limite(k, LIM.ip); await limite(kd, LIM.ipDia);
    await S.registrarIntento(k); await S.registrarIntento(kd);
  }
  if (padron.norm(texto).length < 2) return res.status(200).json({ escuelas: [] });
  // Desde el formulario público, lo justo para elegir la escuela; las docentes ven también el contacto institucional.
  res.status(200).json({ escuelas: await padron.buscar(texto, { completa: !!sesion }) });
}

async function ficha(escuelaId) {
  if (escuelaId == null) return null;
  return uno(`SELECT ${CAMPOS_FICHA} FROM escuelas WHERE id = $1`, [escuelaId]);
}

// escuelaId: la de la admin (siempre la suya) o la que eligió la plataforma.
async function guardarFicha(res, yo, b, escuelaId = yo.escuela_id) {
  const d = {};
  for (const [k, max] of Object.entries(TEXTOS)) d[k] = limpio(b[k], max);
  if (d.nombre.length < 2) throw errorPublico("Falta el nombre de la escuela");
  for (const k of EMAILS) {
    d[k] = S.normEmail(b[k]);
    if (d[k] && !S.emailValido(d[k])) throw errorPublico("Revisá el email" + (k === "email" ? " institucional" : k === "directivo_email" ? " del directivo" : " del responsable de datos"));
  }
  const cue = String(b.cue ?? "").trim();
  if (cue && !/^\d{9}$/.test(cue)) throw errorPublico("El CUE tiene que tener 9 números (CUE + anexo), o dejalo vacío");
  d.aval_firmado = !!b.aval_firmado;
  const fecha = String(b.aval_fecha || "").trim();
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw errorPublico("Revisá la fecha del aval");
  d.aval_fecha = d.aval_firmado ? (fecha || hoyLocal()) : null;
  if (!d.aval_firmado) d.aval_por = "";
  if (cue) {
    const otra = await uno("SELECT id FROM escuelas WHERE cue = $1 AND id <> $2", [cue, escuelaId]);
    if (otra) throw errorPublico("Esa escuela (mismo CUE) ya está cargada en Puente. Pedile acceso a sus docentes administradoras.", 409);
  }
  let e;
  try {
    e = await uno(`UPDATE escuelas SET nombre = $2, cue = $3, domicilio = $4, localidad = $5, departamento = $6, modalidad = $7, email = $8,
      telefono = $9, directivo_nombre = $10, directivo_email = $11, responsable_datos_nombre = $12, responsable_datos_email = $13,
      aval_firmado = $14, aval_fecha = $15, aval_por = $16, notas = $17, actualizado = now(), actualizado_por = $18
      WHERE id = $1 RETURNING ${CAMPOS_FICHA}`,
      [escuelaId, d.nombre, cue || null, d.domicilio, d.localidad, d.departamento, d.modalidad, d.email, d.telefono, d.directivo_nombre,
        d.directivo_email, d.responsable_datos_nombre, d.responsable_datos_email, d.aval_firmado, d.aval_fecha, d.aval_por, d.notas, yo.email]);
  } catch (err) {
    if (String(err.code) === "23505") throw errorPublico("Esa escuela (mismo CUE) ya está cargada en Puente.", 409);
    throw err;
  }
  if (!e) throw errorPublico("No encontramos esa escuela", 404);
  res.status(200).json({ ficha: e, en_padron: cue ? !!(await padron.porCue(cue)) : false });
}

// ---------- plataforma ----------
async function todas() {
  const filas = await q(`SELECT e.id, e.nombre, e.cue, e.localidad, e.aval_firmado, e.activa,
      (SELECT count(*)::int FROM docentes d WHERE d.escuela_id = e.id AND d.activo) AS docentes,
      (SELECT count(*)::int FROM docentes d WHERE d.escuela_id = e.id AND d.activo AND d.es_admin) AS admins,
      (SELECT count(*)::int FROM alumnos a WHERE a.escuela_id = e.id) AS alumnos,
      (SELECT count(*)::int FROM enlaces l WHERE l.escuela_id = e.id AND l.tipo = 'docente' AND l.revocado IS NULL AND l.usos < l.usos_max
        AND l.expira > now()) AS links_pendientes
    FROM escuelas e ORDER BY e.activa DESC, e.nombre`);
  return filas.map(e => ({ ...e, id: Number(e.id) }));
}
async function cambiarActiva(res, yo, b) {
  const id = Number(b.id) || 0, activa = b.accion === "activar_escuela";
  if (!activa && id === Number(yo.escuela_id)) throw errorPublico("No podés desactivar tu propia escuela.");
  const e = await uno("UPDATE escuelas SET activa = $2, actualizado = now(), actualizado_por = $3 WHERE id = $1 RETURNING id, nombre, activa", [id, activa, yo.email]);
  if (!e) throw errorPublico("No encontramos esa escuela", 404);
  // Al desactivar se cortan las sesiones abiertas de sus docentes (la de la plataforma no).
  if (!activa) await q(`DELETE FROM sesiones WHERE tipo = 'docente' AND usuario_id IN (SELECT id FROM docentes WHERE escuela_id = $1 AND email <> $2)`,
    [id, S.emailPlataforma()]);
  res.status(200).json({ escuela: { ...e, id: Number(e.id) } });
}
// Alta de una escuela desde el padrón (plataforma). Si ya está en Puente (mismo CUE), devuelve esa sin duplicar.
async function crearEscuela(res, b) {
  const cue = String(b.cue ?? "").trim();
  if (!/^\d{9}$/.test(cue)) throw errorPublico("Elegí la escuela del padrón (CUE de 9 números).");
  const r = await padron.escuelaPorCue(cue);
  if (!r) throw errorPublico("No encontramos ese CUE en el padrón.", 404);
  res.status(200).json({ escuela: { ...r.escuela, id: Number(r.escuela.id) }, creada: r.creada });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) return res.status(400).json({ error: "Modo demo: sin base de datos no hay búsqueda de escuelas." });
    if (!exigirJson(req, res)) return;
    const s = await S.leerSesion(req);
    const docente = s?.tipo === "docente" ? s : null;
    if (req.method === "GET" && consulta(req, "q") != null) {
      if (!docente && !S.formularioOk(req.headers["x-puente-formulario"]))
        return res.status(401).json({ error: "Iniciá sesión como docente", login: "/login.html" });
      return await buscar(req, res, docente);
    }
    if (!docente) return res.status(401).json({ error: "Iniciá sesión como docente", login: "/login.html" });
    const yo = docente.usuario;
    if (req.method === "GET" && consulta(req, "cue")) {
      const p = await padron.porCue(consulta(req, "cue"));
      if (!p) throw errorPublico("No encontramos ese CUE en el padrón", 404);
      return res.status(200).json({ escuela: p, ficha: padron.fichaDesdePadron(p) });
    }
    const b = req.method === "POST" ? cuerpo(req) : {};
    // ---- plataforma: cada acción exige la cuenta de ADMIN_EMAIL (403 para cualquier otra, aunque sea admin o esté promovida) ----
    const idPedido = req.method === "GET" ? consulta(req, "id") : b.escuela_id;
    const dePlataforma = (req.method === "GET" && (consulta(req, "todas") || (idPedido != null && idPedido !== "")))
      || /^((des)?activar_escuela|crear_escuela)$/.test(String(b.accion || ""))
      || (b.accion === "guardar_ficha" && idPedido != null && idPedido !== "" && Number(idPedido) !== Number(yo.escuela_id));
    if (dePlataforma) {
      S.exigirPlataforma(yo);
      if (req.method === "GET" && consulta(req, "todas")) return res.status(200).json({ escuelas: await todas(), mi_escuela: yo.escuela_id == null ? null : Number(yo.escuela_id) });
      if (req.method === "GET") {
        const f = await ficha(Number(idPedido) || 0);
        if (!f) throw errorPublico("No encontramos esa escuela", 404);
        return res.status(200).json({ ficha: f });
      }
      if (b.accion === "crear_escuela") return await crearEscuela(res, b);
      if (b.accion === "guardar_ficha") return await guardarFicha(res, yo, b, Number(idPedido) || 0);
      return await cambiarActiva(res, yo, b);
    }
    if (!yo.es_admin || yo.escuela_id == null) throw errorPublico("Solo una docente administradora de la escuela puede ver y editar su ficha.", 403);
    if (req.method === "GET") return res.status(200).json({ ficha: await ficha(yo.escuela_id) });
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    if (b.accion === "guardar_ficha") return await guardarFicha(res, yo, b);
    res.status(400).json({ error: "Acción desconocida" });
  } catch (e) { manejarError(res, e); }
};

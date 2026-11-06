// Informes y documentos que suben las seños y terapeutas para un alumno (ver docs/documentos.md).
// · El archivo va al Vercel Blob privado (documentos/<alumno_id>/<32 hex al azar>); en la base, solo los metadatos.
// · PDF, JPG, PNG o DOCX, hasta 3 MB (el body de Vercel admite 4,5 MB y el archivo viaja en base64 dentro del JSON).
//   Se valida la extensión, el tipo declarado y los primeros bytes del archivo (magic bytes).
// · Docente con acceso al alumno (asignada, admin de su escuela o plataforma): sube, lista, descarga, muestra/oculta y avisa.
//   Borra solo quien lo subió o una admin de la escuela del alumno.
// · Familia vinculada: lista y descarga solo los que tienen visible_familia, de sus alumnos y de escuelas activas.
//   Rige aunque FAMILIA_FUNCIONES esté en el mínimo: la seño decide documento por documento.
// · Nunca se mandan a la IA ni a OpenRouter. El aviso por mail no lleva adjunto, título ni contenido.
const crypto = require("crypto");
const { q, uno } = require("./db");
const A = require("./alumnos");
const S = require("./seguridad");
const almacen = require("./almacen");
const auditoria = require("./auditoria");
const avisos = require("./avisos");
const { errorPublico } = require("./http");

const MAX_BYTES = 3 * 1024 * 1024;
const TIPOS = ["informe", "documento"];
// Extensión → tipo MIME guardado (el que declara el navegador solo se acepta si coincide o viene vacío).
const MIMES = {
  pdf: "application/pdf",
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};
const empieza = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
// Primeros bytes de cada formato. DOCX es un ZIP que adentro tiene la carpeta word/ (los nombres van sin comprimir).
const FIRMAS = {
  "application/pdf": b => empieza(b, [0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
  "image/jpeg": b => empieza(b, [0xff, 0xd8, 0xff]),
  "image/png": b => empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    b => empieza(b, [0x50, 0x4b, 0x03, 0x04]) && b.includes("word/") && b.includes("[Content_Types].xml")
};

// Nombre de archivo seguro: sin carpetas, sin caracteres de control ni raros, hasta 100 caracteres, con su extensión.
function sanitizarNombre(nombre) {
  let n = String(nombre ?? "").split(/[\\/]/).pop().normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>:|?*;%]+/g, "").replace(/[^\p{L}\p{N} ._()-]+/gu, "_").replace(/\s+/g, " ").trim();
  n = n.replace(/^[.\s]+/, ""); // sin archivos ocultos ni ".." al principio
  const m = n.match(/^(.*?)(\.[a-z0-9]{1,5})?$/i);
  const base = (m[1] || "archivo").slice(0, 90).trim() || "archivo";
  return base + (m[2] || "").toLowerCase();
}
const extension = n => (String(n).match(/\.([a-z0-9]{1,5})$/i)?.[1] || "").toLowerCase();

function validarArchivo({ nombre, mime, datos }) {
  const limpio = sanitizarNombre(nombre);
  const esperado = MIMES[extension(limpio)];
  if (!esperado) throw errorPublico("Solo se pueden subir archivos PDF, JPG, PNG o DOCX.");
  const declarado = String(mime || "").toLowerCase().trim();
  if (declarado && declarado !== "application/octet-stream" && declarado !== esperado)
    throw errorPublico("El tipo del archivo no coincide con su extensión.");
  let b64 = String(datos || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!b64) throw errorPublico("Falta el archivo.");
  if (b64.length > Math.ceil(MAX_BYTES / 3) * 4 + 4) throw errorPublico("El archivo pesa más de 3 MB. Achicalo o escanealo con menos resolución.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw errorPublico("El archivo no llegó bien. Probá de nuevo.");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) throw errorPublico("El archivo está vacío.");
  if (buf.length > MAX_BYTES) throw errorPublico("El archivo pesa más de 3 MB. Achicalo o escanealo con menos resolución.");
  if (!FIRMAS[esperado](buf)) throw errorPublico("El archivo no parece ser un PDF, JPG, PNG o DOCX válido.");
  return { nombre: limpio, mime: esperado, datos: buf };
}
function validarTipo(t) {
  if (!TIPOS.includes(t)) throw errorPublico("Elegí si es un informe o un documento.");
  return t;
}
function validarTitulo(t) {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) throw errorPublico("Poné un título (ej: «Informe del primer trimestre»).");
  if (s.length > 120) throw errorPublico("El título es muy largo (máximo 120 caracteres).");
  return s;
}

// ---------- permisos ----------
// Docente: el alumno tiene que estar entre los que ve (condVisible). La plataforma, cualquiera.
async function alumnoDeDocente(yo, id) {
  id = Number(id) || 0;
  let a;
  if (S.esPlataforma(yo)) a = await uno("SELECT a.id, a.nombre, a.escuela_id FROM alumnos a WHERE a.id = $1", [id]);
  else { const [c, p] = A.condVisible(yo, 2); a = await uno(`SELECT a.id, a.nombre, a.escuela_id FROM alumnos a WHERE a.id = $1 AND ${c}`, [id, ...p]); }
  if (!a) throw errorPublico("No encontramos ese alumno", 404);
  return a;
}
const COLS = `d.id, d.alumno_id, d.escuela_id, d.subido_por, d.tipo, d.titulo, d.nombre_archivo, d.mime, d.bytes, d.blob_ruta, d.visible_familia, d.notificado, d.creado`;
async function docDeDocente(yo, docId) {
  const d = await uno(`SELECT ${COLS}, a.nombre AS alumno FROM documentos d JOIN alumnos a ON a.id = d.alumno_id WHERE d.id = $1`, [Number(docId) || 0]);
  if (!d) throw errorPublico("No encontramos ese documento", 404);
  await alumnoDeDocente(yo, d.alumno_id); // 404 si no tiene al alumno
  return d;
}
// Familia: solo los visibles, de sus alumnos, de escuelas activas.
async function docDeFamilia(fam, docId) {
  const d = await uno(`SELECT ${COLS} FROM documentos d JOIN familia_alumno fa ON fa.alumno_id = d.alumno_id AND fa.familia_id = $2
    JOIN alumnos a ON a.id = d.alumno_id JOIN escuelas e ON e.id = a.escuela_id
    WHERE d.id = $1 AND d.visible_familia AND e.activa`, [Number(docId) || 0, fam.id]);
  if (!d) throw errorPublico("No encontramos ese documento", 404);
  return d;
}
const puedeBorrar = (yo, d) => Number(d.subido_por) === Number(yo.id) || (!!yo.es_admin && Number(yo.escuela_id) === Number(d.escuela_id));

// ---------- formas de salida (nunca blob_ruta) ----------
const paraDocente = (yo, d) => ({ id: Number(d.id), alumno_id: Number(d.alumno_id), tipo: d.tipo, titulo: d.titulo, nombre_archivo: d.nombre_archivo,
  mime: d.mime, bytes: Number(d.bytes), visible_familia: !!d.visible_familia, notificado: d.notificado || null, creado: d.creado,
  subido_por: d.subido_por != null ? { id: Number(d.subido_por), nombre: d.subido_por_nombre || "" } : null, puede_borrar: puedeBorrar(yo, d) });
const paraFamilia = d => ({ id: Number(d.id), alumno_id: Number(d.alumno_id), tipo: d.tipo, titulo: d.titulo, nombre_archivo: d.nombre_archivo,
  mime: d.mime, bytes: Number(d.bytes), creado: d.creado });

async function listarDocente(yo, alumnoId) {
  const a = await alumnoDeDocente(yo, alumnoId);
  const filas = await q(`SELECT ${COLS}, doc.nombre AS subido_por_nombre FROM documentos d LEFT JOIN docentes doc ON doc.id = d.subido_por
    WHERE d.alumno_id = $1 ORDER BY d.creado DESC, d.id DESC`, [a.id]);
  return filas.map(d => paraDocente(yo, d));
}
async function listarFamilia(fam, alumnoId) {
  const filas = await q(`SELECT ${COLS} FROM documentos d JOIN familia_alumno fa ON fa.alumno_id = d.alumno_id AND fa.familia_id = $2
    JOIN alumnos a ON a.id = d.alumno_id JOIN escuelas e ON e.id = a.escuela_id
    WHERE d.alumno_id = $1 AND d.visible_familia AND e.activa ORDER BY d.creado DESC, d.id DESC`, [Number(alumnoId) || 0, fam.id]);
  return filas.map(paraFamilia);
}
// Para la exportación de la familia (derecho de acceso): metadatos de los visibles de todos sus alumnos.
async function exportarFamilia(fam) {
  const filas = await q(`SELECT ${COLS} FROM documentos d JOIN familia_alumno fa ON fa.alumno_id = d.alumno_id AND fa.familia_id = $1
    JOIN alumnos a ON a.id = d.alumno_id JOIN escuelas e ON e.id = a.escuela_id
    WHERE d.visible_familia AND e.activa ORDER BY d.alumno_id, d.creado`, [fam.id]);
  return filas.map(paraFamilia);
}

// ---------- aviso por mail ----------
// Solo si está visible. Un mail por email de familia vinculada. Devuelve { enviados, fallidos, aviso? }.
async function notificar(req, d, alumnoNombre) {
  const emails = (await q(`SELECT f.email FROM familias f JOIN familia_alumno fa ON fa.familia_id = f.id WHERE fa.alumno_id = $1 ORDER BY f.email`,
    [d.alumno_id])).map(f => f.email);
  if (!emails.length) return { enviados: 0, fallidos: 0, aviso: "Este alumno todavía no tiene familias vinculadas: no le avisamos a nadie." };
  const r = await avisos.documentoCompartido(req, { emails, tipo: d.tipo, alumno: alumnoNombre });
  if (r.enviados) await q("UPDATE documentos SET notificado = now() WHERE id = $1", [d.id]);
  if (r.fallidos) return { ...r, aviso: r.enviados
    ? "El documento quedó guardado, pero a alguna familia no le pudimos mandar el mail. Probá «Informar» en un rato."
    : "El documento quedó guardado, pero no pudimos mandar el mail a la familia. Probá «Informar» en un rato." };
  return r;
}

// ---------- acciones ----------
async function subir(req, yo, b) {
  const a = await alumnoDeDocente(yo, b.id);
  const tipo = validarTipo(b.tipo), titulo = validarTitulo(b.titulo);
  const visible = b.mostrar_familia === true, avisar = b.notificar === true;
  if (avisar && !visible) throw errorPublico("Para avisarle a la familia, primero marcá «Mostrar a la familia».");
  const archivo = validarArchivo({ nombre: b.nombre, mime: b.mime, datos: b.datos });
  const ruta = `documentos/${a.id}/${crypto.randomBytes(16).toString("hex")}`;
  await almacen.guardarArchivo(ruta, archivo.datos, archivo.mime);
  let d;
  try {
    d = await uno(`INSERT INTO documentos (alumno_id, escuela_id, subido_por, tipo, titulo, nombre_archivo, mime, bytes, blob_ruta, visible_familia)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [a.id, a.escuela_id, yo.id, tipo, titulo, archivo.nombre, archivo.mime, archivo.datos.length, ruta, visible]);
  } catch (e) { await almacen.borrarArchivo(ruta); throw e; } // sin fila no queda un archivo suelto
  await auditoria.registrar(req, { evento: "doc_subir", ...auditoria.actor({ tipo: "docente", usuario: yo }), objeto_tipo: "documento", objeto_id: d.id,
    detalle: { alumno_id: Number(a.id), tipo, bytes: archivo.datos.length, visible } });
  const aviso = avisar ? await notificar(req, { id: d.id, alumno_id: a.id, tipo }, a.nombre) : null;
  return { documento: (await listarDocente(yo, a.id)).find(x => x.id === Number(d.id)), ...(aviso ? { aviso_familia: aviso } : {}) };
}

async function cambiar(req, yo, b) {
  const d = await docDeDocente(yo, b.doc_id);
  let visible = !!d.visible_familia;
  if (b.mostrar_familia !== undefined) {
    visible = b.mostrar_familia === true;
    // Al ocultarlo se borra la marca de aviso: si se vuelve a mostrar, el estado arranca de cero.
    if (visible !== !!d.visible_familia) await q(`UPDATE documentos SET visible_familia = $2, notificado = CASE WHEN $2 THEN notificado ELSE NULL END WHERE id = $1`, [d.id, visible]);
  }
  if (b.notificar === true && !visible) throw errorPublico("Solo se le puede avisar a la familia si el documento está visible para ella.");
  await auditoria.registrar(req, { evento: "doc_cambiar", ...auditoria.actor({ tipo: "docente", usuario: yo }), objeto_tipo: "documento", objeto_id: d.id,
    detalle: { visible, notificar: b.notificar === true } });
  const aviso = b.notificar === true ? await notificar(req, d, d.alumno) : null;
  return { documento: (await listarDocente(yo, d.alumno_id)).find(x => x.id === Number(d.id)), ...(aviso ? { aviso_familia: aviso } : {}) };
}

async function borrar(req, yo, b) {
  const d = await docDeDocente(yo, b.doc_id);
  if (!puedeBorrar(yo, d)) throw errorPublico("Solo quien lo subió o la dirección de la escuela pueden borrar este documento.", 403);
  const blob_borrado = await almacen.borrarArchivo(d.blob_ruta);
  await q("DELETE FROM documentos WHERE id = $1", [d.id]);
  if (!blob_borrado) console.error(`[puente] documento #${d.id}: el archivo no se pudo borrar del Blob (${d.blob_ruta}); reintentar a mano`);
  await auditoria.registrar(req, { evento: "doc_borrar", ...auditoria.actor({ tipo: "docente", usuario: yo }), objeto_tipo: "documento", objeto_id: d.id,
    detalle: { alumno_id: Number(d.alumno_id), blob_borrado } });
  return { ok: true, blob_borrado };
}

// Manda el archivo. ses = { tipo, usuario }. Content-Disposition attachment y no-store: el navegador lo baja, no lo muestra ni lo guarda en caché.
async function descargar(req, res, ses, docId) {
  const d = ses.tipo === "docente" ? await docDeDocente(ses.usuario, docId) : await docDeFamilia(ses.usuario, docId);
  const datos = await almacen.leerArchivo(d.blob_ruta);
  if (!datos) throw errorPublico("No encontramos el archivo. Avisale a la escuela.", 404);
  await auditoria.registrar(req, { evento: "doc_ver", ...auditoria.actor(ses), objeto_tipo: "documento", objeto_id: d.id, detalle: { alumno_id: Number(d.alumno_id) } });
  const ascii = d.nombre_archivo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  res.setHeader("Content-Type", d.mime);
  res.setHeader("Content-Length", String(datos.length));
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.nombre_archivo)}`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  return res.status(200).end(datos);
}

module.exports = { MAX_BYTES, TIPOS, MIMES, sanitizarNombre, validarArchivo, validarTipo, validarTitulo,
  listarDocente, listarFamilia, exportarFamilia, subir, cambiar, borrar, descargar };

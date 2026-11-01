// Importación masiva de docentes y de alumnos con sus familias (planilla CSV o XLSX).
// La usa api/fichas.js (acciones importar_previa, importar_confirmar, importar_enviar) para no sumar otra función de Vercel.
//
// Quién: admins de escuela en su escuela; la plataforma en la suya o en la que elija (escuela_id). El resto: 403.
// Entrada: { docentes, alumnos } donde cada uno es el texto de un CSV (con ; , o tab, con o sin BOM) o las filas de una
//          hoja ya leída en el navegador (array de arrays con el encabezado primero, o array de objetos).
// 1. importar_previa    → valida todo y devuelve el estado de cada fila (nuevo / actualiza / duplicado / error). No escribe nada.
// 2. importar_confirmar → vuelve a validar (no confía en la vista previa) y escribe en UNA transacción.
//    Por defecto es todo o nada: si hay alguna fila con error no se escribe nada (409). Con omitir_errores: true se escriben
//    solo las filas válidas. Pide la `huella` de la vista previa: si los datos cambiaron, hay que volver a previsualizar.
//    Es idempotente: docente por email, alumno por nombre (+ grado) dentro de la escuela, contactos fusionados por email.
//    Recién después de escribir se mandan los avisos (bienvenida a docentes nuevas, invitación a emails nuevos de familias),
//    de a tandas: lo que no entra en la primera vuelve en `pendientes` y el panel lo manda con importar_enviar.
//    Un envío que falla no deshace nada: se cuenta como fallido y se puede reenviar.
const crypto = require("crypto");
const { q, uno, transaccion } = require("./db");
const S = require("./seguridad");
const F = require("./fichas");
const inv = require("./invitaciones");
const avisos = require("./avisos");
const { modoCorreo } = require("./correo");
const { errorPublico } = require("./http");
const piloto = require("./piloto");

const MAX_FILAS = 500;                 // docentes + alumnos, sin contar filas vacías
const MAX_BYTES = 2 * 1024 * 1024;     // tamaño del pedido (JSON)
const MAX_CONTACTOS = 6;               // igual que la ficha
const LOTE_ENVIOS = 20;                // mails por pedido (el resto queda pendiente)
const LIMITES = { importar_previa: [30, 10], importar_confirmar: [10, 60], importar_enviar: [120, 60] }; // [máx, minutos] por docente
const HORAS_BIENVENIDA = 24;

// ---------- lectura de la planilla ----------
const limpio = s => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim();
const clave = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// CSV RFC 4180: comillas, "" escapadas, saltos de línea dentro de comillas, CRLF/LF/CR, BOM. Separador ; , o tab (el que más aparece
// en el encabezado fuera de comillas; Excel en español guarda con ;).
function separadorDe(texto) {
  let enComillas = false; const n = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of texto) {
    if (ch === '"') enComillas = !enComillas;
    else if (!enComillas && (ch === "\n" || ch === "\r")) { if (n[";"] + n[","] + n["\t"]) break; }
    else if (!enComillas && ch in n) n[ch]++;
  }
  return n[";"] > n[","] && n[";"] >= n["\t"] ? ";" : n["\t"] > n[","] ? "\t" : ",";
}
function parsearCsv(texto) {
  texto = String(texto ?? "").replace(/^\ufeff/, "");
  const sep = separadorDe(texto), filas = [];
  let fila = [], celda = "", comillas = false, i = 0;
  while (i < texto.length) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') { if (texto[i + 1] === '"') { celda += '"'; i += 2; continue; } comillas = false; i++; continue; }
      celda += ch; i++; continue;
    }
    if (ch === '"' && celda.trim() === "") { comillas = true; celda = ""; i++; continue; }
    if (ch === sep) { fila.push(celda); celda = ""; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      fila.push(celda); filas.push(fila); fila = []; celda = "";
      i += ch === "\r" && texto[i + 1] === "\n" ? 2 : 1; continue;
    }
    celda += ch; i++;
  }
  if (celda !== "" || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

// Encabezados aceptados (sin tildes, minúsculas, _ en vez de espacios). Lo demás se ignora con un aviso.
const COLS_DOCENTES = {
  nombre: ["nombre", "nombre_y_apellido", "apellido_y_nombre", "docente"],
  email: ["email", "mail", "e_mail", "correo", "correo_electronico"],
  rol: ["rol", "grado", "grado_rol", "grado_o_rol", "cargo", "funcion"],
  admin: ["admin", "es_admin", "administra", "administradora", "admin_escuela", "direccion"]
};
const COLS_ALUMNOS = {
  nombre: ["nombre", "nombre_de_pila", "alumno", "alumna", "alumno_a"],
  grado: ["grado", "grado_seccion", "curso", "sala", "grado_o_sala"],
  docentes: ["docentes", "docentes_asignados", "docentes_asignadas", "docentes_emails", "emails_docentes", "docente", "email_docente", "emails_de_docentes"]
};
const CAMPOS_CONTACTO = { nombre: "nombre", vinculo: "vinculo", email: "email", mail: "email", correo: "email", telefono: "telefono", tel: "telefono", celular: "telefono", whatsapp: "telefono" };

function mapearEncabezado(h, cols, conContactos) {
  const k = clave(h);
  if (!k) return null;
  for (const [campo, alias] of Object.entries(cols)) if (alias.includes(k)) return campo;
  if (conContactos) {
    const m = k.match(/^(?:contacto|familiar|familia)_?(\d{1,2})_?([a-z]+)$/);
    if (m && CAMPOS_CONTACTO[m[2]] && Number(m[1]) >= 1) return `contacto:${Number(m[1])}:${CAMPOS_CONTACTO[m[2]]}`;
  }
  return null;
}

// Cualquier entrada → { filas: [{ fila, datos: {campo: texto} }], vacias, errores, avisos }. `fila` = número de renglón en la planilla.
function leerTabla(entrada, cols, { conContactos = false, obligatorias = [] } = {}) {
  const out = { filas: [], vacias: 0, errores: [], avisos: [] };
  if (entrada == null || entrada === "" || (Array.isArray(entrada) && !entrada.length)) return out;
  let matriz;
  if (typeof entrada === "string") {
    if (entrada.length > MAX_BYTES) throw errorPublico("El archivo es demasiado grande. Partilo en varios.", 413);
    matriz = parsearCsv(entrada);
  } else if (Array.isArray(entrada) && entrada.every(Array.isArray)) matriz = entrada;
  else if (Array.isArray(entrada) && entrada.every(r => r && typeof r === "object")) {
    const enc = [...new Set(entrada.flatMap(r => Object.keys(r)))];
    matriz = [enc, ...entrada.map(r => enc.map(k => r[k]))];
  } else throw errorPublico("No pudimos leer la planilla. Usá la plantilla (CSV o XLSX).");
  // El encabezado es el primer renglón con algo escrito.
  let i = matriz.findIndex(r => r.some(c => limpio(c)));
  if (i < 0) return out;
  const enc = matriz[i].map(h => mapearEncabezado(limpio(h), cols, conContactos));
  matriz[i].forEach((h, j) => { if (limpio(h) && !enc[j]) out.avisos.push(`La columna «${limpio(h).slice(0, 40)}» no es de la plantilla: se ignora.`); });
  const faltan = obligatorias.filter(c => !enc.includes(c));
  if (faltan.length) { out.errores.push(`Faltan columnas obligatorias: ${faltan.join(", ")}. Usá la plantilla.`); return out; }
  for (let r = i + 1; r < matriz.length; r++) {
    const celdas = (matriz[r] || []).map(limpio);
    if (!celdas.some(Boolean)) { out.vacias++; continue; }
    const datos = {};
    enc.forEach((campo, j) => { if (campo && celdas[j]) datos[campo] = datos[campo] ? datos[campo] + " " + celdas[j] : celdas[j]; });
    out.filas.push({ fila: r + 1, datos });
  }
  return out;
}

// ---------- validación ----------
const SI = new Set(["si", "s", "x", "1", "true", "verdadero", "yes", "admin"]), NO = new Set(["no", "n", "0", "false", "falso"]);
const emailsDe = s => String(s || "").split(/[\s,;|]+/).map(S.normEmail).filter(Boolean);
const mismoGrado = (a, b) => clave(a) === clave(b);
const resumenVacio = () => ({ nuevo: 0, actualiza: 0, duplicado: 0, error: 0 });
const mensajeDe = e => (e && e.publico ? e.message : "Dato inválido");

function validarDocente(d) {
  const err = [];
  const nombre = limpio(d.nombre).slice(0, 80), email = S.normEmail(d.email), rol = limpio(d.rol).slice(0, 60);
  if (!nombre) err.push("Falta el nombre (obligatorio)");
  if (!email) err.push("Falta el email (obligatorio)");
  else if (!S.emailValido(email)) err.push(`Email inválido: «${email.slice(0, 80)}»`);
  let admin = null;
  const a = clave(d.admin);
  if (a) { if (SI.has(a)) admin = true; else if (NO.has(a)) admin = false; else err.push("En «admin» poné sí o no (o dejalo vacío)"); }
  return { nombre, email, rol, admin, err };
}

function validarContactosFila(d) {
  const err = [], porNumero = {};
  for (const [k, v] of Object.entries(d)) {
    const m = k.match(/^contacto:(\d+):(\w+)$/);
    if (m) (porNumero[m[1]] ||= {})[m[2]] = v;
  }
  const lista = [];
  for (const n of Object.keys(porNumero).map(Number).sort((a, b) => a - b)) {
    const c = porNumero[n];
    if (!Object.values(c).some(Boolean)) continue;
    try { lista.push(F.validarContactos([c])[0]); }
    catch (e) { err.push(`Contacto ${n}: ${mensajeDe(e).replace(/^Al contacto 1 le falta el nombre$/, "falta el nombre")}`); }
  }
  if (lista.length > MAX_CONTACTOS) err.push(`Hasta ${MAX_CONTACTOS} contactos por alumno`);
  const vistos = new Set();
  for (const c of lista) if (c.email) { if (vistos.has(c.email)) err.push(`El email ${c.email} está repetido en la fila`); vistos.add(c.email); }
  return { contactos: lista, err };
}

const ordenado = c => ({ nombre: c.nombre || "", vinculo: c.vinculo || "", email: c.email || "", telefono: c.telefono || "" });

// Fusiona los contactos de la planilla con los de la ficha, sin duplicar: por email, o por nombre si el de la ficha no tenía email.
// Un campo vacío en la planilla no borra lo que ya estaba.
function fusionarContactos(actuales, nuevos) {
  const out = actuales.map(c => ({ ...c }));
  for (const c of nuevos) {
    let i = c.email ? out.findIndex(x => x.email === c.email) : -1;
    if (i < 0) i = out.findIndex(x => !x.email && clave(x.nombre) === clave(c.nombre));
    if (i < 0 && !c.email) i = out.findIndex(x => clave(x.nombre) === clave(c.nombre));
    if (i < 0) { out.push({ nombre: c.nombre, vinculo: c.vinculo || "", email: c.email || "", telefono: c.telefono || "" }); continue; }
    const v = out[i];
    out[i] = { nombre: c.nombre || v.nombre, vinculo: c.vinculo || v.vinculo || "", email: c.email || v.email || "", telefono: c.telefono || v.telefono || "" };
  }
  return out;
}

// Valida todo contra la base (sin escribir). Devuelve el informe completo; `plan` es lo que se escribiría (solo filas válidas).
async function analizar(entrada, escuelaId, yo) {
  const td = leerTabla(entrada.docentes, COLS_DOCENTES, { obligatorias: ["nombre", "email"] });
  const ta = leerTabla(entrada.alumnos, COLS_ALUMNOS, { conContactos: true, obligatorias: ["nombre", "grado"] });
  const total = td.filas.length + ta.filas.length;
  if (total > MAX_FILAS) throw errorPublico(`Hasta ${MAX_FILAS} filas por importación (mandaste ${total}). Partí la planilla en varias.`, 413);
  if (!total && !td.errores.length && !ta.errores.length) throw errorPublico("La planilla está vacía: no encontramos filas para importar.");

  // Lecturas de la base, todas de una vez.
  const emailsMencionados = [...new Set([...td.filas.map(f => S.normEmail(f.datos.email)), ...ta.filas.flatMap(f => emailsDe(f.datos.docentes))].filter(Boolean))];
  const enBase = new Map((emailsMencionados.length ? await q(`SELECT id, email, nombre, rol, escuela_id, activo, es_admin FROM docentes WHERE email = ANY($1::text[])`, [emailsMencionados]) : [])
    .map(d => [d.email, { ...d, id: Number(d.id), escuela_id: Number(d.escuela_id) }]));
  const nombresAl = [...new Set(ta.filas.map(f => limpio(f.datos.nombre).toLowerCase()).filter(Boolean))];
  const alumnosBase = new Map((nombresAl.length ? await q(`SELECT a.id, a.nombre, a.grado, f.contactos FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id
    WHERE a.escuela_id = $1 AND lower(a.nombre) = ANY($2::text[])`, [escuelaId, nombresAl]) : []).map(a => [a.nombre.toLowerCase(), { ...a, id: Number(a.id), contactos: a.contactos || [] }]));
  const idsAl = [...alumnosBase.values()].map(a => a.id);
  const asignBase = new Set((idsAl.length ? await q(`SELECT ad.alumno_id, d.email FROM alumno_docentes ad JOIN docentes d ON d.id = ad.docente_id WHERE ad.alumno_id = ANY($1::bigint[])`, [idsAl]) : [])
    .map(r => `${Number(r.alumno_id)}|${r.email}`));

  // --- docentes ---
  const docentes = [], vistosDoc = new Map(), docentesOk = new Set();
  for (const { fila, datos } of td.filas) {
    const v = validarDocente(datos);
    const r = { fila, estado: "error", nombre: v.nombre, email: v.email, rol: v.rol, admin: v.admin, mensajes: v.err, avisos: [] };
    docentes.push(r);
    if (v.err.length) continue;
    if (vistosDoc.has(v.email)) { r.estado = "duplicado"; r.avisos.push(`Repetida (ya está en la fila ${vistosDoc.get(v.email)}): se usa esa.`); continue; }
    vistosDoc.set(v.email, fila);
    const e = enBase.get(v.email);
    if (e && e.activo && e.escuela_id !== escuelaId) { r.mensajes.push("Ese email ya es de una docente activa de otra escuela."); continue; }
    if (e && Number(e.id) === Number(yo.id) && v.admin === false) { r.mensajes.push("No podés quitarte a vos misma el rol de admin."); continue; }
    if (!e) { r.estado = "nuevo"; r.avisos.push("Se suma sin contraseña y le llega un mail de bienvenida."); }
    else {
      r.estado = "actualiza"; r.id = e.id;
      if (!e.activo) { r.reactiva = true; r.avisos.push(e.escuela_id === escuelaId ? "Estaba desactivada: se reactiva y le llega el mail de bienvenida." : "Estaba desactivada en otra escuela: se suma a esta y le llega el mail de bienvenida."); }
      else if (e.nombre === v.nombre && (e.rol || "") === v.rol && (v.admin === null || !!e.es_admin === v.admin)) r.avisos.push("Ya estaba: sin cambios.");
    }
    docentesOk.add(v.email);
  }

  // --- alumnos ---
  const alumnos = [], vistosAl = new Map();
  for (const { fila, datos } of ta.filas) {
    const err = [], avs = [];
    let nombre = "";
    try { nombre = F.validarNombre(datos.nombre); } catch (e) { err.push(mensajeDe(e).replace("Falta el nombre del alumno", "Falta el nombre (obligatorio)")); }
    const grado = limpio(datos.grado).slice(0, 30);
    if (!grado) err.push("Falta el grado (obligatorio)");
    const emailsDoc = [...new Set(emailsDe(datos.docentes))];
    if (emailsDoc.length > 10) err.push("Hasta 10 docentes por alumno");
    for (const em of emailsDoc) {
      if (!S.emailValido(em)) { err.push(`Email de docente inválido: «${em.slice(0, 80)}»`); continue; }
      const e = enBase.get(em);
      const enEscuela = e && e.activo && e.escuela_id === escuelaId;
      if (docentesOk.has(em) || enEscuela) continue;
      if (vistosDoc.has(em) || td.filas.some(f => S.normEmail(f.datos.email) === em)) err.push(`La docente ${em} tiene errores en su fila: corregila primero.`);
      else err.push(`Docente inexistente: ${em} no es docente de la escuela ni está en la planilla de docentes.`);
    }
    const { contactos, err: errC } = validarContactosFila(datos);
    err.push(...errC);
    const r = { fila, estado: "error", nombre: nombre || limpio(datos.nombre).slice(0, 40), grado, docentes: emailsDoc, contactos, mensajes: err, avisos: avs };
    alumnos.push(r);
    if (err.length) continue;
    const k = nombre.toLowerCase();
    if (vistosAl.has(k)) {
      const prev = vistosAl.get(k);
      if (mismoGrado(prev.grado, grado)) { r.estado = "duplicado"; avs.push(`Repetido (ya está en la fila ${prev.fila}): se usa esa.`); }
      else r.mensajes.push(`Alumno duplicado: «${nombre}» también está en la fila ${prev.fila} con otro grado. Si son dos chicos, agregale una inicial (ej: «${nombre} P.»).`);
      continue;
    }
    vistosAl.set(k, { fila, grado });
    const ex = alumnosBase.get(k);
    if (ex && ex.grado && !mismoGrado(ex.grado, grado)) {
      r.mensajes.push(`Alumno duplicado en la escuela: ya hay un «${ex.nombre}» en ${ex.grado}. Si es otro chico, agregale una inicial (ej: «${nombre} P.»); si cambió de grado, cambialo primero en su ficha.`);
      continue;
    }
    if (!emailsDoc.length && !ex) avs.push("Sin docente asignada: por ahora solo lo ve la dirección.");
    let final = contactos, nuevosEmails = contactos.map(c => c.email).filter(Boolean);
    if (ex) {
      final = fusionarContactos(ex.contactos, contactos);
      if (final.length > MAX_CONTACTOS) { r.mensajes.push(`Con los contactos que ya tiene la ficha quedarían más de ${MAX_CONTACTOS}.`); continue; }
      const antes = new Set(ex.contactos.map(c => c.email).filter(Boolean));
      nuevosEmails = final.map(c => c.email).filter(e => e && !antes.has(e));
      r.estado = "actualiza"; r.id = ex.id; r.nombre = ex.nombre;
      if (ex.grado) r.grado = ex.grado; // mismo grado escrito distinto ("3° a" / "3° A"): queda como estaba
      const sinCambios = JSON.stringify(final.map(ordenado)) === JSON.stringify(ex.contactos.map(ordenado)) && ex.grado === r.grado
        && emailsDoc.every(em => asignBase.has(`${ex.id}|${em}`));
      if (sinCambios) avs.push("Ya estaba: sin cambios.");
    } else r.estado = "nuevo";
    r.contactos_final = final;
    r.invitar = nuevosEmails;
    if (nuevosEmails.length) avs.push(`Invitación por mail a: ${nuevosEmails.join(", ")} (al confirmar).`);
  }

  const resumen = { docentes: resumenVacio(), alumnos: resumenVacio(), vacias: td.vacias + ta.vacias, invitaciones: 0, bienvenidas: 0 };
  for (const r of docentes) { resumen.docentes[r.estado]++; if (r.estado === "nuevo" || r.reactiva) resumen.bienvenidas++; }
  for (const r of alumnos) { resumen.alumnos[r.estado]++; if (r.estado !== "error" && r.invitar) resumen.invitaciones += r.invitar.length; }
  const errores = [...td.errores.map(e => "Docentes: " + e), ...ta.errores.map(e => "Alumnos: " + e)];
  const avisosG = [...td.avisos.map(e => "Docentes: " + e), ...ta.avisos.map(e => "Alumnos: " + e)];
  // Piloto: tope de cupos. Cuentas nuevas = docentes nuevas o reactivadas + emails de familia que hoy no tienen cuenta (filas válidas).
  const nDoc = docentes.filter(r => r.estado === "nuevo" || (r.estado === "actualiza" && r.reactiva)).length;
  const nFam = (await piloto.familiasNuevas(alumnos.filter(r => r.estado !== "error" && r.estado !== "duplicado").flatMap(r => r.invitar || []))).length;
  const cu = await piloto.cupos();
  const excede = !cu.sin_tope && cu.usados + nDoc + nFam > cu.max;
  resumen.cupos = { usados: cu.usados, max: cu.max, nuevas: nDoc + nFam, libres: cu.libres, excede };
  if (excede) errores.push(cu.completo ? piloto.textoCompleto(cu)
    : `El piloto está completo para esta planilla: suma ${nDoc + nFam} cuentas nuevas (${nDoc} docentes, ${nFam} familias) y quedan ${cu.libres} de ${cu.max} cupos. Sacá filas y volvé a previsualizar.`);
  const hayErrores = errores.length > 0 || resumen.docentes.error > 0 || resumen.alumnos.error > 0;
  // La huella resume lo que se leyó de la planilla: confirmar exige la misma (lo que la persona vio en la vista previa).
  const huella = crypto.createHash("sha256").update(JSON.stringify([escuelaId, td.filas, ta.filas])).digest("base64url").slice(0, 32);
  return { docentes, alumnos, resumen, errores, avisos: avisosG, hay_errores: hayErrores, huella };
}

// Lo que ve el navegador (sin campos internos).
function informe(a, escuela) {
  const doc = r => ({ fila: r.fila, estado: r.estado, nombre: r.nombre, email: r.email, rol: r.rol, admin: r.admin, mensajes: r.mensajes, avisos: r.avisos });
  const al = r => ({ fila: r.fila, estado: r.estado, nombre: r.nombre, grado: r.grado, docentes: r.docentes,
    contactos: r.contactos.map(c => ({ nombre: c.nombre, vinculo: c.vinculo, email: c.email, telefono: c.telefono })), mensajes: r.mensajes, avisos: r.avisos });
  return { escuela, docentes: a.docentes.map(doc), alumnos: a.alumnos.map(al), resumen: a.resumen, errores: a.errores, avisos: a.avisos,
    hay_errores: a.hay_errores, huella: a.huella, limite_filas: MAX_FILAS };
}

// ---------- escritura (una transacción) ----------
function sentencias(a, escuelaId, yo) {
  const st = [];
  const docs = a.docentes.filter(r => r.estado === "nuevo" || r.estado === "actualiza");
  const nuevosDoc = docs.filter(r => r.estado === "nuevo"), existDoc = docs.filter(r => r.estado === "actualiza");
  if (existDoc.length) {
    // Solo si sigue siendo de esta escuela o está desactivada (nunca le saca una docente activa a otra escuela).
    st.push([`UPDATE docentes d SET nombre = x.nombre, rol = x.rol, es_admin = COALESCE(x.admin, CASE WHEN d.escuela_id = $1 THEN d.es_admin ELSE false END),
        escuela_id = $1, activo = true
      FROM jsonb_to_recordset($2::jsonb) AS x(email text, nombre text, rol text, admin boolean)
      WHERE d.email = x.email AND (d.escuela_id = $1 OR NOT d.activo)`,
      [escuelaId, JSON.stringify(existDoc.map(r => ({ email: r.email, nombre: r.nombre, rol: r.rol, admin: r.admin })))]]);
    // Si venía de otra escuela, se le quitan los alumnos que tenía asignados allá.
    st.push([`DELETE FROM alumno_docentes ad USING docentes d, alumnos al WHERE ad.docente_id = d.id AND ad.alumno_id = al.id
      AND d.email = ANY($2::text[]) AND al.escuela_id <> $1`, [escuelaId, existDoc.map(r => r.email)]]);
  }
  if (nuevosDoc.length) st.push([`INSERT INTO docentes (escuela_id, email, nombre, rol, es_admin)
      SELECT $1, x.email, x.nombre, x.rol, COALESCE(x.admin, false) FROM jsonb_to_recordset($2::jsonb) AS x(email text, nombre text, rol text, admin boolean)
      ON CONFLICT (email) DO NOTHING`,
    [escuelaId, JSON.stringify(nuevosDoc.map(r => ({ email: r.email, nombre: r.nombre, rol: r.rol, admin: r.admin })))]]);

  const als = a.alumnos.filter(r => r.estado === "nuevo" || r.estado === "actualiza");
  if (als.length) {
    const datos = JSON.stringify(als.map(r => ({ nombre: r.nombre, grado: r.grado, contactos: r.contactos_final, docentes: r.docentes })));
    st.push([`INSERT INTO alumnos (escuela_id, nombre, grado, creado_por)
        SELECT $1, x.nombre, x.grado, $3 FROM jsonb_to_recordset($2::jsonb) AS x(nombre text, grado text)
        ON CONFLICT (escuela_id, nombre) DO UPDATE SET grado = EXCLUDED.grado`, [escuelaId, datos, yo.id]]);
    st.push([`INSERT INTO fichas (alumno_id, contactos, actualizado_por)
        SELECT a.id, x.contactos, $3 FROM jsonb_to_recordset($2::jsonb) AS x(nombre text, contactos jsonb)
        JOIN alumnos a ON a.escuela_id = $1 AND a.nombre = x.nombre
        ON CONFLICT (alumno_id) DO UPDATE SET contactos = EXCLUDED.contactos, actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`,
      [escuelaId, datos, yo.email]]);
    // Los emails de los contactos son los que pueden entrar como familia (igual que al guardar la ficha; acá solo se suman).
    st.push([`INSERT INTO familias (email) SELECT DISTINCT c->>'email' FROM jsonb_to_recordset($1::jsonb) AS x(contactos jsonb),
        jsonb_array_elements(x.contactos) c WHERE coalesce(c->>'email', '') <> '' ON CONFLICT (email) DO NOTHING`, [datos]]);
    st.push([`INSERT INTO familia_alumno (familia_id, alumno_id)
        SELECT f.id, a.id FROM jsonb_to_recordset($2::jsonb) AS x(nombre text, contactos jsonb)
        JOIN alumnos a ON a.escuela_id = $1 AND a.nombre = x.nombre
        CROSS JOIN LATERAL jsonb_array_elements(x.contactos) c
        JOIN familias f ON f.email = c->>'email' ON CONFLICT DO NOTHING`, [escuelaId, datos]]);
    st.push([`INSERT INTO alumno_docentes (alumno_id, docente_id, asignado_por)
        SELECT a.id, d.id, $3 FROM jsonb_to_recordset($2::jsonb) AS x(nombre text, docentes jsonb)
        JOIN alumnos a ON a.escuela_id = $1 AND a.nombre = x.nombre
        CROSS JOIN LATERAL jsonb_array_elements_text(x.docentes) em
        JOIN docentes d ON d.email = em AND d.escuela_id = $1 AND d.activo ON CONFLICT DO NOTHING`, [escuelaId, datos, yo.id]]);
  }
  return st;
}

// ---------- envíos (después de escribir; de a tandas) ----------
const pausa = ms => new Promise(r => setTimeout(r, ms));

async function bienvenida(req, email, escuela) {
  const k = "bienvenida:" + email;
  if (await S.superaLimite(k, 1, HORAS_BIENVENIDA * 60)) return "reciente";
  const d = await uno("SELECT nombre FROM docentes WHERE email = $1 AND escuela_id = $2 AND activo", [email, escuela.id]);
  if (!d) return "fallo";
  await S.registrarIntento(k);
  const ok = await avisos.accesoAprobado(req, { nombre: d.nombre, email, escuela: escuela.nombre });
  if (!ok) await S.limpiarIntentos(k);
  return ok ? "enviada" : "fallo";
}

async function familiaPendiente(req, p, escuela, yo) {
  const a = await uno(`SELECT a.id, a.nombre, f.contactos FROM alumnos a JOIN fichas f ON f.alumno_id = a.id WHERE a.id = $1 AND a.escuela_id = $2`, [Number(p.alumno_id) || 0, escuela.id]);
  const c = a && (a.contactos || []).find(x => x.email && x.email === S.normEmail(p.email));
  if (!c) return "fallo";
  return inv.invitar(req, { alumno: { id: Number(a.id), nombre: a.nombre }, email: c.email, docente: yo, contacto: c.nombre });
}

// Manda hasta LOTE_ENVIOS y devuelve { enviadas, recientes, fallidas, pendientes } (pendientes = lo que quedó para otra vuelta).
async function enviar(req, pendientes, escuela, yo) {
  const out = { enviadas: 0, recientes: 0, fallidas: 0, detalle_fallidas: [], pendientes: pendientes.slice(LOTE_ENVIOS) };
  const lento = modoCorreo() === "resend"; // Resend limita los pedidos por segundo
  let primero = true;
  for (const p of pendientes.slice(0, LOTE_ENVIOS)) {
    if (lento && !primero) await pausa(550);
    primero = false;
    let r;
    try { r = p.tipo === "docente" ? await bienvenida(req, S.normEmail(p.email), escuela) : await familiaPendiente(req, p, escuela, yo); }
    catch (e) { console.error("[puente] envío de importación falló:", e.message); r = "fallo"; }
    if (r === "enviada") out.enviadas++;
    else if (r === "reciente") out.recientes++;
    else { out.fallidas++; out.detalle_fallidas.push({ tipo: p.tipo === "docente" ? "docente" : "familia", email: S.normEmail(p.email) }); }
  }
  return out;
}

// ---------- acciones ----------
function puedeImportar(yo) {
  if (!yo || (!yo.es_admin && !S.esPlataforma(yo))) throw errorPublico("Solo la dirección (admins de la escuela) puede importar docentes y alumnos.", 403);
}

// Destino: la escuela de quien importa. La plataforma puede elegir otra (escuela_id).
async function escuelaDestino(yo, escuelaId) {
  const id = escuelaId == null || escuelaId === "" ? Number(yo.escuela_id) : Number(escuelaId);
  if (!Number.isInteger(id) || id <= 0) throw errorPublico("Escuela inválida");
  if (id !== Number(yo.escuela_id) && !S.esPlataforma(yo)) throw errorPublico("Solo podés importar en tu propia escuela.", 403);
  const e = await uno("SELECT id, nombre FROM escuelas WHERE id = $1", [id]);
  if (!e) throw errorPublico("No encontramos esa escuela", 404);
  return { id: Number(e.id), nombre: e.nombre };
}

async function limitar(yo, accion) {
  const [max, min] = LIMITES[accion];
  const k = `${accion}:${yo.id}`;
  if (await S.superaLimite(k, max, min)) throw errorPublico("Hiciste muchas importaciones seguidas. Esperá unos minutos y probá de nuevo.", 429);
  await S.registrarIntento(k);
}

function tamano(req, b) {
  const largo = Number(req.headers?.["content-length"]) || (typeof req.body === "string" ? Buffer.byteLength(req.body) : Buffer.byteLength(JSON.stringify(b || {})));
  if (largo > MAX_BYTES) throw errorPublico("El archivo es demasiado grande (máximo 2 MB). Partilo en varios.", 413);
}

async function manejar(req, res, yo, b) {
  puedeImportar(yo);
  if (!LIMITES[b.accion]) throw errorPublico("Acción desconocida");
  tamano(req, b);
  const escuela = await escuelaDestino(yo, b.escuela_id);
  await limitar(yo, b.accion);

  if (b.accion === "importar_enviar") {
    const pend = Array.isArray(b.pendientes) ? b.pendientes.slice(0, MAX_FILAS * (MAX_CONTACTOS + 1))
      .filter(p => p && typeof p === "object").map(p => ({ tipo: p.tipo === "docente" ? "docente" : "familia", email: String(p.email || ""), alumno_id: Number(p.alumno_id) || 0 })) : [];
    return res.status(200).json({ envios: await enviar(req, pend, escuela, yo) });
  }

  const a = await analizar({ docentes: b.docentes, alumnos: b.alumnos }, escuela.id, yo);
  if (b.accion === "importar_previa") return res.status(200).json({ ...informe(a, escuela), escrito: false });

  // importar_confirmar
  if (!b.huella || b.huella !== a.huella) return res.status(409).json({ error: "Los datos cambiaron desde la vista previa. Volvé a previsualizar antes de confirmar.", ...informe(a, escuela) });
  if (a.resumen.cupos?.excede) return res.status(409).json({ error: a.errores[a.errores.length - 1], completo: true, ...informe(a, escuela), escrito: false });
  if (a.errores.length) return res.status(409).json({ error: "La planilla tiene errores de formato: no se importó nada.", ...informe(a, escuela), escrito: false });
  const omitir = b.omitir_errores === true;
  if (a.hay_errores && !omitir) return res.status(409).json({ error: "Hay filas con errores: no se importó nada. Corregilas, o elegí importar solo las filas válidas.", ...informe(a, escuela), escrito: false });
  const st = sentencias(a, escuela.id, yo);
  if (st.length) await transaccion(st);

  // Ya escrito. Avisos: bienvenida a docentes nuevas o reactivadas; invitación a cada email nuevo de las familias.
  const pendientes = a.docentes.filter(r => r.estado === "nuevo" || r.reactiva).map(r => ({ tipo: "docente", email: r.email }));
  const conInv = a.alumnos.filter(r => (r.estado === "nuevo" || r.estado === "actualiza") && r.invitar?.length);
  if (conInv.length) {
    const ids = new Map((await q("SELECT id, nombre FROM alumnos WHERE escuela_id = $1 AND nombre = ANY($2::text[])", [escuela.id, conInv.map(r => r.nombre)])).map(x => [x.nombre, Number(x.id)]));
    for (const r of conInv) for (const email of r.invitar) if (ids.get(r.nombre)) pendientes.push({ tipo: "familia", alumno_id: ids.get(r.nombre), email });
  }
  const envios = await enviar(req, pendientes, escuela, yo);
  const omitidas = a.docentes.filter(r => r.estado === "error").length + a.alumnos.filter(r => r.estado === "error").length;
  return res.status(200).json({ ...informe(a, escuela), escrito: true, omitidas, envios });
}

module.exports = { manejar, analizar, parsearCsv, leerTabla, fusionarContactos, COLS_DOCENTES, COLS_ALUMNOS, MAX_FILAS, MAX_BYTES, LOTE_ENVIOS };

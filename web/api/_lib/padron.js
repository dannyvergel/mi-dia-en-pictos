// Padrón oficial de escuelas de Santa Fe en Postgres (tabla padron_escuelas) y búsqueda.
// Los datos salen de data/escuelas-santa-fe.json (lo genera scripts/padron.js desde el XLSX del Ministerio de Educación).
// Se cargan solos (idempotente, por lotes) la primera vez que se busca, o con `npm run migrar`;
// si el archivo cambia de versión (nueva fecha del padrón), se actualiza y se sacan las que ya no están.
const { q, uno } = require("./db");

const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
// Texto de búsqueda: nombre + localidad, normalizado, con espacios a los costados para buscar por comienzo de palabra.
const textoBusqueda = e => ` ${norm(e.nombre)} ${norm(e.localidad)} `;

// Palabras que no ayudan a buscar ("escuela n.º 2085" → "2085"), salvo que no quede otra cosa.
const VACIAS = new Set(["escuela", "esc", "nro", "n", "no", "nº", "numero", "num", "de", "del", "la", "el", "los", "las", "y", "en"]);
function terminos(texto) {
  const t = norm(texto).split(" ").filter(Boolean).slice(0, 6);
  const utiles = t.filter(x => !VACIAS.has(x));
  return utiles.length ? utiles : t;
}

const NIVELES = { temprana: "educación temprana", maternal: "jardín maternal", inicial: "inicial", primario: "primario", secundario: "secundario",
  snu: "superior", integracion: "integración", fp: "formación profesional", alfabetizacion: "alfabetización" };
const MODALIDADES = [["especial", "Educación Especial"], ["comun", "Común"], ["adultos", "Adultos"], ["hospitalaria", "Hospitalaria"]];
// ["especial.primario", "comun.inicial"] → "Educación Especial (primario) · Común (inicial)"
function describirOfertas(ofertas = []) {
  const partes = MODALIDADES.map(([k, nombre]) => {
    const niv = ofertas.filter(o => o === k || o.startsWith(k + ".")).map(o => NIVELES[o.split(".")[1]]).filter(Boolean);
    return ofertas.some(o => o === k || o.startsWith(k + ".")) ? nombre + (niv.length ? ` (${niv.join(", ")})` : "") : null;
  }).filter(Boolean);
  if (ofertas.includes("artistica")) partes.push("Talleres de artística");
  if (ofertas.includes("complementarios")) partes.push("Servicios complementarios");
  return partes.join(" · ");
}

// ---------- datos ----------
// Archivo compacto (campos + filas) → objetos. Lo escribe scripts/padron.js (aArchivo).
function desdeArchivo(d) {
  return d.filas.map(f => Object.fromEntries(d.campos.map((k, i) => [k, k === "ofertas" ? String(f[i] || "").split(" ").filter(Boolean) : (f[i] || null)])));
}
let datos = null;
function archivo() {
  if (!datos) {
    const d = require("../../data/escuelas-santa-fe.json"); // va en el paquete de la función (scripts/ no: está en .vercelignore)
    datos = { meta: d, escuelas: desdeArchivo(d) };
  }
  return datos;
}
const versionDe = d => `${d.meta.fecha_actualizacion || "?"}:${d.escuelas.length}`;
// Solo tests: otros datos (mismo formato que desdeArchivo).
function usarDatosDePrueba(escuelas, fecha = "2000-01-01") {
  datos = escuelas ? { meta: { fecha_actualizacion: fecha }, escuelas } : null;
  listo = null;
}

const COLS = "cue, nombre, numero, domicilio, localidad, departamento, cp, telefono, email, sector, ambito, ofertas, especial";
const TABLA = [
  `CREATE TABLE IF NOT EXISTS padron_escuelas (
    cue TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    numero TEXT,
    domicilio TEXT NOT NULL DEFAULT '',
    localidad TEXT NOT NULL DEFAULT '',
    departamento TEXT NOT NULL DEFAULT '',
    cp TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    sector TEXT NOT NULL DEFAULT '',
    ambito TEXT NOT NULL DEFAULT '',
    ofertas TEXT NOT NULL DEFAULT '',
    especial BOOLEAN NOT NULL DEFAULT false,
    busqueda TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS padron_escuelas_numero ON padron_escuelas (numero)`,
  `CREATE TABLE IF NOT EXISTS padron_meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`
];

// pg_trgm (está en Neon) acelera el LIKE '%…%'. Si no está, la búsqueda funciona igual (son ~5000 filas).
async function indiceTrigram() {
  try {
    await q("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await q("CREATE INDEX IF NOT EXISTS padron_escuelas_trgm ON padron_escuelas USING gin (busqueda gin_trgm_ops)");
    return true;
  } catch { return false; }
}

async function cargar(d) {
  const filas = d.escuelas.map(e => ({
    cue: e.cue, nombre: e.nombre, numero: e.numero || null, domicilio: e.domicilio || "", localidad: e.localidad || "",
    departamento: e.departamento || "", cp: e.cp || "", telefono: e.telefono || "", email: e.email || "", sector: e.sector || "",
    ambito: e.ambito || "", ofertas: (e.ofertas || []).join(" "), especial: (e.ofertas || []).some(o => o.startsWith("especial")),
    busqueda: textoBusqueda(e)
  }));
  for (let i = 0; i < filas.length; i += 500) {
    await q(`INSERT INTO padron_escuelas (${COLS}, busqueda)
      SELECT ${COLS}, busqueda FROM jsonb_to_recordset($1::jsonb) AS x(cue text, nombre text, numero text, domicilio text, localidad text,
        departamento text, cp text, telefono text, email text, sector text, ambito text, ofertas text, especial boolean, busqueda text)
      ON CONFLICT (cue) DO UPDATE SET nombre = EXCLUDED.nombre, numero = EXCLUDED.numero, domicilio = EXCLUDED.domicilio,
        localidad = EXCLUDED.localidad, departamento = EXCLUDED.departamento, cp = EXCLUDED.cp, telefono = EXCLUDED.telefono,
        email = EXCLUDED.email, sector = EXCLUDED.sector, ambito = EXCLUDED.ambito, ofertas = EXCLUDED.ofertas,
        especial = EXCLUDED.especial, busqueda = EXCLUDED.busqueda`, [JSON.stringify(filas.slice(i, i + 500))]);
  }
  await q("DELETE FROM padron_escuelas WHERE cue NOT IN (SELECT jsonb_array_elements_text($1::jsonb))", [JSON.stringify(filas.map(f => f.cue))]);
  await q(`INSERT INTO padron_meta (clave, valor) VALUES ('version', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`, [versionDe(d)]);
  return filas.length;
}

// Crea la tabla y la carga si falta o si cambió la versión del archivo. Una vez por instancia.
let listo = null;
async function asegurarPadron() {
  if (!listo) listo = (async () => {
    for (const s of TABLA) await q(s);
    const d = archivo();
    const v = await uno("SELECT valor FROM padron_meta WHERE clave = 'version'");
    if (v?.valor === versionDe(d) && await uno("SELECT 1 AS x FROM padron_escuelas LIMIT 1")) return { cargadas: 0, version: v.valor };
    const n = await cargar(d);
    const trgm = await indiceTrigram();
    console.log(`[puente] padrón de escuelas cargado: ${n} (${versionDe(d)})${trgm ? " con pg_trgm" : ""}`);
    return { cargadas: n, version: versionDe(d), trgm };
  })().catch(e => { listo = null; throw e; });
  return listo;
}

function publica(f, completa = true) {
  const ofertas = String(f.ofertas || "").split(" ").filter(Boolean);
  const base = { cue: f.cue, nombre: f.nombre, numero: f.numero, domicilio: f.domicilio, localidad: f.localidad, departamento: f.departamento,
    sector: f.sector, especial: !!f.especial, modalidad: describirOfertas(ofertas) };
  return completa ? { ...base, cp: f.cp, telefono: f.telefono, email: f.email, ambito: f.ambito, ofertas } : base;
}

// Hasta 10 escuelas por nombre, número ("escuela 2085", "2085"), CUE o localidad. Sin acentos ni mayúsculas.
// Orden: número exacto, frase completa en el nombre, Educación Especial primero, después alfabético.
async function buscar(texto, { completa = true, limite = 10 } = {}) {
  const t = terminos(texto);
  if (!t.length || norm(texto).length < 2) return [];
  await asegurarPadron();
  const params = [], cond = [], puntos = [];
  for (const x of t) {
    params.push(x); const p = "$" + params.length;
    if (/^\d+$/.test(x)) {
      cond.push(`(numero = ${p}${x.length >= 5 ? ` OR cue LIKE ${p} || '%'` : ""} OR busqueda LIKE '% ' || ${p} || '%')`);
      puntos.push(`(CASE WHEN numero = ${p} THEN 100 ELSE 0 END)`);
    } else cond.push(`busqueda LIKE '% ' || ${p} || '%'`);
  }
  params.push(" " + t.join(" ")); const frase = "$" + params.length;
  params.push(Math.min(Math.max(Number(limite) || 10, 1), 10));
  const filas = await q(`SELECT ${COLS} FROM padron_escuelas WHERE ${cond.join(" AND ")}
    ORDER BY (${[...puntos, `(CASE WHEN position(${frase} in busqueda) > 0 THEN 20 ELSE 0 END)`, "(CASE WHEN especial THEN 50 ELSE 0 END)"].join(" + ")}) DESC,
      nombre, cue LIMIT $${params.length}`, params);
  return filas.map(f => publica(f, completa));
}

async function porCue(cue) {
  if (!/^\d{9}$/.test(String(cue || ""))) return null;
  await asegurarPadron();
  const f = await uno(`SELECT ${COLS} FROM padron_escuelas WHERE cue = $1`, [String(cue)]);
  return f ? publica(f) : null;
}

// Campos de la ficha de escuela que se completan desde el padrón.
function fichaDesdePadron(p) {
  return {
    cue: p.cue, nombre: p.nombre, domicilio: p.domicilio || "", localidad: p.localidad || "", departamento: p.departamento || "",
    modalidad: p.modalidad || "", email: String(p.email || "").split(",")[0].trim(), telefono: p.telefono || ""
  };
}

// La escuela de Puente con ese CUE, o la crea con los datos del padrón. Devuelve { escuela, creada } o null si el CUE no está.
async function escuelaPorCue(cue) {
  const existe = await uno("SELECT id, nombre, cue FROM escuelas WHERE cue = $1", [String(cue || "")]);
  if (existe) return { escuela: existe, creada: false };
  const p = await porCue(cue);
  if (!p) return null;
  const f = fichaDesdePadron(p);
  try {
    const e = await uno(`INSERT INTO escuelas (nombre, cue, domicilio, localidad, departamento, modalidad, email, telefono)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, nombre, cue`,
      [f.nombre, f.cue, f.domicilio, f.localidad, f.departamento, f.modalidad, f.email, f.telefono]);
    return { escuela: e, creada: true };
  } catch (e) {
    if (String(e.code) !== "23505") throw e; // otra la creó al mismo tiempo
    return { escuela: await uno("SELECT id, nombre, cue FROM escuelas WHERE cue = $1", [String(cue)]), creada: false };
  }
}

module.exports = { desdeArchivo, norm, terminos, textoBusqueda, describirOfertas, asegurarPadron, buscar, porCue, fichaDesdePadron, escuelaPorCue, usarDatosDePrueba };

// Padrón Oficial de Establecimientos Educativos (Ministerio de Educación de la Nación) → datos de escuelas de Santa Fe.
//
//   cd web && npm run padron                      → baja el XLSX oficial (PADRON_URL) y escribe data/escuelas-santa-fe.json
//   cd web && npm run padron -- ruta/al/padron.xlsx  → usa un archivo ya bajado
//
// Sin dependencias: lee el XLSX (zip + XML) con zlib. Solo guarda datos institucionales públicos del padrón
// (CUE, nombre, domicilio, localidad, contacto institucional, sector y ofertas); no hay datos de personas.
// Fuente: https://www.argentina.gob.ar/educacion/evaluacion-e-informacion-educativa/padron-oficial-de-establecimientos-educativos
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PADRON_URL = process.env.PADRON_URL ||
  "https://www.argentina.gob.ar/sites/default/files/2026.09.07_padron_oficial_establecimientos_educativos_die.xlsx";
const PAGINA = "https://www.argentina.gob.ar/educacion/evaluacion-e-informacion-educativa/padron-oficial-de-establecimientos-educativos";
const SALIDA = path.join(__dirname, "..", "data", "escuelas-santa-fe.json");
const SANTA_FE = "82"; // los 2 primeros dígitos del CUE son la jurisdicción

// ---------- zip mínimo (solo lectura) ----------
function leerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("No es un XLSX (zip) válido");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const archivos = {};
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Zip dañado");
    const metodo = buf.readUInt16LE(p + 10), comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28), largoExtra = buf.readUInt16LE(p + 30), largoComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    archivos[nombre] = () => {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const datos = buf.subarray(ini, ini + comprimido);
      if (metodo === 0) return datos;
      if (metodo === 8) return zlib.inflateRawSync(datos);
      throw new Error("Compresión zip no soportada: " + metodo);
    };
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return archivos;
}

// ---------- XLSX → filas ----------
const desescapar = s => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) =>
  ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e.toLowerCase()] ??
  String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const textoDe = xml => desescapar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(""));
const colANum = letras => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

// Devuelve la primera hoja como array de filas; cada fila es un array de textos (índice = columna).
function leerXlsx(buf) {
  const z = leerZip(buf);
  const compartidos = z["xl/sharedStrings.xml"]
    ? [...z["xl/sharedStrings.xml"]().toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textoDe(m[1]))
    : [];
  const rels = z["xl/_rels/workbook.xml.rels"] ? z["xl/_rels/workbook.xml.rels"]().toString("utf8") : "";
  const wb = z["xl/workbook.xml"] ? z["xl/workbook.xml"]().toString("utf8") : "";
  const rid = (wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
  const destino = rid && (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) ||
    rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`)) || [])[1];
  const hoja = destino ? "xl/" + destino.replace(/^\/?xl\//, "").replace(/^\//, "") : "xl/worksheets/sheet1.xml";
  if (!z[hoja]) throw new Error("No encontré la hoja de datos en el XLSX");
  const xml = z[hoja]().toString("utf8");
  const filas = [];
  for (const mf of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const fila = [];
    let pos = 0;
    for (const mc of (mf[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mc[1], cuerpo = mc[2] || "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/);
      const col = ref ? colANum(ref[1]) : pos;
      pos = col + 1;
      const tipo = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      let v;
      if (tipo === "inlineStr") v = textoDe(cuerpo);
      else {
        const mv = cuerpo.match(/<v>([\s\S]*?)<\/v>/);
        if (!mv) continue;
        v = tipo === "s" ? compartidos[Number(mv[1])] ?? "" : desescapar(mv[1]);
      }
      fila[col] = v;
    }
    filas.push(fila);
  }
  return filas;
}

// ---------- filas del padrón → escuelas ----------
const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const limpio = s => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

// Columna (grupo + encabezado, normalizados) → código de oferta.
function codigoOferta(grupo, enc) {
  const g = norm(grupo), e = norm(enc);
  if (g === "comun") {
    if (e.includes("maternal")) return "comun.maternal";
    if (e.includes("jardin de infantes")) return "comun.inicial";
    if (e.startsWith("primario")) return "comun.primario";
    if (e.startsWith("secundario")) return "comun.secundario";
    if (e.startsWith("snu")) return "comun.snu";
  }
  if (g === "especial") {
    if (e.includes("temprana")) return "especial.temprana";
    if (e.includes("jardin de infantes") || e === "inicial") return "especial.inicial";
    if (e.startsWith("primario")) return "especial.primario";
    if (e.startsWith("secundario")) return "especial.secundario";
    if (e.startsWith("integracion")) return "especial.integracion";
  }
  if (g === "adultos") {
    if (e.startsWith("primario")) return "adultos.primario";
    if (e.startsWith("secundario")) return "adultos.secundario";
    if (e.startsWith("formacion profesional")) return "adultos.fp";
    if (e.startsWith("alfabetizacion")) return "adultos.alfabetizacion";
  }
  if (g === "hospitalaria") {
    if (e.startsWith("inicial")) return "hospitalaria.inicial";
    if (e.startsWith("primario")) return "hospitalaria.primario";
    if (e.startsWith("secundario")) return "hospitalaria.secundario";
  }
  if (g.startsWith("talleres")) return "artistica";
  if (g.startsWith("servicios complementarios")) return "complementarios";
  return null;
}

const SECTOR = { estatal: "estatal", privado: "privada", privada: "privada", "social/cooperativa": "social" };
function numeroDe(nombre) {
  const m = String(nombre).match(/\b(?:NRO|NUMERO|N[°º]|N\.)\s*\.?\s*(\d{1,5})(?!\d)/i);
  return m ? m[1] : null;
}
function emailsDe(s) {
  return [...new Set(String(s ?? "").toLowerCase().split(/[\s,;/]+/).filter(e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)))].join(", ");
}

// filas: salida de leerXlsx. Devuelve { fecha, escuelas: [...] } solo con la jurisdicción pedida y ofertas activas.
function parsearPadron(filas, { jurisdiccion = SANTA_FE } = {}) {
  const iEnc = filas.findIndex(f => f && norm(f[0]) === "jurisdiccion");
  if (iEnc < 0) throw new Error("No encontré la fila de encabezados (Jurisdicción, Sector, …) en el padrón");
  const enc = filas[iEnc], grupos = filas[iEnc - 1] || [];
  const fechaTxt = filas.slice(0, iEnc).map(f => (f || []).join(" ")).join(" ");
  const mf = fechaTxt.match(/actualizaci[oó]n:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const fecha = mf ? `${mf[3]}-${mf[2]}-${mf[1]}` : null;

  const largo = Math.max(enc.length, grupos.length);
  const col = {}, ofertas = [];
  let grupo = "";
  for (let i = 0; i < largo; i++) {
    if (grupos[i]) grupo = grupos[i];
    const e = norm(enc[i]);
    if (norm(grupo) === "modalidad") { if (e) col["mod." + e] = i; continue; }
    if (norm(grupo).startsWith("establecimiento")) { if (e) col[e] = i; continue; }
    const cod = codigoOferta(grupo, enc[i] || "");
    if (cod) ofertas.push([i, cod]);
  }
  const necesarias = ["jurisdiccion", "sector", "departamento", "localidad", "cueanexo", "nombre", "domicilio"];
  const falta = necesarias.filter(k => col[k] === undefined);
  if (falta.length) throw new Error("Faltan columnas en el padrón: " + falta.join(", "));
  const v = (f, k) => col[k] === undefined ? "" : limpio(f[col[k]]);
  const activo = x => x !== undefined && x !== null && String(x).trim() !== "" && String(x).trim() !== "0";

  const escuelas = [], vistos = new Set();
  for (const f of filas.slice(iEnc + 1)) {
    if (!f) continue;
    const cue = v(f, "cueanexo").replace(/\D/g, "").padStart(9, "0");
    if (!/^\d{9}$/.test(cue) || !cue.startsWith(jurisdiccion) || vistos.has(cue)) continue;
    const of = new Set(ofertas.filter(([i]) => activo(f[i])).map(([, c]) => c));
    if (activo(f[col["mod.comun"]]) && ![...of].some(c => c.startsWith("comun."))) of.add("comun");
    if (activo(f[col["mod.especial"]]) && ![...of].some(c => c.startsWith("especial."))) of.add("especial");
    if (activo(f[col["mod.adultos"]]) && ![...of].some(c => c.startsWith("adultos."))) of.add("adultos");
    if (!of.size) continue; // el padrón lista ofertas activas: sin ninguna, no está activa
    vistos.add(cue);
    const nombre = v(f, "nombre");
    escuelas.push({
      cue, nombre, numero: numeroDe(nombre),
      domicilio: v(f, "domicilio"), localidad: v(f, "localidad"), departamento: v(f, "departamento"),
      cp: v(f, "c. p.") || v(f, "c.p.") || v(f, "codigo postal"),
      telefono: v(f, "telefono"), email: emailsDe(v(f, "mail")),
      sector: SECTOR[norm(v(f, "sector"))] || norm(v(f, "sector")), ambito: norm(v(f, "ambito")),
      ofertas: [...of].sort()
    });
  }
  return { fecha, escuelas };
}

// Formato compacto del archivo de datos: campos + filas (un array por escuela).
const CAMPOS = ["cue", "nombre", "numero", "domicilio", "localidad", "departamento", "cp", "telefono", "email", "sector", "ambito", "ofertas"];
function aArchivo({ fecha, escuelas }, url = PADRON_URL) {
  return {
    fuente: "Padrón Oficial de Establecimientos Educativos, Ministerio de Educación de la Nación (DIE)",
    pagina: PAGINA, url, fecha_actualizacion: fecha, jurisdiccion: "Santa Fe (CUE 82…)",
    licencia: "Datos públicos del Estado nacional (también en datos.gob.ar bajo CC BY 4.0). Citar la fuente.",
    generado: new Date().toISOString().slice(0, 10), campos: CAMPOS,
    filas: escuelas.map(e => CAMPOS.map(k => k === "ofertas" ? e.ofertas.join(" ") : (e[k] ?? "")))
  };
}
const { desdeArchivo } = require("../api/_lib/padron");

async function main() {
  const arg = process.argv[2];
  let buf, url = PADRON_URL;
  if (arg && !/^https?:/.test(arg)) buf = fs.readFileSync(arg);
  else {
    url = arg || PADRON_URL;
    console.log("Bajando", url);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo bajar el padrón (HTTP ${r.status})`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  const datos = parsearPadron(leerXlsx(buf));
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  const json = JSON.stringify(aArchivo(datos, url));
  fs.writeFileSync(SALIDA, json + "\n");
  const esp = datos.escuelas.filter(e => e.ofertas.some(o => o.startsWith("especial"))).length;
  console.log(`Listo: ${datos.escuelas.length} establecimientos de Santa Fe (${esp} con educación especial), padrón del ${datos.fecha}. ${(json.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), SALIDA)}`);
}

module.exports = { leerZip, leerXlsx, parsearPadron, aArchivo, desdeArchivo, numeroDe, CAMPOS, SALIDA };
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });

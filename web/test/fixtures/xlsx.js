// Arma un XLSX chiquito en memoria (zip + XML) para probar el lector del padrón sin bajar el archivo oficial.
const zlib = require("zlib");

function zip(archivos) {
  const locales = [], centrales = [];
  let offset = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido), comp = zlib.deflateRawSync(datos), n = Buffer.from(nombre);
    const crc = zlib.crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(datos.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locales.push(local, n, comp); centrales.push(central, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrales), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(centrales.length / 2, 8); fin.writeUInt16LE(centrales.length / 2, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, cd, fin]);
}

const escXml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const letra = i => { let s = ""; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

// filas: { numeroDeFila: { columna(índice 0): valor } }. Los textos van a sharedStrings; los números, como número.
function xlsx(filas) {
  const compartidos = [], idx = new Map();
  const ss = v => { if (!idx.has(v)) { idx.set(v, compartidos.length); compartidos.push(v); } return idx.get(v); };
  const rows = Object.entries(filas).map(([r, celdas]) => `<row r="${r}">` + Object.entries(celdas).map(([c, v]) =>
    typeof v === "number" ? `<c r="${letra(+c)}${r}"><v>${v}</v></c>` : `<c r="${letra(+c)}${r}" t="s"><v>${ss(v)}</v></c>`).join("") + "</row>").join("");
  return zip({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<?xml version="1.0"?><sst>${compartidos.map(s => `<si><t xml:space="preserve">${escXml(s)}</t></si>`).join("")}</sst>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`
  });
}

// Un padrón con el mismo formato que el oficial (encabezado en 2 filas), con escuelas de Santa Fe y de otra jurisdicción.
const ENC = ["Jurisdicción", "Sector", "Ámbito", "Departamento", "Código de departamento", "Localidad", "Código de localidad", "Cueanexo", "Nombre",
  "Domicilio", "C. P.", "Teléfono", "Mail", "Común", "Especial", "Adultos", "Nivel inicial - Jardín maternal", "Nivel inicial - Jardín de infantes",
  "Primario", "Secundario", "Secundario - INET", "SNU", "SNU - INET", "SNU - Cursos", "Nivel inicial - Educación temprana",
  "Nivel inicial - Jardín de infantes", "Primario", "Secundario", "Integración a la modalidad común/ adultos", "Primario", "Secundario",
  "Formación Profesional", "Formación Profesional - INET", "Alfabetización", "Inicial", "Primario", "Secundario"];
const GRUPOS = { 0: "Establecimiento - Localización", 13: "Modalidad", 16: "Común", 24: "Especial", 29: "Adultos", 34: "Hospitalaria",
  37: "Talleres - Artística", 38: "Servicios complementarios", 39: "Validez_títulos" };
const fila = (base, marcas) => { const f = { ...base }; for (const i of marcas) f[i] = "1"; return f; };
function padronDePrueba() {
  const sf = (cue, nombre, localidad, extra = {}) => ({ 0: "Santa Fe", 1: "Estatal", 2: "Urbano", 3: "ROSARIO", 5: localidad, 7: cue, 8: nombre,
    9: "CALLE  123   CENTRO ", 10: "S2000", 11: "0341 4000000", 12: "Especial2085_Rosario@santafe.edu.ar / otra@x", ...extra });
  return xlsx({
    8: { 0: "Listado de establecimientos educativos y sus ofertas activas." },
    9: { 0: "Fuente: Padrón Oficial de Establecimientos Educativos" },
    10: { 0: "Fecha de actualización: 07/09/2026." },
    12: GRUPOS,
    13: Object.fromEntries(ENC.map((e, i) => [i, e])),
    14: fila({ 0: "Ciudad de Buenos Aires", 1: "Privado", 7: "020000100", 8: "INSTITUTO PORTEÑO", 5: "CIUDAD DE BUENOS AIRES" }, [13, 19]),
    15: fila(sf("820060800", "ESCUELA ESPECIAL NRO 2085 JUAN SALVADOR GAVIOTA", "TOTORAS"), [14, 24, 26, 28]),
    16: fila(sf("820002100", "ESCUELA ESPECIAL PART. INC. NRO 1242 ALBORADA", "ROSARIO", { 1: "Privado" }), [14, 26]),
    17: fila(sf("820446200", "E.E.S. ORIENTADA NRO 574 JUAN CARLOS GAUSEÑO", "PÉREZ"), [13, 19]),
    18: sf("829999900", "ESCUELA SIN OFERTAS ACTIVAS", "ROSARIO"),
    19: fila(sf(820123400, "JARDIN DE INFANTES NRO 98 ESTEBAN MARADONA", "ESPERANZA"), [13, 17, 37])
  });
}

module.exports = { zip, xlsx, padronDePrueba };

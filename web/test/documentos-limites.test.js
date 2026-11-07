// Límites contra abuso de informes y documentos: subidas por hora, documentos y bytes por alumno, descargas por hora y sesión.
// Usan el contador de intentos de _lib/seguridad.js (tabla limites). Los números salen de LIMITES_DOCUMENTOS (_lib/documentos.js).
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.FAMILIA_FUNCIONES = "";
const { baseNueva, entrarConCodigo, altaEscuela } = require("./ayuda");
const fichas = require("../api/fichas");
const docs = require("../api/_lib/documentos");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.ADMIN_EMAIL;
const post = (c, body) => c.llamar(fichas, { method: "POST", body });
const get = (c, query) => c.llamar(fichas, { method: "GET", query });
const PDF = Buffer.from("%PDF-1.4\n% limites\n%%EOF\n");
const ORIGINAL = { ...docs.LIMITES_DOCUMENTOS };
let pg, ana, bea, laura, juanId, sofiId;
const subir = (c, alumno = juanId, extra = {}) => post(c, { accion: "doc_subir", id: alumno, tipo: "informe", titulo: "Informe", nombre: "i.pdf",
  mime: "application/pdf", datos: PDF.toString("base64"), ...extra });
const reset = async () => { Object.assign(docs.LIMITES_DOCUMENTOS, ORIGINAL); await pg.query("DELETE FROM limites"); await pg.query("DELETE FROM documentos"); pg.archivos.clear(); };

test.before(async () => {
  pg = await baseNueva();
  const { escuela_id } = await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES ($1, 'bea@escuela.edu.ar', 'Bea')", [escuela_id]);
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  juanId = (await post(ana, { accion: "crear", nombre: "Juan", contactos: [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com" }] })).body.alumno.id;
  sofiId = (await post(ana, { accion: "crear", nombre: "Sofía", contactos: [] })).body.alumno.id;
  const beaId = Number((await pg.query("SELECT id FROM docentes WHERE email = 'bea@escuela.edu.ar'")).rows[0].id);
  for (const a of [juanId, sofiId]) await post(ana, { accion: "asignar", id: a, docente_id: beaId });
  bea = await entrarConCodigo(pg, "bea@escuela.edu.ar");
  laura = await entrarConCodigo(pg, "laura@mail.com", "familia");
});
test.afterEach(reset);

test("los límites viven en un solo objeto con valores razonables", () => {
  const L = docs.LIMITES_DOCUMENTOS;
  for (const k of ["subidasPorHora", "maxDocumentosPorAlumno", "maxBytesPorAlumno", "descargasPorHora"]) assert.ok(Number.isInteger(L[k]) && L[k] > 0, k);
  assert.ok(L.maxBytesPorAlumno >= docs.MAX_BYTES); // cabe al menos un archivo del máximo
});

test("subidas por hora y por usuario: la siguiente da 429 en español y no guarda nada", async () => {
  docs.LIMITES_DOCUMENTOS.subidasPorHora = 2;
  assert.equal((await subir(bea)).status, 200);
  assert.equal((await subir(bea, sofiId)).status, 200); // cuenta por usuario, no por alumno
  const antes = pg.archivos.size;
  const r = await subir(bea);
  assert.equal(r.status, 429);
  assert.match(r.body.error, /subiste|subidas|por hora/i);
  assert.equal(pg.archivos.size, antes);
  assert.equal((await subir(ana)).status, 200); // otra usuaria no se ve afectada
  // Pasada la ventana (se simula vaciando los intentos viejos) vuelve a andar.
  await pg.query("UPDATE limites SET creado = now() - interval '2 hours'");
  assert.equal((await subir(bea)).status, 200);
});

test("una subida inválida no gasta cupo de subidas", async () => {
  docs.LIMITES_DOCUMENTOS.subidasPorHora = 1;
  assert.equal((await subir(bea, juanId, { tipo: "otro" })).status, 400);
  assert.equal((await subir(bea, juanId, { nombre: "virus.exe", mime: "application/octet-stream" })).status, 400);
  assert.equal((await subir(bea)).status, 200);
  assert.equal((await subir(bea)).status, 429);
});

test("máximo de documentos por alumno: 413 al pasarse, pero otro alumno sigue", async () => {
  docs.LIMITES_DOCUMENTOS.maxDocumentosPorAlumno = 2;
  assert.equal((await subir(bea)).status, 200);
  assert.equal((await subir(bea)).status, 200);
  const antes = pg.archivos.size;
  const r = await subir(bea);
  assert.equal(r.status, 413);
  assert.match(r.body.error, /documentos/i);
  assert.equal(pg.archivos.size, antes);
  assert.equal((await subir(bea, sofiId)).status, 200);
  // Borrar uno libera lugar.
  const lista = (await get(bea, { documentos: String(juanId) })).body.documentos;
  assert.equal((await post(bea, { accion: "doc_borrar", doc_id: lista[0].id })).status, 200);
  assert.equal((await subir(bea)).status, 200);
});

test("máximo de bytes por alumno: 413 si el archivo nuevo haría pasar el total", async () => {
  docs.LIMITES_DOCUMENTOS.maxBytesPorAlumno = PDF.length * 2 + 1;
  assert.equal((await subir(bea)).status, 200);
  assert.equal((await subir(bea)).status, 200);
  const antes = pg.archivos.size;
  const r = await subir(bea);
  assert.equal(r.status, 413);
  assert.match(r.body.error, /espacio|MB|pesan/i);
  assert.equal(pg.archivos.size, antes);
  assert.equal((await subir(bea, sofiId)).status, 200);
});

test("descargas por hora y por sesión: docentes y familia reciben 429; otra sesión no se ve afectada", async () => {
  docs.LIMITES_DOCUMENTOS.descargasPorHora = 2;
  const id = (await subir(ana, juanId, { mostrar_familia: true })).body.documento.id;
  assert.equal((await get(bea, { documento: String(id) })).status, 200);
  assert.equal((await get(bea, { documento: String(id) })).status, 200);
  const r = await get(bea, { documento: String(id) });
  assert.equal(r.status, 429);
  assert.match(r.body.error, /descargas|por hora/i);
  // Otra sesión de la misma persona tiene su propio contador.
  const bea2 = await entrarConCodigo(pg, "bea@escuela.edu.ar");
  assert.equal((await get(bea2, { documento: String(id) })).status, 200);
  // Familia: lo mismo.
  assert.equal((await get(laura, { documento: String(id) })).status, 200);
  assert.equal((await get(laura, { documento: String(id) })).status, 200);
  assert.equal((await get(laura, { documento: String(id) })).status, 429);
  // Pedir un documento que no existe no gasta cupo.
  assert.equal((await get(bea2, { documento: "99999" })).status, 404);
  assert.equal((await get(bea2, { documento: String(id) })).status, 200);
  assert.equal((await get(bea2, { documento: String(id) })).status, 429);
});

test("listar documentos no cuenta como descarga", async () => {
  docs.LIMITES_DOCUMENTOS.descargasPorHora = 1;
  await subir(bea);
  for (let i = 0; i < 3; i++) assert.equal((await get(bea, { documentos: String(juanId) })).status, 200);
});

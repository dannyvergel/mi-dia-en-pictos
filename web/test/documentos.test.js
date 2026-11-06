// Informes y documentos que suben las seños y terapeutas (api/fichas.js + _lib/documentos.js).
// Corre con FAMILIA_FUNCIONES en el mínimo: los documentos los decide la seño uno por uno, no la variable.
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.FAMILIA_FUNCIONES = "";
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const fichas = require("../api/fichas");
const correo = require("../api/_lib/correo");
const { sanitizarNombre } = require("../api/_lib/documentos");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAIL; delete process.env.OPENROUTER_API_KEY;
const post = (c, body) => c.llamar(fichas, { method: "POST", body });
const get = (c, query) => c.llamar(fichas, { method: "GET", query });

const CONTENIDO = "CONTENIDO-SECRETO-DEL-INFORME";
const PDF = Buffer.from(`%PDF-1.4\n% ${CONTENIDO}\n%%EOF\n`);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("resto")]);
const DOCX = Buffer.from("PK\x03\x04....[Content_Types].xml....word/document.xml....", "latin1");
const b64 = b => b.toString("base64");
const TITULO = "Informe de fonoaudiología TITULO-PRIVADO";
const subir = (c, extra = {}) => post(c, { accion: "doc_subir", id: juanId, tipo: "informe", titulo: TITULO, nombre: "informe fono.pdf",
  mime: "application/pdf", datos: b64(PDF), ...extra });

let pg, ana, bea, carla, laura, pedro, juanId, sofiId, docId;

test.before(async () => {
  pg = await baseNueva();
  const { escuela_id } = await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES ($1, 'bea@escuela.edu.ar', 'Bea'), ($1, 'carla@escuela.edu.ar', 'Carla')", [escuela_id]);
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  juanId = (await post(ana, { accion: "crear", nombre: "Juan", contactos: [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com" }] })).body.alumno.id;
  sofiId = (await post(ana, { accion: "crear", nombre: "Sofía", contactos: [{ nombre: "Pedro", vinculo: "papá", email: "pedro@mail.com" }] })).body.alumno.id;
  const beaId = Number((await pg.query("SELECT id FROM docentes WHERE email = 'bea@escuela.edu.ar'")).rows[0].id);
  assert.equal((await post(ana, { accion: "asignar", id: juanId, docente_id: beaId })).status, 200);
  bea = await entrarConCodigo(pg, "bea@escuela.edu.ar");
  carla = await entrarConCodigo(pg, "carla@escuela.edu.ar");
  laura = await entrarConCodigo(pg, "laura@mail.com", "familia");
  pedro = await entrarConCodigo(pg, "pedro@mail.com", "familia");
});

test("la docente asignada sube y lista; la lista no trae la ruta del Blob", async () => {
  const r = await subir(bea);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  docId = r.body.documento.id;
  assert.equal(r.body.documento.visible_familia, false);
  assert.equal(r.body.documento.mime, "application/pdf");
  assert.equal(r.body.documento.bytes, PDF.length);
  assert.equal(r.body.documento.subido_por.nombre, "Bea");
  assert.equal(pg.archivos.size, 1);
  const ruta = [...pg.archivos.keys()][0];
  assert.match(ruta, new RegExp(`^documentos/${juanId}/[0-9a-f]{32}$`));
  const l = await get(bea, { documentos: String(juanId) });
  assert.equal(l.status, 200);
  assert.deepEqual(l.body.documentos.map(d => d.titulo), [TITULO]);
  assert.equal(JSON.stringify(l.body).includes("documentos/"), false);
  // La admin de la escuela también lo ve y lo descarga, con los headers de descarga.
  const d = await get(ana, { documento: String(docId) });
  assert.equal(d.status, 200);
  assert.ok(Buffer.isBuffer(d.body) && d.body.equals(PDF));
  assert.equal(d.headers["content-type"], "application/pdf");
  assert.match(d.headers["content-disposition"], /^attachment; filename="informe fono\.pdf"/);
  assert.equal(d.headers["cache-control"], "no-store");
  // Auditoría: sin títulos ni nombres en el detalle.
  const ev = (await pg.query("SELECT evento, objeto_id, detalle FROM auditoria WHERE evento LIKE 'doc_%' ORDER BY id")).rows;
  assert.deepEqual(ev.map(e => e.evento), ["doc_subir", "doc_ver"]);
  assert.equal(Number(ev[0].objeto_id), docId);
  assert.equal(JSON.stringify(ev).includes("TITULO") || JSON.stringify(ev).includes("informe fono"), false);
});

test("PNG y DOCX válidos entran; el nombre se sanitiza", async () => {
  const p = await post(bea, { accion: "doc_subir", id: juanId, tipo: "documento", titulo: "Foto del cuaderno", nombre: "../../etc/fo<to>.PNG", mime: "image/png", datos: b64(PNG) });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.documento.nombre_archivo, "foto.png");
  const w = await post(bea, { accion: "doc_subir", id: juanId, tipo: "documento", titulo: "Acta", nombre: "acta.docx", mime: "", datos: b64(DOCX) });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.equal(w.body.documento.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(sanitizarNombre('Informe "final"\r\n; año.pdf'), "Informe final año.pdf");
  // Se borran para no ensuciar los conteos de abajo.
  for (const id of [p.body.documento.id, w.body.documento.id]) assert.equal((await post(bea, { accion: "doc_borrar", doc_id: id })).status, 200);
});

test("tipo inválido, extensión no permitida, magic bytes que no coinciden o archivo grande → 400", async () => {
  assert.equal((await subir(bea, { tipo: "otro" })).status, 400);
  assert.equal((await subir(bea, { titulo: "" })).status, 400);
  assert.equal((await subir(bea, { nombre: "virus.exe", mime: "application/octet-stream" })).status, 400);
  assert.equal((await subir(bea, { nombre: "informe.html", mime: "text/html" })).status, 400);
  assert.equal((await subir(bea, { nombre: "informe.pdf", datos: b64(Buffer.from("<html>no soy un pdf</html>")) })).status, 400); // magic bytes
  assert.equal((await subir(bea, { nombre: "foto.png", mime: "application/pdf", datos: b64(PNG) })).status, 400); // mime ≠ extensión
  assert.equal((await subir(bea, { nombre: "acta.docx", mime: "", datos: b64(Buffer.from("PK\x03\x04 un zip cualquiera", "latin1")) })).status, 400);
  assert.equal((await subir(bea, { datos: "no es base64 !!" })).status, 400);
  const grande = Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024)]);
  const r = await subir(bea, { datos: b64(grande) });
  assert.equal(r.status, 400); assert.match(r.body.error, /3 MB/);
  assert.equal((await subir(bea, { notificar: true })).status, 400); // avisar sin mostrar
  assert.equal(pg.archivos.size, 1); // ninguno de estos dejó un archivo
});

test("una docente sin asignación no ve, no baja, no cambia, no borra ni sube", async () => {
  assert.equal((await get(carla, { documentos: String(juanId) })).status, 404);
  assert.equal((await get(carla, { documento: String(docId) })).status, 404);
  assert.equal((await post(carla, { accion: "doc_cambiar", doc_id: docId, mostrar_familia: true })).status, 404);
  assert.equal((await post(carla, { accion: "doc_borrar", doc_id: docId })).status, 404);
  assert.equal((await subir(carla)).status, 404);
  assert.equal(pg.archivos.size, 1);
});

test("la familia no lo ve hasta que se marca visible; después lo lista y lo descarga", async () => {
  assert.deepEqual((await get(laura, { documentos: String(juanId) })).body.documentos, []);
  assert.equal((await get(laura, { documento: String(docId) })).status, 404);
  const c = await post(bea, { accion: "doc_cambiar", doc_id: docId, mostrar_familia: true });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.documento.visible_familia, true);
  const l = await get(laura, { documentos: String(juanId) });
  assert.deepEqual(l.body.documentos.map(d => d.titulo), [TITULO]);
  assert.equal(l.body.documentos[0].subido_por, undefined);
  const d = await get(laura, { documento: String(docId) });
  assert.equal(d.status, 200);
  assert.ok(d.body.equals(PDF));
  assert.match(d.headers["content-disposition"], /^attachment;/);
  // La familia no puede cambiar ni borrar.
  assert.notEqual((await post(laura, { accion: "doc_borrar", doc_id: docId })).status, 200);
  assert.notEqual((await post(laura, { accion: "doc_cambiar", doc_id: docId, mostrar_familia: false })).status, 200);
  assert.equal(pg.archivos.size, 1);
});

test("la familia de otro alumno no accede", async () => {
  assert.deepEqual((await get(pedro, { documentos: String(juanId) })).body.documentos, []);
  assert.equal((await get(pedro, { documento: String(docId) })).status, 404);
  assert.equal((await cliente().llamar(fichas, { query: { documento: String(docId) } })).status, 401);
});

test("escuela desactivada: la familia deja de ver los documentos", async () => {
  await pg.query("UPDATE escuelas SET activa = false");
  try {
    assert.deepEqual((await get(laura, { documentos: String(juanId) })).body.documentos, []);
    assert.equal((await get(laura, { documento: String(docId) })).status, 404);
  } finally { await pg.query("UPDATE escuelas SET activa = true"); }
});

test("informar: manda el mail sin título, contenido ni adjunto; sin visible da 400", async () => {
  const buzon = correo.usarBuzonDePrueba(true);
  try {
    const r = await post(bea, { accion: "doc_cambiar", doc_id: docId, notificar: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.aviso_familia.enviados, 1);
    assert.ok(r.body.documento.notificado);
    assert.equal(buzon.length, 1);
    const m = buzon[0];
    assert.deepEqual(m.to, ["laura@mail.com"]);
    assert.equal(m.subject, "Nuevo informe de Juan en Puente");
    assert.match(m.text, /compartió un informe de Juan/);
    assert.match(m.text, /\/login\.html\?familia/);
    for (const t of ["TITULO-PRIVADO", "fonoaudiología", CONTENIDO, "informe fono"]) {
      assert.equal(m.text.includes(t), false, t); assert.equal(m.html.includes(t), false, t); assert.equal(m.subject.includes(t), false, t);
    }
    assert.equal("attachments" in m, false);
    // Ocultarlo borra la marca de aviso, y avisar sin visible da 400 (sin mail).
    const o = await post(bea, { accion: "doc_cambiar", doc_id: docId, mostrar_familia: false });
    assert.equal(o.body.documento.visible_familia, false); assert.equal(o.body.documento.notificado, null);
    assert.equal((await post(bea, { accion: "doc_cambiar", doc_id: docId, notificar: true })).status, 400);
    assert.equal(buzon.length, 1);
    // Subir ya visible y avisado en un solo paso.
    const s = await subir(bea, { mostrar_familia: true, notificar: true, titulo: "Otro TITULO-PRIVADO" });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.ok(s.body.documento.notificado);
    assert.equal(buzon.length, 2); assert.equal(buzon[1].text.includes("TITULO-PRIVADO"), false);
    assert.equal((await post(bea, { accion: "doc_borrar", doc_id: s.body.documento.id })).status, 200);
  } finally { correo.usarBuzonDePrueba(false); }
});

test("si Resend falla, el documento queda guardado y la respuesta lo avisa", async () => {
  process.env.RESEND_API_KEY = "re_test";
  const original = global.fetch;
  global.fetch = async () => new Response("caído", { status: 500 });
  const antes = pg.archivos.size;
  try {
    const r = await subir(bea, { mostrar_familia: true, notificar: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.aviso_familia.aviso, /quedó guardado/);
    assert.equal(r.body.documento.notificado, null);
    assert.equal(pg.archivos.size, antes + 1);
    assert.equal((await post(bea, { accion: "doc_borrar", doc_id: r.body.documento.id })).status, 200);
  } finally { global.fetch = original; delete process.env.RESEND_API_KEY; }
});

test("borrar: solo quien lo subió o la admin; quita el blob y la fila", async () => {
  // Ana (admin) sube uno: Bea (asignada, no admin) no lo puede borrar.
  const r = await subir(ana, { titulo: "De la dirección" });
  assert.equal(r.status, 200);
  const b = await post(bea, { accion: "doc_borrar", doc_id: r.body.documento.id });
  assert.equal(b.status, 403);
  assert.equal(r.body.documento.puede_borrar, true);
  assert.equal((await get(bea, { documentos: String(juanId) })).body.documentos.find(d => d.id === r.body.documento.id).puede_borrar, false);
  const antes = pg.archivos.size;
  assert.equal((await post(ana, { accion: "doc_borrar", doc_id: r.body.documento.id })).status, 200);
  assert.equal(pg.archivos.size, antes - 1);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM documentos WHERE id = $1", [r.body.documento.id])).rows[0].n, 0);
  assert.equal((await get(ana, { documento: String(r.body.documento.id) })).status, 404);
  assert.ok((await pg.query("SELECT 1 FROM auditoria WHERE evento = 'doc_borrar' AND objeto_id = $1", [r.body.documento.id])).rows.length);
});

test("la exportación de la familia lista los metadatos de los documentos visibles", async () => {
  await post(bea, { accion: "doc_cambiar", doc_id: docId, mostrar_familia: true });
  const oculto = (await subir(bea, { titulo: "Borrador interno" })).body.documento.id;
  const e = await get(laura, { exportar: "1" });
  assert.equal(e.status, 200);
  assert.deepEqual(e.body.documentos.map(d => d.titulo), [TITULO]);
  assert.equal(e.body.documentos[0].alumno_id, juanId);
  assert.equal(JSON.stringify(e.body).includes("documentos/"), false); // sin la ruta del Blob
  assert.equal(JSON.stringify(e.body).includes(CONTENIDO), false);     // sin el archivo
  assert.deepEqual((await get(pedro, { exportar: "1" })).body.documentos, []);
  assert.ok(oculto);
});

test("la baja del alumno borra sus documentos y sus archivos", async () => {
  // Sofía tiene uno propio, que no se tiene que tocar.
  const s = await post(ana, { accion: "doc_subir", id: sofiId, tipo: "documento", titulo: "De Sofía", nombre: "s.pdf", mime: "application/pdf", datos: b64(PDF) });
  assert.equal(s.status, 200);
  const deJuan = (await pg.query("SELECT count(*)::int AS n FROM documentos WHERE alumno_id = $1", [juanId])).rows[0].n;
  assert.ok(deJuan >= 2);
  const r = await post(ana, { accion: "borrar", id: juanId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.resumen.documentos, deJuan);
  assert.equal(r.body.resumen.blob_borrado, true);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM documentos WHERE alumno_id = $1", [juanId])).rows[0].n, 0);
  assert.deepEqual([...pg.archivos.keys()].filter(k => k.startsWith(`documentos/${juanId}/`)), []);
  assert.equal(pg.archivos.size, 1);
  assert.equal((await get(pedro, { documentos: String(sofiId) })).body.documentos.length, 0); // el de Sofía sigue oculto
  assert.equal((await get(ana, { documentos: String(sofiId) })).body.documentos.length, 1);
});

test("páginas: tarjetas de documentos, service worker nuevo sin caché de /api/ y privacidad", () => {
  const fs = require("fs"), path = require("path");
  const leer = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const sw = leer("sw.js");
  assert.ok(sw.includes("const C = 'pictos-v28'"));
  assert.ok(sw.includes("/^\\/(api|descargar)\\//"), "el SW no cachea /api/ (descargas incluidas)");
  const d = leer("docente.html");
  for (const t of ["Informes y documentos", 'id="docMostrar"', 'id="docNotificar"', "Solo equipo", "Visible para la familia", "Familia avisada el", "doc_subir", "doc_cambiar", "doc_borrar"]) assert.ok(d.includes(t), t);
  const f = leer("familia.html");
  assert.ok(f.includes("Informes y documentos") && f.includes("bajarArchivo"));
  assert.ok(leer("cuenta.js").includes("bajarArchivo"));
  const p = leer("privacidad.html");
  assert.ok(p.includes("Informes y documentos") && p.includes("Vercel Blob"));
  // La IA nunca recibe documentos: ningún módulo que habla con OpenRouter los toca.
  for (const m of ["api/_lib/chat.js", "api/_lib/tools.js", "api/_lib/modelos.js", "api/_lib/minimizar.js", "api/agente.js", "api/dia.js"]) assert.equal(/documentos/.test(leer(m)), false, m);
});

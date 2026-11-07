// Documentos reservados dentro del equipo (api/fichas.js + _lib/documentos.js, ver docs/documentos.md).
// Un documento reservado lo ven solo quien lo subió, la dirección de la escuela y la plataforma; nunca la familia.
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.FAMILIA_FUNCIONES = "";
const { baseNueva, entrarConCodigo, altaEscuela } = require("./ayuda");
const fichas = require("../api/fichas");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY;
process.env.ADMIN_EMAIL = "plataforma@puente.test";
const post = (c, body) => c.llamar(fichas, { method: "POST", body });
const get = (c, query) => c.llamar(fichas, { method: "GET", query });
const PDF = Buffer.from("%PDF-1.4\n% RESERVADO\n%%EOF\n");
let pg, ana, bea, carla, plat, laura, juanId, reservadoId, abiertoId;
const subir = (c, extra = {}) => post(c, { accion: "doc_subir", id: juanId, tipo: "informe", titulo: "Informe", nombre: "i.pdf",
  mime: "application/pdf", datos: PDF.toString("base64"), ...extra });

test.after(() => { delete process.env.ADMIN_EMAIL; });
test.before(async () => {
  pg = await baseNueva();
  const { escuela_id } = await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES ($1, 'bea@escuela.edu.ar', 'Bea'), ($1, 'carla@escuela.edu.ar', 'Carla')", [escuela_id]);
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES (NULL, 'plataforma@puente.test', 'Plataforma')");
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  juanId = (await post(ana, { accion: "crear", nombre: "Juan", contactos: [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com" }] })).body.alumno.id;
  for (const email of ["bea@escuela.edu.ar", "carla@escuela.edu.ar"]) {
    const id = Number((await pg.query("SELECT id FROM docentes WHERE email = $1", [email])).rows[0].id);
    assert.equal((await post(ana, { accion: "asignar", id: juanId, docente_id: id })).status, 200);
  }
  bea = await entrarConCodigo(pg, "bea@escuela.edu.ar");
  carla = await entrarConCodigo(pg, "carla@escuela.edu.ar");
  plat = await entrarConCodigo(pg, "plataforma@puente.test");
  laura = await entrarConCodigo(pg, "laura@mail.com", "familia");
});

test("la columna reservado existe, por defecto en false", async () => {
  const c = (await pg.query("SELECT column_default FROM information_schema.columns WHERE table_name = 'documentos' AND column_name = 'reservado'")).rows;
  assert.equal(c.length, 1);
  assert.match(c[0].column_default, /false/);
});

test("subir reservado: lo ven quien lo subió, la dirección y la plataforma; otra asignada no", async () => {
  const a = await subir(bea, { reservado: true, titulo: "Reservado" });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.documento.reservado, true);
  assert.equal(a.body.documento.visible_familia, false);
  reservadoId = a.body.documento.id;
  abiertoId = (await subir(bea, { titulo: "Abierto" })).body.documento.id;
  assert.equal((await get(bea, { documentos: String(juanId) })).body.documentos.length, 2);
  assert.equal((await get(ana, { documentos: String(juanId) })).body.documentos.length, 2);
  assert.equal((await get(plat, { documentos: String(juanId) })).body.documentos.length, 2);
  // Carla, también asignada, solo ve el abierto.
  assert.deepEqual((await get(carla, { documentos: String(juanId) })).body.documentos.map(d => d.id), [abiertoId]);
  assert.equal((await get(ana, { documento: String(reservadoId) })).status, 200);
  assert.equal((await get(plat, { documento: String(reservadoId) })).status, 200);
  assert.equal((await get(bea, { documento: String(reservadoId) })).status, 200);
  assert.equal((await get(carla, { documento: String(reservadoId) })).status, 404);
  assert.equal((await get(carla, { documento: String(abiertoId) })).status, 200);
});

test("otra asignada no puede cambiar ni borrar un reservado (404); quien lo subió y la dirección sí", async () => {
  assert.equal((await post(carla, { accion: "doc_cambiar", doc_id: reservadoId, reservado: false })).status, 404);
  assert.equal((await post(carla, { accion: "doc_borrar", doc_id: reservadoId })).status, 404);
  const x = await post(carla, { accion: "doc_cambiar", doc_id: reservadoId, mostrar_familia: true });
  assert.equal(x.status, 404);
  assert.equal((await pg.query("SELECT reservado FROM documentos WHERE id = $1", [reservadoId])).rows[0].reservado, true);
  const b = await post(ana, { accion: "doc_cambiar", doc_id: reservadoId, reservado: false });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.documento.reservado, false);
  assert.equal((await get(carla, { documento: String(reservadoId) })).status, 200); // ya es del equipo
  assert.equal((await post(bea, { accion: "doc_cambiar", doc_id: reservadoId, reservado: true })).body.documento.reservado, true);
});

test("reservado y visible para la familia no conviven", async () => {
  const r = await subir(bea, { reservado: true, mostrar_familia: true });
  assert.equal(r.status, 400); assert.match(r.body.error, /reservado/i);
  const n = (await pg.query("SELECT count(*)::int AS n FROM documentos")).rows[0].n;
  assert.equal(n, 2); // el rechazo no dejó fila ni archivo
  assert.equal(pg.archivos.size, 2);
  // mostrar un reservado → 400, sigue sin ser visible
  const m = await post(bea, { accion: "doc_cambiar", doc_id: reservadoId, mostrar_familia: true });
  assert.equal(m.status, 400);
  assert.equal((await pg.query("SELECT visible_familia FROM documentos WHERE id = $1", [reservadoId])).rows[0].visible_familia, false);
  // ambos en la misma llamada → 400
  assert.equal((await post(bea, { accion: "doc_cambiar", doc_id: abiertoId, reservado: true, mostrar_familia: true })).status, 400);
  // la base también lo impide
  await assert.rejects(pg.query("UPDATE documentos SET reservado = true, visible_familia = true WHERE id = $1", [abiertoId]));
});

test("reservar un documento visible lo oculta a la familia y borra la marca de aviso", async () => {
  assert.equal((await post(bea, { accion: "doc_cambiar", doc_id: abiertoId, mostrar_familia: true })).status, 200);
  assert.equal((await get(laura, { documentos: String(juanId) })).body.documentos.length, 1);
  const r = await post(bea, { accion: "doc_cambiar", doc_id: abiertoId, reservado: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.documento.reservado, true);
  assert.equal(r.body.documento.visible_familia, false);
  assert.equal(r.body.documento.notificado, null);
  assert.deepEqual((await get(laura, { documentos: String(juanId) })).body.documentos, []);
  assert.equal((await get(laura, { documento: String(abiertoId) })).status, 404);
  assert.deepEqual((await get(laura, { exportar: "1" })).body.documentos, []);
});

test("la familia nunca ve un reservado, ni siquiera si la base tuviera visible_familia", async () => {
  const cons = (await pg.query("SELECT conname FROM pg_constraint WHERE conrelid = 'documentos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%reservado%'")).rows;
  for (const c of cons) await pg.query(`ALTER TABLE documentos DROP CONSTRAINT "${c.conname}"`);
  await pg.query("UPDATE documentos SET visible_familia = true WHERE id = $1", [reservadoId]);
  assert.deepEqual((await get(laura, { documentos: String(juanId) })).body.documentos, []);
  assert.equal((await get(laura, { documento: String(reservadoId) })).status, 404);
  assert.deepEqual((await get(laura, { exportar: "1" })).body.documentos, []);
});

test("docente.html: casilla de reservado al subir y botón/sello en la lista", () => {
  const d = require("fs").readFileSync(require("path").join(__dirname, "..", "docente.html"), "utf8");
  for (const t of ['id="docReservado"', "solo para mí y la administración", "reservado: $(\"docReservado\").checked", "Compartir con el equipo", "desreservar"]) assert.ok(d.includes(t), t);
});

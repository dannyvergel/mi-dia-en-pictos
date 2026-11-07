// Retención de documentos y borrado seguro del Blob (_lib/retencion.js + _lib/almacen.js, ver docs/documentos.md).
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.FAMILIA_FUNCIONES = "";
const { baseNueva, entrarConCodigo, altaEscuela } = require("./ayuda");
const fichas = require("../api/fichas");
const almacen = require("../api/_lib/almacen");
const R = require("../api/_lib/retencion");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.ADMIN_EMAIL;
const post = (c, body) => c.llamar(fichas, { method: "POST", body });
const PDF = Buffer.from("%PDF-1.4\n% x\n%%EOF\n");
let pg, ana, juanId, sofiId;
const subir = (alumno, titulo) => post(ana, { accion: "doc_subir", id: alumno, tipo: "informe", titulo, nombre: "i.pdf", mime: "application/pdf", datos: PDF.toString("base64") });
const huerfanos = async () => (await pg.query("SELECT ruta, intentos, ultimo_error, created_at FROM blobs_huerfanos ORDER BY id")).rows;
const rutaDe = async id => (await pg.query("SELECT blob_ruta FROM documentos WHERE id = $1", [id])).rows[0]?.blob_ruta;
const silenciar = fn => async () => { const e = console.error; const logs = []; console.error = (...a) => logs.push(a.join(" ")); try { return await fn(logs); } finally { console.error = e; } };

test.before(async () => {
  pg = await baseNueva();
  await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  juanId = (await post(ana, { accion: "crear", nombre: "Juan", contactos: [] })).body.alumno.id;
  sofiId = (await post(ana, { accion: "crear", nombre: "Sofía", contactos: [] })).body.alumno.id;
});
test.afterEach(() => almacen.fallarBorradoDePrueba(null));

test("el plazo de documentos es una constante con default de 5 años y se puede cambiar por variable", () => {
  assert.equal(R.DOCUMENTOS_RETENCION_DIAS, 1825);
  assert.equal(R.plazos().documentos, 1825);
  process.env.DOCUMENTOS_RETENCION_DIAS = "900";
  try { assert.equal(R.plazos().documentos, 900); } finally { delete process.env.DOCUMENTOS_RETENCION_DIAS; }
  assert.equal(R.HUERFANOS_MAX_INTENTOS, 10);
});

test("si el Blob no borra, el borrado del documento sigue y la ruta queda registrada como huérfana", silenciar(async logs => {
  const id = (await subir(juanId, "Para borrar")).body.documento.id;
  const ruta = await rutaDe(id);
  almacen.fallarBorradoDePrueba(new Set([ruta]));
  const r = await post(ana, { accion: "doc_borrar", doc_id: id });
  assert.equal(r.status, 200);
  assert.equal(r.body.blob_borrado, false);
  assert.equal(await rutaDe(id), undefined); // la fila ya no está
  const h = await huerfanos();
  assert.equal(h.length, 1);
  assert.equal(h[0].ruta, ruta);
  assert.equal(h[0].intentos, 1);
  assert.ok(h[0].ultimo_error && h[0].created_at);
  assert.ok(logs.some(l => l.includes("huérfano") || l.includes("no se pudo borrar")));
  // El barrido lo reintenta: falla otra vez → intentos 2; después anda → se borra el archivo y el registro.
  let s = await R.barrerHuerfanos();
  assert.deepEqual({ reintentados: s.reintentados, borrados: s.borrados, fallidos: s.fallidos }, { reintentados: 1, borrados: 0, fallidos: 1 });
  assert.equal((await huerfanos())[0].intentos, 2);
  assert.ok(pg.archivos.has(ruta));
  almacen.fallarBorradoDePrueba(null);
  s = await R.barrerHuerfanos();
  assert.equal(s.borrados, 1);
  assert.deepEqual(await huerfanos(), []);
  assert.equal(pg.archivos.has(ruta), false);
}));

test("tope de reintentos: al llegar al máximo se avisa en el log y el barrido deja de reintentar", silenciar(async logs => {
  const ruta = "documentos/9/" + "a".repeat(32);
  await pg.query("INSERT INTO blobs_huerfanos (ruta, intentos, ultimo_error) VALUES ($1, $2, 'x')", [ruta, R.HUERFANOS_MAX_INTENTOS - 1]);
  almacen.fallarBorradoDePrueba(new Set([ruta]));
  const s = await R.barrerHuerfanos();
  assert.equal(s.excedidos, 1);
  assert.equal((await huerfanos())[0].intentos, R.HUERFANOS_MAX_INTENTOS);
  assert.ok(logs.some(l => l.includes("reintentos") && l.includes(ruta)));
  const otra = await R.barrerHuerfanos();
  assert.equal(otra.reintentados, 0); // ya no se reintenta
  assert.equal((await huerfanos())[0].intentos, R.HUERFANOS_MAX_INTENTOS);
  await pg.query("DELETE FROM blobs_huerfanos");
}));

test("documentos vencidos: se borran solo si el alumno no tuvo actividad en el plazo, por la misma vía segura", silenciar(async () => {
  const viejoJuan = (await subir(juanId, "Viejo de Juan")).body.documento.id;
  const viejoSofi = (await subir(sofiId, "Viejo de Sofía")).body.documento.id;
  const recienteSofi = (await subir(sofiId, "Reciente de Sofía")).body.documento.id;
  const rutaJuan = await rutaDe(viejoJuan), rutaSofi = await rutaDe(viejoSofi);
  const hace6 = "now() - interval '6 years'";
  // Juan: todo viejo. Sofía: un documento viejo, pero tiene uno reciente → hay actividad, no se toca nada.
  await pg.query(`UPDATE documentos SET creado = ${hace6} WHERE id IN ($1, $2)`, [viejoJuan, viejoSofi]);
  await pg.query(`UPDATE alumnos SET creado = ${hace6}`);
  await pg.query(`UPDATE fichas SET actualizado = ${hace6}`);
  almacen.fallarBorradoDePrueba(new Set([rutaJuan])); // además, el Blob falla para el de Juan
  const out = await R.limpiar();
  assert.equal(out.documentos_vencidos, 1);
  assert.ok(out.blobs_huerfanos && "reintentados" in out.blobs_huerfanos);
  assert.equal(await rutaDe(viejoJuan), undefined);
  assert.ok(await rutaDe(viejoSofi) && await rutaDe(recienteSofi));
  assert.ok(pg.archivos.has(rutaSofi));
  assert.deepEqual((await huerfanos()).map(h => h.ruta), [rutaJuan]); // quedó para reintentar
  // Pasa el tiempo sin actividad de Sofía: ahora vencen los dos suyos.
  await pg.query(`UPDATE documentos SET creado = ${hace6} WHERE alumno_id = $1`, [sofiId]);
  almacen.fallarBorradoDePrueba(null);
  const out2 = await R.limpiar();
  assert.equal(out2.documentos_vencidos, 2);
  assert.equal(out2.blobs_huerfanos.borrados, 1);
  assert.deepEqual(await huerfanos(), []);
  assert.equal(pg.archivos.size, 0);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM documentos")).rows[0].n, 0);
}));

test("con actividad reciente en la ficha, los documentos viejos se conservan", async () => {
  const id = (await subir(juanId, "Viejo con ficha activa")).body.documento.id;
  await pg.query("UPDATE documentos SET creado = now() - interval '6 years' WHERE id = $1", [id]);
  await pg.query("UPDATE fichas SET actualizado = now() WHERE alumno_id = $1", [juanId]);
  assert.equal((await R.limpiar()).documentos_vencidos, 0);
  assert.ok(await rutaDe(id));
});

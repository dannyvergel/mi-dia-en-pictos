// Local-disk storage driver (STORAGE_DRIVER=disk). Real files in a temp dir; no network.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const almacen = require("../api/_lib/almacen");
const db = require("../api/_lib/db");
const { PGlite } = require("@electric-sql/pglite");

let dir;
const guardado = {};
test.beforeEach(() => {
  almacen.usarAlmacenDePrueba(false);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "puente-disco-"));
  for (const k of ["STORAGE_DRIVER", "STORAGE_DIR"]) guardado[k] = process.env[k];
  process.env.STORAGE_DRIVER = "disk";
  process.env.STORAGE_DIR = dir;
});
test.afterEach(() => {
  for (const k of ["STORAGE_DRIVER", "STORAGE_DIR"]) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; }
  almacen.fallarBorradoDePrueba(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const RUTA = "documentos/12/" + "a".repeat(32);

test("modo disco: modoBlob lo informa y hayBlob es true", () => {
  assert.equal(almacen.modoBlob(), "disco");
  assert.equal(almacen.hayBlob(), true);
  delete process.env.STORAGE_DRIVER;
  assert.equal(almacen.modoBlob({}), "sin_configurar", "without the driver nothing changes");
});

test("familia: guardar, leer, sobrescribir y borrar; lo que no existe da null", async () => {
  assert.equal(await almacen.leerFamilia("tok123"), null);
  await almacen.guardarFamilia("tok123", { a: 1, ñ: "ü" });
  assert.deepEqual(await almacen.leerFamilia("tok123"), { a: 1, ñ: "ü" });
  await almacen.guardarFamilia("tok123", { a: 2 });
  assert.deepEqual(await almacen.leerFamilia("tok123"), { a: 2 });
  assert.ok(fs.existsSync(path.join(dir, "familias", "tok123.json")));
  assert.equal(await almacen.borrarFamilia("tok123"), true);
  assert.equal(await almacen.leerFamilia("tok123"), null);
  assert.equal(await almacen.borrarFamilia("tok123"), true, "deleting what is not there is ok");
  assert.equal(await almacen.borrarFamilia(""), true);
});

test("archivos: guardar crea carpetas, leer devuelve Buffer, no sobrescribe, y no quedan temporales", async () => {
  assert.equal(await almacen.leerArchivo(RUTA), null);
  await almacen.guardarArchivo(RUTA, Buffer.from("hola"), "application/pdf");
  const b = await almacen.leerArchivo(RUTA);
  assert.ok(Buffer.isBuffer(b));
  assert.equal(b.toString(), "hola");
  await assert.rejects(almacen.guardarArchivo(RUTA, Buffer.from("otro"), "application/pdf"), "allowOverwrite is false like in Blob");
  assert.equal((await almacen.leerArchivo(RUTA)).toString(), "hola");
  const sobras = fs.readdirSync(path.join(dir, "documentos", "12")).filter(f => f.endsWith(".tmp"));
  assert.deepEqual(sobras, []);
});

test("intentarBorrarArchivo: borra y verifica; ausente es ok; el seam de fallos devuelve ok:false", async () => {
  await almacen.guardarArchivo(RUTA, Buffer.from("x"), "text/plain");
  assert.deepEqual(await almacen.intentarBorrarArchivo(RUTA), { ok: true });
  assert.equal(await almacen.leerArchivo(RUTA), null);
  assert.deepEqual(await almacen.intentarBorrarArchivo(RUTA), { ok: true });
  assert.deepEqual(await almacen.intentarBorrarArchivo(""), { ok: true });
  await almacen.guardarArchivo(RUTA, Buffer.from("x"), "text/plain");
  almacen.fallarBorradoDePrueba(new Set([RUTA]));
  const r = await almacen.intentarBorrarArchivo(RUTA);
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test("un borrado que falla de verdad (la ruta es una carpeta con contenido) devuelve ok:false sin tirar", async () => {
  fs.mkdirSync(path.join(dir, "documentos", "7", "dir"), { recursive: true });
  fs.writeFileSync(path.join(dir, "documentos", "7", "dir", "f"), "x");
  const r = await almacen.intentarBorrarArchivo("documentos/7/dir");
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test("path traversal: ninguna operación toca ni sirve nada fuera de STORAGE_DIR", async () => {
  const fuera = path.join(path.dirname(dir), "secreto-" + path.basename(dir) + ".txt");
  fs.writeFileSync(fuera, "SECRETO");
  try {
    const malas = ["../" + path.basename(fuera), "..\\" + path.basename(fuera), "documentos/../../" + path.basename(fuera),
      path.resolve(fuera), "/etc/passwd", "a/../../b", "x\0y", "", "."];
    for (const m of malas) {
      assert.equal(await almacen.leerArchivo(m), null, `read ${JSON.stringify(m)}`);
      await assert.rejects(almacen.guardarArchivo(m, Buffer.from("pwn"), "text/plain"), `write ${JSON.stringify(m)}`);
    }
    for (const t of ["../x", "..\\x", "a/b", "x\0y", ""]) {
      assert.equal(await almacen.leerFamilia(t), null, `familia ${JSON.stringify(t)}`);
      if (t) await assert.rejects(almacen.guardarFamilia(t, { x: 1 }), `familia write ${JSON.stringify(t)}`);
    }
    // deleting an unsafe key must not delete the outside file
    const r = await almacen.intentarBorrarArchivo("../" + path.basename(fuera));
    assert.equal(r.ok, true);
    assert.equal(await almacen.borrarFamilia("../" + path.basename(fuera).replace(/\.txt$/, "")), true);
    assert.equal(fs.readFileSync(fuera, "utf8"), "SECRETO");
    assert.equal(fs.existsSync(path.join(path.dirname(dir), "pwn")), false);
  } finally { fs.rmSync(fuera, { force: true }); }
});

test("borrarArchivo con fallo en disco anota la ruta en blobs_huerfanos (comportamiento de #59)", async () => {
  const pg = new PGlite();
  db.usarBaseDePrueba(pg);
  try {
    await almacen.guardarArchivo(RUTA, Buffer.from("x"), "text/plain");
    almacen.fallarBorradoDePrueba(new Set([RUTA]));
    const origErr = console.error; console.error = () => {};
    let ok;
    try { ok = await almacen.borrarArchivo(RUTA); } finally { console.error = origErr; }
    assert.equal(ok, false);
    const filas = (await pg.query("SELECT ruta, intentos FROM blobs_huerfanos")).rows;
    assert.deepEqual(filas.map(f => f.ruta), [RUTA]);
    almacen.fallarBorradoDePrueba(null);
    assert.equal(await almacen.borrarArchivo(RUTA), true);
  } finally { db.usarBaseDePrueba(null); await pg.close(); }
});

test("STORAGE_DIR por defecto es ./data/storage (relativo al cwd)", () => {
  delete process.env.STORAGE_DIR;
  assert.equal(almacen.directorioDisco(), path.resolve("./data/storage"));
});

// Blob: credenciales (OIDC en Vercel, token RW solo como respaldo local) y la migración entre stores (scripts/migrar-blob.js).
// Sin red: las credenciales se prueban con entornos falsos y la migración con dos stores en memoria.
const test = require("node:test");
const assert = require("node:assert");
const almacen = require("../api/_lib/almacen");
const M = require("../scripts/migrar-blob");

const RW_VIEJO = "vercel_blob_rw_Viejo123_secretoViejoNoSeImprime";
const RW_NUEVO = "vercel_blob_rw_Nuevo456_secretoNuevoNoSeImprime";

test("credenciales en Vercel: con BLOB_STORE_ID no se pasa ningún token (el SDK usa OIDC, que gana sobre el RW)", () => {
  almacen.usarAlmacenDePrueba(false);
  const env = { VERCEL: "1", BLOB_STORE_ID: "store_Nuevo456", BLOB_READ_WRITE_TOKEN: RW_VIEJO };
  assert.deepEqual(almacen.credenciales(env), {});
  assert.equal(almacen.modoBlob(env), "oidc");
});

test("credenciales en Vercel sin BLOB_STORE_ID: cae al token estático y avisa una sola vez, sin el token", () => {
  almacen.usarAlmacenDePrueba(false);
  const avisos = [];
  const original = console.warn;
  console.warn = (...a) => avisos.push(a.join(" "));
  try {
    const env = { VERCEL: "1", BLOB_READ_WRITE_TOKEN: RW_VIEJO };
    assert.deepEqual(almacen.credenciales(env), {});
    almacen.credenciales(env);
    assert.equal(almacen.modoBlob(env), "token");
  } finally { console.warn = original; }
  assert.ok(avisos.length <= 1);
  assert.ok(avisos.every(l => !l.includes("secreto")));
});

test("credenciales locales: el token RW de quien corre el script se pasa explícito (gana sobre un OIDC viejo de env pull)", () => {
  almacen.usarAlmacenDePrueba(false);
  const env = { BLOB_READ_WRITE_TOKEN: RW_NUEVO, BLOB_STORE_ID: "store_Viejo123", VERCEL_OIDC_TOKEN: "x.y.z" };
  assert.deepEqual(almacen.credenciales(env), { token: RW_NUEVO });
  assert.equal(almacen.modoBlob(env), "token");
  assert.equal(almacen.modoBlob({ BLOB_STORE_ID: "store_a", VERCEL_OIDC_TOKEN: "x.y.z" }), "oidc");
  assert.equal(almacen.modoBlob({}), "sin_configurar");
  assert.equal(almacen.hayBlob({}), false);
  almacen.usarAlmacenDePrueba(true);
  assert.equal(almacen.modoBlob({}), "memoria");
  assert.equal(almacen.hayBlob({}), true);
  almacen.usarAlmacenDePrueba(false);
});

// Store en memoria con la misma forma que clienteVercel().
function storeFalso(token, reloj) {
  const m = new Map(); // ruta → { datos, contentType, uploadedAt }
  return {
    m, storeId: M.storeDeToken(token),
    escrituras: 0,
    async listar() { return new Map([...m].map(([r, b]) => [r, { size: b.datos.length, uploadedAt: b.uploadedAt }])); },
    async leer(r) { const b = m.get(r); return b ? { datos: Buffer.from(b.datos), contentType: b.contentType } : null; },
    async escribir(r, datos, { contentType, pisar }) {
      if (m.has(r) && !pisar) throw new Error(`already exists (token ${token})`);
      this.escrituras++;
      m.set(r, { datos: Buffer.from(datos), contentType, uploadedAt: new Date(reloj.t++) });
    },
    async cabecera(r) { const b = m.get(r); if (!b) throw new Error("not found"); return { size: b.datos.length, contentType: b.contentType }; },
    poner(r, texto, contentType) { m.set(r, { datos: Buffer.from(texto), contentType, uploadedAt: new Date(reloj.t++) }); },
  };
}

test("migrar-blob: dry-run no escribe; la pasada real copia rutas y content-type; la segunda no hace nada", async () => {
  const reloj = { t: 1_000 };
  const o = storeFalso(RW_VIEJO, reloj), d = storeFalso(RW_NUEVO, reloj);
  o.poner("familias/abcdef0123456789.json", '{"dias":[1]}', "application/json");
  o.poner("familias/99990123456789ab.json", '{"dias":[2,3]}', "application/json");
  o.poner("documentos/7/c0ffee00c0ffee00c0ffee00c0ffee00", "%PDF-1.4 ...", "application/pdf");
  o.poner("documentos/7/beefbeefbeefbeefbeefbeefbeefbeef", "\x89PNG...", "image/png");
  const log = [];

  const seco = await M.migrar({ origen: o, destino: d, dryRun: true, log: x => log.push(x) });
  assert.equal(seco.ok, true);
  assert.equal(seco.plan.copiar, 4);
  assert.equal(d.m.size, 0);

  const r = await M.migrar({ origen: o, destino: d, log: x => log.push(x) });
  assert.equal(r.ok, true);
  assert.equal(r.copiados, 4);
  assert.deepEqual([...d.m.keys()].sort(), [...o.m.keys()].sort());
  for (const [ruta, b] of o.m) {
    assert.equal(d.m.get(ruta).contentType, b.contentType);
    assert.equal(Buffer.compare(d.m.get(ruta).datos, b.datos), 0);
  }
  assert.equal(r.verificacion.origen.blobs, r.verificacion.destino.blobs);
  assert.equal(r.verificacion.origen.bytes, r.verificacion.destino.bytes);

  const antes = d.escrituras;
  const r2 = await M.migrar({ origen: o, destino: d });
  assert.equal(r2.ok, true);
  assert.equal(r2.plan.copiar + r2.plan.actualizar, 0);
  assert.equal(d.escrituras, antes, "idempotente: la segunda pasada no escribe");

  const todo = log.join("\n");
  assert.ok(!todo.includes("secreto"), "nunca imprime los tokens");
  assert.ok(!todo.includes("abcdef0123456789"), "las rutas de familias salen recortadas");
});

test("migrar-blob: re-pasada después del cambio de store: actualiza lo que cambió en el origen y no pisa lo más nuevo del destino", async () => {
  const reloj = { t: 1_000 };
  const o = storeFalso(RW_VIEJO, reloj), d = storeFalso(RW_NUEVO, reloj);
  o.poner("familias/aaaa.json", '{"v":1}', "application/json");
  o.poner("familias/bbbb.json", '{"v":1}', "application/json");
  await M.migrar({ origen: o, destino: d });
  o.poner("familias/aaaa.json", '{"v":2,"tarde":true}', "application/json"); // la app vieja escribió después de la 1.ª pasada
  d.poner("familias/bbbb.json", '{"v":3,"nuevo":true}', "application/json"); // la app nueva ya escribió en el destino
  o.poner("documentos/1/cccc", "nuevo", "application/pdf");                 // se subió en el medio
  const r = await M.migrar({ origen: o, destino: d });
  assert.equal(r.ok, true);
  assert.equal(r.plan.actualizar, 1);
  assert.equal(r.plan.copiar, 1);
  assert.equal(d.m.get("familias/aaaa.json").datos.toString(), '{"v":2,"tarde":true}');
  assert.equal(d.m.get("familias/bbbb.json").datos.toString(), '{"v":3,"nuevo":true}');
  assert.equal(r.verificacion.masNuevosEnDestino, 1);
});

test("migrar-blob: rechaza tokens que no son RW o que son del mismo store; los errores no llevan el token", async () => {
  const reloj = { t: 1 };
  await assert.rejects(M.migrar({ origen: storeFalso("cualquiera", reloj), destino: storeFalso(RW_NUEVO, reloj) }), /vercel_blob_rw_/);
  await assert.rejects(M.migrar({ origen: storeFalso(RW_VIEJO, reloj), destino: storeFalso(RW_VIEJO, reloj) }), /mismo store/);
  assert.equal(M.storeDeToken(RW_VIEJO), "Viejo123");
  assert.equal(M.normalizarToken(`BLOB_READ_WRITE_TOKEN="${RW_VIEJO}"\r\n`), RW_VIEJO);
  assert.equal(M.limpiar(`falló con ${RW_NUEVO} y vercel_blob_rw_Otro_zzz`, [RW_NUEVO]).includes("secreto"), false);
  assert.ok(!M.limpiar(`x vercel_blob_rw_Otro_zzz`, []).includes("zzz"));
  assert.equal(M.rutaCorta("familias/abcdef0123.json"), "familias/abcd….json");

  // Un error al escribir (por ejemplo, el SDK trae el token en el mensaje) se informa sin el token y deja ok en false.
  const o = storeFalso(RW_VIEJO, reloj), d = storeFalso(RW_NUEVO, reloj);
  o.poner("documentos/2/dddd", "x", "application/pdf");
  d.escribir = async () => { throw new Error(`403 con ${RW_NUEVO}`); };
  const log = [];
  const r = await M.migrar({ origen: o, destino: d, log: x => log.push(x), secretos: [RW_VIEJO, RW_NUEVO] });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 1);
  assert.ok(!log.join("\n").includes("secreto"));
});

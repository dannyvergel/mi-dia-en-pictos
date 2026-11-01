// Búsqueda en el Padrón Oficial (/api/escuelas), ficha de escuela y uso del CUE en el alta inicial y las solicitudes.
// Usa el archivo real data/escuelas-santa-fe.json (se carga en PGlite en el primer pedido).
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const escuelas = require("../api/escuelas");
const solicitudes = require("../api/solicitudes");
const correo = require("../api/_lib/correo");
const S = require("../api/_lib/seguridad");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.PUENTE_URL; delete process.env.ADMIN_EMAIL;
const GAVIOTA = "820060800", ALBORADA = "820002100";
let pg, ana, beto;
const buscar = (c, q, headers = {}) => c.llamar(escuelas, { query: { q }, headers });
const post = (c, body, h = escuelas) => c.llamar(h, { method: "POST", body });

test.before(async () => {
  pg = await baseNueva();
  correo.usarBuzonDePrueba(true);
  const r = await post(cliente(), { accion: "setup", escuela: "lo que sea", cue: GAVIOTA, nombre: "Ana", email: "ana@escuela.edu.ar", pin: "4321" }, auth);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES (1, 'beto@escuela.edu.ar', 'Beto')");
  beto = await entrarConCodigo(pg, "beto@escuela.edu.ar");
});
test.after(() => correo.usarBuzonDePrueba(false));
test.beforeEach(async () => { await pg.query("DELETE FROM limites"); });

test("alta inicial con CUE: la escuela se crea con los datos del padrón", async () => {
  const e = (await pg.query("SELECT * FROM escuelas WHERE id = 1")).rows[0];
  assert.equal(e.cue, GAVIOTA);
  assert.equal(e.nombre, "ESCUELA ESPECIAL NRO 2085 JUAN SALVADOR GAVIOTA");
  assert.equal(e.localidad, "TOTORAS"); assert.match(e.modalidad, /Educación Especial/);
  assert.match(e.email, /@santafe\.edu\.ar$/);
});

test("alta inicial: CUE mal escrito o que no está en el padrón no crea nada", async () => {
  await pg.query("DELETE FROM docentes"); // simula una base sin docentes
  try {
    const malo = await post(cliente(), { accion: "setup", cue: "123", nombre: "X", email: "x@x.com", pin: "4321" }, auth);
    assert.equal(malo.status, 400);
    const noEsta = await post(cliente(), { accion: "setup", cue: "829999999", nombre: "X", email: "x@x.com", pin: "4321" }, auth);
    assert.equal(noEsta.status, 404);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM escuelas")).rows[0].n, 1);
  } finally {
    await pg.query("INSERT INTO docentes (id, escuela_id, email, nombre, es_admin, es_plataforma) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'ana@escuela.edu.ar', 'Ana', true, true), (2, 1, 'beto@escuela.edu.ar', 'Beto', false, false)");
  }
});

test("buscar exige sesión de docente o el token del formulario público", async () => {
  assert.equal((await buscar(cliente(), "2085")).status, 401);
  assert.equal((await buscar(cliente(), "2085", { "x-puente-formulario": "123.abc" })).status, 401);
  const vencido = S.tokenFormulario(Date.now() - 3 * 3600e3);
  assert.equal((await buscar(cliente(), "2085", { "x-puente-formulario": vencido })).status, 401);
  const estado = await cliente().llamar(auth); // GET /api/auth sin sesión entrega el token
  assert.ok(estado.body.formulario);
  const r = await buscar(cliente(), "2085", { "x-puente-formulario": estado.body.formulario });
  assert.equal(r.status, 200);
  assert.equal(r.body.escuelas[0].cue, GAVIOTA);
  assert.equal(r.body.escuelas[0].email, undefined); // el formulario público ve lo justo para elegir
  assert.equal((await ana.llamar(auth)).body.formulario, undefined); // con sesión no hace falta
  assert.equal((await ana.llamar(escuelas, { query: { cue: GAVIOTA } })).status, 200);
  assert.equal((await cliente().llamar(escuelas, { query: { cue: GAVIOTA } })).status, 401);
});

test("búsqueda por número, con o sin 'escuela', sin importar acentos ni mayúsculas", async () => {
  for (const q of ["escuela 2085", "2085", "Escuela N.º 2085", "gaviota", "JUAN SALVADOR"]) {
    const r = await buscar(beto, q);
    assert.equal(r.status, 200);
    assert.equal(r.body.escuelas[0].cue, GAVIOTA, q);
  }
  const conTilde = await buscar(beto, "gauseño"), sinTilde = await buscar(beto, "GAUSENO");
  assert.ok(conTilde.body.escuelas.length >= 1);
  assert.deepEqual(conTilde.body.escuelas.map(e => e.cue), sinTilde.body.escuelas.map(e => e.cue));
  const completa = (await buscar(beto, "2085")).body.escuelas[0];
  assert.equal(completa.numero, "2085"); assert.ok(completa.email); assert.ok(completa.ofertas.includes("especial.primario"));
});

test("búsqueda por localidad, como mucho 10, con Educación Especial primero", async () => {
  const r = await buscar(beto, "ROSÁRIO");
  assert.equal(r.body.escuelas.length, 10);
  assert.ok(r.body.escuelas.every(e => e.especial), "en Rosario hay más de 10 especiales: tienen que ir primero");
  const esp = await buscar(beto, "especial rosario");
  assert.ok(esp.body.escuelas.every(e => e.localidad === "ROSARIO" && e.especial));
  const alborada = await buscar(beto, "alborada rosario");
  assert.equal(alborada.body.escuelas[0].cue, ALBORADA);
  const totoras = await buscar(beto, "totoras");
  assert.equal(totoras.body.escuelas[0].cue, GAVIOTA); // la especial antes que las comunes del pueblo
  assert.ok(totoras.body.escuelas.slice(1).every(e => e.localidad === "TOTORAS"));
});

test("números exactos primero; textos cortos o vacíos no buscan", async () => {
  const r = await buscar(beto, "1242");
  assert.equal(r.body.escuelas[0].cue, ALBORADA); // especial + número exacto
  assert.ok(r.body.escuelas.every(e => e.numero === "1242" || / 1242/.test(e.nombre)));
  assert.deepEqual((await buscar(beto, "a")).body.escuelas, []);
  assert.deepEqual((await buscar(beto, "")).body.escuelas, []);
  assert.deepEqual((await buscar(beto, "zzzqqqxx")).body.escuelas, []);
});

test("límites: 120 búsquedas por docente y 40 por IP desde el formulario, cada 10 minutos", async () => {
  for (let i = 0; i < 120; i++) await S.registrarIntento("escuelas:docente:2");
  const r = await buscar(beto, "2085");
  assert.equal(r.status, 429); assert.match(r.body.error, /Esperá/);
  assert.equal((await buscar(ana, "2085")).status, 200); // es por docente
  const tok = S.tokenFormulario(), c = cliente("10.7.7.7");
  for (let i = 0; i < 40; i++) assert.equal((await buscar(c, "ro" + i, { "x-puente-formulario": tok })).status, 200);
  assert.equal((await buscar(c, "rosario", { "x-puente-formulario": tok })).status, 429);
  assert.equal((await buscar(cliente("10.7.7.8"), "rosario", { "x-puente-formulario": tok })).status, 200);
});

test("ficha de escuela: solo las admin de esa escuela la ven y la editan", async () => {
  assert.equal((await beto.llamar(escuelas, { query: { ficha: "1" } })).status, 403);
  assert.equal((await post(beto, { accion: "guardar_ficha", nombre: "Hackeada" })).status, 403);
  assert.equal((await cliente().llamar(escuelas, { query: { ficha: "1" } })).status, 401);
  assert.equal((await post(cliente(), { accion: "guardar_ficha", nombre: "Hackeada" })).status, 401);
  const r = await ana.llamar(escuelas, { query: { ficha: "1" } });
  assert.equal(r.status, 200); assert.equal(r.body.ficha.cue, GAVIOTA); assert.equal(r.body.ficha.aval_firmado, false);
  assert.equal((await pg.query("SELECT nombre FROM escuelas WHERE id = 1")).rows[0].nombre, "ESCUELA ESPECIAL NRO 2085 JUAN SALVADOR GAVIOTA");
});

test("ficha de escuela: guardar, validar emails y CUE, aval con fecha", async () => {
  const base = { accion: "guardar_ficha", nombre: "Escuela Especial N.º 2085", cue: GAVIOTA, domicilio: "Avda Maipú 534", localidad: "Totoras",
    modalidad: "Educación Especial", email: "Especial2085@santafe.edu.ar", telefono: "03476 462031", directivo_nombre: "Laura Pérez",
    directivo_email: "laura@escuela.edu.ar", responsable_datos_nombre: "Laura Pérez (directora)", responsable_datos_email: "laura@escuela.edu.ar",
    aval_firmado: true, aval_por: "Laura Pérez", notas: "Firmado en reunión de equipo." };
  const r = await post(ana, base);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ficha.email, "especial2085@santafe.edu.ar");
  assert.equal(r.body.ficha.aval_firmado, true); assert.match(r.body.ficha.aval_fecha, /^\d{4}-\d{2}-\d{2}$/); // sin fecha → hoy
  assert.equal(r.body.ficha.actualizado_por, "ana@escuela.edu.ar"); assert.equal(r.body.en_padron, true);
  assert.equal((await post(ana, { ...base, directivo_email: "no-es-email" })).status, 400);
  assert.equal((await post(ana, { ...base, cue: "12" })).status, 400);
  assert.equal((await post(ana, { ...base, nombre: "" })).status, 400);
  assert.equal((await post(ana, { ...base, aval_fecha: "ayer" })).status, 400);
  // carga manual (sin CUE) y sacar el aval
  const manual = await post(ana, { ...base, cue: "", aval_firmado: false });
  assert.equal(manual.status, 200); assert.equal(manual.body.ficha.cue, null);
  assert.equal(manual.body.ficha.aval_fecha, null); assert.equal(manual.body.ficha.aval_por, "");
  assert.equal((await post(ana, base)).status, 200); // se vuelve a vincular
});

test("prefill desde el padrón por CUE", async () => {
  const r = await beto.llamar(escuelas, { query: { cue: ALBORADA } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ficha.nombre, "ESCUELA ESPECIAL PART. INC. NRO 1242 ALBORADA");
  assert.equal(r.body.ficha.localidad, "ROSARIO"); assert.match(r.body.ficha.modalidad, /Educación Especial/);
  assert.equal((await beto.llamar(escuelas, { query: { cue: "829999999" } })).status, 404);
});

test("solicitud con CUE: se guarda, la admin ve el padrón y al aprobar se crea la escuela (y queda admin)", async () => {
  const pedido = { accion: "crear", nombre: "Marta", email: "marta@alborada.edu.ar", escuela: "Alborada", cue: ALBORADA };
  assert.equal((await post(cliente(), pedido, solicitudes)).status, 200);
  assert.equal((await post(cliente(), { ...pedido, email: "otra@x.com", cue: "829999999" }, solicitudes)).status, 200); // no está: se ignora
  const filas = (await pg.query("SELECT email, cue FROM solicitudes ORDER BY id")).rows;
  assert.deepEqual(filas.map(f => [f.email, f.cue]), [["marta@alborada.edu.ar", ALBORADA], ["otra@x.com", null]]);
  const lista = await ana.llamar(solicitudes);
  const marta = lista.body.pendientes.find(s => s.email === "marta@alborada.edu.ar");
  assert.equal(marta.escuela_cue_id, null); assert.equal(marta.padron.nombre, "ESCUELA ESPECIAL PART. INC. NRO 1242 ALBORADA");
  const r = await post(ana, { accion: "aprobar", id: marta.id }, solicitudes);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.escuela.cue, ALBORADA); assert.equal(r.body.docente.es_admin, true);
  const e = (await pg.query("SELECT * FROM escuelas WHERE cue = $1", [ALBORADA])).rows[0];
  assert.equal(e.localidad, "ROSARIO");
  // La segunda seño de la misma escuela: se sugiere la escuela existente y entra sin ser admin.
  await pg.query("DELETE FROM limites");
  await post(cliente(), { ...pedido, nombre: "Rosa", email: "rosa@alborada.edu.ar" }, solicitudes);
  const rosa = (await ana.llamar(solicitudes)).body.pendientes.find(s => s.email === "rosa@alborada.edu.ar");
  assert.equal(Number(rosa.escuela_cue_id), Number(e.id)); assert.equal(rosa.padron, null);
  const r2 = await post(ana, { accion: "aprobar", id: rosa.id }, solicitudes);
  assert.equal(Number(r2.body.escuela.id), Number(e.id)); assert.equal(r2.body.docente.es_admin, false);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM escuelas WHERE cue = $1", [ALBORADA])).rows[0].n, 1);
});

test("aprobar: la admin puede elegir otra escuela aunque la solicitud traiga CUE; desde_padron sin CUE da error", async () => {
  await post(cliente(), { accion: "crear", nombre: "Lía", email: "lia@x.com", escuela: "Gaviota", cue: GAVIOTA }, solicitudes);
  await post(cliente(), { accion: "crear", nombre: "Sin Cue", email: "sincue@x.com", escuela: "Alguna" }, solicitudes);
  const ps = (await ana.llamar(solicitudes)).body.pendientes;
  const lia = ps.find(s => s.email === "lia@x.com"), sin = ps.find(s => s.email === "sincue@x.com");
  assert.equal(Number(lia.escuela_cue_id), 1); // la escuela de Ana tiene ese CUE
  assert.equal((await post(ana, { accion: "aprobar", id: sin.id, desde_padron: true }, solicitudes)).status, 400);
  const alborada = (await pg.query("SELECT id FROM escuelas WHERE cue = $1", [ALBORADA])).rows[0].id;
  const r = await post(ana, { accion: "aprobar", id: lia.id, escuela_id: Number(alborada) }, solicitudes);
  assert.equal(r.status, 200); assert.equal(Number(r.body.escuela.id), Number(alborada));
});

test("la ficha no deja usar el CUE de otra escuela de Puente", async () => {
  const r = await post(ana, { accion: "guardar_ficha", nombre: "Gaviota", cue: ALBORADA });
  assert.equal(r.status, 409);
  assert.equal((await pg.query("SELECT cue FROM escuelas WHERE id = 1")).rows[0].cue, GAVIOTA);
});

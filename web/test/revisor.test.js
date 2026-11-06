// Cuenta de revisión de Google Play (usuario y contraseña SOLO para REVISOR_EMAIL; apagada por defecto). Ver api/_lib/revisor.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const auth = require("../api/auth");
const config = require("../api/config");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const revisor = require("../api/_lib/revisor");
const piloto = require("../api/_lib/piloto");
const { sembrar } = require("../scripts/revisor");

const RAIZ = path.join(__dirname, "..");
const EMAIL = "revision@puentepictos.app", CLAVE = "clave-de-prueba-larga-123";
delete process.env.VERCEL_ENV; delete process.env.ADMIN_EMAIL; delete process.env.RESEND_API_KEY;
let pg, HASH, otra;
const post = (c, body) => c.llamar(auth, { method: "POST", body });
const login = (c, email, clave) => post(c, { accion: "login_revisor", email, clave });
const prender = () => { process.env.REVISOR_EMAIL = EMAIL; process.env.REVISOR_CLAVE_HASH = HASH; };
const apagar = () => { delete process.env.REVISOR_EMAIL; delete process.env.REVISOR_CLAVE_HASH; };

test.before(async () => {
  pg = await baseNueva();
  HASH = await revisor.hashClave(CLAVE);
  // Una escuela real, con su directora y un alumno, para probar el aislamiento.
  otra = await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  await pg.query("INSERT INTO alumnos (escuela_id, nombre) VALUES ($1, 'Lucas')", [otra.escuela_id]);
});
test.beforeEach(async () => { await pg.query("DELETE FROM limites"); });
test.after(apagar);

test("hash: scrypt con sal, nunca la contraseña; compara bien y rechaza hashes raros", async () => {
  assert.match(HASH, /^scrypt\$16384\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
  assert.ok(!HASH.includes(CLAVE));
  assert.notEqual(await revisor.hashClave(CLAVE), HASH); // sal distinta cada vez
  assert.equal(await revisor.claveOk(CLAVE, HASH), true);
  assert.equal(await revisor.claveOk(CLAVE + "x", HASH), false);
  for (const malo of ["", CLAVE, "scrypt$1024$8$1$" + HASH.split("$").slice(4).join("$"), "pbkdf2$1$2$3$4$5"]) assert.equal(await revisor.claveOk(CLAVE, malo), false);
});

test("apagada por defecto: login_revisor → 404, /api/config dice revisor: false, y no se prende con una sola variable", async () => {
  apagar();
  assert.equal((await login(cliente(), EMAIL, CLAVE)).status, 404);
  assert.equal((await cliente().llamar(config)).body.revisor, false);
  process.env.REVISOR_EMAIL = EMAIL;
  assert.equal((await login(cliente(), EMAIL, CLAVE)).status, 404);
  delete process.env.REVISOR_EMAIL; process.env.REVISOR_CLAVE_HASH = HASH;
  assert.equal((await login(cliente(), EMAIL, CLAVE)).status, 404);
  assert.equal((await cliente().llamar(config)).body.revisor, false);
  // Si REVISOR_EMAIL es la cuenta de la plataforma, queda apagada.
  process.env.REVISOR_EMAIL = "plata@puente.org"; process.env.ADMIN_EMAIL = "plata@puente.org";
  try { assert.equal((await login(cliente(), "plata@puente.org", CLAVE)).status, 404); }
  finally { delete process.env.ADMIN_EMAIL; apagar(); }
});

test("script de seed idempotente: escuela de revisión, docente no admin, 3 alumnos asignados con 2 días cada uno", async () => {
  const log = [];
  const r1 = await sembrar({ email: EMAIL, pictos: false, dias: true, log: m => log.push(m) });
  const r2 = await sembrar({ email: EMAIL, pictos: false, dias: true });
  assert.equal(r1.escuela_nueva, true); assert.equal(r2.escuela_nueva, false);
  assert.equal(r1.escuela_id, r2.escuela_id); assert.equal(r1.docente_id, r2.docente_id);
  assert.deepEqual(r1.alumnos, ["Juan", "Sofi", "Tomi"]); assert.equal(r1.dias, 6);
  const n = async sql => (await pg.query(sql)).rows[0].n;
  assert.equal(await n("SELECT count(*)::int AS n FROM escuelas WHERE tipo = 'revision'"), 1);
  assert.equal(await n(`SELECT count(*)::int AS n FROM docentes WHERE email = '${EMAIL}' AND NOT es_admin AND activo`), 1);
  assert.equal(await n(`SELECT count(*)::int AS n FROM alumnos WHERE escuela_id = ${r1.escuela_id}`), 3);
  assert.equal(await n(`SELECT count(*)::int AS n FROM alumno_docentes WHERE docente_id = ${r1.docente_id}`), 3);
  assert.equal(await n(`SELECT count(*)::int AS n FROM fichas f JOIN alumnos a ON a.id = f.alumno_id WHERE a.escuela_id = ${r1.escuela_id} AND f.contactos = '[]'::jsonb`), 3);
  assert.equal(await n("SELECT count(*)::int AS n FROM familias"), 0);
  assert.equal(pg.blobs.size, 3);
  for (const v of pg.blobs.values()) assert.equal(JSON.parse(v).registros.length, 2);
  assert.match(log[0], /Escuela de prueba \(revisión\)/);
  // Nunca toma una cuenta real ni la de la plataforma.
  await assert.rejects(sembrar({ email: "ana@escuela.edu.ar", dias: false }), /fuera de la escuela de revisión/);
  process.env.ADMIN_EMAIL = EMAIL;
  try { await assert.rejects(sembrar({ email: EMAIL, dias: false }), /ADMIN_EMAIL/); } finally { delete process.env.ADMIN_EMAIL; }
});

test("prendida: /api/config dice revisor: true; mail equivocado → 401; contraseña mala → 401, mismo mensaje, queda en auditoría", async () => {
  prender();
  assert.equal((await cliente().llamar(config)).body.revisor, true);
  const otroMail = await login(cliente(), "ana@escuela.edu.ar", CLAVE);
  const malaClave = await login(cliente(), EMAIL, "otra-clave-cualquiera");
  for (const r of [otroMail, malaClave]) { assert.equal(r.status, 401); assert.equal(r.headers["set-cookie"], undefined); }
  assert.equal(otroMail.body.error, malaClave.body.error);
  assert.equal((await login(cliente(), EMAIL, "")).status, 401);
  assert.equal((await login(cliente(), EMAIL, "x".repeat(201))).status, 401);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM auditoria WHERE evento = 'login_fallido'")).rows[0].n, 1);
  // La contraseña no abre ninguna otra acción ni el viejo login con contraseña.
  assert.equal((await post(cliente(), { accion: "login_docente", email: EMAIL, password: CLAVE })).status, 410);
});

test("contraseña buena → sesión de docente marcada como revisor, auditada como login_revisor", async () => {
  prender();
  const c = cliente();
  const r = await login(c, " Revision@PuentePictos.app ", CLAVE);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.sesion, { tipo: "docente", nombre: "Cuenta de revisión", email: EMAIL, es_admin: false, es_plataforma: false, tiene_escuela: true, revisor: true });
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(r.headers["set-cookie"].includes(flag), flag);
  assert.equal((await c.llamar(auth)).body.sesion.revisor, true);
  const a = (await pg.query("SELECT actor_tipo, escuela_id, email_hash, detalle FROM auditoria WHERE evento = 'login_revisor'")).rows;
  assert.equal(a.length, 1); assert.equal(a[0].actor_tipo, "docente"); assert.deepEqual(a[0].detalle, { metodo: "clave" });
  assert.ok(!String(a[0].email_hash).includes("revision"));
  // Las otras docentes no quedan marcadas.
  const ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  assert.equal((await ana.llamar(auth)).body.sesion.revisor, undefined);
});

test("el revisor no ve nada de otras escuelas", async () => {
  prender();
  const c = cliente(); assert.equal((await login(c, EMAIL, CLAVE)).status, 200);
  const lista = await c.llamar(fichas);
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.body.alumnos.map(x => x.nombre).sort(), ["Juan", "Sofi", "Tomi"]);
  const lucas = (await pg.query("SELECT id FROM alumnos WHERE nombre = 'Lucas'")).rows[0].id;
  const ajeno = await c.llamar(fichas, { query: { id: String(lucas) } });
  assert.ok([403, 404].includes(ajeno.status), JSON.stringify(ajeno.body));
  assert.ok([403, 404].includes((await c.llamar(familia, { query: { alumno: String(lucas) } })).status));
  assert.ok(!JSON.stringify(lista.body).includes("Lucas") && !JSON.stringify(lista.body).includes("ana@escuela.edu.ar"));
  // Ve los días cargados de sus alumnos ficticios.
  const juan = lista.body.alumnos.find(x => x.nombre === "Juan").id;
  const vista = await c.llamar(familia, { query: { alumno: String(juan) } });
  assert.equal(vista.status, 200); assert.equal(vista.body.dias.length, 2);
  // No es admin: no puede sumar docentes ni invitar.
  assert.equal((await c.llamar(require("../api/docentes"), { method: "POST", body: { accion: "crear", nombre: "X", email: "x@x.org" } })).status, 403);
  assert.equal((await c.llamar(require("../api/docentes"), { method: "POST", body: { accion: "invitacion_crear" } })).status, 403);
  // Tampoco invita familias ni crea links para familias (no escribe a terceros ni ocupa cupo).
  assert.equal((await c.llamar(fichas, { method: "POST", body: { accion: "invitar", id: juan, email: "fam@x.org" } })).status, 403);
  assert.equal((await c.llamar(fichas, { method: "POST", body: { accion: "link_familia", id: juan } })).status, 403);
});

test("la cuenta de revisión no consume cupo del piloto", async () => {
  const antes = await piloto.usados();
  // Ana (escuela real) cuenta; el revisor, no.
  assert.equal(antes, 1);
  await pg.query("UPDATE docentes SET es_admin = true WHERE email = $1", [EMAIL]); // aunque fuera admin, tampoco contaría
  assert.equal(await piloto.usados(), 1);
  await pg.query("UPDATE docentes SET es_admin = false WHERE email = $1", [EMAIL]);
  process.env.PILOTO_MAX_USUARIOS = "1";
  try {
    const c = await piloto.cupos();
    assert.equal(c.usados, 1); assert.equal(c.completo, true);
    prender();
    assert.equal((await login(cliente(), EMAIL, CLAVE)).status, 200); // entra igual con el piloto completo
  } finally { process.env.PILOTO_MAX_USUARIOS = "0"; }
});

test("con la cuenta en una escuela que no es de revisión, la contraseña no abre nada", async () => {
  prender();
  await pg.query("UPDATE escuelas SET tipo = 'escuela' WHERE tipo = 'revision'");
  try { assert.equal((await login(cliente(), EMAIL, CLAVE)).status, 401); }
  finally { await pg.query("UPDATE escuelas SET tipo = 'revision' WHERE nombre = 'Escuela de prueba (revisión)'"); }
});

test("límite de intentos por IP (mecanismo de límites de siempre) → 429", async () => {
  prender();
  const c = cliente("10.9.9.9");
  for (let i = 0; i < revisor.MAX_IP; i++) assert.equal((await login(c, EMAIL, "mala-" + i)).status, 401);
  assert.equal((await login(c, EMAIL, CLAVE)).status, 429);
});

test("script de hash: lee la contraseña por stdin y devuelve un hash que valida", async () => {
  const out = execFileSync(process.execPath, [path.join(RAIZ, "scripts/revisor-clave.js")], { input: "\uFEFF" + CLAVE + "\r\n" }).toString().trim();
  assert.equal(await revisor.claveOk(CLAVE, out), true);
  assert.ok(!out.includes(CLAVE));
  assert.throws(() => execFileSync(process.execPath, [path.join(RAIZ, "scripts/revisor-clave.js")], { input: "corta", stdio: "pipe" }));
});

test("login.html: link discreto solo con revisor: true, sin emojis ni signos de apertura; nada de contraseñas en el repo", () => {
  const html = fs.readFileSync(path.join(RAIZ, "login.html"), "utf8");
  assert.ok(html.includes('id="rPie" hidden'));
  assert.ok(html.includes("c.revisor === true"));
  assert.ok(html.includes("Acceso para revisión"));
  const bloque = html.slice(html.indexOf('<div class="card cinta" id="revisor"'), html.indexOf("<!-- FAMILIA -->"));
  assert.ok(bloque.length > 100);
  assert.doesNotMatch(bloque, /¡|\p{Extended_Pictographic}|—/u);
  assert.ok(fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8").includes("const C = 'pictos-v30'"));
  // Ninguna contraseña ni hash de revisión en el repo (solo nombres de variables).
  for (const f of ["api/_lib/revisor.js", "scripts/revisor.js", "vercel.json", "../docs/play/guia-danny.md", "../docs/play/ficha.md"]) {
    const s = fs.readFileSync(path.join(RAIZ, f), "utf8");
    assert.doesNotMatch(s, /scrypt\$\d+\$\d+\$\d+\$[\w-]{16,}\$[\w-]{32,}/, f);
  }
});

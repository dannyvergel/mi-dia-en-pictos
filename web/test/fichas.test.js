// Fichas de familia, código por email y espacio de la familia con sesión.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const fichas = require("../api/fichas");
const familia = require("../api/familia");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAIL; delete process.env.OPENROUTER_API_KEY;
let pg, ana, otraEscuela, juanId, sofiId;
const post = (c, h, body) => c.llamar(h, { method: "POST", body });

test.before(async () => {
  pg = await baseNueva();
  const r = await post(cliente(), auth, { accion: "setup", escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar", pin: "4321" });
  assert.equal(r.status, 200);
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  // Docente de otra escuela (para probar el aislamiento)
  await pg.query("INSERT INTO escuelas (nombre) VALUES ('Otra escuela')");
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES (2, 'zoe@otra.edu.ar', 'Zoe')");
  otraEscuela = await entrarConCodigo(pg, "zoe@otra.edu.ar");
});

test("sin sesión no se ve ninguna ficha", async () => {
  const r = await cliente().llamar(fichas);
  assert.equal(r.status, 401);
  assert.equal(r.body.alumnos, undefined);
});

test("docente crea alumnos (solo nombre de pila, sin duplicados)", async () => {
  const j = await post(ana, fichas, { accion: "crear", nombre: "Juan" });
  assert.equal(j.status, 200); juanId = j.body.alumno.id;
  sofiId = (await post(ana, fichas, { accion: "crear", nombre: "Sofía" })).body.alumno.id;
  assert.equal((await post(ana, fichas, { accion: "crear", nombre: "juan" })).status, 409);
  assert.equal((await post(ana, fichas, { accion: "crear", nombre: "Juan Pérez 3" })).status, 400);
  assert.deepEqual((await ana.llamar(fichas)).body.alumnos.map(a => a.nombre), ["Juan", "Sofía"]);
});

test("docente guarda la ficha completa; los emails de contacto quedan vinculados", async () => {
  const r = await post(ana, fichas, {
    accion: "guardar", id: juanId, nombre: "Juan",
    contactos: [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com", telefono: "+54 341 555 1234" }, { nombre: "Abuela Marta", vinculo: "abuela", telefono: "341 555 9999" }],
    apoyos: { sensoriales: "ruido fuerte", regulacion: "auriculares", comunicacion: "pictos y algunas palabras", diagnostico: "NO" },
    objetivos: ["Comer con autonomía en el comedor", "Saludar a sus compañeros", ""],
    consentimiento: { dado: false }
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = r.body.alumno;
  assert.equal(a.contactos.length, 2);
  assert.equal(a.objetivos.length, 2);
  assert.equal(a.apoyos.diagnostico, undefined);
  const link = (await pg.query("SELECT f.email FROM familia_alumno fa JOIN familias f ON f.id = fa.familia_id WHERE fa.alumno_id = $1", [juanId])).rows;
  assert.deepEqual(link.map(x => x.email), ["laura@mail.com"]);
});

test("docente de otra escuela no ve ni edita alumnos ajenos", async () => {
  assert.deepEqual((await otraEscuela.llamar(fichas)).body.alumnos, []);
  assert.equal((await otraEscuela.llamar(fichas, { query: { id: String(juanId) } })).status, 404);
  assert.equal((await post(otraEscuela, fichas, { accion: "guardar", id: juanId, contactos: [] })).status, 404);
  assert.equal((await post(otraEscuela, fichas, { accion: "borrar", id: juanId })).status, 404);
  assert.equal((await otraEscuela.llamar(familia, { query: { alumno: String(juanId) } })).status, 404);
});

test("código por email: email desconocido no revela nada; el código vale y se usa una vez", async () => {
  const desconocido = await post(cliente(), auth, { accion: "pedir_codigo", email: "nadie@mail.com" });
  assert.equal(desconocido.status, 200); assert.equal(desconocido.body.codigo_dev, undefined);

  const fam = cliente();
  const p = await post(fam, auth, { accion: "pedir_codigo", email: "Laura@Mail.com" });
  assert.equal(p.status, 200); assert.match(p.body.codigo_dev, /^\d{6}$/);
  assert.equal(p.body.mensaje, desconocido.body.mensaje);
  const guardado = (await pg.query("SELECT codigo_hash FROM codigos ORDER BY id DESC LIMIT 1")).rows[0].codigo_hash;
  assert.notEqual(guardado, p.body.codigo_dev); // hasheado
  const ok = await post(fam, auth, { accion: "verificar_codigo", email: "laura@mail.com", codigo: p.body.codigo_dev });
  assert.equal(ok.status, 200);
  assert.equal((await fam.llamar(auth)).body.sesion.tipo, "familia");
  assert.equal((await post(cliente(), auth, { accion: "verificar_codigo", email: "laura@mail.com", codigo: p.body.codigo_dev })).status, 401); // ya usado
});

test("código: 5 intentos fallidos lo anulan; vencido no sirve", async () => {
  const c = cliente();
  const p = await post(c, auth, { accion: "pedir_codigo", email: "laura@mail.com" });
  const malo = p.body.codigo_dev === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await post(c, auth, { accion: "verificar_codigo", email: "laura@mail.com", codigo: malo })).status, 401);
  assert.equal((await post(c, auth, { accion: "verificar_codigo", email: "laura@mail.com", codigo: p.body.codigo_dev })).status, 401);

  await pg.query("DELETE FROM limites"); // no queremos chocar con el límite de pedidos en este test
  const p2 = await post(c, auth, { accion: "pedir_codigo", email: "laura@mail.com" });
  await pg.query("UPDATE codigos SET expira = now() - interval '1 minute'");
  assert.equal((await post(c, auth, { accion: "verificar_codigo", email: "laura@mail.com", codigo: p2.body.codigo_dev })).status, 401);
});

test("envío: producción sin RESEND_API_KEY da error claro; preview no devuelve el código", async () => {
  await pg.query("DELETE FROM limites");
  process.env.VERCEL_ENV = "production"; process.env.SESSION_SECRET = "secreto-de-prueba-largo";
  try {
    const r = await post(cliente(), auth, { accion: "pedir_codigo", email: "laura@mail.com" });
    assert.equal(r.status, 503); assert.match(r.body.error, /RESEND_API_KEY/);
    process.env.VERCEL_ENV = "preview";
    const p = await post(cliente(), auth, { accion: "pedir_codigo", email: "laura@mail.com" });
    assert.equal(p.status, 200); assert.equal(p.body.codigo_dev, undefined);
  } finally { delete process.env.VERCEL_ENV; delete process.env.SESSION_SECRET; }
});

test("envío con Resend: llama a la API con el código", async () => {
  await pg.query("DELETE FROM limites");
  process.env.RESEND_API_KEY = "re_test"; process.env.RESEND_FROM = "Puente <hola@puente.ar>";
  const original = global.fetch; let enviado;
  global.fetch = async (url, opts) => { enviado = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization }; return new Response("{}", { status: 200 }); };
  try {
    const r = await post(cliente(), auth, { accion: "pedir_codigo", email: "laura@mail.com" });
    assert.equal(r.status, 200); assert.equal(r.body.codigo_dev, undefined);
    assert.equal(enviado.url, "https://api.resend.com/emails");
    assert.equal(enviado.auth, "Bearer re_test");
    assert.deepEqual(enviado.body.to, ["laura@mail.com"]);
    assert.match(enviado.body.subject, /\d{6}/);
  } finally { global.fetch = original; delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM; }
});

async function entrarComoFamilia(email) {
  await pg.query("DELETE FROM limites");
  const c = cliente();
  const p = await post(c, auth, { accion: "pedir_codigo", email });
  assert.equal((await post(c, auth, { accion: "verificar_codigo", email, codigo: p.body.codigo_dev })).status, 200);
  return c;
}

test("familia ve solo su alumno, en solo lectura, y puede dar consentimiento", async () => {
  const fam = await entrarComoFamilia("laura@mail.com");
  const lista = await fam.llamar(fichas);
  assert.deepEqual(lista.body.alumnos.map(a => a.nombre), ["Juan"]);
  assert.equal((await fam.llamar(familia, { query: { alumno: String(sofiId) } })).status, 404);
  // no puede editar la ficha ni crear alumnos
  assert.equal((await post(fam, fichas, { accion: "guardar", id: juanId, objetivos: ["hackeado"] })).status, 400);
  assert.equal((await post(fam, fichas, { accion: "crear", nombre: "Pepe" })).status, 404);
  assert.equal((await post(fam, fichas, { accion: "consentir", id: sofiId, dado: true })).status, 404);
  // consentimiento
  const c = await post(fam, fichas, { accion: "consentir", id: juanId, dado: true });
  assert.equal(c.status, 200);
  assert.equal(c.body.alumno.consentimiento.dado, true);
  assert.match(c.body.alumno.consentimiento.quien, /Laura \(mamá\) · laura@mail\.com/);
  // su propio teléfono
  const m = await post(fam, fichas, { accion: "mi_contacto", id: juanId, telefono: "+54 9 341 000 1111" });
  assert.equal(m.body.alumno.contactos[0].telefono, "+54 9 341 000 1111");
  assert.equal(m.body.alumno.contactos[1].nombre, "Abuela Marta"); // no toca los demás
  // la docente guarda sin tocar el consentimiento → se conserva el de la familia
  const g = await post(ana, fichas, { accion: "guardar", id: juanId, contactos: m.body.alumno.contactos, apoyos: m.body.alumno.apoyos, objetivos: m.body.alumno.objetivos, consentimiento: m.body.alumno.consentimiento });
  assert.equal(g.body.alumno.consentimiento.via, "familia");
});

test("espacio de familia con sesión: link con token ya no sirve; ve lo que publica la docente", async () => {
  const fam = await entrarComoFamilia("laura@mail.com");
  assert.equal((await fam.llamar(familia, { query: { t: "a".repeat(32) } })).status, 410);
  assert.equal((await cliente().llamar(familia, { query: { alumno: String(juanId) } })).status, 401);

  const antes = await fam.llamar(familia, { query: { alumno: String(juanId) } });
  assert.equal(antes.status, 200); assert.equal(antes.body.sin_publicar, true);

  const reg = { alumno: "Juan", fecha: "2026-10-27", animo_general: "contento", registro_docente: "interno",
    actividades: [{ hora: "12:00", actividad: "Almorzó y comió solo en el comedor", palabra_clave: "almorzar", estado: "bien" }], logros: [], alertas: [] };
  const pub = await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [reg], ppi: [{ objetivo: "del navegador", palabras: ["x"] }] });
  assert.equal(pub.status, 200, JSON.stringify(pub.body)); assert.equal(pub.body.dias, 1);

  const v = await fam.llamar(familia, { query: { alumno: String(juanId) } });
  assert.equal(v.body.alumno, "Juan");
  assert.equal(v.body.dias.length, 1);
  assert.equal(JSON.stringify(v.body).includes("interno"), false);
  assert.deepEqual(v.body.objetivos.map(o => o.objetivo), ["Comer con autonomía en el comedor", "Saludar a sus compañeros"]); // la ficha manda

  const pq = await post(fam, familia, { accion: "preguntar", alumno_id: juanId, pregunta: "¿Cómo comió?" });
  assert.equal(pq.status, 200); assert.equal(pq.body.modo, "demo");
  assert.equal((await post(fam, familia, { accion: "preguntar", alumno_id: sofiId, pregunta: "?" })).status, 404);
  assert.equal((await post(fam, familia, { accion: "publicar", alumno_id: juanId, registros: [] })).status, 401); // la familia no publica
});

test("si la docente saca el email de la ficha, la familia pierde el acceso", async () => {
  const fam = await entrarComoFamilia("laura@mail.com");
  await post(ana, fichas, { accion: "guardar", id: juanId, contactos: [{ nombre: "Abuela Marta", vinculo: "abuela" }], apoyos: {}, objetivos: [] });
  assert.deepEqual((await fam.llamar(fichas)).body.alumnos, []);
  assert.equal((await fam.llamar(familia, { query: { alumno: String(juanId) } })).status, 404);
});

test("borrar un alumno borra su ficha y sus días publicados", async () => {
  assert.equal(pg.blobs.size, 1);
  assert.equal((await post(ana, fichas, { accion: "borrar", id: juanId })).status, 200);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM fichas WHERE alumno_id = $1", [juanId])).rows[0].n, 0);
  assert.equal(pg.blobs.size, 0);
});

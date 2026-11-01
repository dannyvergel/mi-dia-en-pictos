// Importación masiva: docentes y alumnos con familias (CSV / XLSX leído en el navegador).
// Solo datos ficticios.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo } = require("./ayuda");
const auth = require("../api/auth");
const fichas = require("../api/fichas");
const correo = require("../api/_lib/correo");
const I = require("../api/_lib/importacion");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.OPENROUTER_API_KEY;
process.env.PUENTE_URL = "https://puente.test";
let pg, dire, sub, caro, plata, buzon, otraEscuela;
const post = (c, body, headers) => c.llamar(fichas, { method: "POST", body, headers });
const cuenta = async (sql, p = []) => (await pg.query(sql, p)).rows[0].n;

const DOC_CSV = "\ufeffNombre;Email;Grado / rol;Admin\r\n"
  + "Bea Gómez;bea@e.edu.ar;Maestra de 3° A;\r\n"
  + "Ñato Peña;\"nato@e.edu.ar\";\"Integrador; turno mañana\";no\r\n";
const AL_CSV = "nombre,grado,docentes,contacto1_nombre,contacto1_vinculo,contacto1_email,contacto1_telefono,contacto2_nombre,contacto2_email\n"
  + "Juan,3° A,\"bea@e.edu.ar, nato@e.edu.ar\",Laura,mamá,laura@mail.com,341 555-1234,Tío Raúl,raul@mail.com\n"
  + "Sofía,3° A,bea@e.edu.ar,Pablo,papá,pablo@mail.com,,,\n";

async function previa(c, body, headers) { return post(c, { accion: "importar_previa", ...body }, headers); }
async function confirmar(c, body) {
  const p = await previa(c, body);
  return post(c, { accion: "importar_confirmar", ...body, huella: p.body.huella });
}

test.before(async () => {
  delete process.env.ADMIN_EMAIL;
  pg = await baseNueva();
  buzon = correo.usarBuzonDePrueba(true);
  const r = await cliente().llamar(auth, { method: "POST", body: { accion: "setup", escuela: "Escuela 2001", nombre: "Dire", email: "dire@e.edu.ar", pin: "4321" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  process.env.ADMIN_EMAIL = "plata@plataforma.org"; // plataforma (superadmin), en otra escuela y sin es_admin
  otraEscuela = Number((await pg.query("INSERT INTO escuelas (nombre) VALUES ('Escuela Otra') RETURNING id")).rows[0].id);
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES (1, 'caro@e.edu.ar', 'Caro')");
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES (1, 'sub@e.edu.ar', 'Subdire', true)");
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, 'plata@plataforma.org', 'Plata', false)", [otraEscuela]);
  await pg.query("INSERT INTO docentes (escuela_id, email, nombre) VALUES ($1, 'ajena@otra.edu.ar', 'Ajena')", [otraEscuela]);
  dire = await entrarConCodigo(pg, "dire@e.edu.ar");
  caro = await entrarConCodigo(pg, "caro@e.edu.ar");
  sub = await entrarConCodigo(pg, "sub@e.edu.ar");
  plata = await entrarConCodigo(pg, "plata@plataforma.org");
});
test.after(() => { correo.usarBuzonDePrueba(false); delete process.env.PUENTE_URL; delete process.env.ADMIN_EMAIL; });
test.beforeEach(async () => { buzon.length = 0; await pg.query("DELETE FROM limites WHERE clave NOT LIKE 'bienvenida:%'"); });

// ---------- lectura (sin base) ----------
test("CSV: BOM, separador ; o , o tab, comillas, saltos de línea y tildes", () => {
  assert.deepEqual(I.parsearCsv("\ufeffa;b;c\r\n1;\"x;y\";\"di \"\"hola\"\"\"\r\n"), [["a", "b", "c"], ["1", "x;y", 'di "hola"']]);
  assert.deepEqual(I.parsearCsv("a,b\n\"línea\nnueva\",ñ"), [["a", "b"], ["línea\nnueva", "ñ"]]);
  assert.deepEqual(I.parsearCsv("a\tb\nc\td"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(I.parsearCsv("Nombre,Grado\rJosé,1°"), [["Nombre", "Grado"], ["José", "1°"]]);
  const t = I.leerTabla(DOC_CSV, I.COLS_DOCENTES, { obligatorias: ["nombre", "email"] });
  assert.equal(t.filas.length, 2);
  assert.deepEqual(t.filas[1], { fila: 3, datos: { nombre: "Ñato Peña", email: "nato@e.edu.ar", rol: "Integrador; turno mañana", admin: "no" } });
});

test("encabezados con tildes/mayúsculas/alias, columnas desconocidas, filas vacías y columnas que faltan", () => {
  const t = I.leerTabla([["", ""], ["NOMBRE DE PILA", "Grado", "Contacto 1 - Teléfono", "Diagnóstico"], ["Ana", "1°", "341 111", "x"], ["", "", "", ""], ["Leo", "2°", "", ""]],
    { nombre: ["nombre_de_pila"], grado: ["grado"] }, { conContactos: true, obligatorias: ["nombre", "grado"] });
  assert.deepEqual(t.filas.map(f => f.fila), [3, 5]);
  assert.deepEqual(t.filas[0].datos, { nombre: "Ana", grado: "1°", "contacto:1:telefono": "341 111" });
  assert.equal(t.vacias, 1);
  assert.match(t.avisos[0], /Diagnóstico.*se ignora/);
  const f = I.leerTabla("nombre;mail\nx;y", I.COLS_ALUMNOS, { conContactos: true, obligatorias: ["nombre", "grado"] });
  assert.match(f.errores[0], /Faltan columnas obligatorias: grado/);
  // Filas como objetos (sheet_to_json sin header:1)
  const o = I.leerTabla([{ Nombre: "Bea", Email: "BEA@E.EDU.AR " }], I.COLS_DOCENTES, { obligatorias: ["nombre", "email"] });
  assert.deepEqual(o.filas[0].datos, { nombre: "Bea", email: "BEA@E.EDU.AR" });
});

test("fusionar contactos: por email, completa el que no tenía email, no duplica ni borra", () => {
  const r = I.fusionarContactos(
    [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com", telefono: "341 1" }, { nombre: "Abuela Marta", vinculo: "", email: "", telefono: "" }],
    [{ nombre: "Laura P.", vinculo: "", email: "laura@mail.com", telefono: "" }, { nombre: "abuela marta", vinculo: "abuela", email: "marta@mail.com", telefono: "" }, { nombre: "Pedro", vinculo: "papá", email: "", telefono: "" }]);
  assert.deepEqual(r, [
    { nombre: "Laura P.", vinculo: "mamá", email: "laura@mail.com", telefono: "341 1" },
    { nombre: "abuela marta", vinculo: "abuela", email: "marta@mail.com", telefono: "" },
    { nombre: "Pedro", vinculo: "papá", email: "", telefono: "" }]);
});

// ---------- permisos ----------
test("una docente que no es admin: 403; una familia no puede importar", async () => {
  const r = await previa(caro, { docentes: DOC_CSV });
  assert.equal(r.status, 403); assert.match(r.body.error, /dirección/);
  assert.equal((await post(caro, { accion: "importar_confirmar", docentes: DOC_CSV, huella: "x" })).status, 403);
  assert.equal((await post(caro, { accion: "importar_enviar", pendientes: [] })).status, 403);
});

test("admin de escuela: no puede importar en otra escuela (403); la plataforma sí elige escuela", async () => {
  const r = await previa(sub, { docentes: DOC_CSV, escuela_id: otraEscuela });
  assert.equal(r.status, 403); assert.match(r.body.error, /tu propia escuela/);
  assert.equal((await previa(sub, { docentes: DOC_CSV })).status, 200); // en la suya sí
  const p = await previa(plata, { docentes: "nombre,email\nZoe,zoe@otra.edu.ar", escuela_id: otraEscuela });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.escuela.nombre, "Escuela Otra");
  assert.equal(p.body.docentes[0].estado, "nuevo");
  assert.equal((await previa(plata, { docentes: "nombre,email\nZoe,zoe@otra.edu.ar", escuela_id: 999 })).status, 404);
});

test("exige JSON (no formulario)", async () => {
  const r = await dire.llamar(fichas, { method: "POST", body: "accion=importar_previa", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(r.status, 415);
});

// ---------- vista previa ----------
test("vista previa: estados y mensajes por fila, sin escribir nada ni mandar mails", async () => {
  const antes = await Promise.all(["docentes", "alumnos", "fichas", "familias", "alumno_docentes", "invitaciones"].map(t => cuenta(`SELECT count(*)::int AS n FROM ${t}`)));
  const docentes = DOC_CSV + "Sin Mail;;;\r\nMal;no-es-un-mail;;\r\nBea Repetida;BEA@e.edu.ar;;\r\nAjena;ajena@otra.edu.ar;;\r\nDudosa;dudosa@e.edu.ar;;tal vez\r\n;;;\r\n";
  const alumnos = AL_CSV
    + "Juan,3° A,bea@e.edu.ar,,,,,,\n"                         // repetido
    + "Lola,2° B,fantasma@e.edu.ar,,,,,,\n"                    // docente inexistente
    + "Lola Pérez García Gómez,2° B,,,,,,,\n"                  // nombre de pila
    + ",,,,,,,,\n"                                              // vacía
    + "Tomi,,caro@e.edu.ar,Mamá,mamá,mal@,,,\n"                // grado obligatorio + email del contacto
    + "Uma,1°,mal@,,,,,,\n"                                     // email de docente inválido
    + "Vera,1°,,,,,,Sin Nombre?,x@mail.com\n";                 // contacto 2 sin... nombre presente: válido
  const r = await previa(dire, { docentes, alumnos });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = Object.fromEntries(r.body.docentes.map(x => [x.fila, x]));
  assert.equal(d[2].estado, "nuevo"); assert.equal(d[3].estado, "nuevo"); assert.equal(d[3].rol, "Integrador; turno mañana"); assert.equal(d[3].admin, false);
  assert.equal(d[4].estado, "error"); assert.match(d[4].mensajes.join(), /Falta el email/);
  assert.match(d[5].mensajes.join(), /Email inválido/);
  assert.equal(d[6].estado, "duplicado"); assert.match(d[6].avisos.join(), /fila 2/);
  assert.match(d[7].mensajes.join(), /otra escuela/);
  assert.match(d[8].mensajes.join(), /sí o no/);
  const a = Object.fromEntries(r.body.alumnos.map(x => [x.fila, x]));
  assert.equal(a[2].estado, "nuevo"); assert.deepEqual(a[2].docentes, ["bea@e.edu.ar", "nato@e.edu.ar"]);
  assert.deepEqual(a[2].contactos.map(c => c.email), ["laura@mail.com", "raul@mail.com"]);
  assert.match(a[2].avisos.join(), /Invitación por mail a: laura@mail.com, raul@mail.com/);
  assert.equal(a[4].estado, "duplicado");
  assert.match(a[5].mensajes.join(), /Docente inexistente: fantasma@e.edu.ar/);
  assert.match(a[6].mensajes.join(), /nombre de pila/);
  assert.match(a[8].mensajes.join(), /Falta el grado/); assert.match(a[8].mensajes.join(), /Revisá el email de Mamá/);
  assert.match(a[9].mensajes.join(), /Email de docente inválido/);
  assert.equal(a[10].estado, "nuevo");
  assert.equal(r.body.resumen.vacias, 2);
  assert.equal(r.body.hay_errores, true);
  assert.deepEqual(r.body.resumen.docentes, { nuevo: 2, actualiza: 0, duplicado: 1, error: 4 });
  assert.ok(r.body.huella);
  const despues = await Promise.all(["docentes", "alumnos", "fichas", "familias", "alumno_docentes", "invitaciones"].map(t => cuenta(`SELECT count(*)::int AS n FROM ${t}`)));
  assert.deepEqual(despues, antes);
  assert.equal(buzon.length, 0);
});

test("un alumno que referencia a una docente con error en su fila también queda con error", async () => {
  const r = await previa(dire, { docentes: "nombre,email,admin\nMala,mala@e.edu.ar,quizás", alumnos: "nombre,grado,docentes\nIvo,1°,mala@e.edu.ar" });
  assert.match(r.body.alumnos[0].mensajes.join(), /tiene errores en su fila/);
});

test("planilla vacía, sin columnas obligatorias y límite de filas", async () => {
  assert.equal((await previa(dire, { docentes: "nombre;email\n;;\n" })).status, 400);
  const sin = await previa(dire, { alumnos: "nombre,apellido\nJuan,X" });
  assert.equal(sin.status, 200); assert.match(sin.body.errores[0], /Faltan columnas obligatorias: grado/); assert.equal(sin.body.hay_errores, true);
  const muchas = "nombre,grado\n" + Array.from({ length: I.MAX_FILAS + 1 }, (_, i) => `Chico ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26) % 26)},1°`).join("\n");
  const r = await previa(dire, { alumnos: muchas });
  assert.equal(r.status, 413, JSON.stringify(r.body)); assert.match(r.body.error, /Hasta 500 filas/);
  const grande = await previa(dire, { alumnos: "nombre,grado\n" }, { "content-length": String(I.MAX_BYTES + 1) });
  assert.equal(grande.status, 413);
});

// ---------- confirmar ----------
test("confirmar con errores: todo o nada (409, no escribe); sin la huella de la vista previa tampoco", async () => {
  const body = { docentes: DOC_CSV + "Mal;no-es-mail;;\r\n", alumnos: AL_CSV };
  const r = await confirmar(dire, body);
  assert.equal(r.status, 409); assert.match(r.body.error, /no se importó nada/);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM docentes WHERE email = 'bea@e.edu.ar'"), 0);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM alumnos"), 0);
  const sinHuella = await post(dire, { accion: "importar_confirmar", docentes: DOC_CSV, alumnos: AL_CSV });
  assert.equal(sinHuella.status, 409); assert.match(sinHuella.body.error, /Volvé a previsualizar/);
  const otraHuella = await post(dire, { accion: "importar_confirmar", docentes: DOC_CSV, alumnos: AL_CSV, huella: (await previa(dire, { docentes: DOC_CSV })).body.huella });
  assert.equal(otraHuella.status, 409);
  assert.equal(buzon.length, 0);
});

test("confirmar: escribe docentes, alumnos, fichas, familias y asignaciones; recién ahí manda los mails", async () => {
  const r = await confirmar(dire, { docentes: DOC_CSV, alumnos: AL_CSV });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.escrito, true);
  const bea = (await pg.query("SELECT * FROM docentes WHERE email = 'bea@e.edu.ar'")).rows[0];
  assert.equal(Number(bea.escuela_id), 1); assert.equal(bea.activo, true); assert.equal(bea.es_admin, false); assert.equal(bea.pass_hash, null);
  assert.equal(bea.rol, "Maestra de 3° A");
  const juan = (await pg.query("SELECT a.*, f.contactos FROM alumnos a JOIN fichas f ON f.alumno_id = a.id WHERE a.nombre = 'Juan'")).rows[0];
  assert.equal(juan.grado, "3° A");
  assert.deepEqual(juan.contactos, [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com", telefono: "341 555-1234" }, { nombre: "Tío Raúl", vinculo: "", email: "raul@mail.com", telefono: "" }]);
  const asig = (await pg.query("SELECT d.email FROM alumno_docentes ad JOIN docentes d ON d.id = ad.docente_id WHERE ad.alumno_id = $1 ORDER BY 1", [juan.id])).rows.map(x => x.email);
  assert.deepEqual(asig, ["bea@e.edu.ar", "nato@e.edu.ar"]);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM familia_alumno fa JOIN familias f ON f.id = fa.familia_id WHERE fa.alumno_id = $1", [juan.id]), 2);
  // Mails: 2 bienvenidas + 3 invitaciones (Laura, Raúl, Pablo)
  assert.deepEqual(r.body.envios.enviadas, 5); assert.equal(r.body.envios.fallidas, 0); assert.deepEqual(r.body.envios.pendientes, []);
  assert.deepEqual(buzon.map(m => m.to[0]).sort(), ["bea@e.edu.ar", "laura@mail.com", "nato@e.edu.ar", "pablo@mail.com", "raul@mail.com"]);
  assert.ok(buzon.find(m => m.to[0] === "bea@e.edu.ar").subject.includes("Ya tenés acceso"));
  assert.match(buzon.find(m => m.to[0] === "laura@mail.com").subject, /Dire te sumó a Puente para seguir el día de Juan/);
  // La docente asignada ve a Juan y puede entrar con código; la familia también.
  const bc = await entrarConCodigo(pg, "bea@e.edu.ar");
  assert.deepEqual((await bc.llamar(fichas)).body.alumnos.map(a => a.nombre).sort(), ["Juan", "Sofía"]);
  const fam = await entrarConCodigo(pg, "laura@mail.com", "familia");
  assert.deepEqual((await fam.llamar(fichas)).body.alumnos.map(a => a.nombre), ["Juan"]);
});

test("reimportar lo mismo es idempotente: todo 'actualiza', sin duplicados y sin volver a mandar mails", async () => {
  const n = async () => Promise.all(["docentes", "alumnos", "fichas", "familias", "familia_alumno", "alumno_docentes", "invitaciones"].map(t => cuenta(`SELECT count(*)::int AS n FROM ${t}`)));
  const antes = await n();
  const p = await previa(dire, { docentes: DOC_CSV, alumnos: AL_CSV });
  assert.ok(p.body.docentes.every(x => x.estado === "actualiza" && x.avisos.join().includes("sin cambios")), JSON.stringify(p.body.docentes));
  assert.ok(p.body.alumnos.every(x => x.estado === "actualiza" && x.avisos.join().includes("sin cambios")), JSON.stringify(p.body.alumnos));
  assert.equal(p.body.resumen.invitaciones, 0);
  const r = await confirmar(dire, { docentes: DOC_CSV, alumnos: AL_CSV });
  assert.equal(r.status, 200);
  assert.deepEqual(await n(), antes);
  assert.equal(buzon.length, 0); assert.equal(r.body.envios.enviadas, 0);
});

test("reimportar con cambios: fusiona contactos, suma asignaciones, actualiza grado vacío y rol; invita solo emails nuevos", async () => {
  // Alumno creado a mano (sin grado) con un contacto.
  await post(dire, { accion: "crear", nombre: "Mateo", contactos: [{ nombre: "Abuela Marta" }] });
  buzon.length = 0;
  const docentes = "nombre,email,rol,admin\nBea Gómez,bea@e.edu.ar,Maestra de 3° A y B,sí\n";
  const alumnos = "nombre,grado,docentes,contacto1_nombre,contacto1_email,contacto1_vinculo\n"
    + "juan,3° a,caro@e.edu.ar,Laura,laura@mail.com,\n"            // mismo alumno (mayúsculas), mismo contacto
    + "Mateo,1° B,bea@e.edu.ar,Abuela Marta,marta@mail.com,abuela\n"; // completa email del contacto existente
  const p = await previa(dire, { docentes, alumnos });
  assert.equal(p.body.alumnos[0].estado, "actualiza"); assert.equal(p.body.alumnos[0].nombre, "Juan");
  assert.equal(p.body.alumnos[1].estado, "actualiza");
  const r = await confirmar(dire, { docentes, alumnos });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const bea = (await pg.query("SELECT es_admin, rol FROM docentes WHERE email = 'bea@e.edu.ar'")).rows[0];
  assert.equal(bea.es_admin, true); assert.equal(bea.rol, "Maestra de 3° A y B");
  const juan = (await pg.query("SELECT a.id, a.grado, f.contactos FROM alumnos a JOIN fichas f ON f.alumno_id = a.id WHERE a.nombre = 'Juan'")).rows[0];
  assert.equal(juan.contactos.length, 2); // no se duplicó Laura ni se borró Raúl
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM alumno_docentes WHERE alumno_id = $1", [juan.id]), 3); // suma, no reemplaza
  const mateo = (await pg.query("SELECT a.grado, f.contactos FROM alumnos a JOIN fichas f ON f.alumno_id = a.id WHERE a.nombre = 'Mateo'")).rows[0];
  assert.equal(mateo.grado, "1° B");
  assert.deepEqual(mateo.contactos, [{ nombre: "Abuela Marta", vinculo: "abuela", email: "marta@mail.com", telefono: "" }]);
  assert.deepEqual(buzon.map(m => m.to[0]), ["marta@mail.com"]); // Bea ya existía: sin bienvenida
});

test("alumno duplicado en la escuela: mismo nombre con otro grado es error", async () => {
  const r = await previa(dire, { alumnos: "nombre,grado\nJuan,5° C\n" });
  assert.equal(r.body.alumnos[0].estado, "error");
  assert.match(r.body.alumnos[0].mensajes[0], /Alumno duplicado en la escuela: ya hay un «Juan» en 3° A/);
});

test("omitir_errores: escribe solo las filas válidas e informa cuántas omitió", async () => {
  const body = { alumnos: "nombre,grado,docentes\nNico,2° A,caro@e.edu.ar\nMal,2° A,nadie@e.edu.ar\n", omitir_errores: true };
  const r = await confirmar(dire, body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.omitidas, 1);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM alumnos WHERE nombre IN ('Nico', 'Mal')"), 1);
});

test("si la escritura falla a mitad, no queda nada (transacción) y no se manda ningún mail", async () => {
  await pg.query(`CREATE OR REPLACE FUNCTION falla_ficha() RETURNS trigger AS $$ BEGIN IF NEW.actualizado_por = 'dire@e.edu.ar' AND EXISTS (SELECT 1 FROM alumnos WHERE id = NEW.alumno_id AND nombre = 'Rota') THEN RAISE EXCEPTION 'falla de prueba'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pg.query("CREATE TRIGGER falla_ficha BEFORE INSERT ON fichas FOR EACH ROW EXECUTE FUNCTION falla_ficha()");
  try {
    const r = await confirmar(dire, { docentes: "nombre,email\nNueva,nueva@e.edu.ar", alumnos: "nombre,grado,contacto1_nombre,contacto1_email\nRota,1°,Fam,fam@mail.com" });
    assert.equal(r.status, 500);
    assert.equal(await cuenta("SELECT count(*)::int AS n FROM docentes WHERE email = 'nueva@e.edu.ar'"), 0);
    assert.equal(await cuenta("SELECT count(*)::int AS n FROM alumnos WHERE nombre = 'Rota'"), 0);
    assert.equal(buzon.length, 0);
  } finally { await pg.query("DROP TRIGGER falla_ficha ON fichas"); }
});

test("los mails que fallan no deshacen nada; los pendientes se mandan después con importar_enviar", async () => {
  correo.usarBuzonDePrueba(false);
  process.env.RESEND_API_KEY = "re_test";
  const original = global.fetch, ot = global.setTimeout;
  global.fetch = async () => new Response("caído", { status: 500 });
  global.setTimeout = (fn) => ot(fn, 0); // sin esperar la pausa entre mails
  let r;
  try {
    r = await confirmar(dire, { docentes: "nombre,email\nCeci,ceci@e.edu.ar", alumnos: "nombre,grado,docentes,contacto1_nombre,contacto1_email\nPía,1°,ceci@e.edu.ar,Rita,rita@mail.com" });
  } finally { global.fetch = original; global.setTimeout = ot; delete process.env.RESEND_API_KEY; buzon = correo.usarBuzonDePrueba(true); }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.envios.fallidas, 2); assert.equal(r.body.envios.enviadas, 0);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM alumnos WHERE nombre = 'Pía'"), 1);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM docentes WHERE email = 'ceci@e.edu.ar'"), 1);
  // Reintentar: ahora sí salen
  const piaId = Number((await pg.query("SELECT id FROM alumnos WHERE nombre = 'Pía'")).rows[0].id);
  const e = await post(dire, { accion: "importar_enviar", pendientes: [{ tipo: "docente", email: "ceci@e.edu.ar" }, { tipo: "familia", alumno_id: piaId, email: "rita@mail.com" },
    { tipo: "familia", alumno_id: piaId, email: "intrusa@mail.com" }, { tipo: "docente", email: "ajena@otra.edu.ar" }] });
  assert.equal(e.status, 200);
  assert.equal(e.body.envios.enviadas, 2); assert.equal(e.body.envios.fallidas, 2); // emails que no son de la ficha / de la escuela: no se mandan
  assert.deepEqual(buzon.map(m => m.to[0]).sort(), ["ceci@e.edu.ar", "rita@mail.com"]);
  // Repetir enseguida no reenvía (24 h)
  buzon.length = 0;
  const e2 = await post(dire, { accion: "importar_enviar", pendientes: [{ tipo: "docente", email: "ceci@e.edu.ar" }, { tipo: "familia", alumno_id: piaId, email: "rita@mail.com" }] });
  assert.equal(e2.body.envios.recientes, 2); assert.equal(buzon.length, 0);
});

test("muchos mails: se mandan de a tandas y el resto vuelve como pendiente", async () => {
  const filas = Array.from({ length: I.LOTE_ENVIOS + 3 }, (_, i) => `Chico ${String.fromCharCode(65 + i)},4°,Fam,fam${i}@mail.com`).join("\n");
  const r = await confirmar(dire, { alumnos: "nombre,grado,contacto1_nombre,contacto1_email\n" + filas });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.envios.enviadas, I.LOTE_ENVIOS); assert.equal(r.body.envios.pendientes.length, 3);
  const e = await post(dire, { accion: "importar_enviar", pendientes: r.body.envios.pendientes });
  assert.equal(e.body.envios.enviadas, 3); assert.deepEqual(e.body.envios.pendientes, []);
});

test("XLSX leído en el navegador: filas como array de arrays (números como texto)", async () => {
  const r = await previa(dire, { alumnos: [["Nombre", "Grado", "Contacto1 Nombre", "Contacto1 Teléfono"], ["Ramiro", "6°", "Olga", 3415551234]] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.alumnos[0].estado, "nuevo"); assert.equal(r.body.alumnos[0].contactos[0].telefono, "3415551234");
});

test("plataforma importa en otra escuela: las docentes y alumnos quedan en esa escuela", async () => {
  const body = { escuela_id: otraEscuela, docentes: "nombre,email\nZoe,zoe@otra.edu.ar", alumnos: "nombre,grado,docentes\nJuan,1°,zoe@otra.edu.ar" };
  const r = await confirmar(plata, body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.alumnos[0].estado, "nuevo"); // el Juan de la otra escuela no cuenta
  assert.equal(Number((await pg.query("SELECT escuela_id FROM docentes WHERE email = 'zoe@otra.edu.ar'")).rows[0].escuela_id), otraEscuela);
  assert.equal(await cuenta("SELECT count(*)::int AS n FROM alumnos WHERE nombre = 'Juan'"), 2);
});

test("no te podés quitar tu propio rol de admin por planilla", async () => {
  const r = await previa(dire, { docentes: "nombre,email,admin\nDire,dire@e.edu.ar,no" });
  assert.match(r.body.docentes[0].mensajes.join(), /quitarte a vos misma/);
});

test("límite de importaciones por docente", async () => {
  await pg.query("DELETE FROM limites");
  let ultimo;
  for (let i = 0; i < 31; i++) ultimo = await previa(dire, { docentes: "nombre,email\nBea Gómez,bea@e.edu.ar" });
  assert.equal(ultimo.status, 429);
});

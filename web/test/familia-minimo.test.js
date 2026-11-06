// Por defecto la familia ve solo los pictos: sin texto de la seño, sin objetivos, sin chat y sin apoyos de la ficha.
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.FAMILIA_FUNCIONES = "";
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const { minimoParaPublicar } = require("../api/_lib/funciones");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAIL;
const post = (c, h, body) => c.llamar(h, { method: "POST", body });
const get = (c, h, query) => c.llamar(h, { method: "GET", query });

const reg = { alumno: "Juan", fecha: "2026-10-27", animo_general: "contento", resumen_familia: "TEXTO-RESUMEN",
  actividades: [{ hora: "12:00", actividad: "TEXTO-ACTIVIDAD", palabra_clave: "almorzar", estado: "bien" }],
  logros: ["TEXTO-LOGRO"], alertas: [{ detalle: "TEXTO-ALERTA" }], notas: "TEXTO-NOTA" };
let pg, ana, laura, juanId;

test.before(async () => {
  pg = await baseNueva();
  await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  juanId = (await post(ana, fichas, { accion: "crear", nombre: "Juan" })).body.alumno.id;
  await post(ana, fichas, { accion: "guardar", id: juanId, nombre: "Juan", contactos: [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com" }], apoyos: { regulacion: "TEXTO-APOYO" }, objetivos: ["TEXTO-OBJETIVO"] });
  const r = await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [reg], mensaje_docente: "TEXTO-MENSAJE",
    agenda: { dia: "martes", pasos: [{ hora: "9:00", palabra_clave: "música", texto: "TEXTO-AGENDA", es_apoyo: true }] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  laura = await entrarConCodigo(pg, "laura@mail.com", "familia");
});

test("la familia ve los pictos y nada del texto de la seño", async () => {
  const r = await get(laura, familia, { alumno: juanId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.funciones, { texto: false, objetivos: false, chat: false, ficha: false });
  assert.equal(JSON.stringify(r.body).includes("TEXTO-"), false, JSON.stringify(r.body));
  assert.equal(r.body.dias[0].actividades[0].palabra_clave, "almorzar");
  assert.equal(r.body.agenda.pasos[0].palabra_clave, "música");
});

test("el texto ni siquiera se guarda en lo publicado para la familia", async () => {
  const guardado = JSON.stringify([...pg.blobs.values()]);
  assert.equal(guardado.includes("TEXTO-"), false, guardado);
  assert.match(guardado, /almorzar/);
});

test("el chat está apagado", async () => {
  const r = await post(laura, familia, { accion: "preguntar", alumno_id: juanId, pregunta: "¿Cómo comió?" });
  assert.equal(r.status, 403);
});

test("la ficha muestra contactos y consentimiento, sin apoyos ni objetivos; la exportación trae todo", async () => {
  const r = await get(laura, fichas, {});
  const a = r.body.alumnos[0];
  assert.equal(a.contactos[0].nombre, "Laura");
  assert.equal("apoyos" in a, false); assert.equal("objetivos" in a, false);
  const ex = await get(laura, fichas, { exportar: "1" });
  assert.match(JSON.stringify(ex.body), /TEXTO-APOYO/);
});

test("prender a demanda: FAMILIA_FUNCIONES=texto,chat vuelve a mostrar el texto", () => {
  process.env.FAMILIA_FUNCIONES = "texto,chat";
  const d = { alumno: "J", registros: [reg], agenda: null, mensaje_docente: "M" };
  assert.equal(minimoParaPublicar(d), d);
  process.env.FAMILIA_FUNCIONES = "";
  assert.equal(JSON.stringify(minimoParaPublicar(d)).includes("TEXTO-"), false);
});

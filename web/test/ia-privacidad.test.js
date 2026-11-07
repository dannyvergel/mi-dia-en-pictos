// IA sin retención y minimización: lo que sale hacia OpenRouter.
// Se simula OpenRouter reemplazando fetch y se revisa cada cuerpo enviado.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const auth = require("../api/auth");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const dia = require("../api/dia");
const agente = require("../api/agente");
const M = require("../api/_lib/minimizar");
const modelos = require("../api/_lib/modelos");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAIL;
const post = (c, h, body) => c.llamar(h, { method: "POST", body });

// Datos ficticios que NUNCA tienen que llegar a la IA.
const PROHIBIDOS = ["laura@mail.com", "341 555 1234", "5551234", "Laura", "celíaco", "risperidona", "ibuprofeno", "Gómez", "papa@mail.com"];

const enviados = [], urls = [];
let respuestas = [];
const fetchReal = global.fetch;
test.before(() => {
  process.env.OPENROUTER_API_KEY = "sk-prueba";
  global.fetch = async (url, opts) => {
    if (!/openrouter\.ai/.test(String(url))) return { ok: true, status: 200, json: async () => [] }; // ARASAAC
    const body = JSON.parse(opts.body);
    urls.push(String(url));
    enviados.push(body);
    const msg = respuestas.length ? respuestas.shift() : { content: JSON.stringify({ en_tema: true, respuesta: "Estuvo contento en Música." }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: msg }] }), text: async () => "" };
  };
});
test.after(() => { global.fetch = fetchReal; delete process.env.OPENROUTER_API_KEY; });

let pg, ana, juanId;
test.before(async () => {
  pg = await baseNueva();
  await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  juanId = (await post(ana, fichas, { accion: "crear", nombre: "Juan" })).body.alumno.id;
  const r = await post(ana, fichas, { accion: "guardar", id: juanId, nombre: "Juan",
    contactos: [{ nombre: "Laura Gómez", vinculo: "mamá", email: "laura@mail.com", telefono: "+54 341 555 1234" }],
    apoyos: { sensoriales: "ruido fuerte", regulacion: "auriculares", intereses: "trenes", comunicacion: "pictos", alimentacion: "celíaco", otros: "toma risperidona" },
    objetivos: ["Comer con autonomía en el comedor"], consentimiento: { dado: false } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

function revisarEnvio(b) {
  const texto = JSON.stringify(b);
  for (const p of PROHIBIDOS) assert.equal(texto.includes(p), false, `se mandó a la IA: ${p}`);
  assert.deepEqual(b.provider, { data_collection: "deny", zdr: true });
  for (const m of b.models) assert.ok(modelos.PERMITIDOS.includes(m), m);
  for (const m of b.models) assert.equal(modelos.SIN_ZDR.includes(m), false);
}

test("modelos: todas las llamadas llevan data_collection=deny y zdr=true, y no se puede pisar", () => {
  const b = modelos.cuerpo("chat", { provider: { data_collection: "allow" }, messages: [] });
  assert.deepEqual(b.provider, { data_collection: "deny", zdr: true });
  assert.equal(modelos.PERMITIDOS.some(m => m.endsWith(":free") || m === "openrouter/free"), false);
});

test("modo OpenRouter (sin LLM_BASE_URL): siempre la URL de OpenRouter, con provider y models", async () => {
  assert.equal(process.env.LLM_BASE_URL, undefined);
  enviados.length = 0; urls.length = 0;
  respuestas = [{ content: JSON.stringify({ actividades: [], animo_general: "contento", logros: [], alertas: [], resumen_familia: "Bien." }) }];
  const r = await post(ana, dia, { alumno: "Juan", fecha: "2026-10-28", texto: "Llegó contento." });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(urls, ["https://openrouter.ai/api/v1/chat/completions"]);
  assert.equal(enviados[0].model, modelos.PRINCIPAL);
  revisarEnvio(enviados[0]);
});

test("limpiarTexto tapa emails y teléfonos pero deja fechas y horas", () => {
  const t = M.limpiarTexto("Llamar a papa@mail.com o al +54 9 341 555-1234 el 2026-10-27 a las 09:30, DNI 30.123.456");
  assert.equal(t.includes("papa@mail.com"), false);
  assert.equal(t.includes("555-1234"), false);
  assert.equal(t.includes("30.123.456"), false);
  assert.ok(t.includes("2026-10-27")); assert.ok(t.includes("09:30"));
});

test("perfil para la IA: sin alimentación, otros apoyos ni observaciones", () => {
  const p = M.perfilParaIA({ comunicacion: "pictos", sensibilidades: "ruido", lo_calma: "auriculares", le_gusta: "trenes", observaciones: "celíaco. toma risperidona" });
  assert.deepEqual(Object.keys(p).sort(), ["comunicacion", "le_gusta", "lo_calma", "sensibilidades"]);
});

test("/api/dia: solo nombre de pila y relato con contactos tapados", async () => {
  enviados.length = 0;
  respuestas = [{ content: JSON.stringify({ actividades: [], animo_general: "contento", logros: [], alertas: [], resumen_familia: "Bien." }) }];
  const r = await post(ana, dia, { alumno: "Juan", fecha: "2026-10-28", texto: "Llegó contento. La mamá dejó su mail papa@mail.com y el tel 341 555 1234." });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(enviados.length, 1);
  revisarEnvio(enviados[0]);
  assert.match(enviados[0].messages[1].content, /Alumno: Juan\n/);
});

test("/api/agente: la ficha manda, el perfil va sin salud ni contactos (aunque el navegador mande de más)", async () => {
  enviados.length = 0;
  respuestas = [
    { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "leer_perfil", arguments: "{}" } }, { id: "t2", type: "function", function: { name: "leer_historial", arguments: "{}" } }] },
    { content: JSON.stringify({ titular: "ok", hallazgos: [], ppi: [], estrategias: [], mensaje_familia: "", nota_docente: "" }) }
  ];
  const reg = { alumno: "Juan", fecha: "2026-10-27", animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música", palabra_clave: "música", estado: "bien" }],
    logros: [], alertas: [{ tipo: "medicacion", detalle: "se le dio ibuprofeno", nivel: "bajo" }], registro_docente: "Laura Gómez llamó" };
  const r = await post(ana, agente, { alumno: "Juan", registros: [reg], perfil: { observaciones: "celíaco", contactos: "laura@mail.com" }, ppi: [{ objetivo: "papa@mail.com", palabras: ["x"] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.modo, "ia");
  assert.ok(enviados.length >= 2);
  for (const b of enviados) revisarEnvio(b);
  const herramientas = JSON.stringify(enviados.at(-1).messages.filter(m => m.role === "tool"));
  assert.ok(herramientas.includes("trenes")); // el perfil funcional sí llega
});

test("chat de la familia: sin alertas de salud, sin contactos; la pregunta va con el email tapado", async () => {
  const reg = { alumno: "Juan", fecha: "2026-10-27", animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música", palabra_clave: "música", estado: "bien" }],
    logros: ["Saludó"], alertas: [{ tipo: "medicacion", detalle: "se le dio ibuprofeno", nivel: "bajo" }, { tipo: "conducta", detalle: "lloró en el recreo", nivel: "bajo" }] };
  assert.equal((await post(ana, familia, { accion: "publicar", alumno_id: juanId, registros: [reg] })).status, 200);
  const fam = await entrarConCodigo(pg, "laura@mail.com", "familia");
  enviados.length = 0;
  const r = await post(fam, familia, { accion: "preguntar", alumno_id: juanId, pregunta: "¿Cómo le fue en Música? Por las dudas, soy laura@mail.com" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(enviados.length, 1);
  revisarEnvio(enviados[0]);
  const sistema = enviados[0].messages[0].content;
  assert.ok(sistema.includes("lloró en el recreo"));
  assert.ok(sistema.includes("nota de salud registrada"));
  // Lo guardado en el historial también va tapado.
  const t = (await pg.query("SELECT texto FROM chat_turnos WHERE rol = 'familia'")).rows;
  assert.equal(JSON.stringify(t).includes("laura@mail.com"), false);
});

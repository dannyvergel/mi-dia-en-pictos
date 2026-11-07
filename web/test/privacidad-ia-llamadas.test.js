// What really leaves for the LLM: no real student name, phone or email in any request body,
// while the user-visible response still shows the real name. fetch is stubbed (no network).
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const fichas = require("../api/fichas");
const familia = require("../api/familia");
const dia = require("../api/dia");
const agente = require("../api/agente");

process.env.DOCENTE_PIN = "4321";
delete process.env.VERCEL_ENV; delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAIL;
const post = (c, h, body) => c.llamar(h, { method: "POST", body });

// Invented personal data: none of it may reach the model.
const NOMBRE = "Lucía Ferrer";
const PROHIBIDOS = ["Lucía", "Lucia", "Ferrer", "341 555 1234", "5551234", "mama.ferrer@mail.com", "https://ejemplo.test/lu"];

const enviados = [];
let respuestas = [];
const fetchReal = global.fetch;
test.before(() => {
  process.env.OPENROUTER_API_KEY = "sk-prueba";
  global.fetch = async (url, opts) => {
    if (!/openrouter\.ai/.test(String(url))) return { ok: true, status: 200, json: async () => [] }; // ARASAAC
    enviados.push(JSON.parse(opts.body));
    const msg = respuestas.shift();
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: msg }] }), text: async () => "" };
  };
});
test.after(() => { global.fetch = fetchReal; delete process.env.OPENROUTER_API_KEY; });

let pg, ana, luciaId;
test.before(async () => {
  pg = await baseNueva();
  await altaEscuela({ escuela: "Escuela 2002", nombre: "Ana", email: "ana@escuela.edu.ar" });
  ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  luciaId = (await post(ana, fichas, { accion: "crear", nombre: NOMBRE })).body.alumno.id;
  const r = await post(ana, fichas, { accion: "guardar", id: luciaId, nombre: NOMBRE,
    contactos: [{ nombre: "Marta Ferrer", vinculo: "mamá", email: "mama.ferrer@mail.com", telefono: "+54 341 555 1234" }],
    apoyos: { sensoriales: "ruido fuerte", regulacion: "auriculares", intereses: "trenes", comunicacion: "pictos" },
    objetivos: ["Que Lucía coma sola en el comedor"], consentimiento: { dado: false } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

function sinDatosPersonales(b) {
  const texto = JSON.stringify(b.messages);
  for (const p of PROHIBIDOS) assert.equal(texto.includes(p), false, `reached the LLM: ${p}`);
}

test("/api/dia: the model gets an alias and tags; the response shows the real name", async () => {
  enviados.length = 0;
  respuestas = [{ content: JSON.stringify({ alumno: "Alumno A", actividades: [{ hora: "09:00", actividad: "Alumno A pintó", palabra_clave: "pintar", estado: "bien" }],
    animo_general: "contento", logros: ["Alumno A saludó"], alertas: [], resumen_familia: "Alumno A tuvo un buen día.", registro_docente: "Alumno A trabajó bien." }) }];
  const texto = "Lucía llegó contenta. Ferrer pintó. La mamá dejó el 341 555 1234, mama.ferrer@mail.com y https://ejemplo.test/lu.";
  const r = await post(ana, dia, { alumno: NOMBRE, fecha: "2026-10-28", texto });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(enviados.length, 1);
  sinDatosPersonales(enviados[0]);
  const usuario = enviados[0].messages[1].content;
  assert.match(usuario, /Alumno: Alumno A\n/);
  assert.match(usuario, /Relato: Alumno A llegó contenta\. Alumno A pintó\./);
  assert.match(usuario, /\[teléfono\]|\[número\]/);
  assert.ok(usuario.includes("[email]") && usuario.includes("[enlace]"));
  // The user-visible response carries the real name everywhere the alias appeared.
  assert.equal(r.body.alumno, NOMBRE);
  assert.equal(r.body.actividades[0].actividad, `${NOMBRE} pintó`);
  assert.equal(r.body.resumen_familia, `${NOMBRE} tuvo un buen día.`);
  assert.ok(r.body.mensaje_familia.includes(`Así fue el día de ${NOMBRE}`));
  assert.ok(r.body.mensaje_familia.includes(`${NOMBRE} saludó`));
  assert.equal(JSON.stringify(r.body).includes("Alumno A"), false);
});

test("/api/dia: the pictogram search never receives the real name", async () => {
  const pedidos = [];
  const f = global.fetch;
  global.fetch = async (url, opts) => { if (/arasaac/.test(String(url))) pedidos.push(String(url)); return f(url, opts); };
  try {
    respuestas = [{ content: JSON.stringify({ actividades: [{ actividad: "juego", palabra_clave: "Alumno A juega", estado: "bien" }], animo_general: "contento", logros: [], alertas: [], resumen_familia: "ok" }) }];
    const r = await post(ana, dia, { alumno: NOMBRE, fecha: "2026-10-28", texto: "Lucía jugó." });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(pedidos.length >= 1);
    for (const u of pedidos) assert.equal(/luc|ferrer/i.test(decodeURIComponent(u)), false, u);
  } finally { global.fetch = f; }
});

test("family chat: the system prompt, history and question carry the alias; the answer shows the real name", async () => {
  const reg = { alumno: NOMBRE, fecha: "2026-10-27", animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música", palabra_clave: "música", estado: "bien" }], logros: ["Saludó"], alertas: [] };
  assert.equal((await post(ana, familia, { accion: "publicar", alumno_id: luciaId, registros: [reg] })).status, 200);
  const fam = await entrarConCodigo(pg, "mama.ferrer@mail.com", "familia");
  enviados.length = 0;
  respuestas = [{ content: JSON.stringify({ en_tema: true, respuesta: "Alumno A estuvo contenta en Música." }) }];
  const r = await post(fam, familia, { accion: "preguntar", alumno_id: luciaId, pregunta: "¿Cómo le fue a Lucía? Mi tel es 341 555 1234 y mi mail mama.ferrer@mail.com" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(enviados.length, 1);
  sinDatosPersonales(enviados[0]);
  assert.ok(enviados[0].messages[0].content.includes("la familia de Alumno A"));
  assert.ok(enviados[0].messages.at(-1).content.includes("¿Cómo le fue a Alumno A?"));
  assert.equal(r.body.respuesta, `${NOMBRE} estuvo contenta en Música.`);
  assert.equal(r.body.modo, "ia");
});

test("family chat: the history sent on the next turn is protected too", async () => {
  const fam = await entrarConCodigo(pg, "mama.ferrer@mail.com", "familia");
  enviados.length = 0;
  respuestas = [{ content: JSON.stringify({ en_tema: true, respuesta: "Alumno A comió bien." }) }];
  const r = await post(fam, familia, { accion: "preguntar", alumno_id: luciaId, pregunta: "¿Y comió bien?" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(enviados[0].messages.length > 2, "includes the previous turn");
  sinDatosPersonales(enviados[0]);
  assert.equal(r.body.respuesta, `${NOMBRE} comió bien.`);
});

test("/api/agente: every request of the tool loop is protected; the result shows the real name", async () => {
  enviados.length = 0;
  respuestas = [
    { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "leer_perfil", arguments: "{}" } }, { id: "t2", type: "function", function: { name: "leer_historial", arguments: "{}" } }] },
    { content: JSON.stringify({ titular: "Alumno A progresa", hallazgos: [{ texto: "Alumno A come mejor", evidencia: "3 días" }], ppi: [], estrategias: [], mensaje_familia: "Hola, Alumno A avanza.", nota_docente: "Alumno A estable." }) }
  ];
  const reg = { alumno: NOMBRE, fecha: "2026-10-27", animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música con Lucía", palabra_clave: "música", estado: "bien" }],
    logros: ["Lucía saludó"], alertas: [], registro_docente: "Lucía Ferrer, tel 341 555 1234" };
  const r = await post(ana, agente, { alumno: NOMBRE, registros: [reg] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.modo, "ia");
  assert.equal(enviados.length, 2);
  for (const b of enviados) sinDatosPersonales(b);
  assert.ok(enviados[0].messages[1].content.includes("Alumno: Alumno A."));
  // The tool results (second request) still carry data, just aliased.
  assert.ok(JSON.stringify(enviados[1].messages.filter(m => m.role === "tool")).includes("Alumno A"));
  assert.equal(r.body.resultado.titular, `${NOMBRE} progresa`);
  assert.equal(r.body.resultado.hallazgos[0].texto, `${NOMBRE} come mejor`);
  assert.equal(r.body.resultado.mensaje_familia, `Hola, ${NOMBRE} avanza.`);
  assert.equal(JSON.stringify(r.body.resultado).includes("Alumno A"), false);
});

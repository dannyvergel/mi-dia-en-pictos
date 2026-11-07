// LLM generalization: OpenRouter by default (unchanged), any OpenAI-compatible server when LLM_BASE_URL is set.
const test = require("node:test");
const assert = require("node:assert/strict");
const { baseNueva, cliente, entrarConCodigo, altaEscuela } = require("./ayuda");
const modelos = require("../api/_lib/modelos");
const pin = require("../api/_lib/pin");
const fichas = require("../api/fichas");
const dia = require("../api/dia");
const agente = require("../api/agente");

const VARS = ["LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY", "LLM_TIMEOUT_MS", "LLM_AGENT_TIMEOUT_MS", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "PUENTE_URL", "DEMO_ABIERTO"];
const guardado = {};
test.beforeEach(() => { for (const k of VARS) { guardado[k] = process.env[k]; delete process.env[k]; } });
test.afterEach(() => { for (const k of VARS) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; } });

test("sin LLM_BASE_URL: URL, cabeceras y cuerpo son los de OpenRouter de siempre", () => {
  process.env.OPENROUTER_API_KEY = "sk-or";
  assert.equal(modelos.modoLLM(), "openrouter");
  assert.equal(modelos.urlChat(), "https://openrouter.ai/api/v1/chat/completions");
  const h = modelos.cabeceras();
  assert.equal(h.Authorization, "Bearer sk-or");
  assert.equal(h["X-Title"], "Puente");
  assert.ok(h["HTTP-Referer"]);
  const b = modelos.cuerpo("chat", { messages: [] });
  assert.deepEqual(b.provider, { data_collection: "deny", zdr: true });
  assert.equal(b.model, modelos.PRINCIPAL);
  assert.ok(Array.isArray(b.models) && b.models.length === 3);
  assert.equal(modelos.modeloActual(), modelos.PRINCIPAL);
  assert.equal(modelos.iaConfigurada(), true);
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(modelos.iaConfigurada(), false);
  // LLM_MODEL / LLM_API_KEY alone do nothing without LLM_BASE_URL.
  process.env.LLM_MODEL = "otro"; process.env.LLM_API_KEY = "k";
  assert.equal(modelos.modoLLM(), "openrouter");
  assert.equal(modelos.cuerpo("chat", {}).model, modelos.PRINCIPAL);
  assert.equal(modelos.iaConfigurada(), false);
});

test("con LLM_BASE_URL: /chat/completions, sin campos de OpenRouter, sin lista de modelos permitidos", () => {
  process.env.LLM_BASE_URL = "http://ollama:11434/v1/";
  process.env.LLM_MODEL = "llama3.2:3b";
  assert.equal(modelos.modoLLM(), "generico");
  assert.equal(modelos.urlChat(), "http://ollama:11434/v1/chat/completions");
  const b = modelos.cuerpo("agente", { temperature: 0.2, provider: { data_collection: "allow" }, models: ["x"], messages: [] });
  assert.equal(b.model, "llama3.2:3b", "a model outside the OpenRouter allow-list is fine");
  assert.equal(b.max_tokens, 2500);
  assert.equal("provider" in b, false);
  assert.equal("models" in b, false);
  assert.equal(modelos.modeloActual(), "llama3.2:3b");
  assert.equal(modelos.iaConfigurada(), true, "enabled without any API key");
  const h = modelos.cabeceras();
  assert.equal("Authorization" in h, false);
  assert.equal(h["Content-Type"], "application/json");
  assert.equal("X-Title" in h, false);
  assert.equal("HTTP-Referer" in h, false);
  process.env.LLM_API_KEY = "local-key";
  assert.equal(modelos.cabeceras().Authorization, "Bearer local-key");
  delete process.env.LLM_MODEL;
  assert.equal("model" in modelos.cuerpo("chat", {}), false, "no model configured: the field is left out");
});

test("timeouts: por defecto 28 s por llamada y 30 s en total; configurables", () => {
  assert.equal(modelos.timeoutLlamadaMs(), 28000);
  assert.equal(modelos.timeoutAgenteMs(), 30000);
  process.env.LLM_TIMEOUT_MS = "300000";
  assert.equal(modelos.timeoutLlamadaMs(), 300000);
  assert.equal(modelos.timeoutAgenteMs(), 302000, "the overall cap follows the per-call timeout");
  process.env.LLM_AGENT_TIMEOUT_MS = "900000";
  assert.equal(modelos.timeoutAgenteMs(), 900000);
  process.env.LLM_TIMEOUT_MS = "basura"; delete process.env.LLM_AGENT_TIMEOUT_MS;
  assert.equal(modelos.timeoutLlamadaMs(), 28000);
  assert.equal(modelos.timeoutAgenteMs(), 30000);
});

test("iaActiva: key de OpenRouter o LLM_BASE_URL; el demo abierto la apaga igual", () => {
  assert.equal(pin.iaActiva(), false);
  process.env.OPENROUTER_API_KEY = "sk"; assert.equal(pin.iaActiva(), true);
  delete process.env.OPENROUTER_API_KEY; process.env.LLM_BASE_URL = "http://localhost:8080/v1"; assert.equal(pin.iaActiva(), true);
});

// ---- endpoints contra un servidor OpenAI-compatible simulado ----
const fetchReal = global.fetch;
const vistos = [];
test.after(() => { global.fetch = fetchReal; });

test("/api/dia y /api/agente hablan con LLM_BASE_URL y funcionan sin ninguna key", async () => {
  const pg = await baseNueva();
  await altaEscuela({ escuela: "Escuela 2001", nombre: "Ana", email: "ana@escuela.edu.ar" });
  const ana = await entrarConCodigo(pg, "ana@escuela.edu.ar");
  const juanId = (await ana.llamar(fichas, { method: "POST", body: { accion: "crear", nombre: "Juan" } })).body.alumno.id;
  process.env.LLM_BASE_URL = "http://llm.local:8000/v1"; process.env.LLM_MODEL = "qwen-local";
  const respuestas = [];
  global.fetch = async (url, opts) => {
    if (!String(url).startsWith("http://llm.local")) return { ok: true, status: 200, json: async () => [] }; // ARASAAC
    vistos.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body), signal: opts.signal });
    const msg = respuestas.shift();
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: msg }] }), text: async () => "" };
  };
  vistos.length = 0;
  respuestas.push({ content: JSON.stringify({ actividades: [], animo_general: "contento", logros: [], alertas: [], resumen_familia: "Bien." }) });
  const r = await ana.llamar(dia, { method: "POST", body: { alumno: "Juan", fecha: "2026-10-28", texto: "Llegó contento." } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(vistos[0].url, "http://llm.local:8000/v1/chat/completions");
  assert.equal(vistos[0].body.model, "qwen-local");
  assert.equal("provider" in vistos[0].body, false);
  assert.equal("models" in vistos[0].body, false);
  assert.equal("Authorization" in vistos[0].headers, false);

  vistos.length = 0;
  respuestas.push({ content: JSON.stringify({ titular: "ok", hallazgos: [], ppi: [], estrategias: [], mensaje_familia: "", nota_docente: "" }) });
  const reg = { alumno: "Juan", fecha: "2026-10-27", animo_general: "contento", actividades: [{ hora: "09:00", actividad: "Música", palabra_clave: "música", estado: "bien" }], logros: [], alertas: [] };
  const a = await ana.llamar(agente, { method: "POST", body: { alumno: "Juan", registros: [reg] } });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.modo, "ia");
  assert.equal(a.body.modelo, "qwen-local");
  assert.equal(vistos[0].url, "http://llm.local:8000/v1/chat/completions");
  assert.ok(vistos[0].signal, "the agent keeps its per-call timeout");
  assert.ok(juanId);
});

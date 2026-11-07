#!/usr/bin/env node
// Model evaluation harness: runs synthetic Puente cases through the REAL prompts and request bodies of the app
// (api/dia.js, api/_lib/chat.js, api/_lib/modelos.js) against ANY OpenAI-compatible server (Ollama, llama.cpp, vLLM...).
// Never use real children's data here. See docs/evaluacion-llm/README.md.
//
//   LLM_BASE_URL=http://localhost:11434/v1 node scripts/evaluar-llm.js --modelos qwen2.5:7b,gemma3:4b
//
// Env: LLM_BASE_URL (required), LLM_API_KEY (optional), LLM_MODELS (comma list, alternative to --modelos).
// Flags: --modelos a,b  --timeout-ms N (600000)  --max-casos N  --salida <plantilla>  --casos <dir>  --fecha YYYY-MM-DD
//        --sin-prefiltro  --hardware "<texto>"  --ayuda
const fs = require("fs");
const path = require("path");
const modelos = require("../api/_lib/modelos");
const dia = require("../api/dia");
const chat = require("../api/_lib/chat");
const { cargarCasos, intercalar } = require("./evaluar-llm/casos");
const { puntuarDia, puntuarChat, CRITERIOS } = require("./evaluar-llm/puntaje");
const { resumirModelo, renderResumen } = require("./evaluar-llm/resumen");

const VERSION_ARNES = 1;
const TIMEOUT_POR_DEFECTO = 600000;
const SALIDA_POR_DEFECTO = path.resolve(__dirname, "../../docs/evaluacion-llm/resultados/<fecha>-<modelo>.json");
const AYUDA = `Uso: LLM_BASE_URL=<url/v1> node scripts/evaluar-llm.js --modelos a,b,c [opciones]
  --modelos a,b,c     modelos a comparar (o LLM_MODELS)
  --timeout-ms N      espera máxima por pedido (por defecto ${TIMEOUT_POR_DEFECTO})
  --max-casos N       corre solo N casos en total (alterna día y chat)
  --salida RUTA       plantilla del JSON por modelo; admite <fecha> y <modelo>
  --casos DIR         carpeta de casos (por defecto docs/evaluacion-llm/casos)
  --fecha AAAA-MM-DD  fecha para los nombres de archivo
  --sin-prefiltro     manda al modelo también las preguntas que el prefiltro de la app frena
  --hardware "texto"  descripción del equipo, para el resumen
Solo datos sintéticos. LLM_API_KEY es opcional.`;

function parsearArgs(argv) {
  const a = { modelos: null, timeoutMs: null, maxCasos: null, salida: null, casos: null, fecha: null, sinPrefiltro: false, hardware: null, ayuda: false };
  const valor = (i, n) => { if (i + 1 >= argv.length) throw new Error(`Falta el valor de ${n}`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--modelos") a.modelos = valor(i++, k).split(",").map(s => s.trim()).filter(Boolean);
    else if (k === "--timeout-ms") a.timeoutMs = Number(valor(i++, k));
    else if (k === "--max-casos") a.maxCasos = Number(valor(i++, k));
    else if (k === "--salida") a.salida = valor(i++, k);
    else if (k === "--casos") a.casos = valor(i++, k);
    else if (k === "--fecha") a.fecha = valor(i++, k);
    else if (k === "--hardware") a.hardware = valor(i++, k);
    else if (k === "--sin-prefiltro") a.sinPrefiltro = true;
    else if (k === "--ayuda" || k === "--help" || k === "-h") a.ayuda = true;
    else throw new Error(`Opción desconocida: ${k}`);
  }
  for (const [n, v] of [["--timeout-ms", a.timeoutMs], ["--max-casos", a.maxCasos]]) if (v !== null && !(Number.isInteger(v) && v > 0)) throw new Error(`${n} debe ser un entero positivo`);
  if (a.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) throw new Error("--fecha debe ser AAAA-MM-DD");
  return a;
}

const hoy = () => new Date().toLocaleDateString("sv");
const seguro = s => String(s).replace(/[^\w.-]+/g, "_");
const plantilla = (t, fecha, modelo) => t.replace(/<fecha>/g, fecha).replace(/<modelo>/g, seguro(modelo));
// Host only: never write credentials or paths from the base URL into reports.
const soloHost = u => { try { return new URL(u).host; } catch { return "(url inválida)"; } };

// Same request "extra" fields the app sends (api/dia.js, api/_lib/chat.js); max_tokens, model and auth come from modelos.js.
const extra = messages => ({ temperature: 0.2, response_format: { type: "json_object" }, messages });

// One model call through the app's own request builder. Never throws: errors come back as { error }.
async function llamar(uso, messages) {
  const t0 = performance.now();
  try {
    const r = await modelos.pedirChat(uso, extra(messages));
    if (!r.ok) return { error: "http_" + r.status, latencia_ms: Math.round(performance.now() - t0) };
    const j = await r.json();
    const latencia_ms = Math.round(performance.now() - t0);
    const contenido = j?.choices?.[0]?.message?.content;
    if (typeof contenido !== "string") return { error: "respuesta_sin_contenido", latencia_ms };
    const usoTokens = j?.usage?.completion_tokens;
    const estimado = !(typeof usoTokens === "number" && usoTokens > 0);
    const tokens = estimado ? Math.max(1, Math.ceil(contenido.length / 4)) : usoTokens;
    return { raw: contenido, latencia_ms, tokens_salida: tokens, tokens_estimados: estimado, tokens_por_s: Number((tokens / Math.max(latencia_ms, 1) * 1000).toFixed(2)) };
  } catch (e) {
    const latencia_ms = Math.round(performance.now() - t0);
    const nombre = e && e.name;
    return { error: nombre === "TimeoutError" || nombre === "AbortError" ? "timeout" : "red: " + String(e && e.message || e).slice(0, 120), latencia_ms };
  }
}

const vacio = () => Object.fromEntries(Object.keys(CRITERIOS).map(k => [k, null]));

async function correrCaso(caso, { sinPrefiltro }) {
  const base = { id: caso.id, tipo: caso.tipo };
  if (caso.tipo === "dia") {
    const m = await llamar("dia", dia.mensajes(caso.alumno, caso.fecha, caso.texto));
    if (m.error) return { ...base, llamo_modelo: true, error: m.error, latencia_ms: m.latencia_ms, criterios: vacio(), detalles: {} };
    const p = puntuarDia(caso, m.raw);
    return { ...base, llamo_modelo: true, error: null, ...pick(m), criterios: { ...vacio(), ...p.criterios }, detalles: p.detalles, salida: m.raw.slice(0, 6000) };
  }
  const regla = sinPrefiltro ? null : chat.prefiltro(caso.pregunta);
  if (regla) {
    const p = puntuarChat(caso, null, { prefiltro: regla });
    return { ...base, llamo_modelo: false, error: null, via: "prefiltro:" + regla, criterios: { ...vacio(), ...p.criterios }, detalles: p.detalles };
  }
  const m = await llamar("chat", chat.mensajes(caso.contextoDatos, caso.pregunta, []));
  if (m.error) return { ...base, llamo_modelo: true, error: m.error, latencia_ms: m.latencia_ms, criterios: vacio(), detalles: {} };
  const p = puntuarChat(caso, m.raw);
  return { ...base, llamo_modelo: true, error: null, ...pick(m), via: p.via, criterios: { ...vacio(), ...p.criterios }, detalles: p.detalles, salida: m.raw.slice(0, 6000) };
}
const pick = m => ({ latencia_ms: m.latencia_ms, tokens_salida: m.tokens_salida, tokens_estimados: m.tokens_estimados, tokens_por_s: m.tokens_por_s });

// Runs every case against every model. Returns [{ meta, casos, resumen }] and writes the per-model JSON files and the Markdown summary.
async function ejecutar(opts) {
  const { baseUrl, apiKey, modelos: lista, timeoutMs = TIMEOUT_POR_DEFECTO, maxCasos = null, sinPrefiltro = false, hardware = null, log = () => {} } = opts;
  if (!baseUrl) throw new Error("Falta LLM_BASE_URL (servidor OpenAI-compatible, por ejemplo http://localhost:11434/v1)");
  if (!lista || !lista.length) throw new Error("Faltan modelos: usá --modelos a,b,c o LLM_MODELS");
  const fecha = opts.fecha || hoy();
  const plantillaSalida = opts.salida ? path.resolve(opts.salida) : SALIDA_POR_DEFECTO;
  const todos = cargarCasos(opts.casos || undefined);
  const casos = maxCasos ? intercalar(todos).slice(0, maxCasos) : intercalar(todos);

  // The app reads its LLM config from the environment on every call; set it for the run and restore afterwards.
  const VARS = ["LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY", "LLM_TIMEOUT_MS"];
  const previo = Object.fromEntries(VARS.map(k => [k, process.env[k]]));
  const resultados = [];
  try {
    process.env.LLM_BASE_URL = baseUrl;
    process.env.LLM_TIMEOUT_MS = String(timeoutMs);
    if (apiKey) process.env.LLM_API_KEY = apiKey; else delete process.env.LLM_API_KEY;
    for (const modelo of lista) {
      process.env.LLM_MODEL = modelo;
      log(`\n== ${modelo} (${casos.length} casos)`);
      const res = [];
      for (const caso of casos) {
        const r = await correrCaso(caso, { sinPrefiltro });
        res.push(r);
        log(`  ${caso.id.padEnd(28)} ${r.error ? "ERROR " + r.error : (r.llamo_modelo ? (r.latencia_ms / 1000).toFixed(1) + " s" : "prefiltro")}`);
      }
      const meta = { arnes: VERSION_ARNES, fecha, modelo, servidor: soloHost(baseUrl), timeout_ms: timeoutMs, max_casos: maxCasos, sin_prefiltro: sinPrefiltro, hardware, generado: new Date().toISOString() };
      const resumen = resumirModelo(res);
      const resultado = { meta, resumen, casos: res };
      const archivo = plantilla(plantillaSalida, fecha, modelo);
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, JSON.stringify(resultado, null, 2) + "\n");
      resultado.archivo = archivo;
      resultados.push(resultado);
    }
  } finally {
    for (const k of VARS) { if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k]; }
  }
  const metaResumen = { fecha, servidor: soloHost(baseUrl), timeout_ms: timeoutMs, max_casos: maxCasos, sin_prefiltro: sinPrefiltro, hardware,
    casos_dia: casos.filter(c => c.tipo === "dia").length, casos_chat: casos.filter(c => c.tipo === "chat").length };
  const archivoResumen = path.join(path.dirname(plantilla(plantillaSalida, fecha, "x")), `resumen-${fecha}.md`);
  fs.mkdirSync(path.dirname(archivoResumen), { recursive: true });
  fs.writeFileSync(archivoResumen, renderResumen(resultados, metaResumen));
  return { resultados, archivoResumen };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  let a;
  try { a = parsearArgs(argv); } catch (e) { console.error(e.message + "\n\n" + AYUDA); return 2; }
  if (a.ayuda) { console.log(AYUDA); return 0; }
  const lista = a.modelos || (env.LLM_MODELS ? env.LLM_MODELS.split(",").map(s => s.trim()).filter(Boolean) : null);
  try {
    const { resultados, archivoResumen } = await ejecutar({
      baseUrl: env.LLM_BASE_URL && env.LLM_BASE_URL.trim(), apiKey: env.LLM_API_KEY && env.LLM_API_KEY.trim(), modelos: lista,
      timeoutMs: a.timeoutMs || TIMEOUT_POR_DEFECTO, maxCasos: a.maxCasos, salida: a.salida, casos: a.casos, fecha: a.fecha,
      sinPrefiltro: a.sinPrefiltro, hardware: a.hardware, log: s => console.log(s)
    });
    for (const r of resultados) console.log(`JSON: ${r.archivo}`);
    console.log(`Resumen: ${archivoResumen}`);
    return 0;
  } catch (e) { console.error("Error: " + e.message); return 1; }
}

if (require.main === module) main().then(c => process.exit(c));
module.exports = { parsearArgs, ejecutar, main, correrCaso, llamar };

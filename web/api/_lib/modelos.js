// Dos modos:
//  · OpenRouter (por defecto, sin LLM_BASE_URL): todo lo de este archivo — lista de modelos con ZDR, `provider`, `models`, OPENROUTER_API_KEY.
//  · Genérico (con LLM_BASE_URL): cualquier servidor compatible con OpenAI (Ollama, llama.cpp, vLLM…) en `${LLM_BASE_URL}/chat/completions`.
//    Usa LLM_MODEL y, si hace falta, LLM_API_KEY (opcional en servidores locales). No manda campos propios de OpenRouter ni aplica la
//    lista de modelos permitidos. Las garantías ZDR de abajo son de OpenRouter: con un servidor propio (en la misma máquina o red) los
//    datos no salen de ahí; si LLM_BASE_URL apunta a un tercero, su política de retención es responsabilidad de quien lo configura.
//    La minimización (minimizar.js) se aplica siempre, en los dos modos.
//  Tiempos: LLM_TIMEOUT_MS (por llamada, 28000) y LLM_AGENT_TIMEOUT_MS (tope total del agente, 30000, o LLM_TIMEOUT_MS + 2000 si es mayor).
//  Un modelo local en CPU necesita valores mucho más grandes (minutos). Por encima de ~290 s el pedido a LLM_BASE_URL usa node:http
//  (el fetch de Node corta a los 300 s sin cabeceras, ver pedirChat).
//
// Solo modelos baratos y que tengan proveedores sin retención (ZDR). Cualquier otro valor en OPENROUTER_MODEL se ignora.
// Precios OpenRouter por millón de tokens (nov 2026, endpoints ZDR más baratos): deepseek-v4-flash desde US$0,05–0,09 entrada /
// US$0,18–0,45 salida; gemma-4-31b-it ~US$0,10/0,16–0,34; nemotron-3.5-lightning ~US$0,03–0,07/0,12–0,20.
//
// Privacidad (datos de menores, Ley 25.326): TODAS las llamadas a OpenRouter llevan
//   provider: { data_collection: "deny", zdr: true }
// · data_collection "deny": solo proveedores que no guardan ni entrenan con los datos.
// · zdr true: solo endpoints con Zero Data Retention (no retienen prompts).
// Si ningún proveedor cumple, OpenRouter responde error y cada función cae a su modo sin IA (plan fijo / negativa amable).
// Verificado el 1/11/2026 contra https://openrouter.ai/api/v1/endpoints/zdr (lista pública de endpoints ZDR):
//   deepseek/deepseek-v4-flash, google/gemma-4-31b-it y nvidia/nemotron-3.5-lightning tienen varios endpoints ZDR.
//   Las variantes gratuitas (":free", Google AI Studio y Nvidia) y el router "openrouter/free" NO tienen endpoints ZDR
//   (los proveedores gratuitos suelen registrar prompts), por eso se sacaron de la lista.
const PERMITIDOS = [
  "deepseek/deepseek-v4-flash",
  "google/gemma-4-31b-it",
  "nvidia/nemotron-3.5-lightning"
];
// Nunca se usan: sin endpoints ZDR (ver arriba). Se dejan anotados para que nadie los vuelva a sumar sin revisar.
const SIN_ZDR = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free", "openrouter/free"];

const PRINCIPAL = PERMITIDOS.includes(process.env.OPENROUTER_MODEL) ? process.env.OPENROUTER_MODEL : PERMITIDOS[0];
// Si el principal falla, OpenRouter prueba estos (nunca uno caro ni uno sin ZDR).
const RESPALDO = PERMITIDOS.filter(m => m !== PRINCIPAL).slice(0, 2);
// Tope de tokens de salida por llamada.
const TOPE = { agente: 2500, dia: 1200, chat: 400 };
// Preferencias de proveedor: sin recolección de datos y solo Zero Data Retention.
const PROVEEDOR = Object.freeze({ data_collection: "deny", zdr: true });

const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const lleno = v => typeof v === "string" && v.trim() !== "";
const baseGenerica = () => lleno(process.env.LLM_BASE_URL) ? process.env.LLM_BASE_URL.trim().replace(/\/+$/, "") : "";
// "generico" si hay LLM_BASE_URL; si no, "openrouter".
const modoLLM = () => baseGenerica() ? "generico" : "openrouter";
const urlChat = () => baseGenerica() ? `${baseGenerica()}/chat/completions` : URL_OPENROUTER;
const nombreProveedor = () => modoLLM() === "generico" ? "LLM" : "OpenRouter";
// Hay IA disponible en el servidor: un LLM propio (sin key) o la key de OpenRouter.
const iaConfigurada = () => modoLLM() === "generico" || !!process.env.OPENROUTER_API_KEY;
const modeloActual = () => modoLLM() === "generico" ? (lleno(process.env.LLM_MODEL) ? process.env.LLM_MODEL.trim() : null) : PRINCIPAL;
const entero = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const timeoutLlamadaMs = () => entero(process.env.LLM_TIMEOUT_MS) || 28000;
const timeoutAgenteMs = () => entero(process.env.LLM_AGENT_TIMEOUT_MS) || Math.max(30000, entero(process.env.LLM_TIMEOUT_MS) + 2000);

function cuerpo(uso, extra) {
  if (modoLLM() === "generico") {
    const { provider, models, ...resto } = extra || {}; // campos de OpenRouter: no van a otros servidores
    const modelo = modeloActual();
    return { ...(modelo ? { model: modelo } : {}), max_tokens: TOPE[uso], ...resto };
  }
  // provider va al final para que ningún "extra" lo pise.
  return { model: PRINCIPAL, models: [PRINCIPAL, ...RESPALDO], max_tokens: TOPE[uso], ...extra, provider: { ...PROVEEDOR } };
}
// Cabeceras para OpenRouter. El Referer sale de PUENTE_URL (dominio propio) o del de Vercel.
function cabeceras() {
  if (modoLLM() === "generico") {
    return { "Content-Type": "application/json", ...(lleno(process.env.LLM_API_KEY) ? { Authorization: "Bearer " + process.env.LLM_API_KEY.trim() } : {}) };
  }
  const url = (process.env.PUENTE_URL || "https://puentepictos.app").replace(/\/+$/, "");
  return { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json", "HTTP-Referer": url, "X-Title": "Puente" };
}
// Node's global fetch (undici) aborts after 300 s without response headers (headersTimeout) and 300 s of body inactivity, whatever
// the AbortSignal says. A non-streaming local model on CPU sends no headers until generation ends, so timeouts above that never applied.
// Only for LLM_BASE_URL (local/own server) and only when the timeout is above that limit, requests go through node:http, which has no
// such socket timeouts: the AbortSignal alone governs both the wait for headers and the body. Below the limit (and always with
// OpenRouter) global fetch is used exactly as before. The npm undici dispatcher was discarded: it is not compatible with the fetch
// bundled in Node, and pinning it to a Node-specific version would be fragile.
const LIMITE_FETCH_MS = 290000;
const usaTransporteLargo = conTope => modoLLM() === "generico" && conTope && timeoutLlamadaMs() > LIMITE_FETCH_MS;
// fetch-like request over node:http(s) with no socket timeouts. Resolves a standard Response (body buffered; chat is non-streaming).
function fetchLargo(url, { method = "GET", headers = {}, body, signal } = {}) {
  const u = new URL(url);
  const cliente = u.protocol === "https:" ? require("node:https") : require("node:http");
  return new Promise((resolve, reject) => {
    const razon = () => (signal && signal.reason) || Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    if (signal && signal.aborted) return reject(razon());
    const datos = body === undefined ? null : Buffer.from(body);
    const req = cliente.request(u, { method, headers: { ...headers, ...(datos ? { "Content-Length": datos.length } : {}) } }, res => {
      const trozos = [];
      res.on("data", t => trozos.push(t));
      res.on("error", reject);
      res.on("aborted", () => reject(razon()));
      res.on("end", () => {
        const sinCuerpo = [101, 204, 205, 304].includes(res.statusCode);
        resolve(new Response(sinCuerpo ? null : Buffer.concat(trozos), { status: res.statusCode, statusText: res.statusMessage, headers: res.headers }));
      });
    });
    const alAbortar = () => { reject(razon()); req.destroy(); };
    if (signal) signal.addEventListener("abort", alAbortar, { once: true });
    req.on("close", () => signal && signal.removeEventListener("abort", alAbortar));
    req.on("error", e => reject(signal && signal.aborted ? razon() : new TypeError("fetch failed", { cause: e })));
    req.end(datos);
  });
}
// Pedido de chat completions al proveedor configurado. `timeout: true` fuerza el tope por llamada (el agente lo usa siempre);
// si no, solo se aplica cuando LLM_TIMEOUT_MS está definido (dia.js y chat.js no tenían tope propio).
function pedirChat(uso, extra, { timeout = false } = {}) {
  const conTope = timeout || entero(process.env.LLM_TIMEOUT_MS) > 0;
  const init = {
    method: "POST",
    headers: cabeceras(),
    ...(conTope ? { signal: AbortSignal.timeout(timeoutLlamadaMs()) } : {}),
    body: JSON.stringify(cuerpo(uso, extra))
  };
  return usaTransporteLargo(conTope) ? fetchLargo(urlChat(), init) : fetch(urlChat(), init);
}
module.exports = { PRINCIPAL, PERMITIDOS, SIN_ZDR, PROVEEDOR, cuerpo, cabeceras, modoLLM, urlChat, nombreProveedor, iaConfigurada, modeloActual,
  timeoutLlamadaMs, timeoutAgenteMs, pedirChat, usaTransporteLargo, fetchLargo };

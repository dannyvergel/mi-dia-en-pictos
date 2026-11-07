// LLM requests must honor LLM_TIMEOUT_MS for the wait for headers and the body even above 300 s
// (Node's global fetch dies at 300 s by default, headersTimeout). Local-model transport: node:http.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const modelos = require("../api/_lib/modelos");

const VARS = ["LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY", "LLM_TIMEOUT_MS", "LLM_AGENT_TIMEOUT_MS", "OPENROUTER_API_KEY"];
const guardado = {};
test.beforeEach(() => { for (const k of VARS) { guardado[k] = process.env[k]; delete process.env[k]; } });
test.afterEach(() => { for (const k of VARS) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; } });

// Stub server: waits `retrasoMs` before sending ANY header, then answers a chat completion.
function servidor(retrasoMs) {
  const visto = { cuerpo: null, auth: null, ruta: null };
  const s = http.createServer((req, res) => {
    let b = ""; req.on("data", d => { b += d; });
    req.on("end", () => {
      visto.cuerpo = b; visto.auth = req.headers.authorization || null; visto.ruta = req.url;
      const t = setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "hola" } }] }));
      }, retrasoMs);
      res.on("close", () => clearTimeout(t));
    });
  });
  return new Promise(ok => s.listen(0, "127.0.0.1", () => ok({
    base: `http://127.0.0.1:${s.address().port}/v1`, visto,
    cerrar: () => new Promise(f => { s.closeAllConnections(); s.close(f); })
  })));
}

test("timeouts: unset env keeps the defaults; the transport follows the configured value", () => {
  assert.equal(modelos.timeoutLlamadaMs(), 28000);
  assert.equal(modelos.timeoutAgenteMs(), 30000);
  assert.equal(modelos.usaTransporteLargo(true), false, "OpenRouter/default path stays on fetch");
  process.env.LLM_BASE_URL = "http://localhost:11434/v1";
  assert.equal(modelos.usaTransporteLargo(true), false, "default 28 s stays on fetch");
  process.env.LLM_TIMEOUT_MS = "290000";
  assert.equal(modelos.usaTransporteLargo(false), false, "below the fetch limit stays on fetch");
  process.env.LLM_TIMEOUT_MS = "600000";
  assert.equal(modelos.usaTransporteLargo(true), true);
  assert.equal(modelos.usaTransporteLargo(false), false, "no cap applied when no timeout is in effect");
  assert.equal(modelos.timeoutLlamadaMs(), 600000);
  assert.equal(modelos.timeoutAgenteMs(), 602000);
  process.env.LLM_AGENT_TIMEOUT_MS = "900000";
  assert.equal(modelos.timeoutAgenteMs(), 900000);
  delete process.env.LLM_BASE_URL; // OpenRouter mode never switches, whatever the timeout
  assert.equal(modelos.usaTransporteLargo(false), false);
});

test("pedirChat above the fetch limit waits for slow headers and returns a normal Response", async () => {
  const s = await servidor(1500);
  try {
    process.env.LLM_BASE_URL = s.base; process.env.LLM_MODEL = "m"; process.env.LLM_API_KEY = "k"; process.env.LLM_TIMEOUT_MS = "600000";
    const r = await modelos.pedirChat("chat", { messages: [{ role: "user", content: "x" }] });
    assert.ok(r instanceof Response);
    assert.equal(r.ok, true);
    assert.equal((await r.json()).choices[0].message.content, "hola");
    assert.equal(s.visto.ruta, "/v1/chat/completions");
    assert.equal(s.visto.auth, "Bearer k");
    assert.equal(JSON.parse(s.visto.cuerpo).model, "m");
  } finally { await s.cerrar(); }
});

test("the long transport raises TimeoutError when the signal expires before headers", async () => {
  const s = await servidor(3000);
  try {
    const t0 = Date.now();
    await assert.rejects(
      modelos.fetchLargo(s.base + "/chat/completions", { method: "POST", headers: {}, body: "{}", signal: AbortSignal.timeout(400) }),
      e => e.name === "TimeoutError");
    assert.ok(Date.now() - t0 < 2000);
  } finally { await s.cerrar(); }
});

test("the long transport honors the timeout while the body is streaming and surfaces HTTP errors", async () => {
  const lento = http.createServer((req, res) => {
    req.resume();
    if (req.url.endsWith("/err")) { res.writeHead(503); res.end("no"); return; }
    res.writeHead(200); res.write("{"); // headers out, body never ends
  });
  await new Promise(ok => lento.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${lento.address().port}`;
  try {
    await assert.rejects(modelos.fetchLargo(base + "/x", { method: "POST", body: "{}", signal: AbortSignal.timeout(400) }), e => e.name === "TimeoutError");
    const e503 = await modelos.fetchLargo(base + "/err", { method: "POST", body: "{}" });
    assert.equal(e503.ok, false);
    assert.equal(e503.status, 503);
    assert.equal(await e503.text(), "no");
  } finally { lento.closeAllConnections(); await new Promise(f => lento.close(f)); }
});

test("pedirChat with a short timeout keeps using global fetch (existing stubs and default path)", async () => {
  const real = global.fetch; let llamado = 0;
  global.fetch = async () => { llamado++; return new Response("{}", { status: 200 }); };
  try {
    process.env.LLM_BASE_URL = "http://llm.local/v1"; process.env.LLM_TIMEOUT_MS = "5000";
    await modelos.pedirChat("chat", {});
    delete process.env.LLM_BASE_URL; process.env.OPENROUTER_API_KEY = "x"; process.env.LLM_TIMEOUT_MS = "600000";
    await modelos.pedirChat("chat", {});
    assert.equal(llamado, 2);
  } finally { global.fetch = real; }
});

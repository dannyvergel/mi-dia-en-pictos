// Issue #42: con base de datos, el Cuaderno no puede caer nunca al PIN de demo por un error de red o de parseo de /api/auth.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");

// Carga cuenta.js en un contexto aislado con un fetch simulado. Cada elemento de `respuestas` es una respuesta o un Error.
function cargar(respuestas) {
  const pedidos = [];
  const fetch = async (url, op) => {
    pedidos.push({ url, op });
    const r = respuestas[Math.min(pedidos.length - 1, respuestas.length - 1)];
    if (r instanceof Error) throw r;
    return {
      ok: r.status >= 200 && r.status < 300, status: r.status,
      json: async () => { if (typeof r.cuerpo !== "string") return r.cuerpo; return JSON.parse(r.cuerpo); },
    };
  };
  const ctx = { window: {}, fetch, setTimeout, Promise, URL, document: {} };
  vm.createContext(ctx);
  vm.runInContext(leer("cuenta.js"), ctx);
  return { Puente: ctx.window.Puente, pedidos };
}
const SESION = { modo: "db", sesion: { tipo: "docente", nombre: "Revisión", revisor: true } };
const CHALLENGE = "<!doctype html><html><head><title>Vercel Security Checkpoint</title></head><body></body></html>";

test("estadoSeguro: con 200 y modo db devuelve la sesión tal cual, en un solo pedido con cookie", async () => {
  const { Puente, pedidos } = cargar([{ status: 200, cuerpo: SESION }]);
  const e = await Puente.estadoSeguro({ espera: 0 });
  assert.equal(e.modo, "db");
  assert.equal(e.sesion.revisor, true);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, "api/auth");
  assert.equal(pedidos[0].op.credentials, "same-origin");
  assert.equal(pedidos[0].op.cache, "no-store");
});

test("estadoSeguro: el modo demo solo sale de un 200 de la API que lo dice", async () => {
  const { Puente } = cargar([{ status: 200, cuerpo: { modo: "demo", sesion: null } }]);
  assert.equal((await Puente.estadoSeguro({ espera: 0 })).modo, "demo");
});

for (const [nombre, respuestas, status] of [
  ["sin red (fetch rechaza)", [new TypeError("Failed to fetch")], 0],
  ["challenge del firewall (403 en HTML)", [{ status: 403, cuerpo: CHALLENGE }], 403],
  ["límite del firewall (429 en HTML)", [{ status: 429, cuerpo: CHALLENGE }], 429],
  ["error del servidor (500 en JSON, sin modo)", [{ status: 500, cuerpo: { error: "Algo falló, probá de nuevo en un rato." } }], 500],
  ["200 que no es JSON", [{ status: 200, cuerpo: CHALLENGE }], 200],
  ["200 en JSON sin modo", [{ status: 200, cuerpo: { ok: true } }], 200],
]) {
  test(`estadoSeguro: ${nombre} es un error, nunca modo demo`, async () => {
    const { Puente, pedidos } = cargar(respuestas);
    const e = await Puente.estadoSeguro({ espera: 0 });
    assert.deepEqual({ ...e }, { modo: "error", status });
    assert.equal(pedidos.length, 2, "reintenta una vez antes de rendirse");
  });
}

test("estadoSeguro: si el primer pedido falla y el segundo anda, entra con la sesión", async () => {
  const { Puente } = cargar([new TypeError("Failed to fetch"), { status: 200, cuerpo: SESION }]);
  assert.equal((await Puente.estadoSeguro({ espera: 0 })).modo, "db");
});

test("cuaderno.html: un error de /api/auth muestra #authGate (reintentar o ingresar), no el PIN", () => {
  const h = leer("cuaderno.html");
  assert.ok(!h.includes('.catch(() => ({ modo: "demo" }))'), "ya no se convierte un error en modo demo");
  assert.ok(h.includes("await Puente.estadoSeguro()"));
  // El orden importa: db → cuenta; cualquier cosa que no sea demo → mensaje de error; recién después el PIN.
  const i = h.indexOf("await Puente.estadoSeguro()");
  const db = h.indexOf('if (e.modo === "db") return entrarConCuenta(e);', i);
  const err = h.indexOf('if (e.modo !== "demo") return sinSesionVerificada();', i);
  const pin = h.indexOf('getElementById("pinGate")', i);
  assert.ok(i > 0 && db > i && err > db && pin > err, "el PIN solo aparece con modo demo explícito");
  assert.match(h, /<div id="authGate" class="gate" hidden>/);
  assert.match(h, /id="authReintentar"/);
  assert.match(h, /href="login\.html\?volver=cuaderno">Ingresar de nuevo</);
  assert.match(h, /authReintentar"\)\.onclick = \(\) => location\.reload\(\)/);
  // cuenta.js se carga antes del script del cuaderno.
  assert.ok(h.indexOf('<script src="cuenta.js"></script>') < i);
});

// Chequeo de salud para el monitoreo (GET /api/config?accion=salud, lo llama .github/workflows/salud.yml).
// Hace un SELECT 1 a la base con un tiempo máximo corto y responde { ok, db, version }:
//   db: "ok" | "error" | "lenta" (pasó el tiempo máximo) | "sin_base" (no hay DATABASE_URL: modo demo).
//   version: los primeros 7 caracteres del commit desplegado (APP_COMMIT o VERCEL_GIT_COMMIT_SHA) o "local".
// Sin datos personales y sin secretos: nunca devuelve el mensaje de error de la base (puede traer el host o el usuario).
// En producción, sin base es 503: Puente con cuentas no funciona sin ella. Fuera de producción, el modo demo es válido.
// El resultado se guarda unos segundos por instancia, así un pedido repetido no despierta la base cada vez.
const { dbActiva, ping } = require("./db");
const { appEnv, appCommit } = require("./entorno");

const TIEMPO_MAXIMO_MS = 3000;
const RECORDAR_MS = 30 * 1000;
let ultimo = null; // { hasta, estado: { status, cuerpo } }

function version() {
  const sha = appCommit();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : "local";
}

function conTiempoMaximo(promesa, ms) {
  let timer;
  const vencido = new Promise((_, rechazar) => {
    timer = setTimeout(() => rechazar(Object.assign(new Error("tiempo máximo"), { vencido: true })), ms);
  });
  return Promise.race([promesa, vencido]).finally(() => clearTimeout(timer));
}

async function chequear({ tiempoMaximoMs = TIEMPO_MAXIMO_MS, ahora = Date.now() } = {}) {
  if (ultimo && ultimo.hasta > ahora) return ultimo.estado;
  let db;
  if (!dbActiva()) db = "sin_base";
  else {
    try { db = (await conTiempoMaximo(ping(), tiempoMaximoMs)) ? "ok" : "error"; }
    catch (e) {
      db = e && e.vencido ? "lenta" : "error";
      // Solo el tipo de error, nunca el mensaje (puede nombrar el host, el rol o la base).
      console.error("[puente] salud: base", db, e && (e.code || e.name) || "");
    }
  }
  const produccion = appEnv() === "production";
  const ok = db === "ok" || (db === "sin_base" && !produccion);
  const estado = { status: ok ? 200 : 503, cuerpo: { ok, db, version: version() } };
  // Un fallo no se recuerda: el próximo pedido vuelve a probar.
  ultimo = ok ? { hasta: ahora + RECORDAR_MS, estado } : null;
  return estado;
}

// Solo para tests.
function olvidar() { ultimo = null; }

module.exports = { chequear, olvidar, version, TIEMPO_MAXIMO_MS };

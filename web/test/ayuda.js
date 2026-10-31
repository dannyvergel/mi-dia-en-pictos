// Ayudas para probar las funciones de Vercel sin servidor: req/res falsos, base PGlite y Blob en memoria.
const { PGlite } = require("@electric-sql/pglite");
const db = require("../api/_lib/db");
const almacen = require("../api/_lib/almacen");

async function baseNueva() {
  const pg = new PGlite();
  db.usarBaseDePrueba(pg);
  pg.blobs = almacen.usarAlmacenDePrueba(true);
  return pg;
}

// Cliente con "navegador": guarda la cookie de sesión entre pedidos.
function cliente(ip = "10.0.0." + Math.floor(Math.random() * 250)) {
  let cookie = "";
  async function llamar(handler, { method = "GET", body, query = {}, headers = {} } = {}) {
    const req = {
      method, query, body, url: "/api?" + new URLSearchParams(query),
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...headers }
    };
    const res = {
      statusCode: 200, headers: {}, payload: undefined,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(o) { this.payload = o; return this; },
      end() { return this; }
    };
    await handler(req, res);
    const sc = res.headers["set-cookie"];
    if (sc) { const v = sc.split(";")[0]; cookie = v.endsWith("=") ? "" : v; }
    return { status: res.statusCode, body: res.payload, headers: res.headers };
  }
  return { llamar, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

module.exports = { baseNueva, cliente };

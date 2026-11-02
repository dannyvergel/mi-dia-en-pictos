// Ayudas para probar las funciones de Vercel sin servidor: req/res falsos, base PGlite y Blob en memoria.
const { PGlite } = require("@electric-sql/pglite");
const db = require("../api/_lib/db");
const almacen = require("../api/_lib/almacen");

// Piloto cerrado: los tests de antes prueban el flujo abierto y sin tope. test/piloto-invitaciones.test.js los fija a mano.
async function baseNueva() {
  if (!("PILOTO_SOLO_INVITACION" in process.env)) process.env.PILOTO_SOLO_INVITACION = "0";
  if (!("PILOTO_MAX_USUARIOS" in process.env)) process.env.PILOTO_MAX_USUARIOS = "0";
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

// Entra con código por email (modo desarrollo: el código vuelve en codigo_dev). Limpia los límites antes.
async function entrarConCodigo(pg, email, tipo = "docente", c = cliente()) {
  const auth = require("../api/auth");
  await pg.query("DELETE FROM limites");
  const p = await c.llamar(auth, { method: "POST", body: { accion: "pedir_codigo", tipo, email } });
  if (!p.body?.codigo_dev) throw new Error(`No llegó código para ${email} (${tipo}): ${JSON.stringify(p.body)}`);
  const v = await c.llamar(auth, { method: "POST", body: { accion: "verificar_codigo", tipo, email, codigo: p.body.codigo_dev } });
  if (v.status !== 200) throw new Error(`No pudo entrar ${email}: ${JSON.stringify(v.body)}`);
  return c;
}

// La primera cuenta (setup) ya no tiene escuela: es la de la plataforma. Para los tests que necesitan una escuela con su
// directora (admin), se crean directo en la base, como quedarían después de usar el link de directivo.
// { escuela | cue, nombre, email } → { escuela_id, docente_id }. Con cue, la escuela sale del padrón de prueba.
async function altaEscuela({ escuela = "Escuela 2001", cue = "", nombre = "Ana", email }) {
  const db = require("../api/_lib/db");
  let e;
  if (cue) e = (await require("../api/_lib/padron").escuelaPorCue(cue))?.escuela;
  else e = await db.uno("INSERT INTO escuelas (nombre) VALUES ($1) RETURNING id", [escuela]);
  if (!e) throw new Error("No se pudo crear la escuela " + (cue || escuela));
  const d = await db.uno("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, $2, $3, true) RETURNING id", [e.id, email, nombre]);
  return { escuela_id: Number(e.id), docente_id: Number(d.id) };
}

module.exports = { baseNueva, cliente, entrarConCodigo, altaEscuela };

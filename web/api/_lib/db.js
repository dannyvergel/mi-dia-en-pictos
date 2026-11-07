// Capa de base de datos: Postgres (Neon, vía Vercel Marketplace).
// Sin DATABASE_URL / POSTGRES_URL la app queda en "modo demo" (PIN + links con token).
// En los tests se inyecta una base PGlite con usarBaseDePrueba().
//
// Driver (misma interfaz para los dos):
//   DB_DRIVER=pg    -> Postgres "normal" con `pg` (autoalojado, docker compose).
//   DB_DRIVER=neon  -> driver HTTP de Neon (Vercel).
//   sin DB_DRIVER   -> neon si la URL apunta a un host de Neon (*.neon.tech, *.neon.build,
//                      *.vercel-storage.com); cualquier otro host usa pg. Sin URL: neon (comportamiento histórico).
const { SCHEMA } = require("./schema");

let cliente = null;      // { query(text, params) -> rows[] }
let inyectado = false;
let esquemaListo = null; // promesa memorizada por instancia

const urlBase = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const dbActiva = () => inyectado || !!urlBase();

const HOST_NEON = /(^|\.)(neon\.tech|neon\.build|vercel-storage\.com)$/i;

function elegirDriver(env = process.env) {
  const forzado = String(env.DB_DRIVER || "").trim().toLowerCase();
  if (forzado === "pg" || forzado === "neon") return forzado;
  const url = env.DATABASE_URL || env.POSTGRES_URL || "";
  if (!url) return "neon";
  try { return HOST_NEON.test(new URL(url).hostname) ? "neon" : "pg"; }
  catch { return "neon"; }
}

// Cliente sobre un pool de `pg`. La transacción usa UN cliente del pool: BEGIN, sentencias en orden, COMMIT; ROLLBACK si falla.
function crearClientePg(pool) {
  return {
    query: async (text, params = []) => (await pool.query(text, params)).rows,
    transaccion: async stmts => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = [];
        for (const [t, p] of stmts) out.push((await c.query(t, p || [])).rows);
        await c.query("COMMIT");
        return out;
      } catch (e) {
        try { await c.query("ROLLBACK"); } catch { /* the original error matters more */ }
        throw e;
      } finally { c.release(); }
    }
  };
}

function crearCliente() {
  if (elegirDriver() === "pg") {
    const { Pool } = require("pg");
    return crearClientePg(new Pool({ connectionString: urlBase(), max: Number(process.env.DB_POOL_MAX) || 10 }));
  }
  const { neon } = require("@neondatabase/serverless");
  const sql = neon(urlBase());
  const filas = r => Array.isArray(r) ? r : (r.rows || []);
  return {
    query: async (text, params = []) => filas(await sql.query(text, params)),
    // Transacción no interactiva por HTTP: todas las sentencias se mandan juntas; si una falla, no queda ninguna.
    transaccion: async stmts => (await sql.transaction(stmts.map(([t, p]) => sql.query(t, p || [])))).map(filas)
  };
}

// Crea las tablas si faltan (idempotente). Se corre una vez por instancia.
async function asegurarEsquema(c) {
  for (const stmt of SCHEMA) await c.query(stmt);
}

async function db() {
  if (!dbActiva()) throw new Error("Base de datos no configurada");
  if (!cliente) cliente = crearCliente();
  if (!esquemaListo) esquemaListo = asegurarEsquema(cliente).catch(e => { esquemaListo = null; throw e; });
  await esquemaListo;
  return cliente;
}

// Para el chequeo de salud (_lib/salud.js): un SELECT 1 sin crear tablas ni tocar datos.
async function ping() {
  if (!dbActiva()) throw new Error("Base de datos no configurada");
  if (!cliente) cliente = crearCliente();
  const filas = await cliente.query("SELECT 1 AS ok");
  return Number(filas[0]?.ok) === 1;
}

async function q(text, params) { return (await db()).query(text, params); }
async function uno(text, params) { return (await q(text, params))[0] || null; }
// Varias sentencias [[sql, params], …] en una sola transacción (todo o nada). Devuelve las filas de cada una.
// Ojo: no es interactiva, así que una sentencia no puede usar el resultado de otra salvo por SQL (subconsultas / claves naturales).
async function transaccion(stmts) { return (await db()).transaccion(stmts); }

// Solo para tests: base PGlite (u otra con .query que devuelva {rows}).
function usarBaseDePrueba(pg) {
  inyectado = !!pg; esquemaListo = null;
  cliente = pg ? {
    query: async (t, p = []) => (await pg.query(t, p)).rows,
    transaccion: stmts => pg.transaction(async tx => { const out = []; for (const [t, p] of stmts) out.push((await tx.query(t, p || [])).rows); return out; })
  } : null;
}

// Solo para tests: inyecta un pool falso con la forma de `pg` (query/connect).
function usarPoolDePrueba(pool) {
  inyectado = !!pool; esquemaListo = null;
  cliente = pool ? crearClientePg(pool) : null;
}

module.exports = { elegirDriver, crearClientePg, usarPoolDePrueba, dbActiva, db, ping, q, uno, transaccion, asegurarEsquema, usarBaseDePrueba };

// Capa de base de datos: Postgres (Neon, vía Vercel Marketplace).
// Sin DATABASE_URL / POSTGRES_URL la app queda en "modo demo" (PIN + links con token).
// En los tests se inyecta una base PGlite con usarBaseDePrueba().
const { SCHEMA } = require("./schema");

let cliente = null;      // { query(text, params) -> rows[] }
let inyectado = false;
let esquemaListo = null; // promesa memorizada por instancia

const urlBase = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const dbActiva = () => inyectado || !!urlBase();

function crearCliente() {
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

module.exports = { dbActiva, db, ping, q, uno, transaccion, asegurarEsquema, usarBaseDePrueba };

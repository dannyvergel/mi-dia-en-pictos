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
  return { query: async (text, params = []) => { const r = await sql.query(text, params); return Array.isArray(r) ? r : (r.rows || []); } };
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

async function q(text, params) { return (await db()).query(text, params); }
async function uno(text, params) { return (await q(text, params))[0] || null; }

// Solo para tests: base PGlite (u otra con .query que devuelva {rows}).
function usarBaseDePrueba(pg) {
  inyectado = !!pg; esquemaListo = null;
  cliente = pg ? { query: async (t, p = []) => (await pg.query(t, p)).rows } : null;
}

module.exports = { dbActiva, db, q, uno, asegurarEsquema, usarBaseDePrueba };

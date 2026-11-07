// Postgres adapter (pg): driver selection, single-client transactions, rollback. No network: a fake pool is injected.
// The integration block at the bottom only runs when TEST_PG_URL points at a real (disposable) Postgres.
const test = require("node:test");
const assert = require("node:assert");
const dbmod = require("../api/_lib/db");

function poolFalso({ falla = null } = {}) {
  const log = [];
  let clientesPedidos = 0, liberados = 0;
  const cliente = {
    query: async (t, p) => {
      log.push([t, p]);
      if (falla && String(t).includes(falla)) throw new Error("boom");
      return { rows: [{ ok: 1, t: String(t).slice(0, 12) }] };
    },
    release: () => { liberados++; }
  };
  return { log, pedidos: () => clientesPedidos, liberados: () => liberados,
    query: async (t, p) => { log.push(["pool", t, p]); return { rows: [{ ok: 1 }] }; },
    connect: async () => { clientesPedidos++; return cliente; } };
}

test("selección de driver: DB_DRIVER manda; sin él, un host Neon usa neon y cualquier otro usa pg", () => {
  const e = dbmod.elegirDriver;
  assert.equal(e({ DB_DRIVER: "pg", DATABASE_URL: "postgres://u:p@ep-x.neon.tech/db" }), "pg");
  assert.equal(e({ DB_DRIVER: "neon", DATABASE_URL: "postgres://u:p@db:5432/x" }), "neon");
  assert.equal(e({ DATABASE_URL: "postgres://u:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require" }), "neon");
  assert.equal(e({ POSTGRES_URL: "postgres://u:p@ep-x.neon.tech/db" }), "neon");
  assert.equal(e({ DATABASE_URL: "postgres://u:p@db:5432/puente" }), "pg");
  assert.equal(e({ DATABASE_URL: "postgresql://u:p@localhost/puente" }), "pg");
  assert.equal(e({ DATABASE_URL: "not a url" }), "neon", "unparsable keeps the historical default");
  assert.equal(e({}), "neon");
});

test("cliente pg: query devuelve las filas y transaccion hace BEGIN, sentencias en orden, COMMIT en un solo cliente", async () => {
  const pool = poolFalso();
  const c = dbmod.crearClientePg(pool);
  assert.deepEqual(await c.query("SELECT 1", []), [{ ok: 1 }]);
  const out = await c.transaccion([["INSERT a", [1]], ["INSERT b"]]);
  assert.equal(out.length, 2);
  const tx = pool.log.filter(l => l[0] !== "pool").map(l => l[0]);
  assert.deepEqual(tx, ["BEGIN", "INSERT a", "INSERT b", "COMMIT"]);
  assert.equal(pool.pedidos(), 1);
  assert.equal(pool.liberados(), 1);
});

test("cliente pg: si una sentencia falla hace ROLLBACK, libera el cliente y propaga el error", async () => {
  const pool = poolFalso({ falla: "INSERT b" });
  const c = dbmod.crearClientePg(pool);
  await assert.rejects(c.transaccion([["INSERT a"], ["INSERT b"], ["INSERT c"]]), /boom/);
  const tx = pool.log.filter(l => l[0] !== "pool").map(l => l[0]);
  assert.deepEqual(tx, ["BEGIN", "INSERT a", "INSERT b", "ROLLBACK"]);
  assert.equal(pool.liberados(), 1);
});

test("usarPoolDePrueba: q, uno y transaccion pasan por el pool inyectado y crean el esquema una vez", async () => {
  const pool = poolFalso();
  dbmod.usarPoolDePrueba(pool);
  try {
    assert.equal(dbmod.dbActiva(), true);
    assert.equal((await dbmod.uno("SELECT 1")).ok, 1);
    await dbmod.transaccion([["UPDATE x"]]);
    const creates = pool.log.filter(l => String(l[0]).includes("CREATE TABLE") || String(l[1]).includes("CREATE TABLE"));
    assert.ok(creates.length > 0);
    await dbmod.q("SELECT 2");
    const despues = pool.log.filter(l => String(l[0]).includes("CREATE TABLE") || String(l[1]).includes("CREATE TABLE"));
    assert.equal(despues.length, creates.length, "lazy schema runs once per instance");
  } finally { dbmod.usarBaseDePrueba(null); }
});

test("integración con Postgres real (solo con TEST_PG_URL)", { skip: !process.env.TEST_PG_URL }, async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.TEST_PG_URL });
  try {
    const c = dbmod.crearClientePg(pool);
    await dbmod.asegurarEsquema(c);
    await c.query("CREATE TABLE IF NOT EXISTS _test_pg (k text PRIMARY KEY)");
    await c.query("DELETE FROM _test_pg");
    await assert.rejects(c.transaccion([["INSERT INTO _test_pg VALUES ($1)", ["a"]], ["INSERT INTO _test_pg VALUES ($1)", ["a"]]]));
    assert.equal((await c.query("SELECT count(*)::int AS n FROM _test_pg"))[0].n, 0, "rollback leaves nothing");
    await c.transaccion([["INSERT INTO _test_pg VALUES ($1)", ["a"]], ["INSERT INTO _test_pg VALUES ($1)", ["b"]]]);
    assert.equal((await c.query("SELECT count(*)::int AS n FROM _test_pg"))[0].n, 2);
    await c.query("DROP TABLE _test_pg");
  } finally { await pool.end(); }
});

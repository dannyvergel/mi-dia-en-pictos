// Crea o actualiza las tablas en la base real (idempotente: se puede correr las veces que quieras)
// y carga el Padrón Oficial de escuelas de Santa Fe (data/escuelas-santa-fe.json) en padron_escuelas.
//   cd web && DATABASE_URL="postgres://..." npm run migrar
// No hace falta para funcionar: la app aplica el mismo esquema sola en el primer pedido y carga el padrón en la primera búsqueda.
const { db, dbActiva } = require("../api/_lib/db");
const { asegurarPadron } = require("../api/_lib/padron");
(async () => {
  if (!dbActiva()) { console.error("Definí DATABASE_URL (o POSTGRES_URL) primero."); process.exit(1); }
  await db();
  console.log("Esquema de Puente listo ✓");
  const p = await asegurarPadron();
  console.log(p.cargadas ? `Padrón de escuelas cargado: ${p.cargadas} (${p.version})${p.trgm ? ", con índice pg_trgm" : ""} ✓` : `Padrón de escuelas al día (${p.version}) ✓`);
})().catch(e => { console.error(e); process.exit(1); });

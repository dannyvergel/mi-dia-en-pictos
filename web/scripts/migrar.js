// Crea o actualiza las tablas en la base real (idempotente: se puede correr las veces que quieras).
//   cd web && DATABASE_URL="postgres://..." npm run migrar
// No hace falta para funcionar: la app aplica el mismo esquema sola en el primer pedido.
const { db, dbActiva } = require("../api/_lib/db");
(async () => {
  if (!dbActiva()) { console.error("Definí DATABASE_URL (o POSTGRES_URL) primero."); process.exit(1); }
  await db();
  console.log("Esquema de Puente listo ✓");
})().catch(e => { console.error(e); process.exit(1); });

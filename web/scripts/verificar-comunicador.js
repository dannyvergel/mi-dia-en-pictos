// Verifica el tablero del Comunicador contra la API pública de ARASAAC (api.arasaac.org).
// Para cada picto de comunicador-tablero.js pide /api/pictograms/es/<id> y controla que ese id tenga la palabra clave «k».
// Uso (necesita red): node scripts/verificar-comunicador.js   → sale con código 1 si algún id no coincide.
// No corre en npm test porque los tests no usan la red.
const { CATEGORIAS } = require("../comunicador-tablero.js");

const normal = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

async function verificar(p) {
  const r = await fetch(`https://api.arasaac.org/api/pictograms/es/${p.id}`);
  if (!r.ok) return { ...p, ok: false, motivo: `HTTP ${r.status}` };
  const j = await r.json();
  const claves = (j.keywords || []).map(k => k.keyword);
  const ok = claves.some(k => normal(k) === normal(p.k));
  return { ...p, ok, claves, motivo: ok ? "" : `no tiene la clave «${p.k}» (tiene: ${claves.join(", ")})` };
}

(async () => {
  const todos = CATEGORIAS.flatMap(c => c.pictos.map(p => ({ ...p, cat: c.id })));
  const res = [];
  for (let i = 0; i < todos.length; i += 8) res.push(...await Promise.all(todos.slice(i, i + 8).map(verificar)));
  const malos = res.filter(r => !r.ok);
  for (const r of res) console.log(`${r.ok ? "ok " : "MAL"} ${r.cat.padEnd(13)} ${String(r.id).padStart(6)}  ${r.t}${r.ok ? "" : "  → " + r.motivo}`);
  console.log(`\n${res.length - malos.length}/${res.length} pictos verificados contra api.arasaac.org`);
  process.exit(malos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

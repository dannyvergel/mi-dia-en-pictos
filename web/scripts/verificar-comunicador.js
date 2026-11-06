// Verifica el tablero del Comunicador contra la API pública de ARASAAC (api.arasaac.org).
// Para cada picto de comunicador-tablero.js pide /api/pictograms/es/<id> y controla que ese id tenga la palabra clave «k».
// Con --en pide /api/pictograms/en/<id> y controla la clave en inglés «ken» (mismo id de picto).
// Uso (necesita red): node scripts/verificar-comunicador.js [--en]   → sale con código 1 si algún id no coincide.
// No corre en npm test porque los tests no usan la red.
const { CATEGORIAS, CASA } = require("../comunicador-tablero.js");

const EN = process.argv.includes("--en");
const IDIOMA = EN ? "en" : "es", CAMPO = EN ? "ken" : "k", TEXTO = EN ? "en" : "t";

const normal = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

async function verificar(p) {
  const r = await fetch(`https://api.arasaac.org/api/pictograms/${IDIOMA}/${p.id}`);
  if (!r.ok) return { ...p, ok: false, motivo: `HTTP ${r.status}` };
  const j = await r.json();
  const claves = (j.keywords || []).map(k => k.keyword);
  const ok = !!p[CAMPO] && claves.some(k => normal(k) === normal(p[CAMPO]));
  return { ...p, ok, claves, motivo: ok ? "" : `no tiene la clave «${p[CAMPO]}» (tiene: ${claves.join(", ")})` };
}

(async () => {
  const todos = CATEGORIAS.flatMap(c => c.pictos.map(p => ({ ...p, cat: c.id }))).concat(CASA.ordenes.map(o => ({ ...o, cat: "casa" })));
  const res = [];
  for (let i = 0; i < todos.length; i += 8) res.push(...await Promise.all(todos.slice(i, i + 8).map(verificar)));
  const malos = res.filter(r => !r.ok);
  for (const r of res) console.log(`${r.ok ? "ok " : "MAL"} ${r.cat.padEnd(13)} ${String(r.id).padStart(6)}  ${r[TEXTO]}${r.ok ? "" : "  → " + r.motivo}`);
  console.log(`\n${res.length - malos.length}/${res.length} pictos verificados contra api.arasaac.org (${IDIOMA})`);
  process.exit(malos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

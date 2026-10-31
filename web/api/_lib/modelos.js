// Solo modelos baratos o gratuitos. Cualquier otro valor en OPENROUTER_MODEL se ignora.
// Precios OpenRouter por millón de tokens (oct 2026): deepseek-v4-flash US$0,09 entrada / US$0,18 salida.
const PERMITIDOS = [
  "deepseek/deepseek-v4-flash",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free"
];
const PRINCIPAL = PERMITIDOS.includes(process.env.OPENROUTER_MODEL) ? process.env.OPENROUTER_MODEL : PERMITIDOS[0];
// Si el principal falla, OpenRouter prueba estos (nunca uno caro).
const RESPALDO = PERMITIDOS.filter(m => m !== PRINCIPAL).slice(0, 2);
// Tope de tokens de salida por llamada.
const TOPE = { agente: 2500, dia: 1200, chat: 400 };

function cuerpo(uso, extra) {
  return { model: PRINCIPAL, models: [PRINCIPAL, ...RESPALDO], max_tokens: TOPE[uso], ...extra };
}
module.exports = { PRINCIPAL, PERMITIDOS, cuerpo };

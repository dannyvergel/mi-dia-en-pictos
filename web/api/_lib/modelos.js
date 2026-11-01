// Solo modelos baratos y que tengan proveedores sin retención (ZDR). Cualquier otro valor en OPENROUTER_MODEL se ignora.
// Precios OpenRouter por millón de tokens (nov 2026, endpoints ZDR más baratos): deepseek-v4-flash desde US$0,05–0,09 entrada /
// US$0,18–0,45 salida; gemma-4-31b-it ~US$0,10/0,16–0,34; nemotron-3.5-lightning ~US$0,03–0,07/0,12–0,20.
//
// Privacidad (datos de menores, Ley 25.326): TODAS las llamadas a OpenRouter llevan
//   provider: { data_collection: "deny", zdr: true }
// · data_collection "deny": solo proveedores que no guardan ni entrenan con los datos.
// · zdr true: solo endpoints con Zero Data Retention (no retienen prompts).
// Si ningún proveedor cumple, OpenRouter responde error y cada función cae a su modo sin IA (plan fijo / negativa amable).
// Verificado el 1/11/2026 contra https://openrouter.ai/api/v1/endpoints/zdr (lista pública de endpoints ZDR):
//   deepseek/deepseek-v4-flash, google/gemma-4-31b-it y nvidia/nemotron-3.5-lightning tienen varios endpoints ZDR.
//   Las variantes gratuitas (":free", Google AI Studio y Nvidia) y el router "openrouter/free" NO tienen endpoints ZDR
//   (los proveedores gratuitos suelen registrar prompts), por eso se sacaron de la lista.
const PERMITIDOS = [
  "deepseek/deepseek-v4-flash",
  "google/gemma-4-31b-it",
  "nvidia/nemotron-3.5-lightning"
];
// Nunca se usan: sin endpoints ZDR (ver arriba). Se dejan anotados para que nadie los vuelva a sumar sin revisar.
const SIN_ZDR = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free", "openrouter/free"];

const PRINCIPAL = PERMITIDOS.includes(process.env.OPENROUTER_MODEL) ? process.env.OPENROUTER_MODEL : PERMITIDOS[0];
// Si el principal falla, OpenRouter prueba estos (nunca uno caro ni uno sin ZDR).
const RESPALDO = PERMITIDOS.filter(m => m !== PRINCIPAL).slice(0, 2);
// Tope de tokens de salida por llamada.
const TOPE = { agente: 2500, dia: 1200, chat: 400 };
// Preferencias de proveedor: sin recolección de datos y solo Zero Data Retention.
const PROVEEDOR = Object.freeze({ data_collection: "deny", zdr: true });

function cuerpo(uso, extra) {
  // provider va al final para que ningún "extra" lo pise.
  return { model: PRINCIPAL, models: [PRINCIPAL, ...RESPALDO], max_tokens: TOPE[uso], ...extra, provider: { ...PROVEEDOR } };
}
// Cabeceras para OpenRouter. El Referer sale de PUENTE_URL (dominio propio) o del de Vercel.
function cabeceras() {
  const url = (process.env.PUENTE_URL || "https://puente-pictos.vercel.app").replace(/\/+$/, "");
  return { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json", "HTTP-Referer": url, "X-Title": "Puente" };
}
module.exports = { PRINCIPAL, PERMITIDOS, SIN_ZDR, PROVEEDOR, cuerpo, cabeceras };

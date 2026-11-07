// Privacy filter for LLM calls. Pure functions, no I/O.
//
//  · protegerEntrada / protegerMensajes: before a call, replace the student's name (and any other person's name
//    the caller already has at hand) with a neutral alias, and redact URLs, emails, phone numbers and ID-like
//    digit sequences with neutral tags. They return a restore map.
//  · restaurarSalida: after the model answers, put the real names back inside every string of the output.
//
// Honest limit: this is rule-based, there is no NER. A name nobody listed, a street address or a bare domain
// in free text is NOT detected (see the "KNOWN LIMIT" tests). It reduces exposure, it does not eliminate it.

const MARCAS = /[̀-ͯ]/g;
const PALABRA = /[\p{L}\p{N}\p{M}_]/u;
// Name particles that are not aliased on their own ("María de los Ángeles").
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "da", "di", "do", "van", "von", "san", "santa"]);
const MIN_PARTE = 3;

const RE_URL = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]*[^\s<>"')\].,;:!?]/giu;
const RE_EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Alternative 1 keeps dates as they are (so "2026-10-28 09:30" is not read as a phone); alternative 2 is a digit run
// with spaces, dots, hyphens or parentheses between digits.
const RE_NUMERO = /(?<![\p{L}\p{N}_])(?:(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})(?!\d)|\+?\(?\d[\d ().-]{5,}\d(?![\p{L}\p{N}_]))/gu;
const ES_DOCUMENTO = /^(\d{7,8}|\d{1,2}\.\d{3}\.\d{3}|\d{2}-?\d{8}-?\d)$/;

function redactar(texto) {
  return texto
    .replace(RE_URL, "[enlace]")
    .replace(RE_EMAIL, "[email]")
    .replace(RE_NUMERO, (m, fecha) => {
      if (fecha) return m;
      const digitos = (m.match(/\d/g) || []).length;
      if (digitos < 7) return m;
      return ES_DOCUMENTO.test(m.trim()) ? "[documento]" : "[teléfono]";
    });
}

// ---- name matching (case- and accent-insensitive, whole words) ----

// Normalized text plus, for each normalized UTF-16 unit, its [start, end) range in the original text.
function indexar(texto) {
  let norm = "";
  const ini = [], fin = [];
  let i = 0;
  for (const ch of texto) {
    const largo = ch.length;
    const n = /\s/u.test(ch) ? " " : ch.normalize("NFD").replace(MARCAS, "").toLowerCase();
    if (n === " " && norm.endsWith(" ")) fin[fin.length - 1] = i + largo; // collapse whitespace runs
    else for (let k = 0; k < n.length; k++) { norm += n[k]; ini.push(i); fin.push(i + largo); }
    i += largo;
  }
  return { norm, ini, fin };
}
const normalizar = s => indexar(String(s)).norm.trim();

const esPalabra = c => c !== undefined && PALABRA.test(c);

function rangos(idx, termino, alias) {
  const out = [];
  if (!termino) return out;
  for (let s = idx.norm.indexOf(termino); s >= 0; s = idx.norm.indexOf(termino, s + 1)) {
    const e = s + termino.length;
    if (esPalabra(idx.norm[s - 1]) || esPalabra(idx.norm[e])) continue;
    out.push({ desde: idx.ini[s], hasta: idx.fin[e - 1], largo: termino.length, alias });
  }
  return out;
}

// Terms of one person: the full name and each significant part.
function terminos(variantes) {
  const set = new Set();
  for (const v of variantes) {
    const completo = normalizar(v);
    if (completo) set.add(completo);
    for (const parte of String(v).split(/\s+/)) {
      const p = normalizar(parte.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
      if (p.length >= MIN_PARTE && !PARTICULAS.has(p)) set.add(p);
    }
  }
  return [...set];
}

function reemplazarNombres(texto, personas) {
  if (!personas.length) return texto;
  const idx = indexar(texto);
  const todos = personas.flatMap(p => p.terminos.flatMap(t => rangos(idx, t, p.alias)));
  todos.sort((a, b) => a.desde - b.desde || b.largo - a.largo);
  let salida = "", cursor = 0;
  for (const r of todos) {
    if (r.desde < cursor) continue; // overlaps a longer or earlier match
    salida += texto.slice(cursor, r.desde) + r.alias;
    cursor = r.hasta;
  }
  salida += texto.slice(cursor);
  // "María de los Ángeles" gives "Alumno A de los Alumno A": collapse it into a single alias.
  for (const p of personas) {
    const a = escapar(p.alias);
    salida = salida.replace(new RegExp(`${a}(?:\\s+(?:de|del|la|las|los)){1,3}\\s+${a}(?![\\p{L}\\p{N}_])`, "giu"), p.alias);
  }
  return salida;
}

const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const conAlias = (texto, alias) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapar(alias)}(?![\\p{L}\\p{N}_])`, "iu").test(texto);

// A, B, … Z, AA, AB, …
function letras(n) {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function aliasLibre(prefijo, usados, corpus) {
  for (let n = 0; ; n++) {
    const alias = `${prefijo} ${letras(n)}`;
    if (!usados.has(alias) && !conAlias(corpus, alias)) return alias;
  }
}

const lista = v => (Array.isArray(v) ? v : [v]).filter(x => typeof x === "string" && x.trim()).map(x => x.trim());

// Core: protects several texts with one consistent alias map. `alumno` is a name or a list of variants of the
// student's name; `otros` is a list of other people (each one a name or a list of variants).
function protegerTextos(textos, { alumno, otros } = {}) {
  const base = textos.map(t => (t === null || t === undefined ? "" : String(t)));
  const corpus = base.join("\n");
  const usados = new Set();
  const personas = [];
  const alta = (prefijo, variantes) => {
    if (!variantes.length) return;
    const alias = aliasLibre(prefijo, usados, corpus);
    usados.add(alias);
    personas.push({ alias, real: variantes[0], terminos: terminos(variantes) });
  };
  alta("Alumno", lista(alumno));
  for (const o of Array.isArray(otros) ? otros : []) alta("Persona", lista(o));
  return {
    textos: base.map(t => reemplazarNombres(redactar(t), personas)),
    mapa: personas.map(p => ({ alias: p.alias, real: p.real }))
  };
}

function protegerEntrada(texto, opciones) {
  const r = protegerTextos([texto], opciones);
  return { texto: r.textos[0], mapa: r.mapa };
}

// Chat messages ({role, content, tool_calls?}): content strings and tool-call arguments are protected. Returns copies.
function protegerMensajes(mensajes, opciones) {
  const msgs = Array.isArray(mensajes) ? mensajes : [];
  const campos = []; // [mensaje, clave | tool_call] in order, to put the protected texts back
  const textos = [];
  for (const m of msgs) {
    if (typeof m?.content === "string") { campos.push(["content", m]); textos.push(m.content); }
    for (const tc of Array.isArray(m?.tool_calls) ? m.tool_calls : [])
      if (typeof tc?.function?.arguments === "string") { campos.push(["arguments", tc]); textos.push(tc.function.arguments); }
  }
  const r = protegerTextos(textos, opciones);
  const protegidoPor = new Map();
  campos.forEach(([, obj], i) => protegidoPor.set(obj, r.textos[i]));
  const copia = msgs.map(m => {
    if (!m || typeof m !== "object") return m;
    const c = { ...m };
    if (protegidoPor.has(m)) c.content = protegidoPor.get(m);
    if (Array.isArray(m.tool_calls)) c.tool_calls = m.tool_calls.map(tc =>
      protegidoPor.has(tc) ? { ...tc, function: { ...tc.function, arguments: protegidoPor.get(tc) } } : tc);
    return c;
  });
  return { mensajes: copia, mapa: r.mapa };
}

// ---- restore ----

function restaurarTexto(texto, mapa) {
  const t = texto.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    // JSON text: restore inside its strings so a name with quotes cannot break it.
    try { return JSON.stringify(restaurarSalida(JSON.parse(t), mapa)); } catch { /* not JSON: plain replace below */ }
  }
  let s = texto;
  for (const { alias, real } of mapa) {
    s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapar(alias)}(?![\\p{L}\\p{N}_])`, "giu"), () => real);
  }
  return s;
}

// Puts the real names back in a model output: a string, or any nested array/object (keys are left alone).
function restaurarSalida(valor, mapa) {
  if (!Array.isArray(mapa) || !mapa.length) return valor;
  if (typeof valor === "string") return restaurarTexto(valor, mapa);
  if (Array.isArray(valor)) return valor.map(v => restaurarSalida(v, mapa));
  if (valor && typeof valor === "object") {
    const o = {};
    for (const k of Object.keys(valor)) o[k] = restaurarSalida(valor[k], mapa);
    return o;
  }
  return valor;
}

module.exports = { protegerEntrada, protegerMensajes, protegerTextos, restaurarSalida };

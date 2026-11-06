#!/usr/bin/env node
// Sitio público bilingüe (español / inglés) a partir de UNA sola fuente.
//
//   npm run idiomas           regenera todo
//   npm run idiomas -- --check  solo controla que esté al día (lo corre test/idiomas.test.js)
//
// Fuente: las páginas en español de web/ (el cuerpo) + scripts/idiomas/paginas.js (títulos, descripciones, JSON-LD)
//         + scripts/idiomas/en.js (traducciones al inglés: pares «español → inglés» por página).
// Salida:  1. en cada página en español, el bloque SEO del <head> (title, description, canonical, hreflang, Open Graph,
//             Twitter card, JSON-LD) y el selector Español / English;
//          2. web/en/<página>.html: la misma página en inglés, servida ya traducida (sin depender de JavaScript);
//          3. web/sitemap.xml con los alternates xhtml:link.
// Si una frase en español de en.js ya no está en la página (porque alguien la cambió), o si en la página en inglés
// queda un texto visible igual al español, falla y dice cuál: así la traducción no queda vieja sin que nadie se entere.
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const { SITIO, ACTUALIZADO, IDIOMAS, jsonLd } = require("./idiomas/paginas");
// IDIOMAS_SIN=index.html deja una página afuera (solo para trabajar por partes; el test corre con todas).
const PAGINAS = require("./idiomas/paginas").PAGINAS.filter(p => !(process.env.IDIOMAS_SIN || "").split(",").includes(p.archivo));
const EN = require("./idiomas/en");

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");

// URL pública de una página en un idioma. index.html → "/" y "/en/".
const ruta = (archivo, idioma) => (idioma === "en" ? "/en/" : "/") + (archivo === "index.html" ? "" : archivo);
const url = (archivo, idioma) => SITIO + ruta(archivo, idioma);

// ---------- Bloque SEO del <head> ----------
const INICIO = "<!-- SEO e idiomas: lo genera scripts/idiomas.js (npm run idiomas). No editar a mano: cambiar scripts/idiomas/paginas.js. -->";
const FIN = "<!-- /SEO -->";
function bloqueSeo(p, idioma) {
  const m = p[idioma], og = idioma === "en" ? "og-en.png" : "og.png";
  const ogAlt = IDIOMAS[idioma].ogAlt;
  const l = [INICIO,
    `<title>${esc(m.titulo)}</title>`,
    `<meta name="description" content="${esc(m.descripcion)}">`,
    p.noindex ? `<meta name="robots" content="noindex">` : null,
    `<link rel="canonical" href="${url(p.archivo, idioma)}">`,
    `<link rel="alternate" hreflang="es-AR" href="${url(p.archivo, "es")}">`,
    `<link rel="alternate" hreflang="en" href="${url(p.archivo, "en")}">`,
    `<link rel="alternate" hreflang="x-default" href="${url(p.archivo, "es")}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Puente">`,
    `<meta property="og:locale" content="${IDIOMAS[idioma].ogLocale}">`,
    `<meta property="og:locale:alternate" content="${IDIOMAS[idioma === "en" ? "es" : "en"].ogLocale}">`,
    `<meta property="og:title" content="${esc(m.ogTitulo || m.titulo)}">`,
    `<meta property="og:description" content="${esc(m.ogDescripcion || m.descripcion)}">`,
    `<meta property="og:url" content="${url(p.archivo, idioma)}">`,
    `<meta property="og:image" content="${SITIO}/${og}">`,
    `<meta property="og:image:secure_url" content="${SITIO}/${og}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(ogAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.ogTitulo || m.titulo)}">`,
    `<meta name="twitter:description" content="${esc(m.ogDescripcion || m.descripcion)}">`,
    `<meta name="twitter:image" content="${SITIO}/${og}">`,
    `<meta name="twitter:image:alt" content="${esc(ogAlt)}">`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd(p, idioma, url)).replace(/</g, "\\u003c")}</script>`,
    FIN].filter(Boolean);
  return l.join("\n");
}

// Saca el bloque generado y las etiquetas sueltas que reemplaza (para la primera vez y para que sea idempotente).
function limpiarHead(h) {
  const i = h.indexOf(INICIO), f = h.indexOf(FIN);
  if (i >= 0 && f > i) h = h.slice(0, i) + h.slice(f + FIN.length).replace(/^\n/, "");
  const head = h.slice(0, h.indexOf("</head>"));
  let nuevo = head
    .replace(/^[ \t]*<title>[\s\S]*?<\/title>[ \t]*\n/m, "")
    .replace(/^[ \t]*<meta name="(description|robots)"[^>]*>[ \t]*\n/gm, "")
    .replace(/^[ \t]*<meta (property|name)="(og|twitter):[^"]*"[^>]*>[ \t]*\n/gm, "")
    .replace(/^[ \t]*<link rel="(canonical|alternate)"[^>]*>[ \t]*\n/gm, "")
    .replace(/^[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>[ \t]*\n/gm, "")
    .replace(/^[ \t]*<!-- Idiomas: [^\n]*-->[ \t]*\n/gm, "");
  return nuevo + h.slice(head.length);
}
function ponerHead(h, bloque) {
  h = limpiarHead(h);
  const vp = h.match(/<meta name="viewport"[^>]*>\n/);
  if (!vp) throw new Error("sin <meta name=viewport>");
  const at = vp.index + vp[0].length;
  return h.slice(0, at) + bloque + "\n" + h.slice(at);
}

// ---------- Selector Español / English (HTML estático: anda sin JavaScript y Google lo ve) ----------
const SEL_INI = "<!-- idiomas -->", SEL_FIN = "<!-- /idiomas -->";
function selector(p, idioma) {
  const a = (l, txt, hl) => `<a href="${ruta(p.archivo, l)}" hreflang="${hl}" lang="${hl}" data-idioma="${l}"${l === idioma ? ' aria-current="page"' : ""}>${txt}</a>`;
  return `${SEL_INI}<nav class="idiomas" aria-label="Idioma / Language">${a("es", "Español", "es-AR")}<span aria-hidden="true"> · </span>${a("en", "English", "en")}</nav>${SEL_FIN}`;
}
function ponerSelector(h, p, idioma) {
  const i = h.indexOf(SEL_INI), f = h.indexOf(SEL_FIN);
  if (i >= 0 && f > i) h = h.slice(0, i) + h.slice(f + SEL_FIN.length);
  if (p.selector === false) return h; // el Comunicador tiene su propio selector (botones dentro de la app)
  const ancla = p.selector || /<header[^>]*>/; // por defecto, primer elemento del <header>
  const m = h.match(ancla);
  if (!m) throw new Error(`${p.archivo}: no encuentro dónde poner el selector (${ancla})`);
  return h.slice(0, m.index + m[0].length) + selector(p, idioma) + h.slice(m.index + m[0].length);
}

// ---------- Inglés ----------
const TRADUCIDAS = new Set(require("./idiomas/paginas").PAGINAS.map(p => p.archivo)); // todas, aunque se excluya alguna
const EXISTEN = new Set(fs.readdirSync(RAIZ).filter(f => f.endsWith(".html")));
// En /en/ los links relativos se rompen: a raíz, y a /en/ si esa página también está en inglés.
function rutasAbsolutas(h) {
  const destino = v => {
    const [base, resto = ""] = v.split(/(?=[?#])/);
    if (TRADUCIDAS.has(base)) return ruta(base, "en") + resto;
    return "/" + v;
  };
  // atributos href / src relativos
  h = h.replace(/\b(href|src)="(?!https?:|\/|#|mailto:|data:|tel:|javascript:|\$\{)([^"]+)"/g, (_, a, v) => `${a}="${destino(v)}"`);
  // strings de JavaScript con páginas o la API: "login.html", 'pie.js', fetch("api/…"), register("sw.js")
  h = h.replace(/(["'])(api\/[^"']*)\1/g, (_, q, v) => `${q}/${v}${q}`);
  h = h.replace(/(["'])([a-z][a-z0-9-]*\.html)(?=[?#"'])/g, (m, q, v) => EXISTEN.has(v) ? q + destino(v) : m);
  h = h.replace(/register\("sw\.js"\)/g, 'register("/sw.js")');
  return h;
}

function traducir(p, es) {
  const t = EN[p.archivo];
  if (!t) throw new Error(`falta la traducción de ${p.archivo} en scripts/idiomas/en.js`);
  let h = es.replace(/<html lang="es-AR"/, '<html lang="en"');
  // 1) textos con data-i18n (Comunicador): salen de comunicador-textos.js, la misma fuente que usa la página.
  if (t.textos) {
    const D = t.textos;
    const falta = k => { if (D[k] === undefined) throw new Error(`${p.archivo}: falta la clave ${k}`); return D[k]; };
    h = h.replace(/(<(\w+)\b[^>]*\sdata-i18n="(\w+)"[^>]*>)([^<]*)(<\/\2>)/g, (_, a, tag, k, __, c) => a + esc(falta(k)).replace(/&quot;/g, '"') + c);
    h = h.replace(/(<(\w+)\b[^>]*\sdata-i18n-html="(\w+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (_, a, tag, k, __, c) => a + falta(k) + c);
    h = h.replace(/(<\w+\b[^>]*?\saria-label=")[^"]*("[^>]*\sdata-i18n-aria="(\w+)")/g, (_, a, b, k) => a + esc(falta(k)) + b);
  }
  // 2) pares «español → inglés» (en orden). Cada frase tiene que estar: si no, la traducción quedó vieja.
  for (const [de, a] of t.pares) {
    if (!h.includes(de)) throw new Error(`${p.archivo}: la frase en español ya no está en la página (actualizar scripts/idiomas/en.js):\n  ${de.slice(0, 160)}`);
    h = h.split(de).join(a);
  }
  // 3) bloques generados en inglés (por ejemplo, la lista de preguntas del pizarrón sale de pizarron.js)
  if (t.despues) h = t.despues(h);
  h = rutasAbsolutas(h);
  return h;
}

// Textos visibles (y atributos que se leen) que quedaron iguales al español: casi seguro, sin traducir.
function textosVisibles(h) {
  const cuerpo = h.slice(h.indexOf("<body")).replace(/<script\b[\s\S]*?<\/script>/g, "").replace(/<style\b[\s\S]*?<\/style>/g, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const out = new Set();
  for (const m of cuerpo.matchAll(/>([^<]+)</g)) { const s = m[1].replace(/\s+/g, " ").trim(); if (s) out.add(s); }
  for (const m of cuerpo.matchAll(/\s(?:alt|placeholder|aria-label|title|data-h)="([^"]+)"/g)) out.add(m[1].trim());
  return out;
}
function sinTraducir(p, es, en) {
  const t = EN[p.archivo], deja = new Set([...(EN.IGUALES || []), ...(t.iguales || [])]);
  const ves = textosVisibles(es);
  return [...textosVisibles(en)].filter(s => ves.has(s) && /[a-záéíóúñ]{3,}/i.test(s) && !deja.has(s));
}

// ---------- Sitemap ----------
function sitemap() {
  const l = ['<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Lo genera scripts/idiomas.js (npm run idiomas). Cada página, en español y en inglés, con sus alternates. -->",
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const p of PAGINAS.filter(p => !p.noindex)) for (const idioma of ["es", "en"]) {
    l.push(`  <url><loc>${url(p.archivo, idioma)}</loc><lastmod>${p.actualizado || ACTUALIZADO}</lastmod><priority>${p.prioridad}</priority>`);
    l.push(`    <xhtml:link rel="alternate" hreflang="es-AR" href="${url(p.archivo, "es")}"/>`);
    l.push(`    <xhtml:link rel="alternate" hreflang="en" href="${url(p.archivo, "en")}"/>`);
    l.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${url(p.archivo, "es")}"/></url>`);
  }
  l.push("</urlset>", "");
  return l.join("\n");
}

// ---------- Todo junto ----------
function generar() {
  const archivos = {}; // ruta relativa a web/ → contenido
  const problemas = [];
  for (const p of PAGINAS) {
    let es = leer(p.archivo);
    es = ponerSelector(ponerHead(es, bloqueSeo(p, "es")), p, "es");
    archivos[p.archivo] = es;
    let en = traducir(p, es);
    en = ponerSelector(ponerHead(en, bloqueSeo(p, "en")), p, "en");
    archivos["en/" + p.archivo] = en;
    for (const s of sinTraducir(p, es, en)) problemas.push(`en/${p.archivo}: sin traducir: «${s.slice(0, 120)}»`);
  }
  archivos["sitemap.xml"] = sitemap();
  return { archivos, problemas };
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  let r;
  try { r = generar(); } catch (e) { console.error("✗ " + e.message); process.exit(1); }
  if (r.problemas.length) { console.error(r.problemas.join("\n")); process.exit(1); }
  const viejos = [];
  for (const [f, c] of Object.entries(r.archivos)) {
    const ruta = path.join(RAIZ, f);
    const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8") : null;
    if (actual === c) continue;
    if (check) viejos.push(f);
    else { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, c); console.log("escribí " + f); }
  }
  if (check && viejos.length) { console.error("Desactualizado (correr npm run idiomas): " + viejos.join(", ")); process.exit(1); }
  if (!check) console.log(`listo: ${PAGINAS.length} páginas × 2 idiomas + sitemap.xml`);
}

module.exports = { generar, ruta, url, textosVisibles, INICIO, FIN };

// Sitio público bilingüe: cada página en español (/) y en inglés (/en/), servida ya traducida, con SEO recíproco.
// La fuente es scripts/idiomas.js (+ scripts/idiomas/paginas.js y en.js): este test exige que lo generado esté al día.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const { generar, url } = require("../scripts/idiomas");
const { PAGINAS } = require("../scripts/idiomas/paginas");

test("lo generado está al día (correr npm run idiomas) y no queda texto visible sin traducir", () => {
  const { archivos, problemas } = generar();
  assert.deepEqual(problemas, []);
  for (const [f, c] of Object.entries(archivos)) assert.ok(fs.existsSync(path.join(RAIZ, f)) && leer(f) === c, `${f} desactualizado: npm run idiomas`);
});

test("las páginas públicas tienen versión en español y en inglés", () => {
  const archivos = PAGINAS.map(p => p.archivo).sort();
  assert.deepEqual(archivos, ["comunicador.html", "index.html", "presentacion.html", "privacidad.html", "terminos.html"]);
  for (const a of archivos) assert.ok(fs.existsSync(path.join(RAIZ, "en", a)), "falta en/" + a);
});

const meta = (h, re) => { const m = h.match(re); return m && m[1]; };
for (const p of PAGINAS) for (const idioma of ["es", "en"]) {
  const f = (idioma === "en" ? "en/" : "") + p.archivo;
  test(`${f}: lang, title, description, canonical, hreflang recíprocos, OG/Twitter y JSON-LD`, () => {
    const h = leer(f);
    assert.match(h, new RegExp(`<html lang="${idioma === "en" ? "en" : "es-AR"}"`));
    assert.equal((h.match(/<title>/g) || []).length, 1);
    const desc = meta(h, /<meta name="description" content="([^"]+)">/);
    assert.ok(desc && desc.length >= 70 && desc.length <= 175, `description de ${f}: ${desc && desc.length}`);
    assert.equal(meta(h, /<link rel="canonical" href="([^"]+)">/), url(p.archivo, idioma));
    assert.equal(meta(h, /<link rel="alternate" hreflang="es-AR" href="([^"]+)">/), url(p.archivo, "es"));
    assert.equal(meta(h, /<link rel="alternate" hreflang="en" href="([^"]+)">/), url(p.archivo, "en"));
    assert.equal(meta(h, /<link rel="alternate" hreflang="x-default" href="([^"]+)">/), url(p.archivo, "es"));
    assert.equal(meta(h, /<meta property="og:url" content="([^"]+)">/), url(p.archivo, idioma));
    assert.equal(meta(h, /<meta property="og:image" content="([^"]+)">/), `https://puentepictos.app/${idioma === "en" ? "og-en" : "og"}.png`);
    assert.ok(h.includes('<meta name="twitter:card" content="summary_large_image">'));
    assert.equal(/name="robots" content="noindex"/.test(h), false);
    // JSON-LD que parsea, con la organización y, en portada y Comunicador, la app gratis (price 0)
    const ld = JSON.parse(meta(h, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
    const tipos = ld["@graph"].map(x => x["@type"]);
    assert.ok(tipos.includes("Organization") && tipos.includes("WebSite") && tipos.includes("WebPage"));
    if (p.archivo === "index.html" || p.archivo === "comunicador.html") {
      const apps = ld["@graph"].filter(x => x["@type"] === "WebApplication");
      assert.ok(apps.length >= 1 && apps.every(a => a.offers.price === "0"));
    }
    // un solo h1, selector visible con los dos idiomas
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, "un h1");
    assert.match(h, /data-idioma="es"[^>]*>Español<\/a>/);
    assert.match(h, /data-idioma="en"[^>]*>English<\/a>/);
    // imágenes con alt (vacío solo si es decorativa)
    for (const img of h.match(/<img\b[^>]*>/g) || []) assert.match(img, /\salt="/, `${f}: img sin alt`);
  });
}

test("inglés: sin redirecciones automáticas por idioma, sin datos que no van y sin tono de folleto", () => {
  const todo = PAGINAS.map(p => leer("en/" + p.archivo) + leer(p.archivo)).join("\n") + leer("pie.js") + leer("pizarron.js");
  // Nada de mandar a la gente (ni a Google) a otro idioma solo: como mucho, el aviso sugerido de pie.js.
  assert.equal(/location\.(replace|assign)\(|location\.href\s*=\s*[^;]*\/en\//.test(leer("pie.js")), false);
  assert.equal(/nodolab|\bfyo\b|rosarina|\bDRT\b/i.test(todo), false, "sin empleador, Nodolab ni clientes");
  assert.equal(/\bPIN\b[^<\n]{0,25}\d{4,}/.test(todo), false, "sin el PIN del demo");
  const en = PAGINAS.map(p => leer("en/" + p.archivo)).join("\n") + JSON.stringify(require("../pizarron.js").en.FAQ);
  assert.equal(/\b(empower|seamless|transform(ative|s|ing)?|revolutioni[sz]e|unlock|game[- ]chang|cutting[- ]edge|leverag)/i.test(en), false);
  assert.equal(/\p{Extended_Pictographic}/u.test(en.replace(/<svg[\s\S]*?<\/svg>/g, "")), false, "sin emojis");
  // Crédito ARASAAC en los dos idiomas
  for (const p of PAGINAS) assert.ok(/Sergio Palao/.test(leer(p.archivo) + leer("pie.js")) && /Sergio Palao/.test(leer("en/" + p.archivo) + leer("pie.js")));
  // Legales: aviso de traducción de cortesía (prevalece el español)
  for (const f of ["en/privacidad.html", "en/terminos.html"]) assert.match(leer(f), /Courtesy translation[\s\S]*Spanish version<\/a> prevails/);
});

test("sitemap: XML bien formado, cada URL con sus alternates es-AR / en / x-default; robots y 404", () => {
  const x = leer("sitemap.xml");
  assert.ok(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  // equilibrio de etiquetas (sin dependencias): cada <url> se cierra y no hay & sueltos
  assert.equal((x.match(/<url>/g) || []).length, (x.match(/<\/url>/g) || []).length);
  assert.equal(/&(?!amp;|lt;|gt;|quot;|apos;)/.test(x), false);
  const locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(locs.length, PAGINAS.length * 2);
  for (const p of PAGINAS) for (const i of ["es", "en"]) assert.ok(locs.includes(url(p.archivo, i)), url(p.archivo, i));
  assert.equal((x.match(/hreflang="x-default"/g) || []).length, locs.length);
  assert.ok(locs.includes("https://puentepictos.app/") && locs.includes("https://puentepictos.app/en/"));
  const r = leer("robots.txt");
  assert.ok(r.includes("Sitemap: https://puentepictos.app/sitemap.xml"));
  assert.equal(/Disallow: \/en/.test(r), false);
  const n = leer("404.html");
  assert.ok(n.includes('name="robots" content="noindex"') && n.includes('lang="en"') && n.includes('href="/en/"'));
  const v = JSON.parse(leer("vercel.json"));
  assert.ok(v.redirects.some(x => x.source === "/en" && x.destination === "/en/"));
});

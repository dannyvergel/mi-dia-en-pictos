// Comunicador (comunicador.html): tablero CAA libre, sin cuenta, 100 % en el cliente y disponible sin conexión.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const T = require("../comunicador-tablero.js");
const TX = require("../comunicador-textos.js");

test("la página existe, es pública y está enlazada desde la portada, familia.html y el sitemap", () => {
  assert.ok(fs.existsSync(path.join(RAIZ, "comunicador.html")));
  const h = leer("comunicador.html");
  assert.match(h, /<html lang="es-AR">/);
  assert.ok(h.includes('<link rel="canonical" href="https://puentepictos.app/comunicador.html">'));
  assert.equal(/name="robots" content="noindex"/.test(h), false, "es pública: se puede indexar");
  assert.ok(leer("sitemap.xml").includes("<loc>https://puentepictos.app/comunicador.html</loc>"));
  assert.equal(/Disallow: \/comunicador/.test(leer("robots.txt")), false);
  for (const p of ["index.html", "familia.html"]) assert.match(leer(p), /<a href="comunicador\.html"[^>]*>Comunicador<\/a>/, p);
});

test("crédito a ARASAAC visible en la página (autor, licencia y propiedad)", () => {
  const h = leer("comunicador.html");
  for (const t of ["Autor pictogramas: Sergio Palao", "ARASAAC", "Licencia: CC BY-NC-SA", "Propiedad: Gobierno de Aragón (España)"]) assert.ok(h.includes(t), t);
  assert.match(h, /id="credito"/);
});

test("todo en el cliente: no llama a /api, no usa IA ni analítica, y el pie común no hace pedidos", () => {
  const h = leer("comunicador.html"), datos = leer("comunicador-tablero.js"), textos = leer("comunicador-textos.js");
  for (const [nombre, src] of [["comunicador.html", h], ["comunicador-tablero.js", datos], ["comunicador-textos.js", textos]]) {
    assert.equal(/\bfetch\s*\(/.test(src), false, `${nombre}: no hace fetch`);
    assert.equal(/XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(src), false, `${nombre}: sin otros pedidos`);
    assert.equal(/["'`(]\/?api\//.test(src), false, `${nombre}: no nombra /api`);
    assert.equal(/openrouter|_vercel\/insights|window\.va\b|gtag|analytics/i.test(src), false, `${nombre}: sin IA ni analítica`);
  }
  // pie.js solo pide api/config (donaciones) y api/auth (comentarios): acá van apagados los dos.
  assert.match(h, /<div id="puente-pie" data-donaciones="no"><\/div>/);
  assert.equal(/id="puente-pie"[^>]*data-feedback/.test(h), false);
  assert.ok(h.includes('src="pie.js"'));
  // Lo único que guarda es en este dispositivo, y lo explica.
  assert.deepEqual([...new Set([...h.matchAll(/localStorage\.(\w+)/g)].map(m => m[1]))].sort(), ["getItem", "removeItem", "setItem"]);
  assert.ok(h.includes('const CLAVE = "puente-comunicador"'));
  assert.ok(h.includes("solo en este dispositivo") && h.includes("Borrar ajustes y favoritos de este dispositivo"));
});

test("el service worker (pictos-v23) cachea la página, el tablero, los textos y sus pictos, y sigue sin cachear /api ni /descargar", () => {
  const sw = leer("sw.js");
  assert.ok(sw.includes("const C = 'pictos-v23'"));
  assert.ok(sw.includes("'comunicador.html'") && sw.includes("'comunicador-tablero.js'") && sw.includes("'comunicador-textos.js'"));
  assert.ok(sw.includes("importScripts('comunicador-tablero.js')"));
  assert.ok(sw.includes("self.TABLERO.urls()") && sw.includes("e.data.tipo === 'comunicador'"));
  assert.ok(sw.includes("/^\\/(api|descargar)\\//"), "el SW no cachea /api/ ni /descargar/");
  assert.ok(sw.includes("static.arasaac.org"));
  assert.ok(leer("comunicador.html").includes('postMessage({ tipo: "comunicador" })'));
});

test("vocabulario acotado (60 a 80 pictos) en las categorías pedidas, con ids únicos y palabra clave de ARASAAC", () => {
  const ids = T.CATEGORIAS.flatMap(c => c.pictos.map(p => p.id));
  assert.ok(ids.length >= 60 && ids.length <= 80, `hay ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  assert.deepEqual(T.CATEGORIAS.map(c => c.id), ["nucleo", "sentimientos", "necesidades", "personas", "lugares", "acciones", "juegos"]);
  const palabras = cat => T.CATEGORIAS.find(c => c.id === cat).pictos.map(p => p.t);
  for (const w of ["yo", "quiero", "no quiero", "sí", "no", "más", "terminé", "ayuda"]) assert.ok(palabras("nucleo").includes(w), w);
  for (const w of ["baño", "agua", "comer", "dormir", "me duele"]) assert.ok(palabras("necesidades").includes(w), w);
  for (const c of T.CATEGORIAS) {
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    for (const p of c.pictos) {
      assert.ok(Number.isInteger(p.id) && p.id > 0, p.t);
      assert.ok(p.t && p.k, `${p.id} sin texto o sin clave`);
    }
  }
  assert.equal(T.url(6632), "https://static.arasaac.org/pictograms/6632/6632_300.png");
  assert.equal(T.urls().length, ids.length);
});

test("voz en el navegador (es-AR / en-US si hay, si no otra del idioma activo), frase con hablar, borrar último y borrar todo", () => {
  const h = leer("comunicador.html");
  assert.ok(h.includes("speechSynthesis") && h.includes("SpeechSynthesisUtterance"));
  assert.ok(h.includes('l === "es-ar"') && h.includes('const LANG_VOZ = { es: "es-AR", en: "en-US" }') && h.includes("u.lang = LANG_VOZ[lang]") && h.includes("/^es([-_]|$)/i"));
  assert.ok(h.includes('l === "en-us" ? 0 : l === "en-gb" ? 1 : 2') && h.includes("/^en([-_]|$)/i"), "en inglés: en-US, después en-GB, después cualquier en-*");
  for (const id of ["bHablar", "bUltimo", "bTodo", "frase", "oDecir", "oFrase", "bCompleto", "bSalir", "bFavoritos"]) assert.ok(h.includes(`id="${id}"`), id);
});

test("accesibilidad: botones de 72px o más, aria-labels, sin animaciones y pantalla completa", () => {
  const h = leer("comunicador.html");
  const css = h.slice(h.indexOf("<style>"), h.indexOf("</style>"));
  for (const sel of [".accion", ".cat", ".tecla"]) {
    const regla = css.match(new RegExp("\\n\\s*\\" + sel + " \\{([^}]*)\\}"));
    assert.ok(regla, sel);
    const min = Number((regla[1].match(/min-height:\s*(\d+)px/) || [])[1]);
    assert.ok(min >= 72, `${sel} mide ${min}px`);
  }
  assert.ok(/\.grilla\.t-chico \{ --celda: (\d+)px/.exec(css)[1] >= 72);
  assert.ok(h.includes('role="tablist"') && h.includes('role="tabpanel"') && h.includes('aria-live="polite"'));
  assert.ok(h.includes('setAttribute("aria-label"') && (h.match(/aria-label="/g) || []).length >= 8);
  assert.ok(css.includes("animation: none !important; transition: none !important;"));
  assert.ok(h.includes("requestFullscreen") && css.includes("body.completo"));
  assert.ok(css.includes("touch-action: manipulation") && css.includes("overscroll-behavior"));
});

test("no suma funciones en api/ (Vercel Hobby: 11 de 12)", () => {
  const fns = fs.readdirSync(path.join(RAIZ, "api")).filter(f => f.endsWith(".js"));
  assert.equal(fns.length, 11, fns.join(", "));
});

// ---------- Idiomas: español / inglés en la misma página ----------

test("idiomas: el diccionario en inglés tiene todas las claves del español (y ninguna de más), sin textos vacíos", () => {
  assert.deepEqual(TX.IDIOMAS, ["es", "en"]);
  assert.deepEqual(Object.keys(TX.en).sort(), Object.keys(TX.es).sort());
  for (const l of TX.IDIOMAS) for (const [k, v] of Object.entries(TX[l])) assert.ok(typeof v === "string" && v.trim(), `${l}.${k} vacío`);
  for (const k of Object.keys(TX.es)) assert.equal(TX.es[k].includes("{t}"), TX.en[k].includes("{t}"), `${k}: {t} en los dos idiomas`);
  // Todas las claves que usa la página existen en el diccionario
  const h = leer("comunicador.html");
  const usadas = [...h.matchAll(/data-i18n(?:-html|-aria)?="(\w+)"/g), ...h.matchAll(/tr\(\s*"(\w+)"/g), ...h.matchAll(/tr\([^)]*\? "(\w+)" : "(\w+)"/g)].flatMap(m => m.slice(1)).filter(Boolean);
  assert.ok(usadas.length >= 50, `usa ${usadas.length} claves`);
  for (const k of new Set(usadas)) assert.ok(k in TX.es, `falta la clave «${k}»`);
  // El crédito de ARASAAC también va en inglés, con autor, licencia y propiedad
  for (const t of ["Sergio Palao", "ARASAAC", "License: CC BY-NC-SA", "Government of Aragón (Spain)"]) assert.ok(TX.en.creditoTexto.includes(t), t);
  for (const t of ["Autor pictogramas: Sergio Palao", "Licencia: CC BY-NC-SA", "Propiedad: Gobierno de Aragón (España)"]) assert.ok(TX.es.creditoTexto.includes(t), t);
});

test("idiomas: todos los pictos tienen inglés (en) y su clave de ARASAAC en inglés (ken), con el mismo id; las categorías también", () => {
  for (const c of T.CATEGORIAS) {
    assert.ok(c.en && c.en.trim(), `categoría ${c.id} sin en`);
    for (const p of c.pictos) {
      assert.ok(typeof p.en === "string" && p.en.trim(), `${p.id} (${p.t}) sin en`);
      assert.ok(typeof p.ken === "string" && p.ken.trim(), `${p.id} (${p.t}) sin ken`);
      if ("dicen" in p) assert.ok(p.dicen.trim(), `${p.id}: dicen vacío`);
    }
  }
  const en = T.CATEGORIAS.find(c => c.id === "nucleo").pictos.map(p => p.en);
  for (const w of ["I", "I want", "more", "help", "yes", "no"]) assert.ok(en.includes(w), w);
  const lavar = T.CATEGORIAS.flatMap(c => c.pictos).find(p => p.id === 8975);
  assert.equal(lavar.dicen, "wash my hands");
});

test("idiomas: ?lang=en manda, si no la elección guardada, si no navigator.language (en* → inglés, lo demás → español)", () => {
  const e = TX.elegirIdioma;
  assert.equal(e("?lang=en", "", "es-AR"), "en");
  assert.equal(e("?app&lang=en", "es", "es-AR"), "en", "?lang le gana a lo guardado");
  assert.equal(e("?lang=es", "en", "en-US"), "es");
  assert.equal(e("?lang=EN-us", "", "es"), "en");
  assert.equal(e("?lang=fr", "", "es-AR"), "es", "idioma desconocido: sigue con lo demás");
  assert.equal(e("", "en", "es-AR"), "en", "elección guardada");
  assert.equal(e("", "", "en-GB"), "en");
  assert.equal(e("", "", "en"), "en");
  assert.equal(e("", "", "es-AR"), "es");
  assert.equal(e("", "", "pt-BR"), "es", "lo demás → español");
  assert.equal(e("", "", undefined), "es");
  assert.deepEqual(TX.HTML_LANG, { es: "es-AR", en: "en" });
});

test("idiomas: selector visible Español / English, <html lang> dinámico, se guarda en puente-comunicador y se borra con el botón", () => {
  const h = leer("comunicador.html");
  assert.match(h, /<div class="idioma" id="idioma" role="group" aria-label="Idioma \/ Language">/);
  assert.match(h, /<button type="button" data-lang="es"[^>]*>Español<\/button>/);
  assert.match(h, /<button type="button" data-lang="en"[^>]*>English<\/button>/);
  assert.ok(h.includes('<script src="comunicador-textos.js"></script>'));
  assert.ok(h.includes("TX.elegirIdioma(location.search, aj.idioma, navigator.language)"));
  assert.ok(h.includes("document.documentElement.lang = TX.HTML_LANG[lang]"));
  assert.ok(h.includes('idioma: "" }'), "idioma en los mismos ajustes (DEF)");
  assert.ok(h.includes("lang = aj.idioma = b.dataset.lang; guardar();"));
  const olvidar = h.slice(h.indexOf('$("bOlvidar").onclick'), h.indexOf("// ---------- App para Android"));
  assert.ok(olvidar.includes("localStorage.removeItem(CLAVE)") && olvidar.includes("aj = { ...DEF") && olvidar.includes('TX.elegirIdioma(location.search, "", navigator.language)'));
  assert.ok(h.includes('$("grupoGenero").hidden = lang !== "es"'), "en inglés se oculta nene/nena");
  // hreflang en la página y en el sitemap
  assert.ok(h.includes('<link rel="alternate" hreflang="en" href="https://puentepictos.app/comunicador.html?lang=en">'));
  assert.ok(leer("sitemap.xml").includes('hreflang="en" href="https://puentepictos.app/comunicador.html?lang=en"'));
  // Título y metas coherentes con «Puente Comunicador»
  assert.match(h, /<title>Puente Comunicador · /);
  assert.ok(h.includes('<meta name="application-name" content="Puente Comunicador">'));
  assert.equal(/se instala como «Comunicador»/.test(h), false);
});

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
  // El único pedido es el buscador de ARASAAC (T.buscarArasaac, en comunicador-tablero.js), directo a api.arasaac.org.
  assert.equal((datos.match(/\bfetch\b/g) || []).length, 1, "comunicador-tablero.js: un solo fetch, el del buscador");
  assert.ok(datos.includes('const API_ARASAAC = "https://api.arasaac.org/api/pictograms/"'));
  assert.ok(datos.includes('(pedir || fetch)(urlBusqueda(q, lang), { credentials: "omit", referrerPolicy: "no-referrer"'), "sin cookies ni referrer");
  for (const [nombre, src] of [["comunicador-tablero.js", datos], ["comunicador.html (body)", h.slice(h.indexOf("<body"))]]) {
    const hosts = new Set([...src.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]));
    for (const host of hosts) assert.ok(/(^|\.)arasaac\.org$|^puentepictos\.app$|^schema\.org$/.test(host), `${nombre}: no nombra ${host}`);
  }
  for (const [nombre, src] of [["comunicador.html", h], ["comunicador-textos.js", textos]]) {
    assert.equal(/\bfetch\b/.test(src), false, `${nombre}: no hace fetch (la búsqueda está en comunicador-tablero.js)`);
  }
  for (const [nombre, src] of [["comunicador.html", h], ["comunicador-tablero.js", datos], ["comunicador-textos.js", textos]]) {
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

test("manifest: el alcance cubre la página en español y la de inglés, con id y start_url estables", () => {
  const m = JSON.parse(leer("comunicador.webmanifest"));
  // id y start_url no cambian: quien ya la instaló sigue siendo la misma app.
  assert.equal(m.id, "/comunicador.html");
  assert.equal(m.start_url, "/comunicador.html?app");
  // Un solo manifest sirve a las dos páginas, y un alcance es un prefijo de ruta: solo «/» cubre /comunicador.html y /en/comunicador.html.
  const dentro = ruta => ruta.startsWith(m.scope === "/" ? "/" : m.scope);
  for (const ruta of ["/comunicador.html", "/en/comunicador.html", m.start_url]) assert.ok(dentro(ruta), `${ruta} fuera del alcance «${m.scope}»`);
  assert.ok(leer("comunicador.html").includes('<link rel="manifest" href="comunicador.webmanifest">'));
  assert.ok(leer("en/comunicador.html").includes('<link rel="manifest" href="/comunicador.webmanifest">'), "el inglés usa el mismo manifest");
});

test("el service worker (pictos-v38) cachea la página, el tablero, los textos y sus pictos, y sigue sin cachear /api ni /descargar", () => {
  const sw = leer("sw.js");
  assert.ok(sw.includes("const C = 'pictos-v38'"));
  assert.ok(sw.includes("'comunicador.html'") && sw.includes("'comunicador-tablero.js'") && sw.includes("'comunicador-textos.js'"));
  assert.ok(sw.includes("importScripts('comunicador-tablero.js')"));
  assert.ok(sw.includes("self.TABLERO.urls(extras)") && sw.includes("e.data.tipo === 'comunicador'") && sw.includes("guardarTablero(e.data.extras)"));
  assert.ok(sw.includes("/^\\/(api|descargar)\\//"), "el SW no cachea /api/ ni /descargar/");
  assert.ok(sw.includes("static.arasaac.org"));
  assert.ok(sw.includes("if (u.hostname === 'api.arasaac.org') return;"), "las búsquedas en ARASAAC no se cachean");
  assert.ok(leer("comunicador.html").includes('postMessage({ tipo: "comunicador", extras: aj.propios.map(p => p.id) })'));
});

test("vocabulario acotado (90 a 120 pictos) en las categorías pedidas, con ids únicos y palabra clave de ARASAAC", () => {
  const ids = T.CATEGORIAS.flatMap(c => c.pictos.map(p => p.id));
  assert.ok(ids.length >= 90 && ids.length <= 120, `hay ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  assert.deepEqual(T.CATEGORIAS.map(c => c.id), ["nucleo", "sentimientos", "necesidades", "personas", "lugares", "acciones", "juegos", "comida", "cuerpo", "ropa"]);
  const palabras = cat => T.CATEGORIAS.find(c => c.id === cat).pictos.map(p => p.t);
  for (const w of ["yo", "quiero", "no quiero", "sí", "no", "más", "terminé", "ayuda"]) assert.ok(palabras("nucleo").includes(w), w);
  for (const w of ["baño", "agua", "comer", "dormir", "me duele"]) assert.ok(palabras("necesidades").includes(w), w);
  // Frases de arranque y sentimientos: «necesito» (ARASAAC 37160) y «enfermo» (7040) se sumaron después; no se repite nada de lo que ya había.
  assert.ok(palabras("nucleo").includes("necesito"), "necesito");
  for (const w of ["contento", "triste", "enojado", "asustado", "cansado", "tranquilo", "enfermo"]) assert.ok(palabras("sentimientos").includes(w), w);
  const sumados = T.CATEGORIAS.flatMap(c => c.pictos).filter(p => [37160, 7040].includes(p.id));
  assert.deepEqual(sumados.map(p => [p.id, p.en, p.ken]).sort(), [[37160, "I need", "need"], [7040, "sick", "sick"]].sort());
  for (const c of T.CATEGORIAS) {
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    for (const p of c.pictos) {
      assert.ok(Number.isInteger(p.id) && p.id > 0, p.t);
      assert.ok(p.t && p.k, `${p.id} sin texto o sin clave`);
    }
  }
  assert.equal(T.url(6632), "https://static.arasaac.org/pictograms/6632/6632_300.png");
  // urls() (lo que guarda el SW) = pictos de las categorías + tablero Casa, sin repetir
  const conCasa = new Set(ids.concat(T.CASA.icono, T.CASA.ordenes.map(o => o.id)));
  assert.equal(T.urls().length, conCasa.size);
  for (const o of T.CASA.ordenes) assert.ok(T.urls().includes(T.url(o.id)), `Casa ${o.t} sin guardar para sin conexión`);
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

test("idiomas: selector Español / English (links a cada URL), <html lang> dinámico, se guarda en puente-comunicador y se borra con el botón", () => {
  const h = leer("comunicador.html");
  assert.match(h, /<div class="idioma" id="idioma" role="group" aria-label="Idioma \/ Language">/);
  // Links reales (andan sin JavaScript y Google los sigue); data-idioma hace que pie.js recuerde la elección del sitio.
  assert.match(h, /<a href="\/comunicador\.html" data-lang="es" data-idioma="es"[^>]*aria-current="page">Español<\/a>/);
  assert.match(h, /<a href="\/en\/comunicador\.html" data-lang="en" data-idioma="en"[^>]*>English<\/a>/);
  assert.ok(h.includes('<script src="comunicador-textos.js"></script>'));
  // En la web manda la URL (/en/ = inglés); en la app instalada (que no puede salir de /comunicador) sigue ?lang= > guardado > navegador.
  assert.ok(h.includes('const PAGINA = /^en\\b/i.test(document.documentElement.lang) ? "en" : "es"'));
  assert.ok(h.includes("EN_APP ? TX.elegirIdioma(location.search, guardado, navigator.language) : TX.elegirIdioma(location.search, PAGINA, \"\")"));
  assert.ok(h.includes("let lang = idiomaInicial(aj.idioma);"));
  assert.ok(h.includes("document.documentElement.lang = TX.HTML_LANG[lang]"));
  assert.match(h, /const DEF = \{[^}]*idioma: ""[,}]/, "idioma en los mismos ajustes (DEF)");
  assert.ok(h.includes("aj.idioma = b.dataset.lang; guardar();"));
  assert.ok(h.includes("location.href = u.href"), "en la web, el selector navega a la otra URL");
  const olvidar = h.slice(h.indexOf('$("bOlvidar").onclick'), h.indexOf("// ---------- App para Android"));
  assert.ok(olvidar.includes("localStorage.removeItem(CLAVE)") && olvidar.includes("aj = { ...DEF") && olvidar.includes('idiomaInicial("")'));
  assert.ok(h.includes('$("grupoGenero").hidden = lang !== "es"'), "en inglés se oculta nene/nena");
  // hreflang en la página y en el sitemap: el inglés tiene su URL /en/comunicador.html (ya no ?lang=en)
  assert.ok(h.includes('<link rel="alternate" hreflang="en" href="https://puentepictos.app/en/comunicador.html">'));
  assert.ok(leer("sitemap.xml").includes('hreflang="en" href="https://puentepictos.app/en/comunicador.html"'));
  assert.ok(h.includes('canon.href = "https://puentepictos.app" + (lang === "en" ? "/en/comunicador.html" : "/comunicador.html")'));
  // La versión en inglés se sirve ya traducida (desde comunicador-textos.js), con su propio <html lang>.
  const en = leer("en/comunicador.html");
  assert.match(en, /<html lang="en">/);
  assert.ok(en.includes(`<h1 data-i18n="titulo">${TX.en.titulo}</h1>`));
  assert.ok(en.includes('<link rel="canonical" href="https://puentepictos.app/en/comunicador.html">'));
  assert.match(en, /<a href="\/en\/comunicador\.html" data-lang="en"[^>]*aria-current="page">English<\/a>/);
  // Título y metas coherentes con «Puente Comunicador»
  assert.match(h, /<title>Puente Comunicador · /);
  assert.ok(h.includes('<meta name="application-name" content="Puente Comunicador">'));
  assert.equal(/se instala como «Comunicador»/.test(h), false);
});

// ---------- Tablero Casa: órdenes para asistentes de voz, sin integración ----------

test("Casa: 8 a 12 órdenes con picto de ARASAAC, palabra clave y frase en español y en inglés", () => {
  const C = T.CASA;
  assert.equal(C.id, "casa");
  assert.ok(C.ordenes.length >= 8 && C.ordenes.length <= 12, `hay ${C.ordenes.length}`);
  assert.equal(new Set(C.ordenes.map(o => o.id)).size, C.ordenes.length, "ids repetidos en Casa");
  for (const o of C.ordenes) {
    assert.ok(Number.isInteger(o.id) && o.id > 0, o.t);
    for (const k of ["t", "k", "orden", "en", "ken", "ordenen"]) assert.ok(typeof o[k] === "string" && o[k].trim(), `${o.id}: falta ${k}`);
    assert.equal(/[¡!¿?]|\p{Extended_Pictographic}/u.test(o.orden + o.ordenen), false, `${o.id}: la orden va sin signos ni emojis`);
  }
  const ordenes = C.ordenes.map(o => o.orden);
  for (const w of ["prende la luz", "apaga la luz", "pon música", "sube el volumen", "baja el volumen", "qué hora es", "cuéntame un cuento"]) assert.ok(ordenes.includes(w), w);
  const en = C.ordenes.map(o => o.ordenen);
  for (const w of ["turn on the lights", "turn off the lights", "play music", "what time is it", "tell me a story"]) assert.ok(en.includes(w), w);
});

test("Casa: la frase lleva la palabra de activación configurada (Alexa por defecto, Ok Google, Siri u otra) y la pausa", () => {
  const luz = T.CASA.ordenes.find(o => o.id === 8103);
  // Por defecto: Alexa, con pausa de 1 segundo, en dos partes
  let f = T.fraseCasa(luz, {}, "es");
  assert.deepEqual(f.partes, ["Alexa", "prende la luz"]);
  assert.equal(f.texto, "Alexa, prende la luz");
  assert.equal(f.pausa, true); assert.equal(f.espera, 1000);
  // Sin pausa: una sola frase
  f = T.fraseCasa(luz, { casaPalabra: "google", casaPausa: false }, "es");
  assert.deepEqual(f.partes, ["Ok Google, prende la luz"]); assert.equal(f.espera, 0);
  // Siri: «Oye Siri» en español y «Hey Siri» en inglés
  assert.equal(T.fraseCasa(luz, { casaPalabra: "siri" }, "es").texto, "Oye Siri, prende la luz");
  assert.deepEqual(T.fraseCasa(luz, { casaPalabra: "siri", casaEspera: 2000 }, "en"), { palabra: "Hey Siri", orden: "turn on the lights", pausa: true, espera: 2000, partes: ["Hey Siri", "turn on the lights"], texto: "Hey Siri, turn on the lights" });
  // Texto libre, limpio; una espera que no está en la lista vuelve a 1 s
  f = T.fraseCasa(luz, { casaPalabra: "otra", casaOtra: "  Echo   Dot ", casaEspera: 99999 }, "es");
  assert.equal(f.texto, "Echo Dot, prende la luz"); assert.equal(f.espera, 1000);
  // «Otra» vacía: solo la orden (y la página avisa que el parlante no se va a despertar)
  assert.deepEqual(T.fraseCasa(luz, { casaPalabra: "otra", casaOtra: " " }, "es").partes, ["prende la luz"]);
  assert.deepEqual(T.ESPERAS, [500, 1000, 1500, 2000, 3000]);
});

test("Casa: la página arma las teclas con la frase y aria-label, guarda los ajustes en puente-comunicador y avisa del parlante", () => {
  const h = leer("comunicador.html"), en = leer("en/comunicador.html");
  // Pestaña Casa en las categorías (role=tab) y entrada directa con #casa
  assert.ok(h.includes(".concat(T.CATEGORIAS, T.CASA)"));
  assert.ok(h.includes('location.hash === "#casa" ? "casa"'));
  // Cada tecla: botón con aria-label que incluye la frase con la palabra de activación configurada
  assert.ok(h.includes('b.setAttribute("aria-label", etiqueta + ". " + tr("casaAria", f.texto))'));
  assert.ok(h.includes("const f = T.fraseCasa(o, aj, lang)"));
  assert.ok(h.includes('b.type = "button"; b.className = "tecla casa-tecla"'), "las teclas de Casa son botones de 92 px (.tecla)");
  // Pausa: primero la palabra, al terminar espera f.espera y recién ahí la orden
  assert.ok(h.includes('u.addEventListener("end", seguir)') && h.includes("decir(f.partes[1], true); }, f.espera)"));
  // Ajustes en el mismo localStorage que el resto, con valores por defecto
  assert.ok(h.includes('casaPalabra: "alexa", casaOtra: "", casaPausa: true, casaEspera: 1000'));
  for (const v of ["alexa", "google", "siri", "otra"]) assert.ok(h.includes(`name="casaPalabra" value="${v}"`), v);
  assert.match(h, /<label for="oCasaOtra"[^>]*>Otra palabra de activación<\/label>/);
  assert.match(h, /<label for="oCasaEspera"[^>]*>Cuánto esperar<\/label>/);
  assert.match(h, /aria-label="Cambiar la palabra de activación y la pausa"/);
  // Aviso corto: parlante cerca y con volumen; el audio va a la empresa del asistente, no a Puente
  assert.ok(TX.es.casaNota.includes("cerca y con volumen") && TX.es.casaNota.includes("no a Puente"));
  assert.ok(TX.en.casaNota.includes("close by") && TX.en.casaNota.includes("not to Puente"));
  assert.ok(h.includes(`data-i18n="casaNota">${TX.es.casaNota}<`) && en.includes(`data-i18n="casaNota">${TX.en.casaNota}<`));
  // Inglés servido ya traducido
  assert.match(en, /<span data-i18n="casaSiri">Hey Siri<\/span>/);
  assert.ok(en.includes('aria-label="Change the wake word and the pause"'));
  // Sin «¡», emojis ni rayas en los textos nuevos
  for (const l of TX.IDIOMAS) for (const [k, v] of Object.entries(TX[l])) if (/^(casa|espera|infoCasa)/.test(k)) {
    assert.equal(/[¡—]|\p{Extended_Pictographic}/u.test(v), false, `${l}.${k}`);
  }
});

// ---------- Comida, Cuerpo y Ropa ----------

test("categorías nuevas: Comida, Cuerpo y Ropa con 10 a 13 pictos cada una, en español y en inglés, con color e ícono propios", () => {
  const cat = id => T.CATEGORIAS.find(c => c.id === id);
  const esperado = { comida: ["Comida", "Food"], cuerpo: ["Cuerpo", "Body"], ropa: ["Ropa", "Clothes"] };
  const colores = T.CATEGORIAS.map(c => c.color).concat(T.CASA.color);
  assert.equal(new Set(colores).size, colores.length, "cada categoría con su color");
  const h = leer("comunicador.html");
  for (const [id, [nombre, en]] of Object.entries(esperado)) {
    const c = cat(id);
    assert.equal(c.nombre, nombre); assert.equal(c.en, en);
    assert.ok(c.pictos.length >= 10 && c.pictos.length <= 13, `${id}: ${c.pictos.length}`);
    for (const p of c.pictos) for (const k of ["t", "k", "en", "ken"]) assert.ok(typeof p[k] === "string" && p[k].trim(), `${id} ${p.id}: falta ${k}`);
    assert.match(h, new RegExp(`\\b${id}: \\d+`), `ícono de ${id} en ICONO`);
  }
  const t = id => cat(id).pictos.map(p => p.t);
  for (const w of ["milanesa", "empanada", "té", "mate", "fruta", "leche", "galletitas", "vaso de agua"]) assert.ok(t("comida").includes(w), w);
  for (const w of ["cabeza", "panza", "mano", "pie", "me duele la cabeza", "me duele la panza"]) assert.ok(t("cuerpo").includes(w), w);
  for (const w of ["remera", "pantalón", "buzo", "campera", "zapatillas", "medias", "guardapolvo"]) assert.ok(t("ropa").includes(w), w);
  // «me duele» sigue en Necesidades (se combina con las partes del cuerpo: «me duele» + «pierna»)
  assert.ok(T.CATEGORIAS.find(c => c.id === "necesidades").pictos.some(p => p.t === "me duele"));
  // Textos sin «¡», emojis ni rayas
  for (const c of ["comida", "cuerpo", "ropa"]) for (const p of cat(c).pictos) assert.equal(/[¡!—]|\p{Extended_Pictographic}/u.test(p.t + p.en), false, p.t);
});

test("ids únicos en todo el tablero y todos guardados para sin conexión (urls() del SW), con las categorías nuevas", () => {
  const ids = T.CATEGORIAS.flatMap(c => c.pictos.map(p => p.id));
  assert.equal(new Set(ids).size, ids.length);
  const urls = T.urls();
  for (const c of ["comida", "cuerpo", "ropa"]) for (const p of T.CATEGORIAS.find(x => x.id === c).pictos) assert.ok(urls.includes(T.url(p.id)), `${c} ${p.t} sin guardar`);
  // Los propios (extras) también, sin repetir y descartando lo que no es un id
  const con = T.urls([123456, 123456, "789", -1, 1.5, "x", 2462]);
  assert.ok(con.includes(T.url(123456)) && con.includes(T.url(789)));
  assert.equal(con.length, urls.length + 2, "solo suma 123456 y 789 (2462 ya está en Comida)");
  assert.equal(T.urls(Array.from({ length: 200 }, (_, i) => 900000 + i)).length, urls.length + T.MAX_PROPIOS, "como mucho 60 propios");
  assert.equal(T.urls("basura").length, urls.length);
});

// ---------- Buscador de ARASAAC ----------

const respuesta = (status, cuerpo) => ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo });
const picto = (id, claves, extra) => ({ _id: id, keywords: claves.map(keyword => ({ keyword })), sex: false, violence: false, ...extra });

test("buscador: pide a api.arasaac.org en el idioma activo, sin cookies ni referrer, y arma los resultados", async () => {
  const pedidos = [];
  const pedir = async (u, op) => { pedidos.push([u, op]); return respuesta(200, [
    picto(7202, ["perro", "can"]), picto(7202, ["perro"]), picto(111, ["perrito caliente"]), picto(222, ["mascota"]),
    picto(333, ["perro"], { violence: true }), picto(444, ["perro"], { sex: true }), { _id: "x" }, picto(555, [])]); };
  const r = await T.buscarArasaac("  Perro ", "es", pedir);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0][0], "https://api.arasaac.org/api/pictograms/es/search/Perro");
  assert.deepEqual(pedidos[0][1], { credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
  assert.deepEqual(r, [{ id: 7202, t: "perro" }, { id: 111, t: "perrito caliente" }, { id: 222, t: "mascota" }], "sin repetidos, sin violencia ni sexo, sin ids raros");
  await T.buscarArasaac("dog", "en", pedir);
  assert.equal(pedidos[1][0], "https://api.arasaac.org/api/pictograms/en/search/dog");
  // Caracteres raros van codificados y la palabra se corta a 40
  assert.equal(T.urlBusqueda("pan/queso?#", "es"), "https://api.arasaac.org/api/pictograms/es/search/pan%2Fqueso%3F%23");
  assert.equal(T.limpiarPalabra("a".repeat(80)).length, 40);
});

test("buscador: sin resultados (404 de ARASAAC) da lista vacía, error de red o de servidor tira error, palabra corta no pide nada", async () => {
  let pedidos = 0;
  assert.deepEqual(await T.buscarArasaac("zzqqxx", "es", async () => { pedidos++; return respuesta(404, { error: "not found" }); }), []);
  await assert.rejects(T.buscarArasaac("perro", "es", async () => respuesta(500, {})));
  await assert.rejects(T.buscarArasaac("perro", "es", async () => { throw new TypeError("Failed to fetch"); }));
  assert.deepEqual(await T.buscarArasaac(" a ", "es", async () => { pedidos++; return respuesta(200, []); }), []);
  assert.equal(pedidos, 1, "con una letra no se pide nada");
  // Como mucho 24 resultados
  const muchos = Array.from({ length: 50 }, (_, i) => picto(1000 + i, ["sol"]));
  assert.equal((await T.buscarArasaac("sol", "es", async () => respuesta(200, muchos))).length, T.MAX_RESULTADOS);
});

test("buscador: lo guardado (propios) se limpia al leerlo: id entero, palabra, sin repetidos y como mucho 60", () => {
  assert.deepEqual(T.propiosValidos([{ id: 7202, t: " perro " }, { id: "7202", t: "otro" }, { id: 0, t: "x" }, { id: 5, t: "" }, null, { id: "9", t: "gato" }]),
    [{ id: 7202, t: "perro" }, { id: 9, t: "gato" }]);
  assert.deepEqual(T.propiosValidos("basura"), []);
  assert.equal(T.propiosValidos(Array.from({ length: 100 }, (_, i) => ({ id: i + 1, t: "p" + i }))).length, T.MAX_PROPIOS);
});

test("buscador en la página: reusa «Elegir favoritos», guarda { id, t } en puente-comunicador, avisa sin conexión y es accesible", () => {
  const h = leer("comunicador.html"), en = leer("en/comunicador.html");
  assert.ok(h.includes("propios: [], // pictos sumados con el buscador"), "propios en los mismos ajustes (DEF)");
  assert.ok(h.includes("aj.propios = T.propiosValidos(aj.propios);"));
  assert.ok(h.includes('$("buscador").hidden = !editando;'), "el buscador aparece al elegir favoritos");
  assert.ok(h.includes("aj.propios.push({ id: r.id, t: r.t }); cargarPropios();") && h.includes("aj.favoritos.push(r.id);"));
  assert.ok(h.includes("const lista = await T.buscarArasaac(q, lang);"));
  assert.ok(h.includes('if (navigator.onLine === false) { estadoBuscar(tr("sinConexion"), true); return; }'));
  assert.ok(h.includes('addEventListener("offline", avisoConexion)'));
  // Accesible: form role=search con label, estado aria-live, resultados como botones con aria-pressed y aria-label
  assert.match(h, /<form id="buscarForm" role="search"[^>]*aria-label="Buscar en ARASAAC"/);
  assert.match(h, /<label for="buscarPalabra"[^>]*>Palabra para buscar<\/label>/);
  assert.match(h, /<input type="search" id="buscarPalabra" maxlength="40"/);
  assert.match(h, /id="buscarEstado" role="status" aria-live="polite"/);
  assert.ok(h.includes('b.setAttribute("aria-pressed", String(fav));') && h.includes('tr(fav ? "propioEsta" : "propioSumar", t)'));
  const css = h.slice(h.indexOf("<style>"), h.indexOf("</style>"));
  assert.match(css, /\.buscar-fila input \{[^}]*min-height: 56px/); assert.match(css, /\.buscar-fila \.accion \{[^}]*min-height: 56px/);
  // Etiquetas largas (guardapolvo, rompecabezas, o la palabra que elija la familia): se achican en vez de cortarse a la mitad
  assert.ok(h.includes("function ajustarEtiquetas(raiz)") && (h.match(/ajustarEtiquetas\(g\);/g) || []).length === 3);
  assert.match(css, /\.sr-only \{[^}]*clip: rect\(0 0 0 0\)/, "el aviso para lector de pantalla no se ve");
  // Borrar ajustes también borra los propios
  assert.ok(h.includes("aj = { ...DEF, favoritos: [], propios: [] }; cargarPropios();"));
  // Inglés servido ya traducido
  assert.ok(en.includes(`data-i18n="buscarTitulo">${TX.en.buscarTitulo}<`) && en.includes('aria-label="Search ARASAAC"'));
  // Textos del buscador sin «¡», emojis ni rayas
  for (const l of TX.IDIOMAS) for (const [k, v] of Object.entries(TX[l])) if (/^(buscar|buscando|resultados|sinConexion|propio|infoBuscador)/.test(k)) {
    assert.equal(/[¡—]|\p{Extended_Pictographic}/u.test(v), false, `${l}.${k}`);
  }
});

test("privacidad: los textos dicen que la búsqueda va a ARASAAC (no a Puente) y que los dibujos se cargan desde ARASAAC", () => {
  for (const l of TX.IDIOMAS) {
    for (const k of ["infoPrivado", "buscarNota"]) assert.ok(TX[l][k].includes("ARASAAC"), `${l}.${k}`);
    assert.ok(/no a Puente|not to Puente/.test(TX[l].buscarNota), `${l}.buscarNota`);
  }
  assert.ok(TX.es.infoPrivado.includes("solo cuando usás el buscador, la palabra que escribís va a ARASAAC"));
  assert.ok(TX.en.infoPrivado.includes("only when you use the search, the word you type goes to ARASAAC"));
  // Ya no dice «todo pasa en este dispositivo» (la búsqueda sale del equipo)
  assert.equal(/todo pasa en este dispositivo/i.test(TX.es.infoPrivado) || /everything happens on this device/i.test(TX.en.infoPrivado), false);
  const h = leer("comunicador.html");
  assert.ok(h.includes(`data-i18n-html="infoPrivado">${TX.es.infoPrivado}<`));
  // Política de privacidad y FAQ del pizarrón (y su lista sin JS)
  for (const p of ["privacidad.html", "en/privacidad.html"]) assert.match(leer(p), /<b>(Comunicador|Communicator)<\/b>, (si usás el buscador|if you use the search)[^<]*ARASAAC/, p);
  const P = require("../pizarron.js");
  const pictos = P.FAQ.find(f => f.id === "pictos"), pictosEn = P.en.FAQ.find(f => f.id === "pictos");
  assert.ok(pictos.respuesta.includes("buscador") && pictos.respuesta.includes("ARASAAC"));
  assert.ok(pictosEn.respuesta.includes("search") && pictosEn.respuesta.includes("ARASAAC"));
  assert.ok(leer("index.html").includes(`<dd>${pictos.respuesta}</dd>`));
  // Y las imágenes de los pictos se cargan desde static.arasaac.org (no son propias), como dice el texto
  assert.equal(T.url(1), "https://static.arasaac.org/pictograms/1/1_300.png");
});

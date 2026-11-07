// Privacy page specific to the standalone Comunicador (es + en). The main policy (privacidad.html) is NOT edited:
// bumping its version would ask every existing user for consent again.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const TX = require("../comunicador-textos.js");

const PAGINAS = { es: "privacidad-comunicador.html", en: "en/privacidad-comunicador.html" };

test("las dos páginas existen, con su idioma, canonical y alternates recíprocos", () => {
  for (const [l, f] of Object.entries(PAGINAS)) assert.ok(fs.existsSync(path.join(RAIZ, f)), f);
  const es = leer(PAGINAS.es), en = leer(PAGINAS.en);
  assert.match(es, /<html lang="es-AR">/);
  assert.match(en, /<html lang="en">/);
  assert.ok(es.includes('<link rel="canonical" href="https://puentepictos.app/privacidad-comunicador.html">'));
  assert.ok(en.includes('<link rel="canonical" href="https://puentepictos.app/en/privacidad-comunicador.html">'));
  for (const h of [es, en]) {
    assert.ok(h.includes('<link rel="alternate" hreflang="es-AR" href="https://puentepictos.app/privacidad-comunicador.html">'));
    assert.ok(h.includes('<link rel="alternate" hreflang="en" href="https://puentepictos.app/en/privacidad-comunicador.html">'));
    assert.match(h, /<title>[^<]*(Comunicador|Communicator)[^<]*<\/title>/);
  }
  assert.ok(en.includes("Courtesy translation") && en.includes('href="/privacidad-comunicador.html"'), "el inglés es traducción de cortesía de la página en español");
});

test("no cargan scripts de terceros ni analítica, y el pie común no hace pedidos a Puente", () => {
  for (const f of Object.values(PAGINAS)) {
    const h = leer(f);
    const scripts = [...h.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
    assert.deepEqual(scripts, ['<script src="/pie.js" defer>'], `${f}: solo el pie común`);
    assert.equal(/openrouter|_vercel\/insights|window\.va\b|gtag|fetch\(|XMLHttpRequest|sendBeacon/i.test(h), false, `${f}: sin analítica ni pedidos`);
    // Pie sin donaciones (no pide api/config) y sin comentarios (no pide api/auth), como el Comunicador.
    assert.match(h, /<div id="puente-pie" data-donaciones="no"><\/div>/, f);
    assert.equal(/id="puente-pie"[^>]*data-feedback/.test(h), false, f);
    // Ningún recurso externo (imágenes, estilos, scripts, iframes, fuentes): lo único externo son enlaces a leer.
    assert.equal(/<(img|iframe|link[^>]*rel="stylesheet"|script)\b[^>]*(src|href)="https?:/i.test(h), false, `${f}: sin recursos externos`);
    const hosts = new Set([...h.matchAll(/(?:href|src)="https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]));
    for (const host of hosts) assert.ok(/(^|\.)arasaac\.org$|^puentepictos\.app$/.test(host), `${f}: enlaza a ${host}`);
    assert.ok(h.includes('href="https://arasaac.org"'), `${f}: enlace a ARASAAC`);
  }
});

test("dicen lo que pasa con los datos: sin cuenta, nada a los servidores de Puente, sin publicidad ni analítica, qué se guarda y cómo borrarlo", () => {
  const es = leer(PAGINAS.es), en = leer(PAGINAS.en);
  for (const t of ["no hace falta cuenta", "no se manda nada a los servidores de Puente", "Sin publicidad", "sin analítica", "localStorage",
    "puente-comunicador", "dirección IP", "máximo 40 caracteres", "síntesis de voz", "niñas, niños", "discapacidad", TX.es.olvidar]) assert.ok(es.includes(t), `es: ${t}`);
  for (const t of ["no account is needed", "nothing is sent to Puente's servers", "No ads", "no analytics", "localStorage",
    "puente-comunicador", "IP address", "up to 40 characters", "speech synthesis", "children", "disabilit", TX.en.olvidar]) assert.ok(en.includes(t), `en: ${t}`);
  // Lo que ARASAAC recibe: las imágenes que se piden, la IP y, si se usa el buscador, la palabra.
  assert.ok(es.includes("static.arasaac.org") && es.includes("api.arasaac.org"));
  assert.ok(en.includes("static.arasaac.org") && en.includes("api.arasaac.org"));
});

test("responsable y contacto: exactamente los de privacidad.html, sin placeholders ni cartel de borrador", () => {
  const principal = { es: leer("privacidad.html"), en: leer("en/privacidad.html") };
  const resp = { es: "Danny Gerardo Vergel (persona física)", en: "Danny Gerardo Vergel (as an individual)" };
  for (const l of ["es", "en"]) {
    assert.ok(principal[l].includes(resp[l]), `privacidad.html ya no dice «${resp[l]}»: revisar esta página`);
    const h = leer(PAGINAS[l]);
    assert.ok(h.includes(resp[l]), `${l}: responsable`);
    assert.ok(h.includes('href="mailto:soporte@puentepictos.app"'), `${l}: contacto`);
    assert.equal(/class="borrador"|BORRADOR|DRAFT|\[(RESPONSABLE|REGI[OÓ]N|CONTROLLER|REGION)\b/.test(h), false, `${l}: sin placeholders ni borrador`);
    assert.ok(h.includes('href="privacidad.html"') || h.includes('href="/privacidad.html"') || h.includes('href="/en/privacidad.html"'), `${l}: remite a la política de Puente`);
  }
  // No tiene versión propia: no vuelve a pedir consentimiento a nadie (la versión de privacidad.html no cambia).
  const { VERSION_PRIVACIDAD } = require("../api/_lib/legal");
  assert.ok(principal.es.includes(VERSION_PRIVACIDAD));
  for (const f of Object.values(PAGINAS)) assert.equal(leer(f).includes(VERSION_PRIVACIDAD), false, `${f}: no repite la versión de la política`);
});

test("el service worker precachea las dos páginas y el manifest las incluye en su alcance", () => {
  const sw = leer("sw.js");
  assert.ok(sw.includes("'privacidad-comunicador.html'") && sw.includes("'/en/privacidad-comunicador.html'"));
  const m = JSON.parse(leer("comunicador.webmanifest"));
  for (const ruta of ["/privacidad-comunicador.html", "/en/privacidad-comunicador.html"]) assert.ok(ruta.startsWith(m.scope), `${ruta} fuera del alcance`);
});

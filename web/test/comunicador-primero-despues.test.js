// Comunicador: vista "Primero - Después" (los dos primeros pictos de la frase, grandes). No guarda nada y no hace pedidos.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const TX = require("../comunicador-textos.js");

const html = leer("comunicador.html");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const js = html.slice(html.lastIndexOf("<script>"), html.lastIndexOf("</script>"));
const CLAVES = ["pdAbrir", "pdAbrirAria", "pdTitulo", "pdPrimero", "pdDespues", "pdPictosAria", "pdCerrar", "pdDecirPrimero"];
const CLASES = [".pd", ".pd-pictos", ".pd-cerrar"];

test("Primero-Después: el botón está en la barra de frase, junto a los demás, y arranca deshabilitado", () => {
  const barra = html.slice(html.indexOf('<div class="frase-botones">'), html.indexOf('id="cats"'));
  const orden = ["bHablar", "bUltimo", "bTodo", "bPrimero", "bSalir"].map(id => barra.indexOf(`id="${id}"`));
  assert.ok(orden.every(i => i > 0) && orden.every((n, i) => !i || n > orden[i - 1]), "bPrimero va entre bTodo y bSalir");
  assert.match(barra, /<button type="button" class="accion[^"]*" id="bPrimero"[^>]*data-i18n-aria="pdAbrirAria"[^>]*disabled/);
  assert.equal(/id="bPrimero"[^>]*com-solo-normal/.test(barra), false, "también sirve en pantalla completa");
  assert.match(js, /\$\("bPrimero"\)\.disabled = frase\.length < 2/, "se habilita con 2 o más pictos");
});

test("Primero-Después: el diálogo es modal, tiene nombre y muestra los dos primeros pictos con su palabra", () => {
  assert.match(html, /<div class="pd" id="pd" role="dialog" aria-modal="true" aria-labelledby="pdTitulo" hidden>/);
  assert.match(html, /<h2 id="pdTitulo" data-i18n="pdTitulo">/);
  assert.match(html, /id="pdCerrar"/);
  assert.match(js, /frase\.slice\(0, 2\)/, "usa solo los dos primeros");
  assert.match(js, /T\.url\(/);
  assert.ok(/sin-img/.test(js.slice(js.indexOf("function abrirPrimero"))), "si la imagen falla queda la palabra");
  assert.match(js, /texto\(/);
});

test("Primero-Después: tocar los dibujos dice la frase con el único punto de voz (decir y dicho)", () => {
  const f = js.slice(js.indexOf("function decirPrimero"), js.indexOf("function decirPrimero") + 400);
  assert.ok(f.includes("decir(") && f.includes("dicho(") && f.includes('tr("pdDecirPrimero"'));
  assert.match(js, /\$\("pdPictos"\)\.onclick = decirPrimero/);
  assert.equal(/new SpeechSynthesisUtterance/.test(js.slice(js.indexOf("function abrirPrimero"))), false, "no habla por su cuenta");
});

test("Primero-Después: cierra con botón y con Escape, mueve el foco adentro y lo devuelve, y el Tab no sale", () => {
  assert.match(js, /\$\("pdCerrar"\)\.onclick = cerrarPrimero/);
  assert.match(js, /e\.key === "Escape"/);
  assert.match(js, /e\.key !== "Tab"/, "trampa de foco");
  assert.match(js, /e\.shiftKey \? -1 : 1/, "Shift+Tab también da la vuelta");
  const abrir = js.slice(js.indexOf("function abrirPrimero"), js.indexOf("function cerrarPrimero"));
  assert.match(abrir, /\.hidden = false/);
  assert.match(abrir, /\.focus\(\)/, "el foco entra al diálogo");
  const cerrar = js.slice(js.indexOf("function cerrarPrimero"), js.indexOf("function cerrarPrimero") + 300);
  assert.match(cerrar, /\.hidden = true/);
  assert.match(cerrar, /\$\("bPrimero"\)\.focus\(\)/, "el foco vuelve al botón");
});

test("Primero-Después: no guarda nada, no hace pedidos y no toca los ajustes", () => {
  const bloque = js.slice(js.indexOf("// ---------- Primero"), js.indexOf("function cerrarPrimero") + 400);
  assert.ok(bloque.length > 200, "el bloque existe");
  assert.equal(/localStorage|guardar\(|\baj\.\w+\s*=[^=]/.test(bloque), false, "sin persistencia ni escritura de ajustes");
  assert.equal(/\bfetch\b|XMLHttpRequest|sendBeacon/.test(bloque + html.slice(html.indexOf('id="pd"'), html.indexOf('id="vivo"'))), false);
  const def = js.slice(js.indexOf("const DEF = {"), js.indexOf("let aj = "));
  assert.equal(/pd|primero/i.test(def), false, "DEF no suma campos");
  assert.deepEqual([...new Set([...html.matchAll(/localStorage\.(\w+)/g)].map(m => m[1]))].sort(), ["getItem", "removeItem", "setItem"]);
  assert.equal(/analytics/i.test(html), false);
});

test("Primero-Después: textos en español e inglés con las mismas claves, y el inglés generado los trae", () => {
  for (const k of CLAVES) for (const l of TX.IDIOMAS) assert.ok(typeof TX[l][k] === "string" && TX[l][k].trim(), `${l}.${k}`);
  assert.deepEqual(Object.keys(TX.en).sort(), Object.keys(TX.es).sort());
  // Frase hablada: «Primero comer, después jugar.» / «First eat, then play.»
  assert.equal(TX.es.pdDecirPrimero.replace("{t}", "comer") + " jugar", "Primero comer, después jugar");
  assert.equal(TX.en.pdDecirPrimero.replace("{t}", "eat") + " play", "First eat, then play");
  const en = leer("en/comunicador.html");
  assert.ok(en.includes(TX.en.pdTitulo) && en.includes(TX.en.pdCerrar));
  assert.ok(en.includes(`aria-label="${TX.en.pdAbrirAria}"`));
  for (const k of CLAVES) assert.ok(html.includes(`"${k}"`), `${k} se usa en la página`);
});

test("Primero-Después: las clases nuevas entran en la regla de colores forzados y miden 72px o más", () => {
  const forzado = css.match(/@media \(forced-colors: active\) \{([^}]*)\}/)[1];
  for (const c of CLASES.slice(1)) assert.ok(forzado.includes(c), `${c} en forced-colors`);
  for (const sel of [".pd-pictos", ".pd-cerrar"]) {
    const regla = css.match(new RegExp("\\n\\s*\\" + sel + " \\{([^}]*)\\}"));
    assert.ok(regla, sel);
    assert.ok(Number((regla[1].match(/min-height:\s*(\d+)px/) || [])[1]) >= 72, `${sel} mide menos de 72px`);
  }
  assert.match(css, /\n\s*\.pd\[hidden\] \{ display: none; \}/);
});

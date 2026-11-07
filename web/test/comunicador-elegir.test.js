// Comunicador: modo "Elegir" dentro del diálogo Primero - Después. No guarda nada y no hace pedidos.
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
const dialogo = html.slice(html.indexOf('id="pd"'), html.indexOf('id="vivo"'));
const bloque = js.slice(js.indexOf("// ---------- Primero"), js.indexOf("// ---------- Categorías"));
const CLAVES = ["pdModosAria", "pdModoPD", "pdModoElegir", "pdElegirPregunta", "pdElegirAria", "pdElegido", "pdDecirElegir"];

test("Elegir: el diálogo tiene un selector de dos modos con botones aria-pressed; Primero y después arranca activo", () => {
  assert.match(dialogo, /role="group"[^>]*data-i18n-aria="pdModosAria"/);
  assert.match(dialogo, /<button type="button" class="accion pd-modo" id="pdModoPD" aria-pressed="true">/);
  assert.match(dialogo, /<button type="button" class="accion pd-modo" id="pdModoElegir" aria-pressed="false">/);
  // El botón y la vista de Primero y después siguen donde estaban (#66), y la vista de Elegir arranca oculta.
  assert.match(dialogo, /id="pdPictos"/);
  assert.match(dialogo, /class="pd-elegir" id="pdElegir"[^>]*hidden/);
});

test("Elegir: dos opciones grandes (botones con aria-pressed), sin flecha, con pregunta y marca de elegido que no depende del color", () => {
  const elegir = dialogo.slice(dialogo.indexOf('id="pdElegir"'), dialogo.indexOf('id="pdCerrar"'));
  assert.match(elegir, /id="pdOpA"[^>]*aria-pressed="false"/);
  assert.match(elegir, /id="pdOpB"[^>]*aria-pressed="false"/);
  assert.equal(/pd-flecha|<svg class="pd-flecha/.test(elegir), false, "sin flecha en Elegir");
  assert.match(dialogo, /data-i18n="pdElegirPregunta"/);
  assert.match(elegir, /data-i18n="pdElegido"/, "texto «Elegido» dentro de la opción");
  assert.match(css, /\.pd-opcion\[aria-pressed="true"\] \.pd-marca \{[^}]*display: (block|flex)/, "la marca se ve solo al elegir");
  assert.match(css, /\.pd-opcion\[aria-pressed="true"\] \{[^}]*border-width: \d+px/, "el borde cambia de grosor, no solo de color");
  assert.match(css, /\.pd-pictos\[hidden\][^{]*\{ display: none; \}/, "[hidden] gana sobre display:flex");
  assert.match(css, /\.pd-elegir\[hidden\][^{]*\{ display: none; \}/);
});

test("Elegir: tocar una opción la marca y dice «Quiero X» con decir() y dicho(), sin voz propia", () => {
  assert.match(bloque, /function elegirOpcion/);
  const f = bloque.slice(bloque.indexOf("function elegirOpcion"), bloque.indexOf("function elegirOpcion") + 500);
  assert.ok(f.includes("decir(") && f.includes("dicho(") && f.includes('tr("pdDecirElegir"'));
  assert.ok(f.includes('setAttribute("aria-pressed"'));
  assert.equal(/new SpeechSynthesisUtterance|speechSynthesis\.speak/.test(bloque), false);
  assert.match(js, /\$\("pdOpA"\)\.onclick/);
  assert.match(js, /\$\("pdOpB"\)\.onclick/);
});

test("Elegir: cada vez que se abre el diálogo vuelve a Primero y después y sin nada elegido; los modos cambian la vista", () => {
  assert.match(bloque, /function ponerModo/);
  const abrir = bloque.slice(bloque.indexOf("function abrirPrimero"), bloque.indexOf("function cerrarPrimero"));
  assert.match(abrir, /ponerModo\("primero"\)/, "reinicia el modo al abrir");
  assert.match(bloque, /\$\("pdModoPD"\)\.onclick/);
  assert.match(bloque, /\$\("pdModoElegir"\)\.onclick/);
  const modo = bloque.slice(bloque.indexOf("function ponerModo"), bloque.indexOf("function ponerModo") + 700);
  assert.ok(modo.includes('$("pdPictos").hidden') && modo.includes('$("pdElegir").hidden'));
  assert.ok(modo.includes("aria-pressed"));
});

test("Elegir: Escape y la trampa de foco siguen andando y alcanzan los botones nuevos que se ven", () => {
  assert.match(js, /e\.key === "Escape"/);
  assert.match(js, /e\.key !== "Tab"/);
  assert.match(js, /e\.shiftKey \? -1 : 1/);
  assert.match(bloque, /\$\("pd"\)\.querySelectorAll\("button"\)/, "el foco recorre todos los botones del diálogo");
  assert.match(bloque, /closest\("\[hidden\]"\)/, "salvo los de una vista oculta");
});

test("Elegir: no guarda nada, no hace pedidos y no suma campos a los ajustes", () => {
  assert.equal(/localStorage|guardar\(|\baj\.\w+\s*=[^=]/.test(bloque), false);
  assert.equal(/\bfetch\b|XMLHttpRequest|sendBeacon/.test(bloque + dialogo), false);
  const def = js.slice(js.indexOf("const DEF = {"), js.indexOf("let aj = "));
  assert.equal(/elegir|pdModo/i.test(def), false);
  assert.deepEqual([...new Set([...html.matchAll(/localStorage\.(\w+)/g)].map(m => m[1]))].sort(), ["getItem", "removeItem", "setItem"]);
});

test("Elegir: textos en español e inglés, y el inglés generado los trae", () => {
  for (const k of CLAVES) for (const l of TX.IDIOMAS) assert.ok(typeof TX[l][k] === "string" && TX[l][k].trim(), `${l}.${k}`);
  assert.deepEqual(Object.keys(TX.en).sort(), Object.keys(TX.es).sort());
  // Only the chosen word is spoken: a "Quiero ..." prefix breaks with "no quiero", "me duele" or "feliz".
  assert.equal(TX.es.pdDecirElegir.replace("{t}", "agua"), "agua.");
  assert.equal(TX.en.pdDecirElegir.replace("{t}", "water"), "water.");
  assert.equal(TX.es.pdDecirElegir.replace("{t}", "no quiero"), "no quiero.");
  assert.equal(TX.es.pdElegirPregunta, "¿Cuál querés?");
  assert.equal(TX.en.pdElegirPregunta, "Which one?");
  assert.equal(TX.es.pdModoElegir, "Elegir");
  const en = leer("en/comunicador.html");
  for (const k of ["pdModoElegir", "pdElegirPregunta", "pdElegido"]) assert.ok(en.includes(TX.en[k]), k);
  assert.ok(en.includes(`aria-label="${TX.en.pdModosAria}"`));
  for (const k of CLAVES) assert.ok(html.includes(`"${k}"`), `${k} se usa en la página`);
});

test("Elegir: las clases nuevas entran en la regla de colores forzados y miden 72px o más", () => {
  const forzado = css.match(/@media \(forced-colors: active\) \{([^}]*)\}/)[1];
  for (const c of [".pd-modo", ".pd-opcion"]) assert.ok(forzado.includes(c), `${c} en forced-colors`);
  for (const sel of [".pd-modo", ".pd-opcion"]) {
    const regla = css.match(new RegExp("\\n\\s*\\" + sel + " \\{([^}]*)\\}"));
    assert.ok(regla, sel);
    assert.ok(Number((regla[1].match(/min-height:\s*(\d+)px/) || [])[1]) >= 72, `${sel} mide menos de 72px`);
  }
});

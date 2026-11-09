// Comunicador: "Buscar otro dibujo" dentro del diálogo Primero y después / Elegir. Reusa el buscador existente; no suma claves ni pedidos.
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
const buscador = js.slice(js.indexOf("// ---------- Buscador de ARASAAC"), js.indexOf("// ---------- Pantalla completa"));
const CLAVES = ["pdBuscar", "pdBuscarAria", "pdBuscarVolver", "pdCambiado"];

test("Buscar en el diálogo: hay un botón por dibujo (A y B), fuera de los botones de vista, visibles en los dos modos", () => {
  assert.match(dialogo, /<button type="button" class="accion pd-buscar-btn" id="pdBuscA"/);
  assert.match(dialogo, /<button type="button" class="accion pd-buscar-btn" id="pdBuscB"/);
  assert.match(dialogo, /data-i18n="pdBuscar"/);
  // Ningún botón anidado dentro de otro botón (el de Primero y después y las opciones de Elegir son botones).
  const pictos = dialogo.slice(dialogo.indexOf('id="pdPictos"'), dialogo.indexOf('id="pdElegir"'));
  assert.equal(/pdBusc[AB]/.test(pictos), false, "no dentro de pdPictos");
  const elegir = dialogo.slice(dialogo.indexOf('id="pdElegir"'), dialogo.indexOf('id="pdOpB"'));
  assert.equal(/pdBusc[AB]/.test(elegir), false, "no dentro de las opciones");
  // Los botones no están dentro de una vista que se oculta con el modo.
  const fila = dialogo.slice(dialogo.indexOf('id="pdBuscA"') - 200, dialogo.indexOf('id="pdBuscA"'));
  assert.equal(/id="pdElegir"[^>]*hidden/.test(fila) && !fila.includes("</div>"), false);
});

test("Buscar en el diálogo: reusa el formulario y el buscador existentes, sin copiarlos ni pedir nada nuevo", () => {
  assert.equal((html.match(/id="buscarForm"/g) || []).length, 1, "un solo formulario");
  assert.equal((html.match(/id="buscarPalabra"/g) || []).length, 1);
  assert.match(bloque, /\$\("pdBuscA"\)\.onclick/);
  assert.match(bloque, /\$\("pdBuscB"\)\.onclick/);
  assert.match(js, /function abrirBuscadorDialogo/);
  const abrirB = js.slice(js.indexOf("function abrirBuscadorDialogo"), js.indexOf("function cerrarBuscadorDialogo"));
  assert.ok(abrirB.includes('$("buscador")') && abrirB.includes('$("pd").insertBefore(b,'), "mueve el buscador existente al diálogo");
  assert.equal(/\bfetch\b|XMLHttpRequest|sendBeacon/.test(bloque + dialogo), false);
  assert.equal((js.match(/T\.buscarArasaac\(/g) || []).length, 1, "una sola llamada de búsqueda");
});

test("Buscar en el diálogo: elegir un resultado respeta el límite y el aviso de lleno, y no toca la frase", () => {
  const f = buscador.slice(buscador.indexOf("function elegirParaDialogo"), buscador.indexOf("$(\"buscarForm\").onsubmit"));
  assert.ok(f.length > 50, "existe elegirParaDialogo");
  assert.ok(f.includes("T.MAX_PROPIOS") && f.includes('tr("propiosLleno")'));
  assert.ok(f.includes("aj.propios.push({ id: r.id, t: r.t })"));
  assert.equal(/\bfrase\b/.test(f.replace(/aj\.frase/g, "")), false, "no cambia la frase");
  assert.equal(/frase\s*(=|\.push|\.splice|\.shift|\.pop)/.test(bloque), false, "el bloque del diálogo no cambia la frase");
  assert.match(f, /todos\.get\(r\.id\)/, "si ya está en el tablero, manda el del tablero");
  assert.match(buscador, /function elegirResultado\(r\) \{\s*if \(pdBuscando >= 0\)/, "el resultado va al diálogo solo si se abrió desde ahí");
});

test("Buscar en el diálogo: reemplaza solo ese dibujo (imagen, palabra, aria) y devuelve el foco a su botón", () => {
  assert.match(bloque, /function pintarSlot/);
  assert.match(bloque, /function cambiarEnDialogo/);
  const c = bloque.slice(bloque.indexOf("function cambiarEnDialogo"), bloque.indexOf("function cambiarEnDialogo") + 500);
  assert.ok(c.includes("pdDos[i] = p") && c.includes("pintarSlot(i)"));
  const s = bloque.slice(bloque.indexOf("function pintarSlot"), bloque.indexOf("function pintarSlot") + 900);
  assert.ok(s.includes("T.url(p.id)") && s.includes("texto(p)") && s.includes('tr("pdBuscarAria"'));
  assert.match(js, /\$\("pdBuscA"\)\.focus\(\)|\$\(i \? "pdBuscB" : "pdBuscA"\)\.focus\(\)/);
});

test("Buscar en el diálogo: Escape cierra primero el buscador y después el diálogo; el foco da la vuelta con el buscador adentro", () => {
  const k = bloque.slice(bloque.indexOf('document.addEventListener("keydown"'));
  const iBusc = k.indexOf("pdBuscando >= 0"), iCerrar = k.indexOf("cerrarPrimero()");
  assert.ok(iBusc >= 0 && iCerrar > iBusc, "el buscador se cierra antes que el diálogo");
  assert.match(bloque, /\$\("pd"\)\.querySelectorAll\("button"\)/);
  assert.match(dialogo, /id="pdBuscarVolver"/, "hay un botón para volver sin teclado");
  assert.match(js, /function cerrarBuscadorDialogo/);
  const cerrar = bloque.slice(bloque.indexOf("function cerrarPrimero"), bloque.indexOf("function cerrarPrimero") + 300);
  assert.ok(cerrar.includes("cerrarBuscadorDialogo"), "cerrar el diálogo deja el buscador en su lugar");
});

test("Buscar en el diálogo: no suma claves de almacenamiento ni campos a los ajustes", () => {
  assert.deepEqual([...new Set([...html.matchAll(/localStorage\.(\w+)/g)].map(m => m[1]))].sort(), ["getItem", "removeItem", "setItem"]);
  assert.equal((html.match(/localStorage\.setItem\(/g) || []).length, 1, "una sola escritura, la de siempre");
  const def = js.slice(js.indexOf("const DEF = {"), js.indexOf("let aj = "));
  assert.equal(/pdBusc|dialogo/i.test(def), false);
  assert.equal(/localStorage|guardar\(/.test(bloque), false);
});

test("Buscar en el diálogo: textos en español (voseo) e inglés, y el inglés generado los trae", () => {
  for (const k of CLAVES) for (const l of TX.IDIOMAS) assert.ok(typeof TX[l][k] === "string" && TX[l][k].trim(), `${l}.${k}`);
  assert.deepEqual(Object.keys(TX.en).sort(), Object.keys(TX.es).sort());
  assert.ok(TX.es.pdBuscarAria.includes("{t}") && TX.en.pdBuscarAria.includes("{t}"));
  assert.ok(TX.es.pdCambiado.includes("{t}") && TX.en.pdCambiado.includes("{t}"));
  for (const k of CLAVES) assert.ok(html.includes(`"${k}"`), `${k} se usa en la página`);
  const en = leer("en/comunicador.html");
  assert.ok(en.includes(TX.en.pdBuscar), "pdBuscar en el inglés generado");
  assert.ok(en.includes(TX.en.pdBuscarVolver), "pdBuscarVolver en el inglés generado");
});

test("Buscar en el diálogo: los botones nuevos miden 72px o más y entran en la regla de colores forzados", () => {
  const forzado = css.match(/@media \(forced-colors: active\) \{([^}]*)\}/)[1];
  for (const c of [".pd-buscar-btn", ".pd-volver"]) assert.ok(forzado.includes(c), `${c} en forced-colors`);
  for (const sel of [".pd-buscar-btn", ".pd-volver"]) {
    const regla = css.match(new RegExp("\\n\\s*\\" + sel + " \\{([^}]*)\\}"));
    assert.ok(regla, sel);
    assert.ok(Number((regla[1].match(/min-height:\s*(\d+)px/) || [])[1]) >= 72, `${sel} mide menos de 72px`);
  }
});

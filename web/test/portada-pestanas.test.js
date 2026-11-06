// Portada ordenada por público: «Seños y escuelas», «Familias», «Comunicador» y «Sumate».
// Con JavaScript son pestañas (patrón WAI-ARIA tabs); sin JavaScript se ven las cuatro secciones seguidas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const h = leer("index.html");

const PANELES = [["tabEscuelas", "escuelas"], ["tabFamilias", "familias"], ["tabComunicador", "comunicador"], ["tabSumate", "sumate"]];
const etiqueta = (html, id) => (html.match(new RegExp(`<[a-z]+\\b[^>]*\\sid="${id}"[^>]*>`)) || [])[0];
const seccion = (html, id) => { const i = html.indexOf(etiqueta(html, id)); return html.slice(i, html.indexOf("</section>", i)); };

test("arriba: qué es Puente y una sola acción principal; entrar, familia y demo con menos peso", () => {
  const i = h.indexOf('aria-labelledby="lema"'), f = h.indexOf("</section>", i);
  const arriba = h.slice(i, f);
  assert.ok(arriba.includes("La seño dicta cómo fue el día"));
  const grandes = [...arriba.matchAll(/<a class="big( [^"]*)?"/g)].filter(m => !/\balt\b/.test(m[1] || ""));
  assert.equal(grandes.length, 1, "una sola acción principal");
  assert.match(arriba, /<a class="big principal" id="btnIrPiloto" href="#sumarse">Quiero sumarme al piloto<\/a>/);
  for (const id of ["btnEntrar", "btnFamilia", "btnDemo"]) assert.match(etiqueta(arriba, id), /class="big alt chico/, id);
});

test("pestañas: roles ARIA, cada pestaña controla una sección que existe, y la lista está oculta sin JavaScript", () => {
  const lista = h.match(/<div class="pestanas" role="tablist" aria-label="[^"]+" hidden>([\s\S]*?)<\/div>/);
  assert.ok(lista, "tablist con nombre y oculto hasta que corre el script");
  const tabs = [...lista[1].matchAll(/<button type="button" role="tab" id="(\w+)" aria-controls="(\w+)" aria-selected="(true|false)"( tabindex="-1")?>([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map(m => [m[1], m[2]]), PANELES);
  assert.deepEqual(tabs.map(m => m[3]), ["true", "false", "false", "false"], "la primera, elegida");
  assert.ok(tabs.slice(1).every(m => m[4]), "foco itinerante: solo la elegida entra con Tab");
  for (const [, id] of PANELES) {
    const t = etiqueta(h, id);
    assert.match(t, /^<section class="on [^"]*panel"/, id);
    assert.equal(/\shidden\b/.test(t), false, `${id}: sin JavaScript se ve`);
    assert.match(seccion(h, id), /<h2 class="panel-titulo" id="\w+">[^<]+<\/h2>/, `${id}: tiene título propio (se ve sin JavaScript)`);
  }
  // El título de cada sección solo se esconde (visualmente) cuando hay pestañas.
  assert.match(h, /\.con-pestanas \.panel-titulo \{ position: absolute; width: 1px;/);
  assert.match(h, /\.pestanas \[role="tab"\]:focus-visible/);
});

test("sin JavaScript todo el contenido está en la página, cada cosa en su sección", () => {
  assert.ok(seccion(h, "escuelas").includes('<ol class="pasos">') && seccion(h, "escuelas").includes("educación especial"));
  assert.ok(seccion(h, "familias").includes('id="ejemplo"') && seccion(h, "familias").includes("Gratuito y sin fines de lucro"));
  assert.ok(seccion(h, "comunicador").includes('id="btnComunicador"') && seccion(h, "comunicador").includes('id="btnComApk"'));
  const s = seccion(h, "sumate");
  for (const id of ["sumarse", "fSumarse", "sumateTester", "sumateDonar", "linkPuenteApk"]) assert.ok(s.includes(`id="${id}"`), id);
  assert.ok(s.includes("15 cupos") && s.includes("Piloto con invitación"));
  // El pizarrón y «Quién hace Puente» quedan fuera de las pestañas, para todos.
  assert.ok(h.indexOf('id="preguntale"') > h.indexOf("<!-- /publicos -->"));
  assert.ok(h.indexOf('id="quien"') > h.indexOf("<!-- /publicos -->"));
});

// Corre el script de las pestañas con un DOM mínimo de mentira (sin dependencias).
function correrPestanas() {
  const codigo = h.slice(h.indexOf("// Pestañas por público"), h.indexOf("// Tira de ejemplo"));
  const docL = {}, porId = {};
  const nodo = (attrs, padre) => {
    const L = {};
    const n = { id: attrs.id, attrs: { ...attrs }, padre, hidden: !!attrs.hidden, tabIndex: attrs.tabindex !== undefined ? +attrs.tabindex : 0, clases: new Set(),
      classList: { add: c => n.clases.add(c) },
      getAttribute: k => (k in n.attrs ? n.attrs[k] : null), setAttribute: (k, v) => { n.attrs[k] = String(v); },
      addEventListener: (t, f) => (L[t] = L[t] || []).push(f), disparar: (t, e) => (L[t] || []).forEach(f => f(e)),
      focus: () => { doc.activeElement = n; },
      closest: sel => { const m = sel.match(/^\[role="(\w+)"\]$/); for (let x = n; x; x = x.padre) if (m && x.attrs.role === m[1]) return x; return null; } };
    if (attrs.id) porId[attrs.id] = n;
    return n;
  };
  const lista = nodo({ role: "tablist", hidden: true });
  const tabs = PANELES.map(([t, p], i) => nodo({ role: "tab", id: t, "aria-controls": p, "aria-selected": String(i === 0), ...(i ? { tabindex: -1 } : {}) }, lista));
  const paneles = PANELES.map(([, p]) => nodo({ id: p }));
  nodo({ id: "publicos" });
  const sumarse = nodo({ id: "sumarse" }, porId.sumate);
  const doc = {
    activeElement: null,
    querySelector: s => (s === '.pestanas[role="tablist"]' ? lista : null),
    getElementById: id => porId[id] || null,
    addEventListener: (t, f) => (docL[t] = docL[t] || []).push(f),
  };
  lista.querySelectorAll = () => tabs;
  const win = { addEventListener: () => {} };
  new Function("document", "window", "location", "CustomEvent", codigo)(doc, win, { hash: "" }, class {});
  const tecla = (t, key) => { let prev = false; t.disparar("keydown", { key, preventDefault: () => { prev = true; } }); return prev; };
  return { lista, tabs, paneles, doc, docL, sumarse, tecla };
}

test("el script: arma los tabpanel, flechas / Inicio / Fin mueven el foco y cambian de sección, y un ancla abre su pestaña", () => {
  const { lista, tabs, paneles, doc, docL, sumarse, tecla } = correrPestanas();
  const elegida = () => tabs.findIndex(t => t.attrs["aria-selected"] === "true");
  const visibles = () => paneles.map(p => !p.hidden);
  assert.equal(lista.hidden, false, "con JavaScript aparecen las pestañas");
  paneles.forEach((p, i) => { assert.equal(p.attrs.role, "tabpanel"); assert.equal(p.attrs["aria-labelledby"], tabs[i].attrs.id); });
  assert.deepEqual(visibles(), [true, false, false, false]);
  assert.deepEqual(tabs.map(t => t.tabIndex), [0, -1, -1, -1]);
  assert.ok(tecla(tabs[0], "ArrowRight")); assert.equal(elegida(), 1); assert.equal(doc.activeElement, tabs[1]);
  assert.deepEqual(visibles(), [false, true, false, false]);
  tecla(tabs[1], "End"); assert.equal(elegida(), 3); assert.equal(doc.activeElement, tabs[3]);
  tecla(tabs[3], "ArrowRight"); assert.equal(elegida(), 0, "de la última vuelve a la primera");
  tecla(tabs[0], "ArrowLeft"); assert.equal(elegida(), 3, "de la primera va a la última");
  tecla(tabs[3], "Home"); assert.equal(elegida(), 0);
  assert.equal(tecla(tabs[0], "a"), false, "otras teclas no hacen nada");
  tabs[2].disparar("click"); assert.equal(elegida(), 2); assert.deepEqual(visibles(), [false, false, true, false]);
  assert.deepEqual(tabs.map(t => t.tabIndex), [-1, -1, 0, -1]);
  // «Quiero sumarme al piloto» (arriba) o el pizarrón piden mostrar #sumarse: se abre «Sumate».
  docL["puente:mostrar"].forEach(f => f({ detail: sumarse }));
  assert.equal(elegida(), 3);
});

test("el pizarrón abre la pestaña del formulario antes de bajar a él", () => {
  const js = leer("pizarron.js");
  const i = js.indexOf('const d = $("sumarse")');
  assert.ok(i > 0 && js.indexOf('new CustomEvent("puente:mostrar", { detail: d })', i) > i);
  assert.ok(js.indexOf("puente:mostrar", i) < js.indexOf("d.scrollIntoView", i));
});

test("inglés: las pestañas y los títulos de sección también están traducidos", () => {
  const en = leer("en/index.html");
  for (const t of ["Teachers and schools</button>", "Families</button>", "Communicator</button>", "Get involved</button>", 'aria-label="Puente for each of you" hidden']) assert.ok(en.includes(t), t);
  assert.ok(en.includes('id="btnIrPiloto" href="#sumarse">Join the pilot</a>'));
});

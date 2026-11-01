// Páginas: pie común (BETA, legales, ARASAAC, donaciones) en todas, sin donaciones en el espacio de la familia.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const PAGINAS = fs.readdirSync(RAIZ).filter(f => f.endsWith(".html"));
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("todas las páginas cargan el pie común", () => {
  for (const p of ["index.html", "login.html", "docente.html", "familia.html", "presentacion.html", "privacidad.html", "terminos.html"]) assert.ok(PAGINAS.includes(p), p);
  for (const p of PAGINAS) {
    const h = leer(p);
    assert.ok(h.includes('id="puente-pie"'), `${p} sin pie`);
    assert.ok(h.includes('src="pie.js"'), `${p} sin pie.js`);
  }
});

test("el pie lleva BETA, links legales y el crédito ARASAAC completo", () => {
  const js = leer("pie.js");
  assert.ok(js.includes("BETA"));
  assert.ok(js.includes('href="privacidad.html"') && js.includes('href="terminos.html"'));
  assert.ok(js.includes("Autor pictogramas: Sergio Palao. Origen: ARASAAC (") && js.includes("Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España)"));
});

test("donaciones: nunca en el espacio de la familia ni hardcodeadas; dos botones con sus textos", () => {
  assert.match(leer("familia.html"), /id="puente-pie"[^>]*data-donaciones="no"/);
  for (const p of PAGINAS) assert.equal(/sponsors\/|mercadopago|cafecito|paypal\.me/i.test(leer(p)), false, p);
  const js = leer("pie.js");
  assert.ok(js.includes("Doná desde Argentina") && js.includes("Donate from abroad"));
  assert.ok(js.includes("Puente es gratuito y sin fines de lucro. Las donaciones cubren servidores e IA."));
  assert.ok(js.includes("Puente is free and non-profit."));
  assert.ok(js.includes('fetch("api/config"'));
  assert.equal(/https:\/\/[^"'`\s]*(sponsor|don)/i.test(js), false);
});

test("páginas legales: marcadas como borrador, con terceros, derechos y contacto", () => {
  const p = leer("privacidad.html");
  for (const t of ["BORRADOR", "Vercel", "Neon", "Resend", "OpenRouter", "ARASAAC", "fuera de Argentina", "acceso", "rectificación", "supresión", "[CONTACTO]"]) assert.ok(p.includes(t), t);
  assert.ok(p.includes(require("../api/_lib/legal").VERSION_PRIVACIDAD));
  assert.ok(leer("terminos.html").includes("BORRADOR"));
  assert.ok(leer("familia.html").includes('href="privacidad.html"'));
});

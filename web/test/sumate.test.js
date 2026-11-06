// Portada: sección «Sumate a Puente» (tester Android por mail, piloto, donaciones desde /api/config) sin API ni analítica nueva.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("«Sumate a Puente»: antes de «Quién hace Puente», mailto de tester, ancla al piloto, donaciones solo desde config y link al código", () => {
  const s = h.indexOf('id="sumate"');
  assert.ok(s > 0 && s < h.indexOf('id="quien"'), "va antes de «Quién hace Puente»");
  assert.ok(s > h.indexOf("<!-- /tarjetas -->"), "después de las tarjetas del piloto");
  assert.match(h, /id="btnTester" href="mailto:soporte@puentepictos\.app\?subject=Tester%20Android&amp;body=[^"]*cuenta%20de%20Google[^"]*">Quiero ser tester<\/a>/);
  assert.match(h, /id="btnIrPiloto" href="#sumarse">Quiero sumarme al piloto<\/a>/);
  assert.ok(h.includes('id="sumarse"'), "el formulario del piloto existe");
  for (const t of ["12 personas", "14 días", "15 cupos", "Santa Fe", "A las familias nunca se les cobra."]) assert.ok(h.includes(t), t);
  // Donaciones: una sola vía (la sección), sin URL escrita, oculta hasta que /api/config trae un link https.
  assert.match(h, /<div class="card" id="sumateDonar" hidden>/);
  assert.match(h, /<div id="puente-pie" data-donaciones="no"><\/div>/);
  assert.ok(h.includes('fetch("api/config"') && h.includes("Doná desde Argentina") && h.includes("Donate from abroad"));
  assert.equal(/cafecito|mercadopago|paypal/i.test(h), false);
  assert.ok(h.includes('href="https://github.com/dannyvergel/mi-dia-en-pictos"') && h.includes("AGPL-3.0"));
  // Sin analítica nueva ni API nueva.
  assert.deepEqual([...h.matchAll(/window\.va\("event"/g)].length, 1);
  assert.deepEqual([...new Set([...h.matchAll(/fetch\("(api\/\w+)"/g)].map(m => m[1]))].sort(), ["api/auth", "api/config", "api/solicitudes"]);
  // Sin frases de folleto.
  const sec = h.slice(s, h.indexOf("</section>", s));
  assert.equal(/potenci|transform|revolucion|empoder|experiencia única|granito|¡|—/i.test(sec), false);
});

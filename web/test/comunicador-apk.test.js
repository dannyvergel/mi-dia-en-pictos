// App Android aparte para el Comunicador: manifest propio, assetlinks con los dos paquetes y APK descargable.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const HUELLA = "E5:E5:B5:76:DE:86:BB:A1:47:BA:20:47:3E:0F:8D:A6:95:EF:A2:39:13:A6:A9:92:0F:DF:0F:CD:F3:BA:7C:00";

test("comunicador.webmanifest: «Puente Comunicador», abre directo en el tablero, orientación libre e íconos PNG", () => {
  const m = JSON.parse(leer("comunicador.webmanifest"));
  assert.equal(m.name, "Puente Comunicador");
  assert.equal(m.short_name, "Puente Comunicador", "así se lee debajo del ícono");
  assert.ok(m.start_url.startsWith("/comunicador.html"));
  assert.ok(m.start_url.startsWith(m.scope), "start_url dentro del scope");
  assert.notEqual(m.id, JSON.parse(leer("manifest.json")).id, "id distinto al de Puente: se instalan como dos apps");
  assert.ok(["standalone", "fullscreen"].includes(m.display));
  assert.equal(m.orientation, "any");
  for (const [tam, prop] of [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]) {
    const i = m.icons.find(x => x.sizes === tam && x.purpose === prop && x.type === "image/png");
    assert.ok(i && fs.existsSync(path.join(RAIZ, i.src)), `falta ícono ${tam} ${prop}`);
  }
});

test("comunicador.html enlaza su manifest (no el general) y un link discreto a la APK solo en Android", () => {
  const h = leer("comunicador.html");
  assert.ok(h.includes('<link rel="manifest" href="comunicador.webmanifest">'));
  assert.equal(h.includes('href="manifest.json"'), false);
  assert.ok(h.includes('href="/descargar/comunicador.apk"'));
  assert.ok(/id="comApk" hidden/.test(h), "oculto por defecto");
  assert.ok(h.includes("/Android/i.test(navigator.userAgent)"));
});

test("assetlinks: mismo certificado para app.puentepictos.twa y app.puentepictos.comunicador", () => {
  const a = JSON.parse(leer(".well-known/assetlinks.json"));
  for (const pkg of ["app.puentepictos.twa", "app.puentepictos.comunicador"]) {
    const e = a.find(x => x.target.package_name === pkg);
    assert.ok(e, pkg);
    assert.equal(e.target.namespace, "android_app");
    assert.deepEqual(e.relation, ["delegate_permission/common.handle_all_urls"]);
    assert.deepEqual(e.target.sha256_cert_fingerprints, [HUELLA]);
  }
});

test("APKs en /descargar con su nombre de archivo y sin caché del SW", () => {
  for (const f of ["puente.apk", "comunicador.apk"]) assert.ok(fs.statSync(path.join(RAIZ, "descargar", f)).size > 100000, f);
  const v = JSON.parse(leer("vercel.json"));
  for (const n of ["puente", "comunicador"]) {
    const h = v.headers.find(x => x.source === `/descargar/${n}.apk`);
    assert.ok(h, n);
    assert.ok(h.headers.some(x => x.key === "Content-Disposition" && x.value.includes(`filename="${n}.apk"`)));
  }
  assert.ok(leer("sw.js").includes("/^\\/(api|descargar)\\//"));
});

test("portada: bloque visible del Comunicador arriba (abrir, inglés y APK) y la APK de Puente para quienes ya están en el piloto", () => {
  const h = leer("index.html");
  const bloque = h.indexOf('id="comunicador"');
  assert.ok(bloque > 0, "hay bloque del Comunicador");
  assert.ok(bloque < h.indexOf("Cómo funciona</h3>"), "va antes de «Cómo funciona», a la vista");
  assert.match(h, /<a class="big" id="btnComunicador" href="comunicador\.html">Abrir el Comunicador<\/a>/);
  assert.match(h, /id="btnComApk" href="\/descargar\/comunicador\.apk" download>Bajar la app para Android<\/a>/);
  assert.ok(h.includes('href="comunicador.html?lang=en" hreflang="en"'));
  assert.ok(h.includes("todavía no está en Google Play"));
  assert.match(h, /href="\/descargar\/puente\.apk" id="linkPuenteApk" download>/);
  assert.ok(h.includes('href="https://github.com/dannyvergel/mi-dia-en-pictos"'));
  // Sin analítica nueva: solo el evento del piloto que ya existía.
  assert.deepEqual([...h.matchAll(/window\.va\("event", \{ name: "(\w+)"/g)].map(m => m[1]), ["sumarse_piloto"]);
});

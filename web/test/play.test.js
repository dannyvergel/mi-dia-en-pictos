// Google Play: assetlinks con huellas válidas (sideload + Play App Signing), ficha dentro de los límites,
// gráficos con los tamaños que pide Play, página de borrado de cuenta y nada de claves en el repo.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const WEB = path.join(__dirname, "..");
const REPO = path.join(WEB, "..");
const PLAY = path.join(REPO, "docs", "play");
const leer = (...p) => fs.readFileSync(path.join(...p), "utf8");
const HUELLA_SIDELOAD = "E5:E5:B5:76:DE:86:BB:A1:47:BA:20:47:3E:0F:8D:A6:95:EF:A2:39:13:A6:A9:92:0F:DF:0F:CD:F3:BA:7C:00";
const FORMATO = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

test("assetlinks: JSON válido, huella de sideload siempre y a lo sumo una más (Play App Signing), sin placeholders", () => {
  const a = JSON.parse(leer(WEB, ".well-known", "assetlinks.json"));
  assert.ok(Array.isArray(a) && a.length >= 1);
  for (const e of a) {
    const h = e.target.sha256_cert_fingerprints;
    assert.ok(h.length >= 1 && h.length <= 2, `${e.target.package_name}: 1 o 2 huellas`);
    for (const x of h) assert.match(x, FORMATO, `${e.target.package_name}: huella mal formada (¿quedó el texto de ejemplo?): ${x}`);
    assert.ok(h.includes(HUELLA_SIDELOAD), `${e.target.package_name}: falta la huella de sideload`);
    assert.equal(new Set(h).size, h.length, "huellas repetidas");
  }
});

function bloque(md, campo) {
  const m = md.match(new RegExp("<!-- " + campo + " -->\\s*```\\n([\\s\\S]*?)\\n```"));
  assert.ok(m, `ficha.md: falta el bloque ${campo}`);
  return m[1];
}

test("ficha de Play: nombre ≤ 30, corta ≤ 80, larga ≤ 4000 caracteres, con contacto y privacidad", () => {
  const md = leer(PLAY, "ficha.md");
  const largo = s => [...s].length;
  assert.ok(largo(bloque(md, "nombre").trim()) <= 30, "nombre");
  assert.ok(largo(bloque(md, "corta").trim()) <= 80, "descripción corta");
  assert.ok(largo(bloque(md, "larga")) <= 4000, "descripción larga");
  assert.ok(md.includes("soporte@puentepictos.app"));
  assert.ok(md.includes("https://puentepictos.app/privacidad.html"));
  assert.ok(bloque(md, "larga").includes("ARASAAC"), "crédito ARASAAC en la descripción");
});

function png(f) {
  const b = fs.readFileSync(f);
  assert.equal(b.toString("ascii", 12, 16), "IHDR", f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), tipo: b[25], kb: b.length / 1024 };
}

test("gráficos de Play: ícono 512×512, gráfico de funciones 1024×500 sin transparencia, 4 a 8 capturas 9:16", () => {
  const i = png(path.join(PLAY, "icono-play-512.png"));
  assert.deepEqual([i.w, i.h], [512, 512]); assert.ok(i.kb < 1024);
  const f = png(path.join(PLAY, "feature-graphic-1024x500.png"));
  assert.deepEqual([f.w, f.h], [1024, 500]); assert.equal(f.tipo, 2, "RGB sin alfa");
  const caps = fs.readdirSync(path.join(PLAY, "capturas")).filter(x => x.endsWith(".png"));
  assert.ok(caps.length >= 4 && caps.length <= 8, `${caps.length} capturas`);
  for (const c of caps) { const p = png(path.join(PLAY, "capturas", c)); assert.equal(p.w * 16, p.h * 9, c); }
});

test("página pública para borrar la cuenta (URL de Data safety) con pie y contacto", () => {
  const h = leer(WEB, "borrar-cuenta.html");
  assert.ok(h.includes("soporte@puentepictos.app"));
  assert.ok(h.includes('id="puente-pie"') && h.includes('src="pie.js"'));
  assert.ok(h.includes('rel="manifest"') && h.includes('rel="apple-touch-icon"'));
  assert.ok(h.includes("Pedir la baja y borrar mis datos"), "nombra el botón real del espacio de la familia");
  assert.ok(leer(WEB, "familia.html").includes("Pedir la baja y borrar mis datos"));
  assert.ok(leer(WEB, "sitemap.xml").includes("https://puentepictos.app/borrar-cuenta.html"));
});

test("dentro de la app instalada (?app / TWA) el pie no pide donaciones", () => {
  const js = leer(WEB, "pie.js");
  assert.ok(js.includes('document.referrer.startsWith("android-app://")'));
  assert.match(js, /const sinDonaciones = enApp \|\|/);
});

test("ninguna clave de firma en el repo", () => {
  const gi = leer(REPO, ".gitignore");
  for (const p of ["*.keystore", "*.jks", "signing-key-info.txt"]) assert.ok(gi.includes(p), p);
  const malos = [];
  const recorrer = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) recorrer(p); else if (/\.(keystore|jks|p12)$|signing-key-info/i.test(e.name)) malos.push(p);
  } };
  recorrer(path.join(REPO, "android-entrega"));
  assert.deepEqual(malos, []);
  assert.ok(fs.statSync(path.join(REPO, "android-entrega", "play", "puente-play-1.0.2-vc3.aab")).size > 100000);
});

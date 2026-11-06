// Páginas: pie común (BETA, legales, ARASAAC, donaciones) en todas, sin donaciones en el espacio de la familia.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const PAGINAS = fs.readdirSync(RAIZ).filter(f => f.endsWith(".html"));
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("todas las páginas cargan el pie común", () => {
  for (const p of ["index.html", "cuaderno.html", "admin.html", "login.html", "docente.html", "familia.html", "presentacion.html", "privacidad.html", "terminos.html"]) assert.ok(PAGINAS.includes(p), p);
  for (const p of PAGINAS) {
    const h = leer(p);
    assert.ok(h.includes('id="puente-pie"'), `${p} sin pie`);
    assert.match(h, /src="\/?pie\.js"/, `${p} sin pie.js`); // 404.html usa /pie.js (se sirve en cualquier ruta)
  }
});

test("el pie lleva BETA, links legales y el crédito ARASAAC completo", () => {
  const js = leer("pie.js");
  assert.ok(js.includes("BETA"));
  // Links legales al idioma de la página: /privacidad.html o /en/privacidad.html
  assert.ok(js.includes('base = EN ? "/en/" : "/"'));
  assert.ok(js.includes('href="${base}privacidad.html"') && js.includes('href="${base}terminos.html"'));
  assert.ok(js.includes("Autor pictogramas: Sergio Palao. Origen: ARASAAC (") && js.includes("Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España)"));
  // Crédito ARASAAC también en inglés
  assert.ok(js.includes("Pictograms by Sergio Palao. Source: ARASAAC (") && js.includes("License: CC BY-NC-SA. Owner: Government of Aragón (Spain)."));
});

test("donaciones: nunca en el espacio de la familia ni hardcodeadas; dos botones con sus textos", () => {
  assert.match(leer("familia.html"), /id="puente-pie"[^>]*data-donaciones="no"/);
  for (const p of PAGINAS) assert.equal(/sponsors\/|mercadopago|cafecito|paypal\.me/i.test(leer(p)), false, p);
  const js = leer("pie.js");
  assert.ok(js.includes("Doná desde Argentina") && js.includes("Donate from abroad"));
  assert.ok(js.includes("Puente es gratuito y sin fines de lucro. Las donaciones cubren servidores e IA."));
  assert.ok(js.includes("Puente is free and non-profit."));
  assert.ok(js.includes('fetch("/api/config"'));
  assert.equal(/https:\/\/[^"'`\s]*(sponsor|don)/i.test(js), false);
});

test("páginas legales: marcadas como borrador, con terceros, derechos y contacto", () => {
  const p = leer("privacidad.html");
  for (const t of ["BORRADOR", "Vercel", "Neon", "Resend", "OpenRouter", "ARASAAC", "fuera de Argentina", "acceso", "rectificación", "supresión", "soporte@puentepictos.app"]) assert.ok(p.includes(t), t);
  assert.ok(p.includes(require("../api/_lib/legal").VERSION_PRIVACIDAD));
  assert.ok(leer("terminos.html").includes("BORRADOR"));
  assert.ok(leer("familia.html").includes('href="privacidad.html"'));
});

test("portada (index.html): explica Puente, botones Entrar y Soy familia, tira de pictos ARASAAC y meta tags para compartir", () => {
  const h = leer("index.html");
  for (const t of ["La seño dicta cómo fue el día", "pictogramas", "la familia lo ve en casa", "educación especial", "Gratuito y sin fines de lucro", "Piloto con invitación"]) assert.ok(h.includes(t), t);
  assert.match(h, /<a class="[^"]*" id="btnEntrar" href="login\.html">Entrar<\/a>/);
  assert.match(h, /href="login\.html\?familia">Soy familia<\/a>/);
  for (const m of ['property="og:title"', 'property="og:description"', 'property="og:image"', 'property="og:url"', 'name="twitter:card"', 'name="description"']) assert.ok(h.includes(m), m);
  // Pictos reales de ARASAAC (los mismos ids que usa la presentación), sin URLs inventadas.
  const pictos = [...h.matchAll(/https:\/\/static\.arasaac\.org\/pictograms\/(\d+)\/(\d+)_300\.png/g)];
  assert.ok(pictos.length >= 6); assert.ok(pictos.every(m => m[1] === m[2]));
  assert.equal(/id="pinGate"|id="btnEnviar"/.test(h), false, "la portada ya no es el Cuaderno del día");
});

test("el Cuaderno del día se movió a cuaderno.html y los links siguen andando", () => {
  const c = leer("cuaderno.html");
  assert.ok(c.includes('id="btnEnviar"') && c.includes("login.html?volver=cuaderno"));
  assert.ok(leer("docente.html").includes('href="cuaderno.html"'));
  assert.match(leer("login.html"), /"volver"\) === "cuaderno" \? "cuaderno\.html"/);
  assert.ok(leer("sw.js").includes("'cuaderno.html'"));
  assert.equal(JSON.parse(leer("manifest.json")).start_url, "/login.html?app");
  // El login de familias, los links de invitación (#invitacion=) y familia.html no cambian.
  assert.ok(leer("login.html").includes("#invitacion=") && leer("login.html").includes('location.search.includes("familia")'));
});

test("login: el alta inicial ya no tiene buscador de escuelas (queda en el panel admin)", () => {
  const l = leer("login.html");
  assert.equal(/sEscuela|acSetup/.test(l), false);
  assert.ok(l.includes("soEscuela")); // el formulario de solicitud (si se reabre) conserva el suyo
  const a = leer("admin.html");
  assert.ok(a.includes("autocompletarEscuela") && a.includes("crear_escuela"));
});

test("panel admin: separado del panel docente, sin «hacer plataforma»", () => {
  const a = leer("admin.html"), d = leer("docente.html");
  assert.ok(a.includes("es_plataforma") && a.includes('id="sinAcceso"'));
  for (const t of ["api/escuelas?todas=1", "api/docentes?invitaciones=1", "api/auditoria", "api/feedback", "api/solicitudes"]) assert.ok(a.includes(t), t);
  assert.equal(/accion: "plataforma"|hacer plataforma|tabEscs|cargarEscuelas/.test(d), false);
  assert.equal(/accion: "plataforma"/.test(a), false);
});

test("portada: \"Quiero sumarme al piloto\" es un formulario real (no solo mailto) contra api/solicitudes, con trampa y mailto alternativo", () => {
  const h = leer("index.html");
  assert.match(h, /<details[^>]*id="sumarse"/);
  assert.match(h, /<summary[^>]*id="btnSumarse"[^>]*>Quiero sumarme al piloto<\/summary>/);
  assert.equal(/id="btnSumarse"[^>]*href="mailto:/.test(h), false);
  for (const id of ["suNombre", "suEmail", "suEscuela", "suLugar", "suRol", "suAlumnos", "suWeb"]) {
    assert.ok(h.includes(`id="${id}"`), id);
    if (id !== "suWeb") assert.ok(h.includes(`<label for="${id}"`), "label " + id);
  }
  assert.match(h, /class="trampa" aria-hidden="true"/);
  assert.match(h, /id="suWeb"[^>]*tabindex="-1"/);
  assert.ok(h.includes('fetch("api/solicitudes"') && h.includes('accion: "crear"') && h.includes("sitio_web"));
  assert.ok(h.includes("Gracias. Te escribimos a tu mail."));
  assert.ok(h.includes('href="mailto:soporte@puentepictos.app'));
  assert.match(h, /aria-live="polite"/);
});

test("admin: la plataforma ve las solicitudes de la portada", () => {
  const a = leer("admin.html");
  assert.ok(a.includes('id="listaSol"') && a.includes('data-a="aprobar"') && a.includes('data-a="rechazar"'));
  assert.ok(a.includes("Quiero sumarme al piloto"));
});

test("PWA instalable: manifest con íconos PNG (192, 512 y maskable) y enlazado en todas las páginas", () => {
  const fs = require("fs"), path = require("path");
  const m = JSON.parse(leer("manifest.json"));
  assert.equal(m.display, "standalone");
  assert.equal(m.scope, "/");
  for (const [tam, prop] of [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]) {
    const i = m.icons.find(x => x.sizes === tam && x.purpose === prop && x.type === "image/png");
    assert.ok(i, `falta ícono ${tam} ${prop}`);
    assert.ok(fs.existsSync(path.join(__dirname, "..", i.src)), i.src);
  }
  for (const f of ["index.html", "cuaderno.html", "familia.html", "docente.html", "login.html", "admin.html", "privacidad.html", "terminos.html", "presentacion.html"]) {
    const h = leer(f);
    assert.ok(h.includes('rel="manifest"') && h.includes('rel="apple-touch-icon"'), f);
  }
  assert.ok(leer("pie.js").includes('serviceWorker.register("/sw.js")'));
});

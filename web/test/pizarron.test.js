// «Preguntale al pizarrón» (pizarron.js): FAQ curado, matching sin IA y presencia en la portada.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const P = require("../pizarron.js");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("el FAQ está cargado: 12 a 15 preguntas con respuesta, claves e ids únicos", () => {
  assert.ok(P.FAQ.length >= 12 && P.FAQ.length <= 15, `hay ${P.FAQ.length}`);
  const ids = new Set();
  for (const f of P.FAQ) {
    assert.ok(f.id && !ids.has(f.id), f.id); ids.add(f.id);
    assert.match(f.pregunta, /^¿.+\?$/);
    assert.ok(f.respuesta.length > 40 && f.respuesta.length < 420, f.id);
    assert.ok(Array.isArray(f.claves) && f.claves.length >= 3, f.id);
  }
  for (const id of P.SUGERIDAS) assert.ok(ids.has(id), id);
});

test("el FAQ dice los hechos clave de Puente (sin inventar)", () => {
  const todo = P.FAQ.map(f => f.respuesta).join("\n");
  for (const t of ["educación especial", "pictogramas de ARASAAC", "gratuito y sin fines de lucro", "15 cupos", "link de invitación",
    "«Quiero sumarme al piloto»", "nombre de pila", "sin fotos", "sin diagnósticos", "consentimiento", "no guardan ni entrenan",
    "Sergio Palao", "Gobierno de Aragón", "CC BY-NC-SA", "Santa Fe", "Google", "código de 6 números", "soporte@puentepictos.app", "pedir la baja"])
    assert.ok(todo.includes(t), t);
  // Las URLs de donación no se escriben en el código: salen de /api/config.
  assert.equal(/https:\/\/[^"'`\s]*(cafecito|sponsor|mercadopago|paypal)/i.test(leer("pizarron.js")), false);
});

test("normaliza tildes, mayúsculas y signos", () => {
  assert.equal(P.normalizar("¿Cuánto CUESTA, seño?"), "cuanto cuesta seno");
  assert.deepEqual(P.canonizar("¿Es gratuito?"), ["es", "gratis"]);
});

test("el matching responde las preguntas clave (con sinónimos y sin tildes)", () => {
  const casos = {
    "¿Qué es Puente?": "que-es", "de que se trata": "que-es",
    "para quien es": "para-quien", "¿sirve para chicos con autismo?": "para-quien",
    "¿Cómo funciona?": "como-funciona",
    "cuanto cuesta": "gratis", "¿es gratis?": "gratis", "¿cobran algo?": "gratis",
    "como me sumo al piloto": "sumarse", "quiero participar con mi escuela": "sumarse", "¿cuántos cupos hay?": "sumarse",
    "que datos guardan de mi hijo": "datos", "¿suben fotos?": "datos",
    "la IA guarda los datos?": "ia", "¿usan inteligencia artificial?": "ia",
    "como borro mis datos": "baja", "quiero darme de baja": "baja",
    "de donde salen los pictogramas": "pictos", "quien hizo los dibujos": "pictos",
    "¿funciona en Córdoba?": "lugar", "¿está en Santa Fe?": "lugar",
    "como puedo donar": "donar", "quiero colaborar": "donar",
    "¿cómo entro?": "entrar", "no tengo contraseña": "entrar", "me llegó un link de invitación, ¿cómo entro?": "entrar",
    "¿qué ve la familia?": "familia-ve",
    "¿hay que instalar algo?": "instalar", "¿funciona en el celular?": "instalar",
    "mail de contacto": "contacto",
  };
  for (const [q, id] of Object.entries(casos)) assert.equal(P.responder(q).id, id, q);
});

test("saludo, gracias, «¿sos una IA?» y lo que no entiende: respuesta amable con el formulario y soporte", () => {
  assert.equal(P.responder("Hola!").id, "saludo");
  assert.equal(P.responder("gracias").id, "gracias");
  assert.equal(P.responder("¿sos una IA?").id, "quien");
  for (const q of ["asdf qwer", "¿cuál es la capital de Francia?", "", "   "]) {
    const r = P.responder(q);
    assert.equal(r.id, "nose", q);
    assert.ok(r.respuesta.includes("soporte@puentepictos.app"));
    assert.ok(r.acciones.some(a => a.accion === "sumarse"));
  }
});

test("la portada incluye el pizarrón: sección, script, accesibilidad y la lista sin JS igual al FAQ", () => {
  const h = leer("index.html");
  assert.ok(h.includes('id="preguntale"') && h.includes("Preguntale al pizarrón"));
  assert.ok(h.includes('<script src="pizarron.js" defer></script>'));
  assert.match(h, /id="pzVivo"[^>]*aria-live="polite"/);
  assert.match(h, /<label for="pzPregunta"/);
  assert.match(h, /<details class="pz-todas" id="pzTodas" open>/); // sin JS se ve la lista entera
  assert.match(h, /id="pzForm" hidden/); // el formulario aparece solo con JS
  for (const f of P.FAQ) { assert.ok(h.includes(`<dt>${f.pregunta}</dt>`), f.pregunta); assert.ok(h.includes(`<dd>${f.respuesta}</dd>`), f.id); }
  // Nada de IA ni API en el pizarrón: no hace fetch salvo /api/config para el botón de donación.
  const js = leer("pizarron.js");
  assert.deepEqual([...js.matchAll(/fetch\("([^"]+)"/g)].map(m => m[1]), ["api/config"]);
  assert.equal(/openrouter\.ai|api\/agente|api\/familia/.test(js), false);
  // «Escuchar» nunca es automático: speak() solo dentro del click.
  assert.equal((js.match(/speechSynthesis\.speak\(/g) || []).length, 1);
  assert.ok(leer("sw.js").includes("'pizarron.js'"));
});

test("pulido: foco visible, movimiento reducido y tamaño táctil en el estilo común", () => {
  const css = leer("estilo.css");
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.ok(css.includes("--toque: 44px"));
  for (const p of ["index.html", "login.html", "cuaderno.html", "docente.html", "familia.html", "admin.html"]) assert.ok(leer(p).includes('class="saltar"'), p);
});

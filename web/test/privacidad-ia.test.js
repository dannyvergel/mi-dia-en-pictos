// Privacy filter for LLM calls: aliasing of names and redaction of contact data.
// Synthetic corpus only: every name, phone, email and ID below is invented.
const test = require("node:test");
const assert = require("node:assert/strict");
const { protegerEntrada, protegerMensajes, restaurarSalida } = require("../api/_lib/privacidad-ia");

const proteger = (texto, opts) => protegerEntrada(texto, opts).texto;

test("aliases the full name and each name part with one neutral alias", () => {
  const r = protegerEntrada("Lucía Ferrer llegó contenta. Lucía pintó y Ferrer jugó.", { alumno: "Lucía Ferrer" });
  assert.equal(r.texto, "Alumno A llegó contenta. Alumno A pintó y Alumno A jugó.");
  assert.deepEqual(r.mapa, [{ alias: "Alumno A", real: "Lucía Ferrer" }]);
});

test("is case- and accent-insensitive in both directions", () => {
  assert.equal(proteger("lucia y LUCÍA y Lucia", { alumno: "Lucía" }), "Alumno A y Alumno A y Alumno A");
  assert.equal(proteger("Lucía vino", { alumno: "LUCIA" }), "Alumno A vino");
});

test("handles decomposed accents (NFD) in the text", () => {
  const nfd = "Lucía".normalize("NFD");
  assert.equal(proteger(`${nfd} vino`, { alumno: "Lucía" }), "Alumno A vino");
});

test("only whole words: a name inside another word is left alone", () => {
  assert.equal(proteger("Ana, Mariana y Anatolio; también ANA.", { alumno: "Ana" }), "Alumno A, Mariana y Anatolio; también Alumno A.");
  assert.equal(proteger("Los Ferreros", { alumno: "Ferrer" }), "Los Ferreros");
});

test("name particles (de, del, la) are not aliased on their own", () => {
  const r = proteger("María de los Ángeles fue a la plaza de Rosario", { alumno: "María de los Ángeles Paz" });
  assert.equal(r, "Alumno A fue a la plaza de Rosario");
});

test("the real name is used by every variant passed for the same student", () => {
  const r = protegerEntrada("Juan y Juan Pérez", { alumno: ["Juan Pérez", "Juan"] });
  assert.equal(r.texto, "Alumno A y Alumno A");
  assert.equal(r.mapa.length, 1);
  assert.equal(r.mapa[0].real, "Juan Pérez");
});

test("other people given by the caller get their own alias", () => {
  const r = protegerEntrada("Marta Ruiz habló con Pedro sobre Lucía", { alumno: "Lucía", otros: ["Marta Ruiz", "Pedro"] });
  assert.equal(r.texto, "Persona A habló con Persona B sobre Alumno A");
  assert.deepEqual(r.mapa.map(m => m.real), ["Lucía", "Marta Ruiz", "Pedro"]);
});

test("redacts Argentine phone formats", () => {
  const casos = ["+54 9 341 555-1234", "341 555 1234", "(0341) 555-1234", "0341-155123456", "11 5555-1234", "3415551234", "+5493415551234", "341.555.1234"];
  for (const c of casos) {
    const t = proteger(`Llamar al ${c} por favor`, {});
    assert.equal(t, "Llamar al [teléfono] por favor", c);
  }
});

test("redacts emails", () => {
  assert.equal(proteger("Escribir a mama.perez+hijo@mail.com.ar mañana", {}), "Escribir a [email] mañana");
  assert.equal(proteger("MAIL: Papa_01@Correo.org.", {}), "MAIL: [email].");
});

test("redacts ID-like digit sequences (DNI, CUIL)", () => {
  assert.equal(proteger("DNI 30123456 del alumno", {}), "DNI [documento] del alumno");
  assert.equal(proteger("DNI 30.123.456 del alumno", {}), "DNI [documento] del alumno");
  assert.equal(proteger("CUIL 20-30123456-7.", {}), "CUIL [documento].");
});

test("redacts URLs but keeps the sentence punctuation", () => {
  assert.equal(proteger("Mirá https://ejemplo.test/perfil?id=7, o www.ejemplo.test/x.", {}), "Mirá [enlace], o [enlace].");
});

test("keeps dates, times and short numbers", () => {
  const t = "El 2026-10-28 09:30 y el 28/10/2026 hubo 3 actividades y 12 pictogramas";
  assert.equal(proteger(t, {}), t);
});

test("a date directly followed by a time is not swallowed as a phone number", () => {
  assert.equal(proteger("2026-10-28 09:30", {}), "2026-10-28 09:30");
});

test("name aliasing and redaction work together; an email with the name is redacted whole", () => {
  const r = proteger("Lucía (lucia.ferrer@mail.com, 341 555 1234) pintó", { alumno: "Lucía Ferrer" });
  assert.equal(r, "Alumno A ([email], [teléfono]) pintó");
});

test("restores the real name inside nested JSON strings without breaking the JSON", () => {
  const { mapa } = protegerEntrada("Lucía", { alumno: "Lucía \"Lu\" Ferrer" });
  const salida = { alumno: "Alumno A", actividades: [{ actividad: "Alumno A pintó", otras: ["con alumno a"] }], n: 3, ok: true, nada: null,
    anidado: { resumen: "Hoy Alumno A estuvo bien." } };
  const r = restaurarSalida(salida, mapa);
  assert.equal(r.alumno, "Lucía \"Lu\" Ferrer");
  assert.equal(r.actividades[0].actividad, "Lucía \"Lu\" Ferrer pintó");
  assert.equal(r.actividades[0].otras[0], "con Lucía \"Lu\" Ferrer");
  assert.equal(r.anidado.resumen, "Hoy Lucía \"Lu\" Ferrer estuvo bien.");
  assert.equal(r.n, 3); assert.equal(r.ok, true); assert.equal(r.nada, null);
  assert.equal(salida.alumno, "Alumno A", "does not mutate the input");
});

test("restores inside a JSON text keeping it valid JSON", () => {
  const { mapa } = protegerEntrada("x", { alumno: "Lucía \"Lu\" Ferrer" });
  const crudo = JSON.stringify({ a: "Alumno A vino" });
  const r = restaurarSalida(crudo, mapa);
  assert.deepEqual(JSON.parse(r), { a: "Lucía \"Lu\" Ferrer vino" });
});

test("restore does not touch partial words, and keeps `$` in names literal", () => {
  const { mapa } = protegerEntrada("x", { alumno: "Lu$1 Gómez" });
  assert.equal(restaurarSalida("Alumno A y Alumno Alto", mapa), "Lu$1 Gómez y Alumno Alto");
});

test("alias collision: a text that already contains 'Alumno A' gets another alias", () => {
  const r = protegerEntrada("El Alumno A del otro grupo jugó con Lucía", { alumno: "Lucía" });
  assert.equal(r.texto, "El Alumno A del otro grupo jugó con Alumno B");
  assert.deepEqual(r.mapa, [{ alias: "Alumno B", real: "Lucía" }]);
  assert.equal(restaurarSalida("Alumno B sonrió", r.mapa), "Lucía sonrió");
});

test("alias collision is detected across all messages of a call", () => {
  const { mensajes, mapa } = protegerMensajes([
    { role: "system", content: "Hablás con la familia de Lucía" },
    { role: "user", content: "¿Y el Alumno A de la otra sala?" }], { alumno: "Lucía" });
  assert.equal(mapa[0].alias, "Alumno B");
  assert.equal(mensajes[0].content, "Hablás con la familia de Alumno B");
});

test("empty and non-string inputs never throw", () => {
  for (const v of [null, undefined, "", 0, 42, {}, []]) {
    const r = protegerEntrada(v, { alumno: "Lucía" });
    assert.equal(typeof r.texto, "string");
  }
  assert.equal(protegerEntrada(null).texto, "");
  assert.equal(protegerEntrada(42, {}).texto, "42");
  assert.equal(protegerEntrada("hola", { alumno: "" }).texto, "hola");
  assert.equal(protegerEntrada("hola", { alumno: null }).texto, "hola");
  assert.equal(protegerEntrada("hola", { alumno: ["", "  ", 5, null] }).texto, "hola");
  assert.equal(protegerEntrada("hola").texto, "hola");
  assert.equal(restaurarSalida(null, []), null);
  assert.equal(restaurarSalida(undefined, undefined), undefined);
  assert.equal(restaurarSalida(7, [{ alias: "Alumno A", real: "Lucía" }]), 7);
  assert.equal(restaurarSalida("Alumno A", undefined), "Alumno A");
});

test("messages: strings, null content and tool-call arguments are protected; roles are kept", () => {
  const msgs = [
    { role: "system", content: "Familia de Lucía" },
    { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "leer", arguments: "{\"q\":\"Lucía\"}" } }] },
    { role: "tool", tool_call_id: "t1", content: "{\"tel\":\"341 555 1234\"}" }];
  const { mensajes, mapa } = protegerMensajes(msgs, { alumno: "Lucía" });
  assert.equal(mensajes[0].content, "Familia de Alumno A");
  assert.equal(mensajes[1].content, null);
  assert.equal(mensajes[1].tool_calls[0].function.arguments, "{\"q\":\"Alumno A\"}");
  assert.equal(mensajes[1].tool_calls[0].id, "t1");
  assert.equal(mensajes[2].content, "{\"tel\":\"[teléfono]\"}");
  assert.equal(mensajes[2].role, "tool");
  assert.equal(msgs[0].content, "Familia de Lucía", "does not mutate the input");
  assert.equal(mapa.length, 1);
});

test("messages: non-array input gives an empty list", () => {
  assert.deepEqual(protegerMensajes(null, { alumno: "Lucía" }).mensajes, []);
});

// ---- DOCUMENTED KNOWN MISSES: rules cannot catch these. These tests pin the current behavior on purpose. ----

test("KNOWN LIMIT: a sibling name that nobody listed passes through unchanged", () => {
  const t = proteger("Lucía vino con su hermano Tomás", { alumno: "Lucía" });
  // Without NER there is no way to know "Tomás" is a person. The caller can list him in `otros` when it has his name.
  assert.equal(t, "Alumno A vino con su hermano Tomás");
});

test("KNOWN LIMIT: street addresses are not detected", () => {
  const t = proteger("Lucía vive en Av. Siempreviva 742, barrio Norte", { alumno: "Lucía" });
  assert.equal(t, "Alumno A vive en Av. Siempreviva 742, barrio Norte");
});

test("KNOWN LIMIT: bare domains without a scheme or www are not detected", () => {
  assert.equal(proteger("Mirá ejemplo.test/lucia", {}), "Mirá ejemplo.test/lucia");
});

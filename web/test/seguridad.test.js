const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../api/_lib/seguridad");
const F = require("../api/_lib/fichas");

test("scrypt: verifica la contraseña correcta y rechaza la incorrecta", async () => {
  const h = await S.hashPassword("una clave larga 123");
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await S.verificarPassword("una clave larga 123", h), true);
  assert.equal(await S.verificarPassword("otra clave", h), false);
  assert.equal(await S.verificarPassword("cualquiera", null), false); // usuario inexistente
  assert.notEqual(await S.hashPassword("x".repeat(10)), await S.hashPassword("x".repeat(10))); // sal distinta
});

test("contraseñas: mínimo 10 caracteres", () => {
  assert.equal(S.passwordValida("corta"), false);
  assert.equal(S.passwordValida("suficiente1"), true);
});

test("SESSION_SECRET obligatorio en producción", () => {
  const antes = { ...process.env };
  try {
    process.env.VERCEL_ENV = "production"; delete process.env.SESSION_SECRET;
    assert.throws(() => S.secreto(), /SESSION_SECRET/);
    process.env.SESSION_SECRET = "corto";
    assert.throws(() => S.secreto(), /SESSION_SECRET/);
    process.env.SESSION_SECRET = "un-secreto-de-verdad-largo";
    assert.equal(S.secreto(), "un-secreto-de-verdad-largo");
  } finally { process.env = antes; }
});

test("fichas: solo nombre de pila", () => {
  assert.equal(F.validarNombre("  Juan  "), "Juan");
  assert.equal(F.validarNombre("Juan P."), "Juan P.");
  assert.equal(F.validarNombre("María José"), "María José");
  assert.throws(() => F.validarNombre("Juan Pérez García López"), /nombre de pila/);
  assert.throws(() => F.validarNombre("Juan2"), /nombre de pila/);
  assert.throws(() => F.validarNombre(""), /Falta/);
});

test("fichas: contactos validados y normalizados", () => {
  const c = F.validarContactos([{ nombre: "Laura", vinculo: "mamá", email: " Laura@Mail.com ", telefono: "+54 341 555-1234" }]);
  assert.deepEqual(c, [{ nombre: "Laura", vinculo: "mamá", email: "laura@mail.com", telefono: "+54 341 555-1234" }]);
  assert.throws(() => F.validarContactos([{ nombre: "X", email: "no-es-email" }]), /email/);
  assert.throws(() => F.validarContactos([{ nombre: "X", telefono: "abc" }]), /teléfono/);
  assert.throws(() => F.validarContactos([{ nombre: "A", email: "a@b.com" }, { nombre: "B", email: "A@b.com" }]), /repetido/);
  assert.throws(() => F.validarContactos([{ email: "a@b.com" }]), /nombre/);
});

test("fichas: apoyos solo con campos conocidos (no hay campo de diagnóstico)", () => {
  const a = F.validarApoyos({ sensoriales: "ruido fuerte", diagnostico: "no se guarda" });
  assert.equal(a.sensoriales, "ruido fuerte");
  assert.equal("diagnostico" in a, false);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(F.APOYOS).sort());
});

test("fichas: consentimiento exige quién lo dio", () => {
  assert.deepEqual(F.validarConsentimiento({ dado: false }), { dado: false });
  assert.throws(() => F.validarConsentimiento({ dado: true }), /quién/);
  const c = F.validarConsentimiento({ dado: true, quien: "Laura (mamá)", fecha: "2026-10-30" });
  assert.equal(c.fecha, "2026-10-30"); assert.equal(c.dado, true);
});

test("objetivos de la ficha → PPI del agente con palabras clave", () => {
  const [o] = F.objetivosAPpi(["Comer con autonomía en el comedor"]);
  assert.equal(o.objetivo, "Comer con autonomía en el comedor");
  assert.ok(o.palabras.includes("comer") && o.palabras.includes("comedo"));
});

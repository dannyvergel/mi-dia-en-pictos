// Validación y forma de la "ficha de familia" de cada alumno.
// Privacidad: solo nombre de pila (o con inicial), sin fotos, sin diagnósticos.
const { errorPublico } = require("./http");
const { normEmail, emailValido } = require("./seguridad");

const APOYOS = {
  comunicacion: "Comunicación",
  sensoriales: "Sensoriales (qué le molesta)",
  regulacion: "Qué lo calma",
  alimentacion: "Alimentación",
  intereses: "Qué le gusta",
  otros: "Otros apoyos"
};
const MAX_CONTACTOS = 6, MAX_OBJETIVOS = 20;
const txt = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const txtLargo = (s, max) => String(s ?? "").trim().slice(0, max);

function validarNombre(n) {
  const s = txt(n, 40);
  if (!s) throw errorPublico("Falta el nombre del alumno");
  if (!/^[\p{L}][\p{L}'.\- ]*$/u.test(s) || s.split(" ").length > 3)
    throw errorPublico("Usá solo el nombre de pila (por ejemplo «Juan» o «Juan P.»), sin apellido ni números.");
  return s;
}

function validarContactos(lista) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw errorPublico("Contactos inválidos");
  if (lista.length > MAX_CONTACTOS) throw errorPublico(`Hasta ${MAX_CONTACTOS} contactos por alumno`);
  const vistos = new Set();
  return lista.map((c, i) => {
    const nombre = txt(c?.nombre, 60), vinculo = txt(c?.vinculo, 30), email = normEmail(c?.email), telefono = txt(c?.telefono, 30);
    if (!nombre) throw errorPublico(`Al contacto ${i + 1} le falta el nombre`);
    if (email && !emailValido(email)) throw errorPublico(`Revisá el email de ${nombre}`);
    if (email && vistos.has(email)) throw errorPublico(`El email ${email} está repetido`);
    if (telefono && !/^[+\d][\d\s()-]{5,}$/.test(telefono)) throw errorPublico(`Revisá el teléfono de ${nombre}`);
    if (email) vistos.add(email);
    return { nombre, vinculo, email, telefono };
  });
}

function validarApoyos(a) {
  const out = {};
  for (const k of Object.keys(APOYOS)) out[k] = txtLargo(a?.[k], 1000);
  return out;
}

function validarObjetivos(lista) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw errorPublico("Objetivos inválidos");
  const out = lista.map(o => txt(typeof o === "string" ? o : o?.objetivo, 300)).filter(Boolean);
  if (out.length > MAX_OBJETIVOS) throw errorPublico(`Hasta ${MAX_OBJETIVOS} objetivos`);
  return out;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
function validarConsentimiento(c) {
  if (!c || !c.dado) return { dado: false };
  const quien = txt(c.quien, 120);
  if (!quien) throw errorPublico("Indicá quién dio el consentimiento");
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(c.fecha || "") ? c.fecha : hoyISO();
  return { dado: true, fecha, quien, via: c.via === "familia" ? "familia" : "docente" };
}

// Objetivos de la ficha → formato PPI del agente (palabras clave para medirlos).
const VACIAS = new Set(["con", "sin", "para", "por", "los", "las", "del", "una", "uno", "que", "sus", "apoyos", "usando"]);
function objetivosAPpi(objetivos) {
  return (objetivos || []).map(o => {
    const palabras = o.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-zñ]+/)
      .filter(w => w.length >= 4 && !VACIAS.has(w)).map(w => w.slice(0, 6));
    return { objetivo: o, palabras: palabras.length ? palabras : [o.toLowerCase()] };
  });
}
// Apoyos de la ficha → perfil funcional que ya usa el agente.
function apoyosAPerfil(a = {}) {
  return { comunicacion: a.comunicacion || "", sensibilidades: a.sensoriales || "", lo_calma: a.regulacion || "", le_gusta: a.intereses || "",
    observaciones: [a.alimentacion && "Alimentación: " + a.alimentacion, a.otros].filter(Boolean).join(". ") };
}

module.exports = { APOYOS, validarNombre, validarContactos, validarApoyos, validarObjetivos, validarConsentimiento, objetivosAPpi, apoyosAPerfil };

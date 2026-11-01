// Proveedor de identidad "código por email": 6 números, vence a los 10 min, se guarda hasheado (HMAC),
// máximo 5 intentos por código y límites por email e IP. Sirve igual para docentes y familias;
// un código pedido como docente no sirve para entrar como familia (y al revés).
const crypto = require("crypto");
const { q, uno } = require("./db");
const S = require("./seguridad");
const { mandarCodigo } = require("./correo");
const { errorPublico } = require("./http");
const { TIPOS, cuentaPara, entrar } = require("./identidad");

const VENTANA = 15;
const MAX_CODIGOS_EMAIL = 3, MAX_CODIGOS_IP = 10, MAX_VERIF_IP = 30, MAX_INTENTOS_CODIGO = 5, VIGENCIA_MIN = 10;
// Familias: mismo formato de siempre (los códigos en vuelo siguen sirviendo). Docentes: con prefijo propio.
const hashCodigo = (tipo, email, codigo) => S.hmac(tipo === "familia" ? `codigo:${email}:${codigo}` : `codigo:${tipo}:${email}:${codigo}`);
const MENSAJE = {
  docente: "Si tu email está habilitado como docente en Puente, te mandamos un código. Revisá tu correo (y el spam).",
  familia: "Si tu email está registrado en la escuela, te mandamos un código. Revisá tu correo (y el spam)."
};

function tipoValido(t) {
  const tipo = t || "familia";
  if (!TIPOS.includes(tipo)) throw errorPublico("Tipo de cuenta desconocido");
  return tipo;
}

// Siempre responde lo mismo exista o no la cuenta (no revela emails). Solo manda código a cuentas que pueden entrar.
async function pedir(req, tipoPedido, emailPedido) {
  const tipo = tipoValido(tipoPedido), email = S.normEmail(emailPedido), ip = S.ipDe(req);
  if (!S.emailValido(email)) throw errorPublico("Revisá el email");
  const kE = "codigo:email:" + email, kI = "codigo:ip:" + ip;
  if (await S.superaLimite(kE, MAX_CODIGOS_EMAIL, VENTANA) || await S.superaLimite(kI, MAX_CODIGOS_IP, VENTANA))
    throw errorPublico("Ya pediste varios códigos. Esperá 15 minutos.", 429);
  await S.registrarIntento(kE); await S.registrarIntento(kI);
  const generico = { ok: true, mensaje: MENSAJE[tipo] };
  if (!(await cuentaPara(tipo, email))) return generico;
  const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  await q("UPDATE codigos SET usado = true WHERE email = $1 AND tipo = $2 AND NOT usado", [email, tipo]);
  await q("INSERT INTO codigos (email, tipo, codigo_hash, expira) VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)",
    [email, tipo, hashCodigo(tipo, email, codigo), String(VIGENCIA_MIN)]);
  const envio = await mandarCodigo(email, codigo);
  return { ...generico, ...(envio.codigo_dev ? { codigo_dev: envio.codigo_dev } : {}) };
}

// Verifica el código y crea la sesión. Error genérico si algo no cierra.
async function verificar(req, res, tipoPedido, emailPedido, codigoPedido) {
  const tipo = tipoValido(tipoPedido), email = S.normEmail(emailPedido), codigo = String(codigoPedido || "").replace(/\D/g, "");
  const kI = "verif:ip:" + S.ipDe(req);
  if (await S.superaLimite(kI, MAX_VERIF_IP, VENTANA)) throw errorPublico("Demasiados intentos. Esperá 15 minutos.", 429);
  await S.registrarIntento(kI);
  const malo = errorPublico("El código no es correcto o ya venció. Pedí uno nuevo si hace falta.", 401);
  if (!S.emailValido(email) || codigo.length !== 6) throw malo;
  // Suma el intento antes de comparar: así nunca pasa de 5 aunque lleguen pedidos en paralelo.
  const c = await uno(`UPDATE codigos SET intentos = intentos + 1
    WHERE id = (SELECT id FROM codigos WHERE email = $1 AND tipo = $2 AND NOT usado AND expira > now() ORDER BY creado DESC LIMIT 1)
      AND intentos < $3 RETURNING id, codigo_hash`, [email, tipo, MAX_INTENTOS_CODIGO]);
  if (!c || !S.igualSeguro(c.codigo_hash, hashCodigo(tipo, email, codigo))) throw malo;
  await q("UPDATE codigos SET usado = true WHERE id = $1", [c.id]);
  const sesion = await entrar(res, tipo, email, "codigo");
  if (!sesion) throw malo; // la cuenta se desactivó o se desvinculó mientras tanto
  return sesion;
}

module.exports = { pedir, verificar, MAX_INTENTOS_CODIGO, VIGENCIA_MIN };

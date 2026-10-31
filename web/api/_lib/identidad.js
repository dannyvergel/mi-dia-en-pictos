// Identidad: separa "probar que la persona controla un email" (proveedor) de
// "qué cuenta de Puente le corresponde a ese email" (cuentaPara + entrar).
//
// Hoy hay un solo proveedor para docentes y familias: código de 6 números por email (_lib/codigos.js).
// Para sumar SSO más adelante (Google Workspace, Microsoft, cualquier OIDC):
//   1. un endpoint nuevo (ej. api/sso.js) hace el flujo con el proveedor y obtiene un email VERIFICADO
//      (claim email_verified, y si hace falta el dominio de la escuela);
//   2. llama a entrar(res, "docente", email, "sso:google");
//   3. suma "sso:google" en metodos() para que /login.html muestre el botón.
// Las reglas de acceso (docente activa / familia vinculada a un alumno) quedan acá, iguales para todos los proveedores.
const { uno } = require("./db");
const { crearSesion, normEmail } = require("./seguridad");

const TIPOS = ["docente", "familia"];

// La cuenta de Puente para un email ya verificado, o null si no puede entrar.
async function cuentaPara(tipo, email) {
  email = normEmail(email);
  if (tipo === "docente") return uno("SELECT id, nombre, email, es_admin FROM docentes WHERE email = $1 AND activo", [email]);
  if (tipo === "familia") return uno("SELECT f.id, f.email FROM familias f WHERE f.email = $1 AND EXISTS (SELECT 1 FROM familia_alumno fa WHERE fa.familia_id = f.id)", [email]);
  return null;
}

function datosSesion(tipo, u) {
  if (!u) return null;
  return tipo === "docente"
    ? { tipo: "docente", nombre: u.nombre, email: u.email, es_admin: u.es_admin }
    : { tipo: "familia", email: u.email };
}

// Crea la sesión para un email ya verificado por algún proveedor. Devuelve los datos de sesión, o null si no hay cuenta.
async function entrar(res, tipo, email, proveedor) {
  const c = await cuentaPara(tipo, email);
  if (!c) return null;
  await crearSesion(res, tipo, c.id);
  console.log(`[puente] ingreso ${tipo} #${c.id} vía ${proveedor}`);
  return datosSesion(tipo, c);
}

// Métodos de ingreso disponibles (los lee /login.html). SSO: agregar acá cuando exista.
function metodos() { return { docente: ["codigo"], familia: ["codigo"] }; }

module.exports = { TIPOS, cuentaPara, datosSesion, entrar, metodos };

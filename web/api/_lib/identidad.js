// Identidad: separa "probar que la persona controla un email" (proveedor) de
// "qué cuenta de Puente le corresponde a ese email" (cuentaPara + entrar).
//
// Proveedores: código de 6 números por email (_lib/codigos.js, docentes y familias) y Google OIDC (_lib/google.js, solo docentes,
// dentro de /api/auth para no sumar funciones). Otro proveedor (Microsoft, cualquier OIDC) haría lo mismo que _lib/google.js:
// obtener un email VERIFICADO y llamar a entrar(res, "docente", email, "sso:<proveedor>"), y sumarse en metodos().
// Las reglas de acceso (docente activa / familia vinculada a un alumno) quedan acá, iguales para todos los proveedores.
const { uno } = require("./db");
const { crearSesion, normEmail, esPlataforma } = require("./seguridad");

const TIPOS = ["docente", "familia"];

// La cuenta de Puente para un email ya verificado, o null si no puede entrar.
async function cuentaPara(tipo, email) {
  email = normEmail(email);
  if (tipo === "docente") {
    // Docente activa; si la plataforma desactivó su escuela, no entra (salvo que sea de la plataforma).
    // La plataforma (ADMIN_EMAIL) puede no tener escuela: LEFT JOIN.
    const d = await uno(`SELECT d.id, d.escuela_id, d.nombre, d.email, d.es_admin, d.es_plataforma, e.activa AS escuela_activa
      FROM docentes d LEFT JOIN escuelas e ON e.id = d.escuela_id WHERE d.email = $1 AND d.activo`, [email]);
    if (!d) return null;
    d.es_plataforma = esPlataforma(d);
    return d.escuela_activa || d.es_plataforma ? d : null;
  }
  if (tipo === "familia") return uno(`SELECT f.id, f.email FROM familias f WHERE f.email = $1 AND EXISTS (SELECT 1 FROM familia_alumno fa
    JOIN alumnos a ON a.id = fa.alumno_id JOIN escuelas e ON e.id = a.escuela_id WHERE fa.familia_id = f.id AND e.activa)`, [email]);
  return null;
}

function datosSesion(tipo, u) {
  if (!u) return null;
  return tipo === "docente"
    ? { tipo: "docente", nombre: u.nombre, email: u.email, es_admin: !!u.es_admin && u.escuela_id != null, es_plataforma: esPlataforma(u),
        tiene_escuela: u.escuela_id != null, ...(require("./revisor").esRevisor(u) ? { revisor: true } : {}) }
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

// Métodos de ingreso disponibles. "google" solo para docentes y solo con GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (ver _lib/google.js).
function metodos() {
  const g = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return { docente: g ? ["codigo", "google"] : ["codigo"], familia: ["codigo"] };
}

module.exports = { TIPOS, cuentaPara, datosSesion, entrar, metodos };

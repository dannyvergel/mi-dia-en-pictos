// Almacenamiento de los días publicados para la familia: Vercel Blob (store privado puente-datos).
// También guarda los informes y documentos que sube la escuela (ver _lib/documentos.js), en el mismo store privado.
// En los tests se reemplaza por memoria con usarAlmacenDePrueba().
//
// Credenciales (ver docs/operacion/rotar-credenciales.md, sección BLOB_READ_WRITE_TOKEN):
//  · En Vercel, OIDC: al conectar el store al proyecto, Vercel pone BLOB_STORE_ID y un VERCEL_OIDC_TOKEN corto que rota solo.
//    El SDK (@vercel/blob 2.4 o más nuevo) los lee solo y les da prioridad sobre BLOB_READ_WRITE_TOKEN. No hay que pasarlos
//    ni leer el token OIDC a mano (si se pasa explícito, el SDK no lo renueva y a la hora empieza a dar 403).
//  · Fuera de Vercel (scripts locales: revisor.js, dev.js): BLOB_READ_WRITE_TOKEN como respaldo. Se pasa explícito para que
//    un VERCEL_OIDC_TOKEN/BLOB_STORE_ID viejo que haya quedado de un `vercel env pull` no mande la escritura a otro store.
let prueba = null, pruebaArchivos = null, avisado = false, fallosDePrueba = null;
const ruta = t => `familias/${t}.json`;
const lleno = v => typeof v === "string" && v.trim() !== "";

// "memoria" (tests o dev sin Blob) | "oidc" | "token" | "sin_configurar". Nunca devuelve ni registra un secreto.
function modoBlob(env = process.env) {
  if (prueba) return "memoria";
  const oidc = lleno(env.BLOB_STORE_ID), rw = lleno(env.BLOB_READ_WRITE_TOKEN);
  if (lleno(env.VERCEL)) return oidc ? "oidc" : rw ? "token" : "sin_configurar";
  // Local: el token que pasa quien corre el script manda (ver credenciales()).
  if (rw) return "token";
  return oidc && lleno(env.VERCEL_OIDC_TOKEN) ? "oidc" : "sin_configurar";
}
const hayBlob = (env = process.env) => modoBlob(env) !== "sin_configurar";

// Opciones de autenticación que se suman a cada llamada al SDK.
function credenciales(env = process.env) {
  if (lleno(env.VERCEL)) {
    // En Vercel no se pasa nada: el SDK usa OIDC si está BLOB_STORE_ID y, si no, cae a BLOB_READ_WRITE_TOKEN.
    if (!lleno(env.BLOB_STORE_ID) && !avisado) {
      avisado = true;
      console.warn("[puente] Blob sin BLOB_STORE_ID: se usa el token estático. Conectá el store al proyecto (OIDC) y hacé redeploy.");
    }
    return {};
  }
  return lleno(env.BLOB_READ_WRITE_TOKEN) ? { token: env.BLOB_READ_WRITE_TOKEN.trim() } : {};
}

async function leerFamilia(token) {
  if (prueba) return prueba.has(token) ? JSON.parse(prueba.get(token)) : null;
  const { get } = require("@vercel/blob");
  const r = await get(ruta(token), { access: "private", useCache: false, ...credenciales() });
  return r ? JSON.parse(await new Response(r.stream).text()) : null;
}
async function guardarFamilia(token, datos) {
  if (prueba) return void prueba.set(token, JSON.stringify(datos));
  const { put } = require("@vercel/blob");
  await put(ruta(token), JSON.stringify(datos), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", ...credenciales() });
}
// Borra los días publicados de un alumno y verifica que ya no estén. Devuelve true si quedó borrado (o no existía).
async function borrarFamilia(token) {
  if (!token) return true;
  if (prueba) { prueba.delete(token); return !prueba.has(token); }
  try {
    const { del, head } = require("@vercel/blob");
    await del(ruta(token), credenciales());
    try { await head(ruta(token), credenciales()); return false; } // sigue estando
    catch (e) { if (/not.?found/i.test(e?.name || "") || /not.?found|does not exist/i.test(e?.message || "")) return true; throw e; }
  } catch (e) { console.error("[puente] no se pudo borrar el blob:", e.message); return false; }
}

// ---------- Archivos (informes y documentos) ----------
// ruta: "documentos/<alumno_id>/<32 hex>". Siempre privados: se leen solo desde api/fichas.js, después de chequear permisos.
const noEncontrado = e => /not.?found/i.test(e?.name || "") || /not.?found|does not exist/i.test(e?.message || "");
async function guardarArchivo(ruta, datos, mime) {
  if (pruebaArchivos) return void pruebaArchivos.set(ruta, { datos: Buffer.from(datos), mime });
  const { put } = require("@vercel/blob");
  await put(ruta, datos, { access: "private", allowOverwrite: false, addRandomSuffix: false, contentType: mime, ...credenciales() });
}
// Devuelve un Buffer, o null si no está.
async function leerArchivo(ruta) {
  if (pruebaArchivos) return pruebaArchivos.has(ruta) ? Buffer.from(pruebaArchivos.get(ruta).datos) : null;
  const { get } = require("@vercel/blob");
  try {
    const r = await get(ruta, { access: "private", useCache: false, ...credenciales() });
    return r ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
  } catch (e) { if (noEncontrado(e)) return null; throw e; }
}
const textoDeError = e => String(e?.message || e || "error").replace(/vercel_blob_rw_\S+/g, "[token]").replace(/\s+/g, " ").slice(0, 200);
// Un intento de borrado, con verificación. { ok, error } (el error va sin secretos y cortado: se guarda en blobs_huerfanos).
async function intentarBorrarArchivo(ruta) {
  if (!ruta) return { ok: true };
  if (pruebaArchivos) {
    if (fallosDePrueba?.has(ruta)) return { ok: false, error: "fallo simulado (tests)" };
    pruebaArchivos.delete(ruta);
    return { ok: !pruebaArchivos.has(ruta), error: "" };
  }
  try {
    const { del, head } = require("@vercel/blob");
    await del(ruta, credenciales());
    try { await head(ruta, credenciales()); return { ok: false, error: "el archivo sigue en el Blob después de borrarlo" }; }
    catch (e) { if (noEncontrado(e)) return { ok: true }; throw e; }
  } catch (e) { return { ok: false, error: textoDeError(e) }; }
}

// Anota (o suma un intento a) una ruta que no se pudo borrar. Nunca tira: si la base falla, queda el log.
async function anotarHuerfano(ruta, error) {
  try {
    const { q } = require("./db");
    await q(`INSERT INTO blobs_huerfanos (ruta, ultimo_error) VALUES ($1, $2)
      ON CONFLICT (ruta) DO UPDATE SET intentos = blobs_huerfanos.intentos + 1, ultimo_error = EXCLUDED.ultimo_error, ultimo_intento = now()`, [ruta, error || ""]);
  } catch (e) { console.error("[puente] no se pudo anotar el archivo huérfano:", ruta, e.message); }
}

// Borra y verifica. true si quedó borrado (o no existía). Si falla, queda anotado en blobs_huerfanos para que la limpieza diaria
// lo reintente (retencion.barrerHuerfanos) y en los logs (sin datos personales). Lo usan documentos.js y bajas.js.
async function borrarArchivo(ruta) {
  const r = await intentarBorrarArchivo(ruta);
  if (r.ok) return true;
  console.error("[puente] no se pudo borrar el archivo (queda como huérfano, se reintenta en la limpieza):", ruta, r.error);
  await anotarHuerfano(ruta, r.error);
  return false;
}

// Devuelve el Map de los días publicados (los tests miran su tamaño). Los archivos van en otro Map: archivosDePrueba().
function usarAlmacenDePrueba(on = true) { prueba = on ? new Map() : null; pruebaArchivos = on ? new Map() : null; return prueba; }
const archivosDePrueba = () => pruebaArchivos;
// Tests: Set de rutas cuyo borrado falla (null lo apaga).
const fallarBorradoDePrueba = rutas => { fallosDePrueba = rutas; };

module.exports = { modoBlob, hayBlob, credenciales, leerFamilia, guardarFamilia, borrarFamilia, guardarArchivo, leerArchivo, borrarArchivo, intentarBorrarArchivo,
  usarAlmacenDePrueba, archivosDePrueba, fallarBorradoDePrueba };

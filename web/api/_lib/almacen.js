// Almacenamiento de los días publicados para la familia: Vercel Blob (store privado puente-datos).
// También guarda los informes y documentos que sube la escuela (ver _lib/documentos.js), en el mismo store privado.
// En los tests se reemplaza por memoria con usarAlmacenDePrueba().
let prueba = null, pruebaArchivos = null;
const ruta = t => `familias/${t}.json`;

async function leerFamilia(token) {
  if (prueba) return prueba.has(token) ? JSON.parse(prueba.get(token)) : null;
  const { get } = require("@vercel/blob");
  const r = await get(ruta(token), { access: "private", useCache: false });
  return r ? JSON.parse(await new Response(r.stream).text()) : null;
}
async function guardarFamilia(token, datos) {
  if (prueba) return void prueba.set(token, JSON.stringify(datos));
  const { put } = require("@vercel/blob");
  await put(ruta(token), JSON.stringify(datos), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
}
// Borra los días publicados de un alumno y verifica que ya no estén. Devuelve true si quedó borrado (o no existía).
async function borrarFamilia(token) {
  if (!token) return true;
  if (prueba) { prueba.delete(token); return !prueba.has(token); }
  try {
    const { del, head } = require("@vercel/blob");
    await del(ruta(token));
    try { await head(ruta(token)); return false; } // sigue estando
    catch (e) { if (/not.?found/i.test(e?.name || "") || /not.?found|does not exist/i.test(e?.message || "")) return true; throw e; }
  } catch (e) { console.error("[puente] no se pudo borrar el blob:", e.message); return false; }
}

// ---------- Archivos (informes y documentos) ----------
// ruta: "documentos/<alumno_id>/<32 hex>". Siempre privados: se leen solo desde api/fichas.js, después de chequear permisos.
const noEncontrado = e => /not.?found/i.test(e?.name || "") || /not.?found|does not exist/i.test(e?.message || "");
async function guardarArchivo(ruta, datos, mime) {
  if (pruebaArchivos) return void pruebaArchivos.set(ruta, { datos: Buffer.from(datos), mime });
  const { put } = require("@vercel/blob");
  await put(ruta, datos, { access: "private", allowOverwrite: false, addRandomSuffix: false, contentType: mime });
}
// Devuelve un Buffer, o null si no está.
async function leerArchivo(ruta) {
  if (pruebaArchivos) return pruebaArchivos.has(ruta) ? Buffer.from(pruebaArchivos.get(ruta).datos) : null;
  const { get } = require("@vercel/blob");
  try {
    const r = await get(ruta, { access: "private", useCache: false });
    return r ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
  } catch (e) { if (noEncontrado(e)) return null; throw e; }
}
// Borra y verifica. true si quedó borrado (o no existía); false si falló (queda en los logs, sin datos personales).
async function borrarArchivo(ruta) {
  if (!ruta) return true;
  if (pruebaArchivos) { pruebaArchivos.delete(ruta); return !pruebaArchivos.has(ruta); }
  try {
    const { del, head } = require("@vercel/blob");
    await del(ruta);
    try { await head(ruta); return false; } catch (e) { if (noEncontrado(e)) return true; throw e; }
  } catch (e) { console.error("[puente] no se pudo borrar el archivo:", ruta, e.message); return false; }
}

// Devuelve el Map de los días publicados (los tests miran su tamaño). Los archivos van en otro Map: archivosDePrueba().
function usarAlmacenDePrueba(on = true) { prueba = on ? new Map() : null; pruebaArchivos = on ? new Map() : null; return prueba; }
const archivosDePrueba = () => pruebaArchivos;

module.exports = { leerFamilia, guardarFamilia, borrarFamilia, guardarArchivo, leerArchivo, borrarArchivo, usarAlmacenDePrueba, archivosDePrueba };

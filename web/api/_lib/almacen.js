// Almacenamiento de los días publicados para la familia: Vercel Blob (store privado puente-datos).
// En los tests se reemplaza por memoria con usarAlmacenDePrueba().
let prueba = null;
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
function usarAlmacenDePrueba(on = true) { prueba = on ? new Map() : null; return prueba; }

module.exports = { leerFamilia, guardarFamilia, borrarFamilia, usarAlmacenDePrueba };

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
async function borrarFamilia(token) {
  if (prueba) return void prueba.delete(token);
  try { const { del } = require("@vercel/blob"); await del(ruta(token)); } catch (e) { console.error("No se pudo borrar el blob", e.message); }
}
function usarAlmacenDePrueba(on = true) { prueba = on ? new Map() : null; return prueba; }

module.exports = { leerFamilia, guardarFamilia, borrarFamilia, usarAlmacenDePrueba };

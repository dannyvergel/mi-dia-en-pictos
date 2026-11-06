// Copia todos los blobs de un store privado de Vercel Blob a otro, con las mismas rutas y el mismo content-type.
// Sirve para dejar sin efecto un BLOB_READ_WRITE_TOKEN filtrado: ese token es del store y no se regenera, así que hay que
// pasar los datos a un store nuevo y borrar el viejo. Pasos completos: docs/operacion/rotar-credenciales.md.
//
// PowerShell 5.1 (copiá cada token de Vercel al portapapeles justo antes de su línea; Get-Clipboard no lo muestra en pantalla):
//   cd C:\dev\mi-dia-en-pictos\web
//   $env:BLOB_ORIGEN_TOKEN = (Get-Clipboard)     # con el token del store VIEJO (puente-datos) copiado
//   $env:BLOB_DESTINO_TOKEN = (Get-Clipboard)    # con el token del store NUEVO copiado
//   Set-Clipboard -Value " "
//   node scripts\migrar-blob.js --dry-run        # solo cuenta y muestra qué haría
//   node scripts\migrar-blob.js                  # copia de verdad y verifica
//   Remove-Item Env:BLOB_ORIGEN_TOKEN
//   Remove-Item Env:BLOB_DESTINO_TOKEN
//
// · Idempotente: se puede correr las veces que haga falta. Copia lo que falta en el destino; si un blob ya está, lo pisa solo
//   si el del origen es más nuevo (se volvió a escribir después de la pasada anterior). Si el del destino es más nuevo (lo
//   escribió la app ya conectada al store nuevo), no lo toca.
// · No borra nada en ninguno de los dos stores. Lo que está en el destino y no en el origen se informa como «solo en destino».
// · Al final vuelve a listar los dos stores y compara cantidad, bytes, tamaño y content-type de cada ruta. Sale con código 1
//   si falta algo o algo no coincide.
// · Nunca imprime los tokens. Las rutas se muestran recortadas (familias/<token de la familia>.json es privado).
// Opciones: --dry-run · --concurrencia N (por defecto 4).

const PREFIJO_TOKEN = "vercel_blob_rw_";

// El id del store va dentro del token: vercel_blob_rw_<storeId>_<secreto>. El id no es secreto (Vercel lo muestra en el panel).
function storeDeToken(token) {
  const t = String(token || "").trim();
  if (!t.startsWith(PREFIJO_TOKEN)) return null;
  const id = t.split("_")[3] || "";
  return /^[A-Za-z0-9]+$/.test(id) ? id : null;
}

// Acepta el valor solo o la línea entera que copia el panel de Vercel (BLOB_READ_WRITE_TOKEN="vercel_blob_rw_...").
function normalizarToken(t) {
  return String(t || "").trim().replace(/^[A-Z_]+=/, "").replace(/^["']|["']$/g, "").trim();
}

// Ruta recortada para los logs: «familias/ab12….json», «documentos/7/c0ff…».
function rutaCorta(p) {
  const partes = String(p).split("/");
  const ult = partes.pop() || "";
  const m = ult.match(/^([^.]*)(\..*)?$/);
  const base = m[1].length > 4 ? m[1].slice(0, 4) + "…" : m[1];
  return [...partes, base + (m[2] || "")].join("/");
}

// Saca cualquier token del texto (por si un error del SDK lo trajera).
function limpiar(texto, secretos) {
  let s = String(texto ?? "");
  for (const x of secretos) if (x) s = s.split(x).join("[token]");
  return s.replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[token]");
}

const fecha = v => new Date(v).getTime() || 0;

// Decide qué hacer con cada ruta. origen y destino: Map ruta → { size, uploadedAt }.
function planificar(origen, destino) {
  const plan = { copiar: [], actualizar: [], iguales: [], soloDestino: [] };
  for (const [ruta, o] of origen) {
    const d = destino.get(ruta);
    if (!d) plan.copiar.push(ruta);
    else if (fecha(o.uploadedAt) > fecha(d.uploadedAt)) plan.actualizar.push(ruta);
    else plan.iguales.push(ruta);
  }
  for (const ruta of destino.keys()) if (!origen.has(ruta)) plan.soloDestino.push(ruta);
  return plan;
}

const totalBytes = m => [...m.values()].reduce((a, b) => a + (Number(b.size) || 0), 0);

// Corre fn sobre cada elemento con un máximo de n a la vez.
async function enParalelo(items, n, fn) {
  let i = 0;
  const trabajadores = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  });
  await Promise.all(trabajadores);
}

// Cliente real de Vercel Blob con un token explícito (gana sobre OIDC y sobre BLOB_READ_WRITE_TOKEN del entorno).
function clienteVercel(token) {
  const sdk = require("@vercel/blob");
  return {
    storeId: storeDeToken(token),
    async listar() {
      const m = new Map();
      let cursor;
      do {
        const r = await sdk.list({ token, limit: 1000, cursor });
        for (const b of r.blobs) m.set(b.pathname, { size: b.size, uploadedAt: b.uploadedAt });
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return m;
    },
    async leer(ruta) {
      const r = await sdk.get(ruta, { access: "private", token, useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return { datos: Buffer.from(await new Response(r.stream).arrayBuffer()), contentType: r.blob.contentType };
    },
    async escribir(ruta, datos, { contentType, pisar }) {
      await sdk.put(ruta, datos, { access: "private", token, addRandomSuffix: false, allowOverwrite: !!pisar,
        ...(contentType ? { contentType } : {}) });
    },
    async cabecera(ruta) {
      const h = await sdk.head(ruta, { token });
      return { size: h.size, contentType: h.contentType };
    },
  };
}

// origen y destino: clientes con { storeId, listar, leer, escribir, cabecera }.
async function migrar({ origen, destino, dryRun = false, concurrencia = 4, log = () => {}, secretos = [] }) {
  if (!origen.storeId || !destino.storeId) throw new Error("Los dos tokens tienen que ser de lectura y escritura (empiezan con vercel_blob_rw_).");
  if (origen.storeId === destino.storeId) throw new Error(`Origen y destino son el mismo store (${origen.storeId}). Revisá los tokens.`);
  log(`Origen:  store ${origen.storeId}`);
  log(`Destino: store ${destino.storeId}`);

  const [lo, ld] = await Promise.all([origen.listar(), destino.listar()]);
  const plan = planificar(lo, ld);
  log(`Origen: ${lo.size} blobs, ${totalBytes(lo)} bytes. Destino: ${ld.size} blobs, ${totalBytes(ld)} bytes.`);
  log(`Plan: copiar ${plan.copiar.length}, actualizar ${plan.actualizar.length} (más nuevos en el origen), ya están ${plan.iguales.length}, solo en destino ${plan.soloDestino.length}.`);
  for (const r of plan.soloDestino.slice(0, 20)) log(`  solo en destino (no se toca): ${rutaCorta(r)}`);

  const resultado = { dryRun, origen: { blobs: lo.size, bytes: totalBytes(lo) }, plan: {
    copiar: plan.copiar.length, actualizar: plan.actualizar.length, iguales: plan.iguales.length, soloDestino: plan.soloDestino.length },
    copiados: 0, errores: [], verificacion: null, ok: false };
  if (dryRun) {
    log("--dry-run: no se escribió nada.");
    resultado.ok = true;
    return resultado;
  }

  const tareas = [...plan.copiar.map(r => [r, false]), ...plan.actualizar.map(r => [r, true])];
  await enParalelo(tareas, concurrencia, async ([ruta, pisar]) => {
    try {
      const b = await origen.leer(ruta);
      if (!b) throw new Error("desapareció del origen");
      await destino.escribir(ruta, b.datos, { contentType: b.contentType, pisar });
      resultado.copiados++;
      if (resultado.copiados % 50 === 0) log(`  ${resultado.copiados}/${tareas.length}…`);
    } catch (e) {
      resultado.errores.push(ruta);
      log(`  ERROR ${rutaCorta(ruta)}: ${limpiar(e && e.message, secretos)}`);
    }
  });
  log(`Copiados: ${resultado.copiados}. Errores: ${resultado.errores.length}.`);

  // Verificación: se vuelve a listar todo y se compara ruta por ruta (tamaño) y el content-type con head.
  const [vo, vd] = await Promise.all([origen.listar(), destino.listar()]);
  // Si el del destino es más nuevo, lo escribió la app ya conectada al store nuevo: cuenta como presente y no se compara.
  const faltan = [], distintoTamano = [], distintoTipo = [], comparar = [];
  let masNuevosEnDestino = 0;
  for (const [ruta, o] of vo) {
    const d = vd.get(ruta);
    if (!d) faltan.push(ruta);
    else if (fecha(d.uploadedAt) > fecha(o.uploadedAt) && Number(d.size) !== Number(o.size)) masNuevosEnDestino++;
    else if (Number(d.size) !== Number(o.size)) distintoTamano.push(ruta);
    else comparar.push(ruta);
  }
  await enParalelo(comparar, concurrencia, async ruta => {
    try {
      const [ho, hd] = await Promise.all([origen.cabecera(ruta), destino.cabecera(ruta)]);
      if ((ho.contentType || "") !== (hd.contentType || "")) distintoTipo.push(ruta);
    } catch (e) { distintoTipo.push(ruta); log(`  no se pudo verificar ${rutaCorta(ruta)}: ${limpiar(e && e.message, secretos)}`); }
  });
  const soloDestino = [...vd.keys()].filter(r => !vo.has(r)).length;
  resultado.verificacion = {
    origen: { blobs: vo.size, bytes: totalBytes(vo) }, destino: { blobs: vd.size, bytes: totalBytes(vd) },
    faltan: faltan.length, distintoTamano: distintoTamano.length, distintoTipo: distintoTipo.length, soloDestino, masNuevosEnDestino,
  };
  const v = resultado.verificacion;
  log(`Verificación: origen ${v.origen.blobs} blobs / ${v.origen.bytes} bytes · destino ${v.destino.blobs} blobs / ${v.destino.bytes} bytes.`);
  log(`  faltan en destino: ${v.faltan} · tamaño distinto: ${v.distintoTamano} · content-type distinto: ${v.distintoTipo} · solo en destino: ${v.soloDestino} · más nuevos en destino: ${v.masNuevosEnDestino}`);
  for (const r of [...faltan, ...distintoTamano, ...distintoTipo].slice(0, 20)) log(`  revisar: ${rutaCorta(r)}`);
  resultado.ok = !resultado.errores.length && !v.faltan && !v.distintoTamano && !v.distintoTipo;
  log(resultado.ok ? "Listo: todo lo del origen está en el destino." : "Hay diferencias: corré de nuevo (es idempotente) y, si siguen, revisá las rutas de arriba.");
  return resultado;
}

module.exports = { migrar, planificar, storeDeToken, normalizarToken, rutaCorta, limpiar, clienteVercel };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const i = args.indexOf("--concurrencia");
  const concurrencia = i >= 0 ? Math.max(1, Math.min(16, Number(args[i + 1]) || 4)) : 4;
  const tOrigen = normalizarToken(process.env.BLOB_ORIGEN_TOKEN);
  const tDestino = normalizarToken(process.env.BLOB_DESTINO_TOKEN);
  const secretos = [tOrigen, tDestino, process.env.BLOB_ORIGEN_TOKEN, process.env.BLOB_DESTINO_TOKEN];
  if (!tOrigen || !tDestino) {
    console.error("Faltan BLOB_ORIGEN_TOKEN (store viejo) y BLOB_DESTINO_TOKEN (store nuevo). Ver el encabezado de este archivo.");
    process.exit(2);
  }
  migrar({ origen: clienteVercel(tOrigen), destino: clienteVercel(tDestino), dryRun, concurrencia, log: m => console.log(limpiar(m, secretos)), secretos })
    .then(r => process.exit(r.ok ? 0 : 1))
    .catch(e => { console.error("No se pudo migrar:", limpiar(e && e.message, secretos)); process.exit(1); });
}

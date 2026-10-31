// Servidor local para probar Puente con cuentas sin tocar Vercel ni Neon.
//   npm run local            → base PGlite en memoria (se borra al cortar)
//   DATABASE_URL=... npm run local → contra una base Postgres real
//   DEMO=1 npm run local     → sin base (modo demo con PIN y links)
// Sirve los archivos de web/ y las funciones de web/api como lo haría Vercel.
const http = require("http");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const PUERTO = Number(process.env.PORT || 3000);
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.DEMO) {
    const { PGlite } = require("@electric-sql/pglite");
    require("../api/_lib/db").usarBaseDePrueba(new PGlite());
    console.log("Base: PGlite en memoria (datos de prueba, se borran al cortar).");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) { require("../api/_lib/almacen").usarAlmacenDePrueba(true); console.log("Blob: en memoria."); }
  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const nombre = url.pathname.slice(5).replace(/[^a-z]/g, "");
      const archivo = path.join(RAIZ, "api", nombre + ".js");
      if (!nombre || !fs.existsSync(archivo)) { res.writeHead(404); return res.end(); }
      let datos = ""; for await (const c of req) datos += c;
      req.query = Object.fromEntries(url.searchParams);
      req.body = datos && String(req.headers["content-type"] || "").includes("json") ? (() => { try { return JSON.parse(datos); } catch { return datos; } })() : datos;
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); return res; };
      try { await require(archivo)(req, res); } catch (e) { console.error(e); res.statusCode = 500; res.end(); }
      return;
    }
    let f = path.join(RAIZ, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!f.startsWith(RAIZ) || /node_modules|scripts|test|\/api\//.test(path.relative(RAIZ, f)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("No encontrado"); }
    res.writeHead(200, { "content-type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  }).listen(PUERTO, () => console.log(`Puente en http://localhost:${PUERTO}  (PIN de docente: ${process.env.DOCENTE_PIN || "2026"})`));
}
main();

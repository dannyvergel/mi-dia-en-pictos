// Registro de accesos (auditoría).
//  GET [?evento=&limite=]   → admins de escuela (eventos de su escuela) y plataforma (todo). Sin datos personales.
//  GET ?accion=limpieza      → limpieza de retención (cron diario de Vercel). Exige Authorization: Bearer CRON_SECRET.
//                              Borra chat > CHAT_RETENCION_DIAS, auditoría > AUDITORIA_RETENCION_DIAS, feedback viejo,
//                              límites, sesiones vencidas, códigos viejos y métricas > METRICAS_RETENCION_DIAS (400).
//                              Las fichas inactivas solo se cuentan.
//  GET ?accion=uso           → «Uso del piloto» (admin.html): últimas 8 semanas de métricas agregadas. Solo ADMIN_EMAIL.
const { dbActiva } = require("./_lib/db");
const { exigirDocente } = require("./_lib/auth");
const S = require("./_lib/seguridad");
const auditoria = require("./_lib/auditoria");
const { limpiar, plazos } = require("./_lib/retencion");
const metricas = require("./_lib/metricas");
const { consulta, exigirJson, manejarError, errorPublico } = require("./_lib/http");

function cronOk(req) {
  const s = process.env.CRON_SECRET;
  return !!s && s.length >= 16 && S.igualSeguro(String(req.headers.authorization || ""), "Bearer " + s);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) return res.status(400).json({ error: "Modo demo: sin base de datos no hay registro de accesos." });
    if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
    if (!exigirJson(req, res)) return;
    if (consulta(req, "accion") === "limpieza") {
      if (!cronOk(req)) return res.status(401).json({ error: "No autorizado" });
      const r = await limpiar();
      console.log("[puente] limpieza de retención", JSON.stringify(r));
      return res.status(200).json({ ok: true, plazos: plazos(), borrado: r });
    }
    const yo = await exigirDocente(req, res);
    if (!yo) return;
    if (consulta(req, "accion") === "uso") {
      S.exigirPlataforma(yo); // solo la cuenta de ADMIN_EMAIL, ni siquiera la dirección de una escuela
      return res.status(200).json({ semanas: await metricas.resumenSemanas(8), retencion_dias: plazos().metricas });
    }
    if (!yo.es_admin && !S.esPlataforma(yo)) throw errorPublico("Solo la dirección de la escuela o la plataforma ven el registro de accesos.", 403);
    const eventos = await auditoria.listar(yo, { evento: consulta(req, "evento") || "", limite: consulta(req, "limite") });
    return res.status(200).json({ eventos, plataforma: S.esPlataforma(yo), plazos: plazos(), tipos: auditoria.EVENTOS });
  } catch (e) { manejarError(res, e); }
};

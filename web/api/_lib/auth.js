// Quién está pidiendo: con base de datos, sesión (cookie). Sin base (modo demo), el PIN de siempre.
const { dbActiva } = require("./db");
const { leerSesion } = require("./seguridad");
const { pinOk } = require("./pin");

// Devuelve el docente (o {demo:true}) si puede seguir; si no, responde 401 y devuelve null.
async function exigirDocente(req, res) {
  if (!dbActiva()) {
    if (pinOk(req)) return { demo: true };
    res.status(401).json({ error: "PIN de docente incorrecto" });
    return null;
  }
  const s = await leerSesion(req);
  if (s?.tipo === "docente") return s.usuario;
  res.status(401).json({ error: "Iniciá sesión como docente", login: "/login.html" });
  return null;
}

async function exigirSesion(req, res, tipos = ["docente", "familia"]) {
  const s = await leerSesion(req);
  if (s && tipos.includes(s.tipo)) return s;
  res.status(401).json({ error: "Iniciá sesión", login: "/login.html" });
  return null;
}

module.exports = { exigirDocente, exigirSesion };

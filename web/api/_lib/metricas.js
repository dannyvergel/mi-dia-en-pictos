// Métricas de uso del piloto: contadores diarios, agregados por escuela. Sirven para ver si el piloto anda
// sin seguir a nadie: la tabla metricas_diarias tiene solo (fecha, escuela_id, clave, cantidad).
// Nunca se guarda user_id, alumno_id, email, IP ni user agent.
//
// Claves:
//   dia_cargado          la seño publica un día nuevo para la familia (una vez por alumno y fecha: republicar no suma).
//                        Va con la fecha del día del alumno, no con la fecha en que se publicó.
//   dia_visto_familia    una familia abre su espacio el mismo día y ese día ya está publicado. Una vez por alumno y fecha:
//                        para no contar dos veces se usa un hash con una sal al azar que vive solo en la memoria de la
//                        instancia y cambia cada día (no se guarda en ningún lado). Si dos instancias distintas atienden
//                        a la misma familia el mismo día, puede contar de más; la vista lo acota a los días cargados.
//   invitacion_aceptada  alguien entra con un link de invitación (docente o familia).
// minutos_carga no se mide: hoy la app no registra cuánto tarda la seño en cargar un día.
//
// escuela_id = 0 significa "sin escuela". Se borra a los METRICAS_RETENCION_DIAS (400 por defecto), en la limpieza diaria.
// Sumar nunca rompe el pedido: si falla, queda en los logs.
const crypto = require("crypto");
const { q } = require("./db");
const { hoyLocal } = require("./http");

const CLAVES = ["dia_cargado", "dia_visto_familia", "invitacion_aceptada"];
const fechaOk = f => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(Date.parse(f + "T00:00:00Z"));

async function sumar(clave, { escuela_id = null, fecha = hoyLocal(), cantidad = 1 } = {}) {
  try {
    if (!CLAVES.includes(clave) || !fechaOk(fecha)) return false;
    const n = Math.trunc(Number(cantidad));
    if (!(n > 0)) return false;
    await q(`INSERT INTO metricas_diarias (fecha, escuela_id, clave, cantidad) VALUES ($1::date, $2, $3, $4)
      ON CONFLICT (fecha, escuela_id, clave) DO UPDATE SET cantidad = metricas_diarias.cantidad + EXCLUDED.cantidad`,
      [fecha, Number(escuela_id) || 0, clave, n]);
    return true;
  } catch (e) { console.error("[puente] métrica falló:", e.message); return false; }
}

// Días nuevos de una publicación: las fechas que antes no estaban (hasta hoy; una fecha futura no cuenta).
async function diasCargados(escuela_id, fechasAntes = [], fechasAhora = []) {
  const hoy = hoyLocal();
  const antes = new Set(fechasAntes);
  const nuevas = [...new Set(fechasAhora)].filter(f => fechaOk(f) && f <= hoy && !antes.has(f));
  for (const f of nuevas) await sumar("dia_cargado", { escuela_id, fecha: f });
  return nuevas.length;
}

// Deduplicación efímera de "visto": sal al azar por día, solo en memoria. No se puede reconstruir quién vio qué.
let memo = { dia: "", sal: null, vistos: new Set() };
const MAX_VISTOS = 50000;
async function diaVisto(escuela_id, alumno_id, fecha = hoyLocal()) {
  if (memo.dia !== fecha) memo = { dia: fecha, sal: crypto.randomBytes(32), vistos: new Set() };
  const h = crypto.createHash("sha256").update(memo.sal).update(`${Number(alumno_id)}|${fecha}`).digest("hex");
  if (memo.vistos.has(h)) return false;
  if (memo.vistos.size >= MAX_VISTOS) memo.vistos.clear();
  memo.vistos.add(h);
  return sumar("dia_visto_familia", { escuela_id, fecha });
}
// Solo tests: olvida la memoria (simula otra instancia o el día siguiente).
const olvidarVistos = () => { memo = { dia: "", sal: null, vistos: new Set() }; };

// ---------- Vista para la plataforma: últimas N semanas (lunes a domingo, hora de Argentina) ----------
const masDias = (f, n) => new Date(Date.parse(f + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function lunesDe(f) { const d = new Date(f + "T00:00:00Z").getUTCDay(); return masDias(f, -((d + 6) % 7)); }

async function resumenSemanas(semanas = 8, hoy = hoyLocal()) {
  const n = Math.min(Math.max(Number(semanas) || 8, 1), 26);
  const desde = masDias(lunesDe(hoy), -7 * (n - 1));
  const filas = await q(`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, escuela_id, clave, cantidad
    FROM metricas_diarias WHERE fecha >= $1::date AND fecha <= $2::date`, [desde, hoy]);
  const lista = Array.from({ length: n }, (_, i) => {
    const inicio = masDias(desde, 7 * i);
    return { desde: inicio, hasta: masDias(inicio, 6), dias_cargados: 0, dias_vistos_mismo_dia: 0, pct_vistos_mismo_dia: null, escuelas_activas: 0, invitaciones_aceptadas: 0 };
  });
  const porDia = new Map(); // "fecha|escuela" → { cargados, vistos }
  for (const f of filas) {
    const k = `${f.fecha}|${Number(f.escuela_id)}`;
    const x = porDia.get(k) || { fecha: f.fecha, escuela: Number(f.escuela_id), cargados: 0, vistos: 0, invit: 0 };
    if (f.clave === "dia_cargado") x.cargados += Number(f.cantidad);
    if (f.clave === "dia_visto_familia") x.vistos += Number(f.cantidad);
    if (f.clave === "invitacion_aceptada") x.invit += Number(f.cantidad);
    porDia.set(k, x);
  }
  const activas = lista.map(() => new Set());
  for (const x of porDia.values()) {
    const i = Math.floor((Date.parse(x.fecha) - Date.parse(desde)) / (7 * 864e5));
    if (i < 0 || i >= n) continue;
    const s = lista[i];
    s.dias_cargados += x.cargados;
    s.dias_vistos_mismo_dia += Math.min(x.vistos, x.cargados); // nunca más vistos que cargados
    s.invitaciones_aceptadas += x.invit;
    if (x.cargados > 0) activas[i].add(x.escuela);
  }
  lista.forEach((s, i) => {
    s.escuelas_activas = activas[i].size;
    s.pct_vistos_mismo_dia = s.dias_cargados ? Math.round(100 * s.dias_vistos_mismo_dia / s.dias_cargados) : null;
  });
  return lista;
}

module.exports = { CLAVES, sumar, diasCargados, diaVisto, olvidarVistos, resumenSemanas, lunesDe };

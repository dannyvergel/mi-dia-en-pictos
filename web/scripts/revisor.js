// Crea o actualiza la cuenta de revisión de Google Play y su escuela ficticia (idempotente: se puede correr las veces que quieras).
//   PowerShell:  $env:DATABASE_URL = "postgres://..."; $env:REVISOR_EMAIL = "revision@puentepictos.app"; node scripts/revisor.js
// Deja:
//  · «Escuela de prueba (revisión)» (escuelas.tipo = 'revision'): no ocupa cupo del piloto ni aparece en el padrón.
//  · La docente REVISOR_EMAIL, NO admin (ve solo sus alumnos asignados de esa escuela, nada de otras escuelas).
//  · Tres alumnos ficticios (Juan, Sofi, Tomi) asignados a ella, con su ficha (apoyos y objetivos, sin contactos de familia).
//  · Dos días cargados por alumno en su espacio de familia (Vercel Blob), si hay BLOB_READ_WRITE_TOKEN. Sin esa variable,
//    la base queda lista y los días se saltean (avisa).
// No toca ninguna otra escuela ni cuenta. Si REVISOR_EMAIL ya es una docente de una escuela real, o es ADMIN_EMAIL, no hace nada.
// La contraseña no se maneja acá: va como hash en REVISOR_CLAVE_HASH (scripts/revisor-clave.js).
const crypto = require("crypto");
const { db, dbActiva, q, uno } = require("../api/_lib/db");
const S = require("../api/_lib/seguridad");
const almacen = require("../api/_lib/almacen");
const { minimoParaPublicar } = require("../api/_lib/funciones");
const { TIPO_ESCUELA, ESCUELA_NOMBRE } = require("../api/_lib/revisor");

const NOTAS = "Escuela ficticia para la revisión de Google Play. No tiene datos reales.";
const DOCENTE = { nombre: "Cuenta de revisión", rol: "Docente de prueba" };
// Todo ficticio. Solo nombre de pila, sin diagnósticos, sin contactos.
const ALUMNOS = [
  { nombre: "Juan", grado: "2.º A",
    apoyos: { comunicacion: "Se comunica con pictogramas y algunas palabras.", sensoriales: "Los ruidos fuertes del recreo.", regulacion: "Los auriculares y un rincón tranquilo.",
      alimentacion: "Come solo con la cuchara, a veces necesita ayuda.", intereses: "La música y los autos.", otros: "" },
    objetivos: ["Transitar el recreo con apoyos", "Saludar a sus compañeros"] },
  { nombre: "Sofi", grado: "2.º A",
    apoyos: { comunicacion: "Habla en frases cortas.", sensoriales: "Las etiquetas de la ropa.", regulacion: "Dibujar.", alimentacion: "", intereses: "Los animales y pintar.", otros: "" },
    objetivos: ["Pedir ayuda con pictogramas", "Esperar su turno en los juegos"] },
  { nombre: "Tomi", grado: "3.º B",
    apoyos: { comunicacion: "Usa el tablero del Comunicador.", sensoriales: "", regulacion: "Saltar en la cama elástica.", alimentacion: "", intereses: "Los bloques y los trenes.", otros: "" },
    objetivos: ["Anticipar los cambios de actividad con la agenda"] }
];
const act = (hora, actividad, palabra_clave, estado) => ({ hora, actividad, palabra_clave, estado });
const DIAS = {
  Juan: [
    { animo_general: "contento", actividades: [act("08:00", "Llegó a la escuela", "llegar", "bien"), act("09:00", "Música con instrumentos", "música", "bien"),
      act("11:00", "Recreo con los auriculares", "recreo", "regular"), act("12:00", "Almorzó solo con la cuchara", "almorzar", "bien")],
      logros: ["Saludó a un compañero al llegar"], resumen_familia: "Juan tuvo un buen día. Disfrutó mucho de la música y almorzó solo." },
    { animo_general: "tranquilo", actividades: [act("08:00", "Llegó a la escuela", "llegar", "bien"), act("09:00", "Pintó con témperas", "pintar", "bien"),
      act("11:00", "Recreo en la arenera", "recreo", "bien"), act("12:00", "Almorzó con un poco de ayuda", "almorzar", "regular")],
      logros: [], resumen_familia: "Juan estuvo tranquilo. Pintó con témperas y jugó en la arenera." }
  ],
  Sofi: [
    { animo_general: "contento", actividades: [act("08:00", "Llegó a la escuela", "llegar", "bien"), act("09:30", "Leímos un cuento de animales", "leer", "bien"),
      act("11:00", "Recreo", "recreo", "bien"), act("14:00", "Dibujó", "dibujar", "bien")],
      logros: ["Pidió ayuda con el pictograma"], resumen_familia: "Sofi estuvo contenta. Le encantó el cuento de animales." },
    { animo_general: "cansado", actividades: [act("08:00", "Llegó a la escuela", "llegar", "regular"), act("09:30", "Juego de encastre", "jugar", "bien"),
      act("12:00", "Almorzó", "almorzar", "bien")],
      logros: [], resumen_familia: "Sofi llegó cansada, después se fue entusiasmando con el juego de encastre." }
  ],
  Tomi: [
    { animo_general: "tranquilo", actividades: [act("08:00", "Llegó a la escuela", "llegar", "bien"), act("09:00", "Educación física", "educación física", "bien"),
      act("10:30", "Jugó con bloques", "jugar", "bien")],
      logros: ["Miró la agenda antes de cambiar de actividad"], resumen_familia: "Tomi tuvo un día tranquilo. En educación física participó de todo." },
    { animo_general: "contento", actividades: [act("08:00", "Llegó a la escuela", "llegar", "bien"), act("09:00", "Música", "música", "bien"),
      act("11:00", "Recreo largo", "recreo", "regular")],
      logros: [], resumen_familia: "Tomi estuvo contento. El recreo largo le costó un poco y lo acompañamos." }
  ]
};

// Los dos últimos días hábiles antes de hoy (AAAA-MM-DD).
function ultimosHabiles(n, hoy = new Date()) {
  const out = [], d = new Date(hoy); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() - 1);
  while (out.length < n) { const w = d.getUTCDay(); if (w > 0 && w < 6) out.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
}

async function picto(kw) {
  try {
    const j = await (await fetch("https://api.arasaac.org/api/pictograms/es/search/" + encodeURIComponent(kw), { signal: AbortSignal.timeout(8000) })).json();
    const id = Array.isArray(j) && j.length ? j[0]._id : null;
    return id ? `https://static.arasaac.org/pictograms/${id}/${id}_500.png` : null;
  } catch { return null; }
}

// { email, pictos (buscar pictos en ARASAAC, por defecto sí), dias (publicar días, por defecto si hay Blob) } → resumen.
async function sembrar({ email = process.env.REVISOR_EMAIL, pictos = true, dias = !!process.env.BLOB_READ_WRITE_TOKEN, log = () => {} } = {}) {
  email = S.normEmail(email);
  if (!S.emailValido(email)) throw new Error("Definí REVISOR_EMAIL con un email válido (por ejemplo revision@puentepictos.app).");
  if (email === S.emailPlataforma()) throw new Error("REVISOR_EMAIL no puede ser ADMIN_EMAIL.");
  await db();
  // Nunca convierte una cuenta real en la de revisión.
  const previa = await uno(`SELECT d.id, e.tipo FROM docentes d LEFT JOIN escuelas e ON e.id = d.escuela_id WHERE d.email = $1`, [email]);
  if (previa && previa.tipo !== TIPO_ESCUELA) throw new Error(`${email} ya es una cuenta de Puente fuera de la escuela de revisión. Elegí otro REVISOR_EMAIL.`);
  if (await uno("SELECT 1 AS x FROM familias WHERE email = $1", [email])) throw new Error(`${email} ya es una cuenta de familia. Elegí otro REVISOR_EMAIL.`);

  let e = await uno("SELECT id FROM escuelas WHERE tipo = $1 ORDER BY id LIMIT 1", [TIPO_ESCUELA]);
  const escuelaNueva = !e;
  e = e ? await uno("UPDATE escuelas SET nombre = $2, activa = true, notas = $3, actualizado = now(), actualizado_por = 'scripts/revisor.js' WHERE id = $1 RETURNING id", [e.id, ESCUELA_NOMBRE, NOTAS])
    : await uno(`INSERT INTO escuelas (nombre, tipo, notas, actualizado, actualizado_por) VALUES ($1, $2, $3, now(), 'scripts/revisor.js') RETURNING id`, [ESCUELA_NOMBRE, TIPO_ESCUELA, NOTAS]);
  const escuelaId = Number(e.id);
  log(`${escuelaNueva ? "Creada" : "Actualizada"}: ${ESCUELA_NOMBRE} (#${escuelaId})`);

  const d = await uno(`INSERT INTO docentes (escuela_id, email, nombre, es_admin, rol) VALUES ($1, $2, $3, false, $4)
    ON CONFLICT (email) DO UPDATE SET escuela_id = EXCLUDED.escuela_id, nombre = EXCLUDED.nombre, es_admin = false, es_plataforma = false, activo = true, rol = EXCLUDED.rol
    RETURNING id`, [escuelaId, email, DOCENTE.nombre, DOCENTE.rol]);
  const docenteId = Number(d.id);
  log(`Cuenta de revisión: ${email} (docente #${docenteId}, sin permisos de admin)`);

  const fechas = ultimosHabiles(2), cache = {};
  let publicados = 0;
  for (const al of ALUMNOS) {
    const a = await uno(`INSERT INTO alumnos (escuela_id, nombre, grado, creado_por) VALUES ($1, $2, $3, $4)
      ON CONFLICT (escuela_id, nombre) DO UPDATE SET grado = EXCLUDED.grado RETURNING id, blob_token`, [escuelaId, al.nombre, al.grado, docenteId]);
    await q("INSERT INTO alumno_docentes (alumno_id, docente_id, asignado_por) VALUES ($1, $2, $2) ON CONFLICT DO NOTHING", [a.id, docenteId]);
    await q(`INSERT INTO fichas (alumno_id, contactos, apoyos, objetivos, actualizado, actualizado_por) VALUES ($1, '[]'::jsonb, $2::jsonb, $3::jsonb, now(), 'scripts/revisor.js')
      ON CONFLICT (alumno_id) DO UPDATE SET apoyos = EXCLUDED.apoyos, objetivos = EXCLUDED.objetivos, actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`,
      [a.id, JSON.stringify(al.apoyos), JSON.stringify(al.objetivos)]);
    if (!dias) continue;
    const registros = [];
    for (const [i, base] of DIAS[al.nombre].entries()) {
      const actividades = [];
      for (const x of base.actividades) {
        if (pictos && !(x.palabra_clave in cache)) cache[x.palabra_clave] = await picto(x.palabra_clave);
        actividades.push({ ...x, picto_url: pictos ? cache[x.palabra_clave] : null });
      }
      registros.push({ alumno: al.nombre, fecha: fechas[i], animo_general: base.animo_general, actividades, logros: base.logros, alertas: [], resumen_familia: base.resumen_familia });
    }
    registros.sort((x, y) => y.fecha.localeCompare(x.fecha));
    const token = a.blob_token || crypto.randomBytes(16).toString("hex");
    if (!a.blob_token) await q("UPDATE alumnos SET blob_token = $1 WHERE id = $2", [token, a.id]);
    await almacen.guardarFamilia(token, minimoParaPublicar({ alumno: al.nombre, actualizado: new Date().toISOString(), registros,
      ppi: [], perfil: { le_gusta: al.apoyos.intereses, lo_calma: al.apoyos.regulacion }, agenda: null, mensaje_docente: null }));
    await q("UPDATE alumnos SET publicado = now() WHERE id = $1", [a.id]);
    publicados++;
  }
  log(`Alumnos ficticios: ${ALUMNOS.map(x => x.nombre).join(", ")}` + (dias ? ` (${publicados} con 2 días cargados)` : ""));
  if (!dias) log("Sin BLOB_READ_WRITE_TOKEN: no se cargaron días. Para cargarlos, corré de nuevo con esa variable (vercel env pull la trae).");
  return { escuela_id: escuelaId, docente_id: docenteId, alumnos: ALUMNOS.map(x => x.nombre), dias: dias ? publicados * 2 : 0, escuela_nueva: escuelaNueva };
}

module.exports = { sembrar, ALUMNOS, ultimosHabiles };

if (require.main === module) {
  (async () => {
    if (!dbActiva()) { console.error("Definí DATABASE_URL (o POSTGRES_URL) primero."); process.exit(1); }
    await sembrar({ log: m => console.log(m) });
    console.log("Listo. Para entrar hace falta además REVISOR_EMAIL y REVISOR_CLAVE_HASH en Vercel (ver docs/play/guia-danny.md).");
  })().catch(e => { console.error(e.message || e); process.exit(1); });
}

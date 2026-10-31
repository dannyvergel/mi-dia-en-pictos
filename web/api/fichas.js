// Fichas de familia (una por alumno). Requiere base de datos y sesión.
// Docente: ve y edita solo los alumnos de su escuela.
//   GET [?id=]                         → alumnos con su ficha
//   POST accion=crear   { nombre }
//   POST accion=guardar { id, nombre, contactos, apoyos, objetivos, consentimiento }
//   POST accion=borrar  { id }
// Familia: ve solo los alumnos vinculados a su email (los emails de "contactos" de la ficha).
//   GET                                → sus alumnos con la ficha (solo lectura)
//   POST accion=consentir   { id, dado }
//   POST accion=mi_contacto { id, nombre, telefono }   (solo su propio contacto)
const { dbActiva, q, uno } = require("./_lib/db");
const { exigirSesion } = require("./_lib/auth");
const F = require("./_lib/fichas");
const { borrarFamilia } = require("./_lib/almacen");
const { cuerpo, consulta, exigirJson, manejarError, errorPublico } = require("./_lib/http");

const SELECT = `SELECT a.id, a.nombre, a.blob_token IS NOT NULL AS publicado, f.contactos, f.apoyos, f.objetivos, f.consentimiento, f.actualizado
  FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id`;
const forma = r => r && ({ id: Number(r.id), nombre: r.nombre, publicado: !!r.publicado, contactos: r.contactos || [], apoyos: r.apoyos || {},
  objetivos: r.objetivos || [], consentimiento: r.consentimiento || { dado: false }, actualizado: r.actualizado });

async function alumnoDeDocente(yo, id) {
  const a = await uno(`${SELECT} WHERE a.id = $1 AND a.escuela_id = $2`, [Number(id) || 0, yo.escuela_id]);
  if (!a) throw errorPublico("No encontramos ese alumno", 404);
  return a;
}
async function alumnoDeFamilia(fam, id) {
  const a = await uno(`${SELECT} JOIN familia_alumno fa ON fa.alumno_id = a.id WHERE a.id = $1 AND fa.familia_id = $2`, [Number(id) || 0, fam.id]);
  if (!a) throw errorPublico("No encontramos ese alumno", 404);
  return a;
}

// Los emails de los contactos son los que pueden entrar como familia de este alumno.
async function sincronizarFamilias(alumnoId, contactos) {
  const emails = [...new Set(contactos.map(c => c.email).filter(Boolean))];
  for (const e of emails) await q("INSERT INTO familias (email) VALUES ($1) ON CONFLICT (email) DO NOTHING", [e]);
  await q(`DELETE FROM familia_alumno WHERE alumno_id = $1 AND familia_id NOT IN (SELECT id FROM familias WHERE email = ANY($2::text[]))`, [alumnoId, emails]);
  if (emails.length) await q(`INSERT INTO familia_alumno (familia_id, alumno_id) SELECT id, $1 FROM familias WHERE email = ANY($2::text[]) ON CONFLICT DO NOTHING`, [alumnoId, emails]);
}

async function docente(req, res, yo) {
  if (req.method === "GET") {
    const id = consulta(req, "id");
    if (id) return res.status(200).json({ alumno: forma(await alumnoDeDocente(yo, id)) });
    const filas = await q(`${SELECT} WHERE a.escuela_id = $1 ORDER BY a.nombre`, [yo.escuela_id]);
    return res.status(200).json({ alumnos: filas.map(forma), apoyos: F.APOYOS });
  }
  const b = cuerpo(req);
  if (b.accion === "crear") {
    const nombre = F.validarNombre(b.nombre);
    if (await uno("SELECT 1 AS x FROM alumnos WHERE escuela_id = $1 AND lower(nombre) = lower($2)", [yo.escuela_id, nombre]))
      throw errorPublico(`Ya hay un alumno «${nombre}». Agregale una inicial para distinguirlos (ej: «${nombre} P.»).`, 409);
    const a = await uno("INSERT INTO alumnos (escuela_id, nombre, creado_por) VALUES ($1, $2, $3) RETURNING id", [yo.escuela_id, nombre, yo.id]);
    await q("INSERT INTO fichas (alumno_id, actualizado_por) VALUES ($1, $2)", [a.id, yo.email]);
    return res.status(200).json({ alumno: forma(await alumnoDeDocente(yo, a.id)) });
  }
  if (b.accion === "guardar") {
    const actual = await alumnoDeDocente(yo, b.id);
    const nombre = b.nombre != null ? F.validarNombre(b.nombre) : actual.nombre;
    const contactos = F.validarContactos(b.contactos), apoyos = F.validarApoyos(b.apoyos), objetivos = F.validarObjetivos(b.objetivos);
    let consentimiento = actual.consentimiento || { dado: false };
    if (b.consentimiento !== undefined) {
      const c = F.validarConsentimiento({ ...b.consentimiento, via: "docente" });
      // Si la familia lo dio por la app y la docente no lo cambió, se conserva tal cual.
      const igual = consentimiento.dado === c.dado && (!c.dado || (consentimiento.quien === c.quien && consentimiento.fecha === c.fecha));
      if (!igual) consentimiento = c;
    }
    if (nombre !== actual.nombre && await uno("SELECT 1 AS x FROM alumnos WHERE escuela_id = $1 AND lower(nombre) = lower($2) AND id <> $3", [yo.escuela_id, nombre, actual.id]))
      throw errorPublico(`Ya hay un alumno «${nombre}».`, 409);
    await q("UPDATE alumnos SET nombre = $1 WHERE id = $2", [nombre, actual.id]);
    await q(`INSERT INTO fichas (alumno_id, contactos, apoyos, objetivos, consentimiento, actualizado, actualizado_por)
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, now(), $6)
      ON CONFLICT (alumno_id) DO UPDATE SET contactos = EXCLUDED.contactos, apoyos = EXCLUDED.apoyos, objetivos = EXCLUDED.objetivos,
        consentimiento = EXCLUDED.consentimiento, actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`,
      [actual.id, JSON.stringify(contactos), JSON.stringify(apoyos), JSON.stringify(objetivos), JSON.stringify(consentimiento), yo.email]);
    await sincronizarFamilias(actual.id, contactos);
    return res.status(200).json({ alumno: forma(await alumnoDeDocente(yo, actual.id)) });
  }
  if (b.accion === "borrar") {
    const a = await alumnoDeDocente(yo, b.id);
    const { blob_token } = await uno("SELECT blob_token FROM alumnos WHERE id = $1", [a.id]);
    await q("DELETE FROM alumnos WHERE id = $1", [a.id]);
    if (blob_token) await borrarFamilia(blob_token); // también sus días publicados
    return res.status(200).json({ ok: true });
  }
  throw errorPublico("Acción desconocida");
}

async function familia(req, res, fam) {
  if (req.method === "GET") {
    const filas = await q(`${SELECT} JOIN familia_alumno fa ON fa.alumno_id = a.id WHERE fa.familia_id = $1 ORDER BY a.nombre`, [fam.id]);
    return res.status(200).json({ alumnos: filas.map(forma), apoyos: F.APOYOS, email: fam.email });
  }
  const b = cuerpo(req);
  const a = await alumnoDeFamilia(fam, b.id);
  const contactos = a.contactos || [];
  const yo = contactos.find(c => c.email === fam.email);
  if (b.accion === "consentir") {
    const consentimiento = b.dado
      ? { dado: true, fecha: new Date().toISOString().slice(0, 10), quien: yo ? `${yo.nombre}${yo.vinculo ? " (" + yo.vinculo + ")" : ""} · ${fam.email}` : fam.email, via: "familia" }
      : { dado: false, retirado: new Date().toISOString().slice(0, 10), quien_retiro: fam.email };
    await q("UPDATE fichas SET consentimiento = $1::jsonb, actualizado = now(), actualizado_por = $2 WHERE alumno_id = $3", [JSON.stringify(consentimiento), fam.email, a.id]);
    return res.status(200).json({ alumno: forma(await alumnoDeFamilia(fam, a.id)) });
  }
  if (b.accion === "mi_contacto") {
    if (!yo) throw errorPublico("Tu email no figura entre los contactos de esta ficha", 403);
    const [nuevo] = F.validarContactos([{ ...yo, nombre: b.nombre ?? yo.nombre, telefono: b.telefono ?? yo.telefono }]);
    const lista = contactos.map(c => c.email === fam.email ? nuevo : c);
    await q("UPDATE fichas SET contactos = $1::jsonb, actualizado = now(), actualizado_por = $2 WHERE alumno_id = $3", [JSON.stringify(lista), fam.email, a.id]);
    return res.status(200).json({ alumno: forma(await alumnoDeFamilia(fam, a.id)) });
  }
  throw errorPublico("Acción desconocida");
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!dbActiva()) return res.status(400).json({ error: "Las fichas necesitan la base de datos (modo demo activo).", modo: "demo" });
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    if (!exigirJson(req, res)) return;
    const s = await exigirSesion(req, res);
    if (!s) return;
    return s.tipo === "docente" ? await docente(req, res, s.usuario) : await familia(req, res, s.usuario);
  } catch (e) { manejarError(res, e); }
};

// Fichas de familia (una por alumno). Requiere base de datos y sesión.
// Docente: admin de la escuela → todos los alumnos de su escuela; docente no admin → solo los que tiene asignados.
//   GET [?id=]                         → alumnos con su ficha, docentes asignadas e invitaciones enviadas
//                                        (+ docentes de la escuela para asignar)
//   POST accion=crear   { nombre, contactos? }        (quien lo crea queda asignada)
//   POST accion=guardar { id, nombre, contactos, apoyos, objetivos, consentimiento }
//                                        Los emails nuevos en contactos reciben una invitación por mail (máx. 1 cada 24 h
//                                        por email + alumno). Si el mail falla, la ficha se guarda igual.
//   POST accion=invitar { id, email }  → reenviar invitación (429 si se mandó hace menos de 24 h)
//   POST accion=asignar | desasignar { id, docente_id }   (asignar: admins y docentes asignadas; quitar a otra: solo admins)
//   POST accion=borrar  { id }
//   POST accion=importar_previa | importar_confirmar | importar_enviar   (solo admins de escuela / plataforma)
//                                        Importación masiva de docentes y alumnos con familias: ver _lib/importacion.js
// Familia: ve solo los alumnos vinculados a su email (los emails de "contactos" de la ficha), de escuelas activas.
//   GET                                → sus alumnos con la ficha (solo lectura)
//   POST accion=consentir   { id, dado }
//   POST accion=mi_contacto { id, nombre, telefono }   (solo su propio contacto)
const { dbActiva, q, uno } = require("./_lib/db");
const { exigirSesion } = require("./_lib/auth");
const F = require("./_lib/fichas");
const { borrarFamilia } = require("./_lib/almacen");
const A = require("./_lib/alumnos");
const inv = require("./_lib/invitaciones");
const importacion = require("./_lib/importacion");
const { cuerpo, consulta, exigirJson, manejarError, errorPublico, hoyLocal } = require("./_lib/http");

const SELECT = `SELECT a.id, a.nombre, a.grado, a.blob_token IS NOT NULL AS publicado, f.contactos, f.apoyos, f.objetivos, f.consentimiento, f.actualizado
  FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id`;
const forma = r => r && ({ id: Number(r.id), nombre: r.nombre, grado: r.grado || "", publicado: !!r.publicado, contactos: r.contactos || [], apoyos: r.apoyos || {},
  objetivos: r.objetivos || [], consentimiento: r.consentimiento || { dado: false }, actualizado: r.actualizado });

// Suma a cada alumno sus docentes asignadas y cuándo se invitó a cada email de contacto.
async function completar(filas) {
  const ids = filas.map(r => Number(r.id));
  const [asig, invs] = await Promise.all([A.asignadas(ids), inv.enviadas(ids)]);
  return filas.map(r => ({ ...forma(r), docentes: asig[Number(r.id)] || [], invitaciones: invs[Number(r.id)] || {} }));
}

async function alumnoDeDocente(yo, id) {
  const [c, p] = A.condVisible(yo, 2);
  const a = await uno(`${SELECT} WHERE a.id = $1 AND ${c}`, [Number(id) || 0, ...p]);
  if (!a) throw errorPublico("No encontramos ese alumno", 404);
  return a;
}
const unoCompleto = async (yo, id) => (await completar([await alumnoDeDocente(yo, id)]))[0];
async function alumnoDeFamilia(fam, id) {
  const a = await uno(`${SELECT} JOIN familia_alumno fa ON fa.alumno_id = a.id JOIN escuelas e ON e.id = a.escuela_id
    WHERE a.id = $1 AND fa.familia_id = $2 AND e.activa`, [Number(id) || 0, fam.id]);
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
    if (id) return res.status(200).json({ alumno: await unoCompleto(yo, id) });
    const [c, p] = A.condVisible(yo, 1);
    const filas = await q(`${SELECT} WHERE ${c} ORDER BY a.nombre`, p);
    const docentes = await q("SELECT id, nombre, email, es_admin FROM docentes WHERE escuela_id = $1 AND activo ORDER BY nombre", [yo.escuela_id]);
    return res.status(200).json({ alumnos: await completar(filas), apoyos: F.APOYOS, docentes: docentes.map(d => ({ ...d, id: Number(d.id) })),
      yo: Number(yo.id), es_admin: !!yo.es_admin });
  }
  const b = cuerpo(req);
  if (String(b.accion || "").startsWith("importar_")) return importacion.manejar(req, res, yo, b);
  if (b.accion === "crear") {
    const nombre = F.validarNombre(b.nombre);
    const contactos = F.validarContactos(b.contactos);
    if (await uno("SELECT 1 AS x FROM alumnos WHERE escuela_id = $1 AND lower(nombre) = lower($2)", [yo.escuela_id, nombre]))
      throw errorPublico(`Ya hay un alumno «${nombre}» en la escuela. Agregale una inicial para distinguirlos (ej: «${nombre} P.»).`, 409);
    const a = await uno("INSERT INTO alumnos (escuela_id, nombre, creado_por) VALUES ($1, $2, $3) RETURNING id, nombre", [yo.escuela_id, nombre, yo.id]);
    await q("INSERT INTO fichas (alumno_id, contactos, actualizado_por) VALUES ($1, $2::jsonb, $3)", [a.id, JSON.stringify(contactos), yo.email]);
    await A.asignar(a.id, yo.id, yo.id); // quien lo crea lo tiene asignado
    await sincronizarFamilias(a.id, contactos);
    const invitaciones = await inv.invitarNuevos(req, { alumno: a, despues: contactos, docente: yo });
    return res.status(200).json({ alumno: await unoCompleto(yo, a.id), invitaciones });
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
    // Ya guardado: las invitaciones van después y nunca hacen fallar el pedido.
    const invitaciones = await inv.invitarNuevos(req, { alumno: { id: actual.id, nombre }, antes: actual.contactos || [], despues: contactos, docente: yo });
    return res.status(200).json({ alumno: await unoCompleto(yo, actual.id), invitaciones });
  }
  if (b.accion === "invitar") {
    const a = await alumnoDeDocente(yo, b.id);
    const email = String(b.email || "").trim().toLowerCase();
    const c = (a.contactos || []).find(x => x.email && x.email === email);
    if (!c) throw errorPublico("Ese email no está en los contactos de la ficha. Guardá la ficha primero.", 404);
    const r = await inv.invitar(req, { alumno: a, email, docente: yo, contacto: c.nombre });
    if (r === "reciente") throw errorPublico(`Ya le mandamos la invitación a ${email} hace menos de ${inv.HORAS} h. Probá mañana.`, 429);
    if (r === "fallo") throw errorPublico("No pudimos mandar la invitación. Probá en un rato.", 502);
    return res.status(200).json({ ok: true, alumno: await unoCompleto(yo, a.id) });
  }
  if (b.accion === "asignar" || b.accion === "desasignar") {
    const a = await alumnoDeDocente(yo, b.id);
    await A.cambiarAsignacion(yo, a.id, b.docente_id, b.accion === "asignar");
    // Si se quitó a sí misma (y no es admin) ya no lo ve.
    const sigue = await A.puedeVer(yo, a.id);
    return res.status(200).json({ ok: true, alumno: sigue ? await unoCompleto(yo, a.id) : null });
  }
  if (b.accion === "borrar") {
    const a = await alumnoDeDocente(yo, b.id);
    if (!yo.es_admin) throw errorPublico("Solo la dirección de la escuela puede borrar un alumno.", 403);
    const { blob_token } = await uno("SELECT blob_token FROM alumnos WHERE id = $1", [a.id]);
    await q("DELETE FROM alumnos WHERE id = $1", [a.id]);
    if (blob_token) await borrarFamilia(blob_token); // también sus días publicados
    return res.status(200).json({ ok: true });
  }
  throw errorPublico("Acción desconocida");
}

async function familia(req, res, fam) {
  if (req.method === "GET") {
    const filas = await q(`${SELECT} JOIN familia_alumno fa ON fa.alumno_id = a.id JOIN escuelas e ON e.id = a.escuela_id
      WHERE fa.familia_id = $1 AND e.activa ORDER BY a.nombre`, [fam.id]);
    return res.status(200).json({ alumnos: filas.map(forma), apoyos: F.APOYOS, email: fam.email });
  }
  const b = cuerpo(req);
  const a = await alumnoDeFamilia(fam, b.id);
  const contactos = a.contactos || [];
  const yo = contactos.find(c => c.email === fam.email);
  if (b.accion === "consentir") {
    const consentimiento = b.dado
      ? { dado: true, fecha: hoyLocal(), quien: yo ? `${yo.nombre}${yo.vinculo ? " (" + yo.vinculo + ")" : ""} · ${fam.email}` : fam.email, via: "familia" }
      : { dado: false, retirado: hoyLocal(), quien_retiro: fam.email };
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

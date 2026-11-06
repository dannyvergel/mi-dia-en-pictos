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
//   POST accion=borrar  { id }          Baja del alumno: borra ficha, asignaciones, invitaciones, chat, vínculos, familias sin otro
//                                        alumno y los días en Blob (solo admins de escuela; la plataforma, de cualquier escuela)
//   POST accion=baja_familia { id, email }  Baja de una familia en los alumnos de mi escuela (admins; plataforma: en todos)
//   GET ?id=&exportar=1                  Exportar la ficha del alumno (JSON). Queda en la auditoría.
//   POST accion=link_familia { id, nombre?, vinculo?, dias? }  → link de invitación (un solo uso, 7 días) ligado a este alumno,
//                                        para mandar por WhatsApp. Devuelve la URL una sola vez. Respeta el tope de cupos.
//   POST accion=link_revocar { id, link_id }   → anula un link pendiente de la familia de este alumno
//   Informes y documentos (ver _lib/documentos.js y docs/documentos.md). Docente con acceso al alumno:
//   POST accion=doc_subir   { id, tipo, titulo, nombre, mime, datos (base64), mostrar_familia?, notificar? }
//   GET ?documentos=<alumno_id>           → lista (sin la ruta del Blob)
//   GET ?documento=<doc_id>               → el archivo (attachment, no-store)
//   POST accion=doc_cambiar { doc_id, mostrar_familia?, notificar? }
//   POST accion=doc_borrar  { doc_id }    (quien lo subió o la admin de la escuela)
//   Piloto: sumar emails nuevos de familia (crear/guardar) respeta el tope de cupos (409 "El piloto está completo").
//   POST accion=importar_previa | importar_confirmar | importar_enviar   (solo admins de escuela / plataforma)
//                                        Importación masiva de docentes y alumnos con familias: ver _lib/importacion.js
// Familia: ve solo los alumnos vinculados a su email (los emails de "contactos" de la ficha), de escuelas activas.
//   GET                                → sus alumnos con la ficha (solo lectura)
//   POST accion=consentir   { id, dado }
//   POST accion=mi_contacto { id, nombre, telefono }   (solo su propio contacto)
//   POST accion=baja                   La familia pide la baja: se borran sus datos y se cierra la sesión
//   GET ?exportar=1                    Exportar mis datos (derecho de acceso). Queda en la auditoría. Incluye los metadatos
//                                        de los documentos que la escuela le muestra.
//   GET ?documentos=<alumno_id> | ?documento=<doc_id>   Solo los documentos con visible_familia (rige aunque
//                                        FAMILIA_FUNCIONES esté en el mínimo: lo decide la seño documento por documento).
const { dbActiva, q, uno } = require("./_lib/db");
const { exigirSesion } = require("./_lib/auth");
const F = require("./_lib/fichas");
const bajas = require("./_lib/bajas");
const auditoria = require("./_lib/auditoria");
const legal = require("./_lib/legal");
const S = require("./_lib/seguridad");
const A = require("./_lib/alumnos");
const inv = require("./_lib/invitaciones");
const importacion = require("./_lib/importacion");
const enlaces = require("./_lib/enlaces");
const piloto = require("./_lib/piloto");
const docs = require("./_lib/documentos");
const { cuerpo, consulta, exigirJson, manejarError, errorPublico, hoyLocal } = require("./_lib/http");

const SELECT = `SELECT a.id, a.nombre, a.grado, a.blob_token IS NOT NULL AS publicado, f.contactos, f.apoyos, f.objetivos, f.consentimiento, f.actualizado
  FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id`;
const { funcionesFamilia } = require("./_lib/funciones");
const forma = r => r && ({ id: Number(r.id), nombre: r.nombre, grado: r.grado || "", publicado: !!r.publicado, contactos: r.contactos || [], apoyos: r.apoyos || {},
  objetivos: r.objetivos || [], consentimiento: r.consentimiento || { dado: false }, actualizado: r.actualizado });

// Suma a cada alumno sus docentes asignadas y cuándo se invitó a cada email de contacto.
async function completar(filas) {
  const ids = filas.map(r => Number(r.id));
  const [asig, invs, links] = await Promise.all([A.asignadas(ids), inv.enviadas(ids), enlaces.pendientesFamilia(ids)]);
  return filas.map(r => ({ ...forma(r), docentes: asig[Number(r.id)] || [], invitaciones: invs[Number(r.id)] || {}, links_familia: links[Number(r.id)] || [] }));
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
  const ses = { tipo: "docente", usuario: yo };
  if (req.method === "GET") {
    if (consulta(req, "documento")) return docs.descargar(req, res, ses, consulta(req, "documento"));
    if (consulta(req, "documentos")) return res.status(200).json({ documentos: await docs.listarDocente(yo, consulta(req, "documentos")) });
    const id = consulta(req, "id");
    if (id) {
      const alumno = await unoCompleto(yo, id);
      const exportar = consulta(req, "exportar") === "1";
      await auditoria.registrar(req, { evento: exportar ? "exportacion" : "ficha_ver", ...auditoria.actor(ses), objeto_tipo: "alumno", objeto_id: alumno.id });
      if (exportar) return res.status(200).json({ exportado: new Date().toISOString(), alumno });
      return res.status(200).json({ alumno });
    }
    const [c, p] = A.condVisible(yo, 1);
    const filas = await q(`${SELECT} WHERE ${c} ORDER BY a.nombre`, p);
    await auditoria.registrar(req, { evento: "fichas_listar", ...auditoria.actor(ses), detalle: { alumnos: filas.length } });
    const docentes = await q("SELECT id, nombre, email, es_admin FROM docentes WHERE escuela_id = $1 AND activo ORDER BY nombre", [yo.escuela_id]);
    return res.status(200).json({ alumnos: await completar(filas), apoyos: F.APOYOS, docentes: docentes.map(d => ({ ...d, id: Number(d.id) })),
      yo: Number(yo.id), es_admin: !!yo.es_admin });
  }
  const b = cuerpo(req);
  if (String(b.accion || "").startsWith("importar_")) return importacion.manejar(req, res, yo, b);
  if (b.accion === "doc_subir") return res.status(200).json(await docs.subir(req, yo, b));
  if (b.accion === "doc_cambiar") return res.status(200).json(await docs.cambiar(req, yo, b));
  if (b.accion === "doc_borrar") return res.status(200).json(await docs.borrar(req, yo, b));
  if (b.accion === "crear") {
    if (yo.escuela_id == null) throw errorPublico("Tu cuenta no tiene escuela: los alumnos los cargan las docentes de cada escuela.", 403);
    const nombre = F.validarNombre(b.nombre);
    const contactos = F.validarContactos(b.contactos);
    await piloto.exigirCupo((await piloto.familiasNuevas(contactos.map(c => c.email))).length);
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
    // Piloto: cada email nuevo de familia es una cuenta (un cupo). Se corta antes de guardar nada.
    const previos = new Set((actual.contactos || []).map(x => x.email).filter(Boolean));
    await piloto.exigirCupo((await piloto.familiasNuevas(contactos.map(c => c.email).filter(e => e && !previos.has(e)))).length);
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
    await auditoria.registrar(req, { evento: "ficha_editar", ...auditoria.actor(ses), objeto_tipo: "alumno", objeto_id: actual.id });
    // Las familias que se sacaron de la ficha y quedaron sin alumnos se borran (con sus sesiones y códigos).
    const antes = new Set((actual.contactos || []).map(x => x.email).filter(Boolean)), ahora = new Set(contactos.map(x => x.email).filter(Boolean));
    const quitados = [...antes].filter(e => !ahora.has(e));
    if (quitados.length) await bajas.borrarFamiliasHuerfanas((await q("SELECT id FROM familias WHERE email = ANY($1::text[])", [quitados])).map(f => f.id), { invitaciones: false });
    // Ya guardado: las invitaciones van después y nunca hacen fallar el pedido.
    const invitaciones = await inv.invitarNuevos(req, { alumno: { id: actual.id, nombre }, antes: actual.contactos || [], despues: contactos, docente: yo });
    return res.status(200).json({ alumno: await unoCompleto(yo, actual.id), invitaciones });
  }
  // Cuenta de revisión de Google Play: no manda invitaciones ni crea links reales para familias (no ocupa cupo ni escribe a terceros).
  if ((b.accion === "invitar" || b.accion === "link_familia") && require("./_lib/revisor").esRevisor(yo))
    throw errorPublico("En la cuenta de revisión no se invitan familias. Es una escuela de prueba con datos ficticios.", 403);
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
  if (b.accion === "link_familia") {
    const a = await alumnoDeDocente(yo, b.id);
    return res.status(200).json({ enlace: await enlaces.crearFamilia(req, yo, a.id, b), alumno: await unoCompleto(yo, a.id) });
  }
  if (b.accion === "link_revocar") {
    const a = await alumnoDeDocente(yo, b.id);
    const l = await uno("SELECT id FROM enlaces WHERE id = $1 AND alumno_id = $2", [Number(b.link_id) || 0, a.id]);
    if (!l) throw errorPublico("No encontramos ese link", 404);
    await enlaces.revocar(req, yo, l.id);
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
    const plataforma = S.esPlataforma(yo);
    // La plataforma puede dar de baja alumnos de cualquier escuela; una admin, solo de la suya.
    const a = plataforma ? await uno("SELECT id FROM alumnos WHERE id = $1", [Number(b.id) || 0]) : await alumnoDeDocente(yo, b.id);
    if (!a) throw errorPublico("No encontramos ese alumno", 404);
    if (!yo.es_admin && !plataforma) throw errorPublico("Solo la dirección de la escuela puede borrar un alumno.", 403);
    const resumen = await bajas.bajaAlumno(req, yo, a.id);
    return res.status(200).json({ ok: true, resumen,
      ...(resumen.blob_borrado ? {} : { aviso: "Se borró todo de la base, pero algunos archivos (días publicados o documentos) no se pudieron borrar todavía. Avisale a la plataforma." }) });
  }
  if (b.accion === "baja_familia") {
    const plataforma = S.esPlataforma(yo);
    const a = plataforma ? await uno("SELECT id FROM alumnos WHERE id = $1", [Number(b.id) || 0]) : await alumnoDeDocente(yo, b.id);
    if (!a) throw errorPublico("No encontramos ese alumno", 404);
    if (!yo.es_admin && !plataforma) throw errorPublico("Solo la dirección de la escuela puede dar de baja a una familia.", 403);
    const email = S.normEmail(b.email);
    const f = await uno("SELECT f.id FROM familias f JOIN familia_alumno fa ON fa.familia_id = f.id WHERE f.email = $1 AND fa.alumno_id = $2", [email, a.id]);
    if (!f) throw errorPublico("Ese email no está vinculado a este alumno", 404);
    // Alcance: los alumnos de mi escuela (la plataforma: todos).
    const alcance = plataforma ? null : (await q("SELECT id FROM alumnos WHERE escuela_id = $1", [yo.escuela_id])).map(r => Number(r.id));
    const resumen = await bajas.bajaFamilia(req, ses, f.id, alcance);
    return res.status(200).json({ ok: true, resumen, alumno: await A.puedeVer(yo, a.id) ? await unoCompleto(yo, a.id) : null });
  }
  throw errorPublico("Acción desconocida");
}

async function familia(req, res, fam) {
  const ses = { tipo: "familia", usuario: fam };
  if (req.method === "GET") {
    // Informes y documentos: solo los que la escuela marcó visibles (docs/documentos.md).
    if (consulta(req, "documento")) return docs.descargar(req, res, ses, consulta(req, "documento"));
    if (consulta(req, "documentos")) return res.status(200).json({ documentos: await docs.listarFamilia(fam, consulta(req, "documentos")) });
    const filas = await q(`${SELECT} JOIN familia_alumno fa ON fa.alumno_id = a.id JOIN escuelas e ON e.id = a.escuela_id
      WHERE fa.familia_id = $1 AND e.activa ORDER BY a.nombre`, [fam.id]);
    if (consulta(req, "exportar") === "1") { // derecho de acceso: todo lo que Puente guarda de esta familia
      const chat = await q("SELECT alumno_id, rol, texto, creado FROM chat_turnos WHERE usuario_tipo = 'familia' AND usuario_id = $1 ORDER BY id", [fam.id]);
      await auditoria.registrar(req, { evento: "exportacion", ...auditoria.actor(ses), detalle: { alumnos: filas.length } });
      return res.status(200).json({ exportado: new Date().toISOString(), email: fam.email, alumnos: filas.map(forma),
        chat: chat.map(t => ({ ...t, alumno_id: Number(t.alumno_id) })),
        documentos: await docs.exportarFamilia(fam) }); // metadatos (sin los archivos: cada uno se baja desde Puente)
    }
    await auditoria.registrar(req, { evento: "ficha_ver", ...auditoria.actor(ses), detalle: { alumnos: filas.length } });
    // Fuera de la exportación, la familia ve solo lo prendido en FAMILIA_FUNCIONES (ver _lib/funciones.js).
    const fx = funcionesFamilia();
    const vista = r => { const f = forma(r); if (!fx.ficha) { delete f.apoyos; delete f.objetivos; } return f; };
    return res.status(200).json({ alumnos: filas.map(vista), apoyos: F.APOYOS, email: fam.email, privacidad: legal.VERSION_PRIVACIDAD });
  }
  const b = cuerpo(req);
  if (b.accion === "baja") {
    if (b.confirmar !== true) throw errorPublico("Confirmá la baja");
    const resumen = await bajas.bajaFamilia(req, ses, fam.id, null);
    await S.cerrarSesion(req, res);
    return res.status(200).json({ ok: true, resumen });
  }
  const a = await alumnoDeFamilia(fam, b.id);
  const contactos = a.contactos || [];
  const yo = contactos.find(c => c.email === fam.email);
  if (b.accion === "consentir") {
    const consentimiento = b.dado
      ? { dado: true, fecha: hoyLocal(), quien: yo ? `${yo.nombre}${yo.vinculo ? " (" + yo.vinculo + ")" : ""} · ${fam.email}` : fam.email, via: "familia",
          // Versión del texto de privacidad que aceptó (privacidad.html).
          version: legal.VERSION_PRIVACIDAD, texto: legal.URL_PRIVACIDAD }
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
    // exigirJson solo frena escrituras sin JSON; los GET (incluida la descarga de un documento) pasan.
    if (!exigirJson(req, res)) return;
    const s = await exigirSesion(req, res);
    if (!s) return;
    return s.tipo === "docente" ? await docente(req, res, s.usuario) : await familia(req, res, s.usuario);
  } catch (e) { manejarError(res, e); }
};

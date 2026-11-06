// Links de invitación del piloto cerrado.
//  · Docente: lo crea una admin de escuela (solo para su escuela) o la plataforma (para cualquier escuela, o una nueva desde
//    el padrón por CUE). La persona abre el link, pone su nombre y su email, valida el código de siempre y la cuenta queda
//    creada y aprobada en esa escuela (admin si el link lo dice).
//  · Profesional sin escuela: lo crea solo la plataforma. Crea un espacio propio (escuelas.tipo = 'independiente') y el link
//    deja a la persona como admin de ese espacio: suma alumnos y familias como cualquier escuela. Ocupa un cupo.
//  · Familia: lo crea desde la ficha una docente que ve a ese alumno. Queda ligado al alumno: al usarlo, el email se suma a
//    los contactos de la ficha y la familia entra a su espacio (después da el consentimiento ahí, como siempre).
//  · Equipo (enfoque equipo, docs/enfoques.md): la plataforma abre el espacio de un chico (escuelas.tipo = 'equipo') con su
//    alumno y el link de la familia (dueña); si lo pidió un/a profesional, también el link de esa persona. Después invitan la
//    familia o cualquier integrante aprobado: link tipo 'docente' en un espacio de equipo, con un rol. Quien lo usa queda
//    PENDIENTE hasta que la familia lo aprueba. No se manda mail: el link se comparte por WhatsApp (el código llega al abrirlo).
// Por defecto: un solo uso y 7 días. Se pueden revocar. Solo se guarda el hash del token (SHA-256): el link completo se
// muestra una sola vez, al crearlo. El token va en el fragmento (#invitacion=…), así no queda en logs ni en Referer.
// Respetan el tope de cupos (_lib/piloto.js): no se crean links, ni se usa uno pendiente, si el piloto está completo.
// Cada link creado, usado o revocado queda en la auditoría (invitacion_creada / invitacion_usada / invitacion_revocada).
const crypto = require("crypto");
const { q, uno } = require("./db");
const S = require("./seguridad");
const F = require("./fichas");
const A = require("./alumnos");
const piloto = require("./piloto");
const padron = require("./padron");
const auditoria = require("./auditoria");
const { mandarCodigo } = require("./correo");
const { entrar } = require("./identidad");
const { errorPublico, urlPublica } = require("./http");

const DIAS_DEFECTO = 7, DIAS_MAX = 30, USOS_MAX = 15;
const VENTANA = 15, MAX_CODIGOS_EMAIL = 3, MAX_CODIGOS_IP = 10, MAX_VERIF_IP = 30, MAX_INFO_IP = 60, MAX_INTENTOS = 5, VIGENCIA_MIN = 10;
const ZONA = process.env.PUENTE_ZONA || "America/Argentina/Buenos_Aires";
const txt = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const entero = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : def; };
const fechaCorta = d => new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const hashToken = t => S.sha256("enlace:" + t);
const hashCodigo = (enlaceId, email, codigo) => S.hmac(`codigo:invitacion:${enlaceId}:${email}:${codigo}`);

function estadoDe(l) {
  if (l.revocado) return "revocado";
  if (Number(l.usos) >= Number(l.usos_max)) return "usado";
  if (new Date(l.expira) <= new Date()) return "vencido";
  return "pendiente";
}
const forma = l => ({
  id: Number(l.id), tipo: l.tipo, estado: estadoDe(l), escuela_id: Number(l.escuela_id), escuela: l.escuela_nombre || undefined,
  independiente: l.escuela_tipo === "independiente", equipo: l.escuela_tipo === "equipo", rol: l.rol || "",
  alumno_id: l.alumno_id != null ? Number(l.alumno_id) : null, alumno: l.alumno_nombre || undefined, es_admin: !!l.es_admin,
  etiqueta: l.etiqueta || "", vinculo: l.vinculo || "", usos: Number(l.usos), usos_max: Number(l.usos_max), expira: l.expira, creado: l.creado,
  creado_por: l.creador_nombre || undefined, usado: l.usado || null, revocado: l.revocado || null
});

function mensajeWhatsapp(l, url) {
  const vence = fechaCorta(l.expira);
  const indep = l.escuela_tipo === "independiente";
  if (l.escuela_tipo === "equipo" && l.tipo === "familia")
    return `Hola! Abrimos en Puente el espacio de ${l.alumno_nombre} para seguir su día con pictogramas junto a sus profesionales. Vos sos quien decide quién entra. Entrá con este link, poné tu email y el código que te llega (sin contraseña): ${url} . Es personal, sirve una sola vez y vence el ${vence}.`;
  if (l.escuela_tipo === "equipo")
    return `Hola! Te invito a sumarte en Puente al equipo de ${l.alumno_nombre}${l.rol ? " como " + l.rol : ""}. Entrá con este link, poné tu email y el código que te llega (sin contraseña): ${url} . La familia tiene que aprobarte antes de que veas algo. Es personal, sirve una sola vez y vence el ${vence}.`;
  if (indep && l.tipo === "familia")
    return `Hola! Te invito a Puente para seguir el día de ${l.alumno_nombre} con pictogramas. Entrá con este link, poné tu email y el código que te llega (sin contraseña): ${url} . Es personal, sirve una sola vez y vence el ${vence}.`;
  if (indep)
    return `Hola! Te invito a Puente (piloto) para que armes las tiras de pictogramas de tus pacientes o alumnos, sin depender de una escuela. Entrá con este link, poné tu email y el código que te llega (sin contraseña): ${url} . Es personal, sirve una sola vez y vence el ${vence}.`;
  return l.tipo === "familia"
    ? `Hola! Desde ${l.escuela_nombre} te invitamos a Puente para seguir el día de ${l.alumno_nombre} en la escuela, con pictogramas. Entrá con este link, poné tu email y el código que te llega (sin contraseña): ${url} . Es personal, sirve una sola vez y vence el ${vence}.`
    : `Hola! Te invito a Puente (piloto) en ${l.escuela_nombre}. Entrá con este link, poné tu email y el código que te llega (sin contraseña): ${url} . Es personal${Number(l.usos_max) === 1 ? ", sirve una sola vez" : ""} y vence el ${vence}.`;
}

const SELECT = `SELECT l.*, es.nombre AS escuela_nombre, es.activa AS escuela_activa, es.tipo AS escuela_tipo, a.nombre AS alumno_nombre, d.nombre AS creador_nombre
  FROM enlaces l JOIN escuelas es ON es.id = l.escuela_id LEFT JOIN alumnos a ON a.id = l.alumno_id LEFT JOIN docentes d ON d.id = l.creado_por`;

// yo: docente que crea el link; con datos.creado_por_familia, lo crea esa familia (yo = { id } de la familia).
async function insertar(req, yo, datos) {
  const token = crypto.randomBytes(24).toString("base64url");
  const fam = datos.creado_por_familia ?? null;
  const r = await uno(`INSERT INTO enlaces (token_hash, tipo, escuela_id, alumno_id, es_admin, etiqueta, vinculo, usos_max, expira, creado_por, rol, creado_por_familia)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' days')::interval, $10, $11, $12) RETURNING id`,
    [hashToken(token), datos.tipo, datos.escuela_id, datos.alumno_id ?? null, !!datos.es_admin, datos.etiqueta || "", datos.vinculo || "",
      datos.usos_max, String(datos.dias), fam ? null : yo.id, datos.rol || "", fam]);
  const l = await uno(`${SELECT} WHERE l.id = $1`, [r.id]);
  await auditoria.registrar(req, { evento: "invitacion_creada", actor_tipo: fam ? "familia" : "docente", actor_id: fam ?? yo.id, escuela_id: l.escuela_id,
    objeto_tipo: "enlace", objeto_id: l.id, detalle: { tipo: l.tipo, usos_max: l.usos_max, dias: datos.dias, ...(l.alumno_id ? { alumno_id: Number(l.alumno_id) } : {}), ...(l.es_admin ? { admin: true } : {}) } });
  const url = `${urlPublica(req)}/login.html#invitacion=${token}`;
  return { ...forma(l), url, whatsapp: `https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp(l, url))}`, mensaje: mensajeWhatsapp(l, url) };
}

// Link para una seño (o directiva). b: { escuela_id?, cue? (solo plataforma), es_admin?, etiqueta?, dias?, usos? }
async function crearDocente(req, yo, b) {
  const plataforma = S.esPlataforma(yo);
  if (!yo.es_admin && !plataforma) throw errorPublico("Solo la dirección de la escuela (o la plataforma) puede invitar docentes.", 403);
  let escuela;
  const cue = String(b.cue ?? "").trim();
  if (cue) {
    if (!plataforma) throw errorPublico("Solo podés invitar docentes a tu escuela.", 403);
    if (!/^\d{9}$/.test(cue)) throw errorPublico("El CUE tiene que tener 9 números");
    escuela = (await padron.escuelaPorCue(cue))?.escuela;
    if (!escuela) throw errorPublico("No encontramos ese CUE en el padrón.", 404);
  } else {
    const id = b.escuela_id == null || b.escuela_id === "" ? Number(yo.escuela_id) : Number(b.escuela_id);
    if (id !== Number(yo.escuela_id) && !plataforma) throw errorPublico("Solo podés invitar docentes a tu escuela.", 403);
    escuela = await uno("SELECT id, nombre, tipo FROM escuelas WHERE id = $1 AND activa", [id || 0]);
    if (!escuela) throw errorPublico("No encontramos esa escuela (o está desactivada).", 404);
    if (escuela.tipo === "equipo") return crearMiembro(req, { tipo: "docente", usuario: yo }, Number(escuela.id), b);
  }
  await piloto.exigirCupo(1);
  return insertar(req, yo, { tipo: "docente", escuela_id: Number(escuela.id), es_admin: !!b.es_admin, etiqueta: txt(b.etiqueta, 80),
    usos_max: entero(b.usos, 1, 1, USOS_MAX), dias: entero(b.dias, DIAS_DEFECTO, 1, DIAS_MAX) });
}

// Link para un/a profesional sin escuela (solo plataforma). b: { nombre (de la persona), espacio? (nombre del espacio), dias? }
// Crea su espacio (escuelas.tipo = 'independiente') y un link de un solo uso que la deja como admin de ese espacio.
async function crearIndependiente(req, yo, b) {
  if (!S.esPlataforma(yo)) throw errorPublico("Solo la plataforma puede invitar profesionales sin escuela.", 403);
  const nombre = txt(b.nombre ?? b.etiqueta, 80);
  if (nombre.length < 2) throw errorPublico("Escribí el nombre de la persona que invitás.");
  const espacio = txt(b.espacio, 100) || `Espacio de ${nombre}`;
  await piloto.exigirCupo(1);
  const e = await uno(`INSERT INTO escuelas (nombre, tipo, notas, actualizado, actualizado_por) VALUES ($1, 'independiente', $2, now(), 'plataforma')
    RETURNING id`, [espacio, "Profesional sin escuela: " + nombre]);
  return insertar(req, yo, { tipo: "docente", escuela_id: Number(e.id), es_admin: true, etiqueta: nombre,
    usos_max: 1, dias: entero(b.dias, DIAS_DEFECTO, 1, DIAS_MAX) });
}

// ---------- enfoque equipo ----------
// Abre el espacio de equipo de un chico (solo plataforma, por ahora; ver docs/enfoques.md).
// b: { alumno (nombre de pila), espacio?, abre: 'familia' | 'profesional', vinculo?, familia_nombre?, profesional_nombre?, rol?, dias? }
// Crea el espacio, el alumno con su ficha vacía y el link de la familia (siempre). Si lo abre un/a profesional, también su
// link (queda pendiente hasta que la familia lo apruebe). Respeta el tope de cupos (1 o 2 cuentas nuevas).
async function crearEquipo(req, yo, b) {
  if (!S.esPlataforma(yo)) throw errorPublico("Por ahora los espacios de equipo los abre la plataforma.", 403);
  const nombre = F.validarNombre(b.alumno);
  const abre = b.abre === "profesional" ? "profesional" : "familia";
  const rol = abre === "profesional" ? A.txtRol(b.rol) : "";
  const profesional = abre === "profesional" ? txt(b.profesional_nombre, 80) : "";
  if (abre === "profesional" && rol.length < 2) throw errorPublico("Elegí o escribí el rol del/la profesional (fono, TO, psicopedagoga…).");
  const dias = entero(b.dias, DIAS_DEFECTO, 1, DIAS_MAX);
  await piloto.exigirCupo(abre === "profesional" ? 2 : 1);
  const espacio = txt(b.espacio, 100) || `Equipo de ${nombre}`;
  const e = await uno(`INSERT INTO escuelas (nombre, tipo, abierto_por, notas, actualizado, actualizado_por) VALUES ($1, 'equipo', $2, $3, now(), 'plataforma')
    RETURNING id`, [espacio, abre, `Espacio de equipo (un chico). Lo abrió: ${abre}.`]);
  const a = await uno("INSERT INTO alumnos (escuela_id, nombre, creado_por) VALUES ($1, $2, $3) RETURNING id", [e.id, nombre, yo.id]);
  await q("INSERT INTO fichas (alumno_id, actualizado_por) VALUES ($1, 'plataforma')", [a.id]);
  await auditoria.registrar(req, { evento: "equipo_creado", actor_tipo: "docente", actor_id: yo.id, escuela_id: e.id, objeto_tipo: "alumno", objeto_id: a.id,
    detalle: { abre } });
  const familia = await insertar(req, yo, { tipo: "familia", escuela_id: Number(e.id), alumno_id: Number(a.id), etiqueta: txt(b.familia_nombre, 60),
    vinculo: txt(b.vinculo, 30), usos_max: 1, dias });
  const pro = abre === "profesional" ? await insertar(req, yo, { tipo: "docente", escuela_id: Number(e.id), alumno_id: Number(a.id), etiqueta: profesional,
    rol, usos_max: 1, dias }) : null;
  return { equipo: { escuela_id: Number(e.id), alumno_id: Number(a.id), espacio, abierto_por: abre }, familia, profesional: pro };
}

// Link para sumar un/a profesional a un equipo. actor: { tipo: 'docente' | 'familia', usuario }.
// Pueden: la plataforma, un integrante con acceso (aprobado + confidencialidad) o una familia del chico.
// b: { nombre? (de la persona), rol, dias? }. Un solo uso. Quien lo use queda pendiente de aprobación de la familia.
async function crearMiembro(req, actor, escuelaId, b) {
  const e = await uno("SELECT id, tipo, activa FROM escuelas WHERE id = $1", [Number(escuelaId) || 0]);
  if (!e || e.tipo !== "equipo" || !e.activa) throw errorPublico("No encontramos ese espacio de equipo (o está desactivado).", 404);
  const alumno = await A.alumnoDelEspacio(e.id);
  if (!alumno) throw errorPublico("Ese espacio todavía no tiene al chico cargado.", 409);
  const yo = actor.usuario;
  const puede = actor.tipo === "familia"
    ? !!(await uno("SELECT 1 AS x FROM familia_alumno WHERE familia_id = $1 AND alumno_id = $2", [yo.id, alumno.id]))
    : S.esPlataforma(yo) || await A.miembroConAcceso(yo.id, e.id);
  if (!puede) throw errorPublico("Solo la familia o alguien del equipo puede invitar a otro/a profesional.", 403);
  const rol = A.txtRol(b.rol);
  if (rol.length < 2) throw errorPublico("Elegí o escribí el rol (fono, TO, psicopedagoga, maestra integradora…).");
  await piloto.exigirCupo(1);
  return insertar(req, yo, { tipo: "docente", escuela_id: Number(e.id), alumno_id: Number(alumno.id), etiqueta: txt(b.nombre ?? b.etiqueta, 80), rol,
    usos_max: 1, dias: entero(b.dias, DIAS_DEFECTO, 1, DIAS_MAX), ...(actor.tipo === "familia" ? { creado_por_familia: yo.id } : {}) });
}

// Links pendientes para sumar profesionales a un equipo (la familia y los integrantes los ven y pueden anular).
async function pendientesEquipo(escuelaId) {
  const filas = await q(`${SELECT} WHERE l.escuela_id = $1 AND l.tipo = 'docente' AND es.tipo = 'equipo' AND l.revocado IS NULL AND l.usos < l.usos_max
    AND l.expira > now() ORDER BY l.id`, [Number(escuelaId) || 0]);
  return filas.map(forma);
}
// Anula un link pendiente de profesional de un equipo. Quien llama ya verificó que es familia del chico o integrante con acceso.
async function revocarEnEquipo(req, actor, escuelaId, id) {
  const l = await uno(`${SELECT} WHERE l.id = $1 AND l.escuela_id = $2 AND es.tipo = 'equipo'`, [Number(id) || 0, Number(escuelaId) || 0]);
  if (!l) throw errorPublico("No encontramos ese link", 404);
  if (estadoDe(l) !== "pendiente") throw errorPublico("Ese link ya no está pendiente (se usó, venció o ya estaba anulado).", 409);
  await q("UPDATE enlaces SET revocado = now(), revocado_por = $2 WHERE id = $1 AND revocado IS NULL", [l.id, actor.usuario.id]);
  await auditoria.registrar(req, { evento: "invitacion_revocada", actor_tipo: actor.tipo, actor_id: actor.usuario.id, escuela_id: l.escuela_id,
    objeto_tipo: "enlace", objeto_id: l.id, detalle: { tipo: l.tipo } });
}

// ¿Esta cuenta de docente ya ocupa un cupo? (escuela activa o equipo vivo; la plataforma nunca).
async function ocupaCupo(docenteId) {
  const r = await uno(`SELECT d.email, coalesce(e.activa, false) OR ${A.sqlEnEquipoVivo("d.id")} AS ocupa
    FROM docentes d LEFT JOIN escuelas e ON e.id = d.escuela_id WHERE d.id = $1 AND d.activo`, [docenteId]);
  return !!r?.ocupa && !S.esPlataforma(r);
}

// Link para la familia de un alumno (quien llama ya verificó que la docente ve a ese alumno). Siempre de un solo uso.
async function crearFamilia(req, yo, alumnoId, b) {
  const a = await uno("SELECT a.id, a.escuela_id, f.contactos FROM alumnos a LEFT JOIN fichas f ON f.alumno_id = a.id WHERE a.id = $1", [Number(alumnoId) || 0]);
  if (!a) throw errorPublico("No encontramos ese alumno", 404);
  if ((a.contactos || []).length >= 6) throw errorPublico("La ficha ya tiene 6 contactos: sacá uno antes de invitar a otra persona.", 409);
  await piloto.exigirCupo(1);
  return insertar(req, yo, { tipo: "familia", escuela_id: Number(a.escuela_id), alumno_id: Number(a.id), etiqueta: txt(b.nombre ?? b.etiqueta, 60),
    vinculo: txt(b.vinculo, 30), usos_max: 1, dias: entero(b.dias, DIAS_DEFECTO, 1, DIAS_MAX) });
}

// Links visibles: plataforma → todos; admin de escuela → los de su escuela; con alumnoId → solo los de ese alumno.
async function listar(yo, { alumnoId = null, limite = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limite) || 100, 1), 300);
  let filas;
  if (alumnoId) filas = await q(`${SELECT} WHERE l.alumno_id = $1 ORDER BY l.id DESC LIMIT $2`, [Number(alumnoId), lim]);
  else if (S.esPlataforma(yo)) filas = await q(`${SELECT} ORDER BY l.id DESC LIMIT $1`, [lim]);
  else filas = await q(`${SELECT} WHERE l.escuela_id = $1 ORDER BY l.id DESC LIMIT $2`, [yo.escuela_id, lim]);
  return filas.map(forma);
}

// Links pendientes de familia por alumno: { alumno_id: [link] } (para la ficha).
async function pendientesFamilia(alumnoIds) {
  if (!alumnoIds.length) return {};
  const filas = await q(`${SELECT} WHERE l.tipo = 'familia' AND l.alumno_id = ANY($1::bigint[]) AND l.revocado IS NULL AND l.usos < l.usos_max
    AND l.expira > now() ORDER BY l.id`, [alumnoIds.map(Number)]);
  const out = {};
  for (const l of filas) (out[Number(l.alumno_id)] ||= []).push(forma(l));
  return out;
}

async function revocar(req, yo, id) {
  const l = await uno(`${SELECT} WHERE l.id = $1`, [Number(id) || 0]);
  const plataforma = S.esPlataforma(yo);
  const puede = l && (plataforma || (Number(l.escuela_id) === Number(yo.escuela_id)
    && (yo.es_admin || (l.tipo === "familia" && await A.puedeVer(yo, l.alumno_id)))));
  if (!puede) throw errorPublico("No encontramos ese link", 404);
  if (estadoDe(l) !== "pendiente") throw errorPublico("Ese link ya no está pendiente (se usó, venció o ya estaba anulado).", 409);
  await q("UPDATE enlaces SET revocado = now(), revocado_por = $2 WHERE id = $1 AND revocado IS NULL", [l.id, yo.id]);
  await auditoria.registrar(req, { evento: "invitacion_revocada", actor_tipo: "docente", actor_id: yo.id, escuela_id: l.escuela_id,
    objeto_tipo: "enlace", objeto_id: l.id, detalle: { tipo: l.tipo } });
  return forma(await uno(`${SELECT} WHERE l.id = $1`, [l.id]));
}

// ---------- usar el link (público: lo abre la persona invitada) ----------
async function usable(token) {
  const t = String(token || "").trim();
  const l = /^[A-Za-z0-9_-]{20,100}$/.test(t) ? await uno(`${SELECT} WHERE l.token_hash = $1`, [hashToken(t)]) : null;
  if (!l) throw errorPublico("Este link de invitación no es válido. Pedile uno nuevo a quien te invitó.", 404);
  const e = estadoDe(l);
  if (e === "revocado") throw errorPublico("Este link de invitación fue anulado. Pedile uno nuevo a quien te invitó.", 410);
  if (e === "usado") throw errorPublico("Este link de invitación ya se usó. Si ya creaste tu cuenta, entrá con tu email.", 410);
  if (e === "vencido") throw errorPublico("Este link de invitación venció. Pedile uno nuevo a quien te invitó.", 410);
  if (!l.escuela_activa || (l.tipo === "familia" && !l.alumno_nombre)) throw errorPublico("Este link de invitación ya no sirve. Pedile uno nuevo a quien te invitó.", 410);
  return l;
}

async function limitar(clave, max) {
  if (await S.superaLimite(clave, max, VENTANA)) throw errorPublico("Demasiados intentos. Esperá 15 minutos.", 429);
  await S.registrarIntento(clave);
}

// ¿Usar este link con este email suma una cuenta (ocupa un cupo)? Corta si el email ya tiene acceso.
async function sumaCuenta(l, email) {
  if (l.tipo === "docente" && l.escuela_tipo === "equipo") {
    const d = await uno("SELECT id, activo FROM docentes WHERE email = $1", [email]);
    if (!d?.activo) return true;
    const ya = await uno("SELECT estado FROM equipo_miembros WHERE escuela_id = $1 AND docente_id = $2 AND estado = ANY($3::text[])", [l.escuela_id, d.id, A.ESTADOS_VIVOS]);
    if (ya) throw errorPublico(ya.estado === "pendiente" ? `Ya estás esperando que la familia de ${l.alumno_nombre} te apruebe: entrá desde «Soy docente».`
      : `Ya sos parte del equipo de ${l.alumno_nombre}: entrá desde «Soy docente».`, 409);
    return !(await ocupaCupo(d.id));
  }
  if (l.tipo === "docente") {
    const d = await uno("SELECT id, activo FROM docentes WHERE email = $1", [email]);
    if (d?.activo) throw errorPublico("Ese email ya tiene cuenta de docente en Puente: entrá desde «Soy docente».", 409);
    return true;
  }
  const ya = await uno("SELECT 1 AS x FROM familias f JOIN familia_alumno fa ON fa.familia_id = f.id WHERE f.email = $1 AND fa.alumno_id = $2", [email, l.alumno_id]);
  if (ya) throw errorPublico(`Ese email ya puede entrar como familia de ${l.alumno_nombre}: entrá desde «Soy familia».`, 409);
  return (await piloto.familiasNuevas([email])).length > 0;
}

async function info(req, token) {
  await limitar("invitacion:info:" + S.ipDe(req), MAX_INFO_IP);
  const l = await usable(token);
  const c = await piloto.cupos();
  const equipo = l.escuela_tipo === "equipo";
  return { ok: true, tipo: l.tipo, escuela: l.escuela_nombre, independiente: l.escuela_tipo === "independiente", equipo, rol: equipo ? l.rol || "" : undefined,
    alumno: l.tipo === "familia" || equipo ? l.alumno_nombre : undefined, es_admin: !!l.es_admin,
    nombre: l.etiqueta || "", expira: l.expira, completo: c.completo, ...(c.completo ? { mensaje: piloto.textoCompleto(c) } : {}) };
}

async function pedirCodigo(req, token, emailPedido) {
  const email = S.normEmail(emailPedido);
  const l = await usable(token);
  if (!S.emailValido(email)) throw errorPublico("Revisá el email");
  await limitar("codigo:ip:" + S.ipDe(req), MAX_CODIGOS_IP);
  await limitar("codigo:email:" + email, MAX_CODIGOS_EMAIL);
  if (await sumaCuenta(l, email)) await piloto.exigirCupo(1);
  if (l.tipo === "familia") {
    const f = await uno("SELECT contactos FROM fichas WHERE alumno_id = $1", [l.alumno_id]);
    const cs = f?.contactos || [];
    if (!cs.some(c => c.email === email) && cs.length >= 6) throw errorPublico("La ficha ya tiene 6 contactos. Avisale a la escuela.", 409);
  }
  const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  await q("UPDATE codigos SET usado = true WHERE email = $1 AND tipo = 'invitacion' AND NOT usado", [email]);
  await q("INSERT INTO codigos (email, tipo, codigo_hash, expira) VALUES ($1, 'invitacion', $2, now() + ($3 || ' minutes')::interval)",
    [email, hashCodigo(l.id, email, codigo), String(VIGENCIA_MIN)]);
  const envio = await mandarCodigo(email, codigo);
  return { ok: true, mensaje: `Te mandamos un código a ${email}. Revisá tu correo (y el spam).`, ...(envio.codigo_dev ? { codigo_dev: envio.codigo_dev } : {}) };
}

// Verifica el código, usa el link (atómico, con el tope de cupos) y crea la cuenta aprobada. Abre la sesión.
async function verificar(req, res, b) {
  const email = S.normEmail(b.email), codigo = String(b.codigo || "").replace(/\D/g, "");
  await limitar("verif:ip:" + S.ipDe(req), MAX_VERIF_IP);
  const l = await usable(b.token);
  const malo = errorPublico("El código no es correcto o ya venció. Pedí uno nuevo si hace falta.", 401);
  if (!S.emailValido(email)) throw malo;
  const fallo = async () => { await auditoria.loginFallido(req, l.tipo, email); return malo; };
  if (codigo.length !== 6) throw await fallo();
  const c = await uno(`UPDATE codigos SET intentos = intentos + 1
    WHERE id = (SELECT id FROM codigos WHERE email = $1 AND tipo = 'invitacion' AND NOT usado AND expira > now() ORDER BY creado DESC LIMIT 1)
      AND intentos < $2 RETURNING id, codigo_hash`, [email, MAX_INTENTOS]);
  if (!c || !S.igualSeguro(c.codigo_hash, hashCodigo(l.id, email, codigo))) throw await fallo();
  await q("UPDATE codigos SET usado = true WHERE id = $1", [c.id]);

  let nombre = txt(b.nombre, 80) || l.etiqueta || "";
  if (l.tipo === "docente" && nombre.length < 2) throw errorPublico("Escribí tu nombre y apellido.");
  const suma = await sumaCuenta(l, email);
  // Usa el link solo si sigue pendiente y, si suma una cuenta, si queda cupo (todo en una sentencia).
  const max = piloto.maxUsuarios();
  const usado = await uno(`UPDATE enlaces SET usos = usos + 1, usado = now() WHERE id = $1 AND revocado IS NULL AND expira > now() AND usos < usos_max
    AND (NOT $2::boolean OR $3::int = 0 OR ${piloto.sqlUsados(4)} < $3) RETURNING id`, [l.id, suma, max, piloto.paramAdmin()]);
  if (!usado) {
    const cu = await piloto.cupos();
    if (suma && cu.completo) throw Object.assign(errorPublico(piloto.textoCompleto(cu), 409), { completo: true });
    throw errorPublico("Este link de invitación ya se usó o venció. Pedile uno nuevo a quien te invitó.", 410);
  }
  let cuenta, actorId, miembroId = null;
  try {
    if (l.tipo === "docente" && l.escuela_tipo === "equipo") {
      // Enfoque equipo: la cuenta no cambia de escuela (puede no tener, o ser seño de otra). Queda pendiente de la familia.
      const existe = await uno("SELECT id, activo FROM docentes WHERE email = $1", [email]);
      if (existe && !existe.activo) {
        await q("UPDATE docentes SET activo = true, escuela_id = NULL, es_admin = false, nombre = $2 WHERE id = $1", [existe.id, nombre || "Profesional"]);
        await q("DELETE FROM alumno_docentes WHERE docente_id = $1", [existe.id]);
        actorId = existe.id; cuenta = "reactivada";
      } else if (existe) { actorId = existe.id; cuenta = "existente"; }
      else {
        actorId = (await uno("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES (NULL, $1, $2, false) RETURNING id", [email, nombre])).id;
        cuenta = "nueva";
      }
      const invTipo = l.creado_por_familia ? "familia" : "docente", invId = l.creado_por_familia ?? l.creado_por;
      const m = await uno(`INSERT INTO equipo_miembros (escuela_id, docente_id, rol, estado, enlace_id, invitado_por_tipo, invitado_por)
        VALUES ($1, $2, $3, 'pendiente', $4, $5, $6)
        ON CONFLICT (escuela_id, docente_id) DO UPDATE SET estado = 'pendiente', rol = EXCLUDED.rol, enlace_id = EXCLUDED.enlace_id,
          invitado_por_tipo = EXCLUDED.invitado_por_tipo, invitado_por = EXCLUDED.invitado_por, creado = now(), resuelto = NULL,
          resuelto_por_tipo = NULL, resuelto_por = NULL, motivo = '', confidencialidad = NULL, confidencialidad_version = NULL
        WHERE equipo_miembros.estado IN ('rechazado', 'baja') RETURNING id`, [l.escuela_id, actorId, l.rol || "", l.id, invTipo, invId ?? null]);
      if (!m) throw errorPublico(`Ya estás en el equipo de ${l.alumno_nombre}: entrá desde «Soy docente».`, 409);
      miembroId = m.id;
    } else if (l.tipo === "docente") {
      const existe = await uno("SELECT id FROM docentes WHERE email = $1", [email]);
      if (existe) {
        const d = await uno("UPDATE docentes SET activo = true, escuela_id = $2, nombre = $3, es_admin = $4 WHERE id = $1 AND NOT activo RETURNING id",
          [existe.id, l.escuela_id, nombre, !!l.es_admin]);
        if (!d) throw errorPublico("Ese email ya tiene cuenta de docente en Puente: entrá desde «Soy docente».", 409);
        await q("DELETE FROM alumno_docentes ad USING alumnos a WHERE ad.alumno_id = a.id AND ad.docente_id = $1 AND a.escuela_id <> $2", [d.id, l.escuela_id]);
        actorId = d.id; cuenta = "reactivada";
      } else {
        actorId = (await uno("INSERT INTO docentes (escuela_id, email, nombre, es_admin) VALUES ($1, $2, $3, $4) RETURNING id",
          [l.escuela_id, email, nombre, !!l.es_admin])).id;
        cuenta = "nueva";
      }
    } else {
      const f = await uno("SELECT contactos FROM fichas WHERE alumno_id = $1", [l.alumno_id]);
      const cs = f?.contactos || [];
      if (!cs.some(x => x.email === email)) {
        const lista = F.validarContactos([...cs, { nombre: nombre || l.vinculo || "Familia", vinculo: l.vinculo || "", email, telefono: "" }]);
        await q(`INSERT INTO fichas (alumno_id, contactos, actualizado_por) VALUES ($1, $2::jsonb, $3)
          ON CONFLICT (alumno_id) DO UPDATE SET contactos = EXCLUDED.contactos, actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`,
          [l.alumno_id, JSON.stringify(lista), "invitacion"]);
      }
      await q("INSERT INTO familias (email) VALUES ($1) ON CONFLICT (email) DO NOTHING", [email]);
      actorId = (await uno("SELECT id FROM familias WHERE email = $1", [email])).id;
      await q("INSERT INTO familia_alumno (familia_id, alumno_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [actorId, l.alumno_id]);
      cuenta = suma ? "nueva" : "existente";
    }
  } catch (e) {
    await q("UPDATE enlaces SET usos = greatest(usos - 1, 0) WHERE id = $1", [l.id]); // no se usó: queda pendiente
    if (String(e.code) === "23505") throw errorPublico("Ese email ya tiene cuenta en Puente: entrá con tu email.", 409);
    throw e;
  }
  await q("UPDATE enlaces SET usado_por_tipo = $2, usado_por = $3 WHERE id = $1", [l.id, l.tipo, actorId]);
  await auditoria.registrar(req, { evento: "invitacion_usada", actor_tipo: l.tipo, actor_id: actorId, email, escuela_id: l.escuela_id,
    objeto_tipo: "enlace", objeto_id: l.id, detalle: { tipo: l.tipo, cuenta, ...(l.alumno_id ? { alumno_id: Number(l.alumno_id) } : {}) } });
  if (miembroId) await auditoria.registrar(req, { evento: "miembro_alta", actor_tipo: "docente", actor_id: actorId, escuela_id: l.escuela_id,
    objeto_tipo: "miembro", objeto_id: miembroId, detalle: { docente_id: Number(actorId), invitado_por: l.creado_por_familia ? "familia" : "docente", estado: "pendiente" } });
  const sesion = await entrar(res, l.tipo, email, "invitacion");
  if (!sesion) throw errorPublico("La cuenta quedó creada, pero no pudimos abrir la sesión. Entrá con tu email.", 500);
  await auditoria.registrar(req, { evento: "login_ok", actor_tipo: l.tipo, actor_id: actorId, email,
    escuela_id: l.tipo === "docente" ? l.escuela_id : null, detalle: { metodo: "invitacion" } });
  return miembroId ? { ...sesion, equipo_pendiente: true } : sesion;
}

module.exports = { crearDocente, crearIndependiente, crearEquipo, crearMiembro, pendientesEquipo, revocarEnEquipo, ocupaCupo, crearFamilia, listar, pendientesFamilia, revocar, info, pedirCodigo, verificar, estadoDe, hashToken, DIAS_DEFECTO };

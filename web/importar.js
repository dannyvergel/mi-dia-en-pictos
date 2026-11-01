// Pestaña "Importar" del panel docente (solo admins de escuela y plataforma).
// Lee CSV (UTF-8 o Windows-1252, con ; o ,) y XLSX en el navegador; manda las filas como JSON a /api/fichas:
// importar_previa (no escribe) → importar_confirmar (escribe todo junto) → importar_enviar (mails pendientes, de a tandas).
// SheetJS (xlsx.mini 0.20.3, Apache-2.0) está copiado en vendor/ y se carga recién al usarlo, con SRI.
window.Importar = (() => {
  const $ = id => document.getElementById(id);
  const { api, esc } = Puente;
  const XLSX_SRC = "vendor/xlsx.mini.min.js";
  const XLSX_SRI = "sha384-NG/W3xvO3ynQEcDQYIOcZTXRtwUs83cLv1FIl9PuqWPDuNhsMRF6wutlNLFwlb71";
  const COLS_DOC = ["nombre", "email", "rol", "admin"];
  const COLS_AL = ["nombre", "grado", "docentes", ...[1, 2, 3].flatMap(n => ["nombre", "vinculo", "email", "telefono"].map(c => `contacto${n}_${c}`))];
  const INSTRUCCIONES = [
    ["Puente · Importar docentes y alumnos con sus familias"],
    [""],
    ["Hoja «docentes»: una fila por docente de la escuela."],
    ["  nombre (obligatorio), email (obligatorio: entra con ese mail y un código, sin contraseña)"],
    ["  rol: grado o función (ej. «Maestra de 3° A», «Integradora»)"],
    ["  admin: «sí» si también administra la escuela; «no» para quitarlo; vacío = no cambia (las nuevas quedan sin admin)"],
    [""],
    ["Hoja «alumnos-familias»: una fila por alumno."],
    ["  nombre (obligatorio): SOLO nombre de pila, ej. «Juan» o «Juan P.». Sin apellido."],
    ["  grado (obligatorio): ej. «3° A», «Sala de 5»"],
    ["  docentes: emails de sus docentes separados por coma. Tienen que ser docentes de la escuela o estar en la hoja «docentes»."],
    ["  contacto1_nombre, contacto1_vinculo, contacto1_email, contacto1_telefono … hasta 6 contactos (agregá contacto4_… si hace falta)."],
    ["  Cada email de contacto puede entrar como familia de ese alumno y recibe una invitación por mail al confirmar."],
    [""],
    ["Privacidad: no escribas apellidos, diagnósticos, datos de salud ni fotos. Solo datos necesarios."],
    ["Si reimportás la misma planilla no se duplica nada: la docente se reconoce por email y el alumno por nombre + grado."],
    [""],
    ["Ejemplo (ficticio) de alumnos-familias:"],
    COLS_AL.slice(0, 7),
    ["Juan", "3° A", "seno.bea@escuela.edu.ar", "Laura", "mamá", "laura@ejemplo.com", "341 555-0000"]
  ];

  let ESCUELA = null, TABLAS = { docentes: null, alumnos: null }, PREVIA = null, cargado = false;
  const msg = (t, err) => { $("msgImp").textContent = t; $("msgImp").className = err ? "error" : "muted"; };
  const clave = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  // ---------- plantillas ----------
  function bajar(nombre, tipo, datos) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([datos], { type: tipo }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // CSV con ; y BOM: Excel en español lo abre con las tildes bien.
  const csv = cols => "\ufeff" + cols.join(";") + "\r\n";
  let xlsxPromesa = null;
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return xlsxPromesa ||= new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = XLSX_SRC; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous";
      s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxPromesa = null; mal(new Error("No pudimos cargar el lector de Excel. Probá con CSV.")); };
      document.head.appendChild(s);
    });
  }
  async function plantillaXlsx() {
    const X = await cargarXlsx();
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([COLS_DOC]), "docentes");
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([COLS_AL]), "alumnos-familias");
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(INSTRUCCIONES), "instrucciones");
    bajar("puente-plantilla.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", X.write(wb, { type: "array", bookType: "xlsx" }));
  }

  // ---------- lectura de archivos ----------
  function tipoDe(nombre, filas) {
    const n = clave(nombre);
    if (n.includes("instruc")) return null;
    if (n.includes("docente")) return "docentes";
    if (n.includes("alumno") || n.includes("familia")) return "alumnos";
    const enc = (filas.find(f => f.some(c => String(c).trim())) || []).map(clave);
    if (enc.includes("grado") || enc.some(h => h.startsWith("contacto"))) return "alumnos";
    if (enc.includes("email") || enc.includes("mail") || enc.includes("correo")) return "docentes";
    return null;
  }
  async function textoDe(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch { return new TextDecoder("windows-1252").decode(buf); } // CSV guardado por Excel "CSV (delimitado por comas)"
  }
  const sinVaciasAlFinal = filas => { let n = filas.length; while (n && !filas[n - 1].some(c => String(c).trim())) n--; return filas.slice(0, n); };
  const contar = t => Array.isArray(t) ? Math.max(0, t.filter(f => f.some(c => String(c).trim())).length - 1) : Math.max(0, t.split(/\r\n|\n|\r/).filter(l => l.replace(/[;,\s"]/g, "")).length - 1);

  async function leerArchivos(files) {
    const leidas = [];
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) throw new Error(`«${f.name}» pesa más de 5 MB. Partilo en varios.`);
      if (/\.xlsx$/i.test(f.name)) {
        const X = await cargarXlsx();
        const wb = X.read(await f.arrayBuffer(), { type: "array" });
        for (const hoja of wb.SheetNames) {
          const filas = sinVaciasAlFinal(X.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: false, defval: "", blankrows: true }));
          const tipo = tipoDe(hoja, filas);
          if (tipo && filas.length > 1) leidas.push({ tipo, datos: filas, origen: `${f.name} › ${hoja}` });
        }
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const texto = await textoDe(f);
        const tipo = tipoDe(f.name, [texto.replace(/^\ufeff/, "").split(/\r\n|\n|\r/)[0].split(/[;,\t]/)]);
        if (!tipo) throw new Error(`No reconocimos «${f.name}»: usá la plantilla (la primera fila tiene que ser el encabezado).`);
        leidas.push({ tipo, datos: texto, origen: f.name });
      } else throw new Error(`«${f.name}»: solo aceptamos .csv o .xlsx`);
    }
    for (const l of leidas) TABLAS[l.tipo] = l;
    pintarArchivos();
  }
  function pintarArchivos() {
    const t = ["docentes", "alumnos"].filter(k => TABLAS[k]);
    $("impArchivos").innerHTML = t.length ? t.map(k => `<div>✓ <b>${k === "docentes" ? "Docentes" : "Alumnos y familias"}</b>: ${esc(TABLAS[k].origen)} <span class="muted">(${contar(TABLAS[k].datos)} filas)</span>
      <button type="button" class="quitar" data-k="${k}" title="Sacar">×</button></div>`).join("") : '<p class="muted">Todavía no elegiste archivos.</p>';
    $("impArchivos").querySelectorAll("button[data-k]").forEach(b => b.onclick = () => { TABLAS[b.dataset.k] = null; PREVIA = null; pintarArchivos(); pintarPrevia(); });
    $("impPrevia").disabled = !t.length;
  }

  // ---------- vista previa ----------
  const ETIQUETA = { nuevo: ["nuevo", "avanzando"], actualiza: ["actualiza", "estable"], duplicado: ["duplicado", ""], error: ["error", "estancado"] };
  const sello = e => `<span class="sello ${ETIQUETA[e]?.[1] || ""}">${esc(ETIQUETA[e]?.[0] || e)}</span>`;
  const detalle = r => [...r.mensajes.map(m => `<div class="error">${esc(m)}</div>`), ...r.avisos.map(m => `<div class="muted">${esc(m)}</div>`)].join("");
  const soloErr = () => $("impSoloErr").checked;
  function tabla(cab, filas, celdas) {
    const vis = filas.filter(r => !soloErr() || r.estado === "error");
    if (!filas.length) return "";
    return `<div class="imp-tabla"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
      ${vis.map(r => `<tr class="imp-${esc(r.estado)}">${celdas(r).map(c => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cab.length}" class="muted">Sin filas con error.</td></tr>`}</tbody></table></div>`;
  }
  const res = (o, nombre) => `${nombre}: ${o.nuevo} nuevos · ${o.actualiza} se actualizan · ${o.duplicado} repetidos · <b class="${o.error ? "error" : ""}">${o.error} con error</b>`;

  function pintarPrevia() {
    const p = PREVIA;
    $("impResultado").hidden = !p;
    if (!p) return;
    const r = p.resumen;
    const valido = r.docentes.nuevo + r.docentes.actualiza + r.alumnos.nuevo + r.alumnos.actualiza;
    $("impResumen").innerHTML = `<p>Escuela: <b>${esc(p.escuela.nombre)}</b></p>
      ${p.docentes.length ? `<p>${res(r.docentes, "Docentes")}</p>` : ""}${p.alumnos.length ? `<p>${res(r.alumnos, "Alumnos")}</p>` : ""}
      ${r.vacias ? `<p class="muted">${r.vacias} fila${r.vacias === 1 ? " vacía ignorada" : "s vacías ignoradas"}.</p>` : ""}
      <p class="muted">Al confirmar: ${r.bienvenidas} mail${r.bienvenidas === 1 ? "" : "s"} de bienvenida a docentes y ${r.invitaciones} invitaci${r.invitaciones === 1 ? "ón" : "ones"} a familias.</p>
      ${p.errores.map(e => `<p class="error">${esc(e)}</p>`).join("")}${p.avisos.map(e => `<p class="muted">${esc(e)}</p>`).join("")}`;
    $("impTablas").innerHTML =
      tabla(["Fila", "Estado", "Nombre", "Email", "Grado / rol", "Admin", "Detalle"], p.docentes, d => [d.fila, sello(d.estado), esc(d.nombre), esc(d.email), esc(d.rol), d.admin === null ? "" : d.admin ? "sí" : "no", detalle(d)])
      + tabla(["Fila", "Estado", "Nombre", "Grado", "Docentes", "Contactos", "Detalle"], p.alumnos, a => [a.fila, sello(a.estado), esc(a.nombre), esc(a.grado), a.docentes.map(esc).join("<br>"),
        a.contactos.map(c => esc([c.nombre, c.vinculo && `(${c.vinculo})`, c.email, c.telefono].filter(Boolean).join(" "))).join("<br>"), detalle(a)]);
    const omitir = $("impOmitir").checked;
    const formato = p.errores.length > 0;
    $("impConfirmar").disabled = formato || !valido || (p.hay_errores && !omitir);
    $("impConfirmar").textContent = p.hay_errores && omitir ? `Importar solo las ${valido} filas válidas` : `Confirmar e importar (${valido} filas)`;
    $("impNota").textContent = formato ? "Corregí el formato de la planilla y volvé a previsualizar."
      : p.hay_errores && !omitir ? "Hay filas con error: corregilas y volvé a previsualizar, o marcá «importar solo las filas válidas». Así no se importa nada a medias."
      : "Todavía no se guardó nada. Revisá la tabla y confirmá.";
  }

  function cuerpo(accion) {
    const b = { accion };
    if (TABLAS.docentes) b.docentes = TABLAS.docentes.datos;
    if (TABLAS.alumnos) b.alumnos = TABLAS.alumnos.datos;
    if (ESCUELA != null) b.escuela_id = ESCUELA;
    return b;
  }

  async function previsualizar() {
    msg("Revisando la planilla…"); $("impFinal").hidden = true;
    try { PREVIA = await api("api/fichas", { method: "POST", body: cuerpo("importar_previa") }); msg(""); }
    catch (e) { PREVIA = null; msg(e.message, true); }
    pintarPrevia();
  }

  async function confirmarImport() {
    if (!PREVIA) return;
    if (!confirm("¿Importar ahora? Se guardan los datos y se mandan los mails de bienvenida e invitación.")) return;
    $("impConfirmar").disabled = true; msg("Importando…");
    let r;
    try { r = await api("api/fichas", { method: "POST", body: { ...cuerpo("importar_confirmar"), huella: PREVIA.huella, omitir_errores: $("impOmitir").checked } }); }
    catch (e) {
      if (e.datos?.huella) { PREVIA = e.datos; pintarPrevia(); }
      msg(e.message, true); $("impConfirmar").disabled = false; return;
    }
    PREVIA = null; pintarPrevia();
    const tot = { enviadas: r.envios.enviadas, recientes: r.envios.recientes, fallidas: r.envios.fallidas };
    const fallidas = [...r.envios.detalle_fallidas];
    let pend = r.envios.pendientes;
    const pintar = () => {
      const R = r.resumen;
      $("impFinal").hidden = false;
      $("impFinal").innerHTML = `<p><b>Listo ✓</b> Importado en ${esc(r.escuela.nombre)}.</p>
        <p>Docentes: ${R.docentes.nuevo} nuevas, ${R.docentes.actualiza} actualizadas. Alumnos: ${R.alumnos.nuevo} nuevos, ${R.alumnos.actualiza} actualizados.
        ${r.omitidas ? `<span class="error">${r.omitidas} fila${r.omitidas === 1 ? "" : "s"} con error no se importaron.</span>` : ""}</p>
        <p>Mails: ${tot.enviadas} enviados${tot.recientes ? `, ${tot.recientes} ya se habían mandado hace menos de 24 h` : ""}${tot.fallidas ? `, <span class="error">${tot.fallidas} fallaron</span>` : ""}${pend.length ? ` · mandando ${pend.length} más…` : ""}.</p>
        ${fallidas.length ? `<p class="muted">No salieron: ${fallidas.map(f => esc(f.email)).join(", ")}. Los datos quedaron guardados; las invitaciones a familias se pueden reenviar desde cada ficha.</p>` : ""}`;
    };
    pintar(); msg("");
    while (pend.length) {
      try {
        const e = (await api("api/fichas", { method: "POST", body: { accion: "importar_enviar", pendientes: pend, ...(ESCUELA != null ? { escuela_id: ESCUELA } : {}) } })).envios;
        tot.enviadas += e.enviadas; tot.recientes += e.recientes; tot.fallidas += e.fallidas; fallidas.push(...e.detalle_fallidas);
        pend = e.pendientes;
      } catch (err) { msg(`Quedaron ${pend.length} mails sin mandar: ${err.message}`, true); break; }
      pintar();
    }
    TABLAS = { docentes: null, alumnos: null }; $("impArchivo").value = ""; pintarArchivos();
    if (typeof cargarAlumnos === "function") cargarAlumnos();
  }

  async function iniciar(yo) {
    if (cargado) return;
    cargado = true;
    $("impBajarXlsx").onclick = () => plantillaXlsx().catch(e => msg(e.message, true));
    $("impBajarDoc").onclick = () => bajar("puente-docentes.csv", "text/csv;charset=utf-8", csv(COLS_DOC));
    $("impBajarAl").onclick = () => bajar("puente-alumnos-familias.csv", "text/csv;charset=utf-8", csv(COLS_AL));
    $("impArchivo").onchange = async () => {
      PREVIA = null; pintarPrevia();
      try { await leerArchivos([...$("impArchivo").files]); msg(""); } catch (e) { msg(e.message, true); }
    };
    $("impPrevia").onclick = previsualizar;
    $("impConfirmar").onclick = confirmarImport;
    $("impOmitir").onchange = pintarPrevia;
    $("impSoloErr").onchange = pintarPrevia;
    pintarArchivos();
    if (yo.es_plataforma) {
      try {
        const r = await api("api/escuelas?todas=1");
        $("impEscuela").innerHTML = r.escuelas.map(e => `<option value="${Number(e.id)}" ${Number(e.id) === r.mi_escuela ? "selected" : ""}>${esc(e.nombre)}${e.cue ? " · CUE " + esc(e.cue) : ""}</option>`).join("");
        $("impEscuelaFila").hidden = false;
        ESCUELA = r.mi_escuela;
        $("impEscuela").onchange = () => { ESCUELA = Number($("impEscuela").value); PREVIA = null; pintarPrevia(); };
      } catch {}
    }
  }
  return { iniciar };
})();

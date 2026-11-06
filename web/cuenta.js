// Ayudas compartidas de cuentas (login, docente, familia). JS puro, sin build.
window.Puente = (() => {
  async function api(url, { method = "GET", body } = {}) {
    const r = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || "Algo falló, probá de nuevo."), { status: r.status, datos: j });
    return j;
  }
  const estado = () => api("api/auth");
  async function salir() { try { await api("api/auth", { method: "POST", body: { accion: "logout" } }); } catch {} location.href = "login.html"; }
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Mismo criterio que api/_lib/fichas.js: objetivos de la ficha → PPI del agente; apoyos → perfil funcional.
  const VACIAS = new Set(["con", "sin", "para", "por", "los", "las", "del", "una", "uno", "que", "sus", "apoyos", "usando"]);
  const ppiDe = (objetivos = []) => objetivos.map(o => {
    const palabras = o.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-zñ]+/).filter(w => w.length >= 4 && !VACIAS.has(w)).map(w => w.slice(0, 6));
    return { objetivo: o, palabras: palabras.length ? palabras : [o.toLowerCase()] };
  });
  const perfilDe = (a = {}) => ({ comunicacion: a.comunicacion || "", sensibilidades: a.sensoriales || "", lo_calma: a.regulacion || "", le_gusta: a.intereses || "",
    observaciones: [a.alimentacion && "Alimentación: " + a.alimentacion, a.otros].filter(Boolean).join(". ") });
  // Baja un archivo de la API (informes y documentos). La sesión va por cookie: fetch + blob, sin abrir la URL directa.
  async function bajarArchivo(url, nombre) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) { let j = {}; try { j = await r.json(); } catch {} throw Object.assign(new Error(j.error || "No pudimos bajar el archivo."), { status: r.status }); }
    const href = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href, download: nombre || "archivo" });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 5000);
  }
  return { api, estado, salir, esc, ppiDe, perfilDe, bajarArchivo };
})();

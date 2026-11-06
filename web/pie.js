// Pie común de Puente: aviso BETA, links legales, crédito ARASAAC, "Enviar comentario" (con sesión) y donaciones.
// Uso: <div id="puente-pie" data-feedback="si" data-donaciones="no"></div> + <script src="pie.js" defer></script>
//  · data-donaciones="no": no muestra donaciones (espacio de la familia). Tampoco se muestran en el login de familias (?familia)
//    ni dentro de la app instalada (?app o TWA de Android): Google Play no permite pedir donaciones en la app.
//    Las donaciones nunca se piden a las familias.
//  · Los botones de donación salen de /api/config (DONACIONES_AR_URL, DONACIONES_INTL_URL): cada uno solo si su variable tiene valor.
//  · data-feedback="si": muestra "Enviar comentario" si hay sesión de docente o familia (POST /api/feedback).
//  · Idioma: sale de <html lang> (es-AR o en). En las páginas en inglés (/en/) el pie y los links legales van en inglés.
//  · Elección de idioma: el selector Español / English (nav.idiomas, lo genera scripts/idiomas.js) la guarda en
//    localStorage "puente-idioma". Si la página está en el otro idioma, se SUGIERE la versión guardada (o la del navegador
//    si no hay elección) con un aviso chico. Nunca se redirige solo: Google y la gente tienen que poder ver los dos idiomas.
const PIE_EN = /^en\b/i.test(document.documentElement.lang || "");
(() => {
  const CLAVE = "puente-idioma", aqui = PIE_EN ? "en" : "es", otro = PIE_EN ? "es" : "en";
  const leer = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
  const guardar = v => { try { localStorage.setItem(CLAVE, v); } catch { /* modo privado */ } };
  document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("[data-idioma]"); if (a) guardar(a.dataset.idioma); });
  const alt = document.querySelector(`link[rel="alternate"][hreflang="${otro === "es" ? "es-AR" : "en"}"]`);
  if (!alt) return;
  const elegido = leer();
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  const sugerir = elegido ? elegido === otro : (otro === "en" ? /^en\b/i.test(nav) : /^es\b/i.test(nav));
  if (!sugerir) return;
  const u = new URL(alt.href); const href = u.pathname + location.search + location.hash;
  const caja = document.createElement("div");
  caja.className = "aviso-idioma"; caja.setAttribute("data-nosnippet", ""); caja.lang = otro === "en" ? "en" : "es-AR";
  caja.innerHTML = otro === "en"
    ? '<span>This page is also available in English.</span> <a data-idioma="en" hreflang="en">Read it in English</a> <button type="button" class="enlace">No, thanks</button>'
    : '<span>Esta página también está en español.</span> <a data-idioma="es" hreflang="es-AR">Leerla en español</a> <button type="button" class="enlace">No, gracias</button>';
  caja.querySelector("a").href = href;
  caja.querySelector("button").onclick = () => { guardar(aqui); caja.remove(); };
  document.body.prepend(caja);
})();
(() => {
  const el = document.getElementById("puente-pie");
  if (!el) return;
  const EN = PIE_EN, base = EN ? "/en/" : "/";
  const T = EN ? {
    beta: "Puente is in a pilot: it may have bugs and may change.",
    fb: "Send feedback", fbLabel: "Your comment, idea or problem (do not include children's personal details)",
    enviar: "Send", cancelar: "Cancel", enviando: "Sending…", error: "We couldn't send it. Please try again later.", gracias: "Thank you! We got it.",
    privacidad: "Privacy", terminos: "Terms of use",
    arasaac: 'Pictograms by Sergio Palao. Source: ARASAAC (<a href="https://arasaac.org" rel="noopener">https://arasaac.org</a>). License: CC BY-NC-SA. Owner: Government of Aragón (Spain).',
    donTxt: "Puente is free and non-profit. Donations cover servers and AI.", donAr: "Donate from Argentina" } : {
    beta: "Puente está en prueba piloto: puede tener errores y cambiar.",
    fb: "Enviar comentario", fbLabel: "Tu comentario, idea o problema (no pongas datos de los chicos)",
    enviar: "Enviar", cancelar: "Cancelar", enviando: "Enviando…", error: "No pudimos enviarlo. Probá en un rato.", gracias: "¡Gracias! Lo recibimos.",
    privacidad: "Privacidad", terminos: "Términos de uso",
    arasaac: 'Autor pictogramas: Sergio Palao. Origen: ARASAAC (<a href="http://www.arasaac.org" rel="noopener">http://www.arasaac.org</a>). Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España)',
    donTxt: "Puente es gratuito y sin fines de lucro. Las donaciones cubren servidores e IA.", donAr: "Doná desde Argentina" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Dentro de la app instalada (Android desde Google Play o PWA: las dos abren con ?app, y la TWA trae referrer android-app://)
  // no se muestran donaciones: la política de pagos de Google Play no permite pedirlas en la app salvo a ONG validadas.
  const enApp = (() => {
    try {
      if (/(^|[?&])app(=|&|$)/.test(location.search.slice(1)) || document.referrer.startsWith("android-app://")) sessionStorage.setItem("puente_app", "1");
      return sessionStorage.getItem("puente_app") === "1";
    } catch { return /(^|[?&])app(=|&|$)/.test(location.search.slice(1)); }
  })();
  const sinDonaciones = enApp || el.dataset.donaciones === "no" || /(^|[?&])familia(=|&|$)/.test(location.search.slice(1));
  el.className = "pie-puente";
  el.innerHTML = `
    <p class="pie-beta"><span class="beta">BETA</span> ${T.beta}</p>
    <p class="pie-fb" hidden><button type="button" class="enlace" id="pieFbBtn">${T.fb}</button></p>
    <form class="pie-fb-form" id="pieFbForm" hidden>
      <label for="pieFbTxt">${T.fbLabel}</label>
      <textarea id="pieFbTxt" maxlength="2000" required></textarea>
      <div class="fila"><button class="big chico auto">${T.enviar}</button><button type="button" class="enlace" id="pieFbCancelar">${T.cancelar}</button></div>
      <p class="muted" id="pieFbMsg" role="status"></p>
    </form>
    <div class="pie-don" id="pieDon" hidden></div>
    <p class="pie-legal"><a href="${base}privacidad.html">${T.privacidad}</a> · <a href="${base}terminos.html">${T.terminos}</a></p>
    <p class="pie-arasaac">${T.arasaac}</p>`;

  // ---- donaciones ----
  if (!sinDonaciones) {
    fetch("/api/config", { credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(c => {
      const d = c?.donaciones || {};
      const https = u => typeof u === "string" && /^https:\/\//.test(u);
      if (!https(d.ar) && !https(d.intl)) return;
      const box = document.getElementById("pieDon");
      // En español: el texto en español y, para el botón internacional, la línea en inglés. En inglés: un solo texto.
      box.innerHTML = `<p class="pie-don-txt">${T.donTxt}</p>
        <div class="pie-don-botones">
          ${https(d.ar) ? `<div class="pie-don-item"><a class="boton-don" href="${esc(d.ar)}" target="_blank" rel="noopener">${T.donAr}</a></div>` : ""}
          ${https(d.intl) ? `<div class="pie-don-item" lang="en"><a class="boton-don" href="${esc(d.intl)}" target="_blank" rel="noopener">Donate from abroad</a>
            ${EN ? "" : `<span class="pie-don-en">Puente is free and non-profit. Donations cover servers and AI.</span>`}</div>` : ""}
        </div>`;
      box.hidden = false;
    }).catch(() => {});
  }

  // ---- feedback ----
  if (el.dataset.feedback === "si") {
    fetch("/api/auth", { credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(e => {
      if (!e?.sesion) return;
      const p = el.querySelector(".pie-fb"), f = document.getElementById("pieFbForm"), m = document.getElementById("pieFbMsg");
      p.hidden = false;
      document.getElementById("pieFbBtn").onclick = () => { f.hidden = false; p.hidden = true; document.getElementById("pieFbTxt").focus(); };
      document.getElementById("pieFbCancelar").onclick = () => { f.hidden = true; p.hidden = false; m.textContent = ""; };
      f.onsubmit = async ev => {
        ev.preventDefault();
        const b = f.querySelector("button"); b.disabled = true; b.setAttribute("aria-busy", "true"); m.textContent = T.enviando;
        try {
          const r = await fetch("/api/feedback", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto: document.getElementById("pieFbTxt").value, pagina: location.pathname.split("/").pop() || "index.html" }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(EN ? T.error : (j.error || T.error));
          document.getElementById("pieFbTxt").value = ""; m.textContent = EN ? T.gracias : (j.mensaje || T.gracias);
        } catch (e) { m.textContent = e.message; }
        b.disabled = false; b.removeAttribute("aria-busy");
      };
    }).catch(() => {});
  }
})();

// App instalable (PWA): el service worker se registra desde cualquier página que tenga el pie.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

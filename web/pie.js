// Pie común de Puente: aviso BETA, links legales, crédito ARASAAC, "Enviar comentario" (con sesión) y donaciones.
// Uso: <div id="puente-pie" data-feedback="si" data-donaciones="no"></div> + <script src="pie.js" defer></script>
//  · data-donaciones="no": no muestra donaciones (espacio de la familia). Tampoco se muestran en el login de familias (?familia)
//    ni dentro de la app instalada (?app o TWA de Android): Google Play no permite pedir donaciones en la app.
//    Las donaciones nunca se piden a las familias.
//  · Los botones de donación salen de /api/config (DONACIONES_AR_URL, DONACIONES_INTL_URL): cada uno solo si su variable tiene valor.
//  · data-feedback="si": muestra "Enviar comentario" si hay sesión de docente o familia (POST /api/feedback).
(() => {
  const el = document.getElementById("puente-pie");
  if (!el) return;
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
    <p class="pie-beta"><span class="beta">BETA</span> Puente está en prueba piloto: puede tener errores y cambiar.</p>
    <p class="pie-fb" hidden><button type="button" class="enlace" id="pieFbBtn">Enviar comentario</button></p>
    <form class="pie-fb-form" id="pieFbForm" hidden>
      <label for="pieFbTxt">Tu comentario, idea o problema (no pongas datos de los chicos)</label>
      <textarea id="pieFbTxt" maxlength="2000" required></textarea>
      <div class="fila"><button class="big chico auto">Enviar</button><button type="button" class="enlace" id="pieFbCancelar">Cancelar</button></div>
      <p class="muted" id="pieFbMsg" role="status"></p>
    </form>
    <div class="pie-don" id="pieDon" hidden></div>
    <p class="pie-legal"><a href="privacidad.html">Privacidad</a> · <a href="terminos.html">Términos de uso</a></p>
    <p class="pie-arasaac">Autor pictogramas: Sergio Palao. Origen: ARASAAC (<a href="http://www.arasaac.org" rel="noopener">http://www.arasaac.org</a>). Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España)</p>`;

  // ---- donaciones ----
  if (!sinDonaciones) {
    fetch("api/config", { credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(c => {
      const d = c?.donaciones || {};
      const https = u => typeof u === "string" && /^https:\/\//.test(u);
      if (!https(d.ar) && !https(d.intl)) return;
      const box = document.getElementById("pieDon");
      box.innerHTML = `<p class="pie-don-txt">Puente es gratuito y sin fines de lucro. Las donaciones cubren servidores e IA.</p>
        <div class="pie-don-botones">
          ${https(d.ar) ? `<div class="pie-don-item"><a class="boton-don" href="${esc(d.ar)}" target="_blank" rel="noopener">Doná desde Argentina</a></div>` : ""}
          ${https(d.intl) ? `<div class="pie-don-item" lang="en"><a class="boton-don" href="${esc(d.intl)}" target="_blank" rel="noopener">Donate from abroad</a>
            <span class="pie-don-en">Puente is free and non-profit. Donations cover servers and AI.</span></div>` : ""}
        </div>`;
      box.hidden = false;
    }).catch(() => {});
  }

  // ---- feedback ----
  if (el.dataset.feedback === "si") {
    fetch("api/auth", { credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(e => {
      if (!e?.sesion) return;
      const p = el.querySelector(".pie-fb"), f = document.getElementById("pieFbForm"), m = document.getElementById("pieFbMsg");
      p.hidden = false;
      document.getElementById("pieFbBtn").onclick = () => { f.hidden = false; p.hidden = true; document.getElementById("pieFbTxt").focus(); };
      document.getElementById("pieFbCancelar").onclick = () => { f.hidden = true; p.hidden = false; m.textContent = ""; };
      f.onsubmit = async ev => {
        ev.preventDefault();
        const b = f.querySelector("button"); b.disabled = true; b.setAttribute("aria-busy", "true"); m.textContent = "Enviando…";
        try {
          const r = await fetch("api/feedback", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto: document.getElementById("pieFbTxt").value, pagina: location.pathname.split("/").pop() || "index.html" }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || "No pudimos enviarlo. Probá en un rato.");
          document.getElementById("pieFbTxt").value = ""; m.textContent = j.mensaje || "¡Gracias! Lo recibimos.";
        } catch (e) { m.textContent = e.message; }
        b.disabled = false; b.removeAttribute("aria-busy");
      };
    }).catch(() => {});
  }
})();

// App instalable (PWA): el service worker se registra desde cualquier página que tenga el pie.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

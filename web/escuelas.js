// Autocompletar de escuelas contra nuestra API (/api/escuelas, Padrón Oficial). JS puro, sin build.
// Patrón combobox accesible (ARIA 1.2): flechas para moverse, Enter para elegir, Escape para cerrar.
//   Puente.autocompletarEscuela(input, { formulario: () => token | null, renovar: async () => {}, alElegir(escuela), alBorrar() })
// - Busca desde 3 letras, 300 ms después de la última tecla. Cancela la búsqueda anterior.
// - Si la persona sigue escribiendo después de elegir, la elección se borra (queda texto libre: carga manual).
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titulo = s => String(s || "").toLowerCase().replace(/(^|[\s(/.-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
  let n = 0;

  function autocompletarEscuela(input, { formulario = () => null, renovar = null, alElegir = () => {}, alBorrar = () => {} } = {}) {
    const id = "ac-escuela-" + (++n);
    const caja = document.createElement("div"); caja.className = "ac";
    input.parentNode.insertBefore(caja, input); caja.appendChild(input);
    const lista = document.createElement("ul"); lista.className = "ac-lista"; lista.id = id + "-lista"; lista.setAttribute("role", "listbox"); lista.hidden = true;
    lista.setAttribute("aria-label", "Escuelas encontradas");
    const estado = document.createElement("div"); estado.className = "ac-estado"; estado.setAttribute("role", "status"); estado.setAttribute("aria-live", "polite");
    const elegida = document.createElement("div"); elegida.className = "ac-elegida"; elegida.hidden = true;
    caja.append(lista, estado, elegida);
    Object.assign(input, { autocomplete: "off" });
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-controls", lista.id);
    if (!input.placeholder) input.placeholder = "Nombre, número o localidad (ej: 2085, Especial Rosario)";

    let items = [], activo = -1, timer = null, ctrl = null, ultima = "", seleccion = null;

    const cerrar = () => { lista.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); activo = -1; };
    function marcar(i) {
      activo = i;
      [...lista.children].forEach((li, j) => li.setAttribute("aria-selected", j === i ? "true" : "false"));
      if (i >= 0 && lista.children[i]) { input.setAttribute("aria-activedescendant", lista.children[i].id); lista.children[i].scrollIntoView({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    }
    function pintar() {
      lista.innerHTML = items.map((e, i) => `<li role="option" id="${id}-op-${i}" aria-selected="false" data-i="${i}">
        <span class="ac-nombre">${esc(titulo(e.nombre))}</span>${e.especial ? ' <span class="ac-esp">Especial</span>' : ""}
        <span class="ac-det">${esc(titulo(e.localidad))}${e.domicilio ? " · " + esc(titulo(e.domicilio)) : ""} · ${e.sector === "privada" ? "privada" : e.sector === "estatal" ? "estatal" : esc(e.sector)} · CUE ${esc(e.cue)}</span></li>`).join("");
      lista.hidden = !items.length; input.setAttribute("aria-expanded", items.length ? "true" : "false");
      marcar(-1);
    }
    function mostrarElegida() {
      elegida.hidden = !seleccion;
      if (!seleccion) return (elegida.innerHTML = "");
      elegida.innerHTML = `✓ Del padrón oficial: <b>CUE ${esc(seleccion.cue)}</b> · ${esc(titulo(seleccion.localidad))}${seleccion.modalidad ? " · " + esc(seleccion.modalidad) : ""}
        <button type="button" class="enlace">cambiar</button>`;
      elegida.querySelector("button").onclick = () => { borrar(); input.value = ""; input.focus(); };
    }
    function elegir(i) {
      const e = items[i]; if (!e) return;
      seleccion = e; input.value = titulo(e.nombre); ultima = input.value;
      cerrar(); mostrarElegida(); estado.textContent = "Elegiste " + titulo(e.nombre);
      alElegir(e);
    }
    function borrar() { if (!seleccion) return; seleccion = null; mostrarElegida(); alBorrar(); }

    async function buscar(texto, otraVez = false) {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      const yo = ctrl;
      estado.textContent = "Buscando…";
      try {
        const h = {}; const f = formulario(); if (f) h["X-Puente-Formulario"] = f;
        const r = await fetch("api/escuelas?q=" + encodeURIComponent(texto), { credentials: "same-origin", headers: h, signal: yo.signal });
        const j = await r.json().catch(() => ({}));
        if (yo !== ctrl) return;
        if (r.status === 401 && renovar && !otraVez) { await renovar(); if (yo === ctrl) return buscar(texto, true); return; } // venció el token
        if (!r.ok) { items = []; pintar(); estado.textContent = j.error || "No pudimos buscar ahora. Podés escribir el nombre igual."; return; }
        items = j.escuelas || []; pintar();
        estado.textContent = items.length ? `${items.length} escuela${items.length === 1 ? "" : "s"}. Usá las flechas para elegir.`
          : "No la encontramos en el padrón. Podés escribir el nombre igual.";
      } catch (e) { if (e.name !== "AbortError" && yo === ctrl) estado.textContent = "No pudimos buscar ahora. Podés escribir el nombre igual."; }
    }

    input.addEventListener("input", () => {
      if (seleccion && input.value !== ultima) borrar();
      clearTimeout(timer);
      const t = input.value.trim();
      if (t.length < 3) { if (ctrl) ctrl.abort(); items = []; pintar(); estado.textContent = t ? "Escribí al menos 3 letras o números." : ""; return; }
      timer = setTimeout(() => buscar(t), 300);
    });
    input.addEventListener("keydown", ev => {
      if (ev.key === "ArrowDown") { if (lista.hidden && items.length) { lista.hidden = false; input.setAttribute("aria-expanded", "true"); } ev.preventDefault(); marcar(Math.min(activo + 1, items.length - 1)); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); marcar(Math.max(activo - 1, 0)); }
      else if (ev.key === "Enter" && !lista.hidden && activo >= 0) { ev.preventDefault(); elegir(activo); }
      else if (ev.key === "Escape" && !lista.hidden) { ev.preventDefault(); cerrar(); }
    });
    input.addEventListener("blur", () => setTimeout(cerrar, 150));
    lista.addEventListener("mousedown", ev => ev.preventDefault()); // que el input no pierda el foco
    lista.addEventListener("click", ev => { const li = ev.target.closest("li[data-i]"); if (li) elegir(Number(li.dataset.i)); });

    return {
      get seleccion() { return seleccion; },
      // Para mostrar una escuela ya vinculada (ej. la ficha guardada) sin buscar.
      fijar(e) { seleccion = e && e.cue ? e : null; if (e?.nombre) { input.value = titulo(e.nombre); ultima = input.value; } mostrarElegida(); },
      limpiar() { seleccion = null; items = []; pintar(); mostrarElegida(); estado.textContent = ""; }
    };
  }

  window.Puente = Object.assign(window.Puente || {}, { autocompletarEscuela, tituloEscuela: titulo });
})();

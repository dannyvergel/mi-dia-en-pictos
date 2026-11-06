// «Preguntale al pizarrón»: el pizarrón de Puente (el de icono.svg) con cara, que responde preguntas frecuentes.
// 100 % del lado del cliente: SIN IA y SIN llamadas a la API (gratis, privado, sin abuso). Lo que se escribe no sale del navegador.
// Las respuestas salen de un FAQ curado (abajo) con hechos del README, privacidad.html, terminos.html e index.html.
// Si se cambia una pregunta o respuesta, hay que copiarla igual en la lista de index.html (#pzTodas): sirve sin JavaScript
// y el test test/pizarron.test.js controla que coincidan.
(function (root) {
  "use strict";
  const SOPORTE = "soporte@puentepictos.app";
  const MAILTO = "mailto:" + SOPORTE;

  // ---------- Preguntas frecuentes ----------
  // claves: palabras o frases (se normalizan igual que la pregunta). "palabra:3" le da más peso. Peso por defecto: 2 (frases: 3).
  const FAQ = [
    { id: "que-es", pregunta: "¿Qué es Puente?",
      respuesta: "Puente es una herramienta para escuelas de educación especial: la seño cuenta cómo fue el día, Puente lo arma en pictogramas y la familia lo ve en casa. Así el chico puede contarlo con dibujos, y en casa saben qué pasó.",
      claves: ["que es:3", "de que se trata:4", "para que sirve:4", "sirve", "explicame", "puente:1", "app:1", "aplicacion:1"] },
    { id: "para-quien", pregunta: "¿Para quién es?",
      respuesta: "Para escuelas de educación especial: chicos con TEA, discapacidad intelectual o necesidades de comunicación. La usan las seños y los directivos, que cuentan el día en segundos, y las familias, que lo ven con pictogramas.",
      claves: ["para quien:4", "quienes:3", "quien lo usa:4", "tea:3", "autismo:3", "discapacidad:3", "especial:2", "comunicacion:1", "chicos:1", "alumnos:1", "escuela:1"] },
    { id: "como-funciona", pregunta: "¿Cómo funciona?",
      respuesta: "Primero, la seño dicta o escribe cómo fue el día. Después, Puente lo arma en una tira de pictogramas de ARASAAC, con cada actividad en orden. Por último, la familia lo ve en su espacio privado: el día, los logros y lo que viene.",
      claves: ["como funciona:5", "funciona:2", "como se usa:5", "usar:2", "dictar:3", "dicta:3", "pasos:2", "relato:2"] },
    { id: "gratis", pregunta: "¿Cuánto cuesta?",
      respuesta: "Nada. Puente es gratuito y sin fines de lucro: no les cobra a las escuelas ni a las familias. Los datos no se venden ni se usan para publicidad.",
      claves: ["gratis:4", "publicidad:3", "lucro:3", "vender:2"] },
    { id: "sumarse", pregunta: "¿Cómo me sumo al piloto?",
      respuesta: "Puente está en una prueba piloto cerrada, con 15 cupos en total entre seños, directivos y familias. Se entra solo con un link de invitación: la dirección invita a las seños y las seños, a las familias. Si querés participar, completá el formulario «Quiero sumarme al piloto» y te escribimos.",
      claves: ["sumarse:4", "piloto:3", "invitacion:3", "cupos:3", "cupo:3", "lugar para mi escuela:4", "mi escuela:2", "registrarme:3", "cuenta nueva:3", "crear cuenta:3"],
      acciones: [{ texto: "Quiero sumarme al piloto", accion: "sumarse" }, { texto: "Escribinos un mail", href: MAILTO + "?subject=Quiero%20sumarme%20al%20piloto%20de%20Puente" }] },
    { id: "datos", pregunta: "¿Qué datos guarda?",
      respuesta: "Lo mínimo. Del alumno, solo el nombre de pila y el grado: sin apellido, sin fotos, sin DNI y sin diagnósticos. La escuela carga la ficha de apoyos y el registro del día, siempre con el consentimiento de la familia. Los datos no se venden ni se usan para publicidad.",
      claves: ["datos:3", "fotos:3", "foto:3", "diagnostico:3", "diagnosticos:3", "apellido:3", "dni:3", "consentimiento:3", "seguro:2", "seguridad:2", "menores:2", "ley:2"],
      acciones: [{ texto: "Leer la política de privacidad", href: "privacidad.html" }] },
    { id: "ia", pregunta: "¿Qué hace la IA con los datos?",
      respuesta: "La IA ayuda a ordenar el relato del día, a armar el informe de progreso y a responder las preguntas de la familia. Puente usa solo proveedores que no guardan ni entrenan con los datos, y les manda lo mínimo: el nombre de pila, nunca emails, teléfonos ni datos de salud. La seño revisa y decide.",
      claves: ["ia:4", "entrenan:4", "entrenar:4", "retencion:4", "openrouter:4", "algoritmo:3"] },
    { id: "baja", pregunta: "¿Cómo borro mis datos?",
      respuesta: "La familia puede descargar sus datos, retirar el consentimiento y pedir la baja desde su espacio. La escuela también puede dar de baja a un alumno. Con la baja se borran sus datos. Para cualquier pedido, escribinos a " + SOPORTE + ".",
      claves: ["baja:4", "darme de baja:5", "dejar de usar:4", "descargar mis datos:5", "retirar:3", "salir:2"],
      acciones: [{ texto: "Escribinos un mail", href: MAILTO + "?subject=Mis%20datos%20en%20Puente" }] },
    { id: "pictos", pregunta: "¿De dónde salen los pictogramas?",
      respuesta: "De ARASAAC. Autor de los pictogramas: Sergio Palao. Propiedad: Gobierno de Aragón (España). Licencia: CC BY-NC-SA. Por eso Puente los usa sin fines de lucro.",
      claves: ["pictos:4", "de donde salen:3", "autor:3", "licencia:3", "aragon:3", "sergio palao:4", "palao:4"],
      acciones: [{ texto: "Conocer ARASAAC", href: "https://arasaac.org" }] },
    { id: "lugar", pregunta: "¿En qué lugares funciona?",
      respuesta: "Por ahora, solo en escuelas de la provincia de Santa Fe: las escuelas se eligen del padrón oficial de establecimientos educativos. Si estás en otro lugar y te interesa, escribinos.",
      claves: ["lugar:4", "donde funciona:5", "en que lugares:5", "otra provincia:5", "mi provincia:5", "solo en:3", "pais:3"],
      acciones: [{ texto: "Escribinos un mail", href: MAILTO }] },
    { id: "donar", pregunta: "¿Cómo puedo ayudar o donar?",
      respuesta: "Puente es gratuito y sin fines de lucro, y las donaciones ayudan a cubrir los servidores y la IA. Si querés colaborar, usá el botón «Doná desde Argentina» en «Sumate a Puente», más abajo en esta página. A las familias nunca se les piden donaciones.",
      claves: ["donar:5", "como ayudo:4", "puedo ayudar:4", "quiero ayudar:4", "aporte:3", "sponsor:3"],
      acciones: [{ texto: "Doná desde Argentina", accion: "donar" }] },
    { id: "entrar", pregunta: "¿Cómo se entra?",
      respuesta: "Las seños y los directivos entran con su cuenta de Google o con un código de 6 números que les llega por mail, sin contraseña. Las familias entran con el link de invitación que les manda la escuela y un código por mail.",
      claves: ["entrar:4", "como se entra:5", "como entro:5", "contrasena:4", "codigo:3", "google:4", "login:4", "iniciar sesion:4", "no puedo entrar:5", "link:2", "clave:3"],
      acciones: [{ texto: "Entrar", href: "login.html" }, { texto: "Soy familia", href: "login.html?familia" }] },
    { id: "familia-ve", pregunta: "¿Qué ve la familia?",
      respuesta: "En su espacio privado, la familia ve los últimos días con pictogramas que se tocan y se escuchan, la agenda de lo que viene, los objetivos en los que se está trabajando y los logros. También puede preguntar sobre el día, y le responde solo con lo que registró la escuela.",
      claves: ["que ve:5", "ve la familia:5", "espacio:3", "en casa:3", "familia:2", "logros:3", "agenda:3", "whatsapp:2"] },
    { id: "instalar", pregunta: "¿Hay que instalar algo?",
      respuesta: "No hace falta. Puente se usa desde el navegador, en el celular o en la compu, entrando en puentepictos.app. Si usás Android, también hay app para bajar (todavía no está en Google Play): la de Puente, para quienes están en el piloto, y la del Comunicador, libre para cualquiera.",
      claves: ["instalar:5", "descargar la app:5", "play store:5", "celular:3", "android:3", "iphone:3", "navegador:3", "compu:2", "computadora:2", "apk:5"],
      acciones: [{ texto: "Abrir el Comunicador", href: "comunicador.html" }] },
    { id: "contacto", pregunta: "¿Cómo los contacto?",
      respuesta: "Escribinos a " + SOPORTE + ". Si ya tenés cuenta, también podés usar «Enviar comentario» al pie de la página.",
      claves: ["contacto:4", "telefono:3", "whatsapp de soporte:5", "hablar con alguien:5", "problema:2", "error:2", "duda:1", "consulta:2", "reclamo:3"],
      acciones: [{ texto: "Escribinos un mail", href: MAILTO }] },
  ];

  // Respuestas que no son del FAQ (saludo, gracias, quién soy, no entendí). No van en la lista.
  const ESPECIALES = {
    saludo: { id: "saludo", respuesta: "¡Hola! Soy el pizarrón de Puente. Preguntame lo que quieras sobre Puente, o tocá una de las preguntas de abajo." },
    gracias: { id: "gracias", respuesta: "¡De nada! Si te queda otra duda, acá estoy." },
    quien: { id: "quien", respuesta: "Soy el pizarrón de Puente. No uso IA: tengo las respuestas anotadas, y lo que escribís no sale de tu navegador." },
    nose: { id: "nose", respuesta: "Uy, esa no me la sé. Tengo anotadas solo las preguntas frecuentes sobre Puente: probá con una de abajo. Si querés sumarte, completá el formulario del piloto, o escribinos a " + SOPORTE + ".",
      acciones: [{ texto: "Quiero sumarme al piloto", accion: "sumarse" }, { texto: "Escribinos un mail", href: MAILTO }] },
  };
  // Las sugeridas que se ven primero como chips.
  const SUGERIDAS = ["que-es", "como-funciona", "gratis", "sumarse", "datos", "entrar", "ia", "para-quien"];

  // ---------- Normalización y sinónimos ----------
  const normalizar = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.]+/g, " ").replace(/\.(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
  // Palabra → palabra canónica (después de normalizar). Así «cuánto sale», «¿cobran?» y «es gratuito» caen en «gratis».
  const SINONIMOS = {
    gratis: "cuesta cuestan costo costos cobran cobra cobrar precio precios pagar pago pagan plata gratuito gratuita arancel abono suscripcion vale sale",
    sumarse: "sumar sumarme sumo sumamos anotarme anoto anotar inscribirme inscribo inscribir inscripcion participar participo unirme probarlo probar acceso",
    datos: "dato informacion info privacidad privado privados guardan guarda guardar almacenan almacena",
    ia: "inteligencia artificial chatgpt gpt robot robots modelos",
    baja: "borrar borro borra borran eliminar elimino eliminan suprimir supresion",
    pictos: "picto pictograma pictogramas dibujos dibujitos imagenes arasaac",
    donar: "dono donacion donaciones donativo colaborar colaboro cafecito apoyar aportar",
    contacto: "contactar contactarme contactarlos comunicarme escribirles mail email correo soporte ayuda",
    entrar: "ingresar ingreso entro ingreso logueo loguearme acceder",
    lugar: "provincia provincias ciudad ciudades rosario cordoba mendoza tucuman argentina zona region",
    familia: "familias padres padre madre mama papa tutor tutora tutores",
    docente: "seno senos senorita maestra maestras maestro docentes profe profesora profesor",
    instalar: "instalo instalacion bajar",
  };
  const MAPA = {};
  for (const [canon, lista] of Object.entries(SINONIMOS)) for (const w of lista.split(" ")) if (!MAPA[w]) MAPA[w] = canon;
  // «santa fe» y «buenos aires» son dos palabras: se juntan antes.
  const canonizar = texto => normalizar(texto).replace(/\bsanta fe\b/g, "lugar").replace(/\bbuenos aires\b/g, "lugar")
    .split(" ").filter(Boolean).map(w => MAPA[w] || w);

  const SALUDO = /^(hola+|holis|buen(os|as)? (dia|dias|tardes|noches)|buenas|hey|que tal|como andas|como estas)( pizarron| puente)?$/;
  const GRACIAS = /^(muchas )?gracias( pizarron| puente)?$|^(genial|perfecto|ok|okey|dale|buenisimo)( gracias)?$/;
  const QUIEN = /\b(quien sos|que sos|sos una? (ia|robot|persona|bot)|sos real|con quien hablo|sos humano)\b/;

  // Claves precalculadas: { tokens, peso }
  const CLAVES = FAQ.map(f => f.claves.map(c => {
    const [txt, p] = c.split(":");
    const tokens = canonizar(txt);
    return { tokens, peso: Number(p) || (tokens.length > 1 ? 3 : 2) };
  }));

  // Devuelve la entrada del FAQ (o una especial) que mejor responde el texto. { id, respuesta, pregunta?, acciones?, puntaje }
  function responder(texto) {
    const n = normalizar(texto);
    if (!n) return { ...ESPECIALES.nose, puntaje: 0 };
    if (SALUDO.test(n)) return { ...ESPECIALES.saludo, puntaje: 1 };
    if (GRACIAS.test(n)) return { ...ESPECIALES.gracias, puntaje: 1 };
    if (QUIEN.test(n)) return { ...ESPECIALES.quien, puntaje: 1 };
    const toks = canonizar(texto);
    const set = new Set(toks);
    const frase = " " + toks.join(" ") + " ";
    let mejor = null, max = 0;
    FAQ.forEach((f, i) => {
      let p = 0;
      for (const c of CLAVES[i]) {
        if (c.tokens.length > 1) { if (frase.includes(" " + c.tokens.join(" ") + " ")) p += c.peso; }
        else if (set.has(c.tokens[0])) p += c.peso;
        else if (c.tokens[0].length >= 6 && toks.some(t => t.length >= 5 && (t.startsWith(c.tokens[0].slice(0, 5)) ))) p += Math.max(1, c.peso - 1); // plurales y conjugaciones
      }
      if (p > max) { max = p; mejor = f; }
    });
    // Un saludo con pregunta («hola, ¿es gratis?») responde la pregunta.
    if (!mejor || max < 2) return { ...ESPECIALES.nose, puntaje: max };
    return { ...mejor, puntaje: max };
  }

  const api = { FAQ, ESPECIALES, SUGERIDAS, normalizar, canonizar, responder, SOPORTE };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  root.PuentePizarron = api;

  // ---------- Interfaz (solo navegador) ----------
  const iniciar = () => {
    const sec = document.getElementById("preguntale");
    if (!sec) return;
    const $ = id => document.getElementById(id);
    const tiza = $("pzTiza"), q = $("pzQ"), acc = $("pzAcciones"), vivo = $("pzVivo"), chips = $("pzChips"),
      form = $("pzForm"), input = $("pzPregunta"), escuchar = $("pzEscuchar"), cara = $("pzCara"), todas = $("pzTodas");
    const menosMovimiento = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    sec.classList.add("pz-js");
    form.hidden = false; chips.hidden = false; todas.open = false;
    let actual = ESPECIALES.saludo, timer = null, cfg = null;

    // Botón de donación: la URL no está escrita en el código, sale de /api/config (igual que en el pie).
    const config = () => cfg || (cfg = fetch("api/config", { credentials: "same-origin" }).then(r => r.ok ? r.json() : {}).catch(() => ({})));

    const hablar = si => cara.classList.toggle("habla", !!si);
    const parpadear = () => { if (menosMovimiento()) return; cara.classList.add("parpadea"); setTimeout(() => cara.classList.remove("parpadea"), 180); };
    (function cicloParpadeo() { setTimeout(() => { parpadear(); cicloParpadeo(); }, 2600 + Math.random() * 3200); })();

    function mostrarAcciones(r) {
      acc.innerHTML = "";
      for (const a of r.acciones || []) {
        if (a.accion === "donar") {
          config().then(c => {
            const u = c && c.donaciones && c.donaciones.ar;
            if (typeof u !== "string" || !/^https:\/\//.test(u) || actual !== r) return;
            const l = Object.assign(document.createElement("a"), { className: "pz-accion", href: u, target: "_blank", rel: "noopener", textContent: a.texto });
            acc.append(l);
          });
          continue;
        }
        const el = a.href ? Object.assign(document.createElement("a"), { href: a.href }) : Object.assign(document.createElement("button"), { type: "button" });
        el.className = "pz-accion"; el.textContent = a.texto;
        if (/^https:/.test(a.href || "")) { el.target = "_blank"; el.rel = "noopener"; }
        if (a.accion === "sumarse") el.onclick = () => {
          const d = $("sumarse"); if (!d) return;
          d.open = true; d.scrollIntoView({ block: "start", behavior: menosMovimiento() ? "auto" : "smooth" });
          setTimeout(() => ($("suNombre") || d.querySelector("summary")).focus({ preventScroll: true }), 350);
        };
        acc.append(el);
      }
    }

    function escribir(r, pregunta) {
      clearTimeout(timer); actual = r;
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      q.textContent = pregunta ? "— " + pregunta : ""; q.hidden = !pregunta;
      acc.innerHTML = ""; escuchar.textContent = "Escuchar";
      // Lector de pantalla: la respuesta entera de una vez (el efecto de tiza es solo visual).
      vivo.textContent = ""; setTimeout(() => { vivo.textContent = r.respuesta; }, 60);
      const txt = r.respuesta;
      if (menosMovimiento()) { tiza.textContent = txt; mostrarAcciones(r); return; }
      tiza.textContent = ""; tiza.classList.add("escribiendo"); hablar(true);
      let i = 0;
      const paso = () => {
        i = Math.min(txt.length, i + (txt.length > 220 ? 3 : 2));
        tiza.textContent = txt.slice(0, i);
        if (i < txt.length) timer = setTimeout(paso, 28);
        else { tiza.classList.remove("escribiendo"); hablar(false); mostrarAcciones(r); }
      };
      paso();
    }
    // Tocar el pizarrón mientras escribe: completa la respuesta.
    $("pzPizarron").addEventListener("click", e => {
      if (!tiza.classList.contains("escribiendo") || e.target.closest("a,button")) return;
      clearTimeout(timer); tiza.textContent = actual.respuesta; tiza.classList.remove("escribiendo"); hablar(false); mostrarAcciones(actual);
    });

    function pintarChips() {
      const ids = SUGERIDAS.filter(id => id !== actual.id).slice(0, 6);
      chips.innerHTML = "";
      for (const id of ids) {
        const f = FAQ.find(x => x.id === id);
        const b = Object.assign(document.createElement("button"), { type: "button", className: "pz-chip", textContent: f.pregunta });
        b.onclick = () => { escribir(f, f.pregunta); pintarChips(); };
        chips.append(b);
      }
    }

    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const t = input.value.trim();
      if (!t) { input.focus(); return; }
      const r = responder(t);
      escribir(r, t.length > 90 ? t.slice(0, 90) + "…" : t);
      input.value = ""; pintarChips();
      window.va && window.va("event", { name: "pizarron_pregunta", props: { respuesta: r.id } });
    });

    // Escuchar: solo si el navegador sabe hablar, y nunca automático. Voz es-AR si hay; si no, cualquier español.
    if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
      escuchar.hidden = false;
      escuchar.onclick = () => {
        if (speechSynthesis.speaking) { speechSynthesis.cancel(); hablar(false); escuchar.textContent = "Escuchar"; return; }
        const u = new SpeechSynthesisUtterance(actual.respuesta);
        const voces = speechSynthesis.getVoices();
        const voz = voces.find(v => /^es[-_]AR/i.test(v.lang)) || voces.find(v => /^es[-_](419|US|MX)/i.test(v.lang)) || voces.find(v => /^es\b/i.test(v.lang));
        u.lang = voz ? voz.lang : "es-AR"; if (voz) u.voice = voz; u.rate = 0.95;
        u.onstart = () => { hablar(!menosMovimiento()); escuchar.textContent = "Parar"; };
        u.onend = u.onerror = () => { hablar(false); escuchar.textContent = "Escuchar"; };
        speechSynthesis.speak(u);
      };
    }

    // Burbuja flotante (celular): aparece cuando ya pasaste el principio y se esconde si el pizarrón o el pie están a la vista.
    const burbuja = $("pzBurbuja");
    if (burbuja && "IntersectionObserver" in window) {
      const vistos = new Set();
      const io = new IntersectionObserver(es => {
        for (const e of es) e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target);
        burbuja.hidden = vistos.size > 0 || window.scrollY < 300;
      });
      [sec, document.querySelector("header"), document.querySelector("footer"), $("sumarse")].filter(Boolean).forEach(x => io.observe(x));
      addEventListener("scroll", () => { if (window.scrollY < 300) burbuja.hidden = true; else if (!vistos.size) burbuja.hidden = false; }, { passive: true });
      burbuja.onclick = ev => {
        ev.preventDefault();
        sec.scrollIntoView({ block: "start", behavior: menosMovimiento() ? "auto" : "smooth" });
        setTimeout(() => input.focus({ preventScroll: true }), 400);
      };
    }

    tiza.textContent = ESPECIALES.saludo.respuesta;
    pintarChips();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})(typeof window !== "undefined" ? window : globalThis);

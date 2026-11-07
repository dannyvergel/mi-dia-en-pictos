// Tablero del Comunicador (comunicador.html): vocabulario acotado con pictogramas de ARASAAC.
// Lo usan la página (para dibujar el tablero) y el service worker (sw.js, con importScripts) para guardar los pictos y que ande sin conexión.
// Cada picto: id = id de ARASAAC · t = lo que se ve y se dice · k = palabra clave de ARASAAC que ese id tiene que tener
//   (lo controla scripts/verificar-comunicador.js contra api.arasaac.org) · f = forma femenina (opción «Hablo como nena») · dice = lo que dice la voz si no es t.
// Inglés (mismo id de picto): en = lo que se ve y se dice · ken = palabra clave de ARASAAC en inglés (node scripts/verificar-comunicador.js --en) · dicen = lo que dice la voz si no es en.
// Categorías: nombre (español) y en (inglés). Las ids no se repiten entre categorías (lo controla el test).
// Pictogramas: autor Sergio Palao. Origen: ARASAAC (http://www.arasaac.org). Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España).
(function (raiz) {
  const CATEGORIAS = [
    { id: "nucleo", nombre: "Núcleo", en: "Core", color: "#23364f", pictos: [
      {id: 6632, t: "yo", k: "yo", en: "I", ken: "I"},
      {id: 6625, t: "vos", k: "tú", en: "you", ken: "you"},
      {id: 5441, t: "quiero", k: "querer", en: "I want", ken: "I want"},
      {id: 6156, t: "no quiero", k: "no quiero", en: "I don't want", ken: "I don't want"},
      {id: 37160, t: "necesito", k: "necesitar", en: "I need", ken: "need"},
      {id: 5584, t: "sí", k: "sí", en: "yes", ken: "yes"},
      {id: 5526, t: "no", k: "no", en: "no", ken: "no"},
      {id: 3220, t: "más", k: "más", en: "more", ken: "plus sign"},
      {id: 37162, t: "otra vez", k: "otra vez", en: "again", ken: "once again"},
      {id: 28429, t: "terminé", k: "terminar", en: "all done", ken: "I have finished"},
      {id: 12252, t: "ayuda", k: "ayuda", en: "help", ken: "help"},
      {id: 21917, t: "me gusta", k: "gustar", en: "I like it", ken: "I like that"},
      {id: 38890, t: "no me gusta", k: "no gustar", en: "I don't like it", ken: "I don't like that"},
      {id: 36914, t: "esperar", k: "esperar", en: "wait", ken: "wait"},
      {id: 7196, t: "pará", k: "parar", en: "stop", ken: "stop"}
    ] },
    { id: "sentimientos", nombre: "Sentimientos", en: "Feelings", color: "#2f6fb0", pictos: [
      {id: 35547, t: "contento", k: "contento", f: "contenta", en: "happy", ken: "happy"},
      {id: 35545, t: "triste", k: "triste", en: "sad", ken: "sad"},
      {id: 35539, t: "enojado", k: "enfadado", f: "enojada", en: "angry", ken: "angry"},
      {id: 35535, t: "asustado", k: "asustado", f: "asustada", en: "scared", ken: "scared"},
      {id: 35537, t: "cansado", k: "cansado", f: "cansada", en: "tired", ken: "tired"},
      {id: 31310, t: "tranquilo", k: "tranquilo", f: "tranquila", en: "calm", ken: "calm"},
      {id: 30391, t: "nervioso", k: "nervioso", f: "nerviosa", en: "nervous", ken: "nervous"},
      {id: 35531, t: "aburrido", k: "aburrido", f: "aburrida", en: "bored", ken: "bored"},
      {id: 7040, t: "enfermo", k: "enfermo", f: "enferma", en: "sick", ken: "sick"}
    ] },
    { id: "necesidades", nombre: "Necesidades", en: "Needs", color: "#b5442e", pictos: [
      {id: 6929, t: "baño", k: "baño", en: "bathroom", ken: "bathroom"},
      {id: 2248, t: "agua", k: "agua", en: "water", ken: "water"},
      {id: 6456, t: "comer", k: "comer", en: "eat", ken: "eat"},
      {id: 6479, t: "dormir", k: "dormir", en: "sleep", ken: "sleep"},
      {id: 30620, t: "me duele", k: "dolor", en: "it hurts", ken: "hurt"},
      {id: 35557, t: "frío", k: "frío", en: "cold", ken: "cold"},
      {id: 35561, t: "calor", k: "calor", en: "hot", ken: "heat"},
      {id: 16643, t: "descansar", k: "descansar", en: "rest", ken: "rest"},
      {id: 4550, t: "abrazo", k: "abrazo", en: "hug", ken: "hug"},
      {id: 6071, t: "silencio", k: "silencio", en: "quiet", ken: "hush"}
    ] },
    { id: "personas", nombre: "Personas", en: "People", color: "#a87400", pictos: [
      {id: 2458, t: "mamá", k: "mamá", en: "mom", ken: "mom"},
      {id: 31146, t: "papá", k: "papá", en: "dad", ken: "dad"},
      {id: 2423, t: "hermano", k: "hermano", en: "brother", ken: "brother"},
      {id: 2422, t: "hermana", k: "hermana", en: "sister", ken: "sister"},
      {id: 23718, t: "abuelo", k: "abuelo", en: "grandpa", ken: "grandpa"},
      {id: 23710, t: "abuela", k: "abuela", en: "grandma", ken: "grandma"},
      {id: 2456, t: "seño", k: "maestra", en: "teacher", ken: "teacher"},
      {id: 25790, t: "amigo", k: "amigo", en: "friend", ken: "friend"}
    ] },
    { id: "lugares", nombre: "Lugares", en: "Places", color: "#6a4c93", pictos: [
      {id: 6964, t: "casa", k: "casa", en: "home", ken: "home"},
      {id: 32446, t: "escuela", k: "escuela", en: "school", ken: "school"},
      {id: 36145, t: "plaza", k: "parque infantil", en: "playground", ken: "playground"},
      {id: 33064, t: "patio", k: "patio", en: "schoolyard", ken: "schoolyard"},
      {id: 10752, t: "cocina", k: "cocina", en: "kitchen", ken: "kitchen"},
      {id: 5988, t: "pieza", k: "dormitorio", en: "bedroom", ken: "bedroom"},
      {id: 6981, t: "auto", k: "auto", en: "car", ken: "car"},
      {id: 6618, t: "súper", k: "supermercado", en: "store", ken: "supermarket"}
    ] },
    { id: "acciones", nombre: "Acciones", en: "Actions", color: "#3e7d4f", pictos: [
      {id: 8142, t: "ir", k: "ir", en: "go", ken: "go"},
      {id: 6564, t: "mirar", k: "mirar", en: "look", ken: "look"},
      {id: 6572, t: "escuchar", k: "escuchar", en: "listen", ken: "listen"},
      {id: 24825, t: "abrir", k: "abrir", en: "open", ken: "open"},
      {id: 24976, t: "cerrar", k: "cerrar", en: "close", ken: "close"},
      {id: 28431, t: "dar", k: "dar", en: "give", ken: "give"},
      {id: 6606, t: "salir", k: "salir", en: "go out", ken: "go out"},
      {id: 8975, t: "lavarse las manos", k: "lavar las manos", dice: "lavarme las manos", en: "wash hands", ken: "wash the hands", dicen: "wash my hands"},
      {id: 6627, t: "vestirse", k: "vestir", dice: "vestirme", en: "get dressed", ken: "get dressed"},
      {id: 6058, t: "bañarse", k: "bañar", dice: "bañarme", en: "take a bath", ken: "take a bath"}
    ] },
    { id: "juegos", nombre: "Juegos", en: "Play", color: "#c2477d", pictos: [
      {id: 23392, t: "jugar", k: "jugar", en: "play", ken: "play"},
      {id: 3241, t: "pelota", k: "pelota", en: "ball", ken: "ball"},
      {id: 28099, t: "tablet", k: "tableta", en: "tablet", ken: "tablet"},
      {id: 8088, t: "dibujar", k: "dibujar", en: "draw", ken: "draw"},
      {id: 24791, t: "música", k: "música", en: "music", ken: "music"},
      {id: 2540, t: "rompecabezas", k: "puzzle", en: "puzzle", ken: "puzzle"},
      {id: 6945, t: "burbujas", k: "burbujas", en: "bubbles", ken: "bubbles"},
      {id: 4608, t: "hamaca", k: "columpio", en: "swing", ken: "swing"},
      {id: 4759, t: "tobogán", k: "tobogán", en: "slide", ken: "slide"},
      {id: 2364, t: "cuento", k: "cuento", en: "story", ken: "storybook"}
    ] },
    { id: "comida", nombre: "Comida", en: "Food", color: "#c25e00", pictos: [
      {id: 37000, t: "milanesa", k: "milanesa de ternera", en: "breaded steak", ken: "veal milanesa"},
      {id: 8310, t: "empanada", k: "empanada", en: "empanada", ken: "meat pasty"},
      {id: 2383, t: "fideos", k: "espaguetis", en: "pasta", ken: "spaghetti"},
      {id: 2527, t: "pizza", k: "pizza", en: "pizza", ken: "pizza"},
      {id: 2494, t: "pan", k: "pan", en: "bread", ken: "bread"},
      {id: 2402, t: "galletitas", k: "galletas", en: "cookies", ken: "cookies"},
      {id: 28339, t: "fruta", k: "fruta", en: "fruit", ken: "fruit"},
      {id: 10218, t: "banana", k: "banana", en: "banana", ken: "banana"},
      {id: 2462, t: "manzana", k: "manzana", en: "apple", ken: "apple"},
      {id: 2445, t: "leche", k: "leche", en: "milk", ken: "milk"},
      {id: 2429, t: "té", k: "infusión", en: "tea", ken: "infusion"},
      {id: 31035, t: "mate", k: "mate", en: "mate", ken: "mate"},
      {id: 4768, t: "vaso de agua", k: "vaso de agua", en: "glass of water", ken: "glass of water"}
    ] },
    { id: "cuerpo", nombre: "Cuerpo", en: "Body", color: "#0f7c86", pictos: [
      {id: 2673, t: "cabeza", k: "cabeza", en: "head", ken: "head"},
      {id: 2786, t: "panza", k: "panza", en: "tummy", ken: "tummy"},
      {id: 2669, t: "brazo", k: "brazo", en: "arm", ken: "arm"},
      {id: 8666, t: "pierna", k: "pierna", en: "leg", ken: "leg"},
      {id: 2928, t: "mano", k: "mano", en: "hand", ken: "hand"},
      {id: 25327, t: "pie", k: "pie", en: "foot", ken: "foot"},
      {id: 2876, t: "ojos", k: "ojos", en: "eyes", ken: "eyes"},
      {id: 2871, t: "oreja", k: "oreja", en: "ear", ken: "ear"},
      {id: 2663, t: "boca", k: "boca", en: "mouth", ken: "mouth"},
      {id: 2887, t: "nariz", k: "nariz", en: "nose", ken: "nose"},
      {id: 28753, t: "me duele la cabeza", k: "dolor de cabeza", en: "my head hurts", ken: "headache"},
      {id: 28765, t: "me duele la panza", k: "dolor de tripa", en: "my tummy hurts", ken: "stomach ache"}
    ] },
    { id: "ropa", nombre: "Ropa", en: "Clothes", color: "#7a5230", pictos: [
      {id: 2309, t: "remera", k: "remera", en: "T-shirt", ken: "T-shirt"},
      {id: 2565, t: "pantalón", k: "pantalón", en: "pants", ken: "pant"},
      {id: 13638, t: "short", k: "pantalón corto", en: "shorts", ken: "short trousers"},
      {id: 8701, t: "buzo", k: "sudadera", en: "hoodie", ken: "sweatshirt"},
      {id: 27978, t: "campera", k: "plumífero", en: "coat", ken: "coat"},
      {id: 2621, t: "zapatillas", k: "zapatillas", en: "sneakers", ken: "sneakers"},
      {id: 2298, t: "medias", k: "calcetines", en: "socks", ken: "socks"},
      {id: 2412, t: "gorro", k: "gorro", en: "hat", ken: "ski cap"},
      {id: 2391, t: "pollera", k: "pollera", en: "skirt", ken: "skirt"},
      {id: 2613, t: "vestido", k: "vestido", en: "dress", ken: "dress"},
      {id: 2522, t: "pijama", k: "pijama", en: "pajamas", ken: "pajama"},
      {id: 8038, t: "guardapolvo", k: "bata", en: "smock", ken: "white coat"}
    ] }
  ];
  // ---------- Tablero «Casa»: órdenes para un asistente de voz (Alexa, Google, Siri), sin integración ----------
  // Cada picto hace que el equipo diga en voz alta la palabra de activación y una orden, y el parlante la escucha
  // como si la dijera una persona. No hay cuenta ni conexión con Amazon, Google o Apple.
  // Campos como en CATEGORIAS (id, t, k, en, ken) más: orden = lo que se le dice al asistente en español,
  // ordenen = en inglés. Las órdenes usan la forma que los asistentes reconocen en español (prende, apaga, pon),
  // no el voseo: Alexa y Google no tienen español de Argentina y esas formas son las de su documentación.
  // Para sumar una orden: agregar una línea acá (con k / ken verificadas, ver docs/comunicador.md) y subir el CACHE de sw.js.
  const CASA = { id: "casa", nombre: "Casa", en: "Home", color: "#2f4a3e", icono: 37438, ordenes: [
    {id: 8103, t: "prender la luz", k: "encender la luz", orden: "prende la luz", en: "lights on", ken: "turn on the light", ordenen: "turn on the lights"},
    {id: 8027, t: "apagar la luz", k: "apagar la luz", orden: "apaga la luz", en: "lights off", ken: "turn off the light", ordenen: "turn off the lights"},
    {id: 2746, t: "poner música", k: "escuchar música", orden: "pon música", en: "play music", ken: "listen to music", ordenen: "play music"},
    {id: 38213, t: "parar la música", k: "botón de pausa", orden: "para la música", en: "stop the music", ken: "pause button", ordenen: "stop the music"},
    {id: 38216, t: "subir el volumen", k: "botón de subir volumen", orden: "sube el volumen", en: "volume up", ken: "volume up button", ordenen: "turn up the volume"},
    {id: 38215, t: "bajar el volumen", k: "botón de bajar volumen", orden: "baja el volumen", en: "volume down", ken: "volume down button", ordenen: "turn down the volume"},
    {id: 2549, t: "qué hora es", k: "reloj", orden: "qué hora es", en: "what time is it", ken: "watch", ordenen: "what time is it"},
    {id: 9802, t: "prender la tele", k: "encender la televisión", orden: "prende la tele", en: "TV on", ken: "turn on TV", ordenen: "turn on the TV"},
    {id: 20093, t: "apagar la tele", k: "apagar la televisión", orden: "apaga la tele", en: "TV off", ken: "turn off the TV", ordenen: "turn off the TV"},
    {id: 2364, t: "contame un cuento", k: "cuento", orden: "cuéntame un cuento", en: "tell me a story", ken: "storybook", ordenen: "tell me a story"}
  ] };
  // Palabras de activación. Siri en español se despierta con «Oye Siri»; en inglés, «Hey Siri».
  const PALABRAS = {
    alexa: { es: "Alexa", en: "Alexa" },
    google: { es: "Ok Google", en: "Ok Google" },
    siri: { es: "Oye Siri", en: "Hey Siri" }
  };
  const ESPERAS = [500, 1000, 1500, 2000, 3000]; // ms entre la palabra de activación y la orden
  // Qué se dice para una orden: palabra de activación y orden. Con pausa van en dos partes y la página espera
  // `espera` ms entre una y otra; sin pausa, una sola frase «Alexa, prende la luz».
  // aj = ajustes guardados { casaPalabra, casaOtra, casaPausa, casaEspera }.
  function palabraActivacion(aj, lang) {
    const clave = (aj && aj.casaPalabra) || "alexa";
    if (clave === "otra") return String((aj && aj.casaOtra) || "").replace(/\s+/g, " ").trim().slice(0, 40);
    return (PALABRAS[clave] || PALABRAS.alexa)[lang === "en" ? "en" : "es"];
  }
  function fraseCasa(o, aj, lang) {
    const orden = lang === "en" ? (o.ordenen || o.en) : (o.orden || o.t);
    const palabra = palabraActivacion(aj, lang);
    const pausa = !!palabra && (!aj || aj.casaPausa !== false);
    const espera = ESPERAS.includes(Number(aj && aj.casaEspera)) ? Number(aj.casaEspera) : 1000;
    return { palabra, orden, pausa, espera: pausa ? espera : 0, partes: !palabra ? [orden] : pausa ? [palabra, orden] : [palabra + ", " + orden], texto: palabra ? palabra + ", " + orden : orden };
  }

  // ---------- Pictos propios: buscador de ARASAAC para sumar dibujos a Favoritos ----------
  // La familia busca una palabra, toca un resultado y queda guardado { id, t } en localStorage (aj.propios), junto a los favoritos.
  // La búsqueda va del navegador directo a la API pública de ARASAAC (Gobierno de Aragón): Puente no la recibe.
  // Se manda solo la palabra: sin cookies (credentials: "omit") y sin decir desde qué página (referrerPolicy: "no-referrer").
  const API_ARASAAC = "https://api.arasaac.org/api/pictograms/";
  const MAX_RESULTADOS = 24, MAX_PROPIOS = 60, MAX_PALABRA = 40;
  const limpiarPalabra = s => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PALABRA);
  const normal = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const urlBusqueda = (palabra, lang) => API_ARASAAC + (lang === "en" ? "en" : "es") + "/search/" + encodeURIComponent(limpiarPalabra(palabra));
  const idValido = id => Number.isInteger(id) && id > 0 && id < 1e7;
  // De la respuesta de ARASAAC: sin pictos marcados con contenido sexual o violento, sin repetidos, como mucho 24.
  // La palabra de cada resultado: la clave igual a la buscada; si no, una que la contenga; si no, la primera.
  function elegirResultados(lista, palabra) {
    const q = normal(palabra), vistos = new Set(), res = [];
    for (const p of Array.isArray(lista) ? lista : []) {
      if (!p || !idValido(p._id) || p.sex || p.violence || vistos.has(p._id)) continue;
      const claves = (Array.isArray(p.keywords) ? p.keywords : []).map(k => limpiarPalabra(k && k.keyword)).filter(Boolean);
      const t = claves.find(k => normal(k) === q) || claves.find(k => normal(k).includes(q)) || claves[0];
      if (!t) continue;
      vistos.add(p._id); res.push({ id: p._id, t });
      if (res.length >= MAX_RESULTADOS) break;
    }
    return res;
  }
  // Busca en ARASAAC. Devuelve [] si no hay resultados (ARASAAC responde 404) y tira error si no hay conexión o falla.
  async function buscarArasaac(palabra, lang, pedir) {
    const q = limpiarPalabra(palabra);
    if (q.length < 2) return [];
    const r = await (pedir || fetch)(urlBusqueda(q, lang), { credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error("ARASAAC respondió " + r.status);
    return elegirResultados(await r.json(), q);
  }
  // Lo guardado en localStorage puede venir viejo o tocado a mano: solo { id entero, t texto }, sin repetidos, como mucho 60.
  function propiosValidos(lista) {
    const vistos = new Set(), res = [];
    for (const p of Array.isArray(lista) ? lista : []) {
      const id = Number(p && p.id), t = limpiarPalabra(p && p.t);
      if (!idValido(id) || !t || vistos.has(id)) continue;
      vistos.add(id); res.push({ id, t });
      if (res.length >= MAX_PROPIOS) break;
    }
    return res;
  }

  const url = id => "https://static.arasaac.org/pictograms/" + id + "/" + id + "_300.png";
  // Lo que guarda el SW para sin conexión: el tablero, Casa y, si la página los manda, los pictos propios (ids sueltos).
  const urls = extras => [...new Set(CATEGORIAS.flatMap(c => c.pictos.map(p => url(p.id))).concat(url(CASA.icono), CASA.ordenes.map(o => url(o.id)),
    (Array.isArray(extras) ? extras : []).map(Number).filter(idValido).slice(0, MAX_PROPIOS).map(url)))];
  const TABLERO = { CATEGORIAS, CASA, PALABRAS, ESPERAS, palabraActivacion, fraseCasa, url, urls,
    API_ARASAAC, MAX_RESULTADOS, MAX_PROPIOS, MAX_PALABRA, limpiarPalabra, urlBusqueda, elegirResultados, buscarArasaac, propiosValidos };
  if (typeof module !== "undefined" && module.exports) module.exports = TABLERO;
  else raiz.TABLERO = TABLERO;
})(typeof self !== "undefined" ? self : this);

// Tablero del Comunicador (comunicador.html): vocabulario acotado con pictogramas de ARASAAC.
// Lo usan la página (para dibujar el tablero) y el service worker (sw.js, con importScripts) para guardar los pictos y que ande sin conexión.
// Cada picto: id = id de ARASAAC · t = lo que se ve y se dice · k = palabra clave de ARASAAC que ese id tiene que tener
//   (lo controla scripts/verificar-comunicador.js contra api.arasaac.org) · f = forma femenina (opción «Hablo como nena») · dice = lo que dice la voz si no es t.
// Pictogramas: autor Sergio Palao. Origen: ARASAAC (http://www.arasaac.org). Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España).
(function (raiz) {
  const CATEGORIAS = [
    { id: "nucleo", nombre: "Núcleo", color: "#23364f", pictos: [
      {id: 6632, t: "yo", k: "yo"},
      {id: 6625, t: "vos", k: "tú"},
      {id: 5441, t: "quiero", k: "querer"},
      {id: 6156, t: "no quiero", k: "no quiero"},
      {id: 5584, t: "sí", k: "sí"},
      {id: 5526, t: "no", k: "no"},
      {id: 3220, t: "más", k: "más"},
      {id: 37162, t: "otra vez", k: "otra vez"},
      {id: 28429, t: "terminé", k: "terminar"},
      {id: 12252, t: "ayuda", k: "ayuda"},
      {id: 21917, t: "me gusta", k: "gustar"},
      {id: 38890, t: "no me gusta", k: "no gustar"},
      {id: 36914, t: "esperar", k: "esperar"},
      {id: 7196, t: "pará", k: "parar"}
    ] },
    { id: "sentimientos", nombre: "Sentimientos", color: "#2f6fb0", pictos: [
      {id: 35547, t: "contento", k: "contento", f: "contenta"},
      {id: 35545, t: "triste", k: "triste"},
      {id: 35539, t: "enojado", k: "enfadado", f: "enojada"},
      {id: 35535, t: "asustado", k: "asustado", f: "asustada"},
      {id: 35537, t: "cansado", k: "cansado", f: "cansada"},
      {id: 31310, t: "tranquilo", k: "tranquilo", f: "tranquila"},
      {id: 30391, t: "nervioso", k: "nervioso", f: "nerviosa"},
      {id: 35531, t: "aburrido", k: "aburrido", f: "aburrida"}
    ] },
    { id: "necesidades", nombre: "Necesidades", color: "#b5442e", pictos: [
      {id: 6929, t: "baño", k: "baño"},
      {id: 2248, t: "agua", k: "agua"},
      {id: 6456, t: "comer", k: "comer"},
      {id: 6479, t: "dormir", k: "dormir"},
      {id: 30620, t: "me duele", k: "dolor"},
      {id: 35557, t: "frío", k: "frío"},
      {id: 35561, t: "calor", k: "calor"},
      {id: 16643, t: "descansar", k: "descansar"},
      {id: 4550, t: "abrazo", k: "abrazo"},
      {id: 6071, t: "silencio", k: "silencio"}
    ] },
    { id: "personas", nombre: "Personas", color: "#a87400", pictos: [
      {id: 2458, t: "mamá", k: "mamá"},
      {id: 31146, t: "papá", k: "papá"},
      {id: 2423, t: "hermano", k: "hermano"},
      {id: 2422, t: "hermana", k: "hermana"},
      {id: 23718, t: "abuelo", k: "abuelo"},
      {id: 23710, t: "abuela", k: "abuela"},
      {id: 2456, t: "seño", k: "maestra"},
      {id: 25790, t: "amigo", k: "amigo"}
    ] },
    { id: "lugares", nombre: "Lugares", color: "#6a4c93", pictos: [
      {id: 6964, t: "casa", k: "casa"},
      {id: 32446, t: "escuela", k: "escuela"},
      {id: 36145, t: "plaza", k: "parque infantil"},
      {id: 33064, t: "patio", k: "patio"},
      {id: 10752, t: "cocina", k: "cocina"},
      {id: 5988, t: "pieza", k: "dormitorio"},
      {id: 6981, t: "auto", k: "auto"},
      {id: 6618, t: "súper", k: "supermercado"}
    ] },
    { id: "acciones", nombre: "Acciones", color: "#3e7d4f", pictos: [
      {id: 8142, t: "ir", k: "ir"},
      {id: 6564, t: "mirar", k: "mirar"},
      {id: 6572, t: "escuchar", k: "escuchar"},
      {id: 24825, t: "abrir", k: "abrir"},
      {id: 24976, t: "cerrar", k: "cerrar"},
      {id: 28431, t: "dar", k: "dar"},
      {id: 6606, t: "salir", k: "salir"},
      {id: 8975, t: "lavarse las manos", k: "lavar las manos", dice: "lavarme las manos"},
      {id: 6627, t: "vestirse", k: "vestir", dice: "vestirme"},
      {id: 6058, t: "bañarse", k: "bañar", dice: "bañarme"}
    ] },
    { id: "juegos", nombre: "Juegos", color: "#c2477d", pictos: [
      {id: 23392, t: "jugar", k: "jugar"},
      {id: 3241, t: "pelota", k: "pelota"},
      {id: 28099, t: "tablet", k: "tableta"},
      {id: 8088, t: "dibujar", k: "dibujar"},
      {id: 24791, t: "música", k: "música"},
      {id: 2540, t: "rompecabezas", k: "puzzle"},
      {id: 6945, t: "burbujas", k: "burbujas"},
      {id: 4608, t: "hamaca", k: "columpio"},
      {id: 4759, t: "tobogán", k: "tobogán"},
      {id: 2364, t: "cuento", k: "cuento"}
    ] }
  ];
  const url = id => "https://static.arasaac.org/pictograms/" + id + "/" + id + "_300.png";
  const TABLERO = { CATEGORIAS, url, urls: () => CATEGORIAS.flatMap(c => c.pictos.map(p => url(p.id))) };
  if (typeof module !== "undefined" && module.exports) module.exports = TABLERO;
  else raiz.TABLERO = TABLERO;
})(typeof self !== "undefined" ? self : this);

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
  // «santa fe» y «buenos aires» son dos palabras: se juntan antes.
  const JUNTAR_ES = t => t.replace(/\bsanta fe\b/g, "lugar").replace(/\bbuenos aires\b/g, "lugar");
  const SALUDO = /^(hola+|holis|buen(os|as)? (dia|dias|tardes|noches)|buenas|hey|que tal|como andas|como estas)( pizarron| puente)?$/;
  const GRACIAS = /^(muchas )?gracias( pizarron| puente)?$|^(genial|perfecto|ok|okey|dale|buenisimo)( gracias)?$/;
  const QUIEN = /\b(quien sos|que sos|sos una? (ia|robot|persona|bot)|sos real|con quien hablo|sos humano)\b/;

  // El motor (sin IA): normaliza, pasa a sinónimos canónicos y suma el peso de las claves que aparecen. Uno por idioma.
  function crearMotor({ FAQ, ESPECIALES, SINONIMOS, juntar, SALUDO, GRACIAS, QUIEN }) {
    const MAPA = {};
    for (const [canon, lista] of Object.entries(SINONIMOS)) for (const w of lista.split(" ")) if (!MAPA[w]) MAPA[w] = canon;
    const canonizar = texto => juntar(normalizar(texto)).split(" ").filter(Boolean).map(w => MAPA[w] || w);
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
    return { canonizar, responder };
  }
  const { canonizar, responder } = crearMotor({ FAQ, ESPECIALES, SINONIMOS, juntar: JUNTAR_ES, SALUDO, GRACIAS, QUIEN });

  // ---------- English (en/index.html) ----------
  // Same facts as the Spanish FAQ, written for English readers. The list in en/index.html (#pzTodas) is generated from FAQ_EN
  // by scripts/idiomas.js, so they always match. Keywords are English words after normalizar().
  const FAQ_EN = [
    { id: "que-es", pregunta: "What is Puente?",
      respuesta: "Puente is a tool for special education schools. The teacher says how the school day went, Puente lays it out in pictograms and the family sees it at home. The child can use the pictures to tell their day, and the family knows what happened.",
      claves: ["what is:3", "what s puente:4", "about:2", "what for:3", "explain:3", "puente:1", "app:1"] },
    { id: "para-quien", pregunta: "Who is it for?",
      respuesta: "Special education schools: children with autism, intellectual disability or communication needs. Teachers and school leaders use it to record the day in seconds, and families see it in pictograms.",
      claves: ["who is it for:5", "who for:4", "who uses:4", "autism:3", "autistic:3", "asd:3", "disability:3", "special:2", "nonverbal:3", "children:1", "students:1"] },
    { id: "como-funciona", pregunta: "How does it work?",
      respuesta: "First, the teacher dictates or types how the day went. Then Puente turns it into a strip of ARASAAC pictograms, one activity after another. Finally, the family sees it in their private space: the day, what went well and what is coming up.",
      claves: ["how does it work:5", "work:2", "how do i use:5", "use:2", "dictate:3", "steps:2", "visual schedule:3"] },
    { id: "gratis", pregunta: "How much does it cost?",
      respuesta: "Nothing. Puente is free and non-profit: schools and families never pay. Data is never sold or used for advertising.",
      claves: ["free:4", "ads:3", "advertising:3", "profit:3", "sell:2"] },
    { id: "sumarse", pregunta: "How can I join the pilot?",
      respuesta: "Puente is in a closed pilot with 15 places in total for teachers, school leaders and families, in schools in Santa Fe, Argentina. You can only get in with an invitation link: the school invites its teachers, and teachers invite families. If you want to take part, fill in the “Join the pilot” form and we will email you.",
      claves: ["join:4", "pilot:3", "invitation:3", "invite:3", "places:3", "spots:3", "my school:3", "sign up:4", "register:3", "new account:3", "create an account:3"],
      acciones: [{ texto: "Join the pilot", accion: "sumarse" }, { texto: "Email us", href: MAILTO + "?subject=Joining%20the%20Puente%20pilot" }] },
    { id: "datos", pregunta: "What data does it keep?",
      respuesta: "As little as possible. For each student, only the first name and the class: no surname, no photos, no ID number and no diagnoses. The school enters the support profile and the daily record, always with the family's consent. Data is never sold or used for advertising.",
      claves: ["data:3", "photos:3", "photo:3", "diagnosis:3", "diagnoses:3", "surname:3", "consent:3", "safe:2", "security:2", "children s data:3", "gdpr:2", "law:2"],
      acciones: [{ texto: "Read the privacy policy", href: "privacidad.html" }] },
    { id: "ia", pregunta: "What does the AI do with the data?",
      respuesta: "AI helps put the teacher's account of the day in order, draft the progress report and answer the family's questions. Puente only uses providers that do not store or train on the data, and sends them the minimum: the first name, never emails, phone numbers or health information. The teacher reviews everything and decides.",
      claves: ["ai:4", "train:4", "training:4", "retention:4", "openrouter:4", "algorithm:3"] },
    { id: "baja", pregunta: "How do I delete my data?",
      respuesta: "Families can download their data, withdraw consent and ask to leave from their own space. The school can also remove a student. When that happens, the student's data is deleted. For any request, email " + SOPORTE + ".",
      claves: ["delete:4", "remove:3", "stop using:4", "download my data:5", "withdraw:3", "leave:2", "unsubscribe:4"],
      acciones: [{ texto: "Email us", href: MAILTO + "?subject=My%20data%20in%20Puente" }] },
    { id: "pictos", pregunta: "Where do the pictograms come from?",
      respuesta: "From ARASAAC. Pictograms by Sergio Palao. Owner: Government of Aragón (Spain). License: CC BY-NC-SA. That is also why Puente uses them on a non-profit basis.",
      claves: ["pictograms:4", "where from:3", "author:3", "license:3", "aragon:3", "sergio palao:4", "palao:4"],
      acciones: [{ texto: "Visit ARASAAC", href: "https://arasaac.org" }] },
    { id: "lugar", pregunta: "Where is it available?",
      respuesta: "For now, only in schools in the province of Santa Fe, Argentina: schools are picked from the official register of schools. If you are somewhere else and interested, email us.",
      claves: ["where:4", "available:4", "my country:5", "country:3", "countries:3", "outside argentina:5", "only in:3"],
      acciones: [{ texto: "Email us", href: MAILTO }] },
    { id: "donar", pregunta: "How can I help or donate?",
      respuesta: "Puente is free and non-profit, and donations help pay for servers and AI. If you want to help, use the donation buttons in “Get involved”, further down this page. Families are never asked to donate.",
      claves: ["donate:5", "how can i help:4", "help out:4", "support puente:4", "sponsor:3", "contribute:3"],
      acciones: [{ texto: "Donate", accion: "donar" }] },
    { id: "entrar", pregunta: "How do I sign in?",
      respuesta: "Teachers and school leaders sign in with their Google account or with a 6-digit code sent by email, no password. Families sign in with the invitation link from the school and a code sent by email. The signed-in areas are in Spanish for now.",
      claves: ["sign in:5", "log in:5", "login:4", "password:4", "code:3", "google:4", "can t sign in:5", "link:2"],
      acciones: [{ texto: "Sign in", href: "login.html" }, { texto: "I'm a family member", href: "login.html?familia" }] },
    { id: "familia-ve", pregunta: "What does the family see?",
      respuesta: "In their private space, the family sees the last few days in pictograms they can tap and listen to, a schedule of what is coming up, the goals being worked on and what went well. They can also ask about the day, and the answers come only from what the school recorded.",
      claves: ["what does the family see:5", "family see:5", "space:3", "at home:3", "family:2", "parents:2", "schedule:3"] },
    { id: "instalar", pregunta: "Do I need to install anything?",
      respuesta: "No. Puente works in the browser, on a phone or a computer, at puentepictos.app. On Android there are also apps you can download (not on Google Play yet): the Puente app, for people in the pilot, and the Communicator app, free for anyone.",
      claves: ["install:5", "download the app:5", "play store:5", "phone:3", "android:3", "iphone:3", "browser:3", "computer:2", "apk:5"],
      acciones: [{ texto: "Open the Communicator", href: "comunicador.html" }] },
    { id: "ingles", pregunta: "Is Puente available in English?",
      respuesta: "This site and the Communicator are in English. The teacher and family areas of Puente are in Spanish for now, because the pilot runs in schools in Argentina.",
      claves: ["english:5", "language:4", "languages:4", "spanish:4", "translate:3"],
      acciones: [{ texto: "Open the Communicator", href: "comunicador.html" }] },
    { id: "contacto", pregunta: "How do I contact you?",
      respuesta: "Email us at " + SOPORTE + ". If you already have an account, you can also use “Send feedback” at the bottom of the page.",
      claves: ["contact:4", "phone number:3", "talk to someone:5", "problem:2", "error:2", "question:1", "complaint:3"],
      acciones: [{ texto: "Email us", href: MAILTO }] },
  ];
  const ESPECIALES_EN = {
    saludo: { id: "saludo", respuesta: "Hi! I'm Puente's chalkboard. Ask me anything about Puente, or tap one of the questions below." },
    gracias: { id: "gracias", respuesta: "You're welcome! If you have another question, I'm here." },
    quien: { id: "quien", respuesta: "I'm Puente's chalkboard. I don't use AI: my answers are written down, and what you type never leaves your browser." },
    nose: { id: "nose", respuesta: "Sorry, I don't know that one. I only have the frequently asked questions about Puente: try one below. If you want to join, fill in the pilot form, or email " + SOPORTE + ".",
      acciones: [{ texto: "Join the pilot", accion: "sumarse" }, { texto: "Email us", href: MAILTO }] },
  };
  const SINONIMOS_EN = {
    free: "cost costs price prices pay paid charge charges fee fees subscription cheap",
    join: "joining participate participation enroll enrol apply access",
    data: "information info privacy private store stores storing stored keep keeps",
    ai: "artificial intelligence chatgpt gpt robot robots models",
    "delete": "erase erased deleting deletion",
    pictograms: "pictogram picture pictures pictos images symbols drawings arasaac",
    donate: "donation donations contribute contribution support",
    contact: "email mail reach support help",
    "sign": "signin",
    where: "province city cities rosario argentina region spain mexico chile uruguay usa uk canada australia abroad",
    family: "families parent parents mom mum dad guardian guardians",
    teacher: "teachers educator educators staff",
    install: "installing installation download",
  };
  const SALUDO_EN = /^(hi+|hello|hey|good (morning|afternoon|evening)|howdy|how are you)( chalkboard| puente)?$/;
  const GRACIAS_EN = /^(thanks|thank you|thx|cheers|great|ok|okay|cool|perfect)( (so much|a lot))?( chalkboard| puente)?$/;
  const QUIEN_EN = /\b(who are you|what are you|are you (an? )?(ai|robot|bot|person|human|real))\b/;
  const MOTOR_EN = crearMotor({ FAQ: FAQ_EN, ESPECIALES: ESPECIALES_EN, SINONIMOS: SINONIMOS_EN, juntar: t => t.replace(/\bsanta fe\b/g, "where"),
    SALUDO: SALUDO_EN, GRACIAS: GRACIAS_EN, QUIEN: QUIEN_EN });
  const SUGERIDAS_EN = ["que-es", "como-funciona", "gratis", "ingles", "datos", "sumarse", "ia", "para-quien"];

  // Textos de la interfaz del pizarrón (lo demás está en el HTML de cada idioma).
  const UI = { es: { escuchar: "Escuchar", parar: "Parar" }, en: { escuchar: "Listen", parar: "Stop" } };

  const api = { FAQ, ESPECIALES, SUGERIDAS, normalizar, canonizar, responder, SOPORTE,
    en: { FAQ: FAQ_EN, ESPECIALES: ESPECIALES_EN, SUGERIDAS: SUGERIDAS_EN, canonizar: MOTOR_EN.canonizar, responder: MOTOR_EN.responder } };
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
    // La página dice su idioma (<html lang>): en/index.html usa el FAQ en inglés.
    const EN = /^en\b/i.test(document.documentElement.lang || "");
    const L = EN ? api.en : api, T = UI[EN ? "en" : "es"];
    const FAQ = L.FAQ, ESPECIALES = L.ESPECIALES, SUGERIDAS = L.SUGERIDAS, responder = L.responder;
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
            const d = c && c.donaciones || {}, u = EN && /^https:\/\//.test(d.intl || "") ? d.intl : d.ar;
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
      acc.innerHTML = ""; escuchar.textContent = T.escuchar;
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
        if (speechSynthesis.speaking) { speechSynthesis.cancel(); hablar(false); escuchar.textContent = T.escuchar; return; }
        const u = new SpeechSynthesisUtterance(actual.respuesta);
        const voces = speechSynthesis.getVoices();
        const voz = EN ? (voces.find(v => /^en[-_]US/i.test(v.lang)) || voces.find(v => /^en[-_]GB/i.test(v.lang)) || voces.find(v => /^en\b/i.test(v.lang)))
          : (voces.find(v => /^es[-_]AR/i.test(v.lang)) || voces.find(v => /^es[-_](419|US|MX)/i.test(v.lang)) || voces.find(v => /^es\b/i.test(v.lang)));
        u.lang = voz ? voz.lang : (EN ? "en-US" : "es-AR"); if (voz) u.voice = voz; u.rate = 0.95;
        u.onstart = () => { hablar(!menosMovimiento()); escuchar.textContent = T.parar; };
        u.onend = u.onerror = () => { hablar(false); escuchar.textContent = T.escuchar; };
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

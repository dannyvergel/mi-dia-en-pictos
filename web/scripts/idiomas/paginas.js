// Páginas públicas del sitio bilingüe: título, descripción y datos estructurados de cada una, en español y en inglés.
// Lo usa scripts/idiomas.js. Las pantallas con sesión (docente, familia, admin, login, cuaderno) quedan afuera a propósito.
"use strict";
const TX = require("../../comunicador-textos.js");

const SITIO = "https://puentepictos.app";
const ACTUALIZADO = "2026-11-06"; // lastmod del sitemap (cambiarlo a mano cuando cambia el contenido)

const IDIOMAS = {
  es: { html: "es-AR", ogLocale: "es_AR",
    ogAlt: "Pizarrón con el nombre Puente, la frase «de la escuela a casa, en pictogramas» y una tira de pictogramas de ARASAAC" },
  en: { html: "en", ogLocale: "en_US",
    ogAlt: "Chalkboard with the name Puente, the line “from school to home, in pictograms” and a strip of ARASAAC pictograms" },
};

const PAGINAS = [
  { archivo: "index.html", prioridad: "1.0",
    es: { titulo: "Puente · De la escuela a casa, en pictogramas | Educación especial",
      descripcion: "La seño dicta cómo fue el día, Puente lo arma en pictogramas de ARASAAC y la familia lo ve en casa. Para escuelas especiales, chicos con autismo (TEA) y CAA. Gratis.",
      ogTitulo: "Puente — de la escuela a casa, en pictogramas",
      ogDescripcion: "La seño dicta cómo fue el día, Puente lo arma en pictogramas y la familia lo ve en casa. Gratuito y sin fines de lucro." },
    en: { titulo: "Puente · From school to home, in pictograms | Special education",
      descripcion: "The teacher dictates how the school day went, Puente turns it into ARASAAC pictograms and the family sees it at home. For special education, autism and AAC. Free.",
      ogTitulo: "Puente: from school to home, in pictograms",
      ogDescripcion: "The teacher dictates how the day went, Puente turns it into pictograms and the family sees it at home. Free and non-profit." } },
  { archivo: "comunicador.html", prioridad: "0.9", selector: false,
    es: { titulo: TX.es.tituloDoc,
      descripcion: "Tablero de comunicación aumentativa (CAA) con pictogramas de ARASAAC, gratis y sin cuenta: el chico toca los dibujos, arma la frase y el celular la dice. Anda sin conexión.",
      ogDescripcion: "Tocá los dibujos, armá la frase y el celular la dice. Gratis, sin cuenta y sin conexión." },
    en: { titulo: TX.en.tituloDoc,
      descripcion: "Free AAC picture communication board with ARASAAC pictograms, no account needed: tap the pictures, build a sentence and the device says it out loud. Works offline.",
      ogDescripcion: "Tap the pictures, build a sentence and the device says it out loud. Free, no account, works offline." } },
  { archivo: "presentacion.html", prioridad: "0.7", selector: /<body[^>]*>\n/,
    es: { titulo: "Cómo funciona Puente · Presentación en pictogramas",
      descripcion: "Puente en 10 diapositivas: la seño dicta el día, se arma en pictogramas, el alumno lo cuenta y la familia lo acompaña. Cuidado de los datos y hacia dónde va." },
    en: { titulo: "How Puente works · Presentation in pictograms",
      descripcion: "Puente in 10 slides: the teacher dictates the day, it becomes a pictogram strip, the student tells it and the family follows along. Data care and roadmap." } },
  { archivo: "privacidad.html", prioridad: "0.3",
    es: { titulo: "Política de privacidad (borrador) · Puente",
      descripcion: "Qué datos trata Puente, para qué, quién los ve, qué terceros intervienen, cuánto tiempo se guardan y cómo ejercer tus derechos (Ley 25.326). Borrador en revisión." },
    en: { titulo: "Privacy policy (draft) · Puente",
      descripcion: "What data Puente processes, why, who can see it, which third parties are involved, how long it is kept and how to exercise your rights. Courtesy translation of a draft." } },
  { archivo: "terminos.html", prioridad: "0.3",
    es: { titulo: "Términos de uso (borrador) · Puente",
      descripcion: "Términos de uso de Puente, herramienta gratuita y sin fines de lucro para escuelas de educación especial y familias, en prueba piloto. Borrador en revisión." },
    en: { titulo: "Terms of use (draft) · Puente",
      descripcion: "Terms of use for Puente, a free, non-profit tool for special education schools and families, currently in a pilot. Courtesy translation of a draft." } },
];

// ---------- JSON-LD (schema.org) ----------
// Organization (no NGO: Puente todavía no es una asociación civil registrada) + WebSite en todas las páginas;
// WebApplication de Puente en la portada y la presentación, y del Comunicador en su página. Los dos, gratis (price 0).
function jsonLd(p, idioma, url) {
  const en = idioma === "en", lang = IDIOMAS[idioma].html;
  const org = { "@type": "Organization", "@id": "https://puentepictos.app/#organizacion", name: "Puente",
    url: "https://puentepictos.app/", logo: "https://puentepictos.app/icono-512.png", email: "soporte@puentepictos.app",
    description: en ? "Free, non-profit project that brings the school day home in pictograms, for special education schools and families."
      : "Proyecto gratuito y sin fines de lucro que lleva el día de la escuela a casa en pictogramas, para escuelas de educación especial y familias.",
    areaServed: "AR", sameAs: ["https://github.com/dannyvergel/mi-dia-en-pictos"] };
  const sitio = { "@type": "WebSite", "@id": "https://puentepictos.app/#sitio", name: "Puente", url: "https://puentepictos.app/",
    inLanguage: ["es-AR", "en"], publisher: { "@id": org["@id"] } };
  const gratis = { "@type": "Offer", price: "0", priceCurrency: "ARS" };
  const puente = { "@type": "WebApplication", "@id": "https://puentepictos.app/#puente", name: "Puente", url: url("index.html", idioma),
    applicationCategory: "EducationalApplication", operatingSystem: "Web, Android", inLanguage: "es-AR", isAccessibleForFree: true, offers: gratis,
    description: en ? "The teacher dictates how the day went and Puente turns it into a strip of ARASAAC pictograms the student can use to tell the family. For special education schools (autism, intellectual disability, communication needs). Currently in Spanish, in a pilot in Santa Fe, Argentina."
      : "La docente dicta cómo fue el día y Puente lo convierte en una tira de pictogramas de ARASAAC para que el alumno se lo cuente a su familia. Para escuelas de educación especial (TEA, discapacidad intelectual, necesidades de comunicación).",
    audience: { "@type": "EducationalAudience", educationalRole: en ? "teacher, parent" : "docente, familia" },
    publisher: { "@id": org["@id"] } };
  const comunicador = { "@type": "WebApplication", "@id": "https://puentepictos.app/#comunicador", name: "Puente Comunicador",
    url: url("comunicador.html", idioma), applicationCategory: "EducationalApplication", operatingSystem: "Web, Android",
    inLanguage: ["es-AR", "en"], isAccessibleForFree: true, offers: gratis,
    description: en ? "Free AAC (augmentative and alternative communication) board with ARASAAC pictograms. No account, works offline, nothing leaves the device."
      : "Tablero de comunicación aumentativa y alternativa (CAA) con pictogramas de ARASAAC, gratis. Sin cuenta, funciona sin conexión y no guarda nada fuera del dispositivo.",
    publisher: { "@id": org["@id"] } };
  const pagina = { "@type": "WebPage", "@id": url(p.archivo, idioma) + "#pagina", url: url(p.archivo, idioma), name: p[idioma].titulo,
    inLanguage: lang, isPartOf: { "@id": sitio["@id"] } };
  const graph = [org, sitio, pagina];
  if (p.archivo === "index.html" || p.archivo === "presentacion.html") { graph.push(puente); pagina.about = { "@id": puente["@id"] }; }
  if (p.archivo === "index.html") graph.push(comunicador);
  if (p.archivo === "comunicador.html") { graph.push(comunicador); pagina.about = { "@id": comunicador["@id"] }; }
  return { "@context": "https://schema.org", "@graph": graph };
}

module.exports = { SITIO, ACTUALIZADO, IDIOMAS, PAGINAS, jsonLd };

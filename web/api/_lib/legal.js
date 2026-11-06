// Versión de los textos legales. Cambiarla cada vez que se modifique privacidad.html o terminos.html:
// el consentimiento que da cada familia guarda la versión que aceptó.
// BORRADOR: textos provisorios, pendientes de revisión legal.
const VERSION_PRIVACIDAD = "2026-11-01-borrador";
const VERSION_TERMINOS = "2026-11-01-borrador";
const URL_PRIVACIDAD = "/privacidad.html";
const URL_TERMINOS = "/terminos.html";
// Compromiso de confidencialidad que acepta cada profesional al entrar a un espacio de equipo (enfoque equipo).
// BORRADOR PENDIENTE DE REVISIÓN LEGAL: no es el texto final. Al cambiar el texto, subir la versión (se guarda con cada aceptación).
const VERSION_CONFIDENCIALIDAD_EQUIPO = "2026-11-05-borrador";
const TEXTO_CONFIDENCIALIDAD_EQUIPO = [
  "[BORRADOR pendiente de revisión legal]",
  "Me comprometo a usar lo que vea en este espacio (el día, la ficha y los documentos del chico o la chica) solo para acompañarlo/a en mi rol profesional.",
  "No voy a copiar, reenviar, publicar ni compartir esa información con nadie fuera del equipo que aprobó la familia, salvo obligación legal.",
  "Sé que la familia es la dueña del espacio, que puede sacarme en cualquier momento y que mis accesos quedan registrados.",
  "Si dejo de atenderlo/a, me voy del equipo desde Puente."
].join("\n");
module.exports = { VERSION_PRIVACIDAD, VERSION_TERMINOS, URL_PRIVACIDAD, URL_TERMINOS, VERSION_CONFIDENCIALIDAD_EQUIPO, TEXTO_CONFIDENCIALIDAD_EQUIPO };

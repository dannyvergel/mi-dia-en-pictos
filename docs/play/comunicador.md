# Puente Comunicador en Google Play · `app.puentepictos.comunicador`

El Comunicador como app **aparte** de Puente: sin cuenta, gratis, para todas las edades. Este documento junta lo que hay que responder en Play Console, armado a partir del código (`web/comunicador.html`, `web/comunicador-tablero.js`, `web/sw.js`) y de la página `web/privacidad-comunicador.html`. Es independiente de `data-safety.md` y `clasificacion-contenido.md`, que son de la app Puente completa (con cuentas, docentes y familias).

Marcas: **⚠** = decisión tuya o interpretación a revisar. **(de memoria)** = lo recuerdo de las políticas de Google y **no lo verifiqué** contra la documentación vigente: confirmalo en la consola antes de enviar.

## Qué hace la app, en corto (de dónde salen las respuestas)

- Es la misma página `comunicador.html` dentro de una TWA (Chrome sin barra). Manifest propio: `web/comunicador.webmanifest` (`id` `/comunicador.html`, `start_url` `/comunicador.html?app`, alcance `/`). Paquete `app.puentepictos.comunicador`, ya declarado en `web/.well-known/assetlinks.json` con la huella de la clave de sideload; falta sumar la de Play App Signing.
- **Sin cuenta.** No llama a `/api/`. No tiene analítica, ni anuncios, ni compras, ni IA (lo controla `web/test/comunicador.test.js`). No usa el micrófono.
- **En el dispositivo** (`localStorage` clave `puente-comunicador`, más `puente-idioma`, `sessionStorage` y la caché de Cache Storage para usarla sin conexión): ajustes, favoritos, hasta 60 dibujos sumados con el buscador, palabra de activación de Casa, idioma. Nada de eso va a Puente. El botón «Borrar ajustes y favoritos de este dispositivo» lo borra (la copia sin conexión y `puente-idioma` se borran con los datos del sitio o de la app).
- **Lo único que sale del dispositivo:**
  1. Las imágenes de los pictogramas se piden a `https://static.arasaac.org`: ARASAAC puede ver la **dirección IP** y qué pictogramas se piden (por su número). Una vez guardadas, se usan sin volver a pedirlas.
  2. Solo si se usa el buscador de Favoritos: la palabra (máximo 40 caracteres) va del navegador a `https://api.arasaac.org`, con `credentials: "omit"` y `no-referrer`. Puente no la recibe ni la guarda, y el service worker no la cachea.
  3. El pedido de los archivos de la página a `puentepictos.app` (Vercel): como cualquier sitio, el servidor puede registrar datos técnicos habituales (IP).
- La voz es la **síntesis de voz del dispositivo** (`speechSynthesis`). No sé si una voz dada es local o remota: depende del dispositivo. La política no afirma ninguna de las dos cosas.

## 1. Seguridad de los datos (Data safety)

Play Console → Contenido de la app → Seguridad de los datos.

### Lo que no se discute

| Pregunta | Respuesta |
|---|---|
| ¿Datos encriptados en tránsito? | **Sí** (todo por HTTPS) |
| ¿Anuncios? | No |
| Cuentas | No hay. No hace falta URL de borrado de cuenta (ver sección 4) |
| Recolecta nombre, email, teléfono, ubicación, contactos, fotos, audio, archivos, salud, mensajes, compras | **No** |
| Identificadores de publicidad (AD_ID) | No (el AAB no debería pedir el permiso: **verificarlo** con `bundletool dump manifest` cuando exista el `.aab`) |
| Registros de fallas y diagnóstico | No (sin SDK de fallas) |

### ⚠ La decisión: ¿lo que ve ARASAAC es «compartir» o «recolectar»?

ARASAAC no es un proveedor de servicios que procese por cuenta de Puente (como Vercel o Neon en la app grande): es un servicio público de un tercero al que el navegador le pide imágenes y, a veces, una palabra. Google no tiene una excepción por «anónimo» ni por «es un pedido del navegador». Hay dos formas honestas de declararlo. No afirmes en ningún lado que ARASAAC «nunca recibe datos personales»: recibe la IP y, con el buscador, lo que se escribe, y una persona puede escribir cualquier cosa.

| | **Opción conservadora (recomendada)** | **Opción liviana** |
|---|---|---|
| Recolecta o comparte datos | **Sí** | **No** |
| Qué declarás | «Actividad en la app → Historial de búsqueda en la app»: **compartido** con un tercero (ARASAAC), **opcional** (solo si se usa el buscador), finalidad «Funcionalidad de la app». Si querés cubrir también la IP: «Identificadores del dispositivo u otros» o «Ubicación aproximada» (⚠ no recuerdo en cuál de los dos tipos Google ubica la dirección IP: revisá la ayuda de Data safety), compartido, finalidad «Funcionalidad de la app» | Nada. Argumento: Puente no recibe ni guarda nada; el contenido web que carga la app (imágenes) y la palabra los pide el navegador a un servicio público; Puente no los procesa ni los ve. |
| A favor | Coincide con lo que dice `privacidad-comunicador.html` (ARASAAC ve IP, imágenes y la palabra). El público incluye niños y personas con discapacidad: conviene pecar de transparente. Si Google detecta el pedido a `api.arasaac.org` y no está declarado, es una observación de política y puede frenar una actualización. | Ficha de seguridad más limpia («sin datos»). |
| En contra | La ficha muestra «se comparten datos» aunque Puente no los guarde. | Riesgo de que Google lo marque como declaración inexacta (el tráfico a `api.arasaac.org` se ve). Queda en contradicción con tu propia página de privacidad, que lo cuenta. |

Si elegís la conservadora, la sección 3 de Data safety (compartir) dice: se comparte con ARASAAC (Gobierno de Aragón) la palabra de búsqueda y la IP, de forma opcional, para traer los pictogramas; no se usa para publicidad ni se vende. **(de memoria)** Google permite marcar «procesamiento efímero» cuando el dato solo se usa en el momento y no se guarda; no sé qué hace ARASAAC con los pedidos, así que **no lo marques como efímero** salvo que ellos lo confirmen.

⚠ Otra decisión: la política dice (y el código es así) que el buscador es opcional, pero el pedido de las imágenes no lo es (sin imágenes no hay tablero). Por eso la IP de las imágenes es obligatoria, y la palabra, opcional.

### Prácticas de seguridad (insignias)

| Pregunta | Respuesta |
|---|---|
| Datos encriptados en tránsito | Sí |
| Podés solicitar que se borren los datos | Ver sección 4. Si no recolectás datos, Google no muestra la insignia; si declarás la opción conservadora, respondé que los datos que Puente guarda son cero y que lo guardado en el dispositivo lo borra la persona (botón y ajustes de Android). ⚠ Confirmá cómo pregunta la consola |
| Revisión de seguridad independiente (MASA) | No |
| Comprometido con la Política de Familias | Ver sección 3 (⚠) |

## 2. Clasificación del contenido (IARC)

Play Console → Contenido de la app → Clasificación del contenido. Email de contacto: soporte@puentepictos.app. Categoría: la de utilidad o la de referencia y educación, según cómo se llame en tu versión del cuestionario (⚠ no recuerdo los nombres exactos).

| Pregunta | Respuesta | Por qué |
|---|---|---|
| Violencia, miedo, contenido sexual, lenguaje soez, drogas, apuestas, humor crudo | **No** | Pictogramas educativos de ARASAAC. El buscador descarta los resultados que ARASAAC marca como sexo o violencia (`comunicador-tablero.js`). ⚠ Es un filtro por la marca de ARASAAC: no garantiza el 100 %; si el revisor pregunta, explicalo así. |
| ¿Los usuarios pueden interactuar o intercambiar contenido? | **No** | No hay cuentas, chat ni forma de compartir nada con otra persona. Lo que arma cada uno queda en su dispositivo. |
| ¿Se comparte la ubicación? | No | |
| ¿Se pueden comprar bienes digitales? | No | No hay compras (ni donaciones: `pie.js` las oculta dentro de la app). |
| ¿Es un navegador web sin restricciones o un buscador? | No | El buscador solo trae pictogramas de ARASAAC. ⚠ Si la pregunta le parece ambigua al cuestionario, respondé con esta explicación. |
| ¿Tiene contenido generado por IA? | No | |
| Anuncios | No | |

**Resultado esperado:** PEGI 3 / ESRB «Everyone» / Argentina «ATP», sin elementos interactivos. **(de memoria)** Si sale algo más alto, revisá la pregunta de interacción.

## 3. Público objetivo y contenido

Decisión tomada (2026-11-07): para **todas las edades**, incluidos niños. Eso mete a la app en la **Política de Familias** de Play. Esto es lo que recuerdo; **confirmá cada punto en la consola** (Política → Familias) antes de enviar:

1. **(de memoria)** Si entre los grupos de edad objetivo hay menores de 13, la ficha entra en «Para niños» o en «para todos los públicos» y hay que cumplir la Política de Familias: sin anuncios (o solo con SDKs certificados), sin AD_ID ni otros identificadores de niños, sin ubicación precisa, solo SDKs autorizados para Familias. El Comunicador no tiene ninguno de esos elementos: no hay SDKs nativos ni analítica.
2. **(de memoria)** La declaración de Data safety tiene que coincidir con lo que la app hace. Con la opción conservadora (sección 1) coincide.
3. **(de memoria)** Se exige una política de privacidad que hable de los niños y sea accesible desde la ficha. La nuestra: `https://puentepictos.app/privacidad-comunicador.html`. ⚠ Está **pendiente de revisión legal** (igual que `privacidad.html`) y no menciona leyes específicas de menores (COPPA, GDPR-K, Ley 25.326 por separado): decidí con tu revisión legal si hace falta sumarlas. Puente se declara en la Argentina; los destinos de Play que elijas (Estados Unidos, Brasil, Europa) traen reglas propias.
4. **(de memoria)** Se espera una pantalla neutral de edad cuando la app atrae a niños y a adultos, y que los enlaces que sacan a la persona de la app o a compras estén detrás de una puerta para adultos. **No verifiqué si esto aplica a una TWA sin cuentas ni compras.** Hoy el Comunicador tiene enlaces que salen: el crédito a `arasaac.org`, el pie común (`pie.js`) con «Privacidad» y «Términos», y el enlace de descarga de la APK, que ya se oculta dentro de la app instalada (`!EN_APP` en `comunicador.html`: Play no deja ofrecer otra APK).
5. ⚠ **Cambio de alcance a `/`:** para que la página en inglés (`/en/comunicador.html`) quede dentro del manifest, el alcance pasó de `/comunicador` a `/` (un alcance es un prefijo y no hay uno solo que cubra las dos rutas). Efecto: dentro de la app se puede navegar a cualquier página de puentepictos.app, incluida la portada de Puente con Vercel Analytics y el botón «Entrar». Para Familias conviene que la pantalla no ofrezca esos caminos. Opciones (todas son cambio de código, fuera de este PR): un manifest de inglés aparte con alcance `/en/comunicador`, o quitar del pie del Comunicador los enlaces a la portada. ⚠ No sé si la TWA respeta el alcance del manifest o solo valida el origen: probalo en el dispositivo.
6. **(de memoria)** «Aprobada por docentes» es opcional y se pide aparte. No hace falta para publicar.
7. La ficha **no** debe prometer cosas que la app no hace («cura», «terapia», fines médicos). El manifest tiene la categoría `medical`: en Play, elegí **Educación** (⚠ o «Herramientas» si prefirís no insistir con niños) y no «Medicina».

## 4. Ficha de la tienda

| Campo | Valor |
|---|---|
| Nombre (máx. 30) | `Puente Comunicador` (18 caracteres; coincide con el manifest y el título de la página) |
| Descripción corta (máx. 80) | `Tablero de pictogramas: tocá los dibujos, armá la frase y el celular la dice.` (77 caracteres) |
| Categoría | Educación (⚠ ver punto 7 de la sección 3) |
| Idioma de la ficha | Español (Latinoamérica) – es-419; sumá inglés (en-US) con el mismo texto traducido |
| Email de contacto | soporte@puentepictos.app |
| URL de la política de privacidad | `https://puentepictos.app/privacidad-comunicador.html` (tiene que estar en producción antes de enviar; inglés: `https://puentepictos.app/en/privacidad-comunicador.html`) |
| URL para borrar la cuenta | **No hace falta**: no hay cuentas. En la ficha de Data safety, si la consola la pide igual, explicá que no hay cuenta y que lo guardado en el dispositivo se borra con el botón de la app o desde los ajustes de Android. ⚠ Confirmá cómo lo plantea la consola. |
| Anuncios / compras | No / No |
| Atribución de ARASAAC | Incluila al final de la descripción larga (y dejala visible en la app, como ya está): «Pictogramas de ARASAAC (https://arasaac.org). Autor: Sergio Palao. Propiedad: Gobierno de Aragón (España). Licencia: CC BY-NC-SA 4.0.» |

⚠ **Licencia no comercial:** CC BY-NC-SA no permite uso comercial y obliga a compartir igual. Mantené la app gratis, sin anuncios ni compras (como hoy) y sin donaciones dentro de la app. Si Google o ARASAAC cuestionan el uso, es una conversación con ARASAAC, no con Play.

## 5. Lo que tenés que hacer vos hoy en Play Console

Nada de esto lo hice yo ni se puede hacer desde el repo.

1. **Crear la app** en Play Console: nombre «Puente Comunicador», idioma es-419, app (no juego), gratuita. Paquete **`app.puentepictos.comunicador`**: coincide con `web/.well-known/assetlinks.json`. Si lo cambiás, hay que cambiar también `assetlinks.json`.
2. **Generar el `.aab`** con PWABuilder o Bubblewrap a partir de `https://puentepictos.app/comunicador.webmanifest` (id `/comunicador.html`, start_url `/comunicador.html?app`). Firmalo con una clave de subida (tu clave actual sirve, como en `guia-danny.md`). **(de memoria)** Play exige `.aab`, no APK. Con `bundletool dump manifest`, verificá que no pida permisos innecesarios ni AD_ID.
3. **Activar Play App Signing** («Que Google genere y administre la clave de firma») y **copiar el SHA-256 del certificado de la clave de firma de apps** (Integridad de la app → Firma de apps), no el de la clave de subida.
4. **Pegar ese SHA-256 en `web/.well-known/assetlinks.json`**, en el bloque `app.puentepictos.comunicador`, junto a la huella de sideload que ya está, y desplegar. Sin esto, la TWA muestra la barra de URL de Chrome. `web/test/play.test.js` y `web/test/comunicador-apk.test.js` controlan ese archivo.
5. **Desplegar este PR en producción** antes de enviar a revisión, para que existan `https://puentepictos.app/privacidad-comunicador.html` y `.../en/privacidad-comunicador.html`.
6. **Completar** «Seguridad de los datos» (sección 1: decidí conservadora o liviana), «Clasificación del contenido» (sección 2) y «Público objetivo y contenido» (sección 3), más la política de privacidad, el email de contacto y la categoría (sección 4). Subí capturas propias del Comunicador (⚠ en `docs/play/capturas` solo `05-comunicador.png` es del Comunicador; las demás son de Puente) e ícono de 512 px.
7. **Prueba cerrada:** **(de memoria)** una cuenta de desarrollador personal creada después de noviembre de 2023 necesita **12 testers con opt-in durante 14 días seguidos** antes de pedir producción, **por cada app nueva**. Los mismos testers de Puente sirven si hacen opt-in también en esta. Plan en `checklist-14-dias.md` y `una-o-dos-apps.md`. ⚠ Confirmá en la consola si tu cuenta está dentro de esa regla.
8. **Revisión legal** de `privacidad-comunicador.html` (y de `privacidad.html`) y, si cambia la política principal, **no** subas su versión sin pensar: pide de nuevo el consentimiento a quienes ya entraron.
9. **Pendiente de código** (no lo cubre este PR): el pie del Comunicador sigue diciendo «no guarda nada fuera de tu dispositivo» y no enlaza la nueva página, porque ese texto vive en `web/comunicador-textos.js` y las páginas en inglés se generan con `npm run idiomas`. Cambio mínimo: en `pie` (es y en) aclarar que no se guarda nada en los servidores de Puente y que los dibujos y la palabra de búsqueda se piden a ARASAAC, con enlace a la nueva página (`/privacidad-comunicador.html` y `/en/privacidad-comunicador.html`); regenerar `web/en/comunicador.html`. Conviene hacerlo antes de enviar a Play.

## Pendientes antes de enviar

1. Decidir la opción de la sección 1 (conservadora o liviana).
2. Resolver el pie del Comunicador (punto 9) y los enlaces que salen de la app (sección 3, puntos 4 y 5).
3. Revisión legal de las dos páginas de privacidad.
4. Confirmar en la consola todo lo marcado **(de memoria)**.

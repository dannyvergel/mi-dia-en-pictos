# Comunicador con pictogramas

Página pública **`/comunicador.html`** (`web/comunicador.html`): un tablero de comunicación aumentativa (CAA) para que el chico se comunique libremente tocando pictogramas. Es libre para cualquiera, no pide cuenta y no depende del resto de Puente.

## Qué hace

- **Grilla de pictos grandes y táctiles**, en 10 categorías: núcleo, sentimientos, necesidades, personas, lugares, acciones, juegos, comida, cuerpo y ropa (104 pictos), más el tablero Casa (10 órdenes).
- **Barra de frase arriba:** cada picto que se toca se suma a la frase. Botones **Hablar** (o tocar la frase), **Borrar** (el último) y **Todo** (borra la frase). Máximo 24 pictos; si se pasa, sale el más viejo.
- **Voz:** `speechSynthesis` del propio equipo. En español elige es-AR si existe; si no, otra voz latinoamericana, después es-ES y después cualquier voz en español. Si el equipo no tiene voz en español o el navegador no puede hablar, la frase igual se ve escrita y la página lo avisa. En inglés, ver «Idiomas».
- **Ajustes** (desplegable):
  - «Decir cada dibujo al tocarlo» (prendido de entrada).
  - «Armar la frase con los dibujos que toca» (prendido). Si se apaga, cada toque solo dice la palabra y no se junta arriba.
  - Tamaño de los dibujos: grandes, medianos o chicos. Ninguno baja de 72 px.
  - «Habla como nene / nena»: cambia las palabras con género (contento/contenta, cansado/cansada…). En inglés se oculta.
  - Voz (solo voces del idioma activo) y «Hablar más despacio».
  - «Borrar ajustes y favoritos de este dispositivo».
- **Favoritos:** el botón «Elegir favoritos» activa un modo en el que tocar un picto lo agrega o lo saca. Con favoritos aparece la pestaña ★ Favoritos.
- **Buscador de ARASAAC** (dentro de «Elegir favoritos»): la familia escribe una palabra, ve los pictogramas de ARASAAC y toca uno para sumarlo a Favoritos. Ver «Buscador de ARASAAC» más abajo.
- **Tablero Casa** (pestaña «Casa», al final de las categorías): órdenes para Alexa, Google o Siri dichas en voz alta. Ver «Tablero Casa» más abajo.
- **Pantalla completa** (Fullscreen API). Si el navegador no la permite, como en el iPhone, queda un «modo tablero» que oculta todo lo demás. En ese modo solo se ven la frase, las categorías y la grilla. Para salir hay que tocar «Salir» dos veces en 3 segundos, así el chico no sale sin querer.

## Privacidad: todo en el cliente

- La página **no hace ningún pedido a `/api`**, no usa IA y **no tiene analítica**: no carga `/_vercel/insights`, a diferencia del resto del sitio.
- El pie común (`pie.js`) va con `data-donaciones="no"` y sin `data-feedback`, así que tampoco pide `api/config` ni `api/auth`.
- Lo único que se guarda está en `localStorage` bajo la clave `puente-comunicador`: ajustes, favoritos, pictos propios del buscador (`propios`: `{ id, t }`) y el idioma elegido. Se guarda solo si el usuario cambia algo, y se borra con el botón de la página. La página lo explica.
- Conexiones externas, las dos a ARASAAC (Gobierno de Aragón), nunca a Puente:
  - las imágenes de `static.arasaac.org`, igual que en el resto de Puente;
  - **solo cuando la familia usa el buscador**, la palabra escrita va a `api.arasaac.org` (`T.buscarArasaac`), con `credentials: "omit"` (sin cookies) y `referrerPolicy: "no-referrer"` (ARASAAC no ve desde qué página viene).
- Los textos lo dicen así: `infoPrivado` y la nota del buscador en la página (ES / EN), la respuesta «¿De dónde salen los pictogramas?» del pizarrón (`pizarron.js` y su lista sin JS en `index.html`) y el punto de ARASAAC en `privacidad.html`. Ya no dicen «todo pasa en este dispositivo».

Lo controla `test/comunicador.test.js`: un solo `fetch` (el del buscador, en `comunicador-tablero.js`) y solo a `api.arasaac.org`, ninguna otra URL externa en el código, sin `/api/`, sin analítica, pie sin pedidos, y que los textos de privacidad nombren a ARASAAC.

## Sin conexión

- `sw.js` (CACHE **`pictos-v30`**) suma `comunicador.html`, `comunicador-tablero.js` y `comunicador-textos.js` al precache. Además carga el vocabulario con `importScripts('comunicador-tablero.js')`.
- Al abrir el comunicador, la página le manda al service worker `postMessage({ tipo: "comunicador", extras: [ids de los pictos propios] })` y el SW guarda **todos** los pictos del tablero (114 con Casa) y los propios. Si alguno falla, sigue con el resto y lo reintenta la próxima vez. Los pictos se bajan solo cuando alguien abre el comunicador: unas 115 imágenes chicas. Así no se le gastan datos a quien solo entra a la portada.
- Los pictos propios quedan guardados al verlos (caché primero de `static.arasaac.org`) y, como la página los vuelve a mandar en `extras`, sobreviven al cambio de versión del caché. `urls(extras)` descarta lo que no sea un id válido y toma como mucho 60.
- Las búsquedas (`api.arasaac.org`) **no** pasan por el caché: van siempre a la red y no queda un historial en el equipo. Sin conexión, el buscador muestra «Sin conexión: el buscador necesita internet. Los dibujos que ya sumaste siguen andando.»
- Las imágenes de `static.arasaac.org` pasan a **caché primero** para todo el sitio, porque no cambian y así el tablero responde al instante. El resto sigue con red primero.
- Igual que antes, **nunca** se cachean `/api/` ni `/descargar/`.

> **Versiones del SW:** producción estaba en `pictos-v29` (tablero Casa); Comida, Cuerpo, Ropa y el buscador (rama `comunicador-vocabulario`) lo pasan a **`pictos-v30`**. El PR #23 (rama `equipos`) tiene que pasar a **`pictos-v31`** cuando entre, y actualizar las aserciones de `test/documentos.test.js`, `test/comunicador.test.js` y `test/revisor.test.js`.

## Vocabulario

El vocabulario está en `web/comunicador-tablero.js`, que comparten la página y el SW. Cada picto tiene:

| campo | qué es |
|---|---|
| `id` | id del pictograma de ARASAAC |
| `t` | lo que se ve y se dice |
| `k` | palabra clave que ese id tiene que tener en ARASAAC |
| `f` | forma femenina (opcional) |
| `dice` | lo que dice la voz si es distinto de `t`; por ejemplo, «lavarse las manos» se dice «lavarme las manos» |
| `en` | lo que se ve y se dice en inglés |
| `ken` | palabra clave que ese mismo id tiene en ARASAAC en inglés |
| `dicen` | lo que dice la voz en inglés si es distinto de `en` («wash hands» → «wash my hands») |

Las categorías tienen `nombre` (español) y `en` (inglés).

**Verificación:** `node scripts/verificar-comunicador.js` (necesita red) pide `https://api.arasaac.org/api/pictograms/es/<id>` para cada picto y controla que tenga su clave `k`. El 06/11/2026, con Comida, Cuerpo, Ropa y Casa, dio **114/114** en español y **114/114** con `--en`. Antes (05/11/2026) eran 68/68. Con `--en` pide `https://api.arasaac.org/api/pictograms/en/<id>` y controla `ken`: el 06/11/2026 dio **68/68** (y el español sigue en 68/68). Además, los pictos se revisaron a ojo en una hoja de contactos. No corre en `npm test` porque los tests no usan la red.

Elecciones a tener en cuenta (clave de ARASAAC → lo que se muestra):

- Comida: `milanesa de ternera` (37000, con la vaca chiquita) → «milanesa»; `infusión` (2429, taza con saquito) → «té»; `mate` (31035, mate con bombilla) → «mate» (ARASAAC no tiene «mate cocido»); `espaguetis` → «fideos»; `galletas` → «galletitas»; `vaso de agua` (4768) → «vaso de agua» (el «agua» 2248 sigue en Necesidades: los ids no se repiten).
- Cuerpo: `panza` (2786) → «panza»; `dolor de cabeza` (28753, nene) → «me duele la cabeza»; `dolor de tripa` (28765, nene) → «me duele la panza». «me duele» (30620) sigue en Necesidades y se combina con las partes del cuerpo.
- Ropa: `remera`, `sudadera` (8701, buzo con capucha) → «buzo»; `plumífero` (27978) → «campera»; `pantalón corto` (13638) → «short»; `calcetines` → «medias»; `bata` (8038, guardapolvo blanco) → «guardapolvo».

- `tú` → «vos»
- `querer` → «quiero»
- `terminar` (brazos cruzados, «¡se acabó!») → «terminé»
- `enfadado` → «enojado»
- `maestra` → «seño»
- `parque infantil` → «plaza»
- `dormitorio` → «pieza»
- `supermercado` → «súper»
- `columpio` → «hamaca»
- `tableta` → «tablet»
- `puzzle` → «rompecabezas»
- «agua» usa el picto de botella y vaso (2248) en lugar de la canilla.

Para sumar o cambiar palabras:

1. Editá `comunicador-tablero.js`.
2. Poné también `en` y `ken`, y corré el verificador en los dos idiomas (`node scripts/verificar-comunicador.js` y `node scripts/verificar-comunicador.js --en`).
3. Corré `npm test`, que exige entre 60 y 80 pictos y sin ids repetidos.
4. Subí la versión del CACHE en `sw.js`.

## Tablero Casa (asistentes de voz, sin integración)

Para que un chico que no habla maneje Alexa, Google Home o Siri. **No hay integración** con Amazon, Google ni Apple: cada picto hace que el equipo diga en voz alta (con el mismo `speechSynthesis`) la palabra de activación y una orden, y el parlante la escucha como si hablara una persona.

- **Dónde se entra:** pestaña **Casa** al final de las categorías del Comunicador, o directo con **`/comunicador.html#casa`** (en inglés, `/en/comunicador.html#casa`, pestaña «Home»).
- **Órdenes** (10): prender / apagar la luz, poner / parar la música, subir / bajar el volumen, qué hora es, prender / apagar la tele, contame un cuento. Están en `CASA.ordenes` de `comunicador-tablero.js`, con los mismos campos que el resto (`id`, `t`, `k`, `en`, `ken`) más `orden` (lo que se le dice al asistente en español) y `ordenen` (en inglés).
- **Formas de las órdenes:** en la pantalla se ve el voseo o el infinitivo («prender la luz», «contame un cuento»), pero al asistente se le dice la forma de su documentación («prende la luz», «pon música», «cuéntame un cuento»), porque Alexa y Google no tienen español de Argentina. En inglés: «turn on the lights», «play music», «what time is it», «tell me a story».
- **Palabra de activación** (Ajustes → «Tablero Casa: palabra de activación»): Alexa (por defecto), Ok Google, Siri u «Otra» (texto libre, hasta 40 letras). Siri se dice «Oye Siri» en español y «Hey Siri» en inglés. Si «Otra» queda vacía, se dice solo la orden y la barra avisa que el parlante no se va a despertar.
- **Pausa:** «Esperar después de la palabra» (prendido de entrada). Se dice la palabra, se espera a que la voz termine (evento `end`; si el navegador no lo avisa, a los 4 s sigue igual) y recién después de la espera elegida (medio segundo, 1 s por defecto, 1,5, 2 o 3 s) se dice la orden. Sin pausa sale una sola frase: «Alexa, prende la luz». Tocar otra orden durante la espera corta la anterior. «Probar: preguntar la hora» dice la orden «qué hora es».
- **Se guarda** en el mismo `localStorage` `puente-comunicador` (`casaPalabra`, `casaOtra`, `casaPausa`, `casaEspera`) y se borra con «Borrar ajustes y favoritos». La lógica de la frase es `TABLERO.fraseCasa(orden, ajustes, idioma)`, con tests.
- **Aviso en pantalla:** el parlante tiene que estar cerca y con volumen; lo que escucha el asistente le llega a su empresa (Amazon, Google o Apple), no a Puente. En pantalla completa se ocultan el aviso y el botón «Cambiar» y queda solo la línea «Dice: …».
- **Accesibilidad:** las órdenes son teclas iguales a las demás (botones de 92 px), con `aria-label` «prender la luz. Dice «Alexa, prende la luz»», se usan con teclado y no se suman a la frase ni a favoritos.
- **Sumar una orden:** una línea en `CASA.ordenes` (picto de ARASAAC con `k` / `ken` verificadas con `node scripts/verificar-comunicador.js` y `--en`, que ahora también revisan Casa: 78/78 el 06/11/2026), `npm test` (pide entre 8 y 12 órdenes) y subir el CACHE de `sw.js`. Los pictos de Casa (y el ícono 37438, «altavoz inalámbrico») se guardan para usar sin conexión.
- **Pictos elegidos** (clave de ARASAAC): 8103 encender la luz, 8027 apagar la luz, 2746 escuchar música, 38213 botón de pausa, 38216 / 38215 botón de subir / bajar volumen, 2549 reloj, 9802 encender la televisión, 20093 apagar la televisión, 2364 cuento.
- **Límites:** depende de que el parlante entienda la voz del equipo (volumen, distancia, acento de la voz sintética). Con Siri, el equipo que habla no puede ser el mismo iPhone o iPad que escucha. Las órdenes de luz y tele solo andan si esos aparatos ya están configurados en la app del asistente.

## Buscador de ARASAAC (pictos propios)

- **Dónde:** al tocar «Elegir favoritos» aparece arriba de la grilla «Sumar dibujos de ARASAAC»: campo de texto (`<form role="search">` con `<label>`), botón Buscar y resultados. Al tocar «Listo, terminé de elegir» se oculta. No se ve en pantalla completa.
- **Cómo busca:** `T.buscarArasaac(palabra, lang)` en `comunicador-tablero.js` pide `https://api.arasaac.org/api/pictograms/<es|en>/search/<palabra>` en el idioma activo. Solo al apretar Buscar (no mientras se escribe), con al menos 2 letras y como mucho 40. ARASAAC responde 404 cuando no encuentra nada: se muestra «No encontré dibujos para…». Si falla la red, «No pude conectar con ARASAAC…». Sin conexión (`navigator.onLine`), el aviso de sin conexión, también al abrir el buscador o al perder la conexión.
- **Resultados:** como mucho 24, sin repetidos y sin los que ARASAAC marca con contenido sexual o violento (`sex` / `violence`). La palabra de cada uno es la clave igual a la buscada; si no, una que la contenga; si no, la primera. Se muestran como botones `.tecla` (92 px de alto) con `aria-pressed` y `aria-label` «perro: sumar a favoritos» / «perro: en favoritos. Tocá para sacarlo».
- **Qué se guarda:** al tocar un resultado, `{ id, t }` va a `aj.propios` y el id a `aj.favoritos`, en `localStorage` `puente-comunicador`. Si el id ya está en el tablero (por ejemplo papá), va solo a favoritos. Como mucho 60 propios. Sacarlo de favoritos lo borra de `propios`. «Borrar ajustes y favoritos» también los borra. Lo guardado se limpia al leerlo (`T.propiosValidos`).
- **Cómo se ve y se dice:** en la pestaña Favoritos, con la palabra elegida en los dos idiomas (la familia la eligió así) y borde ★.
- **Etiquetas largas:** si una palabra no entra en la tecla, `ajustarEtiquetas()` achica esa etiqueta (hasta 9 px) en vez de cortarla a la mitad. Con «Chicos» en 390 px, «rompecabezas» y «galletitas» igual se parten.

## Idiomas

El Comunicador anda en **español** y en **inglés**, cada uno con **su propia URL** (como todo el sitio público, ver `docs/idiomas.md`):

- `/comunicador.html` en español y `/en/comunicador.html` en inglés. La versión en inglés la genera `scripts/idiomas.js` a partir de la misma página y de `comunicador-textos.js`, así que **se sirve ya traducida** (Google la ve sin JavaScript).
- **Selector visible «Español / English»** arriba del tablero: son links (`<a>`) a las dos URLs (se ocultan en pantalla completa / modo tablero).
- **Qué idioma se usa en la web:** manda la URL. `?lang=en` / `?lang=es` siguen andando (links viejos) y el `canonical` apunta a la URL del idioma que se ve.
- **Dentro de la app instalada** (Android / PWA: `?app`, `android-app://` o `display-mode: standalone`) no se puede salir de `/comunicador`, así que el selector cambia el idioma en la misma página, como antes: `?lang=`, si no la elección guardada, si no `navigator.language`. La lógica es `elegirIdioma()` en `comunicador-textos.js`, con tests.
- La elección se guarda en `localStorage` `puente-comunicador` (campo `idioma`) y, para el resto del sitio, en `puente-idioma` (lo hace `pie.js` con `data-idioma`). «Borrar ajustes y favoritos» borra la del Comunicador.
- `<html lang>` cambia (`es-AR` / `en`), igual que `document.title`. La página y `sitemap.xml` declaran `hreflang` es-AR / en / x-default (los genera `scripts/idiomas.js`).
- **Textos de la interfaz:** diccionario simple en `web/comunicador-textos.js` (sin librerías). El HTML trae el español escrito y marca cada texto con `data-i18n` (texto), `data-i18n-html` (texto con negrita o link, solo textos fijos del diccionario) o `data-i18n-aria` (aria-label). Los avisos dinámicos usan `tr("clave")`. Un test exige que el inglés tenga todas las claves del español y que toda clave usada en la página exista.
- **Vocabulario:** mismos pictos (mismo id) con `en` / `ken` / `dicen`. Inglés natural de chico y en primera persona cuando corresponde («I want», «I don't want», «all done», «it hurts», «wash my hands»).
- **Género:** en inglés casi no hay palabras con género, así que el ajuste «Habla como nene / nena» se oculta y no se aplica (queda guardado para cuando se vuelve al español).
- **Voz en inglés:** en-US si hay; si no, en-GB; si no, cualquier `en-*`. La lista de voces muestra solo las del idioma activo, y si no hay ninguna se muestra el aviso en ese idioma.
- **Crédito ARASAAC en inglés:** «Pictograms author: Sergio Palao. Source: ARASAAC (https://arasaac.org). License: CC BY-NC-SA. Owner: Government of Aragón (Spain).»
- El pie común (`pie.js`) sale en el idioma de la página (`<html lang>`).

Elecciones en inglés a tener en cuenta (clave de ARASAAC en inglés → lo que se muestra):

- `plus sign` (3220, el «+» que en español es «más») → «more». ARASAAC no tiene «more» en ese id; hay otros pictos «more» (5508, 26913) pero se dejó el mismo dibujo que en español.
- `once again` → «again»
- `I have finished` (brazos cruzados) → «all done»
- `I like that` / `I don't like that` → «I like it» / «I don't like it»
- `hurt` → «it hurts»
- `heat` → «hot»
- `hush` → «quiet»
- `schoolyard` (patio) → «schoolyard»; `playground` (plaza) → «playground»
- `supermarket` → «store»
- `wash the hands` → «wash hands» (la voz dice «wash my hands»)
- `storybook` → «story»
- `veal milanesa` → «breaded steak»; `meat pasty` → «empanada»; `spaghetti` → «pasta»; `infusion` → «tea»
- `headache` / `stomach ache` → «my head hurts» / «my tummy hurts»
- `sweatshirt` (con capucha) → «hoodie»; `ski cap` → «hat»; `white coat` (guardapolvo) → «smock»; `pant` → «pants»; `short trousers` → «shorts»

## Accesibilidad

- Teclas de 72 px o más: las acciones y las categorías miden 76 px y las teclas de pictos 92 px de alto.
- Bordes oscuros y texto `--tinta` sobre blanco. Cada categoría tiene su color en el borde.
- `aria-label` en todos los botones, pestañas con `role="tablist"` (se recorren con las flechas) y una región `aria-live` para avisos.
- Sin animaciones ni transiciones en la página, aunque el sistema no pida movimiento reducido.
- Sin zoom por doble toque (`touch-action: manipulation`), sin menú al mantener apretado, sin arrastrar imágenes y sin «tirar para recargar» (`overscroll-behavior`).
- Si se toca el mismo picto dos veces en menos de medio segundo, cuenta como un solo toque.
- Las etiquetas van en imprenta mayúscula, como la tira de la portada y como se enseña en el nivel inicial.

## Enlaces

- Link discreto «Comunicador» al final de la portada (`index.html`) y en el pie de `familia.html`.
- La página está en `sitemap.xml` y es indexable. `robots.txt` no la bloquea.
- No se agregaron funciones en `api/`: siguen 11 de 12 en Vercel Hobby.

## Licencia de los pictogramas

Autor pictogramas: Sergio Palao. Origen: ARASAAC (https://arasaac.org). Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España). El crédito está visible en la página y en el pie común.

## App para Android (Puente Comunicador)

- TWA aparte, paquete `app.puentepictos.comunicador`, versionName 1.0.1, versionCode 2 (la 1.0.1 solo cambia el nombre bajo el ícono de «Comunicador» a «Puente Comunicador»). Abre `https://puentepictos.app/comunicador.html?app`, orientación libre.
- Firmada con la misma clave que `app.puentepictos.twa` (SHA-256 `E5:E5:B5:…:7C:00`); `.well-known/assetlinks.json` lista los dos paquetes con esa huella. Si se publica en Play con Play App Signing, sumar la huella de Google a ese paquete.
- Manifest propio: `comunicador.webmanifest` (id `/comunicador.html`, scope `/comunicador`), así instalar desde el navegador da «Puente Comunicador» (name y short_name) y no se pisa con la PWA de Puente.
- APK pública en `/descargar/comunicador.apk` (el SW no cachea `/descargar/`). Al sacar una versión nueva, reemplazar ese archivo y subir versionCode.
- El link «Bajar la app para Android» aparece solo en Android y fuera de la app (`?app`, referrer `android-app://` o display-mode standalone/fullscreen).

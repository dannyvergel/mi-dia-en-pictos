# Comunicador con pictogramas

Página pública **`/comunicador.html`** (`web/comunicador.html`): un tablero de comunicación aumentativa (CAA) para que el chico se comunique libremente tocando pictogramas. Es libre para cualquiera, no pide cuenta y no depende del resto de Puente.

## Qué hace

- **Grilla de pictos grandes y táctiles**, en 7 categorías: núcleo, sentimientos, necesidades, personas, lugares, acciones y juegos (68 pictos).
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
- **Pantalla completa** (Fullscreen API). Si el navegador no la permite, como en el iPhone, queda un «modo tablero» que oculta todo lo demás. En ese modo solo se ven la frase, las categorías y la grilla. Para salir hay que tocar «Salir» dos veces en 3 segundos, así el chico no sale sin querer.

## Privacidad: todo en el cliente

- La página **no hace ningún pedido a `/api`**, no usa IA y **no tiene analítica**: no carga `/_vercel/insights`, a diferencia del resto del sitio.
- El pie común (`pie.js`) va con `data-donaciones="no"` y sin `data-feedback`, así que tampoco pide `api/config` ni `api/auth`.
- Lo único que se guarda está en `localStorage` bajo la clave `puente-comunicador`: ajustes, favoritos y el idioma elegido. Se guarda solo si el usuario cambia algo, y se borra con el botón de la página. La página lo explica.
- Las únicas conexiones externas son las imágenes de `static.arasaac.org`, igual que en el resto de Puente.

Lo controla `test/comunicador.test.js` (sin `fetch(`, sin `/api/`, sin analítica, pie sin pedidos) en `comunicador.html`, `comunicador-tablero.js` y `comunicador-textos.js`.

## Sin conexión

- `sw.js` (CACHE **`pictos-v23`**) suma `comunicador.html`, `comunicador-tablero.js` y `comunicador-textos.js` al precache. Además carga el vocabulario con `importScripts('comunicador-tablero.js')`.
- Al abrir el comunicador, la página le manda al service worker `postMessage({ tipo: "comunicador" })` y el SW guarda **todos** los pictos del tablero. Si alguno falla, sigue con el resto y lo reintenta la próxima vez. Los pictos se bajan solo cuando alguien abre el comunicador: unas 70 imágenes chicas. Así no se le gastan datos a quien solo entra a la portada.
- Las imágenes de `static.arasaac.org` pasan a **caché primero** para todo el sitio, porque no cambian y así el tablero responde al instante. El resto sigue con red primero.
- Igual que antes, **nunca** se cachean `/api/` ni `/descargar/`.

> **Versiones del SW:** main pasó por `pictos-v22` (comunicador) y ahora está en `pictos-v23` (comunicador en inglés). El PR #23 (rama `equipos`) usa `pictos-v21`: si entra después, tiene que pasar a **`pictos-v24`** y actualizar las aserciones de `test/documentos.test.js` y `test/comunicador.test.js`.

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

**Verificación:** `node scripts/verificar-comunicador.js` (necesita red) pide `https://api.arasaac.org/api/pictograms/es/<id>` para cada picto y controla que tenga su clave `k`. El 05/11/2026 dio **68/68**. Con `--en` pide `https://api.arasaac.org/api/pictograms/en/<id>` y controla `ken`: el 06/11/2026 dio **68/68** (y el español sigue en 68/68). Además, los pictos se revisaron a ojo en una hoja de contactos. No corre en `npm test` porque los tests no usan la red.

Elecciones a tener en cuenta (clave de ARASAAC → lo que se muestra):

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

## Idiomas

La misma página anda en **español** (por defecto) y en **inglés**.

- **Selector visible «Español / English»** arriba del tablero (se oculta en pantalla completa / modo tablero, junto con el resto de los ajustes).
- **Qué idioma se usa:** `?lang=en` (o `?lang=es`) manda; si no, la elección guardada; si no, `navigator.language` (`en*` → inglés, cualquier otro → español). La lógica es `elegirIdioma()` en `comunicador-textos.js`, con tests.
- La elección se guarda en el mismo `localStorage` `puente-comunicador` (campo `idioma`) solo si se toca el selector. «Borrar ajustes y favoritos» también la borra y vuelve al idioma automático. Si la URL tiene `?lang=`, el selector la actualiza con `history.replaceState` para que recargar no lo cambie.
- `<html lang>` cambia (`es-AR` / `en`), igual que `document.title`. Con `?lang=en` el `canonical` pasa a `…/comunicador.html?lang=en`. La página y `sitemap.xml` declaran `hreflang` es / en / x-default.
- **Textos de la interfaz:** diccionario simple en `web/comunicador-textos.js` (sin librerías). El HTML trae el español escrito y marca cada texto con `data-i18n` (texto), `data-i18n-html` (texto con negrita o link, solo textos fijos del diccionario) o `data-i18n-aria` (aria-label). Los avisos dinámicos usan `tr("clave")`. Un test exige que el inglés tenga todas las claves del español y que toda clave usada en la página exista.
- **Vocabulario:** mismos pictos (mismo id) con `en` / `ken` / `dicen`. Inglés natural de chico y en primera persona cuando corresponde («I want», «I don't want», «all done», «it hurts», «wash my hands»).
- **Género:** en inglés casi no hay palabras con género, así que el ajuste «Habla como nene / nena» se oculta y no se aplica (queda guardado para cuando se vuelve al español).
- **Voz en inglés:** en-US si hay; si no, en-GB; si no, cualquier `en-*`. La lista de voces muestra solo las del idioma activo, y si no hay ninguna se muestra el aviso en ese idioma.
- **Crédito ARASAAC en inglés:** «Pictograms author: Sergio Palao. Source: ARASAAC (https://arasaac.org). License: CC BY-NC-SA. Owner: Government of Aragón (Spain).»
- El pie común (`pie.js`) sigue en español; en inglés se le pone `lang="es-AR"` para que los lectores de pantalla lo lean bien.

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

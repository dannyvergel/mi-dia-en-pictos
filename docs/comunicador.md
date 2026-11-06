# Comunicador con pictogramas

Página pública **`/comunicador.html`** (`web/comunicador.html`): un tablero de comunicación aumentativa (CAA) para que el chico se comunique libremente tocando pictogramas. Es libre para cualquiera, no pide cuenta y no depende del resto de Puente.

## Qué hace

- **Grilla de pictos grandes y táctiles**, en 7 categorías: núcleo, sentimientos, necesidades, personas, lugares, acciones y juegos (68 pictos).
- **Barra de frase arriba:** cada picto que se toca se suma a la frase. Botones **Hablar** (o tocar la frase), **Borrar** (el último) y **Todo** (borra la frase). Máximo 24 pictos; si se pasa, sale el más viejo.
- **Voz:** `speechSynthesis` del propio equipo. Elige es-AR si existe; si no, otra voz latinoamericana, después es-ES y después cualquier voz en español. Si el equipo no tiene voz en español o el navegador no puede hablar, la frase igual se ve escrita y la página lo avisa.
- **Ajustes** (desplegable):
  - «Decir cada dibujo al tocarlo» (prendido de entrada).
  - «Armar la frase con los dibujos que toca» (prendido). Si se apaga, cada toque solo dice la palabra y no se junta arriba.
  - Tamaño de los dibujos: grandes, medianos o chicos. Ninguno baja de 72 px.
  - «Habla como nene / nena»: cambia las palabras con género (contento/contenta, cansado/cansada…).
  - Voz (solo voces en español) y «Hablar más despacio».
  - «Borrar ajustes y favoritos de este dispositivo».
- **Favoritos:** el botón «Elegir favoritos» activa un modo en el que tocar un picto lo agrega o lo saca. Con favoritos aparece la pestaña ★ Favoritos.
- **Pantalla completa** (Fullscreen API). Si el navegador no la permite, como en el iPhone, queda un «modo tablero» que oculta todo lo demás. En ese modo solo se ven la frase, las categorías y la grilla. Para salir hay que tocar «Salir» dos veces en 3 segundos, así el chico no sale sin querer.

## Privacidad: todo en el cliente

- La página **no hace ningún pedido a `/api`**, no usa IA y **no tiene analítica**: no carga `/_vercel/insights`, a diferencia del resto del sitio.
- El pie común (`pie.js`) va con `data-donaciones="no"` y sin `data-feedback`, así que tampoco pide `api/config` ni `api/auth`.
- Lo único que se guarda está en `localStorage` bajo la clave `puente-comunicador`: ajustes y favoritos. Se guarda solo si el usuario cambia algo, y se borra con el botón de la página. La página lo explica.
- Las únicas conexiones externas son las imágenes de `static.arasaac.org`, igual que en el resto de Puente.

Lo controla `test/comunicador.test.js` (sin `fetch(`, sin `/api/`, sin analítica, pie sin pedidos).

## Sin conexión

- `sw.js` (CACHE **`pictos-v22`**) suma `comunicador.html` y `comunicador-tablero.js` al precache. Además carga el vocabulario con `importScripts('comunicador-tablero.js')`.
- Al abrir el comunicador, la página le manda al service worker `postMessage({ tipo: "comunicador" })` y el SW guarda **todos** los pictos del tablero. Si alguno falla, sigue con el resto y lo reintenta la próxima vez. Los pictos se bajan solo cuando alguien abre el comunicador: unas 70 imágenes chicas. Así no se le gastan datos a quien solo entra a la portada.
- Las imágenes de `static.arasaac.org` pasan a **caché primero** para todo el sitio, porque no cambian y así el tablero responde al instante. El resto sigue con red primero.
- Igual que antes, **nunca** se cachean `/api/` ni `/descargar/`.

> **Versiones del SW:** main estaba en `pictos-v19` y el PR #23 (rama `equipos`) usa `pictos-v21`. Este PR sube a `pictos-v22`. Si #23 entra después, hay que reconciliar: dejar una sola versión mayor que las dos (por ejemplo `pictos-v23`) y actualizar las aserciones de `test/documentos.test.js` y `test/comunicador.test.js`.

## Vocabulario

El vocabulario está en `web/comunicador-tablero.js`, que comparten la página y el SW. Cada picto tiene:

| campo | qué es |
|---|---|
| `id` | id del pictograma de ARASAAC |
| `t` | lo que se ve y se dice |
| `k` | palabra clave que ese id tiene que tener en ARASAAC |
| `f` | forma femenina (opcional) |
| `dice` | lo que dice la voz si es distinto de `t`; por ejemplo, «lavarse las manos» se dice «lavarme las manos» |

**Verificación:** `node scripts/verificar-comunicador.js` (necesita red) pide `https://api.arasaac.org/api/pictograms/es/<id>` para cada picto y controla que tenga su clave `k`. El 05/11/2026 dio **68/68**. Además, los pictos se revisaron a ojo en una hoja de contactos. No corre en `npm test` porque los tests no usan la red.

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
2. Corré el verificador.
3. Corré `npm test`, que exige entre 60 y 80 pictos y sin ids repetidos.
4. Subí la versión del CACHE en `sw.js`.

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

- TWA aparte, paquete `app.puentepictos.comunicador`, versionName 1.0.0, versionCode 1. Abre `https://puentepictos.app/comunicador.html?app`, orientación libre.
- Firmada con la misma clave que `app.puentepictos.twa` (SHA-256 `E5:E5:B5:…:7C:00`); `.well-known/assetlinks.json` lista los dos paquetes con esa huella. Si se publica en Play con Play App Signing, sumar la huella de Google a ese paquete.
- Manifest propio: `comunicador.webmanifest` (id `/comunicador.html`, scope `/comunicador`), así instalar desde el navegador da «Comunicador» y no se pisa con la PWA de Puente.
- APK pública en `/descargar/comunicador.apk` (el SW no cachea `/descargar/`). Al sacar una versión nueva, reemplazar ese archivo y subir versionCode.
- El link «Bajar la app para Android» aparece solo en Android y fuera de la app (`?app`, referrer `android-app://` o display-mode standalone/fullscreen).

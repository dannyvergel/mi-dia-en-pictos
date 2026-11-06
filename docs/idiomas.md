# Sitio público en español y en inglés

## Esquema

Cada página pública tiene **dos URLs indexables**, servidas ya traducidas (sin depender de JavaScript):

| Página | Español | Inglés |
|---|---|---|
| Portada | `/` | `/en/` |
| Comunicador | `/comunicador.html` | `/en/comunicador.html` |
| Presentación | `/presentacion.html` | `/en/presentacion.html` |
| Privacidad (borrador) | `/privacidad.html` | `/en/privacidad.html` |
| Términos (borrador) | `/terminos.html` | `/en/terminos.html` |

`404.html` es una sola (Vercel usa una para todo el sitio) y tiene los dos idiomas.

**Por qué así:** una sola fuente y archivos estáticos. El español sigue siendo la página que se edita; el inglés se **genera** con
`npm run idiomas` (`scripts/idiomas.js`) y se commitea. No suma build en Vercel ni functions (el plan Hobby ya está en 11/12).
Una copia a mano de cada página se desactualiza sin que nadie se entere; un cambio solo por JavaScript no lo indexa bien Google.

## Fuente

- `web/*.html` (español): el cuerpo de cada página.
- `scripts/idiomas/paginas.js`: título, description, prioridad del sitemap y JSON-LD de cada página, en los dos idiomas.
- `scripts/idiomas/en.js`: traducciones como pares «español exacto → inglés». El Comunicador toma sus textos de `comunicador-textos.js`
  y la lista de preguntas de la portada en inglés sale del FAQ en inglés de `pizarron.js`.

`scripts/idiomas.js` escribe el bloque SEO del `<head>` en las dos versiones (title, description, canonical, hreflang es-AR / en /
x-default, Open Graph, Twitter card, JSON-LD), el selector «Español / English», `web/en/*.html` y `sitemap.xml`.

**Al cambiar un texto en español:** correr `npm run idiomas`. Si una frase de `en.js` ya no está, o si en inglés queda un texto
visible igual al español, falla y dice cuál. `test/idiomas.test.js` corre lo mismo con `--check`.

## Selector y elección

- Selector visible arriba a la derecha (links reales, con `hreflang`). Al tocarlo, `pie.js` guarda la elección en `localStorage` `puente-idioma`.
- **Sin redirecciones automáticas.** Si la página está en un idioma y la elección guardada (o, si no hay, el idioma del navegador) es el otro,
  `pie.js` muestra un aviso chico para ir a la otra versión (`data-nosnippet`). Se cierra con «No, gracias / No, thanks».

## Imagen para compartir

`og.png` (español) y `og-en.png` (inglés), 1200×630. `og-en.png` se rehace con `scripts/og/generar.sh` (Chrome headless).

## Afuera (trabajo futuro)

- Pantallas con sesión: `login.html`, `docente.html`, `familia.html`, `admin.html`, `cuaderno.html` (además tiene noindex) y la demo.
- Mails (Resend), respuestas y errores de la API (siguen en español; la portada en inglés muestra sus propios errores).
- `firma/` y las páginas que no están en el sitemap.
- Las páginas legales en inglés son **traducción de cortesía** de un borrador: prevalece el español y hay que revisarlas junto con el original.

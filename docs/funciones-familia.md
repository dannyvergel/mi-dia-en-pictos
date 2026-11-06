# Qué ve la familia: funciones apagadas

Decisión del 2026-11-05: la familia ve **solo lo mínimo**, es decir, lo que sube la seño convertido en pictogramas.

## Encendido siempre
- La tira de pictos de cada día, con la palabra, la hora, el estado y el ánimo. La voz lee la palabra del picto.
- La agenda del próximo día, en pictos.
- «La ficha de…»: contactos, teléfono propio y consentimiento (dar o retirar).
- Descargar mis datos y pedir la baja. La exportación siempre trae todo lo guardado, porque es el derecho de acceso.

## Apagado (se prende a demanda)
Se usa la variable de entorno `FAMILIA_FUNCIONES` en Vercel, con una lista separada por comas:

| Valor | Qué prende |
|---|---|
| `texto` | Resumen escrito del día, logros, alertas, mensaje de la escuela y el texto completo de cada actividad (lo que lee la voz) |
| `objetivos` | Tarjeta «En qué estamos trabajando» (objetivos del PPI con su estado) |
| `chat` | «Preguntale a Puente» (chat con IA sobre lo registrado) |
| `ficha` | Apoyos y objetivos del PPI dentro de «La ficha de…» |
| `todas` | Todo lo anterior |

Ejemplo: `FAMILIA_FUNCIONES=objetivos,ficha`. Si la variable está vacía o no existe, rige el mínimo. Después de cambiarla hay que hacer un redeploy.

Sin base de datos (el demo) se ven todas.

## Cómo está hecho
- `web/api/_lib/funciones.js`: `funcionesFamilia()` lee la variable, y `minimoParaPublicar()` recorta lo que se publica.
- **Lo apagado no sale del servidor**. `api/familia.js` (vistaFamilia) y `api/fichas.js` (GET de la familia) lo filtran, y `familia.html` solo dibuja lo que llega (`D.funciones`).
- **Si `texto` y `chat` están apagados, el texto de la seño ni siquiera se guarda en el Blob de la familia.** Solo se guardan la fecha, el ánimo y, de cada actividad, la hora, la palabra clave, el estado y el picto. Por eso, si algún día se prende `texto` o `chat`, solo se ven completos los días publicados *después* de prenderlo.
- Con `chat` apagado, `accion=preguntar` responde 403.
- Tests: `web/test/familia-minimo.test.js`. Los tests anteriores corren con `FAMILIA_FUNCIONES=todas` (lo fija `test/ayuda.js`).

## Antes de prender algo
- `texto` y `chat` vuelven a exponer a la familia lo que escribe la seño, y en el caso del chat también pasa por la IA. Revisar con el aval de la escuela y el consentimiento.
- Si se prende `chat`, la política de privacidad ya lo describe (OpenRouter, 30 días de historial).

## Informes y documentos: no dependen de esta variable
Los informes y documentos que suben las seños y terapeutas **no** se prenden ni se apagan con `FAMILIA_FUNCIONES`. Rigen aunque la variable esté en el mínimo: la seño decide **documento por documento** con la casilla «Mostrar a la familia», y la familia ve solo esos. Ver `docs/documentos.md`.

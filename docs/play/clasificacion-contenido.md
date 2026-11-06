# Clasificación del contenido (IARC) y Público objetivo · Puente

## 1. Cuestionario de clasificación (IARC)

Play Console → Contenido de la app → Clasificación del contenido → Iniciar cuestionario.

- Email de contacto: soporte@puentepictos.app
- **Categoría:** «Referencia, noticias o educación» (en inglés «Reference, News, or Educational»). No es un juego ni una red social: es una herramienta escuela–familia.

Respuestas (las preguntas cambian un poco según la categoría; estas son las que aparecen para apps que no son juegos):

| Pregunta | Respuesta | Por qué |
|---|---|---|
| Violencia (cualquier tipo) | No | Pictogramas educativos de ARASAAC. |
| Miedo / horror | No | |
| Contenido sexual o desnudos | No | |
| Lenguaje soez u ofensivo | No | |
| Drogas, alcohol, tabaco (referencias o uso) | No | |
| Apuestas o juegos de azar (reales o simulados) | No | |
| Humor crudo | No | |
| **¿Los usuarios pueden interactuar o intercambiar contenido entre sí?** | **Sí** | La docente publica el día y documentos para la familia, y los dos lados se ven. Es contenido entre usuarios, aunque esté cerrado a la escuela y la familia. |
| ¿Se puede compartir la ubicación del usuario con otros? | No | |
| ¿Permite comprar bienes digitales? | No | |
| ¿Es un navegador web sin restricciones o un buscador? | No | Muestra solo puentepictos.app. Los links externos (ARASAAC, la demo) abren en una pestaña de Chrome. |
| ¿La app tiene contenido generado por IA? (si aparece) | Sí | La IA ordena el relato del día y responde el chat de la familia, siempre sobre lo que cargó la docente; no genera imágenes. Si la pregunta no aparece en tu versión del cuestionario, no hace falta mencionarlo. |
| ¿La app es principalmente para mostrar noticias? | No | |

**Resultado esperado:** PEGI 3 / ESRB «Everyone» / Argentina «ATP» (apto para todo público), con el elemento interactivo **«Los usuarios interactúan»**. Si te sale algo más alto, revisá la pregunta de interacción.

## 2. Público objetivo y contenido

Play Console → Contenido de la app → Público objetivo y contenido.

### Recomendación: declarar **solo «18 años o más»**

| Pantalla | Qué marcar |
|---|---|
| Grupos de edad objetivo | **18 y más**. No marcar ningún grupo de menos de 13 (ni 13–15 ni 16–17). |
| ¿La ficha de Play puede atraer sin querer a niños? | **No**, con esta explicación: «Puente es una herramienta para docentes de educación especial y para familias (adultos). Las cuentas las crea la escuela y se entra con un código por email. Los pictogramas son material de trabajo de la docente, no contenido para que lo use un chico solo.» |

**Por qué es honesto:** las cuentas son todas de adultos (docentes, directivos, familias), las crea la escuela y se entra con email. Nadie menor de edad abre ni maneja Puente: el chico **mira** el día en pictogramas junto a un adulto, en el teléfono del adulto. Eso es «una app para adultos que trabajan con chicos», como un cuaderno de comunicaciones digital, y no «una app dirigida a chicos».

### Implicancias, sin vueltas

1. **No entra en la Política de Familias.** No aparece en la sección Niños de Play ni puede tener la insignia «Aprobada por docentes». A cambio, no tenés que cumplir sus requisitos extra (SDKs certificados para familias, sin identificadores, pantalla neutral de edad, revisión más estricta).
2. **No podés promocionarla como app para chicos.** Ni en la ficha ni en anuncios ni en las capturas: nada de «para que tu hijo juegue» o «app infantil». La ficha que está en `ficha.md` habla de docentes y familias. Mantenela así.
3. **Google puede no estar de acuerdo.** Por los pictogramas coloridos, el revisor puede pensar que la ficha «atrae a niños». Si pasa, te pide más información o que cambies la ficha o el público. La respuesta de arriba y la ficha centrada en adultos son la defensa. Si insisten, la salida es sumar el grupo de menos de 13 y cumplir la Política de Familias (ver abajo), no esconder nada.
4. **Los datos de menores se siguen tratando como sensibles**, se declare lo que se declare: consentimiento expreso de la familia, mínimos datos (nombre de pila), sin IA sobre datos de salud, borrado a pedido. Eso ya está en el código y en la política.
5. **El comunicador dentro de Puente:** la app Puente incluye `comunicador.html` (la familia lo abre desde su espacio). Un chico sí lo puede tocar, pero en el teléfono de la familia, que es quien entró. Sigue siendo coherente con «18+», siempre que la ficha no lo venda como «app para chicos».

### Qué cambia si algún día se declara «menos de 13» (para el Comunicador aparte)

La Política de Familias pide, entre otras cosas:
- Cumplir COPPA y las leyes locales de datos de menores; política de privacidad que hable de los chicos.
- Sin anuncios, o solo con SDKs de anuncios certificados para familias. Sin publicidad engañosa.
- No mandar identificadores (AD_ID, Android ID, IMEI) ni ubicación precisa de chicos.
- Solo SDKs autorizados para apps de familias. Hoy el comunicador no usa ninguno ni tiene analítica, y eso es bueno.
- Contenido apto y sin links que saquen a los chicos de la app hacia compras o redes. Ojo: dentro de la TWA del Comunicador hoy se puede navegar a la home (que tiene Vercel Analytics y el botón «Entrar»). Para Familias convendría cerrar el comunicador en su propia pantalla o sacar la analítica de las páginas a las que se llega desde ahí.
- Declarar la Política de Familias en Data safety («Comprometido con la Política de Familias de Play»).

Eso cuadra con el Comunicador (no recolecta nada y funciona sin cuenta), no con Puente. Más detalle en `una-o-dos-apps.md`.

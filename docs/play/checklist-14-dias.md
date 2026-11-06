# Checklist de los 14 días de prueba cerrada

Objetivo: que al pedir producción puedas decir con verdad que **12 o más testers usaron todas las funciones, como usuarios reales, y dieron feedback que generó cambios**. Eso es lo que pregunta Google.

Canal: un grupo de WhatsApp «Testers Puente» + «Enviar comentario» en la app + el feedback de Play. Anotá todo en una planilla (fecha, quién, qué dijo, qué cambiaste): con eso escribís la solicitud de producción.

## Día 0 · Antes de mandar el link (importante)

- [ ] **Cuentas para los testers.** La app abre en el login y se entra con código por mail. Sin cuenta, el tester no puede hacer nada adentro de la app. Creá en Puente una **«Escuela de prueba»** con 3 o 4 alumnos ficticios (nombres inventados) e invitá a cada tester por email: la mitad como **docente** y la otra mitad como **familia** de un alumno ficticio.
- [ ] **Cupo del piloto.** Hoy hay un tope de 15 cuentas activas (`PILOTO_MAX_USUARIOS`, 15 por defecto). Con 15 o 16 testers más las cuentas del piloto real no entra: subilo en Vercel (Settings → Environment Variables) a, por ejemplo, 40, mientras dure la prueba.
- [ ] Prueba cerrada aprobada, link de opt-in a mano y el grupo de WhatsApp creado.
- [ ] Planilla de seguimiento: tester · rol · fecha de opt-in · instaló (sí/no) · consignas hechas.

## Las consignas, día por día

| Día | Para docentes | Para familias | Qué mirás vos |
|---|---|---|---|
| **1** | Opt-in, instalar, entrar con el código del mail. | Igual. | Que los 12+ figuren en la consola. ¿Llegó el mail? ¿Cayó en spam? |
| **2** | Dictá (botón «Dictar») o escribí el día de un alumno ficticio y tocá «Armar el día». | Abrí el día que cargó tu docente de prueba. Tocá cada pictograma y escuchalo. | ¿El dictado anda en su teléfono? ¿La voz es es-AR? |
| **3** | Marcá un logro y una alerta. Publicá. | Contanos: ¿se entiende el resumen? ¿Qué cambiarías? | Primera ronda de feedback en la planilla. |
| **4** | Completá la ficha de apoyos de un alumno (comunicación, qué lo calma). | Hacele 2 preguntas a «Preguntale a Puente» sobre el día. | Calidad de las respuestas del chat. |
| **5** | Probá el comunicador: armá «yo quiero comer» y tocá «Hablar». | Igual, desde el link «Comunicador» de tu espacio. | ¿Funciona sin conexión? (pediles probarlo en modo avión) |
| **6** | Libre: usala como la usarías en la escuela. | Libre. | Mandá un recordatorio amable: «¡Vamos por la mitad! No la desinstalen 🙏». |
| **7** | **Encuesta corta** (3 preguntas: ¿qué te sirvió?, ¿qué te frustró?, ¿la recomendarías?). | Igual. | Contá testers activos. Si alguien se salió, sumá un reemplazo **ya**: sus 14 días arrancan de cero. |
| **8** | Subí un informe (PDF o foto de prueba) a un alumno y compartilo con la familia. | Abrí el documento compartido. | Que la familia ve solo lo compartido. |
| **9** | — | Probá «Descargar mis datos». | Que el archivo baje bien en Android. |
| **10** | **Actualización:** subí a la prueba cerrada una versión nueva (versionCode 4) con 1 o 2 cosas que pidieron. Avisá en el grupo qué cambió. | Actualizá desde Play y contanos si notás el cambio. | Google valora que la prueba haya generado cambios. |
| **11** | Armá el día de 2 alumnos distintos. | Mirá el historial de días. | Rendimiento, errores, cortes. |
| **12** | Mandá un comentario desde «Enviar comentario». | Igual. | Que lleguen los comentarios. |
| **13** | Libre. Recordatorio: «mañana es el último día, **no la desinstalen todavía**». | Libre. | Verificá en la consola: 12+ testers con 14 días. |
| **14** | **Encuesta final** + «¿te gustaría seguir usándola?». Pedí una reseña privada en Play (feedback de prueba). | Igual. | Cerrá la planilla y redactá la solicitud de producción (`guia-danny.md` §7). |

## Después del día 14

- **No les pidas que desinstalen.** Si la solicitud se demora o Google pide más prueba, el opt-in tiene que seguir activo.
- Pedí producción desde el Panel con la planilla al lado.
- Agradecé en el grupo y contales cuándo sale la versión pública.
- Si la prueba usó la «Escuela de prueba», borrala (o dala de baja) y volvé `PILOTO_MAX_USUARIOS` a su valor.

## Señales de alerta

- Menos de 12 testers activos cualquier día → sumá reemplazos el mismo día.
- Nadie usó el chat, los documentos o el comunicador → mandá esa consigna otra vez: Google pregunta si se usaron **todas** las funciones.
- Feedback cero → preguntá algo concreto («¿qué pictograma te pareció raro?») en vez de «¿qué te pareció?».

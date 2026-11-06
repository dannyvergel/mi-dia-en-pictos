# Observabilidad: qué se ve hoy y qué no

Cuando algo falla en Puente, ¿cómo nos enteramos y dónde miramos? Este documento dice lo que hay, lo que falta y dónde se va a trabar primero si el piloto crece.

## Lo que hay hoy

| Qué | Dónde se ve | Cuánto dura | Para qué sirve |
|---|---|---|---|
| Chequeo de salud cada 15 minutos | GitHub → **Actions** → **salud**; mail si falla | El historial de Actions | Saber si el sitio y la base responden. Medir el [SLO](slo.md) |
| Tests en cada PR y en `main` | GitHub → **Actions** → **tests**; el check del PR | El historial de Actions | No mergear algo roto |
| Logs de las funciones | Vercel → proyecto → **Logs** | **1 hora** en el plan Hobby | Ver errores 500 y las líneas `[puente] ...` al momento |
| Registro de accesos (auditoría) | `admin.html` → **Registro** (tabla `auditoria`) | 365 días (`AUDITORIA_RETENCION_DIAS`) | Ingresos, intentos fallidos, altas, bajas, cambios de permisos. Sin datos personales en claro (el email va con hash) |
| Alerta de intentos fallidos | Mail a la plataforma (`ADMIN_EMAIL`) | | Cuando una cuenta llega a 5 ingresos fallidos en la ventana (`AUDITORIA_ALERTA_FALLOS`); máximo uno por hora por cuenta |
| Comentarios de docentes y familias | `admin.html` → **Registro** → comentarios recibidos | 365 días (`FEEDBACK_RETENCION_DIAS`) | Lo que la gente cuenta que no anda |
| Monitoreo de la base | Neon → **Monitoring** | **1 día** en el plan Free | CPU, memoria, conexiones, tamaño de la base |
| Uso de la IA | openrouter.ai → **Activity** | | Pedidos, errores y gasto por key |
| Mails enviados | resend.com → **Emails** | 30 días | Si un código o una invitación salió, rebotó o no se mandó |
| Visitas | Vercel → **Analytics** | | Páginas vistas (no ve errores) |

Líneas de log que vale la pena buscar en Vercel:

- `[puente] salud: base error` o `lenta`: el chequeo de salud no pudo hablar con la base.
- `[puente] limpieza de retención`: la limpieza diaria de las 4:30 corrió.
- `[puente] chat negativa motivo=...`: el chat de familias rechazó una pregunta.
- `[puente] alerta de fallos:`: falló el aviso de ingresos fallidos.
- Cualquier `Error` sin prefijo: un 500 que vio alguien («Algo falló, probá de nuevo en un rato»).

## Lo que no hay

- **Historial de logs.** Una hora en Hobby. Si una seño avisa a la tarde que algo falló a la mañana, el log ya no está. Lo único que queda es la auditoría y lo que la persona cuente.
- **Alerta por errores.** Si una función da 500 a una persona pero el chequeo de salud anda, nadie se entera hasta que alguien avisa. No hay Sentry ni nada parecido.
- **Alerta si la IA deja de andar.** Si OpenRouter falla o se queda sin crédito, Puente sigue en modo sin IA a propósito (para que nunca se caiga). Por eso mismo, no se nota: hay que mirar **Activity** en OpenRouter.
- **Alerta si los mails no salen.** Si Resend rechaza o llega al límite del día, la persona no recibe el código y no entra. No avisa a nadie.
- **Métricas de tiempos de respuesta.** No sabemos si una pantalla tarda 300 ms o 5 segundos, salvo lo que muestre Vercel al momento.
- **Respaldo y control de Blob.** No hay forma de ver si un día publicado se pisó o se borró (ver [backup-restauracion.md](backup-restauracion.md)).
- **Un tablero de consumo de los planes gratis.** El consumo se mira a mano en cada panel (Vercel **Usage**, Neon **Usage**, Resend, OpenRouter).

## El primer cuello de botella al escalar

Con 15 personas en el piloto no hay problema. Si se suman escuelas, esto es lo que se traba, en el orden en que probablemente pase:

1. **Mails de Resend (plan Free: 100 por día, 3.000 por mes).** Cada ingreso de una docente o una familia es un mail con código, y cada invitación es otro. Una importación masiva de una escuela con 60 familias se come más de la mitad del día. Es lo primero que se traba, y cuando se traba nadie puede entrar. Antes de sumar escuelas: pasar a Resend Pro (o pedir el descuento para ONG, que Resend ofrece a organizaciones registradas) o alargar la duración de las sesiones.
2. **Vercel Hobby: 11 de 12 funciones.** Cada archivo de `web/api/` es una función y queda una sola. Toda función nueva tiene que entrar como una acción dentro de una existente, como se hizo con el chequeo de salud (`/api/config?accion=salud`). Además, Hobby es solo para uso no comercial y guarda una hora de logs. Si el proyecto crece o se formaliza (por ejemplo, como asociación civil), corresponde pasar a Pro.
3. **Neon Free: 100 CU-hora por mes, 1 GB de datos, 6 horas de historial.** Si se terminan las horas, Neon suspende la base hasta el mes siguiente: Puente queda sin cuentas. El chequeo de salud cada 15 minutos ya consume una parte (ver [slo.md](slo.md)). Además, después de 5 minutos sin uso la base se duerme y el primer pedido tarda un poco más.
4. **OpenRouter.** Se paga por uso, con el crédito que haya cargado. Si se acaba, la IA se apaga sin aviso (Puente sigue sin IA). Solo usamos proveedores con retención cero (ZDR): si ninguno está disponible para el modelo elegido, también cae a modo sin IA. Con más escuelas, el gasto crece con cada día cargado y cada pregunta del chat.

## Lo que conviene sumar primero

Ninguna está hecha. En orden de valor por esfuerzo:

1. Revisar una vez por semana el consumo de Resend, Neon y OpenRouter (cinco minutos, a mano).
2. Que el chequeo de salud avise también si la IA o el mail están caídos, sin gastar crédito ni mandar mails de prueba (por ejemplo, contando errores recientes en una tabla).
3. Guardar en la tabla `auditoria` un evento cuando una función da 500, sin datos personales, para tener más de una hora de historia.

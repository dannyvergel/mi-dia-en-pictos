# Checklist: de la hackatón al piloto con datos reales

Puente maneja datos de menores con discapacidad o necesidades de apoyo. En Argentina eso son **datos sensibles** (Ley 25.326 de Protección de Datos Personales): solo se pueden tratar con consentimiento expreso y por escrito, para una finalidad concreta y con medidas de seguridad. Nada de esto reemplaza el consejo de un abogado; es la lista para no olvidarnos de nada.

Estado: ☐ pendiente · ☑ hecho

## 1. Para la hackatón (datos ficticios)
- ☐ Mergear PR #1 (login, fichas, solicitudes de acceso, chat blindado: commit 786cdae) a `main`.
- ☐ Prueba de punta a punta en producción: setup del admin (plataforma) → solicitud de una directora → aprobación → solicitud de una seño de esa escuela (le llega a la directora) → aprobación → ficha con email de familia (le llega la invitación) → asignar docente → publicación → familia entra por código y da consentimiento → chat.
- ☐ Cargar solo alumnos y familias ficticios. Nada real en producción hasta cerrar la sección 3.
- ☐ Probar la importación masiva en producción con una planilla ficticia (XLSX y CSV): vista previa con errores → corregir → confirmar → reimportar (no duplica) → llegan bienvenidas e invitaciones.
- ☐ Firewall: pasar Bot Protection y AI Bots de *log* a *challenge/deny* después de revisar lo registrado.
- ☐ Rotar el token de Vercel (se compartió por chat).
- ☐ Aviso BETA visible y créditos ARASAAC (CC BY-NC-SA) en todas las páginas.

## 2. Infraestructura antes de datos reales
- ☐ Base separada para Preview (rama de Neon o base aparte). Hoy Preview y Producción usan el mismo `DATABASE_URL`.
- ☐ Dominio propio (ej. puentepictos.org) verificado en Resend; `RESEND_FROM` con ese dominio y `PUENTE_URL` apuntando a él.
- ☐ `DOCENTE_PIN` fuerte y distinto del de demo; `SESSION_SECRET` largo y aleatorio.
- ☐ Backups de Neon activados (point-in-time restore) y una prueba de restauración.
- ☐ Revisar región de Neon, Vercel y Blob y documentarla (los datos se alojan fuera de Argentina: hay que decirlo en el consentimiento).
- ☐ Resolver `npm audit` (4 vulnerabilidades altas heredadas).
- ☑ Separar las solicitudes de acceso por escuela: van a las admins de la escuela (por CUE) o a la plataforma (escuela nueva o directora).

## 3. IA y terceros
- ☐ OpenRouter: limitar a proveedores que **no entrenan con los datos y no los retienen** (configuración de privacidad de datos en OpenRouter) o usar un proveedor con acuerdo de no retención.
- ☐ Mandar a la IA solo nombre de pila y lo mínimo necesario; nunca contactos ni datos de salud.
- ☐ Revisar que los modelos permitidos en `_lib/modelos.js` cumplan lo anterior.
- ☐ Listar todos los terceros que tocan datos (Vercel, Neon, Resend, OpenRouter y sus proveedores, ARASAAC solo pictos) para el consentimiento.

## 4. Legal y escuela
- ☐ Aval por escrito de la dirección de la escuela (y, si corresponde, del Ministerio de Educación de Santa Fe o la supervisión).
- ☐ Consentimiento informado firmado por cada familia/tutor: qué datos, para qué, quién los ve, dónde se guardan, uso de IA, cuánto tiempo, cómo pedir acceso, corrección o borrado.
- ☐ Política de privacidad y términos de uso publicados en la app.
- ☐ Evaluar inscripción de la base en el Registro Nacional de Bases de Datos (AAIP).
- ☐ Definir responsable del tratamiento (¿la escuela? ¿Puente?) y un contacto para reclamos.
- ☐ Acuerdo de confidencialidad para docentes que usan la plataforma.
- ☐ Revisar el texto de la invitación a familias (qué se comparte, consentimiento) con la escuela antes de mandar invitaciones reales.
- ☐ Antes de importar una planilla real: que la escuela confirme que tiene el consentimiento de esas familias para cargar sus emails y teléfonos, y que la planilla tiene solo nombre de pila (sin apellidos, diagnósticos ni datos de salud). Borrar la planilla de la compu después de importar.

## 5. Operación del piloto
- ☐ Una sola escuela piloto, pocos alumnos, plazo definido.
- ☑ Importación masiva de docentes y alumnos con familias (CSV/XLSX, vista previa, todo o nada, idempotente, mails solo al confirmar).
- ☐ Verificar el límite de envíos de Resend del plan contratado antes de importar muchas familias juntas (hoy: tandas de 20 con pausa).
- ☐ Procedimiento para dar de baja a una familia o alumno y borrar sus datos (incluye días en Blob e historial de chat).
- ☐ Plazo de retención: días publicados, historial de chat (30 días) y fichas.
- ☐ Registro de accesos de docentes y alertas de intentos fallidos.
- ☐ Canal de feedback para docentes y familias.
- ☐ Plan ante incidentes: a quién avisar y cómo, si hay una filtración.

## 6. Después del piloto
- ☐ SSO para docentes (la capa `api/_lib/identidad.js` ya está lista).
- ☐ Pasar los días de Blob a Postgres.
- ☑ Invitaciones por mail a las familias (1 cada 24 h, reenviar desde la ficha).
- ☑ Multi-escuela: plataforma → admin de escuela → docentes con alumnos asignados; la plataforma puede desactivar escuelas.
- ☐ Reasignar docentes entre escuelas desde la plataforma.

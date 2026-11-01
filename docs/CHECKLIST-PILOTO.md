# Checklist: de la hackatón al piloto con datos reales

Puente maneja datos de menores con discapacidad o necesidades de apoyo. En Argentina eso son **datos sensibles** (Ley 25.326 de Protección de Datos Personales): solo se pueden tratar con consentimiento expreso y por escrito, para una finalidad concreta y con medidas de seguridad. Nada de esto reemplaza el consejo de un abogado; es la lista para no olvidarnos de nada.

Estado: ☐ pendiente · ☑ hecho

Última actualización: 1/11/2026 (rama `feat/piloto`). Lo marcado ☑ en código está en esa rama hasta que se mergee.

## 1. Para la hackatón (datos ficticios)
- ☑ Mergear PR #1 (login, fichas, solicitudes de acceso, chat blindado: commit 786cdae) a `main`. Mergeado el 1/11/2026.
- ☑ Prueba de punta a punta (hecha el 1/11/2026 en **Preview** con datos ficticios; Preview usa su propia rama de Neon): setup del admin (plataforma) → solicitud de una directora → aprobación → solicitud de una seño de esa escuela (le llega a la directora) → aprobación → ficha con email de familia (le llega la invitación) → asignar docente → publicación → familia entra por código y da consentimiento → chat.
- ☐ Cargar solo alumnos y familias ficticios. Nada real en producción hasta cerrar la sección 3.
- ☐ Probar la importación masiva en producción con una planilla ficticia (XLSX y CSV): vista previa con errores → corregir → confirmar → reimportar (no duplica) → llegan bienvenidas e invitaciones.
- ☐ Firewall: pasar Bot Protection y AI Bots de *log* a *challenge/deny* después de revisar lo registrado.
- ☐ Rotar el token de Vercel (se compartió por chat).
- ☑ Aviso BETA visible y créditos ARASAAC (CC BY-NC-SA) en todas las páginas (pie común `web/pie.js`).

## 2. Infraestructura antes de datos reales
- ☑ Base separada para Preview: Preview usa su propia rama de Neon (branching).
- ☐ Dominio propio (ej. puentepictos.org) verificado en Resend; `RESEND_FROM` con ese dominio y `PUENTE_URL` apuntando a él. Danny lo compra el 1/11/2026. Pasos (README → *Dominio propio*):
  - ☐ Vercel → proyecto `mi-dia-en-pictos` → Settings → Domains → agregar el dominio raíz y `www` (uno redirige al otro); cargar en el DNS los registros que indica Vercel (`A` raíz / `CNAME` www, o nameservers de Vercel); esperar *Valid Configuration* (HTTPS automático).
  - ☐ Resend → Domains → Add Domain → cargar en el DNS `MX` + `TXT` SPF del subdominio de envío, `TXT` DKIM (`resend._domainkey`) y, recomendado, DMARC (`_dmarc`); *Verify* hasta *Verified*.
  - ☐ Recién verificado: `PUENTE_URL=https://<dominio>` y `RESEND_FROM=Puente <hola@<dominio>>` en Vercel (Producción; Preview puede quedar con la URL de la rama) → redeploy → mandarse un código de prueba.
  - ☐ Actualizar las etiquetas Open Graph de `index.html`/`presentacion.html` y el texto/QR de la última diapositiva.
- ☐ `DOCENTE_PIN` fuerte y distinto del de demo; `SESSION_SECRET` largo y aleatorio.
- ☐ Backups de Neon activados (point-in-time restore) y una prueba de restauración.
- ☐ Revisar región de Neon, Vercel y Blob y documentarla (los datos se alojan fuera de Argentina: hay que decirlo en el consentimiento).
- ☑ Resolver `npm audit` (4 altas por `zod` < 4.6.6 vía `@vercel/blob` → `@vercel/oidc` → `@vercel/cli-config`): `overrides` a `zod ^4.6.6` (misma versión mayor), 0 vulnerabilidades, tests en verde.
- ☑ Separar las solicitudes de acceso por escuela: van a las admins de la escuela (por CUE) o a la plataforma (escuela nueva o directora).

## 3. IA y terceros
- ☑ OpenRouter: limitar a proveedores que **no entrenan con los datos y no los retienen**: cada llamada manda `provider: { data_collection: "deny", zdr: true }` (`api/_lib/modelos.js`).
  - ☐ Además, en la cuenta de OpenRouter (Settings → Privacy): activar ZDR y desactivar proveedores que entrenan/guardan, para que valga aunque alguien llame sin esos parámetros.
  - ☐ Probar contra la API real con `OPENROUTER_API_KEY` (no se probó: no estaba en el entorno de desarrollo) que día, agente y chat responden con esas restricciones.
- ☑ Mandar a la IA solo nombre de pila y lo mínimo necesario; nunca contactos ni datos de salud (`api/_lib/minimizar.js`, `test/ia-privacidad.test.js`). Ojo: lo que la docente dicta en el relato va a la IA (se tapan emails y teléfonos); pedirles que no dicten apellidos ni datos de salud que no hagan falta.
- ☑ Revisar que los modelos permitidos en `_lib/modelos.js` cumplan lo anterior (1/11/2026, `openrouter.ai/api/v1/endpoints/zdr`): `deepseek-v4-flash`, `gemma-4-31b-it` y `nemotron-3.5-lightning` tienen endpoints ZDR; `gemma-4-31b-it:free`, `nemotron-3.5-lightning:free` y `openrouter/free` **no** → se sacaron.
- ☑ Listar todos los terceros que tocan datos (Vercel, Neon, Resend, OpenRouter y sus proveedores, ARASAAC solo pictos) para el consentimiento: en `privacidad.html`.

## 4. Legal y escuela
- ☐ Aval por escrito de la dirección de la escuela (y, si corresponde, del Ministerio de Educación de Santa Fe o la supervisión).
- ☐ Consentimiento informado firmado por cada familia/tutor: qué datos, para qué, quién los ve, dónde se guardan, uso de IA, cuánto tiempo, cómo pedir acceso, corrección o borrado.
- ☐ Política de privacidad y términos de uso publicados en la app. **Borrador** listo (`privacidad.html`, `terminos.html`, link en el pie de todas las páginas, el consentimiento de la familia linkea y guarda la versión). Falta: revisión legal, completar `[CONTACTO]`, `[RESPONSABLE]` y `[REGIÓN]`, y subir `VERSION_PRIVACIDAD` al publicar el texto final.
- ☐ Evaluar inscripción de la base en el Registro Nacional de Bases de Datos (AAIP).
- ☐ Definir responsable del tratamiento (¿la escuela? ¿Puente?) y un contacto para reclamos.
- ☐ Acuerdo de confidencialidad para docentes que usan la plataforma.
- ☐ Revisar el texto de la invitación a familias (qué se comparte, consentimiento) con la escuela antes de mandar invitaciones reales.
- ☐ Antes de importar una planilla real: que la escuela confirme que tiene el consentimiento de esas familias para cargar sus emails y teléfonos, y que la planilla tiene solo nombre de pila (sin apellidos, diagnósticos ni datos de salud). Borrar la planilla de la compu después de importar.

## 5. Operación del piloto
- ☐ Una sola escuela piloto, pocos alumnos, plazo definido.
- ☑ Importación masiva de docentes y alumnos con familias (CSV/XLSX, vista previa, todo o nada, idempotente, mails solo al confirmar).
- ☐ Verificar el límite de envíos de Resend del plan contratado antes de importar muchas familias juntas (hoy: tandas de 20 con pausa).
- ☑ Procedimiento para dar de baja a una familia o alumno y borrar sus datos (incluye días en Blob e historial de chat): *Borrar alumno* (admin/plataforma), *dar de baja a esta familia* (admin) y *Pedir la baja* (familia). Cada baja queda registrada (quién, cuándo, cuánto) sin datos personales.
- ☑ Plazo de retención: días publicados (365), historial de chat (30), fichas inactivas (730, solo se informan), auditoría y comentarios (365); configurables por variables y limpieza diaria por cron (falta cargar `CRON_SECRET`).
- ☑ Registro de accesos de docentes y alertas de intentos fallidos (tabla `auditoria`, *Panel → Registro*, mail a la plataforma ante 5 códigos incorrectos en 30 min).
- ☑ Canal de feedback para docentes y familias (*Enviar comentario* en el pie; aviso por mail a la plataforma con límite).
- ☐ Plan ante incidentes: a quién avisar y cómo, si hay una filtración.

## 6. Después del piloto
- ☐ SSO para docentes (la capa `api/_lib/identidad.js` ya está lista).
- ☐ Pasar los días de Blob a Postgres.
- ☑ Invitaciones por mail a las familias (1 cada 24 h, reenviar desde la ficha).
- ☑ Multi-escuela: plataforma → admin de escuela → docentes con alumnos asignados; la plataforma puede desactivar escuelas.
- ☐ Reasignar docentes entre escuelas desde la plataforma.

## 7. Variables nuevas a cargar en Vercel (rama `feat/piloto`)
- ☐ `CRON_SECRET` (Producción; en Preview opcional).
- ☐ (opcionales, tienen default) `CHAT_RETENCION_DIAS`, `DIAS_PUBLICADOS_RETENCION`, `FICHAS_RETENCION_DIAS`, `AUDITORIA_RETENCION_DIAS`, `FEEDBACK_RETENCION_DIAS`, `AUDITORIA_ALERTA_FALLOS`.
- ☑ `DONACIONES_INTL_URL` y `DONACIONES_AR_URL` (cargadas por Danny el 1/11/2026).
- ☐ Con el dominio: `PUENTE_URL` y `RESEND_FROM`.

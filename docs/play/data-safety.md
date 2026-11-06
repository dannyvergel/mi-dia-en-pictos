# Seguridad de los datos (Data safety) · Puente `app.puentepictos.twa`

Respuestas para el formulario de Play Console (Contenido de la app → Seguridad de los datos), armadas a partir del código (`web/api/`, `web/*.html`) y de `web/privacidad.html` (versión 2026-11-01-borrador). Donde dice **⚠ DUDOSA** hay una decisión tuya o una interpretación que conviene revisar.

Regla general de Google: se declara todo dato que **sale del teléfono** hacia vos o hacia terceros, incluido lo que pasa por el contenido web de la TWA. Mandárselo a un **proveedor de servicios** que procesa por cuenta tuya (Vercel, Neon, Resend, OpenRouter) **no cuenta como «compartir»**.

## Qué hace la app, en corto (de dónde salen las respuestas)

- La app Android es una TWA: muestra https://puentepictos.app en Chrome. El AAB no pide permisos (ni INTERNET, ni ubicación, ni cámara, ni micrófono, ni contactos, ni AD_ID; verificado con `bundletool dump manifest`: solo `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`). No tiene SDKs de anuncios ni de analítica nativos.
- Cuentas: docentes y directivos (las crea la escuela) y familias (invitadas por email). Se entra con un código por mail (Resend). Las docentes pueden usar «Entrar con Google» (solo se recibe el email verificado).
- Base de datos: Neon (Postgres). Archivos (días publicados, informes y documentos): Vercel Blob, privado.
- IA: OpenRouter con `provider: { data_collection: "deny", zdr: true }` (`web/api/_lib/modelos.js`): solo endpoints sin retención. A la IA va el nombre de pila y lo mínimo; nunca emails, teléfonos ni la ficha de salud (`web/api/_lib/minimizar.js`, test `ia-privacidad.test.js`).
- **Analítica: SÍ hay.** Vercel Web Analytics (`<script defer src="/_vercel/insights/script.js">`) está en index, login, docente, familia, cuaderno, admin, presentacion, privacidad y terminos. Cuenta como analítica de terceros aunque no use cookies. El comunicador NO la tiene (lo controla `test/comunicador.test.js`).
- Sin anuncios. Sin compras.
- Cifrado en tránsito: todo por HTTPS (la TWA no funciona sin HTTPS; cookies `Secure`).
- Borrado: la familia se da de baja sola desde su espacio («Pedir la baja y borrar mis datos», `web/api/_lib/bajas.js`); la escuela da de baja alumnos y familias; docentes: por mail a soporte (la escuela solo puede *desactivar* la cuenta de una docente, no borrarla: `UPDATE docentes SET activo = false`). Página pública nueva: https://puentepictos.app/borrar-cuenta.html.

## Sección 1 · Recolección y seguridad

| Pregunta | Respuesta |
|---|---|
| ¿Tu app recolecta o comparte alguno de los tipos de datos del usuario requeridos? | **Sí** |
| ¿Todos los datos del usuario recolectados por tu app están encriptados en tránsito? | **Sí** |
| ¿Ofrecés una forma para que los usuarios soliciten que se borren sus datos? | **Sí** → URL: `https://puentepictos.app/borrar-cuenta.html` |
| URL para borrar la cuenta (obligatoria si la app tiene cuentas) | `https://puentepictos.app/borrar-cuenta.html` (tiene que estar en producción antes de enviar) |
| ¿Se pueden borrar algunos datos sin borrar la cuenta? (opcional) | Podés dejarlo vacío. Si lo completás: la familia puede pedir a la escuela que quite un documento o un contacto. |

## Sección 2 · Tipos de datos

Para cada uno: **Recolectado / Compartido**, si se **procesa de forma efímera**, si es **obligatorio u opcional**, y **para qué**.

### Información personal

| Dato | ¿Recolectado? | ¿Compartido? | Efímero | Obligatorio | Finalidades |
|---|---|---|---|---|---|
| Nombre | **Sí** (docentes; contactos de familia; nombre de pila del alumno) | No | No | Obligatorio | Funcionalidad de la app; Administración de la cuenta |
| Dirección de email | **Sí** (docentes y familias; con Google, el email verificado) | No | No | Obligatorio | Funcionalidad de la app; Administración de la cuenta; Comunicaciones del desarrollador (código para entrar, invitaciones y avisos) |
| Número de teléfono | **Sí** (teléfono de los contactos de familia que carga la escuela en la ficha) | No | No | Opcional | Funcionalidad de la app |
| Otra información | **Sí** (vínculo con el alumno, escuela, grado, rol de la docente) | No | No | Obligatorio | Funcionalidad de la app; Administración de la cuenta |
| Dirección, ID de usuario, raza/etnia, religión, orientación sexual, política | No | — | — | — | — |

⚠ DUDOSA · «ID de usuario»: Puente usa ids internos de base de datos y sesiones por cookie. Google suele pedir declarar «ID de usuario» cuando hay cuentas. Recomiendo **declararlo** (Funcionalidad, Administración de la cuenta): sobra pero no te van a rechazar por eso.

### Salud y estado físico

| Dato | ¿Recolectado? | ¿Compartido? | Efímero | Obligatorio | Finalidades |
|---|---|---|---|---|---|
| Información de salud | **Sí** (ficha de apoyos: comunicación, sensibilidad sensorial, qué lo calma, alimentación, objetivos del PPI; alertas del día) | No | No | Opcional | Funcionalidad de la app |
| Información de actividad física | No | — | — | — | — |

⚠ DUDOSA: la política dice «sin diagnósticos», pero la ficha y las alertas son datos sensibles de chicos con discapacidad. Declararlo como «Información de salud» es lo conservador y lo honesto. Recomiendo **declararlo**.

### Mensajes

| Dato | ¿Recolectado? | ¿Compartido? | Efímero | Obligatorio | Finalidades |
|---|---|---|---|---|---|
| Otros mensajes en la app | **Sí** (preguntas de la familia en «Preguntale a Puente», 30 días; «Enviar comentario») | No | No | Opcional | Funcionalidad de la app; Asistencia al cliente (comentarios) |
| Emails, SMS/MMS | No | — | — | — | — |

### Fotos y videos

| Dato | ¿Recolectado? | Notas |
|---|---|---|
| Fotos | ⚠ DUDOSA · **Sí, opcional** | La escuela puede subir informes como JPG o PNG. Si alguna sube una foto, es una foto. Declararlo (Funcionalidad, opcional) cubre ese caso. Si preferís no declararlo, limitá los documentos a PDF y DOCX. |
| Videos | No | |

### Archivos y documentos

| Dato | ¿Recolectado? | ¿Compartido? | Efímero | Obligatorio | Finalidades |
|---|---|---|---|---|---|
| Archivos y documentos | **Sí** (informes en PDF, JPG, PNG o DOCX, en Vercel Blob privado; nunca van a la IA) | No | No | Opcional | Funcionalidad de la app |

### Audio

| Dato | ¿Recolectado? | Notas |
|---|---|---|
| Grabaciones de voz | ⚠ DUDOSA · **No** | El botón «Dictar» usa el reconocimiento de voz del navegador (Web Speech API de Chrome). Puente nunca recibe audio, solo el texto. El audio lo procesa Chrome/Google, no tu servidor. Según la guía de Google, lo que procesa el sistema o el navegador sin pasar por vos no lo recolecta la app. Si el revisor pregunta, explicalo así. |

### Actividad en la app

| Dato | ¿Recolectado? | ¿Compartido? | Efímero | Obligatorio | Finalidades |
|---|---|---|---|---|---|
| Interacciones con la app | **Sí** (páginas vistas que mide Vercel Web Analytics) | No | No | Obligatorio (no se puede desactivar) | **Estadísticas** |
| Otro contenido generado por el usuario | **Sí** (el relato del día que dicta o escribe la docente, registros, informes de progreso) | No | No | Obligatorio | Funcionalidad de la app |
| Historial de búsqueda en la app, apps instaladas, otras acciones | No | — | — | — | — |

⚠ DUDOSA · Vercel Web Analytics: no usa cookies y agrega los datos, pero los datos **salen del teléfono** hacia un tercero para medir uso. Google no tiene una excepción por «anónimo», así que lo correcto es declarar «Interacciones con la app → Estadísticas». **Alternativa más limpia (recomendada):** no cargar el script de Vercel Insights cuando la página se abre dentro de la app (`?app` o referrer `android-app://`), y entonces esta fila queda en «No». Es un cambio chico que no está en este PR.

### Ubicación

| Dato | ¿Recolectado? | Notas |
|---|---|---|
| Ubicación aproximada | ⚠ DUDOSA · **No** | La app no pide ubicación. El registro de accesos guarda la IP **recortada** (IPv4 a.b.c.0; IPv6 /48) por seguridad, y Vercel Analytics deduce el país. Ninguna de las dos es «ubicación» en el sentido de la app. Si querés ir a lo más conservador, declarás «Ubicación aproximada → Estadísticas / Prevención de fraude y seguridad». |
| Ubicación precisa | No | |

### Identificadores del dispositivo u otros

| Dato | ¿Recolectado? | Notas |
|---|---|---|
| ID del dispositivo u otros | ⚠ DUDOSA · **No** | Sin AD_ID ni Android ID. Hay una cookie de sesión (es la cuenta, ya declarada) y la auditoría guarda el email como HMAC no reversible + IP recortada para seguridad. Si Google insiste, declará «ID del dispositivo u otros → Prevención de fraude y seguridad». |

### Información y rendimiento de la app

| Dato | ¿Recolectado? | Notas |
|---|---|---|
| Registros de fallas, diagnóstico | No | No hay SDK de fallas. Los logs del servidor de Vercel son tuyos y no son diagnóstico del teléfono. |

### No se recolectan

Información financiera, contactos del teléfono, calendario, historial de navegación web, apps instaladas, ubicación precisa, fitness.

## Sección 3 · Compartir

**No se comparten datos con terceros.** Vercel, Neon, Resend y OpenRouter (y los proveedores de IA sin retención que usa) son proveedores de servicios que procesan por cuenta de Puente: según Google, eso no es «compartir». ARASAAC solo recibe palabras clave de pictogramas, nunca datos de personas. Google (Entrar con Google) **le manda** datos a Puente, no al revés.

## Prácticas de seguridad (insignias)

| Pregunta | Respuesta |
|---|---|
| Datos encriptados en tránsito | Sí |
| Podés solicitar que se borren los datos | Sí |
| Revisión de seguridad independiente (MASA) | No (no está hecha) |
| Comprometido con la Política de Familias | **No** para Puente (ver `clasificacion-contenido.md`). |

## Datos de menores (aclaración honesta)

Puente guarda datos **sobre** menores (nombre de pila, ficha de apoyos y registros de alumnos), cargados por adultos: docentes con el consentimiento de la familia. Las cuentas son de adultos. El formulario de Data safety no tiene una casilla para «datos de menores». Por eso importa declarar bien «Información de salud» y que la política de privacidad deje claro el consentimiento expreso de la familia (ya lo dice, Ley 25.326).

## Pendientes antes de enviar

1. Subir a producción `borrar-cuenta.html` (este PR) para que la URL de borrado funcione.
2. Decidir Vercel Insights dentro de la app: declararlo (Estadísticas) o sacarlo con `?app`.
3. Completar en `privacidad.html` [RESPONSABLE] y [REGIÓN] y quitar «BORRADOR» cuando pase la revisión legal. Si sumás la mención de la app Android y de la página de borrado, cambia la versión y se vuelve a pedir el consentimiento.

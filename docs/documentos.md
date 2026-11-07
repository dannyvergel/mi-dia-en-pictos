# Informes y documentos

Las seños y terapeutas pueden subir archivos de cada alumno, como informes, actas o fotos de un cuaderno, y decidir uno por uno si la familia los ve.

## Qué es
- Se cargan en `docente.html`, en la tarjeta «Informes y documentos» que aparece debajo de la ficha del alumno. La familia los ve en `familia.html`, en una tarjeta que aparece solo si hay alguno visible.
- API: todo va en `web/api/fichas.js` (acciones `doc_subir`, `doc_cambiar`, `doc_borrar`; `GET ?documentos=<alumno_id>` y `GET ?documento=<doc_id>`). La lógica está en `web/api/_lib/documentos.js`. No suma funciones de Vercel.
- Tabla `documentos` (metadatos). El archivo se guarda en el Vercel Blob privado, en `documentos/<alumno_id>/<32 hex al azar>`, con `guardarArchivo`, `leerArchivo` y `borrarArchivo` de `_lib/almacen.js`.
- **Nunca pasan por la IA ni por OpenRouter.**

## Permisos
- **Docente con acceso al alumno** (asignada, admin de su escuela o la plataforma): sube, lista todos, descarga, muestra u oculta y avisa a la familia.
- **Borrar**: solo quien lo subió o una admin de la escuela del alumno.
- **Reservado** (`documentos.reservado`, por defecto `false`): se marca al subir (casilla «Reservado: solo para mí y la administración») o después con el botón «Reservar» / «Compartir con el equipo» (`doc_subir` / `doc_cambiar` con `reservado`). Lo ven, descargan, cambian y borran solo quien lo subió, la admin de la escuela y la plataforma. Para el resto de las docentes asignadas no existe: se omite de la lista y da 404. Nunca es visible para la familia: pedir `reservado` y `mostrar_familia` a la vez da 400, reservar un documento visible lo oculta (y borra la marca de aviso), y la base lo impide con un CHECK. No aparece en las vistas ni en la exportación de la familia. Quien puede borrar sigue siendo solo quien lo subió o la admin.
- **Familia vinculada**: lista y descarga solo los que tienen `visible_familia`, de sus alumnos y de escuelas activas. No puede cambiar ni borrar.
- Rige aunque `FAMILIA_FUNCIONES` esté en el mínimo (ver `docs/funciones-familia.md`).
- La descarga sale con `Content-Disposition: attachment`, `Cache-Control: no-store`, `nosniff` y una CSP `sandbox`. El service worker no cachea `/api/`.

## Límites
- Tipos: PDF, JPG, PNG y DOCX. Se valida la extensión, el tipo declarado (tiene que coincidir o venir vacío) y los primeros bytes del archivo.
- Tamaño: hasta **3 MB**. El archivo viaja en base64 dentro del JSON, y el body de Vercel admite como mucho 4,5 MB.
- El nombre se sanitiza: sin carpetas, sin caracteres raros y hasta unos 100 caracteres.

## Retención y borrado seguro
- **Plazo**: `DOCUMENTOS_RETENCION_DIAS` (default **1825 días = 5 años**, constante `DOCUMENTOS_RETENCION_DIAS` en `web/api/_lib/retencion.js`). Es un default conservador: los informes suelen guardarse varios años. La limpieza diaria (`/api/auditoria?accion=limpieza`) borra los documentos de un alumno cuando **pasaron 5 años sin actividad suya**: la actividad es lo más reciente entre el alta del alumno, los cambios de su ficha, su última publicación y el último documento subido. La baja del alumno los borra antes. Tanda de hasta 200 por corrida.
- **Borrado seguro**: `almacen.borrarArchivo` borra y verifica. Si el Blob falla, anota la ruta en la tabla `blobs_huerfanos` (`ruta`, `intentos`, `ultimo_error`, `created_at`) y sigue: la fila del documento se borra igual. Vale para borrar a mano, la baja del alumno y los vencidos.
- **Reintentos**: la limpieza diaria llama a `barrerHuerfanos()`, que reintenta hasta `HUERFANOS_MAX_INTENTOS` (10) veces y saca la fila cuando el archivo se borra. Al llegar al tope deja un error en el log (`archivo huérfano sin poder borrar tras 10 reintentos: <ruta>`) y no insiste: hay que borrarlo a mano del Blob y sacar la fila. La respuesta de la limpieza trae `blobs_huerfanos` (reintentados, borrados, fallidos, excedidos) y `documentos_vencidos`.

## Cómo se notifica
- Solo si el documento está visible para la familia (si no, la API responde 400). Se marca al subir («Informar a la familia por mail») o después, con el botón «Informar».
- Se manda un mail (Resend) a cada email de familia vinculada, por separado. El asunto es del estilo «Nuevo informe de Juan en Puente». El cuerpo dice que la escuela compartió un informe o documento y que entren a Puente para verlo (`/login.html?familia`).
- **El mail nunca lleva el adjunto, el título ni el contenido**: solo el tipo y el nombre de pila.
- Cuando sale al menos un mail, se guarda `notificado`. Si Resend falla, el documento queda guardado y la respuesta lo avisa (`aviso_familia.aviso`). Al ocultar un documento, la marca de aviso se borra.

## Auditoría, bajas y derechos
- Auditoría: se registran `doc_subir`, `doc_ver` (descarga), `doc_cambiar` y `doc_borrar`, con el id del documento y sin títulos, nombres ni emails.
- La baja del alumno (`_lib/bajas.js`) borra las filas y los archivos del Blob. Desactivar una escuela no borra nada, pero la familia deja de verlos.
- La exportación de la familia (`GET api/fichas?exportar=1`) trae los metadatos de los documentos visibles, sin los archivos.
- Tests: `web/test/documentos.test.js` y `web/test/documentos-reservado.test.js` y `web/test/retencion-documentos.test.js`.

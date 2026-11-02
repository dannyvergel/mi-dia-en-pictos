# 🌉 Puente

**De la escuela a casa, en pictogramas.** Demo: https://puentepictos.app

**La docente cuenta el día en 20 segundos. El chico lo ve en pictogramas. La familia recibe un resumen claro. Y el registro queda guardado solo.**

App para escuelas de educación especial: niños con TEA, discapacidad intelectual o necesidades de comunicación.

**Páginas**: `/` (`index.html`) es la **portada pública**: qué es Puente, una tira de ejemplo con pictos ARASAAC, para quién es, que es gratuito y está en piloto con invitación, y los botones *Entrar* (`login.html`) y *Soy familia* (`login.html?familia`). El **Cuaderno del día** de la docente se mudó a `/cuaderno.html` (antes era la raíz; el manifest de la PWA arranca ahí). `login.html`, `docente.html`, `familia.html` y los links de invitación (`login.html#invitacion=…`) no cambiaron. El **panel de la plataforma** es `/admin.html` (solo `ADMIN_EMAIL`).

## El problema
- Las familias muchas veces no saben cómo fue el día, y los chicos no siempre pueden contarlo.
- Lo imprevisto genera ansiedad: anticipar la rutina con apoyos visuales es clave.
- Las docentes pierden tiempo escribiendo cuadernos de comunicación, registros y el seguimiento del PPI.

## La solución
1. **Docente** dicta o escribe cómo fue el día (dictado en es-AR desde el navegador).
2. **IA** lo estructura: actividades en orden, estado de ánimo, logros y alertas.
3. **Pictogramas** de ARASAAC para cada actividad → agenda visual que el chico toca y escucha.
4. **Familia** recibe un mensaje cálido listo para WhatsApp, con alertas destacadas.
5. **Registro formal** para el legajo; a fin de mes, la IA arma el informe de progreso.

## 🧠 Agente de Progreso (lo nuevo)
Un agente con herramientas que trabaja sobre el historial de cada chico:
1. `analizar_patrones` – cuenta momentos difíciles por día, actividad y hora; evolución del ánimo.
2. `evaluar_ppi` – mide cada objetivo del PPI semana a semana.
3. `buscar_estrategias` – base curada de prácticas basadas en evidencia (NCAEP 2020 / AFIRM), con fuente.
4. `armar_agenda` – agenda visual ARASAAC del próximo día difícil, con apoyos de anticipación.
5. Cierra con mensaje para la familia y nota para el legajo.

El LLM decide qué herramienta usar (tool calling en OpenRouter); los números salen de código, no del modelo. La traza de pasos se ve en pantalla.
Sin API key corre el mismo circuito con un plan fijo (modo demo), así la demo nunca se cae.

**Activar IA:** en Vercel → Settings → Environment Variables → `OPENROUTER_API_KEY` (y opcional `OPENROUTER_MODEL`, por defecto `deepseek/deepseek-v4-flash`). Con eso también `/api/dia` estructura el día con IA.

**IA sin retención** (`api/_lib/modelos.js`): toda llamada a OpenRouter (día, agente, chat) manda `provider: { data_collection: "deny", zdr: true }`: solo proveedores que no guardan ni entrenan con los datos y endpoints con *Zero Data Retention*. Modelos permitidos (todos con endpoints ZDR según `https://openrouter.ai/api/v1/endpoints/zdr`, revisado el 1/11/2026): `deepseek/deepseek-v4-flash`, `google/gemma-4-31b-it`, `nvidia/nemotron-3.5-lightning`. Las variantes gratuitas (`:free`) y `openrouter/free` **no** tienen endpoints ZDR y quedaron afuera. Si ningún proveedor cumple, OpenRouter da error y cada función cae a su modo sin IA. Recomendado además: en openrouter.ai → Settings → Privacy, activar ZDR y desactivar proveedores que entrenan (a nivel cuenta).

**Minimización** (`api/_lib/minimizar.js`): a la IA va solo el nombre de pila y lo mínimo. Del perfil, solo comunicación, sensibilidades, qué lo calma y qué le gusta (nunca alimentación, otros apoyos ni observaciones); en el agente, la ficha de la base manda sobre lo que mande el navegador; en el chat, las alertas de salud/medicación se reemplazan por un aviso sin detalle; emails, teléfonos y números tipo DNI se tapan en el relato del día, la pregunta de la familia y lo que se guarda en el historial. Tests: `test/ia-privacidad.test.js`.

## 🌉 Espacio de la familia
Cada alumno tiene un link privado (`familia.html?t=…`, token de 128 bits). La familia ve a demanda:
- sus últimos días con ánimo y pictogramas (toca y escucha),
- la agenda del próximo día con los apoyos nuevos,
- en qué objetivos se está trabajando, en lenguaje simple,
- logros recientes,
- **Preguntale a Puente**: chat que responde solo con los registros de la escuela, sin diagnósticos.

### Chat "Preguntale a Puente": protecciones
El chat solo habla del alumno en la escuela: sus días, lo registrado, su ánimo, actividades, objetivos del PPI, apoyos e ideas para casa relacionadas. Todo lo demás recibe una negativa fija: *"Solo puedo contarte sobre el día de <alumno> en la escuela. Para otras cosas, escribile a la docente."* (`api/_lib/chat.js`).
1. **Prefiltro sin IA**: frases obvias de inyección (*"ignorá las instrucciones"*, *"system prompt"*, *"actuá como"*, *"modo desarrollador"*, marcas de rol tipo `<|im_start|>`) y pedidos ajenos (código, poemas, cuentos, *"haceme la tarea"*, traducciones) se frenan antes de llamar al modelo. Las reglas están pensadas para no frenar preguntas normales (*"¿actuaron en el acto?"*, *"¿hace la tarea en clase?"*).
2. **El modelo clasifica**: responde solo JSON `{"en_tema": bool, "respuesta": string}` (`response_format: json_object`, 400 tokens). Si `en_tema` es falso o el JSON no es válido → negativa fija. El prompt trata el texto de la familia como dato (va entre `<pregunta_familia>…</pregunta_familia>`), prohíbe revelar instrucciones o cambiar de rol.
3. **Post-chequeo**: se sacan URLs, dominios, bloques de código, HTML y markdown; máximo 700 caracteres; si la respuesta repite partes de las instrucciones, negativa.
4. **Historial del lado del servidor**: el navegador ya no lo manda (si lo manda, se ignora). Con base, se guarda en la tabla `chat_turnos` por cuenta + alumno (solo preguntas en tema con su respuesta), se usan los últimos 6 mensajes y se borra a los 30 días. En modo demo cada pregunta es independiente.
5. **Límites**: con base, 5 preguntas cada 10 min y 20 por día por cuenta, y 10 cada 10 min / 60 por día por IP (tabla `limites`). En modo demo, lo mismo por link + IP y por IP, en memoria de cada instancia. Responde 429 con un mensaje amable. Las negativas también cuentan.
6. **Monitoreo**: cada negativa deja en los logs `[puente] chat negativa motivo=… quien=familia#id` (o `demo`), sin el nombre del alumno ni el texto de la pregunta.

Se actualiza solo cada vez que la docente carga un día o corre el agente. Datos en Vercel Blob (store privado `puente-datos`); no se publican las notas internas del legajo.

## 🔐 Cuentas y fichas de familia
Con una base de datos conectada, Puente deja el PIN y los links y pasa a cuentas. **Nadie usa contraseña** (por ahora; más adelante se suma SSO):
- **Docentes**: entran en `/login.html` → *Soy docente* con su email y un **código de 6 números** que les llega por mail (vence a los 10 min, se guarda hasheado, máximo 5 intentos; hasta 3 códigos por email y 10 por IP cada 15 min, 30 verificaciones por IP). Solo reciben código las docentes **activas**; la respuesta es siempre la misma, exista o no el email. Sesión con cookie `HttpOnly; Secure; SameSite=Lax`, firmada con HMAC y guardada en la tabla `sesiones`. En `/docente.html` cargan alumnos y sus fichas; una docente admin suma, aprueba o desactiva docentes.
- **Piloto cerrado** (por defecto con base): *Solicitar acceso* está oculto y bloqueado; se entra solo con **link de invitación** (ver *Piloto cerrado* abajo). Lo que sigue aplica con `PILOTO_SOLO_INVITACION=0`.
- **Solicitar acceso**: una seño nueva toca *Solicitar acceso* en el login (nombre, email, escuela, *Soy director/a*, rol/grado y mensaje opcionales). Queda **pendiente** y se rutea (ver *Roles* abajo): a las admins de su escuela o a la plataforma, con un mail con el link a `docente.html#solicitudes`. Ahí se **aprueba** o se **rechaza** (con un mail amable opcional). Al aprobar se crea (o se reactiva) la cuenta y le llega *"Ya tenés acceso a Puente"* con el link al login.
  - Protecciones del formulario público: solo JSON, campo trampa oculto para bots (se responde igual y no se guarda), 5 pedidos por IP por hora y 3 por email por día, respuesta siempre genérica (*"Recibimos tu pedido, te avisamos por mail"*) aunque el email ya tenga cuenta o ya haya pedido (si ya hay una pendiente se actualiza, sin volver a avisar). Todo lo que escribe la persona se escapa en los mails y en el panel.
- **Familias**: el mismo código por email. Pueden entrar los emails que la docente cargó en *Contactos* de la ficha; si un email se borra de la ficha, pierde el acceso. Un código pedido como docente no sirve como familia, ni al revés.
- **Invitación a la familia**: cuando la docente suma un email en *Contactos* (al crear o editar la ficha), le llega por Resend *"<docente> te sumó a Puente para seguir el día de <nombre>"*, con el botón a `login.html?familia&email=…` (pestaña familia y email ya escritos) y la explicación del ingreso por código y del consentimiento. Máximo **una por email + alumno cada 24 h** (tabla `invitaciones`); en la ficha se ve cuándo se mandó y está el botón **reenviar invitación** (responde que espere si fue hace menos de 24 h). Todo lo que escribió una persona va escapado. Si el mail falla, la ficha se guarda igual y la docente ve el aviso para reenviar.
- **Ficha de familia** (una por alumno): nombre de pila, contactos (nombre, vínculo, email, teléfono/WhatsApp), apoyos y sensibilidades (comunicación, sensoriales, qué lo calma, alimentación, qué le gusta, otros), objetivos del PPI (los usa el Agente de Progreso) y consentimiento (quién y cuándo). La familia la ve en su espacio, puede dar o retirar el consentimiento y actualizar su propio teléfono.
- **Privacidad**: solo nombre de pila, sin fotos, sin campo de diagnóstico. Cada API verifica la sesión: una admin de escuela ve los alumnos de su escuela; una docente, solo los que tiene asignados; una familia, solo los alumnos vinculados a su email (de escuelas activas).
- Los **días** siguen en Vercel Blob (uno por alumno); la base guarda cuentas, fichas, vínculos y solicitudes.

### 👥 Roles
```
Plataforma (solo la cuenta de ADMIN_EMAIL, panel admin.html)
  └─ da de alta escuelas desde el padrón, genera el link del directivo, ve todas las escuelas y puede desactivarlas
     Admin de escuela (directora o quien ella haga admin)
       └─ aprueba e invita a las docentes de SU escuela, ve y asigna todos sus alumnos
          Docente
            └─ ve solo los alumnos que tiene asignados, carga contactos de familias
               Familia (invitada por mail) → entra con código, da su consentimiento
```
- **Plataforma**: **solo la cuenta de `ADMIN_EMAIL`** (`S.esPlataforma` / `S.exigirPlataforma` en `api/_lib/seguridad.js`, validado en el server en cada acción). Sin `ADMIN_EMAIL` no hay plataforma. La columna `docentes.es_plataforma` quedó sin efecto: una cuenta que haya sido promovida antes ya no tiene permisos de plataforma, y **promover a otras cuentas está bloqueado** por ahora (`POST /api/docentes accion=plataforma` responde 403 a todos; anotado en el checklist para después). Todo lo de plataforma está en `admin.html` (ver *Panel de la plataforma*). Una escuela desactivada no entra: se cortan las sesiones de sus docentes, sus docentes y familias no reciben código y sus pedidos nuevos van a la plataforma.
- **Ruteo de solicitudes**: si la seño elige del padrón una escuela que **ya está en Puente** (mismo CUE), activa y con al menos una admin, el pedido va **solo a las admins de esa escuela** (el mail también). Si la escuela no está en Puente, no tiene admins, no eligió del padrón, o marcó **Soy director/a**, va a la **plataforma**. Al aprobar una directora o una escuela nueva, la plataforma crea la escuela desde el padrón (si hace falta) y la deja **admin**.
- **Admin de escuela**: ve solo los pedidos de su escuela y aprueba solo en su escuela (no puede elegir otra ni crear escuelas). Suma docentes desde *Docentes*, ve **todos** los alumnos de su escuela y les asigna docentes.
- **Docente**: ve y edita solo los **alumnos asignados** (tabla `alumno_docentes`): ficha, *Cuaderno del día* (`/api/dia`), Agente de Progreso, publicar para la familia y la vista previa del chat. Quien crea un alumno queda asignada. Una docente asignada puede sumar a otra de su escuela (maestra integradora, terapeuta…; puede haber varias); quitar a otra solo lo hace una admin, y cada una se puede quitar a sí misma.
- **Migración**: se aplica sola. Columnas nuevas idempotentes (`es_plataforma`, `escuelas.activa`, `solicitudes.destino/escuela_id/es_director`) y, **una sola vez** (tabla `migraciones`), cada alumno que ya existía sin asignaciones queda asignado a todas las docentes activas de su escuela, así nadie deja de ver lo que veía. Las solicitudes pendientes de antes quedan para la plataforma.

### 🛠️ Panel de la plataforma (`admin.html`)
Solo para la cuenta de `ADMIN_EMAIL`. La página muestra *"Este panel es solo de la plataforma"* a cualquier otra cuenta, pero lo que protege es el server: cada acción de plataforma responde **403** si no la pide `ADMIN_EMAIL`, aunque la cuenta sea directora o esté marcada `es_plataforma` en la base (tests: `test/admin-plataforma.test.js`, `test/roles.test.js`). Después de entrar, `ADMIN_EMAIL` va directo a `admin.html`.
- **Escuelas**: *Dar de alta una escuela* con el buscador del Padrón Oficial (`POST /api/escuelas accion=crear_escuela { cue }`; si ya está en Puente devuelve esa, sin duplicar) y, en el mismo paso, el **link para su directivo/a**. Lista de escuelas (`GET ?todas=1`): CUE, localidad, docentes/admins, alumnos, links de docente pendientes, aval, y por escuela **Ficha** (`GET ?ficha=1&id=`, `POST accion=guardar_ficha { escuela_id, … }`), **Link para directivo/a** y **desactivar/reactivar**. Arriba, **"X de 15 cupos usados"**.
- **Invitaciones**: cupos, link para un directivo/a (o docente) de cualquier escuela activa y **todos los links** de la plataforma (docentes y familias) con su estado y *anular*.
- **Solicitudes**: las que hayan quedado de antes del piloto cerrado (aprobar eligiendo escuela, crear desde el padrón o rechazar).
- **Registro**: el registro de accesos de **toda** la plataforma y los **comentarios recibidos** (*Enviar comentario*).
- Si `ADMIN_EMAIL` además tiene escuela propia (como la cuenta creada antes de este cambio), en `docente.html` ve solo lo de su escuela y un link *Panel de la plataforma →*. Sin escuela, `docente.html` lo manda a `admin.html`.
- Las directoras siguen con su panel en `docente.html`, recortado a su escuela (Solicitudes, Escuela, Importar, Invitaciones, Registro, Docentes).

### 🔗 Alta por invitación en cascada
1. **Primera cuenta** (`login.html` → *Primera vez en Puente*, `POST /api/auth accion=setup`): exige `ADMIN_EMAIL` (y ese email) y `DOCENTE_PIN`. Se crea **sin escuela** (`docentes.escuela_id` es opcional; solo la plataforma lo deja vacío) y sin buscador de escuelas. Sin escuela no carga alumnos ni suma docentes a mano.
2. **Danny crea la escuela** desde el padrón en `admin.html` y genera el **link del directivo** (es admin). También se puede crear el link directo con el CUE (`POST /api/docentes accion=invitacion_crear { cue, es_admin: true }`): si la escuela no está en Puente, **se crea desde el padrón al crear el link**.
3. **El directivo** abre el link, pone nombre y email, valida el código y queda **admin de esa escuela**. Desde *Panel → Invitaciones* invita a sus **seños** (links de su escuela).
4. **Las seños o la dirección** invitan a las **familias** desde la ficha del alumno (*Link de invitación para la familia*, o el mail de *Contactos*).
Todo respeta el tope de cupos. Test de punta a punta: `test/admin-plataforma.test.js`.

### 📥 Importación masiva (docentes, alumnos y familias)
*Panel → Importar* (solo admins de escuela y plataforma; una docente sin admin recibe 403). Sirve para arrancar una escuela sin cargar ficha por ficha.
- **Plantillas**: Excel `.xlsx` con dos hojas (`docentes`, `alumnos-familias`) más una hoja de instrucciones, o dos CSV (separados por `;`, con BOM para que Excel en español abra bien las tildes). Se generan en el navegador.
  - *docentes*: `nombre`, `email` (obligatorios), `rol` (grado o función), `admin` (sí/no; vacío = no cambia).
  - *alumnos-familias*: `nombre` (solo nombre de pila), `grado` (obligatorios), `docentes` (emails separados por coma: docentes de la escuela o de la hoja de docentes) y `contacto1_nombre/vinculo/email/telefono` … hasta 6 contactos.
- **Lectura**: el navegador lee el XLSX con SheetJS (`web/vendor/xlsx.mini.min.js` 0.20.3, Apache-2.0, copiado en el repo y cargado con SRI solo al usarlo) y manda las filas como JSON. Los CSV se mandan como texto y los lee el servidor: separador `;`, `,` o tab, comillas, BOM, UTF-8 (o Windows-1252 si Excel lo guardó así). Encabezados sin importar tildes/mayúsculas; columnas que no son de la plantilla se ignoran con aviso.
- **1. Vista previa** (`POST /api/fichas` `accion=importar_previa`): valida cada fila contra la base y devuelve su estado (**nuevo / actualiza / duplicado / error**) con mensajes en castellano (email inválido, docente inexistente, alumno duplicado en la escuela, campos obligatorios, nombre con apellido, contactos inválidos, docente de otra escuela, filas vacías ignoradas…). No escribe nada ni manda mails.
- **2. Confirmar** (`accion=importar_confirmar`): vuelve a validar (no confía en la vista previa) y pide la `huella` de la vista previa (si la planilla cambió, hay que previsualizar de nuevo). **Todo o nada**: si hay alguna fila con error no se importa nada (409), salvo que se marque *importar solo las filas válidas* (`omitir_errores`). Se escribe en **una sola transacción** (Neon: transacción HTTP no interactiva; sentencias por lote con `jsonb_to_recordset`).
- **Idempotente**: la docente se reconoce por email y el alumno por nombre (+ grado) dentro de la escuela. Reimportar la misma planilla no duplica nada ni reenvía mails. Los contactos se **fusionan** con los de la ficha (por email, o por nombre si el de la ficha no tenía email; una celda vacía no borra nada) y las asignaciones a docentes se **suman** (`alumno_docentes`), nunca se quitan. Un alumno con el mismo nombre en otro grado es error (*alumno duplicado en la escuela*: se pide una inicial). Docentes nuevas quedan activas, sin contraseña (entran con código), en la escuela de quien importa; una docente activa de otra escuela es error; nadie se puede quitar su propio admin por planilla.
- **Mails solo después de confirmar**: bienvenida (*"Ya tenés acceso a Puente"*) a docentes nuevas o reactivadas (máx. 1 cada 24 h por email) e invitación a cada email nuevo de familia con el helper de invitaciones (1 cada 24 h por email + alumno). Van de a 20 por pedido (con pausa entre envíos para el límite de Resend); el resto vuelve como `pendientes` y el panel los manda con `accion=importar_enviar`. Un mail que falla no deshace nada: se informa cuántos salieron y cuántos fallaron, y las invitaciones se pueden reenviar desde la ficha.
- **Límites**: hasta 500 filas (docentes + alumnos) y 2 MB por importación; 30 vistas previas cada 10 min, 10 confirmaciones por hora y 120 tandas de envío por hora por docente. Solo JSON; todo lo que viene de la planilla se escapa en el panel y en los mails.
- **Plataforma**: importa en su escuela o elige otra en el selector (`escuela_id`). Una admin de escuela solo en la suya (403 si pide otra).
- Columnas nuevas (migración automática): `alumnos.grado` y `docentes.rol`.

**SSO más adelante**: `api/_lib/identidad.js` separa *probar que la persona controla un email* (el proveedor: hoy `_lib/codigos.js`) de *qué cuenta de Puente le toca* (`cuentaPara` / `entrar`, con las reglas de docente activa y familia vinculada). Un proveedor SSO (Google Workspace, Microsoft, OIDC) solo tiene que conseguir un email verificado, llamar a `entrar(res, "docente", email, "sso:google")` y sumarse en `metodos()` (que `/login.html` recibe en `GET /api/auth`).

**Modo demo**: si no hay `DATABASE_URL` (ni `POSTGRES_URL`), todo sigue como antes: PIN de docente y link privado por alumno. Así producción no se rompe hasta conectar la base. Con base conectada, el PIN solo sirve para crear la primera cuenta y los links viejos (`familia.html?t=…`) mandan al login.

**Migración desde contraseñas**: las tablas se actualizan solas (`pass_hash` pasa a ser opcional y queda sin uso; `codigos` suma la columna `tipo`; se crean `solicitudes` y `chat_turnos`). Las docentes que ya existían entran igual, con su email y código. Las sesiones abiertas siguen valiendo. `login_docente` y `cambiar_password` responden 410.

### 🏫 Ficha de escuela y Padrón Oficial
- **Buscar la escuela**: en el panel de la plataforma (*Dar de alta una escuela*), en *Solicitar acceso* (si se reabre) y en la ficha de la escuela hay un buscador (el alta inicial ya no lo tiene) (desde 3 letras, 300 ms después de la última tecla, navegable con flechas/Enter/Escape) contra nuestra propia API `GET /api/escuelas?q=`. Encuentra por nombre, número (*"escuela 2085"*, *"2085"*), CUE o localidad, sin importar tildes ni mayúsculas; devuelve hasta 10 y pone primero el número exacto y las escuelas con **Educación Especial**. Si la escuela no aparece, se escribe el nombre a mano.
- **Quién puede buscar**: docentes con sesión (120 búsquedas cada 10 min) y los dos formularios públicos del login, con un token firmado que entrega `GET /api/auth` a quien no tiene sesión (vence a las 2 h; 40 búsquedas cada 10 min y 300 por día por IP). Desde el formulario público solo se devuelve lo necesario para elegir (sin teléfono ni email).
- **Ficha de escuela** (*Panel → Escuela*, solo docentes admin de esa escuela): CUE + anexo, nombre, domicilio, localidad, departamento, modalidad y niveles, contacto institucional (email, teléfono), directivo responsable (nombre, email), responsable del tratamiento de datos (nombre y cargo, email), aval firmado (sí/no, fecha, quién lo firmó) y notas. Elegir la escuela del padrón completa los datos institucionales. Un CUE solo puede estar en una escuela de Puente.
- **Alta y solicitudes con CUE**: la plataforma da de alta la escuela desde el padrón (o al crear el link del directivo con el CUE) y queda con esos datos. La seño que pide acceso y elige su escuela deja guardado el CUE; al aprobar, por defecto entra en la escuela de Puente con ese CUE, o se crea desde el padrón (y entonces queda como admin). La admin siempre puede elegir otra escuela.
- **Datos**: `web/data/escuelas-santa-fe.json` (≈1,1 MB, 5044 establecimientos activos de Santa Fe, 154 con Educación Especial) se genera con `cd web && npm run padron` (baja el XLSX oficial; también acepta un archivo: `npm run padron -- padron.xlsx`). Solo datos institucionales públicos: CUE + anexo, nombre, número, domicilio, localidad, departamento, código postal, teléfono y email institucional, sector, ámbito y ofertas (común/especial/adultos/hospitalaria por nivel). El padrón no trae coordenadas. Se carga en la tabla `padron_escuelas` sola en la primera búsqueda (o con `npm run migrar`), por lotes e idempotente; si el archivo cambia de fecha se actualiza y se sacan las escuelas que ya no figuran. Usa `pg_trgm` si la base lo tiene (Neon sí); si no, busca igual con texto normalizado.
- **Fuente y atribución**: [Padrón Oficial de Establecimientos Educativos](https://www.argentina.gob.ar/educacion/evaluacion-e-informacion-educativa/padron-oficial-de-establecimientos-educativos), Ministerio de Educación de la Nación (Dirección de Información Educativa), archivo actualizado el **07/09/2026**. También publicado en [datos.gob.ar](https://datos.gob.ar) bajo licencia CC BY 4.0. Para actualizar: cambiar `PADRON_URL` (o pasar la nueva URL) y correr `npm run padron`. No se usa Nominatim (su política no permite autocompletar).

### 🔒 Piloto cerrado: links de invitación y cupos
Decisión del 1/11/2026: el piloto queda abierto a **15 usuarios en total** (seños, directivos y familias juntos) y **se entra solo con link de invitación**.
- **Modo solo invitación** (`PILOTO_SOLO_INVITACION`, por defecto `1` cuando hay base): `login.html` oculta *Solicitar acceso* y `POST /api/solicitudes accion=crear` responde 403. El alta de la primera cuenta (*Primera vez en Puente*, `setup`) sigue funcionando. Con `0` vuelve el formulario abierto.
- **Link para una seño** (*Panel → Invitaciones*, admins de escuela y plataforma; `POST /api/docentes accion=invitacion_crear`): la admin de escuela solo para la suya; la plataforma para cualquier escuela (`escuela_id`, o `cue` del padrón). Opcional: *para quién* (etiqueta) y *es directivo/a* (queda admin). Por defecto **un solo uso** y **vence a los 7 días** (`dias` 1–30, `usos` 1–15 por API). Se puede **copiar**, **compartir por WhatsApp** (`wa.me` con el mensaje armado) y **anular** (`accion=invitacion_revocar`). La lista (`GET /api/docentes?invitaciones=1`) muestra estado: pendiente, usado, vencido, anulado.
- **Link para la familia** (ficha del alumno → *Link de invitación para la familia*; `POST /api/fichas accion=link_familia`, `accion=link_revocar`): lo crea cualquier docente que ve a ese alumno; siempre de un solo uso, ligado al alumno. Al usarlo, el email se suma a los *Contactos* de la ficha (con el nombre y vínculo que se cargaron) y la familia entra a su espacio, donde da el consentimiento como siempre. La invitación por mail desde la ficha sigue igual.
- **Usar el link**: `login.html#invitacion=<token>` (el token va en el fragmento: no llega al servidor por la URL y la página lo saca de la barra). La persona pone su nombre (seño) y su email, recibe el **código de 6 números de siempre** y queda con la cuenta **creada y aprobada** en esa escuela (o vinculada al alumno) y con sesión. API: `POST /api/auth` `accion=invitacion_info | invitacion_pedir_codigo | invitacion_verificar` (token en el cuerpo). El código queda atado a ese link (no sirve para otro link ni para el login normal); mismos límites que el login. Un email que ya es docente activa (o ya es familia de ese alumno) no usa el link: se le pide entrar normal.
- **Seguridad**: token de 192 bits; en la tabla `enlaces` se guarda **solo su hash** (SHA-256); el link completo se ve una sola vez, al crearlo. Usar el link es atómico (una sola sentencia verifica que siga pendiente y que quede cupo). Auditoría: `invitacion_creada`, `invitacion_usada` (con la cuenta creada) e `invitacion_revocada`, con quién lo hizo.
- **Tope de cupos** (`PILOTO_MAX_USUARIOS`, por defecto 15; `0` = sin tope): cuentan las **docentes activas** (incluye directivos/admins de escuela) de escuelas activas y las **familias vinculadas** a algún alumno de una escuela activa; **no** cuenta la cuenta de `ADMIN_EMAIL` (si no está definida, no cuentan las cuentas de plataforma). Al llegar al tope no se puede crear un link, ni usar uno pendiente, ni sumar emails nuevos de familia a una ficha (crear/guardar), ni aprobar una solicitud, ni sumar una docente a mano, ni importar por encima del tope: responde 409 con *"El piloto está completo: X de 15 cupos usados…"*. Una familia que ya tiene cuenta se puede sumar a otro alumno sin ocupar otro cupo. El panel muestra *"X de 15 cupos usados"* (pestañas *Invitaciones* y *Docentes*). **Dar de baja** (o desactivar) una cuenta libera su cupo.
- **Importación masiva**: la vista previa calcula cuántas cuentas nuevas suma (docentes nuevas o reactivadas + emails de familia sin cuenta, en filas válidas) en `resumen.cupos` y, si pasa el tope, lo muestra como error; confirmar responde 409 y no escribe nada (también con *importar solo las filas válidas*).
- Código: `api/_lib/enlaces.js` (links), `api/_lib/piloto.js` (modo y cupos), tabla `enlaces`. Sin funciones nuevas (siguen 11). Tests: `test/piloto-invitaciones.test.js`.

### 🛡️ Piloto: bajas, retención, auditoría, feedback y legales
- **Baja de un alumno** (*Borrar alumno* en la ficha; admins de su escuela, la plataforma en cualquiera): en una transacción se borran ficha, asignaciones, invitaciones, historial de chat y vínculos; después, las cuentas de familia que no tengan otro alumno (con sus sesiones, códigos e invitaciones) y los días en Vercel Blob (se verifica con `head` que ya no estén; si falla, se avisa en pantalla y en los logs). Queda en la auditoría como `baja_alumno` con contadores, sin nombres.
- **Baja de una familia**: la familia, desde su espacio (*Pedir la baja y borrar mis datos*, `accion=baja`), o una admin desde el contacto de la ficha (*dar de baja a esta familia*, `accion=baja_familia`, en los alumnos de su escuela). Se saca su contacto de las fichas, se retira su consentimiento, se borra su chat, vínculos, sesiones y códigos, y la cuenta si no le queda otro alumno. Si la docente saca un email de la ficha y esa familia queda sin alumnos, la cuenta también se borra.
- **Derecho de acceso**: la familia descarga sus datos en JSON (*Descargar mis datos*, `GET /api/fichas?exportar=1`); la docente puede exportar una ficha (`?id=&exportar=1`). Las dos quedan en la auditoría.
- **Retención** (`api/_lib/retencion.js`, todo configurable): chat 30 días, días publicados 365 (se filtran al leer y al publicar), auditoría y comentarios 365, fichas inactivas 730 (solo se cuentan para revisar, nunca se borran solas). Limpieza perezosa en pedidos normales y un **cron diario** (`web/vercel.json`, 07:30 UTC) que llama a `/api/auditoria?accion=limpieza` con `Authorization: Bearer CRON_SECRET`.
- **Registro de accesos** (tabla `auditoria`): `login_ok`, `login_fallido`, `ficha_ver`, `fichas_listar`, `ficha_editar`, `exportacion`, `baja_alumno`, `baja_familia`, `feedback`, `alerta_fallos`, `invitacion_creada`, `invitacion_usada`, `invitacion_revocada`. Email como HMAC (con `SESSION_SECRET`), IP truncada (/24 o /48), ids y contadores. Pestaña *Panel → Registro* (admins: su escuela; plataforma: todo). Con `AUDITORIA_ALERTA_FALLOS` (5) códigos incorrectos para una cuenta en 30 min, llega un mail a la plataforma con el email enmascarado (máx. 1 por hora por cuenta).
- **Enviar comentario**: en el pie de las páginas con sesión (docentes y familias). Se guarda en `feedback` y avisa por mail a la plataforma (como mucho 1 mail cada 10 min por cuenta; 3 comentarios cada 10 min y 10 por día). La plataforma los ve en *Panel → Registro*.
- **Legales y aviso**: `privacidad.html` y `terminos.html` (**borrador, pendiente de revisión legal**, contacto `soporte@puentepictos.app`). Pie común (`web/pie.js`) en todas las páginas: aviso **BETA**, links legales y crédito ARASAAC completo. El consentimiento de la familia linkea a la política y guarda la versión aceptada (`api/_lib/legal.js`: cambiar `VERSION_PRIVACIDAD` cada vez que cambie el texto).
- **Donaciones** («Apoyá Puente»): dos botones de texto en el pie (no en el espacio de la familia, ni en el login cuando está en «Soy familia», ni en el chat; nunca como pedido a las familias): **Doná desde Argentina** (`DONACIONES_AR_URL`) y **Donate from abroad** (`DONACIONES_INTL_URL`, con la línea en inglés al lado), con la línea *"Puente es gratuito y sin fines de lucro. Las donaciones cubren servidores e IA."*. Los links salen de `GET /api/config` (solo `https://`); cada botón aparece solo si su variable tiene valor, y si están las dos vacías no se muestra nada. El repo además tiene `.github/FUNDING.yml` (GitHub Sponsors).
- **Funciones**: con `auditoria.js`, `config.js` y `feedback.js` el proyecto tiene 11 funciones (`web/api/*.js`); el plan Hobby de Vercel admite hasta 12.

### Puesta en marcha en Vercel
1. **Base**: Vercel → Storage → *Create Database* → **Neon** (Marketplace) → conectarla al proyecto. Eso crea `DATABASE_URL` (o `POSTGRES_URL`; sirven las dos). Las tablas se crean solas en el primer pedido (`CREATE TABLE IF NOT EXISTS`); también se puede correr a mano: `cd web && DATABASE_URL=... npm run migrar`.
2. **Variables** (Settings → Environment Variables):

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `DATABASE_URL` / `POSTGRES_URL` | Postgres de Neon. Sin esto: modo demo | Sí, para cuentas |
| `SESSION_SECRET` | Firma las cookies de sesión y los códigos. 32+ caracteres al azar (`openssl rand -base64 32`) | Sí en producción (sin esto da error) |
| `DOCENTE_PIN` | Protege la creación de la primera docente (y el modo demo) | Sí en producción para el alta inicial |
| `ADMIN_EMAIL` | Cuenta de la **plataforma** (superadmin, única que entra a `admin.html`). La primera cuenta solo se puede crear con ese email (sin ella, el alta inicial no anda). Recibe los avisos de solicitudes y comentarios | **Sí** |
| `RESEND_API_KEY` | Envía los códigos de ingreso (docentes y familias), los avisos de solicitudes y las invitaciones a familias ([resend.com](https://resend.com)) | Sí en producción |
| `RESEND_FROM` | Remitente, ej. `Puente <hola@tudominio.com>` (dominio verificado en Resend) | Recomendada (por defecto `onboarding@resend.dev`, que solo manda a tu propio email) |
| `PUENTE_URL` | Base de los links en los mails, ej. `https://puentepictos.app` (con dominio propio: `https://puentepictos.app`). También es el Referer que se manda a OpenRouter. Si falta se usa el dominio de producción de Vercel (o la URL de la rama en *preview*) | Opcional |
| `CRON_SECRET` | Protege la limpieza diaria (`/api/auditoria?accion=limpieza`, la llama el cron de `vercel.json`). 16+ caracteres al azar (`openssl rand -base64 32`). Sin esto el cron responde 401 y solo queda la limpieza perezosa | Recomendada |
| `CHAT_RETENCION_DIAS` | Días que se guarda el historial del chat de la familia | Opcional (30) |
| `DIAS_PUBLICADOS_RETENCION` | Días publicados que ve la familia (los más viejos se ocultan y se sacan al volver a publicar) | Opcional (365) |
| `FICHAS_RETENCION_DIAS` | Días sin cambios ni publicaciones para contar una ficha como inactiva (solo se informa en la limpieza, no se borra) | Opcional (730) |
| `AUDITORIA_RETENCION_DIAS` | Días que se guarda el registro de accesos | Opcional (365) |
| `FEEDBACK_RETENCION_DIAS` | Días que se guardan los comentarios | Opcional (365) |
| `AUDITORIA_ALERTA_FALLOS` | Códigos incorrectos en 30 min para una cuenta que disparan el mail de alerta a la plataforma | Opcional (5) |
| `PILOTO_SOLO_INVITACION` | `1`: piloto cerrado, sin *Solicitar acceso* (se oculta en el login y el servidor lo bloquea); se entra solo con link de invitación. `0`: formulario abierto como antes. El alta de la primera cuenta funciona igual | Opcional (`1` cuando hay base) |
| `PILOTO_MAX_USUARIOS` | Tope de cuentas activas del piloto (docentes, directivos y familias; no cuenta `ADMIN_EMAIL`). `0` = sin tope | Opcional (15) |
| `DONACIONES_AR_URL` | Link del botón «Doná desde Argentina» (ej. Cafecito). Vacía = no se muestra | Opcional |
| `DONACIONES_INTL_URL` | Link del botón «Donate from abroad» (ej. GitHub Sponsors). Vacía = no se muestra | Opcional |

   Sin `RESEND_API_KEY`: en local el código aparece en pantalla; en *preview* solo en los logs de Vercel; en producción se muestra un error claro. Los avisos (solicitudes, acceso aprobado) sin Resend van a los logs y no frenan nada.
   **Dominio propio** (cuando esté comprado; ej. `puentepictos.app`). Cambian dos variables y se redeploya:
   - `PUENTE_URL` = `https://puentepictos.app` (links de los mails y Referer de OpenRouter).
   - `RESEND_FROM` = `Puente <hola@puentepictos.app>` (solo cuando el dominio esté **verificado** en Resend; antes, los mails fallan).
   - *Vercel*: proyecto `mi-dia-en-pictos` → Settings → Domains → *Add* `puentepictos.app` (y `www.puentepictos.app`, con redirección a uno de los dos). Cargar en el DNS del registrador los registros que muestra Vercel (normalmente un `A` para el dominio raíz y un `CNAME` para `www`, o delegar los nameservers a Vercel). Esperar *Valid Configuration*; el certificado HTTPS es automático. `puente-pictos.vercel.app` sigue andando.
   - *Resend*: Domains → *Add Domain* → `puentepictos.app` (o un subdominio como `mail.puentepictos.app`) → región. Cargar en el DNS los registros que muestra: `MX` y `TXT` (SPF) del subdominio de envío y `TXT` de DKIM (`resend._domainkey`); recomendable un `TXT` de DMARC en `_dmarc` (ej. `v=DMARC1; p=none;`). Tocar *Verify* y esperar *Verified*. Recién ahí cambiar `RESEND_FROM`.
   - Después: actualizar a mano las etiquetas Open Graph (y el `canonical`) de `index.html` (portada) y `presentacion.html` (y el texto/QR de la última diapositiva) que hoy dicen `puente-pictos.vercel.app`, y mandarse un código de prueba.

3. **Primera cuenta (plataforma)**: abrir `/login.html`, completar *Primera vez en Puente* con el `DOCENTE_PIN` y el email de `ADMIN_EMAIL`. Se crea la cuenta de la plataforma, **sin escuela y sin contraseña**, y en el momento le llega un código a ese email para entrar. Después, en `/admin.html`, da de alta cada escuela desde el padrón y le manda el link a su directivo/a; cada directivo invita a sus docentes (ver *Alta por invitación en cascada*).
4. Cargar alumnos y fichas en `/docente.html`, con los emails de las familias. El *Cuaderno del día* (`/cuaderno.html`) publica solo al espacio de la familia.

### Probar en local
```bash
cd web && npm install
npm test           # node --test: API con base PGlite en memoria y Blob simulado
npm run local      # http://localhost:3000 con base PGlite en memoria (DEMO=1 para modo demo, DATABASE_URL=... para una base real)
```
En local, si no hay `ADMIN_EMAIL`, se usa `admin@puente.local` (alta inicial con el PIN `2026`; el código aparece en pantalla).

## Estructura
```
web/index.html  Portada pública (qué es Puente, tira de ejemplo ARASAAC, Entrar / Soy familia, meta tags para compartir)
web/cuaderno.html Cuaderno del día (PWA): pestañas Docente, Alumno, Familia y Progreso (antes era index.html)
web/admin.html  Panel de la plataforma (solo ADMIN_EMAIL): escuelas, invitaciones, cupos, solicitudes, registro y comentarios
web/            PWA (HTML + JS puro)
web/api/        Funciones de Vercel: agente.js (Agente de Progreso), dia.js (registro diario), familia.js (espacio de familias),
                auth.js (ingreso con código, alta inicial), solicitudes.js (pedidos de acceso), fichas.js (fichas de familia), docentes.js,
                escuelas.js (búsqueda en el padrón y ficha de escuela)
web/api/        (piloto) auditoria.js (registro de accesos + limpieza por cron), feedback.js (Enviar comentario), config.js (config pública: donaciones, versión legal)
web/api/_lib/   (piloto cerrado) enlaces.js (links de invitación para seños y familias), piloto.js (modo solo invitación y cupos)
web/api/_lib/   minimizar.js (qué va a la IA), bajas.js (baja y borrado), retencion.js (plazos y limpieza), auditoria.js, legal.js (versión de los textos legales)
web/api/_lib/   db.js + schema.js (Postgres/Neon), identidad.js (cuentas y proveedores de ingreso), codigos.js (código por email),
                padron.js (padrón de escuelas en Postgres y búsqueda), alumnos.js (qué alumnos ve cada docente, asignaciones),
                invitaciones.js (invitación a familias, 1 cada 24 h), importacion.js (importación masiva CSV/XLSX), seguridad.js (sesiones, límites), chat.js (chat de la familia: filtros, historial, límites), correo.js + avisos.js (Resend), almacen.js (Blob)
web/pie.js      Pie común: BETA, privacidad/términos, crédito ARASAAC, Enviar comentario y donaciones
web/privacidad.html, web/terminos.html  Textos legales (BORRADOR pendiente de revisión legal)
web/vercel.json Cron diario de limpieza
web/familia.html Vista de la familia (con sesión, o con link en modo demo)
web/login.html  Entrar con código por email (docente o familia) y *Solicitar acceso*
web/docente.html Panel docente: alumnos (con docentes a cargo e invitaciones), fichas, y para la dirección de la escuela: solicitudes,
                escuela, importar, invitaciones, registro y docentes; mi cuenta (lo de plataforma está en admin.html)
web/importar.js Pestaña Importar: plantillas, lectura de CSV/XLSX, vista previa y confirmación
web/vendor/     SheetJS (xlsx.mini 0.20.3, Apache-2.0) para leer y armar planillas Excel en el navegador
web/escuelas.js Buscador de escuelas accesible (combobox) que usan login.html y docente.html
web/data/       escuelas-santa-fe.json: Padrón Oficial filtrado (lo genera web/scripts/padron.js)
web/test/       Tests (node --test)
web/seed.js     3 semanas de datos ficticios para la demo
prompts/        Prompt de registro diario e informe mensual
data/           Relato de ejemplo para la demo
```

## Publicar en Vercel
Importar el repo en Vercel y elegir `web` como *Root Directory* (sin build, es estático).

## Correr la demo
```bash
cd web && python3 -m http.server 8080
# abrir http://localhost:8080 (portada) y http://localhost:8080/cuaderno.html (Cuaderno del día)
```
- Sin configurar nada funciona en **modo demo** (sin IA, busca pictos igual).


## Guion de la demo (3 min)
1. Problema (30 s).
2. Docente dicta el relato de ejemplo en vivo (30 s).
3. Pestaña Alumno: pictos grandes, se tocan y hablan (45 s).
4. Pestaña Familia: resumen + alerta + envío por WhatsApp (45 s).
5. Cierre: el registro queda en el legajo y el informe mensual sale solo (30 s).

## Próximos pasos
- Agenda anticipada del día siguiente (rutina con pictos antes de llegar).
- Perfil por alumno (vocabulario, sensibilidades, apoyos).
- Informe mensual automático (prompt en `prompts/informe-mensual.md`).
- Envío directo por WhatsApp Cloud API.
- Pasar también los días de Blob a Postgres.
- SSO para docentes (Google Workspace / Microsoft) sobre `_lib/identidad.js`.
- Reasignar una docente a otra escuela desde la plataforma (hoy: desactivar y volver a aprobar).

## Privacidad
Datos de menores: solo nombre de pila, sin fotos ni diagnósticos, consentimiento de la familia registrado en la ficha (con la versión de la política aceptada). Con cuentas, cada API exige sesión y verifica que el alumno sea de la escuela de la admin, esté asignado a la docente o esté vinculado a la familia. IA sin retención y con datos mínimos, baja y borrado completos, retención con plazos, registro de accesos: ver *Piloto* arriba y `privacidad.html`.

## Créditos
Escuelas: Padrón Oficial de Establecimientos Educativos, Ministerio de Educación de la Nación (actualización 07/09/2026; CC BY 4.0 en datos.gob.ar).
Autor pictogramas: Sergio Palao. Origen: ARASAAC (http://www.arasaac.org). Licencia: CC BY-NC-SA. Propiedad: Gobierno de Aragón (España).

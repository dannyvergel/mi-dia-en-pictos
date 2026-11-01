# 🌉 Puente

**De la escuela a casa, en pictogramas.** Demo: https://puente-pictos.vercel.app

**La docente cuenta el día en 20 segundos. El chico lo ve en pictogramas. La familia recibe un resumen claro. Y el registro queda guardado solo.**

App para escuelas de educación especial: niños con TEA, discapacidad intelectual o necesidades de comunicación.

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
- **Solicitar acceso**: una seño nueva toca *Solicitar acceso* en el login (nombre, email, escuela, *Soy director/a*, rol/grado y mensaje opcionales). Queda **pendiente** y se rutea (ver *Roles* abajo): a las admins de su escuela o a la plataforma, con un mail con el link a `docente.html#solicitudes`. Ahí se **aprueba** o se **rechaza** (con un mail amable opcional). Al aprobar se crea (o se reactiva) la cuenta y le llega *"Ya tenés acceso a Puente"* con el link al login.
  - Protecciones del formulario público: solo JSON, campo trampa oculto para bots (se responde igual y no se guarda), 5 pedidos por IP por hora y 3 por email por día, respuesta siempre genérica (*"Recibimos tu pedido, te avisamos por mail"*) aunque el email ya tenga cuenta o ya haya pedido (si ya hay una pendiente se actualiza, sin volver a avisar). Todo lo que escribe la persona se escapa en los mails y en el panel.
- **Familias**: el mismo código por email. Pueden entrar los emails que la docente cargó en *Contactos* de la ficha; si un email se borra de la ficha, pierde el acceso. Un código pedido como docente no sirve como familia, ni al revés.
- **Invitación a la familia**: cuando la docente suma un email en *Contactos* (al crear o editar la ficha), le llega por Resend *"<docente> te sumó a Puente para seguir el día de <nombre>"*, con el botón a `login.html?familia&email=…` (pestaña familia y email ya escritos) y la explicación del ingreso por código y del consentimiento. Máximo **una por email + alumno cada 24 h** (tabla `invitaciones`); en la ficha se ve cuándo se mandó y está el botón **reenviar invitación** (responde que espere si fue hace menos de 24 h). Todo lo que escribió una persona va escapado. Si el mail falla, la ficha se guarda igual y la docente ve el aviso para reenviar.
- **Ficha de familia** (una por alumno): nombre de pila, contactos (nombre, vínculo, email, teléfono/WhatsApp), apoyos y sensibilidades (comunicación, sensoriales, qué lo calma, alimentación, qué le gusta, otros), objetivos del PPI (los usa el Agente de Progreso) y consentimiento (quién y cuándo). La familia la ve en su espacio, puede dar o retirar el consentimiento y actualizar su propio teléfono.
- **Privacidad**: solo nombre de pila, sin fotos, sin campo de diagnóstico. Cada API verifica la sesión: una admin de escuela ve los alumnos de su escuela; una docente, solo los que tiene asignados; una familia, solo los alumnos vinculados a su email (de escuelas activas).
- Los **días** siguen en Vercel Blob (uno por alumno); la base guarda cuentas, fichas, vínculos y solicitudes.

### 👥 Roles
```
Plataforma (ADMIN_EMAIL y quien ella promueva)
  └─ aprueba directoras / escuelas nuevas, ve todas las escuelas y puede desactivarlas
     Admin de escuela (directora o quien ella haga admin)
       └─ aprueba e invita a las docentes de SU escuela, ve y asigna todos sus alumnos
          Docente
            └─ ve solo los alumnos que tiene asignados, carga contactos de familias
               Familia (invitada por mail) → entra con código, da su consentimiento
```
- **Plataforma** (`docentes.es_plataforma`; la cuenta de `ADMIN_EMAIL` siempre lo es, y la primera cuenta del alta inicial también). Desde *Panel → Docentes* puede promover a otra cuenta (*hacer plataforma*). Ve **todas** las solicitudes y la pestaña **Escuelas**: nombre, CUE, cantidad de docentes (y admins) y alumnos, aval sí/no, y **desactivar/reactivar** cada escuela. Una escuela desactivada no entra: se cortan las sesiones de sus docentes, sus docentes y familias no reciben código y sus pedidos nuevos van a la plataforma.
- **Ruteo de solicitudes**: si la seño elige del padrón una escuela que **ya está en Puente** (mismo CUE), activa y con al menos una admin, el pedido va **solo a las admins de esa escuela** (el mail también). Si la escuela no está en Puente, no tiene admins, no eligió del padrón, o marcó **Soy director/a**, va a la **plataforma**. Al aprobar una directora o una escuela nueva, la plataforma crea la escuela desde el padrón (si hace falta) y la deja **admin**.
- **Admin de escuela**: ve solo los pedidos de su escuela y aprueba solo en su escuela (no puede elegir otra ni crear escuelas). Suma docentes desde *Docentes*, ve **todos** los alumnos de su escuela y les asigna docentes.
- **Docente**: ve y edita solo los **alumnos asignados** (tabla `alumno_docentes`): ficha, *Cuaderno del día* (`/api/dia`), Agente de Progreso, publicar para la familia y la vista previa del chat. Quien crea un alumno queda asignada. Una docente asignada puede sumar a otra de su escuela (maestra integradora, terapeuta…; puede haber varias); quitar a otra solo lo hace una admin, y cada una se puede quitar a sí misma.
- **Migración**: se aplica sola. Columnas nuevas idempotentes (`es_plataforma`, `escuelas.activa`, `solicitudes.destino/escuela_id/es_director`) y, **una sola vez** (tabla `migraciones`), cada alumno que ya existía sin asignaciones queda asignado a todas las docentes activas de su escuela, así nadie deja de ver lo que veía. Las solicitudes pendientes de antes quedan para la plataforma.

**SSO más adelante**: `api/_lib/identidad.js` separa *probar que la persona controla un email* (el proveedor: hoy `_lib/codigos.js`) de *qué cuenta de Puente le toca* (`cuentaPara` / `entrar`, con las reglas de docente activa y familia vinculada). Un proveedor SSO (Google Workspace, Microsoft, OIDC) solo tiene que conseguir un email verificado, llamar a `entrar(res, "docente", email, "sso:google")` y sumarse en `metodos()` (que `/login.html` recibe en `GET /api/auth`).

**Modo demo**: si no hay `DATABASE_URL` (ni `POSTGRES_URL`), todo sigue como antes: PIN de docente y link privado por alumno. Así producción no se rompe hasta conectar la base. Con base conectada, el PIN solo sirve para crear la primera cuenta y los links viejos (`familia.html?t=…`) mandan al login.

**Migración desde contraseñas**: las tablas se actualizan solas (`pass_hash` pasa a ser opcional y queda sin uso; `codigos` suma la columna `tipo`; se crean `solicitudes` y `chat_turnos`). Las docentes que ya existían entran igual, con su email y código. Las sesiones abiertas siguen valiendo. `login_docente` y `cambiar_password` responden 410.

### 🏫 Ficha de escuela y Padrón Oficial
- **Buscar la escuela**: en *Primera vez en Puente*, en *Solicitar acceso* y en la ficha de la escuela hay un buscador (desde 3 letras, 300 ms después de la última tecla, navegable con flechas/Enter/Escape) contra nuestra propia API `GET /api/escuelas?q=`. Encuentra por nombre, número (*"escuela 2085"*, *"2085"*), CUE o localidad, sin importar tildes ni mayúsculas; devuelve hasta 10 y pone primero el número exacto y las escuelas con **Educación Especial**. Si la escuela no aparece, se escribe el nombre a mano.
- **Quién puede buscar**: docentes con sesión (120 búsquedas cada 10 min) y los dos formularios públicos del login, con un token firmado que entrega `GET /api/auth` a quien no tiene sesión (vence a las 2 h; 40 búsquedas cada 10 min y 300 por día por IP). Desde el formulario público solo se devuelve lo necesario para elegir (sin teléfono ni email).
- **Ficha de escuela** (*Panel → Escuela*, solo docentes admin de esa escuela): CUE + anexo, nombre, domicilio, localidad, departamento, modalidad y niveles, contacto institucional (email, teléfono), directivo responsable (nombre, email), responsable del tratamiento de datos (nombre y cargo, email), aval firmado (sí/no, fecha, quién lo firmó) y notas. Elegir la escuela del padrón completa los datos institucionales. Un CUE solo puede estar en una escuela de Puente.
- **Alta y solicitudes con CUE**: la primera docente que elige su escuela del padrón crea la escuela con esos datos. La seño que pide acceso y elige su escuela deja guardado el CUE; al aprobar, por defecto entra en la escuela de Puente con ese CUE, o se crea desde el padrón (y entonces queda como admin). La admin siempre puede elegir otra escuela.
- **Datos**: `web/data/escuelas-santa-fe.json` (≈1,1 MB, 5044 establecimientos activos de Santa Fe, 154 con Educación Especial) se genera con `cd web && npm run padron` (baja el XLSX oficial; también acepta un archivo: `npm run padron -- padron.xlsx`). Solo datos institucionales públicos: CUE + anexo, nombre, número, domicilio, localidad, departamento, código postal, teléfono y email institucional, sector, ámbito y ofertas (común/especial/adultos/hospitalaria por nivel). El padrón no trae coordenadas. Se carga en la tabla `padron_escuelas` sola en la primera búsqueda (o con `npm run migrar`), por lotes e idempotente; si el archivo cambia de fecha se actualiza y se sacan las escuelas que ya no figuran. Usa `pg_trgm` si la base lo tiene (Neon sí); si no, busca igual con texto normalizado.
- **Fuente y atribución**: [Padrón Oficial de Establecimientos Educativos](https://www.argentina.gob.ar/educacion/evaluacion-e-informacion-educativa/padron-oficial-de-establecimientos-educativos), Ministerio de Educación de la Nación (Dirección de Información Educativa), archivo actualizado el **07/09/2026**. También publicado en [datos.gob.ar](https://datos.gob.ar) bajo licencia CC BY 4.0. Para actualizar: cambiar `PADRON_URL` (o pasar la nueva URL) y correr `npm run padron`. No se usa Nominatim (su política no permite autocompletar).

### Puesta en marcha en Vercel
1. **Base**: Vercel → Storage → *Create Database* → **Neon** (Marketplace) → conectarla al proyecto. Eso crea `DATABASE_URL` (o `POSTGRES_URL`; sirven las dos). Las tablas se crean solas en el primer pedido (`CREATE TABLE IF NOT EXISTS`); también se puede correr a mano: `cd web && DATABASE_URL=... npm run migrar`.
2. **Variables** (Settings → Environment Variables):

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `DATABASE_URL` / `POSTGRES_URL` | Postgres de Neon. Sin esto: modo demo | Sí, para cuentas |
| `SESSION_SECRET` | Firma las cookies de sesión y los códigos. 32+ caracteres al azar (`openssl rand -base64 32`) | Sí en producción (sin esto da error) |
| `DOCENTE_PIN` | Protege la creación de la primera docente (y el modo demo) | Sí en producción para el alta inicial |
| `ADMIN_EMAIL` | Cuenta de la **plataforma** (superadmin). Si está, la primera cuenta solo se puede crear con ese email. Recibe los avisos de solicitudes de escuelas nuevas y de directoras | Recomendada |
| `RESEND_API_KEY` | Envía los códigos de ingreso (docentes y familias), los avisos de solicitudes y las invitaciones a familias ([resend.com](https://resend.com)) | Sí en producción |
| `RESEND_FROM` | Remitente, ej. `Puente <hola@tudominio.com>` (dominio verificado en Resend) | Recomendada (por defecto `onboarding@resend.dev`, que solo manda a tu propio email) |
| `PUENTE_URL` | Base de los links en los mails, ej. `https://puente-pictos.vercel.app`. Si falta se usa el dominio de producción de Vercel (o la URL de la rama en *preview*) | Opcional |

   Sin `RESEND_API_KEY`: en local el código aparece en pantalla; en *preview* solo en los logs de Vercel; en producción se muestra un error claro. Los avisos (solicitudes, acceso aprobado) sin Resend van a los logs y no frenan nada.
3. **Primera cuenta (plataforma)**: abrir `/login.html`, completar *Primera vez en Puente* con el `DOCENTE_PIN` (y el email de `ADMIN_EMAIL` si está). Se crea la cuenta admin de su escuela y de la plataforma, **sin contraseña**, y en el momento le llega un código a ese email para entrar. Después aprueba a las directoras en *Panel → Solicitudes*, y cada directora suma a sus docentes.
4. Cargar alumnos y fichas en `/docente.html`, con los emails de las familias. El *Cuaderno del día* (`/`) publica solo al espacio de la familia.

### Probar en local
```bash
cd web && npm install
npm test           # node --test: API con base PGlite en memoria y Blob simulado
npm run local      # http://localhost:3000 con base PGlite en memoria (DEMO=1 para modo demo, DATABASE_URL=... para una base real)
```

## Estructura
```
web/            PWA (HTML + JS puro): pestañas Docente, Alumno, Familia y Progreso
web/api/        Funciones de Vercel: agente.js (Agente de Progreso), dia.js (registro diario), familia.js (espacio de familias),
                auth.js (ingreso con código, alta inicial), solicitudes.js (pedidos de acceso), fichas.js (fichas de familia), docentes.js,
                escuelas.js (búsqueda en el padrón y ficha de escuela)
web/api/_lib/   db.js + schema.js (Postgres/Neon), identidad.js (cuentas y proveedores de ingreso), codigos.js (código por email),
                padron.js (padrón de escuelas en Postgres y búsqueda), alumnos.js (qué alumnos ve cada docente, asignaciones),
                invitaciones.js (invitación a familias, 1 cada 24 h), seguridad.js (sesiones, límites), chat.js (chat de la familia: filtros, historial, límites), correo.js + avisos.js (Resend), almacen.js (Blob)
web/familia.html Vista de la familia (con sesión, o con link en modo demo)
web/login.html  Entrar con código por email (docente o familia) y *Solicitar acceso*
web/docente.html Panel docente: alumnos (con docentes a cargo e invitaciones), fichas, solicitudes (admin/plataforma), escuela (admin),
                escuelas (plataforma), docentes, mi cuenta
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
# abrir http://localhost:8080
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
Datos de menores: solo nombre de pila, sin fotos ni diagnósticos, consentimiento de la familia registrado en la ficha. Con cuentas, cada API exige sesión y verifica que el alumno sea de la escuela de la admin, esté asignado a la docente o esté vinculado a la familia.

## Créditos
Escuelas: Padrón Oficial de Establecimientos Educativos, Ministerio de Educación de la Nación (actualización 07/09/2026; CC BY 4.0 en datos.gob.ar).
Pictogramas: Sergio Palao. Origen: [ARASAAC](https://arasaac.org). Licencia CC BY-NC-SA. Propiedad: Gobierno de Aragón (España).

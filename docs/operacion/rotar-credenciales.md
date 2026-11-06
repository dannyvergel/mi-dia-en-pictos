# Rotar credenciales

Cómo cambiar cada clave o token de Puente sin romper producción, y qué hacer si se filtra una.

## Antes de empezar

- **Cuándo.** Una rotación planificada se hace fuera del horario escolar (después de las 18 o el fin de semana). Entre el cambio y el redeploy, la parte que usa esa clave deja de funcionar uno o dos minutos. Si la clave se filtró, no se espera: se rota en el momento.
- **Las variables solo llegan a los deploys nuevos.** Cambiar una variable en Vercel no cambia el deploy que está andando. Siempre hay que hacer redeploy.
- **Instant Rollback trae las variables viejas.** Un deploy anterior sigue con las variables que tenía cuando se construyó. Después de rotar, no vuelvas con Instant Rollback a un deploy de antes de la rotación: tendría la clave vieja (ver [rollback.md](rollback.md)).
- **Dos proyectos en Vercel.** Producción es el proyecto `mi-dia-en-pictos` (https://puentepictos.app). La demo es `puente-demo`, que no tiene base pero comparte algunas claves (por ejemplo el token de Blob y la key de OpenRouter). Si una clave está en los dos, se cambia en los dos.
- **Nunca pegues una clave en un issue, un PR, un chat o un commit.** El repo es público.

### Cómo se cambia una variable en Vercel

1. vercel.com → proyecto `mi-dia-en-pictos` → **Settings** → **Environment Variables**.
2. Buscá la variable → menú de tres puntos → **Edit** → pegá el valor nuevo → marcá **Sensitive** si no lo estaba → **Save**.
3. Revisá en qué entornos está (Production, Preview). Cambiala en todos los que la tengan.

### Cómo se hace el redeploy

1. Proyecto → **Deployments** → el último con la etiqueta **Production** → menú de tres puntos → **Redeploy**.
2. Esperá a que diga **Ready** (suele tardar alrededor de un minuto).
3. Verificá el chequeo de salud:

```powershell
curl.exe -s -i "https://puentepictos.app/api/config?accion=salud"
```

Tiene que dar 200 y `"ok":true`. El campo `version` muestra el commit desplegado.

### Cómo generar un valor al azar en PowerShell 5.1

Para `CRON_SECRET` o `SESSION_SECRET`. Lo copia al portapapeles sin mostrarlo en pantalla:

```powershell
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b) | Set-Clipboard
Remove-Variable b
```

Después pegalo directo en Vercel.

## Resumen

| Credencial | Dónde se cambia | Variable en Vercel | Cómo se verifica |
|---|---|---|---|
| Clave de la base (Neon) | Neon → Roles → `neondb_owner` → Reset password | `DATABASE_URL` (y las demás que pone la integración) | Salud con `"db":"ok"` |
| Token de Blob | Vercel → Storage → store `puente-datos` | `BLOB_READ_WRITE_TOKEN` | Abrir un día publicado en el espacio de una familia |
| Token de API de Vercel | vercel.com → Account Settings → Tokens | Ninguna (no lo usa la app) | La herramienta que lo usa sigue funcionando |
| Clave de revisión de Play | `web/scripts/revisor-clave.js` | `REVISOR_CLAVE_HASH` | Entrar con «Acceso para revisión» |
| Secreto del cron | Lo generás vos | `CRON_SECRET` | `api/auditoria?accion=limpieza` da 200 con el secreto nuevo |
| OpenRouter | openrouter.ai → Settings → Keys | `OPENROUTER_API_KEY` | Actividad de la key nueva en OpenRouter |
| Resend | resend.com → API Keys | `RESEND_API_KEY` | Llega un código de ingreso a tu mail |

## DATABASE_URL (Neon)

La base está conectada por la integración de Neon en Vercel (Storage). La integración carga sola `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y las `PG*`. Puente usa `DATABASE_URL` (o `POSTGRES_URL` si no está).

1. Vercel → **Storage** (o **Integrations**) → la base de Neon → **Open in Neon**.
2. En Neon, elegí el proyecto y, arriba a la izquierda, la rama de producción.
3. **Roles** → `neondb_owner` → menú → **Reset password** → **Reset**. Desde este momento la clave vieja deja de andar y producción no puede leer la base hasta el redeploy.
4. Volvé a Vercel → proyecto → **Settings** → **Environment Variables** y fijate que `DATABASE_URL` diga que se actualizó recién. La integración la debería actualizar sola.
   - Si no se actualizó (hay casos reportados), copiá la cadena nueva desde Neon → **Connect** y cargala a mano. Las variables de la integración no se pueden editar: hay que borrarlas y crearlas de nuevo con el mismo nombre, como variables comunes y Sensitive.
5. Redeploy.
6. Verificá: salud con `"db":"ok"`. Después entrá a `docente.html` con tu cuenta.

Las contraseñas de los roles son por rama. Resetear la de producción no cambia la de las ramas de prueba ni la de las ramas de Preview.

## BLOB_READ_WRITE_TOKEN

Es el token del store privado `puente-datos`, donde están los días publicados y los documentos. Lo usan los dos proyectos (`mi-dia-en-pictos` y `puente-demo`).

1. Vercel → **Storage** → `puente-datos`.
2. La documentación de Vercel no describe un botón para regenerar solo este token. Lo que sí documenta es reemplazarlo por OIDC: tokens cortos que Vercel rota solo. Para eso, en la pestaña **Projects** del store, menú del proyecto → **Upgrade to OIDC**. Antes hay que confirmar que la versión de `@vercel/blob` del repo lo soporta (hoy el lockfile tiene la 2.8.2) y probarlo fuera de producción. Eso es un cambio aparte, con su propio PR.
3. Si en el panel del store aparece una opción para regenerar o revocar el token, usala. Si no, desconectar el proyecto del store y volver a conectarlo crea un token nuevo. Esto no está verificado en Puente: hacelo fuera de horario y con la salida de producción a mano.
4. Actualizá `BLOB_READ_WRITE_TOKEN` en los dos proyectos si no se actualizó sola.
5. Redeploy de los dos proyectos.
6. Verificá: abrí el espacio de una familia de prueba y fijate que cargue el último día publicado. En los logs de Vercel no tiene que haber errores de Blob.

## Token de API de Vercel

La app no lo usa. Sirve para manejar Vercel desde afuera (CLI, scripts, herramientas).

1. vercel.com → avatar → **Account Settings** → **Tokens**.
2. **Create**: nombre que diga para qué es, alcance solo el equipo del proyecto y fecha de vencimiento.
3. Reemplazalo donde lo tengas guardado.
4. Borrá el token viejo de la lista.
5. Verificá: la herramienta que lo usa sigue funcionando y el token viejo da 403.

## REVISOR_CLAVE_HASH

Es el hash de la contraseña de la cuenta de revisión de Google Play. La contraseña no se guarda en ningún lado de Puente, solo su hash.

```powershell
cd C:\dev\mi-dia-en-pictos\web   # o donde tengas el repo
$clave = Read-Host "Contraseña nueva"
$clave | node scripts\revisor-clave.js
Remove-Variable clave
```

Usá al menos 12 caracteres, solo letras sin tilde, números y guiones (el pipe de PowerShell 5.1 no respeta tildes ni eñes). El script imprime una sola línea.

1. Cargá esa línea en `REVISOR_CLAVE_HASH` (Production).
2. Redeploy.
3. Actualizá la contraseña en Play Console → **App content** → **App access**.
4. Verificá: en `login.html`, «Acceso para revisión» entra con la nueva y rechaza la vieja.

## CRON_SECRET

Protege la limpieza diaria (`/api/auditoria?accion=limpieza`). El cron de Vercel manda solo el header `Authorization: Bearer <CRON_SECRET>`, así que alcanza con cambiar la variable.

1. Generá un valor nuevo (ver arriba) y cargalo en `CRON_SECRET` (Production). Mínimo 16 caracteres.
2. Redeploy.
3. Verificá. Esto corre la limpieza de retención, que es la misma que corre todas las noches:

```powershell
$s = Read-Host "CRON_SECRET nuevo"
curl.exe -s -o NUL -w "%{http_code}" -H "Authorization: Bearer $s" "https://puentepictos.app/api/auditoria?accion=limpieza"
Remove-Variable s
```

Tiene que imprimir `200`. Con el secreto viejo, `401`. Al otro día, en los logs de Vercel tiene que aparecer `[puente] limpieza de retención` a las 4:30 de Argentina.

## OPENROUTER_API_KEY

1. openrouter.ai → **Settings** → **Keys** → **Create Key**. Ponele un límite de crédito.
2. Cargala en `OPENROUTER_API_KEY` en `mi-dia-en-pictos` y en `puente-demo`.
3. Redeploy de los dos.
4. Borrá la key vieja en OpenRouter.
5. Verificá: usá la IA en la demo (https://puente-pictos-demo.vercel.app, cargar un día) y fijate en openrouter.ai → **Activity** que el pedido aparezca con la key nueva. Si la IA falla, Puente sigue en modo sin IA, así que una key rota no se nota a simple vista: hay que mirar la actividad.
6. Revisá que sigan activas las opciones de privacidad de la cuenta (Settings → Privacy: ZDR y sin proveedores que entrenan).

## RESEND_API_KEY

1. resend.com → **API Keys** → **Create API Key**, permiso **Sending access**, dominio `puentepictos.app`.
2. Cargala en `RESEND_API_KEY` (Production).
3. Redeploy.
4. Borrá la key vieja en Resend.
5. Verificá: en `login.html`, pedí un código para tu mail. Tiene que llegar, y en Resend → **Emails** tiene que figurar como enviado.

## Otras dos que conviene conocer

- `SESSION_SECRET`: firma las sesiones. Cambiarlo cierra la sesión de todo el mundo (docentes, familias y vos). Es la forma rápida de cortar sesiones robadas.
- `GOOGLE_CLIENT_SECRET`: se cambia en Google Cloud Console → **Credentials** → el cliente OAuth → agregar un secreto nuevo, cargarlo en Vercel, redeploy y después borrar el viejo.

## Si se filtra una credencial

Ejemplos: quedó en un commit, en una captura, en un chat, en un log, o alguien que la tenía ya no tiene que tenerla.

1. **Rotala ya**, con los pasos de arriba, aunque sea horario escolar. Un par de minutos sin servicio es menos grave que una clave filtrada.
2. **Redeploy y verificá** con el chequeo de salud y la prueba de esa credencial.
3. **Si estaba en el repo**: el repo es público, así que hay que darla por copiada. Borrar el commit no alcanza. Lo único que sirve es rotarla. Revisá también la pestaña **Security** del repo por alertas de secret scanning.
4. **Mirá si la usaron**:
   - Neon: **Monitoring** (en el plan gratis guarda un día) por conexiones o consultas raras.
   - Vercel: **Logs** del proyecto.
   - OpenRouter: **Activity** por consumo que no es tuyo.
   - Resend: **Emails** por mails que Puente no mandó.
   - Puente: `admin.html` → **Registro** (ingresos, intentos fallidos).
5. **Si pudo haber acceso a datos personales**, seguí [docs/piloto/plan-incidentes.md](../piloto/plan-incidentes.md): registrar, contener, evaluar y avisar.
6. **No uses Instant Rollback** a deploys anteriores a la rotación: volverían con la clave vieja.
7. Anotá qué pasó, cuándo te enteraste y qué rotaste.

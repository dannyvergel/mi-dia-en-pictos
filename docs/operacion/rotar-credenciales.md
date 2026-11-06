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
| Token de Blob | No se rota: store nuevo + `web/scripts/migrar-blob.js` + borrar el viejo | `BLOB_STORE_ID` (OIDC); `BLOB_READ_WRITE_TOKEN` solo para scripts locales | Abrir un día publicado y un documento en el espacio de una familia |
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

Los días publicados y los documentos están en un store privado de Vercel Blob (hoy `puente-datos`), que usan los dos proyectos (`mi-dia-en-pictos` y `puente-demo`).

**El `BLOB_READ_WRITE_TOKEN` no se puede rotar.** Es un token estático que pertenece al store: no hay botón para regenerarlo, y desconectar y volver a conectar el proyecto no crea uno nuevo (el token sigue siendo el mismo mientras exista el store). La única forma de dejar sin efecto un token filtrado es pasar los datos a un **store nuevo** y **borrar el store viejo**. Con el store borrado, el token viejo deja de servir para cualquier cosa.

Desde el PR `blob-oidc`, la app en Vercel no usa ese token: usa **OIDC** (`BLOB_STORE_ID` + un `VERCEL_OIDC_TOKEN` corto que Vercel rota solo; `@vercel/blob` 2.4 o más nuevo, el repo tiene la 2.8.2). El token estático queda solo para correr scripts desde tu compu (`revisor.js`, `dev.js`, `migrar-blob.js`). Ver `web/api/_lib/almacen.js`.

### Antes de empezar

- Fuera del horario escolar, salvo que el token se haya filtrado (entonces, ya).
- El PR `blob-oidc` tiene que estar mergeado y desplegado en los dos proyectos. Hasta que conectes el store nuevo, en los logs vas a ver una vez por instancia el aviso `[puente] Blob sin BLOB_STORE_ID`: es esperable.
- Anotá la **región** del store viejo: Vercel → **Storage** → `puente-datos` → **Settings**. El nuevo va en la misma (la región no se puede cambiar después y es la que figura en el consentimiento y en la política de privacidad).
- Tené el repo actualizado en tu compu:

```powershell
cd C:\dev\mi-dia-en-pictos
git checkout main
git pull
cd web
npm ci
```

### 1. Crear el store nuevo

1. Vercel → **Storage** → **Create** → **Blob**.
2. Acceso **Private**. Nombre: `puente-datos-2`. Región: **la misma** que el viejo.
3. Si te ofrece conectarlo a proyectos en ese momento, no conectes ninguno todavía (va en el paso 2).

### 2. Conectar el store nuevo a los dos proyectos

1. `puente-datos-2` → pestaña **Projects** → **Connect Project** → `mi-dia-en-pictos`, entornos **Production** y **Preview**.
2. Si Vercel avisa que `BLOB_READ_WRITE_TOKEN` ya existe (es el del store viejo, que sigue conectado), abrí **Advanced Options** y poné el prefijo `BLOB_NUEVO`. La app no usa ese token en Vercel.
3. Repetí con `puente-demo`.
4. En cada proyecto → **Settings** → **Environment Variables**, fijate que exista **`BLOB_STORE_ID`** (sin prefijo) con el id del store **nuevo** (empieza con `store_`; lo ves en la página de `puente-datos-2`). No es un secreto.
   - Si quedó con prefijo (`BLOB_NUEVO_STORE_ID`), creá a mano `BLOB_STORE_ID` con ese mismo valor, en Production y Preview.
   - Si ya había un `BLOB_STORE_ID` con el id del store viejo, editalo y poné el del nuevo.
5. **No hagas redeploy todavía.** El deploy que está andando sigue usando el store viejo hasta el paso 5.

### 3. Migración de prueba (dry-run)

Necesitás el token de lectura y escritura de cada store: en la página del store → **.env.local** (o **Quickstart**) → **Show secret** → copiar `BLOB_READ_WRITE_TOKEN`. Podés copiar la línea entera, el script le saca el nombre y las comillas. Se cargan desde el portapapeles para que no queden en pantalla ni en el historial:

```powershell
cd C:\dev\mi-dia-en-pictos\web
# Copiá el token del store VIEJO (puente-datos) y después:
$env:BLOB_ORIGEN_TOKEN = (Get-Clipboard)
# Copiá el token del store NUEVO (puente-datos-2) y después:
$env:BLOB_DESTINO_TOKEN = (Get-Clipboard)
Set-Clipboard -Value " "
node scripts\migrar-blob.js --dry-run
```

Tiene que mostrar `Origen: store <id viejo>` y `Destino: store <id nuevo>` (si están al revés, cargá de nuevo las variables), cuántos blobs y bytes hay en cada uno y el plan: `copiar N`. No escribe nada.

### 4. Migración de verdad

En la misma ventana de PowerShell:

```powershell
node scripts\migrar-blob.js
```

Copia cada blob con la misma ruta y el mismo content-type, y al final vuelve a listar los dos stores y compara cantidad, bytes, tamaño y content-type. Tiene que terminar en `Listo: todo lo del origen está en el destino.` Si dice `Hay diferencias`, corrélo de nuevo: es idempotente (no duplica ni pisa lo que ya está igual).

No hace falta tocar la base: guarda rutas (`alumnos.blob_token` → `familias/<token>.json` y `documentos.blob_ruta` → `documentos/<alumno>/<hex>`), no URLs del store. El SDK arma la URL con el id del store que esté conectado.

### 5. Redeploy

Redeploy de `mi-dia-en-pictos` y de `puente-demo` (ver arriba). Desde ahora la app lee y escribe en el store nuevo, por OIDC.

Apenas diga **Ready**, corré una segunda pasada en la misma ventana. Copia lo que la app vieja haya escrito entre el paso 4 y el redeploy, y no pisa lo que la app nueva ya escribió en el destino:

```powershell
node scripts\migrar-blob.js
```

### 6. Verificar

1. Salud: `curl.exe -s -i "https://puentepictos.app/api/config?accion=salud"` → 200 y `"ok":true`, con el `version` del commit nuevo.
2. Entrá al espacio de una familia de prueba (por ejemplo, la cuenta de revisión): tiene que cargar el último día publicado y abrir un documento.
3. Como docente, publicá un día de prueba. En `puente-datos-2` → **Browser**, ese `familias/....json` tiene que tener la hora de recién. En `puente-datos`, no.
4. Vercel → **Logs** de los dos proyectos: sin errores de Blob y sin el aviso `[puente] Blob sin BLOB_STORE_ID`.

### 7. Desconectar el store viejo

1. `puente-datos` → **Projects** → menú (⋯) de cada proyecto → **Disconnect**.
2. En cada proyecto → **Settings** → **Environment Variables**: no tiene que quedar ningún `BLOB_READ_WRITE_TOKEN` del store viejo. Si quedó, borralo. Si se creó `BLOB_NUEVO_READ_WRITE_TOKEN`, borralo también: la app no lo usa y es un secreto estático menos dando vueltas (los scripts locales lo sacan del panel del store).
3. Redeploy de los dos proyectos y repetí el paso 6.

### 8. Borrar el store viejo

Esto es lo que deja sin efecto el token filtrado. No tiene vuelta atrás: hacelo solo con el paso 6 bien.

1. `puente-datos` → **Settings** → **Delete Store** → confirmar.
2. Comprobá que el token viejo ya no sirve (en la misma ventana; `BLOB_ORIGEN_TOKEN` todavía es el viejo):

```powershell
node scripts\migrar-blob.js --dry-run
```

   Tiene que fallar con `This store does not exist` (o un 403).
3. Limpiá la ventana:

```powershell
Remove-Item Env:BLOB_ORIGEN_TOKEN
Remove-Item Env:BLOB_DESTINO_TOKEN
```

4. Anotá qué pasó y cuándo (ver *Si se filtra una credencial*). En los docs, el store pasa a llamarse `puente-datos-2`.

### Rollback

- **Hasta el paso 7 inclusive** (el store viejo todavía existe): en cada proyecto borrá `BLOB_STORE_ID` y, si lo desconectaste, volvé a conectar `puente-datos` (o cargá su `BLOB_READ_WRITE_TOKEN` a mano, Sensitive). Redeploy. Sin `BLOB_STORE_ID`, la app vuelve al token del store viejo. En una emergencia, antes del paso 7, también sirve **Instant Rollback** al deploy anterior al paso 5 (todavía tiene las variables del store viejo).
  Después copiá de vuelta lo que la app escribió en el store nuevo, con los tokens al revés (solo pisa lo que es más nuevo en el origen):

```powershell
# Copiá el token del store NUEVO (puente-datos-2) y después:
$env:BLOB_ORIGEN_TOKEN = (Get-Clipboard)
# Copiá el token del store VIEJO (puente-datos) y después:
$env:BLOB_DESTINO_TOKEN = (Get-Clipboard)
Set-Clipboard -Value " "
node scripts\migrar-blob.js --dry-run
node scripts\migrar-blob.js
```

- **Después del paso 8** no hay vuelta al store viejo: el token filtrado ya no existe. Si algo falla, se arregla sobre el store nuevo (y si hiciera falta otro store, se repite este procedimiento con el nuevo como origen).

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

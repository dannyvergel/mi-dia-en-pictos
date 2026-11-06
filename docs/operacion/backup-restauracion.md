# Backup y restauración de la base

Qué copia de seguridad tenemos hoy, cómo volver la base a un momento anterior y cómo practicarlo sin tocar producción.

## Qué hay hoy

La base es Postgres en Neon, plan gratis, conectada a Vercel por la integración de Storage.

- **Restauración a un momento anterior (instant restore).** Neon guarda el historial de cambios de la rama de producción. En el plan gratis alcanza hasta **6 horas** para atrás y hasta 1 GB de cambios. Pasadas esas 6 horas, ese momento ya no se puede recuperar.
- **Ramas.** Una rama es una copia de la base en un momento dado. Se crea al instante y no duplica los datos hasta que cambian. El plan gratis permite 10 ramas por proyecto, contando producción y las ramas que crea Vercel para los Preview.
- **Snapshot manual.** El plan gratis permite 1. Los backups programados son de los planes pagos.

Lo que **no** está en Neon y por lo tanto no se recupera con esto:

- Los **días publicados** y los **documentos** (informes, PDF, imágenes) están en Vercel Blob (store `puente-datos`). Blob no tiene historial ni papelera: lo que se borra o se pisa, se pierde.
- Las variables de Vercel. Si se pierden, hay que volver a cargarlas (ver [rotar-credenciales.md](rotar-credenciales.md)).

Conclusión para el piloto: la red de seguridad real de la base son 6 horas. Un error se tiene que detectar en el día. Ver «Qué conviene sumar» al final.

## Antes de restaurar: probar en una rama

Nunca restaures producción a ciegas. Primero armá una rama con los datos de ese momento, mirala, y recién ahí decidí.

### 1. Elegí el momento

Anotá la hora en Argentina justo antes del problema (por ejemplo, «hoy 14:05, antes de la importación»). Neon muestra las horas en la zona del navegador; confirmá que sea la de Argentina (UTC-3).

### 2. Creá la rama de prueba

1. Vercel → **Storage** → la base de Neon → **Open in Neon**.
2. En Neon → **Branches** → **New branch** (o **Create branch**).
3. **Parent branch**: la de producción (según cómo se creó, se llama `production` o `main`; es la que tiene la etiqueta de rama por defecto).
4. En el punto de partida elegí **un momento del pasado** (Past data / point in time) y poné la fecha y hora del paso 1.
5. Nombre: `prueba-restauracion-AAAAMMDD-HHMM`. No le pongas un nombre que se parezca a `production`.
6. Crear. La rama nueva tiene su propio compute y su propia cadena de conexión. Producción no se entera.

### 3. Verificá la rama sin tocar producción

Usá el **SQL Editor** de Neon con la rama de prueba elegida arriba (fijate dos veces que no diga producción). Consultas de ejemplo, sin mostrar datos personales:

```sql
SELECT count(*) AS escuelas FROM escuelas;
SELECT count(*) AS docentes FROM docentes;
SELECT count(*) AS alumnos FROM alumnos;
SELECT count(*) AS fichas FROM fichas;
SELECT max(creado) AS ultimo_evento FROM auditoria;
```

Corré las mismas en producción y compará. La rama tiene que tener lo que se perdió (por ejemplo, la cantidad de alumnos de antes del error) y `ultimo_evento` tiene que ser anterior al problema.

Para revisar un caso puntual, buscá por id, no por nombre. Si necesitás más que contar, también podés usar **Time Travel Assist** de Neon, que hace consultas de solo lectura sobre un momento del pasado sin crear nada.

No conectes la app de producción a la rama. Si querés ver la rama con la app, usá el servidor local: ojo que eso baja datos reales de chicos a tu compu, así que solo si hace falta, y cerrá todo al terminar.

```powershell
cd C:\dev\mi-dia-en-pictos\web
$env:DATABASE_URL = Read-Host "Cadena de conexión de la rama de prueba"
npm run local
```

Después de cortar el servidor (Ctrl+C):

```powershell
Remove-Item Env:DATABASE_URL
```

### 4. Borrá la rama de prueba

Cuando termines, Neon → **Branches** → la rama de prueba → **Delete**. Ocupa uno de los 10 lugares y tiene datos personales.

## Restaurar producción

Solo si la rama de prueba mostró que ese momento es el correcto.

1. Avisá a las escuelas del piloto que Puente va a estar sin cambios unos minutos y que lo que se cargó después de la hora elegida se pierde.
2. Neon → rama de producción → **Backup & Restore** → **Restore from history** → fecha y hora del paso 1.
3. Confirmá. Neon:
   - pisa **toda** la base de producción con el estado de ese momento (datos y estructura de todas las tablas);
   - deja la cadena de conexión igual, así que no hay que tocar Vercel ni hacer redeploy;
   - guarda el estado de justo antes de restaurar en una rama `<nombre>_old_<fecha>` (por ejemplo `production_old_...`), por si hay que deshacer.
4. Verificá con el chequeo de salud:

```powershell
curl.exe -s -i "https://puentepictos.app/api/config?accion=salud"
```

5. Corré las consultas del paso 3 contra producción y compará con la rama de prueba.
6. Si algo cargado después de la hora elegida hay que recuperarlo, está en la rama `_old_`: se copia a mano, fila por fila, con cuidado.
7. Anotalo en el registro de incidentes ([docs/piloto/plan-incidentes.md](../piloto/plan-incidentes.md)) si hubo pérdida o cambio de datos personales.

Para deshacer la restauración: **Restore** de nuevo, usando la rama `_old_` como origen.

## Qué conviene sumar

Ninguna de estas está hecha. Son decisiones de Danny:

- **Un volcado semanal** con `pg_dump` a un disco cifrado (BitLocker), sabiendo que son datos sensibles de chicos. Da una copia más vieja que 6 horas.
- **Usar el snapshot manual** del plan gratis antes de cada cambio grande (importaciones masivas, migraciones).
- **Pasar a Launch** si el piloto crece: historial de hasta 7 días y backups programados.
- **Un respaldo de Blob**: hoy no hay ninguno.
- **Practicar esto una vez por mes** con una rama de prueba, así el día que haga falta no es la primera vez.

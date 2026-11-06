# Volver atrás un cambio (rollback)

Qué hacer cuando un cambio que llegó a producción rompe algo.

## Cómo llega un cambio a producción

- Vercel (plan Hobby) despliega solo la rama `main` del proyecto `mi-dia-en-pictos`. Las otras ramas no se despliegan ahí (`web/vercel.json`, `git.deploymentEnabled`).
- Al mergear un PR a `main`, Vercel construye y publica. En los últimos merges (6/11/2026), el deploy quedó listo en el mismo minuto del merge: **alrededor de un minuto** del merge a producción, más si Vercel tiene cola.
- Los tests de GitHub (`tests.yml`) corren en el PR y también en `main`, pero **no frenan el deploy**: Vercel publica aunque los tests de `main` fallen. El freno real es no mergear un PR con tests en rojo (ver «Lo que conviene activar» al final).
- Para saber qué commit está en producción:

```powershell
curl.exe -s "https://puentepictos.app/api/config?accion=salud"
```

El campo `version` son los primeros 7 caracteres del commit.

## Opción 1: Instant Rollback (lo más rápido)

Sirve para salir del paso en segundos, mientras se arregla con calma.

1. vercel.com → proyecto `mi-dia-en-pictos` → en la tarjeta **Production Deployment**, **Instant Rollback**.
2. Elegí el deploy anterior → **Continue** → revisá los dominios (`puentepictos.app`) → **Confirm Rollback**.
3. Verificá: el chequeo de salud tiene que mostrar el `version` del commit anterior.

Lo que hay que saber:

- **En Hobby solo se puede volver al deploy inmediatamente anterior.** Si hay que ir más atrás, usá la opción 2.
- **Después de un rollback, Vercel deja de publicar los merges nuevos.** Los siguientes merges a `main` se construyen pero no salen a producción hasta que alguien toque **Undo Rollback** en la misma tarjeta (o promueva otro deploy). Es fácil olvidarse: anotalo.
- **Vuelve con las variables viejas.** El deploy anterior usa las variables que tenía cuando se construyó. Si rotaste una clave después de ese deploy, el rollback trae la clave vieja y esa parte deja de andar (ver [rotar-credenciales.md](rotar-credenciales.md)).
- **La base no vuelve atrás.** Un rollback cambia el código, no los datos. Las tablas y columnas que agregó el código nuevo quedan; el código viejo las ignora porque el esquema solo suma (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Si el cambio rompió datos, eso es [backup-restauracion.md](backup-restauracion.md).
- **El cron también vuelve** a como estaba en ese deploy.

## Opción 2: revertir el PR

Es la forma definitiva y deja todo en el historial. También sirve para ir más atrás que el deploy anterior.

Desde GitHub (lo más simple):

1. Abrí el PR que causó el problema → botón **Revert** → se crea un PR nuevo que deshace el cambio.
2. Esperá los tests del PR de revert.
3. Mergealo. En alrededor de un minuto está en producción.
4. Si antes hiciste Instant Rollback, ahora tocá **Undo Rollback** en Vercel y elegí el deploy del revert.

Desde PowerShell, si el botón no aparece:

```powershell
cd C:\dev\mi-dia-en-pictos
git checkout main
git pull
git checkout -b revertir-pr-NN
git revert <sha-del-commit-del-PR>
git push origin revertir-pr-NN
```

Los PR de este repo se mergean como un solo commit (el título termina en `(#NN)`), así que alcanza con `git revert <sha>`. Si alguno se mergeó con commit de merge, es `git revert -m 1 <sha>`. Después abrí el PR de `revertir-pr-NN` en GitHub y mergealo cuando pasen los tests.

## El service worker

El sitio tiene un service worker (`web/sw.js`) con un número de versión: la constante `C`, hoy `pictos-v31` en producción.

- Las páginas van **primero a la red** y usan el caché solo sin conexión. Después de un rollback o un revert, la próxima vez que alguien abra Puente con internet ve la versión vieja. No hay que pedirle a nadie que borre nada.
- Si el deploy al que volvés tiene otro número (por ejemplo `pictos-v30`), el navegador lo toma como un service worker nuevo, lo instala y borra el caché de la versión que se fue. Consecuencia: el Comunicador vuelve a bajar sus pictos la próxima vez que se abre con internet. Quien lo use sin conexión justo en ese momento puede quedarse sin algunos pictos hasta conectarse.
- **Regla para el arreglo que viene después:** siempre un número nuevo, más alto que cualquiera que haya estado en producción (si v31 rompió algo y volviste a v30, el arreglo sale como v32, nunca otra vez v31). Reusar un número con otro contenido deja navegadores con archivos mezclados.
- Si el cambio toca textos públicos, además corré `npm run idiomas` (ver [docs/idiomas.md](../idiomas.md)).

## Lista corta para un incidente

1. Confirmá el problema y anotá la hora.
2. Si afecta a las escuelas: Instant Rollback ya.
3. Verificá con el chequeo de salud (`version` y `"ok":true`).
4. Revertí el PR o prepará el arreglo, con tests en verde.
5. Undo Rollback en Vercel para que los merges vuelvan a publicarse.
6. Si hubo datos personales en juego, seguí [docs/piloto/plan-incidentes.md](../piloto/plan-incidentes.md).

## Lo que conviene activar

GitHub → repo → **Settings** → **Rules** → **Rulesets** → nueva regla para `main` con **Require status checks to pass** y el check `tests`. Así no se puede mergear un PR con tests en rojo. Es gratis en repos públicos. Lo decide Danny.

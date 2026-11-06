# Operación de Puente

Guías para mantener https://puentepictos.app andando durante el piloto. Están pensadas para Danny, con Windows y PowerShell 5.1.

| Guía | Para qué |
|---|---|
| [rotar-credenciales.md](rotar-credenciales.md) | Cambiar cada clave o token, y qué hacer si se filtra uno |
| [backup-restauracion.md](backup-restauracion.md) | Volver la base a un momento anterior con Neon, probando antes en una rama |
| [rollback.md](rollback.md) | Volver a la versión anterior del sitio en Vercel o revertir un PR |
| [slo.md](slo.md) | Qué disponibilidad prometemos en el piloto y cómo se mide |
| [observabilidad.md](observabilidad.md) | Qué se puede ver hoy cuando algo falla, qué falta y dónde se va a trabar primero |

## Lo automático

- `.github/workflows/tests.yml`: corre `npm ci` y `npm test` en `web/` en cada PR y en cada push a `main`. No usa secretos ni la base real.
- `.github/workflows/salud.yml`: cada 15 minutos pide `https://puentepictos.app/api/config?accion=salud` y la portada. Si alguno no da 200, el workflow falla y GitHub manda un mail.
- `GET /api/config?accion=salud`: responde `{ "ok": true, "db": "ok", "version": "a597856" }` con 200, o `ok: false` con 503. `version` es el commit que está en producción.

## Comandos útiles en PowerShell 5.1

En PowerShell 5.1, `curl` es otro comando (Invoke-WebRequest). Usá `curl.exe`, que viene con Windows 10 y 11:

```powershell
curl.exe -s -i "https://puentepictos.app/api/config?accion=salud"
```

La primera línea tiene que decir `HTTP/1.1 200` (o `HTTP/2 200`) y el cuerpo `"ok":true`.

## Tests en CI

`tests.yml` corre con el entorno vacío: sin `DATABASE_URL`, sin claves y sin red hacia servicios de Puente. Los tests usan PGlite (Postgres en memoria) y un Blob en memoria (`web/test/ayuda.js`). Hoy ningún test necesita secretos, así que no se saltea ninguno.

Si algún día un test necesita una credencial o un servicio real, que se saltee en CI con la variable `PUENTE_CI` (el workflow la pone en `1`) y que se anote acá cuál es y por qué:

```js
test("algo contra un servicio real", { skip: process.env.PUENTE_CI === "1" }, async () => { /* ... */ });
```

Tests salteados en CI: ninguno.

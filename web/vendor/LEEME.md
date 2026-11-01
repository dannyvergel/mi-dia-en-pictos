# Librerías de terceros copiadas en el repo

## xlsx.mini.min.js — SheetJS Community Edition 0.20.3
- Origen: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.mini.min.js
- Licencia: Apache License 2.0 (https://git.sheetjs.com/sheetjs/sheetjs/src/branch/master/LICENSE)
- SRI (sha384): `NG/W3xvO3ynQEcDQYIOcZTXRtwUs83cLv1FIl9PuqWPDuNhsMRF6wutlNLFwlb71`
- Uso: `web/importar.js` la carga solo al abrir la pestaña Importar, para leer y armar planillas Excel en el navegador.
  Para actualizarla: bajar la versión nueva, recalcular el SRI (`openssl dgst -sha384 -binary xlsx.mini.min.js | openssl base64 -A`)
  y cambiar `XLSX_SRI` en `web/importar.js`.

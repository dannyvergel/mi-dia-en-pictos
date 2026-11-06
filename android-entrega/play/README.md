# AAB de Puente para Google Play

| Archivo | Qué es |
|---|---|
| `puente-play-1.0.2-vc3.aab` | Android App Bundle de `app.puentepictos.twa`, **versionName 1.0.2, versionCode 3** (la APK de sideload `web/descargar/puente.apk` es 1.0.1 / versionCode 2). Firmado con la clave existente (alias `puente`) como **clave de subida** para Play App Signing. |
| `pwabuilder-opciones.json` | Opciones exactas con las que se generó (PWABuilder, `signingMode: "none"`). No tiene contraseñas. |

Datos del AAB (verificados el 6/11/2026 con `bundletool validate`, `bundletool dump manifest` y `jarsigner -verify`):

- Paquete `app.puentepictos.twa` · minSdk 21 · targetSdk 36 · arranca en `https://puentepictos.app/login.html?app`.
- Permisos: ninguno peligroso (solo `app.puentepictos.twa.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, interno de AndroidX). Sin AD_ID.
- Firma (clave de subida): `CN=Danny Vergel, OU=Puente, O=Puente, C=AR`, RSA 2048, SHA256withRSA, vence en 2081.
  - SHA-256: `E5:E5:B5:76:DE:86:BB:A1:47:BA:20:47:3E:0F:8D:A6:95:EF:A2:39:13:A6:A9:92:0F:DF:0F:CD:F3:BA:7C:00`
  - SHA-1: `93:A8:7A:11:33:12:9B:86:40:06:6A:06:49:8E:86:C4:F5:9C:BF:6F`
- sha256 del archivo: `9eb98f24b6f64f5e275dca4ca8613284d0bf1443164145488d98ef7b3b789492`

**La clave (`signing.keystore`) y sus contraseñas NO están en el repo** (`.gitignore` excluye `*.keystore`, `*.jks`, `signing-key-info.txt`). Guardala fuera del repo y con copia de seguridad: si perdés la clave de subida, Play te deja cambiarla, pero lleva un trámite.

## Cómo se hizo (para repetirlo con otra versión)

Gradle y aapt2 no corren en la máquina de trabajo (Linux aarch64), y PWABuilder con `signingMode: "mine"` falla. Por eso se pide el paquete **sin firmar** al servicio de PWABuilder y se firma el AAB con `jarsigner` (los AAB se firman con jarsigner; apksigner es para APK).

### En Windows PowerShell 5.1

Requisitos: un JDK 17. El de Android Studio sirve: `C:\Program Files\Android\Android Studio\jbr\bin`.

1. Subí la versión en `pwabuilder-opciones.json`: `appVersion` (por ejemplo `1.0.3`) y `appVersionCode` (por ejemplo `4`). El versionCode **siempre** tiene que ser mayor que el último subido a Play.
2. Pedí el paquete sin firmar:
```powershell
cd C:\dev\mi-dia-en-pictos\android-entrega\play
$json = Get-Content -Raw -Encoding UTF8 pwabuilder-opciones.json
Invoke-WebRequest -Uri "https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage" -Method Post -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -OutFile puente-sin-firmar.zip
Expand-Archive puente-sin-firmar.zip -DestinationPath salida -Force
Get-ChildItem salida
```
   (Alternativa sin comandos: https://www.pwabuilder.com → `https://puentepictos.app` → Package for stores → Android → Google Play, con los mismos valores del JSON y «Signing key: None». Descargás el zip.)
3. Firmá el AAB con la clave de subida. Te pide las dos contraseñas por teclado: no las escribas en el comando.
```powershell
$jdk = "C:\Program Files\Android\Android Studio\jbr\bin"
$sinFirmar = Get-ChildItem salida -Filter *-unsigned.aab | Select-Object -First 1
& "$jdk\jarsigner.exe" -keystore "C:\ruta\segura\signing.keystore" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar puente-play-1.0.3-vc4.aab $sinFirmar.FullName puente
& "$jdk\jarsigner.exe" -verify puente-play-1.0.3-vc4.aab
& "$jdk\keytool.exe" -printcert -jarfile puente-play-1.0.3-vc4.aab
```
   `-verify` tiene que decir `jar verified.` (los avisos de «self-signed» y «no timestamp» son normales) y `-printcert` tiene que mostrar el SHA-256 de arriba.
4. Borrá `puente-sin-firmar.zip` y `salida\` y subí el `.aab` a Play Console.

### En Linux (como se hizo acá)

```bash
curl -sS -X POST -H 'Content-Type: application/json' --data @pwabuilder-opciones.json -o z.zip https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage
unzip -o z.zip -d z
jarsigner -keystore signing.keystore -sigalg SHA256withRSA -digestalg SHA-256 -signedjar puente-play-X-vcN.aab z/*-unsigned.aab puente
java -jar bundletool.jar validate --bundle puente-play-X-vcN.aab
```
Ojo: en `signing-key-info.txt` las contraseñas terminan en `\r` (fin de línea de Windows). Sacalo antes de usarlas (`tr -d '\r'`).

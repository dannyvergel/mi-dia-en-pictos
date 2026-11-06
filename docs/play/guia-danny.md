# Guía: Puente en Google Play, paso a paso

Comandos para **Windows PowerShell 5.1** (uno por línea, sin `&&`). Repo en `C:\dev\mi-dia-en-pictos`.

Calendario realista: verificación de identidad (de 1 a varios días) → ficha y prueba interna (1 día) → **prueba cerrada, 14 días seguidos con 12 testers** → solicitud de producción (Google dice que suele tardar 7 días o menos).

---

## 1. Cuenta de desarrollador (US$25, personal)

1. Entrá a https://play.google.com/console/signup con tu cuenta de Google (conviene una que uses solo para Puente, pero sirve la tuya).
2. Elegí **«Para mí» (cuenta personal)**. La de organización pide D-U-N-S y una entidad legal.
3. Pagá los **US$25** (pago único, con tarjeta internacional).
4. **Verificación de identidad:** nombre legal, dirección y foto del DNI o pasaporte. Tienen que coincidir con el perfil de pagos. Tarda entre horas y unos días.
5. **Verificación con un teléfono Android:** las cuentas nuevas tienen que instalar la app «Google Play Console» en un Android y entrar con la misma cuenta. Hacelo apenas te lo pida.
6. Nombre de desarrollador (público): `Puente`. Email de contacto: `soporte@puentepictos.app`.

## 2. Crear la app y activar Play App Signing

1. Play Console → **Crear app**: nombre `Puente: el día en pictogramas`, idioma **Español (Latinoamérica)**, **App**, **Gratis**. Aceptá las declaraciones.
2. **Prueba y lanzamiento → Configuración → Integridad de la app → Firma de apps:** dejá la opción por defecto, **«Que Google genere y administre la clave de firma»** (Play App Signing). Tu clave actual (la de `puente-clave-firma-GUARDAR.zip`) queda como **clave de subida**: con esa se firma cada AAB que subís.
   - Alternativa: «Usar mi propia clave» (subir la actual con PEPK). Ventaja: la app de Play tendría la misma firma que la APK de `/descargar` y quien la instaló por fuera podría actualizar desde Play. Desventaja: Google pasa a custodiar tu única clave. Recomiendo la opción por defecto. Quien tenga la APK instalada por fuera la desinstala una vez e instala la de Play.
3. Completá **Contenido de la app** (Panel → «Configurar tu app»):
   - Política de privacidad: `https://puentepictos.app/privacidad.html`
   - Acceso a la app: el texto de `ficha.md` → «Acceso a la app». Para producción, con la cuenta de revisión prendida (paso 8).
   - Anuncios: **No**.
   - Clasificación del contenido: `clasificacion-contenido.md` §1.
   - Público objetivo: `clasificacion-contenido.md` §2 (**18+**).
   - Seguridad de los datos: `data-safety.md`.
   - Apps de salud: marcá que **no** es una app de salud ni médica (es una herramienta escolar). ⚠ Revisalo con la lista que te muestre la consola.
   - Apps del gobierno, funciones financieras, noticias: **No**.
4. **Ficha de Play principal:** textos de `ficha.md`, ícono `icono-play-512.png`, gráfico `feature-graphic-1024x500.png` y las 6 capturas de `capturas/`.

## 3. Subir el AAB: primero prueba interna, después cerrada

El AAB ya está firmado con la clave de subida: `android-entrega/play/puente-play-1.0.2-vc3.aab` (versionCode **3**, versionName 1.0.2).

Comprobar la firma antes de subir (necesita un JDK; Android Studio trae uno):
```powershell
cd C:\dev\mi-dia-en-pictos
$jdk = "C:\Program Files\Android\Android Studio\jbr\bin"
& "$jdk\keytool.exe" -printcert -jarfile android-entrega\play\puente-play-1.0.2-vc3.aab
```
Tiene que decir `SHA256: E5:E5:B5:76:DE:86:BB:A1:47:BA:20:47:3E:0F:8D:A6:95:EF:A2:39:13:A6:A9:92:0F:DF:0F:CD:F3:BA:7C:00`.

1. **Prueba y lanzamiento → Pruebas → Prueba interna → Crear versión** → subí el AAB → nombre «1.0.2 (3)» → notas: «Primera versión de prueba». Agregá tu email como tester y probala en tu teléfono.
2. **Prueba cerrada → Crear pista** (o usá «Alpha») → **Promover** la misma versión desde interna, o subí el AAB de nuevo → **Países:** Argentina → enviar a revisión. La primera revisión puede tardar unos días.

Si hace falta un AAB nuevo (por ejemplo versionCode 4), en `android-entrega/play/README.md` está la receta exacta.

## 4. Sumar el SHA-256 de Play a assetlinks (y mergear)

Sin esto, la app de Play abre con la barra de Chrome arriba, porque la verificación TWA falla.

1. Play Console → **Integridad de la app → Firma de apps** → copiá el **SHA-256 del certificado de la clave de firma de apps** (no el de la clave de subida). Esa misma pantalla también muestra un fragmento «Digital Asset Links JSON» listo para copiar.
2. En el repo:
```powershell
cd C:\dev\mi-dia-en-pictos
git checkout main
git pull
git checkout -b play-assetlinks
notepad web\.well-known\assetlinks.json
```
3. En el bloque de `app.puentepictos.twa` (solo en ese, salvo que el Comunicador también esté en Play), dejá las **dos** huellas, la de sideload primero:
```json
"sha256_cert_fingerprints": ["E5:E5:B5:76:DE:86:BB:A1:47:BA:20:47:3E:0F:8D:A6:95:EF:A2:39:13:A6:A9:92:0F:DF:0F:CD:F3:BA:7C:00", "AA:BB:...:FF"]
```
   `"AA:BB:...:FF"` es el lugar de la huella de Play; reemplazalo por la real (32 pares en mayúsculas separados por `:`). No subas el texto de ejemplo: el test `web/test/play.test.js` lo rechaza.
4. Probar, subir y abrir el PR:
```powershell
cd web
npm test
cd ..
git add web/.well-known/assetlinks.json
git commit -m "assetlinks: huella de Play App Signing para app.puentepictos.twa"
git push -u origin play-assetlinks
```
5. Mergeá el PR (deploy automático de `main`) y verificá:
```powershell
Invoke-RestMethod https://puentepictos.app/.well-known/assetlinks.json | ConvertTo-Json -Depth 5
Invoke-RestMethod "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://puentepictos.app&relation=delegate_permission/common.handle_all_urls" | ConvertTo-Json -Depth 6
```
   Las dos huellas tienen que aparecer. Después desinstalá y reinstalá la app de prueba: abre sin barra de direcciones.

## 5. Invitar a los 12 testers

Conviene invitar **15 o 16**: si alguien se sale, el conteo de 14 días se corta para esa persona.

- **Opción A, lista de emails:** Prueba cerrada → pestaña **Testers** → «Crear lista de emails» → pegá los emails separados por coma. Tienen que ser **las cuentas de Google que usan en Play Store** en su Android.
- **Opción B, Grupo de Google (más cómodo):** creá un grupo en https://groups.google.com, por ejemplo `puente-testers@googlegroups.com`, con «Cualquiera puede unirse» o agregá a la gente vos. En Testers elegí «Grupos de Google» y pegá la dirección. Así sumás o sacás gente sin tocar la consola.
- **Link de opt-in:** en la misma pestaña aparece «Unirse desde la Web». Tiene esta forma:
  `https://play.google.com/apps/testing/app.puentepictos.twa`
  Cada tester abre ese link **con la cuenta invitada**, toca **«Convertirme en tester»** y después instala desde el link de Play que aparece ahí. El mensaje listo está en `mensaje-testers.md`.
- Feedback: completá «Email o URL de comentarios» con `soporte@puentepictos.app`.

## 6. El requisito: 12 testers durante 14 días seguidos

- Google pide **al menos 12 testers con opt-in continuo durante los últimos 14 días** al momento de pedir producción. Si alguien se sale y vuelve, sus 14 días arrancan de nuevo.
- No alcanza con instalar: Google pregunta si **usaron las funciones** y cómo fue el feedback. Usá `checklist-14-dias.md`.
- Subí al menos **una actualización** durante la prueba (por ejemplo versionCode 4 con algo que pidieron): suma en la solicitud.
- Mirá el avance en Panel → «Solicitar acceso a producción» (muestra cuántos testers llevan cuántos días).

## 7. Solicitud de acceso a producción (borrador de respuestas)

Panel → **Solicitar acceso a producción**. Son tres partes. Ajustá los números a lo que pasó de verdad.

**Parte 1 · Sobre tu prueba cerrada**

- *¿Qué tan fácil fue conseguir testers?* «Bastante fácil» (o lo que haya sido).
- *Participación de los testers:*
  > Los testers fueron [N] personas del público real de la app: [n] docentes de educación especial, [n] familias de alumnos y [n] terapeutas o acompañantes, todos en Argentina. Durante 14 días usaron las funciones principales: la docente dictó o escribió el día y lo armó en pictogramas, la familia vio el día y escuchó los pictogramas, hicieron preguntas al chat de la familia, descargaron datos y probaron el comunicador sin cuenta. La diferencia con el uso real: algunos testers usaron la demo con datos ficticios en vez de alumnos reales, porque el piloto con escuelas recién empieza.
- *Resumen del feedback y cómo lo juntaron:*
  > Juntamos el feedback por el botón «Enviar comentario» de la app, por el canal de comentarios de Google Play, por un grupo de WhatsApp de testers y con una encuesta corta en los días 7 y 14. Lo principal: [ej.: pedían letra más grande en la vista de la familia; un pictograma incorrecto para «terapia»; el código por mail a veces caía en spam; querían el comunicador más a mano].

**Parte 2 · Sobre tu app**

- *Público objetivo:*
  > Docentes, directivos y terapeutas de escuelas de educación especial en Argentina, y las familias de sus alumnos (adultos). Los alumnos son chicos con autismo, discapacidad intelectual o que todavía no hablan o leen, y ven su día en pictogramas junto a un adulto. La app no está dirigida a chicos.
- *Propuesta de valor:*
  > Puente reemplaza el cuaderno de comunicaciones en papel por un relato del día en pictogramas. La docente lo dicta en un minuto y la familia lo ve en casa, así el chico puede contar su día con dibujos. Es gratuita, sin fines de lucro y sin anuncios, guarda lo mínimo (nombre de pila) y la familia controla sus datos. Incluye un comunicador con pictogramas libre y sin cuenta.
- *Instalaciones estimadas el primer año:* **«de 100 a 1.000»** (o la franja que creas real; un piloto con pocas escuelas está en la más baja).

**Parte 3 · Preparación para producción**

- *Cambios hechos por lo que aprendieron en la prueba:*
  > [Ej.: en la versión 1.0.3 (versionCode 4) agrandamos el texto de la vista de la familia, corregimos pictogramas, mejoramos el mail del código para que no caiga en spam y sumamos el acceso al comunicador desde la portada.]
- *Cómo decidieron que estaba lista:*
  > La app pasó 14 días de uso real sin errores que bloquearan las funciones principales. Todos los tests automáticos pasan en cada cambio. Corregimos todo lo que reportaron los testers y verificamos la vinculación TWA (Digital Asset Links) con la clave de Play. La ficha, la política de privacidad, la página de borrado de cuenta y la declaración de seguridad de los datos reflejan lo que hace la app.

## 8. Cuenta de revisión (usuario y contraseña para Play)

Google pide un usuario y una contraseña que funcionen. Puente tiene una sola cuenta con contraseña, la de revisión: una docente (sin permisos de admin) de la «Escuela de prueba (revisión)», con tres alumnos ficticios (Juan, Sofi y Tomi) y dos días cargados por alumno. No ve ninguna otra escuela y no ocupa cupo del piloto. Viene **apagada**: sin las dos variables, el acceso responde 404 y el link «Acceso para revisión» no aparece.

Variables (solo estas dos, nunca la contraseña):

| Variable | Valor |
|---|---|
| `REVISOR_EMAIL` | `revision@puentepictos.app` (sugerido; no hace falta que reciba mails) |
| `REVISOR_CLAVE_HASH` | el hash que genera el paso 1 (empieza con `scrypt$`) |

**1. Generar la contraseña y su hash** (la contraseña queda solo en tu gestor de contraseñas):
```powershell
cd C:\dev\mi-dia-en-pictos
git checkout main
git pull
cd web
npm install
$b = New-Object byte[] 18
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$clave = [Convert]::ToBase64String($b).Replace("+", "-").Replace("/", "_")
$clave
$clave | node scripts\revisor-clave.js
Remove-Variable clave, b
```
   - La línea `$clave` muestra la contraseña (24 caracteres): copiala a tu gestor de contraseñas.
   - La última línea que imprime node es el hash (`scrypt$16384$8$1$...`): ese es el valor de `REVISOR_CLAVE_HASH`.
   - Si preferís inventar la contraseña, usá al menos 16 caracteres, solo letras sin tilde, números y guiones: el pipe de PowerShell 5.1 no respeta tildes ni eñes.

**2. Cargar las variables en Vercel:** proyecto → Settings → Environment Variables → **Add**:
   - `REVISOR_EMAIL` = `revision@puentepictos.app`, entorno **Production**.
   - `REVISOR_CLAVE_HASH` = el hash del paso 1, entorno **Production**, marcada como **Sensitive**.
   - Las variables nuevas valen recién en el próximo deploy: Deployments → el último de Production → **Redeploy**.

**3. Crear la escuela, la cuenta y los datos en la base de producción** (idempotente: si lo corrés de nuevo, actualiza y no duplica). Copiá `DATABASE_URL` de Vercel (Settings → Environment Variables, entorno Production) y `BLOB_READ_WRITE_TOKEN` de la página del store de Blob (**.env.local** → **Show secret**; con OIDC ya no está en las variables del proyecto, ver [rotar-credenciales.md](../operacion/rotar-credenciales.md#blob_read_write_token)) y pegalos entre comillas simples:
```powershell
cd C:\dev\mi-dia-en-pictos\web
$env:DATABASE_URL = 'pegá-acá-DATABASE_URL'
$env:BLOB_READ_WRITE_TOKEN = 'pegá-acá-BLOB_READ_WRITE_TOKEN'
$env:REVISOR_EMAIL = 'revision@puentepictos.app'
node scripts\revisor.js
Remove-Item Env:DATABASE_URL
Remove-Item Env:BLOB_READ_WRITE_TOKEN
Remove-Item Env:REVISOR_EMAIL
```
   Tiene que terminar con «Listo». Sin `BLOB_READ_WRITE_TOKEN` crea todo menos los días cargados (avisa). Si `REVISOR_EMAIL` ya es una cuenta real de Puente, el script no hace nada y lo dice.

**4. Probar:** abrí https://puentepictos.app/login.html (el link puede tardar hasta 5 minutos en aparecer después del redeploy) → «Soy docente» → **Acceso para revisión** → email y contraseña → tenés que ver Juan, Sofi y Tomi en Fichas, y «Ver como familia» con dos días cada uno. En el panel de la plataforma, Registro de accesos, aparece como «Ingreso de la cuenta de revisión (Google Play)».

**5. Pegar en Play Console:** Contenido de la app → **Acceso a la app** → «Toda o parte de la funcionalidad está restringida» → Agregar instrucciones: usuario `revision@puentepictos.app`, la contraseña del paso 1 y el texto en inglés de `ficha.md` → «Acceso a la app».

**Cambiar la contraseña:** repetí el paso 1, reemplazá `REVISOR_CLAVE_HASH` en Vercel, Redeploy, y actualizá la contraseña en Play Console.

**Apagarla:** borrá las dos variables en Vercel y hacé Redeploy. El acceso vuelve a responder 404 y el link desaparece. La escuela de prueba queda en la base sin ocupar cupo; si querés, desactivala desde el panel de la plataforma.

## Antes de pedir producción (que no te rechacen)

- [ ] **Credenciales de revisión.** Google pide credenciales que funcionen si la app tiene login. Con el código por mail no alcanza: prendé la cuenta de revisión (paso 8) y cargá usuario y contraseña en «Acceso a la app».
- [ ] `borrar-cuenta.html` y la versión de `pie.js` sin donaciones dentro de la app, ya en producción (este PR).
- [ ] Huella de Play en `assetlinks.json` (paso 4).
- [ ] Política de privacidad sin huecos ([RESPONSABLE], [REGIÓN]) y, si se puede, sin «BORRADOR».
- [ ] Decisión sobre Vercel Analytics dentro de la app (`data-safety.md`).

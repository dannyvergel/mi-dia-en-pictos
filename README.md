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

Se actualiza solo cada vez que la docente carga un día o corre el agente. Datos en Vercel Blob (store privado `puente-datos`); no se publican las notas internas del legajo.

## 🔐 Cuentas y fichas de familia
Con una base de datos conectada, Puente deja el PIN y los links y pasa a cuentas:
- **Docentes**: entran en `/login.html` con email y contraseña (scrypt + cookie de sesión `HttpOnly; Secure; SameSite=Lax`, firmada con HMAC y guardada en la tabla `sesiones`). Máximo 5 intentos fallidos por email cada 15 min (y 20 por IP). En `/docente.html` cargan alumnos y sus fichas; una docente admin suma o desactiva docentes.
- **Familias**: entran con su email y un **código de 6 números** (vence a los 10 min, se guarda hasheado, máximo 5 intentos). Pueden entrar los emails que la docente cargó en *Contactos* de la ficha; si un email se borra de la ficha, pierde el acceso.
- **Ficha de familia** (una por alumno): nombre de pila, contactos (nombre, vínculo, email, teléfono/WhatsApp), apoyos y sensibilidades (comunicación, sensoriales, qué lo calma, alimentación, qué le gusta, otros), objetivos del PPI (los usa el Agente de Progreso) y consentimiento (quién y cuándo). La familia la ve en su espacio, puede dar o retirar el consentimiento y actualizar su propio teléfono.
- **Privacidad**: solo nombre de pila, sin fotos, sin campo de diagnóstico. Cada API verifica la sesión: una docente ve solo los alumnos de su escuela; una familia, solo los alumnos vinculados a su email.
- Los **días** siguen en Vercel Blob (uno por alumno); la base guarda cuentas, fichas y vínculos.

**Modo demo**: si no hay `DATABASE_URL` (ni `POSTGRES_URL`), todo sigue como antes: PIN de docente y link privado por alumno. Así producción no se rompe hasta conectar la base. Con base conectada, el PIN solo sirve para crear la primera cuenta y los links viejos (`familia.html?t=…`) mandan al login.

### Puesta en marcha en Vercel
1. **Base**: Vercel → Storage → *Create Database* → **Neon** (Marketplace) → conectarla al proyecto. Eso crea `DATABASE_URL` (o `POSTGRES_URL`; sirven las dos). Las tablas se crean solas en el primer pedido (`CREATE TABLE IF NOT EXISTS`); también se puede correr a mano: `cd web && DATABASE_URL=... npm run migrar`.
2. **Variables** (Settings → Environment Variables):

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `DATABASE_URL` / `POSTGRES_URL` | Postgres de Neon. Sin esto: modo demo | Sí, para cuentas |
| `SESSION_SECRET` | Firma las cookies de sesión y los códigos. 32+ caracteres al azar (`openssl rand -base64 32`) | Sí en producción (sin esto da error) |
| `DOCENTE_PIN` | Protege la creación de la primera docente (y el modo demo) | Sí en producción para el alta inicial |
| `ADMIN_EMAIL` | Si está, la primera cuenta solo se puede crear con ese email | Recomendada |
| `RESEND_API_KEY` | Envía los códigos a las familias por email ([resend.com](https://resend.com)) | Sí en producción para familias |
| `RESEND_FROM` | Remitente, ej. `Puente <hola@tudominio.com>` (dominio verificado en Resend) | Recomendada (por defecto `onboarding@resend.dev`, que solo manda a tu propio email) |

   Sin `RESEND_API_KEY`: en local el código aparece en pantalla; en *preview* solo en los logs de Vercel; en producción se muestra un error claro.
3. **Primera docente**: abrir `/login.html`, completar *Primera vez en Puente* con el `DOCENTE_PIN` (y el email de `ADMIN_EMAIL` si está). Esa cuenta es admin y suma a las demás desde *Panel → Docentes*.
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
                auth.js (login docente, códigos de familia, alta inicial), fichas.js (fichas de familia), docentes.js
web/api/_lib/   db.js + schema.js (Postgres/Neon), seguridad.js (scrypt, sesiones, límites), correo.js (Resend), almacen.js (Blob)
web/familia.html Vista de la familia (con sesión, o con link en modo demo)
web/login.html  Entrar: docente (email + contraseña) o familia (código por email)
web/docente.html Panel docente: alumnos, fichas, docentes, mi cuenta
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
- Invitar docentes por email (hoy se crean con contraseña inicial).

## Privacidad
Datos de menores: solo nombre de pila, sin fotos ni diagnósticos, consentimiento de la familia registrado en la ficha. Con cuentas, cada API exige sesión y verifica que el alumno sea de la escuela de la docente o esté vinculado a la familia.

## Créditos
Pictogramas: Sergio Palao. Origen: [ARASAAC](https://arasaac.org). Licencia CC BY-NC-SA. Propiedad: Gobierno de Aragón (España).

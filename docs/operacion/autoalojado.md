# Puente autoalojado (Docker)

Puente corre en una máquina propia con `docker compose up`: Postgres común, archivos en disco, correo por SMTP (o sin correo) y, si se quiere, una IA local. No usa Vercel, Neon, Blob, Resend ni OpenRouter. En Vercel todo sigue igual: estas variables son opcionales y sin ellas nada cambia.

> **Estado:** primera versión, sin probar en hardware real. Ver [Lo que todavía no está verificado](#lo-que-todavía-no-está-verificado).

## Requisitos

- Linux (o cualquier equipo con Docker Engine y el plugin Compose v2).
- 2 GB de RAM libres sin IA local; para IA local, lo que pida el modelo (ver más abajo).
- Un dominio apuntando a la máquina (para HTTPS real), o `localhost` para probar.
- Puertos 80 y 443 libres. Son los únicos que se exponen.

## Instalación

```bash
git clone <repositorio> puente && cd puente
cp .env.example .env
# Completar .env. Cada secreto se genera con:
openssl rand -hex 32        # DB_PASSWORD, SESSION_SECRET, CRON_SECRET
docker compose up -d --build
docker compose ps            # app, db y caddy deben quedar "healthy"/"running"
```

Después abrir `https://<PUENTE_DOMAIN>/login.html` y crear la primera cuenta con `ADMIN_EMAIL` y `DOCENTE_PIN` (ver el README, sección *Puesta en marcha*). El esquema de la base se crea solo en el primer pedido.

Variables: la tabla completa está en el [README](../../README.md) (sección de variables de entorno) y los nombres del bundle en `.env.example`. Obligatorias aquí: `PUENTE_DOMAIN`, `PUENTE_URL`, `DB_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `DOCENTE_PIN`.

El compose fija `APP_ENV=production`, `DB_DRIVER=pg`, `STORAGE_DRIVER=disk` y `TRUST_PROXY=1`. Con `TRUST_PROXY=1` el servidor cree en `X-Forwarded-For` (lo escribe Caddy); nunca lo actives si la app queda expuesta sin proxy.

### Correo

- **SMTP:** `SMTP_URL` o `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`.
- **Sin correo (LAN):** `SMTP_DISABLED=1`. Los códigos de ingreso salen solo en el log del servidor: `docker compose logs app | grep codigo-login`. Nunca se devuelven por HTTP.

## HTTPS y dominio

- Caddy pide y renueva el certificado solo, si el dominio es público y los puertos 80/443 llegan a la máquina.
- La app es una PWA con service worker y cookies `Secure`: **necesita HTTPS con certificado de confianza**. `localhost` funciona (Caddy usa su propia CA local; el navegador pide confiar una vez).
- En una red local sin dominio público hay que usar un dominio real (con DNS interno) o una CA interna instalada en cada dispositivo. Entrar por la IP con HTTP no funciona: no se podrá iniciar sesión.

## IA local (opcional)

No se descarga ningún modelo automáticamente.

```bash
docker compose --profile llm up -d
docker compose --profile llm exec llm ollama pull <modelo>
```

En `.env`:

```
LLM_BASE_URL=http://llm:11434/v1
LLM_MODEL=<modelo>
# Solo CPU: minutos, no segundos
LLM_TIMEOUT_MS=120000
LLM_AGENT_TIMEOUT_MS=180000
```

Reiniciar la app: `docker compose up -d app`. Con CPU sola, el agente y el chat son lentos y se necesitan timeouts mucho mayores que los de fábrica (28 s y 30 s). Los timeouts pueden superar los 5 minutos: con `LLM_BASE_URL`, por encima de ~290 s el pedido usa `node:http`, porque el `fetch` de Node corta a los 300 s si el servidor no mandó cabeceras (los modelos locales no responden hasta terminar de generar). Un caso largo en CPU (~6 tokens/s) puede tardar más de 5 minutos. La calidad de cada modelo en español no está evaluada. Se puede usar también un servidor externo compatible con OpenAI (llama.cpp, vLLM) apuntando `LLM_BASE_URL` a él.

## Copias de seguridad

Hay que respaldar dos cosas: la base y el volumen de archivos.

```bash
# Base
docker compose exec -T db pg_dump -U puente -d puente -Fc > puente-$(date +%F).dump
# Archivos (documentos, informes)
docker compose exec -T app tar czf - -C /data/storage . > storage-$(date +%F).tgz
```

Guardar las copias fuera de la máquina. Probar la restauración antes de necesitarla.

**Restaurar** (en una instalación nueva o vacía):

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U puente -d puente --clean --if-exists < puente-AAAA-MM-DD.dump
docker compose up -d
docker compose exec -T app tar xzf - -C /data/storage < storage-AAAA-MM-DD.tgz
```

## Actualizar

```bash
git pull
docker compose up -d --build
docker compose logs -f app   # verificar que arranca; /api/config?accion=salud responde 200
```

Hacer una copia antes. Las migraciones de esquema son idempotentes y se aplican solas.

## Lista de seguridad

- [ ] Secretos largos y distintos (`openssl rand -hex 32`); `.env` con permisos `600` y fuera de git.
- [ ] Cambiar `DOCENTE_PIN`; no dejar valores de ejemplo.
- [ ] Firewall: solo 80 y 443 abiertos. La base (5432) y la app (3000) no se publican; no lo cambies.
- [ ] `TRUST_PROXY=1` solo detrás de Caddy.
- [ ] Copias automáticas y fuera de la máquina; restauración probada.
- [ ] Docker y las imágenes actualizados (`docker compose pull && docker compose up -d --build`).
- [ ] Disco cifrado si hay datos de alumnos (fichas, documentos).
- [ ] Revisar `/admin.html` → Registro de accesos de vez en cuando.

## Lo que todavía no está verificado

Se validó la configuración (`docker compose config`) y las pruebas automáticas del servidor, pero **no se ejecutó nada de esto en hardware real**:

- Construcción de la imagen (`docker compose build`) y arranque de todos los servicios juntos.
- Healthchecks, orden de arranque y reinicio ante fallas.
- Emisión de certificados por Caddy (dominio público y CA local) y el service worker sobre ese HTTPS.
- Contra un Postgres 16 real: el flujo completo (el adaptador se probó con PGlite).
- Correo por un servidor SMTP real y el modo `SMTP_DISABLED=1` de punta a punta.
- Ollama: descarga de modelos, velocidad en CPU, calidad en español y los timeouts recomendados.
- Backup y restauración con los comandos de arriba, y la actualización con datos existentes.
- Permisos del volumen de archivos y rendimiento con carga real.
- El cron diario de limpieza (`cron`) corriendo varios días.

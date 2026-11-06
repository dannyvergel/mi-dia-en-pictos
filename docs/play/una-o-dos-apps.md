# ¿Una app en Play o también el Comunicador aparte?

## Recomendación

**Ahora, una sola: Puente (`app.puentepictos.twa`).** El Comunicador queda como APK (`/descargar/comunicador.apk`) y como web/PWA. **Después**, cuando Puente esté en producción, se publica el Comunicador como segunda app, esta vez para chicos y dentro de Familias.

## Por qué

| Factor | Una app (Puente) | Dos apps ya |
|---|---|---|
| Prueba cerrada 12×14 | Una sola vez. | **Dos veces.** Cada app nueva de una cuenta personal necesita su propia prueba cerrada con 12 testers y 14 días seguidos. Los mismos testers pueden servir, pero cada uno tiene que hacer opt-in en cada app y usarla de verdad. Duplica lo más difícil del proceso. |
| Público y políticas | 18+ (docentes y familias). Política estándar. | El Comunicador lo usa **el chico**: lo honesto es declarar menores de 13 → **Política de Familias**, con revisión más estricta. Se puede hacer, y le queda bien (no recolecta nada, sin cuenta, sin analítica), pero antes hay que cerrar la TWA a la pantalla del comunicador (hoy se puede navegar a la home, que tiene Vercel Analytics y el «Entrar»). |
| Descubribilidad | Puente apunta a un público chico y concreto (escuelas que lo adoptan). La mayoría llega por invitación de la escuela, no buscando en Play. | **Acá gana el Comunicador.** «Comunicador pictogramas», «CAA», «tablero de comunicación», «autismo» son búsquedas reales de familias y terapeutas. Una ficha propia, gratis y sin cuenta, puede traer mucha más gente que Puente, y de paso hacer conocer a Puente. |
| Revisión y riesgo | Un frente. Si algo falla (acceso de revisión, Data safety), se corrige una vez. | Dos frentes al mismo tiempo, con públicos distintos. Un rechazo en Familias puede demorar todo. |
| Mantenimiento | Una ficha, una Data safety. | Dos fichas, dos Data safety, dos clasificaciones (aunque el AAB del Comunicador se arma igual). |

## Plan sugerido

1. **Ahora:** Puente en Play (este PR). Los testers del piloto también prueban el comunicador desde el espacio de la familia, y eso cuenta como uso de Puente.
2. **Mientras tanto:** el Comunicador sigue como APK y PWA. Es lo que ya funciona y no necesita a Google.
3. **Cuando Puente tenga producción (unas 4 a 6 semanas):**
   - Preparar la TWA del Comunicador para Familias: que abra y se quede en `comunicador.html` sin links a la home, ni analítica, ni login.
   - Ficha con público **menores de 13 + adultos** (padres y terapeutas), Política de Familias, categoría Educación o «Comunicación», y pedir la insignia «Aprobada por docentes» si califica.
   - Segunda prueba cerrada 12×14 con los mismos testers (esta vez es fácil: no necesita cuenta).
4. **Alternativa** si la descubribilidad es la prioridad número uno: hacer al revés (primero el Comunicador en Play, que no necesita credenciales de revisión ni declara datos) y Puente después. Es el camino de revisión más fácil, pero el piloto con escuelas necesita Puente, no el Comunicador. Por eso recomiendo empezar por Puente.

## Firma

Si el Comunicador va a Play, mismo esquema: su clave actual como clave de subida, Play App Signing, y sumar su huella de Play en el bloque `app.puentepictos.comunicador` de `assetlinks.json`.

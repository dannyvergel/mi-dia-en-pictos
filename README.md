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

**Activar IA:** en Vercel → Settings → Environment Variables → `OPENROUTER_API_KEY` (y opcional `OPENROUTER_MODEL`, por defecto `deepseek/deepseek-v4-flash`). Con eso también `/api/dia` estructura el día sin n8n.

## Estructura
```
web/            PWA (HTML + JS puro): pestañas Docente, Alumno, Familia y Progreso
web/api/        Funciones de Vercel: agente.js (Agente de Progreso) y dia.js (registro diario)
web/seed.js     3 semanas de datos ficticios para la demo
n8n/            Workflow importable: Webhook → LLM (JSON) → ARASAAC → respuesta
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
- Para la versión con IA: ⚙️ Config → pegar la URL del webhook de n8n.

## Configurar n8n
1. Importar `n8n/mi-dia-en-pictos.json`.
2. En el nodo **LLM - Estructurar día**, crear una credencial *Header Auth*: nombre `Authorization`, valor `Bearer TU_API_KEY_DE_OPENROUTER`.
   - Modelo por defecto: `deepseek/deepseek-v4-flash` (US$0,09 / M tokens de entrada, US$0,18 / M de salida). Un registro diario cuesta una fracción de centavo.
   - Para desarrollar gratis: `google/gemma-4-31b-it:free` (con límite de uso).
   - Aún más barato: `qwen/qwen3.7-flash`.
3. Activar el workflow y copiar la URL de producción del webhook (`/webhook/mi-dia`).
4. Probar:
```bash
curl -X POST https://TU-N8N/webhook/mi-dia -H "Content-Type: application/json" -d @data/ejemplo.json
```

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
- Envío directo por WhatsApp Cloud API desde n8n.
- Multi-escuela con login y base de datos (Supabase).

## Privacidad
Datos de menores: solo nombre de pila, sin fotos, consentimiento de la familia, datos en el dispositivo en el MVP.

## Créditos
Pictogramas: Sergio Palao. Origen: [ARASAAC](https://arasaac.org). Licencia CC BY-NC-SA. Propiedad: Gobierno de Aragón (España).

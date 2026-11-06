# Ficha de Google Play · Puente (es-AR)

App: `app.puentepictos.twa` · Idioma predeterminado de la ficha: **Español (Latinoamérica) – es-419**. Play no tiene «es-AR» como idioma de ficha: es-419 es el que corresponde a la Argentina. Los textos están escritos en rioplatense.

> El test `web/test/play.test.js` controla los largos de los bloques marcados con `<!-- campo -->`. Si cambiás un texto, corré `npm test` en `web/`.

## Nombre de la app (máx. 30)

<!-- nombre -->
```
Puente: el día en pictogramas
```

El ícono del teléfono sigue diciendo «Puente» (launcherName del AAB). El nombre de la ficha puede ser más largo.

## Descripción corta (máx. 80)

<!-- corta -->
```
La seño cuenta el día y la familia lo ve en casa, en pictogramas. Gratis.
```

## Descripción larga (máx. 4000)

<!-- larga -->
```
Puente une la escuela y la casa. La seño cuenta cómo fue el día del alumno y Puente lo arma en pictogramas: llegar, desayunar, música, recreo, almorzar, saludar. La familia lo ve en casa, y el chico puede contar su día señalando los dibujos.

Está pensado para escuelas de educación especial y para chicos que se comunican mejor con imágenes: chicos con autismo (TEA), con discapacidad intelectual o que todavía no hablan o leen.

PARA LA DOCENTE
• Dictás o escribís el día en un minuto; Puente lo ordena en una tira de pictogramas con su horario.
• Marcás logros y alertas para que la familia sepa qué pasó y cómo estuvo.
• Queda un registro para el legajo y para el informe de progreso.
• Ficha de apoyos de cada alumno: cómo se comunica, qué le molesta, qué lo calma.

PARA LA FAMILIA
• Ves el día de tu hijo o hija en pictogramas, con un resumen claro.
• Tocás cada dibujo y se escucha la palabra, para repasarlo juntos.
• Podés hacerle preguntas a Puente sobre lo que la escuela registró.
• Descargás tus datos o pedís la baja cuando quieras.

COMUNICADOR LIBRE
Puente incluye un comunicador con pictogramas, gratis y sin cuenta, para que el chico arme frases («yo quiero comer») y el teléfono las diga en voz alta. Funciona sin conexión.

CÓMO SE ENTRA
Las cuentas las da la escuela: la docente o la dirección invitan a cada familia por email y se entra con un código que llega por mail, sin contraseñas. Si tu escuela todavía no usa Puente, escribinos.

PRIVACIDAD
• Del alumno se carga solo el nombre de pila: sin apellido, sin fotos y sin diagnósticos.
• Sin publicidad. Los datos no se venden ni se usan para publicidad.
• Cada familia ve solo a su hijo o hija; cada docente, solo a sus alumnos.
• La inteligencia artificial que ordena el día no guarda ni entrena con los datos.

Puente es gratuito, sin fines de lucro y está en prueba piloto (BETA): puede tener errores y cambiar. Tus comentarios nos ayudan a mejorarlo.

Pictogramas: autor Sergio Palao. Origen: ARASAAC (https://arasaac.org). Licencia CC BY-NC-SA. Propiedad: Gobierno de Aragón (España).
```

## Categoría y etiquetas

- Tipo: **App**. Categoría: **Educación**.
- Etiquetas sugeridas (Play deja elegir hasta 5 de su lista): Educación especial / Comunicación / Aprendizaje / Herramientas para docentes / Familia. Elegí las que aparezcan en la lista.
- Precio: **Gratis**. Sin anuncios («¿Contiene anuncios?»: **No**). Sin compras en la app.

## Datos de contacto

- Email: **soporte@puentepictos.app** (obligatorio y público).
- Sitio web: https://puentepictos.app
- Teléfono: no cargar (es opcional y sería público).

## Política de privacidad y borrado de cuenta

- URL de la política de privacidad: **https://puentepictos.app/privacidad.html**
- URL para borrar la cuenta (Data safety → «Eliminación de datos»): **https://puentepictos.app/borrar-cuenta.html** (página nueva de este PR: tiene que estar en producción antes de mandar la app a revisión).
- OJO: la política de privacidad dice «BORRADOR» y tiene dos huecos ([RESPONSABLE] y [REGIÓN]). Google acepta la URL, pero conviene completarlos antes de pedir producción: un revisor que lee «texto provisorio» puede rechazar la ficha.

## Gráficos

| Recurso | Archivo | Requisito de Play | Estado |
|---|---|---|---|
| Ícono | `docs/play/icono-play-512.png` | 512×512 PNG 32 bits, ≤1 MB, cuadrado completo (Play redondea las esquinas) | 512×512, 25 KB. Hecho a partir de `web/icono-maskable-512.png` (fondo de pizarrón a sangre, sin el marco de madera). |
| Ícono alternativo | `web/icono-512.png` | idem | Cumple el tamaño (512×512 RGBA, 24 KB), pero ya trae esquinas redondeadas y marco transparente: Play le vuelve a recortar las esquinas y queda más chico y con el marco mordido. Usá el de arriba. |
| Gráfico de funciones | `docs/play/feature-graphic-1024x500.png` | 1024×500 JPG o PNG sin transparencia | 1024×500 RGB. Fuente editable: `docs/play/feature-graphic.html`. |
| Capturas de teléfono | `docs/play/capturas/01…06-*.png` | 2 a 8, 9:16 o 16:9, lado de 320 a 3840 px | 6 capturas de 1080×1920. |

Orden sugerido de las capturas:
1. `01-inicio.png`: portada, «Cómo fue el día en la escuela, contado en pictogramas».
2. `02-demo-cuaderno-docente.png`: cuaderno del día de la docente (demo, datos ficticios).
3. `03-demo-dia-en-pictos.png`: el día del alumno en pictogramas con horario.
4. `04-demo-vista-familia.png`: lo que ve la familia: ánimo, resumen y alertas.
5. `05-comunicador.png`: comunicador con la frase «yo quiero comer».
6. `06-como-funciona.png`: cómo funciona, en tres pasos.

Todas salen de páginas públicas (puentepictos.app y la demo abierta puente-pictos-demo.vercel.app), con el alumno ficticio «Juan» de la demo. No hay PIN, emails ni datos reales.

## Acceso a la app (App access) — IMPORTANTE

La app abre en la pantalla de ingreso, y se entra con un código que llega por mail. El revisor de Google no puede recibir ese código, y Google rechaza apps con login sin instrucciones de acceso. Opciones, de mejor a peor:

1. **Cuenta de revisión** (recomendada antes de pedir producción): una escuela de prueba con alumnos ficticios y una forma de entrar sin el mail (por ejemplo, un código fijo que solo vale para un email de revisión y se apaga después). Requiere un cambio chico de código que NO está en este PR.
2. **Mientras tanto** (prueba interna y cerrada no se revisan igual que producción), en «Acceso a la app» marcá «Toda o parte de la funcionalidad está restringida» y pegá:

```
Puente is used by special-education schools. Accounts are created by the school and sign-in uses a one-time code sent by email, so there is no password to share.
All teacher and family features can be tried without an account in the open demo: https://puente-pictos-demo.vercel.app/cuaderno.html (fictitious data; nothing leaves the browser). Tap "Cargar relato de ejemplo", then "Armar el día", then the "Alumno" and "Familia" tabs.
The free pictogram communicator needs no account: https://puentepictos.app/comunicador.html
If you need a reviewer account, write to soporte@puentepictos.app and we will create one for your email.
```

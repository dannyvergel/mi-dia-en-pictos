# Dos enfoques: escuela y equipo

Decisión del 2026-11-05. Al abrir un espacio se elige el enfoque. Se guarda en `escuelas.tipo`:

| tipo | Qué es | Quién manda |
|---|---|---|
| `escuela` | Como siempre: la dirección invita a las seños, los alumnos se asignan (`alumno_docentes`) y las familias entran por invitación. | La dirección (admins de la escuela) |
| `independiente` | PR #19: un/a profesional sin escuela con su propio espacio, donde es admin. Funciona igual que una escuela. | El/la profesional |
| `equipo` | **Nuevo.** Un espacio por chico. La familia es la dueña y aprueba a cada profesional. | La familia |

La migración es idempotente: suma una restricción `CHECK` con esos tres valores (corrige a `escuela` cualquier valor raro antes de crearla), la columna `escuelas.abierto_por`, la tabla `equipo_miembros` y dos columnas en `enlaces` (`rol`, `creado_por_familia`).

## Enfoque escuela
Sin cambios.

## Enfoque equipo

### Cómo se abre
- **Por ahora lo abre la plataforma** desde `admin.html`, en la tarjeta «Abrir un espacio de equipo (un chico)», igual que el link de independiente. Respeta los cupos y `PILOTO_SOLO_INVITACION`.
- Se crean el espacio, el alumno (nombre de pila) con su ficha vacía y el **link de la familia** (siempre). Si lo pidió un/a profesional, también se crea su link con el rol. Esa persona queda pendiente hasta que la familia la apruebe.
- Pendiente: que la familia o un/a profesional abran el espacio solos, sin pasar por la plataforma. Haría falta un formulario público con aprobación de la plataforma o un alta abierta con tope de cupos. Queda detrás de la invitación de plataforma.

### La familia es la dueña
- Da el consentimiento, como en la escuela.
- Ve a todo el equipo en `familia.html` («El equipo de …»), con email, rol y estado.
- **Aprueba o rechaza** a cada profesional que usó un link y **puede sacar** a cualquiera.
- Invita a profesionales con un link de un solo uso (7 días), para compartir por WhatsApp.
- Lo demás lo ve igual que hoy: el mínimo de `FAMILIA_FUNCIONES` (no se prendió nada). La gestión del equipo no depende de esa variable.

### Profesionales
- Se invitan por link, sin mandar mail. Al abrirlo, la persona pone su email y le llega el código, como siempre. El rol se elige de una lista (fono, TO, psicopedagoga, maestra integradora, docente, acompañante, psicóloga) o se escribe libre, hasta 40 caracteres.
- Pueden invitar: la familia, cualquier integrante con acceso o la plataforma. **Siempre queda pendiente hasta que la familia lo aprueba**, aunque la invitación la haya hecho la propia familia.
- La cuenta es una fila de `docentes`. Si la persona no tiene escuela, va con `escuela_id` NULL. Si ya era seño de una escuela, sigue en su escuela y además integra el equipo. Una misma persona puede estar en varios equipos.
- **Para ver algo hace falta estar aprobado por la familia y haber aceptado el compromiso de confidencialidad.** Se acepta con un checkbox en `docente.html` («Mis equipos») y se guardan la fecha, la versión del texto y la auditoría.
- Con acceso, ve el día, la ficha y los documentos del chico. Puede cargar el día, editar apoyos y objetivos, y subir documentos.
- No puede tocar el nombre, los contactos ni el consentimiento. Tampoco puede invitar familias, asignar, dar de baja familias ni borrar al chico (403), aunque sea admin de su propia escuela. Eso lo decide la familia, o la plataforma.
- Se puede ir del equipo por su cuenta.

### Compromiso de confidencialidad
- El texto está en `web/api/_lib/legal.js` (`TEXTO_CONFIDENCIALIDAD_EQUIPO`, versión `VERSION_CONFIDENCIALIDAD_EQUIPO = 2026-11-05-borrador`).
- **Es un BORRADOR pendiente de revisión legal.** Al cambiar el texto hay que subir la versión.
- `VERSION_PRIVACIDAD` no se tocó.

### Cupos
- Cada persona ocupa un cupo (`PILOTO_MAX_USUARIOS`): la familia y cada profesional **pendiente o aprobado**. Una seño que ya ocupaba un cupo por su escuela no suma otro. Alguien que está en varios equipos cuenta una sola vez.
- Rechazar, sacar o que la persona se vaya libera el cupo, salvo que siga ocupándolo por otro lado. **Desactivar el espacio** libera los cupos de todos: la familia y los profesionales dejan de contar y de entrar.

### Auditoría, bajas y exportación
- Se auditan estos eventos: `equipo_creado`, `miembro_alta` (usó el link y quedó pendiente), `miembro_aprobado`, `miembro_rechazado`, `miembro_baja` (con `por`: la familia, el/la profesional, baja de la familia o baja del alumno), `confidencialidad_aceptada` (con la versión) y los de invitación de siempre. Nunca llevan nombres, emails ni el rol (texto libre).
- **Baja de la familia**: si en el espacio no queda otra familia, el equipo se cierra. Todos los integrantes pasan a baja (auditada), se anulan los links pendientes y se borra su historial de chat con ese chico. Los datos del chico quedan.
- **Baja del alumno** (la plataforma): además de lo de siempre, cierra el equipo y desactiva el espacio.
- **Exportación de la familia**: trae `equipos`, con cada integrante (nombre, email, rol, estado, fechas, confidencialidad).

## Dónde está el código
- Regla de acceso centralizada en `web/api/_lib/alumnos.js`:
  - `condVisible` y `puedeVer` ya incluyen a los integrantes con acceso (`sqlMiembroConAcceso`).
  - `alumnoConAcceso(yo, id)` es el helper que usan los documentos.
  - `sqlEnEquipoVivo` sirve para el login y los cupos.
  - Están también las funciones del equipo: `miembrosDe`, `misEquipos`, `resolverMiembro`, `aceptarConfidencialidad`, `salirDelEquipo` y `cerrarEquipo`.
- Links: `web/api/_lib/enlaces.js` (`crearEquipo`, `crearMiembro`, `pendientesEquipo`, `revocarEnEquipo`, y el alta como pendiente en `verificar`).
- API sin funciones nuevas (Hobby 11/12):
  - `api/docentes.js`: `invitacion_crear` con `equipo_nuevo` o `equipo`, `GET ?equipos=1`, `equipo_confidencialidad` y `equipo_salir`.
  - `api/fichas.js`: para la familia, `equipo_invitar`, `equipo_aprobar`, `equipo_rechazar`, `equipo_quitar` y `equipo_link_revocar`; restricciones para los integrantes.
- Sesión y login: `_lib/seguridad.js` (`leerSesion`) y `_lib/identidad.js` (`cuentaPara`) dejan entrar a quien integra un equipo vivo aunque no tenga escuela.
- Cupos: `_lib/piloto.js` (`sqlUsados`).
- Tests: `web/test/equipos.test.js`.

## Pendientes para confirmar
- Revisión legal del compromiso de confidencialidad y de cómo encaja con el consentimiento de la familia (hoy la familia aprueba, pero no se exige el consentimiento dado para que el equipo vea).
- Apertura del espacio por la familia o un/a profesional sin la plataforma.
- Que la familia sume a otro familiar (por ahora lo hace la plataforma).
- Si un/a profesional integra dos equipos con chicos del mismo nombre de pila, el Cuaderno del día (que busca por nombre) toma el primero. Habría que elegir por id.

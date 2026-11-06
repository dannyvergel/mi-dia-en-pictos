// Esquema de Puente en Postgres. Todo es idempotente (IF NOT EXISTS):
// se aplica solo en el primer pedido de cada instancia, o a mano con `npm run migrar`.
// Privacidad: solo nombre de pila del alumno, sin fotos, sin campo de diagnóstico.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS escuelas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS docentes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    escuela_id BIGINT NOT NULL REFERENCES escuelas(id),
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    pass_hash TEXT,
    es_admin BOOLEAN NOT NULL DEFAULT false,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS alumnos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    escuela_id BIGINT NOT NULL REFERENCES escuelas(id),
    nombre TEXT NOT NULL,
    creado_por BIGINT REFERENCES docentes(id),
    blob_token TEXT UNIQUE,
    creado TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (escuela_id, nombre)
  )`,
  `CREATE TABLE IF NOT EXISTS fichas (
    alumno_id BIGINT PRIMARY KEY REFERENCES alumnos(id) ON DELETE CASCADE,
    contactos JSONB NOT NULL DEFAULT '[]',
    apoyos JSONB NOT NULL DEFAULT '{}',
    objetivos JSONB NOT NULL DEFAULT '[]',
    consentimiento JSONB NOT NULL DEFAULT '{"dado": false}',
    actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_por TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS familias (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS familia_alumno (
    familia_id BIGINT NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
    alumno_id BIGINT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
    PRIMARY KEY (familia_id, alumno_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sesiones (
    token_hash TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('docente', 'familia')),
    usuario_id BIGINT NOT NULL,
    expira TIMESTAMPTZ NOT NULL,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS codigos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL,
    codigo_hash TEXT NOT NULL,
    expira TIMESTAMPTZ NOT NULL,
    intentos INT NOT NULL DEFAULT 0,
    usado BOOLEAN NOT NULL DEFAULT false,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS codigos_email ON codigos (email, creado DESC)`,
  `CREATE TABLE IF NOT EXISTS limites (
    clave TEXT NOT NULL,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS limites_clave ON limites (clave, creado)`,
  // Las docentes entran con código por email (y más adelante SSO): la contraseña ya no se usa.
  // Columna vieja: queda, opcional y sin uso (migración idempotente).
  `ALTER TABLE docentes ALTER COLUMN pass_hash DROP NOT NULL`,
  // Los códigos sirven para docentes o familias, nunca cruzados.
  `ALTER TABLE codigos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'familia'`,
  `CREATE INDEX IF NOT EXISTS codigos_email_tipo ON codigos (email, tipo, creado DESC)`,
  // Pedidos de acceso de docentes nuevas (formulario público en /login.html).
  `CREATE TABLE IF NOT EXISTS solicitudes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    escuela TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT '',
    mensaje TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    creado TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelto TIMESTAMPTZ,
    resuelto_por BIGINT REFERENCES docentes(id),
    docente_id BIGINT REFERENCES docentes(id)
  )`,
  `CREATE INDEX IF NOT EXISTS solicitudes_estado ON solicitudes (estado, creado DESC)`,
  `CREATE INDEX IF NOT EXISTS solicitudes_email ON solicitudes (email)`,
  // Chat de la familia: historial del lado del servidor (el navegador ya no lo manda). Se borra a los 30 días.
  // Solo turnos en tema (pregunta + respuesta); usuario = cuenta de familia (o docente que prueba la vista).
  `CREATE TABLE IF NOT EXISTS chat_turnos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_tipo TEXT NOT NULL CHECK (usuario_tipo IN ('docente', 'familia')),
    usuario_id BIGINT NOT NULL,
    alumno_id BIGINT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
    rol TEXT NOT NULL CHECK (rol IN ('familia', 'puente')),
    texto TEXT NOT NULL,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS chat_turnos_cuenta ON chat_turnos (usuario_tipo, usuario_id, alumno_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS chat_turnos_creado ON chat_turnos (creado)`,
  // Ficha de escuela (la editan las docentes admin de esa escuela). cue = CUE + anexo del Padrón Oficial (9 dígitos), si se eligió de ahí.
  `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS cue TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS escuelas_cue ON escuelas (cue) WHERE cue IS NOT NULL`,
  ...["domicilio", "localidad", "departamento", "modalidad", "email", "telefono", "directivo_nombre", "directivo_email",
    "responsable_datos_nombre", "responsable_datos_email", "aval_por", "notas"]
    .map(c => `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS ${c} TEXT NOT NULL DEFAULT ''`),
  `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS aval_firmado BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS aval_fecha DATE`,
  `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS actualizado TIMESTAMPTZ`,
  `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS actualizado_por TEXT`,
  // La seño que pide acceso puede elegir su escuela del padrón: se guarda el CUE para aprobarla en la escuela correcta.
  `ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS cue TEXT`,
  // ---------- Roles ----------
  // Plataforma (superadmin): aprueba directoras de escuelas nuevas y ve todas las escuelas. ADMIN_EMAIL siempre lo es.
  `ALTER TABLE docentes ADD COLUMN IF NOT EXISTS es_plataforma BOOLEAN NOT NULL DEFAULT false`,
  // Una escuela desactivada por la plataforma: sus docentes y familias no entran.
  `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true`,
  // A quién va cada solicitud: 'escuela' (a las admins de escuela_id) o 'plataforma' (escuela nueva o "soy director/a").
  `ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS destino TEXT NOT NULL DEFAULT 'plataforma'`,
  `ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS escuela_id BIGINT REFERENCES escuelas(id)`,
  `ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS es_director BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS solicitudes_destino ON solicitudes (destino, escuela_id, estado)`,
  // Alumno ↔ docentes asignadas (maestra de grado, integradora, terapeuta…). Las admins de la escuela ven todos igual.
  `CREATE TABLE IF NOT EXISTS alumno_docentes (
    alumno_id BIGINT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
    docente_id BIGINT NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
    asignado TIMESTAMPTZ NOT NULL DEFAULT now(),
    asignado_por BIGINT,
    PRIMARY KEY (alumno_id, docente_id)
  )`,
  `CREATE INDEX IF NOT EXISTS alumno_docentes_docente ON alumno_docentes (docente_id)`,
  // Migraciones de datos que corren una sola vez (la fila marca que ya se aplicó).
  `CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // Una vez: los alumnos que ya existían sin asignaciones quedan asignados a todas las docentes activas de su escuela,
  // así nadie deja de ver lo que veía. Si dos instancias arrancan juntas, solo una inserta la marca y hace la copia.
  `WITH m AS (INSERT INTO migraciones (nombre) VALUES ('alumno_docentes_inicial') ON CONFLICT DO NOTHING RETURNING nombre)
   INSERT INTO alumno_docentes (alumno_id, docente_id)
   SELECT a.id, d.id FROM alumnos a JOIN docentes d ON d.escuela_id = a.escuela_id AND d.activo
   WHERE EXISTS (SELECT 1 FROM m) AND NOT EXISTS (SELECT 1 FROM alumno_docentes x WHERE x.alumno_id = a.id)
   ON CONFLICT DO NOTHING`,
  // Invitaciones por mail a las familias (una por email + alumno; se reenvía como mucho cada 24 h).
  `CREATE TABLE IF NOT EXISTS invitaciones (
    alumno_id BIGINT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    enviado TIMESTAMPTZ NOT NULL DEFAULT now(),
    enviado_por BIGINT,
    PRIMARY KEY (alumno_id, email)
  )`,
  // Importación masiva: grado del alumno ("3° B", "Sala de 5") y grado/rol de la docente ("Maestra de 3° B", "Integradora").
  `ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS grado TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE docentes ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT ''`,
  // ---------- Piloto: auditoría, bajas, retención, feedback ----------
  // Registro de accesos y acciones sensibles. Sin datos personales: email solo como HMAC (email_hash), IP truncada
  // (/24 en IPv4, /48 en IPv6), ids numéricos y un detalle chico sin nombres. Se borra a los AUDITORIA_RETENCION_DIAS.
  `CREATE TABLE IF NOT EXISTS auditoria (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    evento TEXT NOT NULL,
    actor_tipo TEXT,
    actor_id BIGINT,
    email_hash TEXT,
    escuela_id BIGINT,
    objeto_tipo TEXT,
    objeto_id BIGINT,
    ip TEXT,
    detalle JSONB NOT NULL DEFAULT '{}',
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS auditoria_creado ON auditoria (creado DESC)`,
  `CREATE INDEX IF NOT EXISTS auditoria_escuela ON auditoria (escuela_id, creado DESC)`,
  `CREATE INDEX IF NOT EXISTS auditoria_email ON auditoria (email_hash, evento, creado DESC)`,
  // Última publicación para la familia (para medir inactividad de la ficha en la retención).
  `ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS publicado TIMESTAMPTZ`,
  // Comentarios de docentes y familias ("Enviar comentario"). Se borra a los FEEDBACK_RETENCION_DIAS.
  `CREATE TABLE IF NOT EXISTS feedback (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    autor_tipo TEXT NOT NULL CHECK (autor_tipo IN ('docente', 'familia')),
    autor_id BIGINT NOT NULL,
    escuela_id BIGINT,
    pagina TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'leido')),
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS feedback_creado ON feedback (creado DESC)`,
  // ---------- Piloto cerrado: links de invitación ----------
  // Solo se guarda el hash (SHA-256) del token: el link completo se ve una sola vez, al crearlo.
  // tipo 'docente' (para una seño o directiva de escuela_id) o 'familia' (ligado a alumno_id). Por defecto 1 uso y 7 días.
  `CREATE TABLE IF NOT EXISTS enlaces (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('docente', 'familia')),
    escuela_id BIGINT NOT NULL REFERENCES escuelas(id) ON DELETE CASCADE,
    alumno_id BIGINT REFERENCES alumnos(id) ON DELETE CASCADE,
    es_admin BOOLEAN NOT NULL DEFAULT false,
    etiqueta TEXT NOT NULL DEFAULT '',
    vinculo TEXT NOT NULL DEFAULT '',
    usos_max INT NOT NULL DEFAULT 1,
    usos INT NOT NULL DEFAULT 0,
    expira TIMESTAMPTZ NOT NULL,
    creado TIMESTAMPTZ NOT NULL DEFAULT now(),
    creado_por BIGINT REFERENCES docentes(id) ON DELETE SET NULL,
    usado TIMESTAMPTZ,
    usado_por_tipo TEXT,
    usado_por BIGINT,
    revocado TIMESTAMPTZ,
    revocado_por BIGINT
  )`,
  `CREATE INDEX IF NOT EXISTS enlaces_escuela ON enlaces (escuela_id, creado DESC)`,
  `CREATE INDEX IF NOT EXISTS enlaces_alumno ON enlaces (alumno_id) WHERE alumno_id IS NOT NULL`,
  // ---------- Panel admin (plataforma) ----------
  // La primera cuenta (ADMIN_EMAIL) se crea sin escuela: la escuela de una docente pasa a ser opcional (solo la plataforma la deja vacía).
  `ALTER TABLE docentes ALTER COLUMN escuela_id DROP NOT NULL`,
  // ---------- Profesionales sin escuela ----------
  // Un/a profesional independiente (terapeuta, acompañante) tiene su propio "espacio": una fila de escuelas con tipo
  // 'independiente', sin CUE, donde es admin. Ocupa un cupo del piloto como cualquier docente.
  `ALTER TABLE escuelas ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'escuela'`,
  // ---------- Informes y documentos ----------
  // Archivos que suben las seños y terapeutas (PDF, JPG, PNG, DOCX; hasta 3 MB). El archivo va al Vercel Blob privado
  // (blob_ruta); acá solo los metadatos. La familia los ve solo si visible_familia. Nunca pasan por la IA. Ver docs/documentos.md.
  `CREATE TABLE IF NOT EXISTS documentos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alumno_id BIGINT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
    escuela_id BIGINT NOT NULL REFERENCES escuelas(id),
    subido_por BIGINT REFERENCES docentes(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('informe', 'documento')),
    titulo TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INT NOT NULL,
    blob_ruta TEXT NOT NULL UNIQUE,
    visible_familia BOOLEAN NOT NULL DEFAULT false,
    notificado TIMESTAMPTZ,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS documentos_alumno ON documentos (alumno_id, creado DESC)`,
  // ---------- Métricas de uso del piloto (ver _lib/metricas.js) ----------
  // Contadores diarios agregados por escuela. A propósito sin user_id, alumno_id, email, IP ni user agent.
  // escuela_id = 0: sin escuela. Se borra a los METRICAS_RETENCION_DIAS (400).
  `CREATE TABLE IF NOT EXISTS metricas_diarias (
    fecha DATE NOT NULL,
    escuela_id BIGINT NOT NULL DEFAULT 0,
    clave TEXT NOT NULL,
    cantidad INT NOT NULL DEFAULT 0,
    PRIMARY KEY (fecha, escuela_id, clave)
  )`
];

module.exports = { SCHEMA };

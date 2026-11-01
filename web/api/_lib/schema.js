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
  `CREATE INDEX IF NOT EXISTS chat_turnos_creado ON chat_turnos (creado)`
];

module.exports = { SCHEMA };

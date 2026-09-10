-- Esquema de autenticación — Postgres (Neon / Supabase / cualquier Postgres 13+).
--
-- Diferencia deliberada contra el esquema del documento de investigación
-- (implementar-seguridad/SeguidadApp.md §"Esquema de datos"): ahí todo cuelga de
-- `monday_user_id` como clave. Acá todo cuelga de `usuarios_autorizados.id`, y
-- `monday_user_id` queda como una columna de búsqueda más. El motivo es concreto: el
-- proveedor de identidad "contraseña" (§2.1 del documento, acceso fuera de monday)
-- produce usuarios que NO tienen monday_user_id, y con la clave del doc esos usuarios
-- no podrían tener 2FA ni dispositivos confiables. Con id interno, los dos proveedores
-- comparten exactamente las mismas tablas de MFA, recuperación y auditoría.

-- ESPEJO del tablero de monday "Usuario Habilitados - Lista Blanca" (18409461390), que es
-- la fuente de verdad de quién entra y con qué rol.
--
-- Esta tabla NO decide accesos: los relee de la copia del tablero en cada pedido (ver
-- lista_blanca_cache más abajo). Existe por dos motivos concretos:
--   1. Las tablas de MFA, códigos de recuperación, dispositivos y auditoría necesitan una
--      clave foránea estable. El id de un ítem de monday no sirve: si alguien borra la
--      fila y la vuelve a crear, cambia, y se perdería el enrolamiento de esa persona.
--   2. Guarda lo que el tablero no puede guardar: sesiones_validas_desde (revocación de
--      sesiones sin estado) y, si algún día se enciende, el hash de contraseña.
CREATE TABLE IF NOT EXISTS usuarios_autorizados (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email                  TEXT        NOT NULL,
  -- La clave del espejo es la FILA del tablero, no el usuario de monday.
  --
  -- Esa distinción es la que hace posible el selector de perfil: el asiento 95773286 lo
  -- comparten cuatro personas, cada una con su propia fila, y cada fila tiene que poder
  -- tener su propio enrolamiento de 2FA. Si la clave fuera monday_user_id, las cuatro
  -- compartirían un único secreto TOTP y elegir perfil no separaría nada.
  monday_item_id         BIGINT      NOT NULL UNIQUE,
  monday_user_id         BIGINT,                      -- repetido a propósito: varios perfiles por asiento
  monday_account_id      BIGINT,                      -- NULL para usuarios solo-contraseña
  -- rol/estado/team son copia de lo último que se leyó del tablero. Sirven para
  -- diagnóstico y auditoría; la decisión de cada pedido se toma sobre la copia fresca.
  rol                    TEXT        NOT NULL DEFAULT 'usuario',   -- 'admin' | 'usuario'
  estado                 TEXT        NOT NULL DEFAULT 'activo',    -- 'activo' | 'revocado'
  team                   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Proveedor "contraseña" (apagado por defecto, ver AUTH_PASSWORD_LOGIN). NULL = este
  -- usuario solo puede entrar desde dentro de monday.
  password_hash          TEXT,
  password_actualizado_en TIMESTAMPTZ,

  -- Revocación de sesiones sin estado: toda sesión emitida (iat) ANTES de este momento
  -- se rechaza. Es lo que permite "cerrar todas las sesiones" y que un cambio de
  -- contraseña invalide las viejas, sin guardar una lista de JWTs vivos.
  sesiones_validas_desde TIMESTAMPTZ NOT NULL DEFAULT now(),

  creado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso          TIMESTAMPTZ,

  CONSTRAINT usuarios_rol_valido    CHECK (rol IN ('admin', 'usuario')),
  CONSTRAINT usuarios_estado_valido CHECK (estado IN ('activo', 'revocado'))
);

-- El email NO es único, y no puede serlo: los cuatro perfiles del asiento compartido
-- resuelven al mismo correo de monday. El índice existe igual porque el proveedor
-- "contraseña" busca por ahí.
CREATE INDEX IF NOT EXISTS usuarios_email_idx ON usuarios_autorizados (lower(email));
CREATE INDEX IF NOT EXISTS usuarios_monday_user_id_idx ON usuarios_autorizados (monday_user_id);

CREATE TABLE IF NOT EXISTS mfa_usuarios (
  usuario_id       BIGINT PRIMARY KEY REFERENCES usuarios_autorizados(id) ON DELETE CASCADE,
  secreto_cifrado  TEXT        NOT NULL,   -- AES-256-GCM, clave en ENCRYPTION_KEY. Nunca en claro.
  confirmado_en    TIMESTAMPTZ,            -- NULL = enrolamiento pendiente, todavía no vale para entrar
  ultimo_periodo   BIGINT,                 -- anti-reutilización: último período TOTP ya consumido
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfa_codigos_recuperacion (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id   BIGINT      NOT NULL REFERENCES usuarios_autorizados(id) ON DELETE CASCADE,
  hash_codigo  TEXT        NOT NULL,       -- HMAC-SHA256 con pepper del servidor, nunca el código
  usado_en     TIMESTAMPTZ,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recuperacion_usuario_idx ON mfa_codigos_recuperacion (usuario_id) WHERE usado_en IS NULL;

CREATE TABLE IF NOT EXISTS dispositivos_confiables (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id   BIGINT      NOT NULL REFERENCES usuarios_autorizados(id) ON DELETE CASCADE,
  hash_token   TEXT        NOT NULL UNIQUE, -- HMAC-SHA256 del token opaco que guarda el navegador
  expira_en    TIMESTAMPTZ NOT NULL,        -- +30 días (AUTH_DEVICE_TTL_DIAS)
  user_agent   TEXT,
  ip           TEXT,
  ultimo_uso   TIMESTAMPTZ,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispositivos_usuario_idx ON dispositivos_confiables (usuario_id);

-- La copia del tablero de la lista blanca. Una sola fila, pisada cada vez que se refresca.
--
-- Vive en Postgres y no en memoria por lo mismo de siempre: cada invocación serverless
-- arranca con la memoria vacía, así que una caché en memoria haría que la API de monday se
-- consultara prácticamente en cada ingreso. Acá la copia se comparte entre todas las
-- invocaciones y entre todas las regiones, y se refresca una vez por TTL.
CREATE TABLE IF NOT EXISTS lista_blanca_cache (
  id              INT PRIMARY KEY DEFAULT 1,
  entradas        JSONB       NOT NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lista_blanca_una_sola_fila CHECK (id = 1)
);

-- Caché de la resolución monday_user_id -> email. En el documento figura como "cacheado
-- 24hs", pero una caché en memoria no sirve acá: cada invocación serverless de Vercel
-- arranca con la memoria vacía, así que en la práctica se consultaría la API de monday
-- en casi todos los ingresos. Por eso vive en la base, que es el único estado que
-- sobrevive entre invocaciones.
CREATE TABLE IF NOT EXISTS monday_usuarios_cache (
  monday_user_id  BIGINT PRIMARY KEY,
  email           TEXT        NOT NULL,
  nombre          TEXT,
  habilitado      BOOLEAN     NOT NULL DEFAULT TRUE,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate limiting de respaldo, para cuando NO hay Upstash configurado. Es un contador de
-- ventana deslizante hecho a mano: se insertan intentos y se cuentan los recientes.
-- Upstash es mejor (no toca la base, latencia menor); esto existe para que el límite
-- nunca quede desactivado por falta de una variable de entorno.
CREATE TABLE IF NOT EXISTS intentos_rate_limit (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave      TEXT        NOT NULL,   -- ej. 'mfa:12' o 'login:ip:1.2.3.4'
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_clave_idx ON intentos_rate_limit (clave, creado_en DESC);

CREATE TABLE IF NOT EXISTS auditoria (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  BIGINT,                       -- sin FK: se auditan también intentos de gente que NO existe
  email       TEXT,
  monday_user_id BIGINT,
  accion      TEXT        NOT NULL,         -- 'ingreso_ok' | 'no_autorizado' | 'mfa_fallido' | ...
  ip          TEXT,
  user_agent  TEXT,
  detalle     JSONB,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auditoria_creado_idx  ON auditoria (creado_en DESC);
CREATE INDEX IF NOT EXISTS auditoria_usuario_idx ON auditoria (usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS auditoria_accion_idx  ON auditoria (accion, creado_en DESC);

-- ============================================================
-- MIGRACIÓN MULTI-TENANT (SaaS) — MenuGo
-- ------------------------------------------------------------
-- Añade la entidad `restaurantes` (configurable por tenant)
-- y columna `id_restaurante` en todas las tablas de negocio,
-- con aislamiento garantizado por ROW LEVEL SECURITY.
--
-- El tenant activo por conexión viene del GUC `menugo.tenant_id`
-- (seteado por el backend mediante AsyncLocalStorage en cada
-- query). La función `menugo_tenant()` devuelve ese valor; si no
-- está definido, asume el restaurante por defecto (id 1).
--
-- Se puede ejecutar múltiples veces (idempotente).
-- ============================================================

BEGIN;

-- 1) Entidad restaurante (configuración por tenant)
CREATE TABLE IF NOT EXISTS restaurantes (
  id_restaurante  SERIAL PRIMARY KEY,
  slug            VARCHAR(80)  NOT NULL UNIQUE,
  nombre          VARCHAR(140) NOT NULL,
  slogan          VARCHAR(255),
  logo_url        TEXT,
  color_primario  VARCHAR(20)  NOT NULL DEFAULT '#2563EB',
  color_secundario VARCHAR(20) NOT NULL DEFAULT '#0F172A',
  moneda          VARCHAR(8)   NOT NULL DEFAULT 'S/',
  igv             NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  serie_boleta    VARCHAR(4)   NOT NULL DEFAULT 'B001',
  telefono        VARCHAR(20),
  direccion       VARCHAR(255),
  ruc             VARCHAR(11),
  config          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  activo          BOOLEAN      NOT NULL DEFAULT true,
  fecha_creacion  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Restaurante por defecto (el MenuGo actual).
INSERT INTO restaurantes (slug, nombre, slogan, color_primario, color_secundario, moneda, igv, serie_boleta, config)
VALUES ('menugo', 'MenuGo', 'Pide y paga desde tu mesa', '#2563EB', '#0F172A', 'S/', 18.00, 'B001', '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 2) Función del tenant activo (default: restaurante 1)
CREATE OR REPLACE FUNCTION menugo_tenant() RETURNS integer AS $$
  SELECT COALESCE(NULLIF(current_setting('menugo.tenant_id', true), '')::integer, 1)
$$ LANGUAGE sql STABLE;

-- 3) Helper: preparar una tabla (columna tenant + uniques + RLS)
CREATE OR REPLACE FUNCTION _menugo_apply_tenant(p_table text, p_drops text[]) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  nm  text;
  pol text;
BEGIN
  EXECUTE format(
    'ALTER TABLE %s ADD COLUMN IF NOT EXISTS id_restaurante INTEGER NOT NULL DEFAULT 1 REFERENCES restaurantes(id_restaurante)',
    p_table
  );

  -- quitar uniques globales (o índices únicos) heredados
  IF p_drops IS NOT NULL THEN
    FOREACH nm IN ARRAY p_drops LOOP
      BEGIN
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I CASCADE', p_table, nm);
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
    FOREACH nm IN ARRAY p_drops LOOP
      BEGIN
        EXECUTE format('DROP INDEX IF EXISTS %I CASCADE', nm);
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  -- los inserts nuevos se etiquetan con el tenant activo
  EXECUTE format('ALTER TABLE %s ALTER COLUMN id_restaurante SET DEFAULT menugo_tenant()', p_table);

  -- índice para el estallido de filtrado RLS
  pol := 'idx_' || replace(p_table, '.', '_') || '_tenant';
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s(id_restaurante)', pol, p_table);

  -- Row Level Security (incluso contra el propietario)
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);

  pol := 'tenant_' || replace(p_table, '.', '_');
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol, p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %s USING (id_restaurante = menugo_tenant()) WITH CHECK (id_restaurante = menugo_tenant())',
    pol, p_table
  );
END $$;

-- 4) Tablas dinámicas creadas por el backend (asegurar 'id_restaurante' en re-creación)
CREATE TABLE IF NOT EXISTS solicitudes_cuenta (
  id_solicitud SERIAL PRIMARY KEY,
  id_grupo_mesa INTEGER NOT NULL REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE CASCADE,
  id_cuenta INTEGER REFERENCES cuentas(id_cuenta) ON DELETE SET NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  nota TEXT,
  fecha_solicitud TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atendido_at TIMESTAMP,
  id_restaurante INTEGER NOT NULL DEFAULT 1 REFERENCES restaurantes(id_restaurante),
  CONSTRAINT chk_solicitud_estado CHECK (estado IN ('pendiente', 'atendida', 'cancelada'))
);

CREATE TABLE IF NOT EXISTS comentarios_mesa (
  id_comentario_mesa SERIAL PRIMARY KEY,
  id_mesa INTEGER REFERENCES mesas(id_mesa) ON DELETE SET NULL,
  numero_mesa INTEGER NOT NULL,
  id_grupo_mesa INTEGER REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE SET NULL,
  id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
  motivo VARCHAR(80) NOT NULL,
  detalle TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atendido_at TIMESTAMP,
  id_restaurante INTEGER NOT NULL DEFAULT 1 REFERENCES restaurantes(id_restaurante),
  CONSTRAINT chk_comentario_mesa_estado CHECK (estado IN ('pendiente', 'atendido', 'cancelado'))
);

-- índices de las tablas dinámicas (se crean aquí como postgres; a runtime son no-op)
CREATE INDEX IF NOT EXISTS idx_comentarios_mesa_pendientes ON comentarios_mesa(numero_mesa, estado, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_cuenta_pendientes ON solicitudes_cuenta(id_grupo_mesa, estado, fecha_solicitud DESC);

-- columnas QR de las mesas (creadas por la migración para que el boot no necesite DDL como menugo_app)
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS qr_token VARCHAR(120);
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS qr_activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 5) Aplicar a todas las tablas de negocio
-- Nota: se conservan los uniques globales sobre ids globales (qr_token, id_pago, id_detalle_producto)
-- porque siguen siendo únicos incluso en multi-tenant y son objetivo de ON CONFLICT.
SELECT _menugo_apply_tenant('administrador',         ARRAY['administrador_usuario_key','administrador_correo_key']);
SELECT _menugo_apply_tenant('trabajador',            ARRAY['trabajador_documento_key','idx_trabajador_usuario_acceso','idx_trabajador_correo_acceso']);
SELECT _menugo_apply_tenant('usuarios',              ARRAY['usuarios_telefono_key']);
SELECT _menugo_apply_tenant('mesas',                 ARRAY['mesas_numero_mesa_key']);
SELECT _menugo_apply_tenant('platos',                ARRAY['platos_codigo_plato_key','uq_platos_codigo']);
SELECT _menugo_apply_tenant('bebidas',               ARRAY['bebidas_codigo_bebida_key','uq_bebidas_codigo']);
SELECT _menugo_apply_tenant('grupos_mesa',           NULL);
SELECT _menugo_apply_tenant('grupo_mesa_detalle',    NULL);
SELECT _menugo_apply_tenant('mesas_historial',       NULL);
SELECT _menugo_apply_tenant('pedidos',               NULL);
SELECT _menugo_apply_tenant('detalle_producto',      NULL);
SELECT _menugo_apply_tenant('seguimiento_cocina',    NULL);
SELECT _menugo_apply_tenant('cuentas',               NULL);
SELECT _menugo_apply_tenant('pagos',                 NULL);
SELECT _menugo_apply_tenant('comprobantes',          NULL);
SELECT _menugo_apply_tenant('detalle_pago',          NULL);
SELECT _menugo_apply_tenant('solicitudes_cuenta',    NULL);
SELECT _menugo_apply_tenant('comentarios_mesa',      NULL);

-- 6) Uniques por restaurante (las mismas mesas/productos pueden existir en varios tenants)
CREATE UNIQUE INDEX IF NOT EXISTS uq_mesas_tenant_numero          ON mesas(id_restaurante, numero_mesa);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platos_tenant_codigo         ON platos(id_restaurante, codigo_plato);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bebidas_tenant_codigo        ON bebidas(id_restaurante, codigo_bebida);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_tenant_telefono     ON usuarios(id_restaurante, telefono);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_tenant_usuario         ON administrador(id_restaurante, usuario);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_tenant_correo          ON administrador(id_restaurante, correo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trabajador_tenant_documento  ON trabajador(id_restaurante, documento);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trabajador_tenant_usuarioacc ON trabajador(id_restaurante, usuario_acceso);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trabajador_tenant_correo     ON trabajador(id_restaurante, correo);

-- el token QR sigue siendo único globalmente (evita reutilizar un QR entre restaurantes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mesas_qr_token ON mesas(qr_token) WHERE qr_token IS NOT NULL;

COMMIT;
const { adminPool } = require('./src/config/db');

const sql = `
CREATE OR REPLACE FUNCTION menugo_login_admin(p_usuario TEXT)
RETURNS TABLE (
  idadministrador INTEGER,
  usuario TEXT,
  clave TEXT,
  nombrecompleto TEXT,
  correo TEXT,
  estado BOOLEAN,
  id_restaurante INTEGER,
  restaurante_slug VARCHAR,
  restaurante_nombre VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.idadministrador, a.usuario::TEXT, a.clave::TEXT, a.nombrecompleto::TEXT, a.correo::TEXT, a.estado,
         a.id_restaurante, r.slug::VARCHAR, r.nombre::VARCHAR
  FROM administrador a
  LEFT JOIN restaurantes r ON r.id_restaurante = a.id_restaurante
  WHERE LOWER(a.usuario) = LOWER(p_usuario) OR LOWER(a.correo) = LOWER(p_usuario)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
`;

adminPool.query(sql)
  .then(() => { console.log('✓ Function menugo_login_admin created'); process.exit(0); })
  .catch(e => { console.error('Error:', e.message); process.exit(1); });

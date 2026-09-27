const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

// Connect as postgres superuser to create function with postgres ownership
const pgPool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "Menu_Go",
  user: "postgres",
  password: process.env.DB_PASSWORD,
});

async function recreate() {
  await pgPool.query(`
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
  `);
  // Verify owner
  const r = await pgPool.query(`SELECT proowner::regrole FROM pg_proc WHERE proname = 'menugo_login_admin'`);
  console.log("Owner:", r.rows[0].proowner);
  // Grant execute
  await pgPool.query("GRANT EXECUTE ON FUNCTION menugo_login_admin(TEXT) TO menugo_app");
  await pgPool.query("GRANT EXECUTE ON FUNCTION menugo_login_admin(TEXT) TO PUBLIC");
  console.log("Permissions granted");
  // Test
  const t = await pgPool.query("SELECT * FROM menugo_login_admin('admin')");
  console.log("Sushimi test:", JSON.stringify(t.rows[0]));
  await pgPool.end();
  process.exit(0);
}
recreate().catch(e => { console.error(e.message); process.exit(1); });

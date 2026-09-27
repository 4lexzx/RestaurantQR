const bcrypt = require("bcryptjs");
const { adminPool } = require("./src/config/db");

async function setup() {
  const client = await adminPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_login (
        id SERIAL PRIMARY KEY,
        id_restaurante INTEGER NOT NULL,
        usuario VARCHAR(100) NOT NULL,
        clave VARCHAR(255) NOT NULL,
        nombre VARCHAR(255),
        correo VARCHAR(255),
        estado BOOLEAN DEFAULT true,
        restaurante_slug VARCHAR(100),
        restaurante_nombre VARCHAR(255),
        UNIQUE(id_restaurante, usuario)
      );
    `);
    console.log("✓ Table admin_login created");
    await client.query("ALTER TABLE admin_login DISABLE ROW LEVEL SECURITY").catch(() => {});

    const admins = await client.query(`
      SELECT a.idadministrador, a.usuario, a.clave, a.nombrecompleto, a.correo, a.estado,
             a.id_restaurante, r.slug AS restaurante_slug, r.nombre AS restaurante_nombre
      FROM administrador a
      JOIN restaurantes r ON r.id_restaurante = a.id_restaurante
    `);
    console.log(`Found ${admins.rows.length} admins to seed`);

    for (const a of admins.rows) {
      await client.query(`
        INSERT INTO admin_login (id_restaurante, usuario, clave, nombre, correo, estado, restaurante_slug, restaurante_nombre)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id_restaurante, usuario) DO UPDATE SET
          clave = EXCLUDED.clave, nombre = EXCLUDED.nombre, correo = EXCLUDED.correo,
          estado = EXCLUDED.estado, restaurante_slug = EXCLUDED.restaurante_slug,
          restaurante_nombre = EXCLUDED.restaurante_nombre
      `, [a.id_restaurante, a.usuario, a.clave, a.nombrecompleto, a.correo, a.estado, a.restaurante_slug, a.restaurante_nombre]);
    }
    console.log("✓ Admins seeded");

    await client.query("DROP FUNCTION IF EXISTS menugo_login_admin(TEXT)");
    await client.query(`
      CREATE OR REPLACE FUNCTION menugo_login_admin(p_usuario TEXT)
      RETURNS TABLE (
        idadministrador INTEGER,
        usuario TEXT,
        clave TEXT,
        nombrecompleto TEXT,
        correo TEXT,
        estado BOOLEAN,
        id_restaurante INTEGER,
        restaurante_slug TEXT,
        restaurante_nombre TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT al.id, al.usuario::TEXT, al.clave::TEXT, al.nombre::TEXT, al.correo::TEXT, al.estado,
               al.id_restaurante, al.restaurante_slug::TEXT, al.restaurante_nombre::TEXT
        FROM admin_login al
        WHERE (LOWER(al.usuario) = LOWER(p_usuario) OR LOWER(al.correo) = LOWER(p_usuario))
          AND al.estado = true
        LIMIT 1;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
    `);
    console.log("✓ Function recreated");

    await client.query("GRANT EXECUTE ON FUNCTION menugo_login_admin(TEXT) TO PUBLIC");
    console.log("✓ GRANT EXECUTE");

    const t1 = await client.query("SELECT * FROM menugo_login_admin('omaradmin')");
    console.log("Menugo:", JSON.stringify(t1.rows[0]));
    const t2 = await client.query("SELECT * FROM menugo_login_admin('admin')");
    console.log("Sushimi:", JSON.stringify(t2.rows[0]));
  } finally { client.release(); }
  process.exit(0);
}

setup().catch(e => { console.error("ERROR:", e.message); process.exit(1); });

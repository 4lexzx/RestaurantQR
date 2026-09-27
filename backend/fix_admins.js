const bcrypt = require("bcryptjs");
const { adminPool } = require("./src/config/db");

async function fix() {
  const client = await adminPool.connect();
  try {
    // Create Sushimi admin in administrador (with tenant set)
    const hashSushimi = await bcrypt.hash("Admin123#", 10);
    const check = await client.query(
      "SELECT set_config('menugo.tenant_id', '2', false)"
    );
    const existing = await client.query(
      `SELECT idadministrador FROM administrador WHERE id_restaurante = 2 AND LOWER(usuario) = 'admin'`
    );
    if (existing.rows.length === 0) {
      await client.query(`
        INSERT INTO administrador (usuario, clave, nombrecompleto, correo, estado, id_restaurante)
        VALUES ('admin', $1, 'Administrador Sushimi', 'admin@sushimi.com', true, 2)
      `, [hashSushimi]);
      console.log("✓ Created Sushimi admin in administrador");
    } else {
      console.log("Sushimi admin already exists in administrador");
    }

    // Now read all admins (set each tenant and read)
    // Menugo admins (tenant 1)
    await client.query("SELECT set_config('menugo.tenant_id', '1', false)");
    const menugoAdmins = await client.query(`
      SELECT a.usuario, a.clave, a.nombrecompleto, a.correo, a.estado,
             a.id_restaurante, r.slug AS restaurante_slug, r.nombre AS restaurante_nombre
      FROM administrador a
      JOIN restaurantes r ON r.id_restaurante = a.id_restaurante
    `);

    // Sushimi admins (tenant 2)
    await client.query("SELECT set_config('menugo.tenant_id', '2', false)");
    const sushimiAdmins = await client.query(`
      SELECT a.usuario, a.clave, a.nombrecompleto, a.correo, a.estado,
             a.id_restaurante, r.slug AS restaurante_slug, r.nombre AS restaurante_nombre
      FROM administrador a
      JOIN restaurantes r ON r.id_restaurante = a.id_restaurante
    `);

    const allAdmins = [...menugoAdmins.rows, ...sushimiAdmins.rows];
    console.log(`Found ${allAdmins.length} total admins`);

    // Re-seed admin_login
    await client.query("DELETE FROM admin_login");
    for (const a of allAdmins) {
      await client.query(`
        INSERT INTO admin_login (id_restaurante, usuario, clave, nombre, correo, estado, restaurante_slug, restaurante_nombre)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [a.id_restaurante, a.usuario, a.clave, a.nombrecompleto, a.correo, a.estado, a.restaurante_slug, a.restaurante_nombre]);
    }
    console.log(`✓ Re-seeded ${allAdmins.length} admins`);

    // Test
    await client.query("RESET menugo.tenant_id");
    const t1 = await client.query("SELECT * FROM menugo_login_admin('omaradmin')");
    console.log("Menugo:", t1.rows[0]?.usuario, "→", t1.rows[0]?.restaurante_slug);
    const t2 = await client.query("SELECT * FROM menugo_login_admin('admin')");
    console.log("Sushimi:", t2.rows[0]?.usuario, "→", t2.rows[0]?.restaurante_slug);

    const ok = await bcrypt.compare("Admin123#", t2.rows[0]?.clave);
    console.log("Sushimi bcrypt:", ok);
    const ok2 = await bcrypt.compare("omar1234", t1.rows[0]?.clave);
    console.log("Menugo bcrypt:", ok2);
  } finally { client.release(); }
  process.exit(0);
}

fix().catch(e => { console.error("ERROR:", e.message); process.exit(1); });

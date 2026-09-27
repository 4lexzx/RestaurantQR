const bcrypt = require("bcryptjs");
const { adminPool } = require("./src/config/db");

async function seed() {
  const client = await adminPool.connect();
  try {
    const admins = [
      { restaurante: "menugo",  usuario: "omaradmin", clave: "omar1234" },
      { restaurante: "sushimi", usuario: "admin",     clave: "Admin123#" },
    ];
    for (const a of admins) {
      const hash = await bcrypt.hash(a.clave, 10);
      const match = await bcrypt.compare(a.clave, hash);
      console.log(`${a.usuario}: hash ok=${match}`);

      const { rows } = await client.query(
        `SELECT id_restaurante FROM restaurantes WHERE slug = $1`, [a.restaurante]
      );
      if (!rows.length) { console.warn(`  ${a.restaurante} not found`); continue; }
      const idRest = rows[0].id_restaurante;

      await client.query(`SELECT set_config('menugo.tenant_id', $1, false)`, [String(idRest)]);
      await client.query(
        `UPDATE administrador SET clave = $1, estado = true WHERE LOWER(usuario) = LOWER($2) AND id_restaurante = $3`,
        [hash, a.usuario, idRest]
      );
      console.log(`  Updated ${a.usuario} for ${a.restaurante}`);
    }
  } finally { client.release(); }
  process.exit(0);
}
seed().catch(e => { console.error(e.message); process.exit(1); });

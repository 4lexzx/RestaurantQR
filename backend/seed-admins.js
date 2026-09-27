/**
 * Semilla de admins de restaurante.
 * Ejecutar: node seed-admins.js
 */
const bcrypt = require("bcryptjs");
const { adminPool } = require("./src/config/db");

const ADMINS = [
  { restaurante: "menugo",   usuario: "omaradmin", clave: "omar1234",  nombre: "Omar Admin",    correo: "omar@menugo.com" },
  { restaurante: "sushimi",  usuario: "admin",     clave: "Admin123#", nombre: "Admin Sushimi", correo: "admin@sushimi.com" },
];

async function seed() {
  const client = await adminPool.connect();
  try {
    for (const a of ADMINS) {
      const hash = await bcrypt.hash(a.clave, 10);
      const { rows } = await client.query(
        `SELECT id_restaurante FROM restaurantes WHERE slug = $1`,
        [a.restaurante]
      );
      if (!rows.length) {
        console.warn(`Restaurante "${a.restaurante}" no existe — saltando.`);
        continue;
      }
      const idRest = rows[0].id_restaurante;

      // Set tenant context for RLS
      await client.query(`SELECT set_config('menugo.tenant_id', $1, false)`, [String(idRest)]);

      const existing = await client.query(
        `SELECT idadministrador FROM administrador WHERE LOWER(usuario) = LOWER($1) AND id_restaurante = $2`,
        [a.usuario, idRest]
      );

      if (existing.rows.length) {
        await client.query(
          `UPDATE administrador SET clave = $1, estado = true WHERE idadministrador = $2`,
          [hash, existing.rows[0].idadministrador]
        );
        console.log(`✓ Admin "${a.usuario}" actualizado para ${a.restaurante} (id=${idRest})`);
      } else {
        await client.query(
          `INSERT INTO administrador (usuario, clave, nombrecompleto, correo, estado, id_restaurante)
           VALUES ($1, $2, $3, $4, true, $5)`,
          [a.usuario, hash, a.nombre, a.correo, idRest]
        );
        console.log(`✓ Admin "${a.usuario}" creado para ${a.restaurante} (id=${idRest})`);
      }
    }
  } finally {
    client.release();
  }
  process.exit(0);
}

seed().catch((e) => { console.error("Error:", e.message); process.exit(1); });

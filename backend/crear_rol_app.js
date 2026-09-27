require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Crea (o actualiza) el rol de aplicación no-superusuario `menugo_app`.
// Motivo: postgres es superusuario => PostgreSQL SIEMPRE se salta el Row Level
// Security incluso con FORCE, así que el aislamiento por tenant solo funciona
// si la app conecta con un rol sin BYPASSRLS.
const password = crypto.randomBytes(18).toString("base64url");

async function main(adminPool) {
  await adminPool.query(`
    DO $do$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'menugo_app') THEN
        CREATE ROLE menugo_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
      ELSE
        ALTER ROLE menugo_app WITH LOGIN PASSWORD '${password}';
      END IF;
    END $do$;
  `);

  await adminPool.query(`GRANT USAGE ON SCHEMA public TO menugo_app`);
  await adminPool.query(`GRANT CREATE ON SCHEMA public TO menugo_app`);
  await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO menugo_app`);
  await adminPool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO menugo_app`);

  console.log("Rol menugo_app creado/actualizado y permisos otorgados.");

  // Verificación de aislamiento conectando COMO menugo_app
  const appPool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "Menu_Go",
    user: "menugo_app",
    password,
    max: 5,
  });

  const c = await appPool.connect();
  try {
    await c.query("SELECT set_config('menugo.tenant_id', '2', false)");
    const r2 = await c.query("SELECT count(*)::int AS n FROM platos");
    console.log(`AISLADO tenant=2 -> ${r2.rows[0].n} platos (esperado 0)`);

    await c.query("SELECT set_config('menugo.tenant_id', '1', false)");
    const r1 = await c.query("SELECT count(*)::int AS n FROM platos");
    console.log(`AISLADO tenant=1 -> ${r1.rows[0].n} platos (esperado >0)`);

    const rS = await c.query("SELECT slug FROM restaurantes ORDER BY id_restaurante");
    console.log("restaurantes visibles:", JSON.stringify(rS.rows.map((x) => x.slug)));
  } finally {
    c.release();
    await appPool.end();
  }

  // Actualizar .env para que los pools usen el rol de aplicación
  const rutaEnv = path.join(__dirname, ".env");
  let env = fs.readFileSync(rutaEnv, "utf8");
  env = env
    .replace(/^DB_USER=.*$/m, "DB_USER=menugo_app")
    .replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${password}`)
    .replace(/^# DB_USER_ADMIN=.*$/m, "DB_USER_ADMIN=menugo_app")
    .replace(/^# DB_PASS_ADMIN=.*$/m, `DB_PASS_ADMIN=${password}`)
    .replace(/^# DB_USER_MESERO=.*$/m, "DB_USER_MESERO=menugo_app")
    .replace(/^# DB_PASS_MESERO=.*$/m, `DB_PASS_MESERO=${password}`)
    .replace(/^# DB_USER_COCINA=.*$/m, "DB_USER_COCINA=menugo_app")
    .replace(/^# DB_PASS_COCINA=.*$/m, `DB_PASS_COCINA=${password}`)
    .replace(/^# DB_USER_CLIENTE=.*$/m, "DB_USER_CLIENTE=menugo_app")
    .replace(/^# DB_PASS_CLIENTE=.*$/m, `DB_PASS_CLIENTE=${password}`);
  fs.writeFileSync(rutaEnv, env);
  console.log(".env actualizado (pools -> menugo_app).");
}

require("dotenv").config();
const { adminPool } = require("./src/config/db");
main(adminPool)
  .then(() => adminPool.end())
  .catch((e) => {
    console.error("FAIL", e.message);
    adminPool.end();
    process.exit(1);
  });
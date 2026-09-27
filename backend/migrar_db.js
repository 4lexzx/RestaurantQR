// Utilidad: aplica la migración multi-tenant conectando con el rol DUEÑO de la BD
// (postgres). El runtime del backend usa menugo_app (sin DDL), por eso esta
// herramienta se ejecuta aparte como postgres.
// Uso: node migrar_db.js (requiere DB_OWNER_USER y DB_OWNER_PASS en .env)
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const dueO = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "Menu_Go",
  user: process.env.DB_OWNER_USER || "postgres",
  password: process.env.DB_OWNER_PASS,
});

const ruta = path.join(__dirname, "../database/saas_multi_tenant_migration.sql");

(async () => {
  const sql = fs.readFileSync(ruta, "utf8");
  const c = await dueO.connect();
  try {
    await c.query("SET lock_timeout = 15000");
    await c.query(sql);
    const r = await c.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'mesas' AND column_name IN ('qr_token', 'qr_activo')`);
    console.log("MIGRACION OK, columnas mesas:", JSON.stringify(r.rows.map((x) => x.column_name)));
  } finally {
    c.release();
    await dueO.end();
  }
})().catch((e) => {
  console.error("MIGRACION FAIL", e.message);
  process.exit(1);
});

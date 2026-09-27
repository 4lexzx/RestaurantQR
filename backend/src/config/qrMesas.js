const { rootPool: pool } = require("./db");

// Tokens por restaurante: cada tenant tiene sus propias mesas y QRs únicos globalmente.
function tokenPorMesa(idRestaurante, numero) {
  const hex = Math.random().toString(16).slice(2, 12).toUpperCase();
  return `MG-${Number(idRestaurante)}-MESA-${String(Number(numero) || 1).padStart(2, "0")}-${hex}`;
}

// Crea/verifica las mesas (1..N) y su QR para TODOS los restaurantes activos.
// Nota: las columnas qr_token/qr_activo las agrega la migración (database/saas_multi_tenant_migration.sql);
// aquí solo se hace DML (inserts idempotentes), evita DDL porque la app corre con el rol menugo_app.
async function prepararQrMesas() {
  const { rows } = await pool.query(
    `SELECT id_restaurante, config
     FROM restaurantes
     WHERE activo = true
     ORDER BY id_restaurante ASC`
  );

  for (const restaurante of rows) {
    const idRestaurante = Number(restaurante.id_restaurante);
    const numMesas = Number((restaurante.config && restaurante.config.num_mesas) || 20);

    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('menugo.tenant_id', $1, false)", [String(idRestaurante)]);

      for (let numero = 1; numero <= numMesas; numero++) {
        await client.query(
          `INSERT INTO mesas (numero_mesa, activo, qr_token, qr_activo, id_restaurante)
           VALUES ($1, true, $2, true, $3)
           ON CONFLICT (id_restaurante, numero_mesa)
           DO UPDATE SET
             qr_token = COALESCE(mesas.qr_token, EXCLUDED.qr_token),
             qr_activo = true,
             activo = true`,
          [numero, tokenPorMesa(idRestaurante, numero), idRestaurante]
        );
      }
      await client.query(
        `UPDATE mesas
         SET activo = false, qr_activo = false
         WHERE id_restaurante = $1 AND numero_mesa > $2`,
        [idRestaurante, numMesas]
      );
    } finally {
      client.release();
    }
  }
}

function obtenerTokenMesa(numero) {
  return tokenPorMesa(0, numero);
}

module.exports = { prepararQrMesas, obtenerTokenMesa };

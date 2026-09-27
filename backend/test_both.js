const { pool, adminPool } = require('./src/config/db');

async function test() {
  // Check database name
  const dbResult = await pool.query('SELECT current_database()');
  console.log('pool DB:', dbResult.rows[0].current_database);

  // Try calling function via pool
  try {
    const r = await pool.query("SELECT * FROM menugo_login_admin('omaradmin')");
    console.log('pool result:', JSON.stringify(r.rows[0]));
  } catch (e) {
    console.log('pool error:', e.message);
  }

  // Try calling function via adminPool
  try {
    const r2 = await adminPool.query("SELECT * FROM menugo_login_admin('omaradmin')");
    console.log('adminPool result:', JSON.stringify(r2.rows[0]));
  } catch (e) {
    console.log('adminPool error:', e.message);
  }

  process.exit(0);
}
test();

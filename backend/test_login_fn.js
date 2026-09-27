const { adminPool } = require('./src/config/db');

async function test() {
  const r = await adminPool.query("SELECT proname FROM pg_proc WHERE proname = 'menugo_login_admin'");
  console.log('found:', r.rows.length);
  if (r.rows.length) {
    const r2 = await adminPool.query("SELECT * FROM menugo_login_admin('omaradmin')");
    console.log('omaradmin result:', JSON.stringify(r2.rows[0]));
  } else {
    console.log('Function NOT found in database');
  }
  process.exit(0);
}
test().catch(e => { console.error(e.message); process.exit(1); });

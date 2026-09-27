const { adminPool } = require('./src/config/db');
adminPool.query(`SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'menugo_login_admin'`)
  .then(r => { console.log(JSON.stringify(r.rows)); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });

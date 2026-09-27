const { Pool } = require("pg");
const { AsyncLocalStorage } = require("async_hooks");
require("dotenv").config();

// Almacena el tenant activo durante cada request (seteado por el middleware de tenant).
const als = new AsyncLocalStorage();

function getTenantActivo() {
  const ctx = als.getStore();
  return ctx && ctx.tenant ? ctx.tenant : null;
}

function idTenant(tenant) {
  if (!tenant) return null;
  const v = Number(tenant.id_restaurante ?? tenant.id);
  return Number.isInteger(v) && v > 0 ? v : null;
}

function crearPoolLocal(usuario, password) {
  return new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "Menu_Go",
    user: usuario,
    password,
  });
}

function crearPoolNeon() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

const usaNeon = Boolean(process.env.DATABASE_URL);

const poolNeon = usaNeon ? crearPoolNeon() : null;

// Solo infraestructura, resolución de tenants y SuperAdmin usan este pool.
const rootPool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_ADMIN || process.env.DB_USER || "postgres", process.env.DB_PASS_ADMIN || process.env.DB_PASSWORD || "12345");

// Los administradores de restaurante también deben quedar sujetos a RLS.
const adminPool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_APP || process.env.DB_USER_CLIENTE || process.env.DB_USER || "postgres", process.env.DB_PASS_APP || process.env.DB_PASS_CLIENTE || process.env.DB_PASSWORD || "12345");

const meseroPool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_MESERO || process.env.DB_USER || "postgres", process.env.DB_PASS_MESERO || process.env.DB_PASSWORD || "12345");

const cocinaPool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_COCINA || process.env.DB_USER || "postgres", process.env.DB_PASS_COCINA || process.env.DB_PASSWORD || "12345");

const clientePool = usaNeon
  ? poolNeon
  : crearPoolLocal(process.env.DB_USER_CLIENTE || process.env.DB_USER || "postgres", process.env.DB_PASS_CLIENTE || process.env.DB_PASSWORD || "12345");

const pool = adminPool;

// ------------------------------------------------------------
// Wrappers multi-tenant: cada query/transacción queda etiquetada
// con el GUC `menugo.tenant_id` del tenant activo de la request.
// Row Level Security (ver database/saas_multi_tenant_migration.sql)
// filtra/impide cualquier acceso fuera de ese tenant.
// ------------------------------------------------------------
function envolverPool(instancia) {
  const queryOriginal = instancia.query.bind(instancia);
  const connectOriginal = instancia.connect.bind(instancia);

  instancia.connect = function connectConTenant(callback) {
    const tenant = getTenantActivo();

    // Estilo callback (usado internamente por Pool.prototype.query/connect):
    // hay que invocar callback(null, client, done) para no bloquear el pool.
    if (typeof callback === "function") {
      connectOriginal((err, client, done) => {
        if (err) return callback(err);
        if (!tenant) return callback(null, client, done);
        client.query("SELECT set_config('menugo.tenant_id', $1, false)", [String(idTenant(tenant))], (error) => {
          if (error) {
            done(error);
            return callback(error);
          }
          callback(null, client, done);
        });
      });
      return;
    }

    // Estilo promesa (pool.connect() de los controladores).
    return (async () => {
      const client = await connectOriginal();
      if (!tenant) return client;
      try {
        await client.query("SELECT set_config('menugo.tenant_id', $1, false)", [String(idTenant(tenant))]);
        return client;
      } catch (error) {
        client.release();
        throw error;
      }
    })();
  };

  instancia.query = async function queryConTenant(text, values, callback) {
    const tenant = getTenantActivo();

    if (typeof values === "function") {
      callback = values;
      values = null;
    }

    if (!tenant) {
      return queryOriginal(text, values, callback);
    }

    const client = await instancia.connect();
    try {
      return await client.query(text, values, callback);
    } finally {
      client.release();
    }
  };
}

for (const instancia of [pool, adminPool, meseroPool, cocinaPool, clientePool]) {
  if (instancia && !instancia.__menugoTenantWrapper) {
    envolverPool(instancia);
    instancia.__menugoTenantWrapper = true;

    instancia.on("error", (error) => {
      console.error("Error inesperado en PostgreSQL:", error.message);
    });
  }
}

module.exports = { pool, rootPool, adminPool, meseroPool, cocinaPool, clientePool, als, getTenantActivo };

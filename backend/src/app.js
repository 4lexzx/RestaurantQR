const { rootPool: pool } = require("./config/db");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require('path');
const fs = require('fs');
const eventEmitter = require('./utils/eventEmitter');
const { tenantMiddleware, resolverRestaurante, DEFAULT_SLUG } = require('./middleware/tenant');
const productosRoutes = require("./routes/productos.routes");
const pedidosRoutes = require("./routes/pedidos.routes");
const mesasRoutes = require("./routes/mesas.routes");
const cuentasRoutes = require("./routes/cuentas.routes");
const cocinaRoutes = require("./routes/cocina.routes");
const meseroRoutes = require("./routes/mesero.routes");
const adminRoutes = require('./routes/admin.routes');
const restaurantesRoutes = require('./routes/restaurantes.routes');
const superadminRoutes = require('./routes/superadmin.routes');
const { prepararQrMesas } = require('./config/qrMesas');
const { sign } = require('./utils/authToken');
const { requireAuth } = require('./middleware/auth');

const FRONTEND_DIR = path.join(__dirname, '../../Frontend');

// Aplica la migración multi-tenant si aún no existe la tabla restaurantes.
async function verificarMigracion() {
  try {
    const { rows } = await pool.query(`SELECT to_regclass('public.restaurantes') AS t`);
    if (rows[0] && rows[0].t) return;
  } catch (error) {
    console.warn('No se pudo verificar migración:', error.message);
    return;
  }

  const ruta = path.join(__dirname, '../../database/saas_multi_tenant_migration.sql');
  if (!fs.existsSync(ruta)) {
    console.warn('No existe el archivo de migración multi-tenant.');
    return;
  }

  console.log('Aplicando migración multi-tenant (restaurantes)...');
  const sql = fs.readFileSync(ruta, 'utf8');
  await pool.query(sql);
  console.log('Migración multi-tenant aplicada.');
}

const app = express();
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Frontend estático: rutas multi-tenant /r/:slug/... y rutas clásicas /...
// (el cruce de /r/:slug con express.static deja req.url relativo, manteniendo
// las rutas relativas de imágenes/CSS intactas por tenant).
// Durante esta etapa el frontend cambia con frecuencia. Evitar copias antiguas
// es especialmente importante en SaaS: todos los tenants deben recibir siempre
// la misma plantilla raíz y resolver únicamente su marca/datos por slug.
const staticOptions = {
  etag: false,
  lastModified: false,
  setHeaders(res, filePath) {
    if (/\.(?:html?|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
};
app.use('/r/:slug', express.static(FRONTEND_DIR, staticOptions));
app.use(express.static(FRONTEND_DIR, staticOptions));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "API MenuGo funcionando correctamente" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Servidor y rutas cargadas" });
});

app.get("/api/events", async (req, res) => {
  // Las versiones antiguas abrían una conexión por pestaña y podían agotar el
  // límite del navegador. HTTP 204 indica a EventSource que no debe reconectar;
  // el cliente v2 comparte una sola conexión por restaurante.
  if (String(req.query.v || '') !== '2') {
    return res.status(204).end();
  }

  const origin = req.headers.origin;

  const corsOrigin =
    !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)
      ? origin || "*"
      : "null";

  // Tenant del suscriptor (por query/header; default 'menugo')
  const slug = String(req.query.slug || req.headers['x-menugo-slug'] || DEFAULT_SLUG).trim().toLowerCase();
  let tenantId = 1;
  try {
    const tenant = await resolverRestaurante(slug);
    tenantId = tenant ? Number(tenant.id_restaurante) : 1;
  } catch (error) {
    console.warn('No se pudo resolver tenant para SSE:', error.message);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Credentials": "true",
  });

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write("retry: 3000\n\n");

  const puedeEnviar = (payload) => {
    const data = payload && payload.data;
    if (data && data.id_restaurante !== undefined && Number(data.id_restaurante) !== tenantId) {
      return false;
    }
    return true;
  };

  const sendEvent = (payload) => {
    if (!puedeEnviar(payload)) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendEvent({
    type: "conexion:establecida",
    data: {
      ok: true,
      message: "Conexión en tiempo real activa",
      fecha: new Date().toISOString(),
    },
  });

  const onPedidoCreado = (pedido) =>
    sendEvent({ type: "pedido:creado", data: pedido });

  const onPedidoActualizado = (pedido) =>
    sendEvent({ type: "pedido:actualizado", data: pedido });

  const onMesaActualizada = (mesa) =>
    sendEvent({ type: "mesa:actualizada", data: mesa });

  const onCuentaActualizada = (cuenta) =>
    sendEvent({ type: "cuenta:actualizada", data: cuenta });

  const onPagoRegistrado = (pago) =>
    sendEvent({ type: "pago:registrado", data: pago });

  const onPagoCruzadoRegistrado = (pago) =>
    sendEvent({ type: "pago:cruzado:registrado", data: pago });

  const onCuentasActualizadas = (cuentas) =>
    sendEvent({ type: "cuentas:actualizadas", data: cuentas });

  const onComentarioMesa = (comentario) =>
    sendEvent({ type: "comentario:mesa", data: comentario });

  const onProductoNuevo = (producto) =>
    sendEvent({ type: "producto:nuevo", data: producto });

  const onProductoActualizado = (producto) =>
    sendEvent({ type: "producto:actualizado", data: producto });

  const onProductoEliminado = (producto) =>
    sendEvent({ type: "producto:eliminado", data: producto });

  const onProductoDisponibilidad = (producto) =>
    sendEvent({ type: "producto:disponibilidad", data: producto });

  eventEmitter.on("pedido:creado", onPedidoCreado);
  eventEmitter.on("pedido:actualizado", onPedidoActualizado);
  eventEmitter.on("mesa:actualizada", onMesaActualizada);
  eventEmitter.on("cuenta:actualizada", onCuentaActualizada);
  eventEmitter.on("pago:registrado", onPagoRegistrado);
  eventEmitter.on("pago:cruzado:registrado", onPagoCruzadoRegistrado);
  eventEmitter.on("cuentas:actualizadas", onCuentasActualizadas);
  eventEmitter.on("comentario:mesa", onComentarioMesa);
  eventEmitter.on("producto:nuevo", onProductoNuevo);
  eventEmitter.on("producto:actualizado", onProductoActualizado);
  eventEmitter.on("producto:eliminado", onProductoEliminado);
  eventEmitter.on("producto:disponibilidad", onProductoDisponibilidad);

  const heartbeat = setInterval(() => {
    res.write(`: keep-alive ${new Date().toISOString()}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    eventEmitter.off("pedido:creado", onPedidoCreado);
    eventEmitter.off("pedido:actualizado", onPedidoActualizado);
    eventEmitter.off("mesa:actualizada", onMesaActualizada);
    eventEmitter.off("cuenta:actualizada", onCuentaActualizada);
    eventEmitter.off("pago:registrado", onPagoRegistrado);
    eventEmitter.off("pago:cruzado:registrado", onPagoCruzadoRegistrado);
    eventEmitter.off("cuentas:actualizadas", onCuentasActualizadas);
    eventEmitter.off("comentario:mesa", onComentarioMesa);
    eventEmitter.off("producto:nuevo", onProductoNuevo);
    eventEmitter.off("producto:actualizado", onProductoActualizado);
    eventEmitter.off("producto:eliminado", onProductoEliminado);
    eventEmitter.off("producto:disponibilidad", onProductoDisponibilidad);
    res.end();
  });
});

// Rutas de configuración por restaurante (públicas y admin)
app.use("/api/restaurantes", restaurantesRoutes);
app.use("/api/superadmin", superadminRoutes);

// Auth: login de admin de restaurante (sin tenantMiddleware — bypass RLS)
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const authPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'Menu_Go',
  user: process.env.DB_USER_ADMIN || process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS_ADMIN || process.env.DB_PASSWORD,
});

app.post("/api/auth/login", async (req, res) => {
  const { usuario, clave, slug } = req.body || {};
  if (!usuario || !clave) {
    return res.status(400).json({ ok: false, message: 'Usuario y clave son requeridos' });
  }
  try {
    const values = [usuario];
    let slugFilter = '';
    if (slug) {
      values.push(slug);
      slugFilter = 'AND LOWER(r.slug) = LOWER($2)';
    }
    const result = await authPool.query(
      `SELECT a.idadministrador, a.usuario, a.clave, a.nombrecompleto, a.correo,
              a.estado, a.id_restaurante, r.slug AS restaurante_slug,
              r.nombre AS restaurante_nombre
       FROM administrador a
       LEFT JOIN restaurantes r ON r.id_restaurante = a.id_restaurante
       WHERE (LOWER(a.usuario) = LOWER($1) OR LOWER(a.correo) = LOWER($1))
         AND a.estado = true
         ${slugFilter}
       LIMIT 1`,
      values
    );
    const { rows } = result;
    if (!rows.length) {
      return res.status(401).json({ ok: false, message: 'Usuario o clave incorrectos' });
    }
    const admin = rows[0];
    const claveOk = await bcrypt.compare(String(clave), admin.clave);
    if (!claveOk) {
      return res.status(401).json({ ok: false, message: 'Usuario o clave incorrectos' });
    }
    res.json({
      ok: true,
      data: {
        id_administrador: admin.idadministrador,
        usuario: admin.usuario,
        nombre: admin.nombrecompleto,
        correo: admin.correo,
        rol: 'Administrador',
        id_restaurante: admin.id_restaurante,
        restaurante_slug: admin.restaurante_slug,
        restaurante_nombre: admin.restaurante_nombre,
        token: sign({ tipo: 'admin', id_restaurante: admin.id_restaurante, slug: admin.restaurante_slug, usuario: admin.usuario }),
      }
    });
  } catch (error) {
    console.error('Error en auth/login:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

// Rutas de negocio: siempre con tenant resuelto
app.use("/api/productos", tenantMiddleware, productosRoutes);
app.use("/api/pedidos", tenantMiddleware, pedidosRoutes);
app.use("/api/mesas", tenantMiddleware, mesasRoutes);
app.use("/api/cuentas", tenantMiddleware, cuentasRoutes);
app.use("/api/cocina", tenantMiddleware, requireAuth('cocina', 'admin'), cocinaRoutes);
app.use("/api/mesero", tenantMiddleware, requireAuth('mesero', 'admin'), meseroRoutes);
app.use("/api/admin", tenantMiddleware, adminRoutes);

app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Ruta no encontrada" });
});

app.use((err, req, res, next) => {
  console.error("Error del servidor:", err);
  res.status(500).json({ ok: false, message: "Error interno del servidor", error: err.message });
});

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 4000;

app.listen(PORT, HOST, async () => {
  console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
  try {
    await verificarMigracion();
    await prepararQrMesas();
    console.log('QR de mesas verificados para todos los restaurantes.');
  } catch (error) {
    console.warn('No se pudo preparar el arranque:', error.message);
  }
});

const { rootPool: pool, als } = require("../config/db");

const DEFAULT_SLUG = "menugo";

async function resolverRestaurante(slug) {
  const { rows } = await pool.query(
    `SELECT
       id_restaurante,
       slug,
       nombre,
       slogan,
       logo_url,
       color_primario,
       color_secundario,
       moneda,
       igv,
       serie_boleta,
       telefono,
       direccion,
       ruc,
       config,
       activo
     FROM restaurantes
     WHERE LOWER(slug) = LOWER($1)
     LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

// Resuelve el tenant a partir del header X-MenuGo-Slug (o ?slug=).
// Si no se envía, cae al restaurante por defecto ('menugo') para
// mantener compatibilidad durante la migración.
async function tenantMiddleware(req, res, next) {
  const slug = String(
    req.headers["x-menugo-slug"] ||
    req.headers["x-restaurante"] ||
    req.query.slug ||
    ""
  ).trim().toLowerCase() || DEFAULT_SLUG;

  try {
    const tenant = await resolverRestaurante(slug);
    if (!tenant) {
      return res.status(404).json({ ok: false, message: `Restaurante "${slug}" no encontrado` });
    }

    req.tenant = tenant;
    req.tenantId = Number(tenant.id_restaurante);

    als.run({ tenant }, () => next());
  } catch (error) {
    console.error("Error resolviendo tenant:", error);
    res.status(500).json({ ok: false, message: "Error al resolver restaurante", error: error.message });
  }
}

module.exports = { tenantMiddleware, resolverRestaurante, DEFAULT_SLUG };

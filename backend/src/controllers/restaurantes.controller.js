const { rootPool: adminPool } = require("../config/db");
const { resolverRestaurante } = require("../middleware/tenant");
const { prepararQrMesas } = require("../config/qrMesas");

function publico(row) {
  if (!row) return null;
  return {
    id_restaurante: row.id_restaurante,
    slug: row.slug,
    nombre: row.nombre,
    slogan: row.slogan,
    logo_url: row.logo_url,
    color_primario: row.color_primario,
    color_secundario: row.color_secundario,
    moneda: row.moneda,
    igv: Number(row.igv || 0),
    serie_boleta: row.serie_boleta,
    telefono: row.telefono,
    direccion: row.direccion,
    ruc: row.ruc,
    config: row.config || {},
    activo: row.activo,
  };
}

// GET /api/restaurantes          -> lista de restaurantes (admin ve todos; público solo activos)
async function listar(req, res) {
  try {
    const includeInactive = req.query.include_inactive === "true" || req.query.all === "true";
    const where = includeInactive ? "" : "WHERE activo = true";
    const { rows } = await adminPool.query(
      `SELECT id_restaurante, slug, nombre, slogan, logo_url, color_primario, color_secundario, moneda, activo
       FROM restaurantes
       ${where}
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: rows.map(publico) });
  } catch (error) {
    console.error("Error listando restaurantes:", error);
    res.status(500).json({ ok: false, message: "Error al listar restaurantes", error: error.message });
  }
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function slugificarRestaurante(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// POST /api/restaurantes          -> crea un nuevo restaurante (tenant) y sus mesas/QR
async function crear(req, res) {
  const nombre = String(req.body.nombre || "").trim();
  if (!nombre) {
    return res.status(400).json({ ok: false, message: "El nombre del restaurante es requerido" });
  }

  let slug = String(req.body.slug || "").trim().toLowerCase();
  if (!slug) slug = slugificarRestaurante(nombre);
  if (!slug) {
    return res.status(400).json({ ok: false, message: "No se pudo generar un slug válido para el restaurante" });
  }

  const body = req.body || {};
  const numMesas = Math.min(Math.max(Number(body.num_mesas ?? 20) || 20, 1), 300);
  const config = { ...(body.config || {}), num_mesas: numMesas };
  const colorPrimario = HEX_COLOR.test(body.color_primario) ? body.color_primario : "#2563EB";
  const colorSecundario = HEX_COLOR.test(body.color_secundario) ? body.color_secundario : "#0F172A";

  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO restaurantes
         (slug, nombre, slogan, logo_url, color_primario, color_secundario, moneda,
          igv, serie_boleta, telefono, direccion, ruc, config, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, true)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [
        slug, nombre, body.slogan || null, body.logo_url || null,
        colorPrimario, colorSecundario, body.moneda || "S/",
        Number(body.igv ?? 18) || 18, body.serie_boleta || "B001",
        body.telefono || null, body.direccion || null, body.ruc || null,
        JSON.stringify(config),
      ]
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, message: `El slug "${slug}" ya está en uso` });
    }

    await client.query("COMMIT");

    // Alta de mesas + QRs del nuevo restaurante (idempotente: solo completa lo que falte).
    await prepararQrMesas();

    res.status(201).json({ ok: true, message: "Restaurante creado", data: publico(rows[0]) });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* noop */
    }
    console.error("Error creando restaurante:", error);
    res.status(500).json({ ok: false, message: "Error al crear restaurante", error: error.message });
  } finally {
    client.release();
  }
}

// GET /api/restaurantes/:slug    -> configuración pública (la consume el frontend para tematizar)
async function getConfig(req, res) {
  try {
    const row = await resolverRestaurante(req.params.slug);
    if (!row) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    res.json({ ok: true, data: publico(row) });
  } catch (error) {
    console.error("Error obteniendo config de restaurante:", error);
    res.status(500).json({ ok: false, message: "Error al obtener configuración", error: error.message });
  }
}

// PATCH /api/restaurantes/:slug  -> actualiza la configuración (requiere tenant header; rol Admin)
async function updateConfig(req, res) {
  const targetSlug = String(req.params.slug || "").trim().toLowerCase();

  // Solo el propio tenant puede editar su configuración.
  if (!req.tenant || String(req.tenant.slug).toLowerCase() !== targetSlug) {
    return res.status(403).json({ ok: false, message: "No autorizado para modificar este restaurante" });
  }

  const campos = {};
  const permitidos = [
    "nombre", "slogan", "logo_url", "color_primario", "color_secundario",
    "moneda", "igv", "serie_boleta", "telefono", "direccion", "ruc", "activo", "config",
  ];
  for (const key of permitidos) {
    if (req.body[key] !== undefined) campos[key] = req.body[key];
  }
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ ok: false, message: "No se enviaron campos para actualizar" });
  }

  const vals = Object.values(campos);
  const sets = Object.keys(campos)
    .map((k, i) => `"${k}" = $${i + 1}`)
    .join(", ");

  try {
    const { rows } = await adminPool.query(
      `UPDATE restaurantes SET ${sets} WHERE LOWER(slug) = $${vals.length + 1}
         AND id_restaurante = $${vals.length + 2}
       RETURNING *`,
      [...vals, targetSlug, req.tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    if (campos.config && campos.config.num_mesas !== undefined) {
      await prepararQrMesas();
    }
    res.json({ ok: true, message: "Configuración actualizada", data: publico(rows[0]) });
  } catch (error) {
    console.error("Error actualizando restaurante:", error);
    res.status(500).json({ ok: false, message: "Error al actualizar configuración", error: error.message });
  }
}

// DELETE /api/restaurantes/:slug -> desactiva el restaurante (requiere role Admin)
async function desactivar(req, res) {
  if (!req.tenant || String(req.tenant.slug).toLowerCase() !== String(req.params.slug || "").trim().toLowerCase()) {
    return res.status(403).json({ ok: false, message: "No autorizado para modificar este restaurante" });
  }
  try {
    const { rows } = await adminPool.query(
      `UPDATE restaurantes SET activo = false WHERE id_restaurante = $1 RETURNING *`,
      [req.tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    res.json({ ok: true, message: "Restaurante desactivado", data: publico(rows[0]) });
  } catch (error) {
    console.error("Error desactivando restaurante:", error);
    res.status(500).json({ ok: false, message: "Error al desactivar restaurante", error: error.message });
  }
}

module.exports = { listar, crear, getConfig, updateConfig, desactivar, publico };

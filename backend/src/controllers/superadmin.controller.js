const bcrypt = require("bcryptjs");
const { rootPool: adminPool } = require("../config/db");
const { Pool } = require("pg");
const { prepararQrMesas } = require("../config/qrMesas");
const { sign } = require('../utils/authToken');

function genDocumento(usuario) {
  let h = 0;
  const s = String(usuario) + Date.now();
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return String(Math.abs(h)).padStart(8, "0").slice(0, 8);
}
function genTelefono(usuario) {
  let h = 0;
  const s = String(usuario) + "tel" + Date.now();
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return String(900000000 + Math.abs(h) % 100000000).padStart(9, "0").slice(0, 9);
}

// Pool sin wrapper de tenant para queries cross-tenant del superadmin
const superPool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "Menu_Go",
  user: process.env.DB_USER_ADMIN || process.env.DB_USER || "postgres",
  password: process.env.DB_PASS_ADMIN || process.env.DB_PASSWORD || "12345",
});

async function login(req, res) {
  const { usuario, clave } = req.body || {};
  if (!usuario || !clave) {
    return res.status(400).json({ ok: false, message: "Usuario y clave son requeridos" });
  }
  try {
    const { rows } = await superPool.query(
      "SELECT * FROM super_admin WHERE (LOWER(usuario) = LOWER($1) OR LOWER(correo) = LOWER($1)) AND estado = true LIMIT 1",
      [usuario]
    );
    if (!rows.length) {
      return res.status(401).json({ ok: false, message: "Credenciales incorrectas" });
    }
    const admin = rows[0];
    const claveOk = await bcrypt.compare(String(clave), admin.clave);
    if (!claveOk) {
      return res.status(401).json({ ok: false, message: "Credenciales incorrectas" });
    }
    res.json({
      ok: true,
      data: {
        id: admin.id,
        usuario: admin.usuario,
        nombre: admin.nombre,
        correo: admin.correo,
        token: sign({ tipo: 'superadmin', id: admin.id, usuario: admin.usuario }),
      },
    });
  } catch (error) {
    console.error("Error en superadmin/login:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function dashboard(req, res) {
  try {
    const [restaurantes, admins, meseros, cocineros, platos, pedidosHoy] = await Promise.all([
      superPool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE activo = true) as activos FROM restaurantes"),
      superPool.query("SELECT COUNT(*) as total FROM administrador WHERE estado = true"),
      superPool.query("SELECT COUNT(*) as total FROM trabajador WHERE LOWER(rol) = 'mesero' AND LOWER(estado) = 'activo'"),
      superPool.query("SELECT COUNT(*) as total FROM trabajador WHERE LOWER(rol) = 'cocinero' AND LOWER(estado) = 'activo'"),
      superPool.query("SELECT COUNT(*) as total FROM platos WHERE activo = true"),
      superPool.query(`SELECT COUNT(*) as total FROM pedidos WHERE DATE(fecha_creacion) = CURRENT_DATE`),
    ]);
    res.json({
      ok: true,
      data: {
        restaurantes: { total: Number(restaurantes.rows[0].total), activos: Number(restaurantes.rows[0].activos) },
        admins: Number(admins.rows[0].total),
        meseros: Number(meseros.rows[0].total),
        cocineros: Number(cocineros.rows[0].total),
        platos: Number(platos.rows[0].total),
        pedidosHoy: Number(pedidosHoy.rows[0].total),
      },
    });
  } catch (error) {
    console.error("Error en superadmin/dashboard:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function listarRestaurantes(req, res) {
  try {
    const { rows: restaurantes } = await superPool.query("SELECT * FROM restaurantes ORDER BY fecha_creacion DESC");
    for (const r of restaurantes) {
      const [a, t, p] = await Promise.all([
        superPool.query("SELECT COUNT(*) as c FROM administrador WHERE id_restaurante = $1 AND estado = true", [r.id_restaurante]),
        superPool.query("SELECT COUNT(*) as c FROM trabajador WHERE id_restaurante = $1 AND LOWER(estado) = 'activo'", [r.id_restaurante]),
        superPool.query("SELECT COUNT(*) as c FROM platos WHERE id_restaurante = $1 AND activo = true", [r.id_restaurante]),
      ]);
      r.num_admins = Number(a.rows[0].c);
      r.num_trabajadores = Number(t.rows[0].c);
      r.num_platos = Number(p.rows[0].c);
    }
    res.json({ ok: true, data: restaurantes });
  } catch (error) {
    console.error("Error en superadmin/listarRestaurantes:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function crearRestaurante(req, res) {
  const { nombre, slug, slogan, color_primario, color_secundario, moneda, num_mesas } = req.body || {};
  if (!nombre || !slug) {
    return res.status(400).json({ ok: false, message: "Nombre y slug son requeridos" });
  }
  const slugLimpio = slug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!slugLimpio) {
    return res.status(400).json({ ok: false, message: "Slug no válido" });
  }
  try {
    const existe = await adminPool.query("SELECT id_restaurante FROM restaurantes WHERE slug = $1", [slugLimpio]);
    if (existe.rows.length) {
      return res.status(409).json({ ok: false, message: "Ya existe un restaurante con ese slug" });
    }
    const { rows } = await adminPool.query(`
      INSERT INTO restaurantes (nombre, slug, slogan, color_primario, color_secundario, moneda, activo, config)
      VALUES ($1, $2, $3, $4, $5, $6, true, $7)
      RETURNING *
    `, [
      nombre, slugLimpio, slogan || "",
      color_primario || "#2563EB", color_secundario || "#0F172A",
      moneda || "S/",
      JSON.stringify({ num_mesas: num_mesas || 20 }),
    ]);
    await prepararQrMesas();
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    console.error("Error en superadmin/crearRestaurante:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function actualizarRestaurante(req, res) {
  const { slug } = req.params;
  const campos = [];
  const valores = [];
  let idx = 1;
  for (const key of ["nombre", "slogan", "color_primario", "color_secundario", "moneda", "activo"]) {
    if (req.body[key] !== undefined) {
      campos.push(`${key} = $${idx}`);
      valores.push(req.body[key]);
      idx++;
    }
  }
  if (req.body.num_mesas !== undefined) {
    campos.push(`config = jsonb_set(COALESCE(config, '{}'), '{num_mesas}', $${idx}::jsonb)`);
    valores.push(JSON.stringify(req.body.num_mesas));
    idx++;
  }
  if (!campos.length) {
    return res.status(400).json({ ok: false, message: "Sin cambios" });
  }
  valores.push(slug);
  try {
    const { rows } = await adminPool.query(
      `UPDATE restaurantes SET ${campos.join(", ")} WHERE slug = $${idx} RETURNING *`,
      valores
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    console.error("Error en superadmin/actualizarRestaurante:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function eliminarRestaurante(req, res) {
  const { slug } = req.params;
  try {
    const { rows } = await adminPool.query(
      "UPDATE restaurantes SET activo = false WHERE slug = $1 RETURNING id_restaurante, nombre, slug",
      [slug]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    console.error("Error en superadmin/eliminarRestaurante:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function listarCredenciales(req, res) {
  const { slug } = req.params;
  try {
    const rest = await adminPool.query("SELECT id_restaurante FROM restaurantes WHERE slug = $1", [slug]);
    if (!rest.rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    const id = rest.rows[0].id_restaurante;
    const [admins, trabajadores] = await Promise.all([
      adminPool.query(
        "SELECT idadministrador as id, usuario, nombrecompleto as nombre, correo, estado FROM administrador WHERE id_restaurante = $1",
        [id]
      ),
      adminPool.query(
        "SELECT idtrabajador as id, nombres, apellidos, usuario_acceso as usuario, correo, rol, estado FROM trabajador WHERE id_restaurante = $1",
        [id]
      ),
    ]);
    res.json({
      ok: true,
      data: {
        admins: admins.rows,
        meseros: trabajadores.rows.filter(t => (t.rol || "").toLowerCase() === "mesero"),
        cocineros: trabajadores.rows.filter(t => (t.rol || "").toLowerCase() === "cocinero"),
      },
    });
  } catch (error) {
    console.error("Error en superadmin/listarCredenciales:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function crearCredencial(req, res) {
  const { slug } = req.params;
  const { tipo, usuario, clave, nombre, apellidos, correo, telefono, documento, rol } = req.body || {};
  if (!tipo || !usuario || !clave) {
    return res.status(400).json({ ok: false, message: "Tipo, usuario y clave son requeridos" });
  }
  try {
    const rest = await adminPool.query("SELECT id_restaurante FROM restaurantes WHERE slug = $1", [slug]);
    if (!rest.rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    const id = rest.rows[0].id_restaurante;
    const hash = await bcrypt.hash(String(clave), 10);

    if (tipo === "admin") {
      const existe = await adminPool.query(
        "SELECT idadministrador FROM administrador WHERE id_restaurante = $1 AND LOWER(usuario) = LOWER($2) AND estado = true",
        [id, usuario]
      );
      if (existe.rows.length) {
        return res.status(409).json({ ok: false, message: "Ya existe un admin con ese usuario" });
      }
      const { rows } = await adminPool.query(
        `INSERT INTO administrador (usuario, clave, nombrecompleto, correo, estado, id_restaurante)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING idadministrador as id, usuario, nombrecompleto as nombre, correo, estado`,
        [usuario, hash, nombre || usuario, correo || "", id]
      );
      // Sync admin_login table
      const restData = await adminPool.query("SELECT slug, nombre FROM restaurantes WHERE id_restaurante = $1", [id]);
      await adminPool.query(
        `INSERT INTO admin_login (id_restaurante, usuario, clave, nombre, correo, estado, restaurante_slug, restaurante_nombre)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)
         ON CONFLICT (id_restaurante, usuario) DO UPDATE SET
           clave = EXCLUDED.clave, nombre = EXCLUDED.nombre, correo = EXCLUDED.correo`,
        [id, usuario, hash, nombre || usuario, correo || "", restData.rows[0].slug, restData.rows[0].nombre]
      );
      return res.status(201).json({ ok: true, data: rows[0] });
    }

    if (tipo === "mesero" || tipo === "cocinero") {
      const existe = await adminPool.query(
        "SELECT idtrabajador FROM trabajador WHERE id_restaurante = $1 AND LOWER(usuario_acceso) = LOWER($2) AND estado = 'activo'",
        [id, usuario]
      );
      if (existe.rows.length) {
        return res.status(409).json({ ok: false, message: `Ya existe un ${tipo} con ese usuario` });
      }
      const { rows } = await adminPool.query(
        `INSERT INTO trabajador (nombres, apellidos, documento, telefono, correo, rol, estado, usuario_acceso, clave_acceso, id_restaurante, fechainiciocontrato, fecharegistro)
         VALUES ($1, $2, $3, $4, $5, $6, 'activo', $7, $8, $9, NOW(), NOW())
         RETURNING idtrabajador as id, nombres, apellidos, usuario_acceso as usuario, correo, rol, estado`,
          [nombre || usuario, apellidos || "", documento || genDocumento(usuario), telefono || genTelefono(usuario), correo || (usuario + "@menuGo.local"), tipo, usuario, hash, id]
      );
      return res.status(201).json({ ok: true, data: rows[0] });
    }

    res.status(400).json({ ok: false, message: "Tipo no válido (admin, mesero, cocinero)" });
  } catch (error) {
    console.error("Error en superadmin/crearCredencial:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function actualizarCredencial(req, res) {
  const { slug, id, tipo } = req.params;
  const { usuario, clave, nombre, apellidos, correo, telefono, documento, estado, rol: nuevoRol } = req.body || {};
  try {
    const rest = await adminPool.query("SELECT id_restaurante FROM restaurantes WHERE slug = $1", [slug]);
    if (!rest.rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    const idRest = rest.rows[0].id_restaurante;

    // Cambio de rol: mover entre tablas
    const rolMap = { admin: "admin", mesero: "mesero", cocinero: "cocinero" };
    const rolTarget = nuevoRol ? (rolMap[nuevoRol.toLowerCase()] || nuevoRol.toLowerCase()) : null;
    if (rolTarget && rolTarget !== tipo) {
      const esAdmin = tipo === "admin" || tipo === "admins";
      const targetEsAdmin = rolTarget === "admin";

      // Helper: map rol value to DB value for trabajador.rol
      const rolDB = (r) => r === "mesero" ? "Mesero" : "Cocinero";

      if (esAdmin && !targetEsAdmin) {
        // Admin → Mesero/Cocinero: delete from administrador, insert into trabajador
        const { rows } = await adminPool.query(
          "SELECT * FROM administrador WHERE idadministrador = $1 AND id_restaurante = $2",
          [Number(id), idRest]
        );
        const actual = rows[0];
        if (!actual) return res.status(404).json({ ok: false, message: "Credencial no encontrada" });
        await adminPool.query("DELETE FROM administrador WHERE idadministrador = $1 AND id_restaurante = $2", [Number(id), idRest]);
        await adminPool.query("DELETE FROM admin_login WHERE id_restaurante = $1 AND LOWER(usuario) = LOWER($2)", [idRest, actual.usuario]);
        const hash = clave ? await bcrypt.hash(String(clave), 10) : (actual.clave || "");
        const tel = telefono || genTelefono(usuario || actual.usuario);
        const doc = documento || genDocumento(usuario || actual.usuario);
        const { rows: nuevas } = await adminPool.query(
          `INSERT INTO trabajador (nombres, apellidos, documento, telefono, correo, rol, estado, usuario_acceso, clave_acceso, id_restaurante, fechainiciocontrato, fecharegistro)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
           RETURNING idtrabajador as id, nombres, apellidos, usuario_acceso as usuario, correo, rol, estado`,
          [nombre || actual.nombrecompleto, apellidos || "", doc, tel, correo || (usuario || actual.usuario) + "@menuGo.local", rolDB(rolTarget), (actual.estado === false || actual.estado === 'false' || actual.estado === 'inactivo') ? 'inactivo' : 'activo', usuario || actual.usuario, hash, idRest]
        );
        return res.json({ ok: true, data: nuevas[0], message: `Rol cambiado a ${rolTarget}` });

      } else if (!esAdmin && targetEsAdmin) {
        // Mesero/Cocinero → Admin: delete from trabajador, insert into administrador
        const { rows } = await adminPool.query(
          "SELECT * FROM trabajador WHERE idtrabajador = $1 AND id_restaurante = $2",
          [Number(id), idRest]
        );
        const actual = rows[0];
        if (!actual) return res.status(404).json({ ok: false, message: "Credencial no encontrada" });
        await adminPool.query("DELETE FROM trabajador WHERE idtrabajador = $1 AND id_restaurante = $2", [Number(id), idRest]);
        const hash = clave ? await bcrypt.hash(String(clave), 10) : (actual.clave_acceso || "");
        const nombreComp = [actual.nombres, actual.apellidos].filter(Boolean).join(" ") || usuario || actual.usuario_acceso;
        const { rows: nuevas } = await adminPool.query(
          `INSERT INTO administrador (usuario, clave, nombrecompleto, correo, estado, id_restaurante)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING idadministrador as id, usuario, nombrecompleto as nombre, correo, estado`,
          [usuario || actual.usuario_acceso, hash, nombre || nombreComp, correo || actual.correo, (actual.estado === 'inactivo' || actual.estado === 'false') ? false : true, idRest]
        );
        const restData = await adminPool.query("SELECT slug, nombre FROM restaurantes WHERE id_restaurante = $1", [idRest]);
        await adminPool.query(
          `INSERT INTO admin_login (id_restaurante, usuario, clave, nombre, correo, estado, restaurante_slug, restaurante_nombre)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id_restaurante, usuario) DO UPDATE SET
             nombre = EXCLUDED.nombre, correo = EXCLUDED.correo, estado = EXCLUDED.estado`,
          [idRest, nuevas[0].usuario, hash, nuevas[0].nombre, nuevas[0].correo, nuevas[0].estado, restData.rows[0].slug, restData.rows[0].nombre]
        );
        return res.json({ ok: true, data: { ...nuevas[0], rol: "admin" }, message: `Rol cambiado a admin` });

      } else if (!esAdmin && !targetEsAdmin) {
        // Mesero → Cocinero or Cocinero → Mesero: just update rol in trabajador
        const { rows } = await adminPool.query(
          "SELECT * FROM trabajador WHERE idtrabajador = $1 AND id_restaurante = $2",
          [Number(id), idRest]
        );
        const actual = rows[0];
        if (!actual) return res.status(404).json({ ok: false, message: "Credencial no encontrada" });
        const nuevoRolDB = rolDB(rolTarget);
        const { rows: actualiz } = await adminPool.query(
          `UPDATE trabajador SET rol = $1 WHERE idtrabajador = $2 AND id_restaurante = $3
           RETURNING idtrabajador as id, nombres, apellidos, usuario_acceso as usuario, correo, rol, estado`,
          [nuevoRolDB, Number(id), idRest]
        );
        return res.json({ ok: true, data: actualiz[0], message: `Rol cambiado a ${rolTarget}` });
      }
    }

    if (tipo === "admin") {
      const hash = clave ? await bcrypt.hash(String(clave), 10) : null;
      const campos = [];
      const valores = [];
      let idx = 1;
      if (usuario) { campos.push(`usuario = $${idx}`); valores.push(usuario); idx++; }
      if (hash) { campos.push(`clave = $${idx}`); valores.push(hash); idx++; }
      if (nombre) { campos.push(`nombrecompleto = $${idx}`); valores.push(nombre); idx++; }
      if (correo !== undefined) { campos.push(`correo = $${idx}`); valores.push(correo); idx++; }
      if (estado !== undefined) { campos.push(`estado = $${idx}`); valores.push(estado); idx++; }
      if (!campos.length) return res.status(400).json({ ok: false, message: "Sin cambios" });
      valores.push(Number(id), idRest);
      const { rows } = await adminPool.query(
        `UPDATE administrador SET ${campos.join(", ")} WHERE idadministrador = $${idx} AND id_restaurante = $${idx + 1} RETURNING idadministrador as id, usuario, nombrecompleto as nombre, correo, estado`,
        valores
      );
      // Sync admin_login
      if (rows.length) {
        const restData = await adminPool.query("SELECT slug, nombre FROM restaurantes WHERE id_restaurante = $1", [idRest]);
        await adminPool.query(
          `INSERT INTO admin_login (id_restaurante, usuario, clave, nombre, correo, estado, restaurante_slug, restaurante_nombre)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id_restaurante, usuario) DO UPDATE SET
             nombre = EXCLUDED.nombre, correo = EXCLUDED.correo, estado = EXCLUDED.estado`,
          [idRest, rows[0].usuario, hash || "", rows[0].nombre, rows[0].correo, rows[0].estado, restData.rows[0].slug, restData.rows[0].nombre]
        );
      }
      return res.json({ ok: true, data: rows[0] || null });
    }

    if (tipo === "mesero" || tipo === "cocinero") {
      const hash = clave ? await bcrypt.hash(String(clave), 10) : null;
      const campos = [];
      const valores = [];
      let idx = 1;
      if (usuario) { campos.push(`usuario_acceso = $${idx}`); valores.push(usuario); idx++; }
      if (hash) { campos.push(`clave_acceso = $${idx}`); valores.push(hash); idx++; }
      if (nombre) { campos.push(`nombres = $${idx}`); valores.push(nombre); idx++; }
      if (apellidos) { campos.push(`apellidos = $${idx}`); valores.push(apellidos); idx++; }
      if (correo !== undefined) { campos.push(`correo = $${idx}`); valores.push(correo); idx++; }
      if (telefono) { campos.push(`telefono = $${idx}`); valores.push(telefono); idx++; }
      if (documento) { campos.push(`documento = $${idx}`); valores.push(documento); idx++; }
      if (estado !== undefined) { campos.push(`estado = $${idx}`); valores.push((estado === true || estado === 'true' || estado === 'activo') ? 'activo' : 'inactivo'); idx++; }
      if (!campos.length) return res.status(400).json({ ok: false, message: "Sin cambios" });
      valores.push(Number(id), idRest);
      const { rows } = await adminPool.query(
        `UPDATE trabajador SET ${campos.join(", ")} WHERE idtrabajador = $${idx} AND id_restaurante = $${idx + 1} RETURNING idtrabajador as id, nombres, apellidos, usuario_acceso as usuario, correo, rol, estado`,
        valores
      );
      return res.json({ ok: true, data: rows[0] || null });
    }

    res.status(400).json({ ok: false, message: "Tipo no válido" });
  } catch (error) {
    console.error("Error en superadmin/actualizarCredencial:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function eliminarCredencial(req, res) {
  const { slug, id, tipo } = req.params;
  try {
    const rest = await adminPool.query("SELECT id_restaurante FROM restaurantes WHERE slug = $1", [slug]);
    if (!rest.rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    const idRest = rest.rows[0].id_restaurante;

    if (tipo === "admin") {
      const { rows } = await adminPool.query(
        "DELETE FROM administrador WHERE idadministrador = $1 AND id_restaurante = $2 RETURNING idadministrador as id, usuario",
        [Number(id), idRest]
      );
      if (rows.length) {
        await adminPool.query(
          "DELETE FROM admin_login WHERE id_restaurante = $1 AND LOWER(usuario) = LOWER($2)",
          [idRest, rows[0].usuario]
        );
      }
      return res.json({ ok: true, data: rows[0] || null, message: "Credencial eliminada" });
    }

    if (tipo === "mesero" || tipo === "cocinero") {
      const { rows } = await adminPool.query(
        "DELETE FROM trabajador WHERE idtrabajador = $1 AND id_restaurante = $2 RETURNING idtrabajador as id, usuario_acceso as usuario",
        [Number(id), idRest]
      );
      return res.json({ ok: true, data: rows[0] || null, message: "Credencial eliminada" });
    }

    res.status(400).json({ ok: false, message: "Tipo no válido" });
  } catch (error) {
    console.error("Error en superadmin/eliminarCredencial:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

async function toggleCredencial(req, res) {
  const { slug, id, tipo } = req.params;
  try {
    const rest = await adminPool.query("SELECT id_restaurante FROM restaurantes WHERE slug = $1", [slug]);
    if (!rest.rows.length) {
      return res.status(404).json({ ok: false, message: "Restaurante no encontrado" });
    }
    const idRest = rest.rows[0].id_restaurante;

    if (tipo === "admin") {
      const { rows: current } = await adminPool.query(
        "SELECT estado FROM administrador WHERE idadministrador = $1 AND id_restaurante = $2",
        [Number(id), idRest]
      );
      if (!current.length) return res.status(404).json({ ok: false, message: "Credencial no encontrada" });
      const nuevoEstado = current[0].estado === true ? false : true;
      const { rows } = await adminPool.query(
        "UPDATE administrador SET estado = $1 WHERE idadministrador = $2 AND id_restaurante = $3 RETURNING idadministrador as id, usuario, nombrecompleto as nombre, correo, estado",
        [nuevoEstado, Number(id), idRest]
      );
      if (rows.length) {
        await adminPool.query(
          "UPDATE admin_login SET estado = $1 WHERE id_restaurante = $2 AND LOWER(usuario) = LOWER($3)",
          [nuevoEstado, idRest, rows[0].usuario]
        );
      }
      return res.json({ ok: true, data: rows[0] || null });
    }

    if (tipo === "mesero" || tipo === "cocinero") {
      const { rows: current } = await adminPool.query(
        "SELECT estado FROM trabajador WHERE idtrabajador = $1 AND id_restaurante = $2",
        [Number(id), idRest]
      );
      if (!current.length) return res.status(404).json({ ok: false, message: "Credencial no encontrada" });
      const nuevoEstado = (current[0].estado === 'activo' || current[0].estado === 'true') ? 'inactivo' : 'activo';
      const { rows } = await adminPool.query(
        "UPDATE trabajador SET estado = $1 WHERE idtrabajador = $2 AND id_restaurante = $3 RETURNING idtrabajador as id, nombres, apellidos, usuario_acceso as usuario, correo, rol, estado",
        [nuevoEstado, Number(id), idRest]
      );
      return res.json({ ok: true, data: rows[0] || null });
    }

    res.status(400).json({ ok: false, message: "Tipo no válido" });
  } catch (error) {
    console.error("Error en superadmin/toggleCredencial:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

module.exports = {
  login,
  dashboard,
  listarRestaurantes,
  crearRestaurante,
  actualizarRestaurante,
  eliminarRestaurante,
  listarCredenciales,
  crearCredencial,
  actualizarCredencial,
  eliminarCredencial,
  toggleCredencial,
};

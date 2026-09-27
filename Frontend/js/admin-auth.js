// MenuGo - autenticacion de administrador via backend real

function slugActualAdmin() {
  const match = window.location.pathname.match(/\/r\/([^/]+)\//i);
  return decodeURIComponent(match?.[1] || window.MENUGO_SLUG || 'menugo').trim().toLowerCase();
}

function keySesionAdmin() {
  return `menugo_admin_sesion:${slugActualAdmin()}`;
}

var API_BASE = window.MENUGO_API || "http://localhost:4000/api";

async function apiJson(url, options = {}) {
  const sesion = obtenerSesionAdmin();
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

function obtenerSesionAdmin() {
  try {
    const key = keySesionAdmin();
    const sesion = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!sesion || !sesion.usuario || !sesion.token || String(sesion.restaurante_slug).toLowerCase() !== slugActualAdmin()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return sesion;
  } catch (error) {
    sessionStorage.removeItem(keySesionAdmin());
    return null;
  }
}

function crearSesionAdmin(data) {
  const sesion = {
    id_administrador: data.id_administrador,
    usuario: data.usuario,
    nombre: data.nombre,
    correo: data.correo,
    rol: data.rol || "Administrador",
    id_restaurante: data.id_restaurante,
    restaurante_slug: data.restaurante_slug,
    restaurante_nombre: data.restaurante_nombre,
    token: data.token,
    inicioSesion: new Date().toISOString(),
  };
  if (String(sesion.restaurante_slug || '').toLowerCase() !== slugActualAdmin()) {
    throw new Error('La cuenta no pertenece a este restaurante.');
  }
  sessionStorage.setItem(keySesionAdmin(), JSON.stringify(sesion));
  return sesion;
}

function cerrarSesionAdmin() {
  if (!confirm("¿Seguro que deseas cerrar sesión?")) return;
  const slug = slugActualAdmin();
  sessionStorage.removeItem(keySesionAdmin());
  const base = slug ? `/r/${slug}/` : "";
  window.location.href = `${base}Admin/login.html?logout=1`;
}

function protegerRutaAdmin() {
  const sesion = obtenerSesionAdmin();
  if (!sesion) {
    const slug = slugActualAdmin();
    const base = `/r/${slug}/`;
    window.location.href = `${base}Admin/login.html?access=required`;
    return null;
  }
  return sesion;
}

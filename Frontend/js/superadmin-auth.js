// MenuGo - SuperAdmin autenticación
var API_BASE = window.MENUGO_API || "http://localhost:4000/api";

const SA_KEYS = { sesion: "menugo_superadmin_sesion" };

async function saApi(url, options = {}) {
  const sesion = saObtenerSesion();
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}), ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || "Error de servidor");
  return data;
}

function saObtenerSesion() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SA_KEYS.sesion) || "null");
    if (!s?.usuario || !s?.token) { sessionStorage.removeItem(SA_KEYS.sesion); return null; }
    return s;
  } catch { sessionStorage.removeItem(SA_KEYS.sesion); return null; }
}

function saCrearSesion(data) {
  const s = { ...data, inicioSesion: new Date().toISOString() };
  sessionStorage.setItem(SA_KEYS.sesion, JSON.stringify(s));
  return s;
}

function saCerrarSesion() {
  if (!confirm("¿Cerrar sesión?")) return;
  sessionStorage.removeItem(SA_KEYS.sesion);
  window.location.href = "login.html";
}

function saProteger() {
  if (!saObtenerSesion()) { window.location.href = "login.html"; return null; }
  return saObtenerSesion();
}

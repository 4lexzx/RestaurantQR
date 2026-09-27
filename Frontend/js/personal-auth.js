// MenuGo - autenticacion para Mesero y Cocina
// Protege las pantallas internas del personal con credenciales por rol.
// Las credenciales se validan UNICAMENTE contra la base de datos (tabla trabajador).

function slugActualPersonal() {
  const match = window.location.pathname.match(/\/r\/([^/]+)\//i);
  return decodeURIComponent(match?.[1] || window.MENUGO_SLUG || 'menugo').trim().toLowerCase();
}

const API_BASE_PERSONAL = window.MENUGO_API || "http://localhost:4000/api";

const PERSONAL_ROLES = {
  mesero: { rol: 'Mesero', inicio: 'mesas.html' },
  cocina: { rol: 'Cocina', inicio: 'pedidos.html' }
};

function normalizarPersonal(valor) {
  return String(valor || '').trim().toLowerCase();
}

function obtenerRolPorRutaPersonal() {
  const ruta = window.location.pathname.toLowerCase();
  if (ruta.includes('/mesero/')) return 'mesero';
  if (ruta.includes('/cocina/')) return 'cocina';
  return null;
}

function obtenerConfigPersonal(rol) {
  return PERSONAL_ROLES[normalizarPersonal(rol)] || null;
}

function obtenerKeySesionPersonal(rol) {
  const normalizado = normalizarPersonal(rol);
  return ['mesero', 'cocina'].includes(normalizado) ? `menugo_${normalizado}_sesion:${slugActualPersonal()}` : null;
}

function obtenerSesionPersonal(rol) {
  const key = obtenerKeySesionPersonal(rol);
  if (!key) return null;

  try {
    const sesion = JSON.parse(sessionStorage.getItem(key) || 'null');
    const rolEsperado = normalizarPersonal(rol) === 'cocina' ? 'cocina' : 'mesero';
    const rolSesion = normalizarPersonal(sesion?.rol);

    if (!sesion || !sesion.token || rolSesion !== rolEsperado || String(sesion.restaurante_slug || '').toLowerCase() !== slugActualPersonal()) {
      sessionStorage.removeItem(key);
      return null;
    }

    return sesion;
  } catch (error) {
    sessionStorage.removeItem(key);
    return null;
  }
}

async function iniciarSesionPersonal(rol, usuario, password) {
  const config = obtenerConfigPersonal(rol);
  const key = obtenerKeySesionPersonal(rol);

  if (!config || !key) {
    throw new Error('Rol no valido.');
  }

  const response = await fetch(`${API_BASE_PERSONAL}/admin/personal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, clave: password, rol })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || 'Credenciales invalidas');
  }

  const sesion = {
    email: data.data?.email || usuario,
    nombre: data.data?.nombre || usuario,
    rol: normalizarPersonal(rol) === 'cocina' ? 'cocina' : 'mesero',
    rolTexto: data.data?.rol || config.rol,
    id_restaurante: data.data?.id_restaurante,
    restaurante_slug: data.data?.restaurante_slug,
    token: data.data?.token,
    inicioSesion: new Date().toISOString()
  };

  if (!sesion.token || String(sesion.restaurante_slug || '').toLowerCase() !== slugActualPersonal()) {
    throw new Error('La cuenta no pertenece a este restaurante.');
  }
  sessionStorage.setItem(key, JSON.stringify(sesion));
  return sesion;
}

function cerrarSesionPersonal(rol = null) {
  if (!confirm('¿Seguro que deseas cerrar sesión?')) return;
  const rolActual = rol || obtenerRolPorRutaPersonal();
  const key = obtenerKeySesionPersonal(rolActual);
  if (key) sessionStorage.removeItem(key);
  window.location.href = 'login.html?logout=1';
}

function protegerRutaPersonal(rol = null) {
  const rolActual = rol || obtenerRolPorRutaPersonal();
  if (!rolActual) return null;

  const archivoActual = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (archivoActual === 'login.html') return obtenerSesionPersonal(rolActual);

  const sesion = obtenerSesionPersonal(rolActual);
  if (!sesion) {
    window.location.replace('login.html?access=required');
    return null;
  }

  insertarBarraSesionPersonal(rolActual, sesion);
  return sesion;
}

function insertarBarraSesionPersonal(rol, sesion) {
  if (document.getElementById('menu-go-personal-session')) return;

  const barra = document.createElement('div');
  barra.id = 'menu-go-personal-session';
  barra.className = 'personal-session';
  barra.innerHTML = `
    <button type="button" class="personal-session-trigger" aria-label="Abrir menú de usuario" aria-expanded="false">
      <i class="bi bi-person-fill" aria-hidden="true"></i>
    </button>
    <div class="personal-session-popover" hidden>
      <div class="personal-session-identity">
        <span class="personal-session-avatar"><i class="bi bi-person-fill"></i></span>
        <div><strong data-session-name></strong><small data-session-email></small></div>
      </div>
      <button type="button" class="personal-session-logout" onclick="cerrarSesionPersonal('${rol}')"><i class="bi bi-box-arrow-right"></i><span>Cerrar sesión</span></button>
    </div>
  `;
  barra.querySelector('[data-session-name]').textContent = sesion.nombre || sesion.rolTexto || sesion.rol;
  barra.querySelector('[data-session-email]').textContent = sesion.email || '';
  const disparador = barra.querySelector('.personal-session-trigger');
  const popover = barra.querySelector('.personal-session-popover');
  disparador.addEventListener('click', (event) => {
    event.stopPropagation();
    const abrir = popover.hidden;
    popover.hidden = !abrir;
    barra.classList.toggle('is-open', abrir);
    disparador.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('click', (event) => {
    if (barra.contains(event.target)) return;
    popover.hidden = true;
    barra.classList.remove('is-open');
    disparador.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    popover.hidden = true;
    barra.classList.remove('is-open');
    disparador.setAttribute('aria-expanded', 'false');
  });
  const hostSesion = document.querySelector('.waiter-nav .mg-nav-inner, .kitchen-nav .mg-nav-inner') || document.body;
  hostSesion.appendChild(barra);
}

// Bloqueo inmediato al cargar el script + validacion contra BD
(function bloquearRutaPersonalSinSesion() {
  const rol = obtenerRolPorRutaPersonal();
  const archivoActual = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (!rol || archivoActual === 'login.html') {
    window.MENUGO_PERSONAL_BLOQUEADO = false;
    return;
  }

  const sesion = obtenerSesionPersonal(rol);
  window.MENUGO_PERSONAL_SESION = sesion;
  window.MENUGO_PERSONAL_BLOQUEADO = !sesion;

  if (!sesion) {
    window.location.replace('login.html?access=required');
    return;
  }

  // Validar que el trabajador sigue existiendo en la DB
  fetch(`${API_BASE_PERSONAL}/admin/personal/validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
    body: JSON.stringify({ usuario: sesion.email, rol: sesion.rol })
  }).then(r => {
    if (!r.ok) {
      sessionStorage.removeItem(obtenerKeySesionPersonal(rol));
      window.MENUGO_PERSONAL_BLOQUEADO = true;
      window.location.replace('login.html?access=required');
    }
  }).catch(() => {
    sessionStorage.removeItem(obtenerKeySesionPersonal(rol));
    window.MENUGO_PERSONAL_BLOQUEADO = true;
    window.location.replace('login.html?access=required');
  });
})();

function configurarLoginPersonal() {
  const form = document.getElementById('form-login-personal');
  if (!form) return;

  const rol = form.dataset.rol || obtenerRolPorRutaPersonal();
  const config = obtenerConfigPersonal(rol);
  const mensaje = document.getElementById('mensaje-login-personal');

  function mostrarMensaje(texto, tipo = 'info') {
    if (!mensaje) return;
    const clases = {
      info: 'border-blue-200 bg-blue-50 text-blue-800',
      ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      error: 'border-red-200 bg-red-50 text-red-800',
      warning: 'border-orange-200 bg-orange-50 text-orange-800'
    };
    mensaje.className = `mb-5 rounded-2xl border px-4 py-3 text-sm font-bold ${clases[tipo] || clases.info}`;
    mensaje.textContent = texto;
    mensaje.classList.remove('hidden');
  }

  if (!config) {
    mostrarMensaje('No se pudo identificar el rol de acceso.', 'error');
    return;
  }

  const sesion = obtenerSesionPersonal(rol);
  if (sesion) {
    window.location.href = config.inicio;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('access') === 'required') {
    mostrarMensaje(`Debes iniciar sesion como ${config.rol} antes de abrir este panel.`, 'warning');
  }
  if (params.get('logout') === '1') {
    mostrarMensaje('Sesion cerrada correctamente.', 'ok');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const usuario = document.getElementById('login-email')?.value || '';
    const password = document.getElementById('login-password')?.value || '';
    if (!usuario || !password) {
      mostrarMensaje('Ingresa tu usuario y contraseña.', 'error');
      return;
    }
    try {
      await iniciarSesionPersonal(rol, usuario, password);
      window.location.href = config.inicio;
    } catch (error) {
      mostrarMensaje(error.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  configurarLoginPersonal();
  protegerRutaPersonal();
});

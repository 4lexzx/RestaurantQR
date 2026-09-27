// MenuGo - login de administrador via backend real

function mostrarMensajeLogin(texto, tipo = "info") {
  const box = document.getElementById("mensaje-login");
  if (!box) return;
  const clases = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-orange-200 bg-orange-50 text-orange-800",
  };
  box.className = `mb-5 rounded-2xl border px-4 py-3 text-sm font-bold ${clases[tipo] || clases.info}`;
  box.textContent = texto;
  box.classList.remove("hidden");
}

function configurarFormularioLoginAdmin() {
  const formLogin = document.getElementById("form-login-admin");
  if (!formLogin) return;

  formLogin.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = formLogin.querySelector('button[type="submit"]');
    const usuario = document.getElementById("login-email")?.value?.trim() || "";
    const clave = document.getElementById("login-password")?.value || "";

    if (!usuario || !clave) {
      mostrarMensajeLogin("Ingresa usuario y contraseña.", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Ingresando...";

    try {
      const data = await apiJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({ usuario, clave, slug: slugActualAdmin() })
      });

      if (data.multiple && data.accounts) {
        mostrarSelectorRestaurante(data.accounts, usuario, clave);
        return;
      }

      const sesion = crearSesionAdmin(data.data);
      redirigirAdmin(sesion);
    } catch (error) {
      mostrarMensajeLogin(error.message || "Usuario o contraseña incorrectos.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar al panel";
    }
  });
}

function mostrarSelectorRestaurante(accounts, usuario, clave) {
  const form = document.getElementById("form-login-admin");
  if (!form) return;

  const existing = form.querySelector(".selector-restaurante");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.className = "selector-restaurante space-y-3 mt-4";

  const title = document.createElement("p");
  title.className = "text-sm font-bold text-slate-600";
  title.textContent = "Selecciona el restaurante:";
  container.appendChild(title);

  for (const acc of accounts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-bold text-slate-700 hover:border-orange-400 hover:bg-orange-50 transition-all";
    btn.innerHTML = `<span class="font-black">${acc.restaurante_nombre}</span> <span class="ml-2 text-xs text-slate-400">/${acc.restaurante_slug}</span>`;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Conectando...";
      try {
        const data = await apiJson("/auth/login", {
          method: "POST",
          body: JSON.stringify({ usuario, clave, slug: acc.restaurante_slug })
        });
        const sesion = crearSesionAdmin(data.data);
        redirigirAdmin(sesion);
      } catch (error) {
        mostrarMensajeLogin(error.message || "Error al iniciar sesión.", "error");
      }
    });
    container.appendChild(btn);
  }

  form.appendChild(container);
}

function redirigirAdmin(sesion) {
  const slug = sesion.restaurante_slug;
  if (slug) {
    window.location.href = `/r/${slug}/Admin/configuracion.html`;
  } else {
    window.location.href = "dashboard.html";
  }
}

function leerParametrosLoginAdmin() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("access") === "required") {
    mostrarMensajeLogin("Debes iniciar sesión como administrador.", "warning");
  }
  if (params.get("logout") === "1") {
    mostrarMensajeLogin("Sesión cerrada correctamente.", "ok");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const sesion = obtenerSesionAdmin();
  if (sesion) {
    redirigirAdmin(sesion);
    return;
  }
  configurarFormularioLoginAdmin();
  leerParametrosLoginAdmin();
});

// MenuGo - configuración de API + SaaS multi-tenant
// - Detecta el restaurante desde la URL (/r/:slug/...) o ?restaurante=slug
// - Envía el header X-MenuGo-Slug en cada request a la API
// - Carga la configuración del restaurante y aplica paleta/logo/nombre en vivo
(function () {
  const LOCAL_API = "http://localhost:4000/api";
  const PRODUCCION_API = "https://menugo-backend.onrender.com/api";

  const host = window.location.hostname;
  const esLocal = !host || host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");

  window.MENUGO_API = window.MENUGO_API || (esLocal ? LOCAL_API : PRODUCCION_API);

  // ---- Slug del restaurante ----
  const matchRuta = window.location.pathname.match(/^\/r\/([^\/]+?)(?:\/|$)/i);
  const paramSlug = new URLSearchParams(window.location.search).get("restaurante");
  const slug = (matchRuta && matchRuta[1]) || paramSlug || window.MENUGO_SLUG || "menugo";
  window.MENUGO_SLUG = String(slug).trim().toLowerCase();
  const contextoCarrito = window.location.pathname.toLowerCase().includes('llevar')
    ? 'llevar'
    : `mesa:${new URLSearchParams(window.location.search).get('mesa') || 'sin-mesa'}`;
  window.MENUGO_CART_KEY = `menugo_carrito:${window.MENUGO_SLUG}:${contextoCarrito}`;
  const THEME_CACHE_KEY = `mg_theme_cache:${window.MENUGO_SLUG}`;
  const panelActual = (window.location.pathname.match(/\/(Admin|Mesero|Cocina|Cliente)\//i)?.[1] || "publico").toLowerCase();
  const DARK_MODE_KEY = `mg_dark_mode:${window.MENUGO_SLUG}:${panelActual}`;
  const MESA_CONTEXT_KEY = `mg_mesa_context:${window.MENUGO_SLUG}`;

  // El contexto QR vive por pestaña y por restaurante. Esto evita que dos QR
  // abiertos a la vez (o dos tenants en el mismo navegador) compartan mesa/token.
  window.menugoMesaContext = {
    get() {
      try { return JSON.parse(sessionStorage.getItem(MESA_CONTEXT_KEY) || "null") || {}; }
      catch (_) { return {}; }
    },
    set(mesa, token) {
      const actual = this.get();
      const siguiente = {
        mesa: String(mesa || actual.mesa || ""),
        token: String(token || actual.token || ""),
      };
      try { sessionStorage.setItem(MESA_CONTEXT_KEY, JSON.stringify(siguiente)); } catch (_) {}
      return siguiente;
    },
    clear() {
      try { sessionStorage.removeItem(MESA_CONTEXT_KEY); } catch (_) {}
    },
  };

  function reproducirSonidoExito() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const contexto = new AudioContext();
      const inicio = contexto.currentTime;
      const tonos = [659.25, 783.99, 987.77];
      tonos.forEach((frecuencia, indice) => {
        const oscilador = contexto.createOscillator();
        const ganancia = contexto.createGain();
        const empieza = inicio + indice * 0.075;
        oscilador.type = "sine";
        oscilador.frequency.setValueAtTime(frecuencia, empieza);
        ganancia.gain.setValueAtTime(0.0001, empieza);
        ganancia.gain.exponentialRampToValueAtTime(0.085, empieza + 0.018);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, empieza + 0.18);
        oscilador.connect(ganancia);
        ganancia.connect(contexto.destination);
        oscilador.start(empieza);
        oscilador.stop(empieza + 0.2);
      });
      setTimeout(() => contexto.close().catch(() => {}), 700);
    } catch (_) {
      // El navegador puede bloquear audio automático; la confirmación visual continúa.
    }
  }

  function mostrarConfirmacionExito(mensaje, opciones = {}) {
    document.querySelectorAll(".mg-success-flash").forEach((elemento) => elemento.remove());
    const confirmacion = document.createElement("div");
    confirmacion.className = "mg-success-flash";
    confirmacion.setAttribute("role", "status");
    confirmacion.setAttribute("aria-label", String(mensaje || "Acción completada"));
    confirmacion.innerHTML = `<span class="mg-success-mark" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="46"></circle><path d="M35 61.5 52.5 79 86 43.5"></path></svg></span>`;
    document.body.appendChild(confirmacion);
    if (opciones.sonido !== false) reproducirSonidoExito();
    requestAnimationFrame(() => confirmacion.classList.add("is-visible"));
    setTimeout(() => {
      confirmacion.classList.add("is-leaving");
      setTimeout(() => confirmacion.remove(), 320);
    }, Number(opciones.duracion || 1550));
    return confirmacion;
  }

  // Confirmaciones y errores no bloqueantes, compartidos por todos los paneles.
  window.menugoNotificar = function (mensaje, tipo = "success", opciones = {}) {
    if (tipo === "success") return mostrarConfirmacionExito(mensaje, opciones);
    let region = document.getElementById("mg-toast-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "mg-toast-region";
      region.className = "mg-toast-region";
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    const toast = document.createElement("div");
    toast.className = `mg-toast mg-toast--${tipo}`;
    toast.setAttribute("role", tipo === "error" ? "alert" : "status");
    const icono = tipo === "success"
      ? '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12"></circle><path d="m8.5 14.2 3.4 3.4 7.7-8"></path></svg>'
      : '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12"></circle><path d="M14 8v7M14 19h.01"></path></svg>';
    toast.innerHTML = `<span class="mg-toast-icon">${icono}</span><span class="mg-toast-copy"><strong>${tipo === "success" ? "Listo" : "No se pudo completar"}</strong><small></small></span><button type="button" class="mg-toast-close" aria-label="Cerrar">&times;</button>`;
    toast.querySelector("small").textContent = String(mensaje || "");
    const cerrar = () => {
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 220);
    };
    toast.querySelector("button").addEventListener("click", cerrar);
    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(cerrar, Number(opciones.duracion || (tipo === "error" ? 6500 : 3200)));
    return toast;
  };

  // Puente de compatibilidad: cualquier módulo antiguo que todavía use alert()
  // se muestra como notificación animada y nunca bloquea al cliente o al personal.
  window.alert = function (mensaje) {
    const texto = String(mensaje || "");
    const esError = /^(no\b|selecciona\b|agrega\b|ingresa\b|solo\b|a[uú]n\b|completa\b|debe\b)|\b(error|inv[aá]lid[oa]|no se pudo|no encontrado|no encontrada)\b/i.test(texto);
    return window.menugoNotificar(texto, esError ? "error" : "success", {
      duracion: esError ? 5600 : 3000,
    });
  };

  function instalarNavegacionMesero() {
    if (panelActual !== "mesero") return;
    const enlaces = document.querySelector(".waiter-nav .mg-nav-links");
    if (!enlaces) return;
    const pagina = (window.location.pathname.split("/").pop() || "").toLowerCase();
    const vista = new URLSearchParams(window.location.search).get("vista") || "";
    const activo = (destino, vistaDestino = "") => pagina === destino && (!vistaDestino || vista === vistaDestino) ? " active" : "";
    enlaces.innerHTML = `
      <a href="mesas.html" class="mg-nav-link${activo("mesas.html")}"><i class="bi bi-grid-3x3-gap"></i><span>Mesas</span></a>
      <a href="tomar_pedido.html" class="mg-nav-link${activo("tomar_pedido.html")}"><i class="bi bi-cart-plus"></i><span>Tomar pedido</span></a>
      <a href="pedidos.html?vista=listos" class="mg-nav-link${pagina === "pedidos.html" && ["", "listos", "llevar", "cerradas"].includes(vista) ? " active" : ""}"><i class="bi bi-bell"></i><span>Entregas</span></a>
      <a href="pedidos.html?vista=local" class="mg-nav-link${pagina === "pedidos.html" && ["local", "cuentas-historial"].includes(vista) ? " active" : ""}"><i class="bi bi-receipt-cutoff"></i><span>Cuentas</span></a>
      <a href="unir_mesas.html" class="mg-nav-link${activo("unir_mesas.html")}"><i class="bi bi-arrow-left-right"></i><span>Unir mesas</span></a>
      <a href="pago_cruzado.html" class="mg-nav-link${activo("pago_cruzado.html")}"><i class="bi bi-currency-exchange"></i><span>Pago cruzado</span></a>`;
  }

  // ---- fetch con header de tenant (todo el frontend la usa) ----
  (function envolverFetch() {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = function (input, init) {
      init = init || {};
      const destino = typeof input === "string" ? input : (input && input.url) || "";
      const headers = new Headers(init.headers || {});
      if (!headers.has("X-MenuGo-Slug") && window.MENUGO_SLUG && destino) {
        try {
          const apibase = new URL(window.MENUGO_API);
          const url = new URL(destino, window.location.origin);
          if (url.origin === window.location.origin || url.origin === apibase.origin) {
            headers.set("X-MenuGo-Slug", window.MENUGO_SLUG);
          }
        } catch (error) {
          /* ignorar URLs no parseables */
        }
      }
      if (!headers.has("Authorization") && destino) {
        try {
          const ruta = window.location.pathname.toLowerCase();
          const rol = ruta.includes('/mesero/') ? 'mesero' : ruta.includes('/cocina/') ? 'cocina' : ruta.includes('/admin/') ? 'admin' : '';
          const key = rol ? `menugo_${rol}_sesion:${window.MENUGO_SLUG}` : '';
          const sesion = key ? JSON.parse(sessionStorage.getItem(key) || 'null') : null;
          if (sesion?.token) headers.set('Authorization', `Bearer ${sesion.token}`);
        } catch (_) { /* sesión ausente o inválida */ }
      }
      return fetchOriginal(input, Object.assign({}, init, { headers }));
    };
  })();

  // ---- Utilidades de color ----
  function mezclar(hex, blanco, pct) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const factor = pct / 100;
    const canal = (c, punta) => Math.round(punta * factor + c * (1 - factor));
    const mezclado = [canal(r, blanco ? 255 : 0), canal(g, blanco ? 255 : 0), canal(b, blanco ? 255 : 0)];
    return "#" + mezclado.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
  }

  function paletaEscala(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) hex = "#2563EB";
    return {
      "50": mezclar(hex, true, 95),
      "100": mezclar(hex, true, 87),
      "200": mezclar(hex, true, 74),
      "300": mezclar(hex, true, 58),
      "400": mezclar(hex, true, 34),
      "500": hex,
      "600": mezclar(hex, false, 13),
      "700": mezclar(hex, false, 26),
      "800": mezclar(hex, false, 40),
      "900": mezclar(hex, false, 54),
      "950": mezclar(hex, false, 70),
    };
  }

  function luminanciaRelativa(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // ---- Aplicar tema en CSS variables (en vivo, sin recargar) ----
  function aplicarPaleta(config) {
    const primario = config && config.color_primario;
    const secundario = config && config.color_secundario;
    const escala = paletaEscala(primario);
    const root = document.documentElement;

    root.style.setProperty("--mg-primary", "#" + (primario || "#2563EB").replace(/^#/, ""));
    root.style.setProperty("--mg-primary-500", escala["500"]);
    for (const paso in escala) {
      root.style.setProperty("--mg-p" + paso, escala[paso]);
      root.style.setProperty("--mg-primary-" + paso, escala[paso]);
    }
    if (secundario && /^#[0-9a-fA-F]{6}$/.test(secundario)) {
      root.style.setProperty("--mg-secondary", secundario);
      root.style.setProperty("--mg-hero", secundario);
      const oscuro = luminanciaRelativa(secundario) < 0.42;
      root.style.setProperty("--mg-heading", oscuro ? secundario : "#0F172A");
    } else {
      root.style.setProperty("--mg-secondary", "#0F172A");
      root.style.setProperty("--mg-hero", "#0F172A");
      root.style.setProperty("--mg-heading", "#0F172A");
    }
    root.style.setProperty("--mg-accent-soft", "rgba(" + escala["500"].slice(1).match(/../g).map((h) => parseInt(h, 16)).join(", ") + ", 0.12)");
    root.dataset.mgTheme = "aplicado";
    root.dispatchEvent(new CustomEvent("menugo:theme", { detail: config }));
  }

  function aplicarModoOscuro(activo) {
    const root = document.documentElement;
    root.dataset.mgColorScheme = activo ? "dark" : "light";
    document.querySelectorAll("[data-dark-toggle]").forEach((boton) => {
      boton.setAttribute("aria-pressed", String(activo));
      boton.setAttribute("aria-label", activo ? "Activar modo claro" : "Activar modo oscuro");
      boton.innerHTML = activo
        ? '<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z"></path></svg>';
    });
    sincronizarSuperficiesOscuras(activo);
  }

  function sincronizarSuperficiesOscuras(activo) {
    const grupos = [
      { selector: ".client-menu-toolbar, .client-cart-panel, .mg-modal, .mg-modal-content, .kitchen-toolbar, .kitchen-empty", fondo: "#1c1c1e", borde: "#3a3a3c" },
      { selector: ".client-search-box, .client-search-clear, .mg-chip, .mg-cart-item, .kitchen-product, .kitchen-quantity, .admin-worker-card, .admin-image-field", fondo: "#2c2c2e", borde: "#48484a", color: "#d1d1d6" },
      { selector: ".mg-btn-secondary, .mg-filter-btn, .admin-select-trigger, .config-btn-outline, .config-toggle", fondo: "#2c2c2e", borde: "#48484a" },
    ];
    grupos.forEach((grupo) => document.querySelectorAll(grupo.selector).forEach((elemento) => {
      if (activo) {
        elemento.style.setProperty("background-color", grupo.fondo, "important");
        elemento.style.setProperty("border-color", grupo.borde, "important");
        if (grupo.color) elemento.style.setProperty("color", grupo.color, "important");
      } else if (elemento.dataset.mgDarkForced === "1") {
        elemento.style.removeProperty("background-color");
        elemento.style.removeProperty("border-color");
        elemento.style.removeProperty("color");
      }
      elemento.dataset.mgDarkForced = activo ? "1" : "0";
    }));
    document.querySelectorAll(".mg-chip--on, .mg-chip.active, .mg-filter-btn.active, .peer:checked + .mg-chip, .peer:checked ~ .mg-chip").forEach((elemento) => {
      if (activo) {
        elemento.style.setProperty("background-color", "var(--mg-p600)", "important");
        elemento.style.setProperty("border-color", "var(--mg-p600)", "important");
        elemento.style.setProperty("color", "#ffffff", "important");
      } else if (elemento.dataset.mgDarkForced === "1") {
        elemento.style.removeProperty("background-color");
        elemento.style.removeProperty("border-color");
        elemento.style.removeProperty("color");
      }
      elemento.dataset.mgDarkForced = activo ? "1" : "0";
    });
    document.querySelectorAll(".admin-credential-state").forEach((elemento) => {
      if (activo) elemento.style.setProperty("color", elemento.classList.contains("has-credential") ? "#6ee7b7" : "#fda4af", "important");
      else if (elemento.dataset.mgDarkForced === "1") elemento.style.removeProperty("color");
      elemento.dataset.mgDarkForced = activo ? "1" : "0";
    });
    document.querySelectorAll(".client-search-input").forEach((elemento) => {
      if (activo) elemento.style.setProperty("background-color", "transparent", "important");
      else if (elemento.dataset.mgDarkForced === "1") elemento.style.removeProperty("background-color");
      elemento.dataset.mgDarkForced = activo ? "1" : "0";
    });
  }

  function instalarModoOscuro() {
    let activo = false;
    try { activo = localStorage.getItem(DARK_MODE_KEY) === "1"; } catch (_) {}
    aplicarModoOscuro(activo);
    const navegacion = document.querySelector(".mg-nav-links");
    if (!document.querySelector("[data-dark-toggle]")) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "mg-dark-toggle";
      boton.dataset.darkToggle = "";
      const hostModo = panelActual === "mesero"
        ? document.querySelector(".waiter-nav .mg-nav-inner")
        : navegacion;
      if (hostModo) {
        const salida = hostModo.querySelector(".mg-nav-logout");
        const sesion = hostModo.querySelector(".personal-session");
        hostModo.insertBefore(boton, sesion || salida || null);
      } else {
        boton.classList.add("mg-dark-toggle-floating");
        document.body.appendChild(boton);
      }
    }
    aplicarModoOscuro(activo);
    document.querySelectorAll("[data-dark-toggle]").forEach((boton) => {
      if (boton.dataset.darkBound === "1") return;
      boton.dataset.darkBound = "1";
      boton.title = "Cambiar modo claro u oscuro";
      boton.addEventListener("click", () => {
        activo = document.documentElement.dataset.mgColorScheme !== "dark";
        try { localStorage.setItem(DARK_MODE_KEY, activo ? "1" : "0"); } catch (_) {}
        aplicarModoOscuro(activo);
      });
    });
    if (!window.__menugoDarkObserver) {
      let pendiente = false;
      window.__menugoDarkObserver = new MutationObserver(() => {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => {
          pendiente = false;
          sincronizarSuperficiesOscuras(document.documentElement.dataset.mgColorScheme === "dark");
        });
      });
      window.__menugoDarkObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ---- Aplicar tema cacheado INMEDIATAMENTE (síncrono, antes del paint) ----
  try {
    var cachedTheme = JSON.parse(localStorage.getItem(THEME_CACHE_KEY));
    if (cachedTheme) {
      if (cachedTheme.color_primario) aplicarPaleta(cachedTheme);
      if (cachedTheme.moneda) window.MENUGO_MONEDA = cachedTheme.moneda;
      if (cachedTheme.logo_url) {
        document.querySelectorAll('.logo-img, [data-logo]').forEach(function(img) {
          img.src = cachedTheme.logo_url;
          img.style.visibility = 'visible';
        });
      }
      if (cachedTheme.nombre) aplicarBranding(cachedTheme);
    }
  } catch(_) {}

  // ---- Branding: nombre en <title> y logo ----
  function aplicarBranding(config) {
    if (!config) return;
    const conNombre = config.nombre ? config.nombre.trim() : "";
    if (conNombre) {
      const titulo = document.title || "";
      if (!titulo.toLowerCase().startsWith(conNombre.toLowerCase())) {
        document.title = titulo ? `${conNombre} · ${titulo.replace(/^MenuGo\s*[·|]?\s*/i, "")}` : conNombre;
      }
    }
    if (config.moneda) {
      window.MENUGO_MONEDA = String(config.moneda).trim() || "S/";
    }
    const logos = document.querySelectorAll('.logo-img, [data-logo]');
    logos.forEach((img) => {
      if (img.closest('#mg-splash')) return;
      if (config.logo_url) {
        img.src = config.logo_url;
      } else if (conNombre) {
        const iniciales = conNombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte.charAt(0)).join('').toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ0-9]/g, '') || 'R';
        const primario = /^#[0-9a-f]{6}$/i.test(config.color_primario || '') ? config.color_primario : '#2563EB';
        const secundario = /^#[0-9a-f]{6}$/i.test(config.color_secundario || '') ? config.color_secundario : '#0F172A';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primario}"/><stop offset="1" stop-color="${secundario}"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="url(#g)"/><circle cx="60" cy="60" r="42" fill="none" stroke="white" stroke-opacity=".2" stroke-width="2"/><text x="60" y="69" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="800" fill="white">${iniciales}</text></svg>`;
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      }
      img.alt = conNombre ? `Logo de ${conNombre}` : 'Logo del restaurante';
      img.style.visibility = 'visible';
    });

    document.querySelectorAll('[data-tenant-name]').forEach((elemento) => {
      if (conNombre) elemento.textContent = conNombre;
    });
  }

  // ---- Carga de configuración y aplicación ----
  async function cargarConfiguracion() {
    try {
      const response = await fetch(`${window.MENUGO_API}/restaurantes/${encodeURIComponent(window.MENUGO_SLUG)}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        throw new Error((data && data.message) || "Configuración no disponible");
      }
      window.MENUGO_CONFIG = data.data;
      aplicarPaleta(data.data);
      aplicarBranding(data.data);
      try { localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ nombre: data.data.nombre, color_primario: data.data.color_primario, color_secundario: data.data.color_secundario, logo_url: data.data.logo_url, moneda: data.data.moneda })); } catch(_) {}
      return data.data;
    } catch (error) {
      console.warn("MenuGo: no se pudo cargar la configuración del restaurante:", error.message);
      aplicarPaleta(null);
      return null;
    }
  }

  window.menugoAplicarTema = function (config) {
    window.MENUGO_CONFIG = config;
    aplicarPaleta(config);
    aplicarBranding(config);
  };

  document.addEventListener("DOMContentLoaded", () => {
    instalarNavegacionMesero();
    instalarModoOscuro();
  });
  window.MENUGO_READY = cargarConfiguracion();
})();

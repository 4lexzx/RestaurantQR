const CLIENTE_CART_KEY = window.MENUGO_CART_KEY || `menugo_carrito:${window.MENUGO_SLUG || 'menugo'}:mesa:sin-mesa`;
let carrito = JSON.parse(localStorage.getItem(CLIENTE_CART_KEY)) || [];
let categoriaActual = "todas";
let busquedaActual = "";
const API_BASE_MENU = window.MENUGO_API || "http://localhost:4000/api";
const MAX_PLATOS_PEDIDO = 7;
let productosMenuBD = null;

function contarPlatosCarrito() {
  return carrito.reduce((total, item) => total + Number(item.cantidad || 0), 0);
}

function guardarCarritoLocal() {
  localStorage.setItem(CLIENTE_CART_KEY, JSON.stringify(carrito));
}

function normalizarCarritoMaximo() {
  let restantes = MAX_PLATOS_PEDIDO;
  let huboCambios = false;
  const normalizado = [];

  carrito.forEach((item) => {
    const cantidadOriginal = Number(item.cantidad || 0);
    const cantidad = Math.max(0, cantidadOriginal);
    if (cantidadOriginal !== cantidad) huboCambios = true;
    if (cantidad <= 0 || restantes <= 0) {
      huboCambios = true;
      return;
    }

    const cantidadPermitida = Math.min(cantidad, restantes);
    if (cantidadPermitida !== cantidadOriginal) huboCambios = true;
    normalizado.push({ ...item, cantidad: cantidadPermitida });
    restantes -= cantidadPermitida;
  });

  if (huboCambios || normalizado.length !== carrito.length) {
    carrito = normalizado;
    guardarCarritoLocal();
  }
}

function avisarLimitePedido() {
  alert(`Solo puedes agregar maximo ${MAX_PLATOS_PEDIDO} platos/productos por pedido.`);
}

function puedeAgregarPlato() {
  if (contarPlatosCarrito() >= MAX_PLATOS_PEDIDO) {
    avisarLimitePedido();
    return false;
  }
  return true;
}

function productoDesdeBD(producto) {
  const id = producto.codigo_producto || String(producto.id_producto || producto.id);
  const productoLocal = buscarProductoLocalMenuGo({ ...producto, id });
  const categoriaOriginal = producto.categoria || producto.tipo_producto || producto.tipo || "otros";
  const categoria = productoLocal?.categoria && ["plato", "bebida", "otros"].includes(normalizarTextoMenuGo(categoriaOriginal))
    ? productoLocal.categoria
    : categoriaOriginal;
  const normalizado = {
    ...producto,
    id,
    codigo_producto: id,
    nombre: producto.nombre || productoLocal?.nombre || "Producto sin nombre",
    descripcion: producto.descripcion || productoLocal?.descripcion || "",
    categoria,
    imagen: producto.imagen || productoLocal?.imagen || IMAGEN_PLATO_PLACEHOLDER,
  };

  const variantesLocal = productoLocal?.variantes && productoLocal.variantes.length > 0
  ? productoLocal.variantes
  : [{ nombre: "Unidad", precio: Number(producto.precio || 0) }];

return {
  ...normalizado,
  disponible_llevar: producto.disponible_llevar !== false,
  variantes: variantesLocal,
  opciones: opcionesProductoMenuGo(normalizado),
};
}

async function cargarProductosDesdeBD() {
  try {
    const response = await fetch(`${API_BASE_MENU}/productos/disponibles`, {
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "No se pudo cargar productos");
    }

    productosMenuBD = Array.isArray(data.data)
      ? data.data.map(productoDesdeBD)
      : [];
  } catch (error) {
    console.error("No se pudo cargar el menú desde la BD:", error.message);

    // En producción no conviene volver a platos.js,
    // porque puede mostrar productos eliminados por el admin.
    productosMenuBD = [];
  }
}

function obtenerPlatosDisponibles() {
  const base = Array.isArray(productosMenuBD) ? productosMenuBD : [];

  return base.filter((producto) => {
    return (
      producto.activo !== false &&
      producto.disponible_local !== false &&
      producto.disponible !== false
    );
  });
}

function obtenerDestinoResumen() {
  const contexto = window.menugoMesaContext?.get() || {};
  const mesa = contexto.mesa;
  const token = contexto.token;
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (numero && token) {
    return `../Cliente/resumen_pedido.html?mesa=${encodeURIComponent(numero)}&token=${encodeURIComponent(token)}`;
  }
  if (numero) {
    return `../Cliente/resumen_pedido.html?mesa=${encodeURIComponent(numero)}`;
  }
  return "../Cliente/resumen_pedido.html";
}


function inicializarContextoPedido() {
  const params = new URLSearchParams(window.location.search);
  const mesa = params.get("mesa");
  const token = params.get("token");
  const tipo = params.get("tipo");

  if (mesa) {
    window.menugoMesaContext?.set(mesa, token);
  }

  if (token) {
    window.menugoMesaContext?.set(mesa, token);
  }

  if (tipo) {
    localStorage.setItem("tipoConsumo", tipo);
  }
}

function soles(valor) {
  const moneda = window.MENUGO_MONEDA || "S/";
  return `${moneda} ${Number(valor).toFixed(2)}`;
}

function nombreCategoria(id) {
  return (
    categorias.find((categoria) => categoria.id === id)?.nombre ||
    "Todos los platos"
  );
}

function normalizarBusqueda(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function productoCoincideConBusqueda(producto) {
  const termino = normalizarBusqueda(busquedaActual);
  if (!termino) return true;

  const textoProducto = normalizarBusqueda([
    producto.nombre,
    producto.descripcion,
    nombreCategoria(producto.categoria),
    producto.categoria,
    ...(producto.variantes || []).map((variante) => variante.nombre),
    ...(producto.opciones || []),
  ].join(" "));

  return textoProducto.includes(termino);
}

function actualizarTextoResultado(cantidad) {
  const resultado = document.getElementById("resultado-busqueda");
  if (!resultado) return;

  const termino = busquedaActual.trim();
  const categoriaTexto = categoriaActual === "todas" ? "todas las categorias" : nombreCategoria(categoriaActual);

  if (!termino) {
    resultado.textContent = `Mostrando ${cantidad} producto(s) en ${categoriaTexto}.`;
    return;
  }

  resultado.textContent = cantidad === 0
    ? `No se encontraron productos para "${termino}" en todo el menu.`
    : `Se encontraron ${cantidad} producto(s) para "${termino}" en todo el menu.`;
}

function renderCategorias() {
  const contenedor = document.getElementById("categorias-container");
  contenedor.innerHTML = categorias
    .map((categoria) => {
      const activo = categoria.id === categoriaActual;
      const clases = activo
        ? "mg-chip-cat mg-chip-cat--on"
        : "mg-chip-cat";

      return `
      <button type="button" class="${clases}" onclick="filtrarCategoria('${categoria.id}')">
        ${categoria.nombre}
      </button>
    `;
    })
    .join("");
}

function renderProductos() {
  const contenedor = document.getElementById("productos-container");
  const platosBase = obtenerPlatosDisponibles();
  const hayBusqueda = normalizarBusqueda(busquedaActual).length > 0;

  const productosFiltrados = platosBase.filter((producto) => {
    const coincideCategoria = hayBusqueda || categoriaActual === "todas" || producto.categoria === categoriaActual;
    return coincideCategoria && productoCoincideConBusqueda(producto);
  });

  document.getElementById("titulo-categoria").textContent = hayBusqueda
    ? "Resultados de busqueda"
    : categoriaActual === "todas"
      ? "Todos los platos"
      : nombreCategoria(categoriaActual);

  actualizarTextoResultado(productosFiltrados.length);

  if (productosFiltrados.length === 0) {
    contenedor.innerHTML = `
      <div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center shadow-sm">
        <p class="text-lg font-black text-slate-900">No encontramos platos con esa busqueda.</p>
        <p class="mt-2 text-sm font-semibold text-slate-500">Prueba con otro nombre o limpia el buscador.</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = productosFiltrados
    .map((producto, index) => crearCardProducto(producto, index))
    .join("");
}

function crearCardProducto(producto, index) {
  const varianteDefault = producto.variantes[0];
  const precioTexto =
    producto.variantes.length === 1
      ? `${soles(varianteDefault.precio)}`
      : producto.variantes
          .map((v) => `${v.nombre}: ${soles(v.precio)}`)
          .join(" · ");

  const variantesHtml = producto.variantes
    .map((variante, index) => {
      const inputId = `${producto.id}-var-${index}`;
      return `
      <label for="${inputId}" class="cursor-pointer">
        <input class="peer sr-only" type="radio" name="variante-${producto.id}" id="${inputId}" value="${index}" ${index === 0 ? "checked" : ""}>
        <span class="mg-chip">${variante.nombre}</span>
      </label>
    `;
    })
    .join("");

  const limiteOpciones = typeof LIMITE_OPCIONES_PRODUCTO !== "undefined" ? LIMITE_OPCIONES_PRODUCTO : 2;
  const opcionesHtml = producto.opciones
    .map((opcion, index) => {
      const inputId = `${producto.id}-op-${index}`;
      return `
      <label for="${inputId}" class="cursor-pointer">
        <input class="peer sr-only" type="checkbox" name="opcion-${producto.id}" id="${inputId}" value="${opcion}" ${index === 0 ? "checked" : ""} onchange="validarOpcionesProductoMenuGo('opcion-${producto.id}', this, ${limiteOpciones})">
        <span class="mg-chip">${opcion}</span>
      </label>
    `;
    })
    .join("");

  const avisoOpcionesHtml = producto.opciones.length > limiteOpciones
    ? `<p class="mb-2 text-xs font-semibold text-orange-600">Puedes escoger máximo ${limiteOpciones} opciones.</p>`
    : "";

  return `
    <article class="mg-card-plato" data-categoria="${producto.categoria}" data-anim="fade-up" data-anim-delay="${Math.min((index || 0) * 40, 400)}">
      <div class="mg-card-plato-img">
        <img src="${producto.imagen}" alt="${producto.nombre}" loading="lazy" onerror="this.onerror=null; this.src='${IMAGEN_PLATO_PLACEHOLDER}';">
        <span class="mg-card-plato-cat">${nombreCategoria(producto.categoria)}</span>
      </div>

      <div class="mg-card-plato-body">
        <h3>${producto.nombre}</h3>
        <p class="mg-card-plato-desc">${producto.descripcion}</p>
        <span class="mg-card-plato-precio">${precioTexto}</span>

        ${
          producto.variantes.length > 1
            ? `
          <div class="mb-3">
            <p class="mg-card-plato-lbl">Tamaño / presentación</p>
            <div class="flex flex-wrap gap-2">${variantesHtml}</div>
          </div>
        `
            : `<input type="hidden" name="variante-${producto.id}" value="0">`
        }

        <div class="mb-4">
          <p class="mg-card-plato-lbl">¿Cómo quieres tu plato?</p>
          ${avisoOpcionesHtml}
          <div class="flex flex-wrap gap-2">${opcionesHtml}</div>
        </div>
      </div>

      <button type="button" class="mg-card-plato-cta" onclick="agregarAlCarrito('${producto.id}')">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Agregar al carrito
      </button>
    </article>
  `;
}

function filtrarCategoria(categoria) {
  categoriaActual = categoria;
  renderCategorias();
  renderProductos();
  document.getElementById("titulo-categoria")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function obtenerSeleccion(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function obtenerSelecciones(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map((input) => input.value)
    .filter(Boolean);
}

function validarLimiteOpcionesProducto(name, checkbox, limite = 2) {
  return validarOpcionesProductoMenuGo(name, checkbox, limite);
}

function agregarAlCarrito(idProducto) {
  if (!puedeAgregarPlato()) return;

  const producto = obtenerPlatosDisponibles().find((item) => item.id === idProducto);
  if (!producto) {
    alert("Producto no encontrado.");
    return;
  }

  const varianteIndex = Number(obtenerSeleccion(`variante-${idProducto}`) || 0);
  const variante = producto.variantes[varianteIndex] || producto.variantes[0];
  const opcionesSeleccionadas = obtenerSelecciones(`opcion-${idProducto}`);
  const opcion = opcionesSeleccionadas.length
    ? opcionesSeleccionadas.join(" + ")
    : "Preparación normal";
  const clave = `${producto.id}-${variante.nombre}-${opcion}`;

  const existente = carrito.find((item) => item.clave === clave);
  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      clave,
      id: producto.id,
      nombre: producto.nombre,
      precio: variante.precio,
      variante: variante.nombre,
      opcion,
      comentario: opcion,
      cantidad: 1,
      categoria: producto.categoria,
    });
  }

  guardarCarritoLocal();
  actualizarCarrito();
  mostrarMensajeAgregado(producto.nombre);
}

function actualizarCantidad(clave, cambio) {
  const item = carrito.find((producto) => producto.clave === clave);
  if (!item) return;

  if (cambio > 0 && contarPlatosCarrito() >= MAX_PLATOS_PEDIDO) {
    avisarLimitePedido();
    return;
  }

  item.cantidad += cambio;
  if (item.cantidad <= 0) {
    carrito = carrito.filter((producto) => producto.clave !== clave);
  }

  guardarCarritoLocal();
  actualizarCarrito();
}

function eliminarItem(clave) {
  carrito = carrito.filter((producto) => producto.clave !== clave);
  guardarCarritoLocal();
  actualizarCarrito();
}

function actualizarCarrito() {
  normalizarCarritoMaximo();

  const lista = document.getElementById("lista-carrito");
  const totalEl = document.getElementById("total-carrito");
  const totalMobileEl = document.getElementById("total-carrito-mobile");

  if (!lista || !totalEl) return;

  if (carrito.length === 0) {
    lista.innerHTML = `<div class="mg-empty">Tu carrito está vacío.</div>`;
  } else {
    lista.innerHTML = carrito
      .map(
        (item) => `
      <div class="mg-cart-item">
        <div class="flex items-start justify-between gap-3">
          <strong class="text-sm font-black leading-snug text-slate-950">${item.nombre}</strong>
          <button type="button" class="mg-cart-item-accion" onclick="eliminarItem('${item.clave}')">Quitar</button>
        </div>

        <p class="mt-1 text-xs font-semibold text-slate-500">${item.variante} · ${item.opcion}</p>

        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button class="mg-qty-btn" type="button" onclick="actualizarCantidad('${item.clave}', -1)">−</button>
            <span class="min-w-5 text-center text-sm font-black text-slate-950">${item.cantidad}</span>
            <button class="mg-qty-btn" type="button" onclick="actualizarCantidad('${item.clave}', 1)">+</button>
          </div>
          <strong class="text-sm font-black text-slate-950">${soles(item.precio * item.cantidad)}</strong>
        </div>
      </div>
    `,
      )
      .join("");
  }

  const total = carrito.reduce(
    (suma, item) => suma + item.precio * item.cantidad,
    0,
  );
  totalEl.textContent = soles(total);
  if (totalMobileEl) totalMobileEl.textContent = soles(total);

  animarTotalCarrito(totalEl);
  if (totalMobileEl) animarTotalCarrito(totalMobileEl);
}

function animarTotalCarrito(el) {
  if (!el) return;
  el.classList.remove("mg-bump");
  void el.offsetWidth;
  el.classList.add("mg-bump");
}

function guardarCarrito() {
  normalizarCarritoMaximo();
  if (carrito.length === 0) {
    alert("Agrega al menos un producto antes de continuar.");
    return;
  }
  if (contarPlatosCarrito() > MAX_PLATOS_PEDIDO) {
    avisarLimitePedido();
    return;
  }
  guardarCarritoLocal();
  window.location.href = obtenerDestinoResumen();
}

function irPedidoActual() {
  const contexto = window.menugoMesaContext?.get() || {};
  const mesa = contexto.mesa;
  const token = contexto.token;
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (numero && token) {
    window.location.href = `../Cliente/pedido_actual.html?mesa=${encodeURIComponent(numero)}&token=${encodeURIComponent(token)}`;
    return;
  }
  window.location.href = numero
    ? `../Cliente/pedido_actual.html?mesa=${encodeURIComponent(numero)}`
    : "../Cliente/pedido_actual.html";
}

function toggleCarrito() {
  const panel = document.getElementById("cart-panel");
  if (!panel) return;
  panel.classList.toggle("hidden");
  panel.classList.toggle("flex");
}

function mostrarMensajeAgregado(nombreProducto) {
  window.menugoNotificar?.(`${nombreProducto} agregado al carrito`, "success", { duracion: 1250 });
}

async function refrescarProductosCliente() {
  await cargarProductosDesdeBD();
  renderCategorias();
  renderProductos();
}

function inicializarBuscadorPlatos() {
  const buscador = document.getElementById("buscador-platos");
  const limpiar = document.getElementById("limpiar-busqueda");

  if (!buscador) return;

  buscador.value = busquedaActual;
  buscador.addEventListener("input", (event) => {
    busquedaActual = event.target.value;
    renderProductos();
  });

  if (limpiar) {
    limpiar.addEventListener("click", () => {
      busquedaActual = "";
      buscador.value = "";
      renderProductos();
      buscador.focus();
    });
  }
}

function iniciarEscuchaEventosCliente() {
  document.addEventListener('producto:actualizado', () => {
    refrescarProductosCliente();
    actualizarCarrito();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarContextoPedido();
  inicializarBuscadorPlatos();
  await refrescarProductosCliente();
  actualizarCarrito();
  iniciarEscuchaEventosCliente();
});
 

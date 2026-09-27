if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
var API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let pedidos = [];
let filtroActual = "todos";

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase();
}

function escapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function soles(valor) {
  return Number(valor || 0).toFixed(2);
}

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarPedidos() {
  const data = await apiJson("/cocina/pedidos");
  pedidos = data.data || [];
}

function estadoPedido(pedido) {
  return pedido.estadoPedido || pedido.estado || "Pendiente";
}

function estadoDb(pedido) {
  return pedido.estado_db || normalizar(estadoPedido(pedido));
}

function esEntregadoOPagado(pedido) {
  const e = estadoDb(pedido);
  return ["entregado", "cancelado"].includes(e);
}

function esListo(pedido) {
  return estadoDb(pedido) === "listo" || normalizar(estadoPedido(pedido)).includes("listo");
}

function esPedidoLlevar(pedido) {
  const tipo = normalizar(pedido.tipo_pedido || pedido.tipoConsumo);
  return tipo.includes("llevar") || tipo.includes("recoger");
}

function textoListoSegunTipo(pedido) {
  return esPedidoLlevar(pedido) ? "Listo para recoger" : "Listo para llevar a la mesa";
}

function pedidosActivosCocina() {
  return pedidos.filter((pedido) => !esEntregadoOPagado(pedido));
}

function filtrarPedidos(estado) {
  filtroActual = estado;
  document.querySelectorAll("[data-kitchen-filter]").forEach((boton) => {
    boton.classList.toggle("active", boton.dataset.kitchenFilter === estado);
  });
  mostrarPedidos();
}

function actualizarMetricasCocina() {
  const activos = pedidosActivosCocina();
  const valores = {
    "kitchen-stat-total": activos.length,
    "kitchen-stat-pending": activos.filter((p) => estadoDb(p) === "pendiente").length,
    "kitchen-stat-cooking": activos.filter((p) => estadoDb(p) === "preparando").length,
    "kitchen-stat-ready": activos.filter(esListo).length,
  };
  Object.entries(valores).forEach(([id, valor]) => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
  });
}

function coincideFiltro(pedido) {
  if (filtroActual === "todos") return true;
  if (filtroActual === "listos") return esListo(pedido);
  if (filtroActual === "Pendiente") return estadoDb(pedido) === "pendiente";
  if (filtroActual === "En preparación") return estadoDb(pedido) === "preparando";
  return normalizar(estadoPedido(pedido)) === normalizar(filtroActual);
}

async function mostrarPedidos() {
  const contenedor = document.getElementById("contenedor-pedidos");
  if (!contenedor) return;

  if (!contenedor.children.length) {
    contenedor.innerHTML = `<div class="kitchen-empty"><span class="kitchen-empty-icon"><i class="bi bi-arrow-repeat"></i></span><h2>Sincronizando comandas</h2><p>Conectando con la estación de cocina...</p></div>`;
  }

  try {
    await cargarPedidos();
  } catch (error) {
    contenedor.innerHTML = `
      <div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
        <h2 class="text-2xl font-black">No se pudo conectar con cocina</h2>
        <p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p>
      </div>`;
    return;
  }

  actualizarMetricasCocina();

  const pedidosFiltrados = pedidosActivosCocina().filter(coincideFiltro);
  if (pedidosFiltrados.length === 0) {
    contenedor.innerHTML = `
      <div class="kitchen-empty" data-anim="fade-up">
        <span class="kitchen-empty-icon"><i class="bi bi-check2-all"></i></span>
        <h2>Estación al día</h2>
        <p>No hay comandas en este estado. Los nuevos pedidos aparecerán automáticamente.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = pedidosFiltrados.map(renderPedido).join("");
}

function renderPedido(pedido) {
  const productos = pedido.productos || pedido.items || [];
  const estado = estadoPedido(pedido);
  const listo = esListo(pedido);
  const textoListo = textoListoSegunTipo(pedido);

  const productosHtml = productos.map((item) => `
    <li class="kitchen-product">
      <span class="kitchen-quantity">${Number(item.cantidad || 1)}×</span>
      <div><strong>${escapeHtml(item.nombre)}</strong><small><i class="bi bi-chat-left-text"></i>${escapeHtml(item.observacion || item.opcion || item.comentario || "Sin indicaciones especiales")}</small></div>
    </li>`).join("");

  const acciones = listo
    ? `<div class="kitchen-ready-message"><i class="bi bi-check-circle-fill"></i><span><strong>Pedido terminado</strong><small>Ya está visible para entrega o recojo.</small></span>
       </div>`
    : `<div class="kitchen-actions">
         ${estadoDb(pedido) !== "preparando" ? `<button type="button" onclick="cambiarEstado('${escapeHtml(String(pedido.id_pedido || pedido.id))}', 'preparando')" class="kitchen-action-start"><i class="bi bi-fire"></i>Empezar preparación</button>` : ""}
         <button type="button" onclick="cambiarEstado('${escapeHtml(String(pedido.id_pedido || pedido.id))}', 'listo')" class="kitchen-action-ready"><i class="bi bi-check2-circle"></i>${textoListo}</button>
       </div>`;

  const claseEstado = listo ? "is-ready" : estadoDb(pedido) === "preparando" ? "is-cooking" : "is-pending";
  const iconoEstado = listo ? "bi-check-circle-fill" : estadoDb(pedido) === "preparando" ? "bi-fire" : "bi-hourglass-split";
  const tipo = esPedidoLlevar(pedido) ? "Para llevar" : `Mesa ${escapeHtml(pedido.mesa || "-")}`;

  return `
    <article class="kitchen-ticket ${claseEstado}" data-anim="fade-up">
      <div class="kitchen-ticket-accent"></div>
      <header class="kitchen-ticket-head">
        <div class="kitchen-order-identity"><span>${tipo}</span><h2>${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido || pedido.id}`)}</h2></div>
        <span class="kitchen-state"><i class="bi ${iconoEstado}"></i>${escapeHtml(estado)}</span>
      </header>
      <div class="kitchen-ticket-meta">
        <span><i class="bi bi-clock"></i>${escapeHtml(pedido.hora || "Ahora")}</span>
        <span><i class="bi bi-person"></i>${escapeHtml(pedido.cliente || pedido.nombre_cliente || "Cliente")}</span>
        ${esPedidoLlevar(pedido) ? `<span><i class="bi bi-telephone"></i>${escapeHtml(pedido.telefono_llevar || pedido.telefono || "Sin celular")}</span>` : ""}
      </div>
      <div class="kitchen-products-title"><span>Preparaciones</span><strong>${productos.length} ${productos.length === 1 ? "ítem" : "ítems"}</strong></div>
      <ul class="kitchen-products">${productosHtml}</ul>
      ${acciones}
    </article>`;
}

function colorEstado(estado) {
  const e = normalizar(estado);
  if (e.includes("listo")) return "bg-emerald-100 text-emerald-700";
  if (e.includes("prepar")) return "bg-yellow-100 text-yellow-700";
  if (e.includes("entregado")) return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

async function cambiarEstado(idPedido, nuevoEstado) {
  try {
    await apiJson(`/cocina/pedidos/${encodeURIComponent(idPedido)}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    await mostrarPedidos();
  } catch (error) {
    alert(`No se pudo actualizar el pedido: ${error.message}`);
  }
}

function recargarCocina() {
  mostrarPedidos();
}

function iniciarEscuchaEventosCocina() {
  if (typeof realTime === "undefined" || !realTime) return;
  realTime.connect();

  const handlePedidoActualizado = () => {
    mostrarPedidos();
  };

  realTime.on("pedido:creado", handlePedidoActualizado);
  realTime.on("pedido:actualizado", handlePedidoActualizado);
}

document.addEventListener("DOMContentLoaded", () => {
  mostrarPedidos();
  iniciarEscuchaEventosCocina();
});

var API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let pedidosActuales = [];
let mesaActualCliente = null;

function soles(valor) { return Number(valor || 0).toFixed(2); }
function normalizar(valor) { return String(valor || "").trim().toLowerCase(); }
function escapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function obtenerMesaActual() {
  const params = new URLSearchParams(window.location.search);
  const mesaUrl = params.get("mesa");
  if (mesaUrl) {
    window.menugoMesaContext?.set(mesaUrl, params.get("token"));
    return mesaUrl;
  }
  return window.menugoMesaContext?.get().mesa || "Sin mesa asignada";
}

function obtenerTokenMesaActual() {
  const params = new URLSearchParams(window.location.search);
  const tokenUrl = params.get("token");
  if (tokenUrl) {
    window.menugoMesaContext?.set(params.get("mesa"), tokenUrl);
    return tokenUrl;
  }
  return window.menugoMesaContext?.get().token || "";
}

function urlMenuMesa(numeroMesa) {
  const token = obtenerTokenMesaActual();
  if (numeroMesa && token) return `menu.html?mesa=${encodeURIComponent(numeroMesa)}&token=${encodeURIComponent(token)}`;
  return numeroMesa ? `menu.html?mesa=${encodeURIComponent(numeroMesa)}` : "menu.html";
}

function totalItem(item) {
  return Number(item.subtotal || Number(item.precio || 0) * Number(item.cantidad || 1));
}

function totalPedido(pedido) {
  return Number(pedido.total || (pedido.productos || []).reduce((s, item) => s + totalItem(item), 0));
}

function esPagado(pedido) {
  return pedido.pago_completo === true || normalizar(pedido.estadoPago) === "pagado";
}

function esCancelado(pedido) {
  const estado = normalizar(pedido.estado_db || pedido.estado || pedido.estadoPedido);
  return estado.includes("cancel");
}

function esEntregado(pedido) {
  const estado = normalizar(pedido.estado_db || pedido.estado || pedido.estadoPedido);
  return estado.includes("entregado");
}

function totalPendientePedido(pedido) {
  if (esPagado(pedido) || esCancelado(pedido)) return 0;
  return totalPedido(pedido);
}

function pedidosPendientesDePago() {
  return pedidosActuales.filter((pedido) => !esCancelado(pedido) && !esPagado(pedido));
}

function pedidosNoEntregados() {
  return pedidosPendientesDePago().filter((pedido) => !esEntregado(pedido));
}

function puedeSolicitarCuenta() {
  const pendientesPago = pedidosPendientesDePago();
  return pendientesPago.length > 0 && pedidosNoEntregados().length === 0;
}

function claseEstadoPedido(estado) {
  const e = normalizar(estado);
  if (e.includes("entregado")) return "is-delivered";
  if (e.includes("listo")) return "is-ready";
  if (e.includes("prepar")) return "is-preparing";
  if (e.includes("cancel")) return "is-cancelled";
  return "is-pending";
}

function textoEstadoCliente(estado) {
  const e = normalizar(estado);
  if (e.includes("entregado")) return "Entregado por el mesero";
  if (e.includes("listo")) return "Listo para entregar";
  if (e.includes("prepar")) return "En preparacion";
  if (e.includes("cancel")) return "Cancelado";
  return "Pendiente en cocina";
}

function iconoEstadoCliente(estado) {
  const e = normalizar(estado);
  if (e.includes("entregado")) return "bi bi-hand-thumbs-up-fill";
  if (e.includes("listo")) return "bi bi-check-circle-fill";
  if (e.includes("prepar")) return "bi bi-fire";
  if (e.includes("cancel")) return "bi bi-x-circle-fill";
  return "bi bi-hourglass-split";
}

function itemHtml(item) {
  return `<li class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-black text-slate-950">${escapeHtml(item.nombre)} x${Number(item.cantidad || 1)}</p>
        <p class="mt-1 text-xs font-semibold text-slate-500">${escapeHtml(item.observacion || item.opcion || "Sin observaciones")}</p>
      </div>
      <p class="text-sm font-black">S/ ${soles(totalItem(item))}</p>
    </div>
  </li>`;
}

function pedidoHtml(pedido) {
  const estado = pedido.estado_db || pedido.estadoPedido || pedido.estado || "pendiente";
  const pendiente = totalPendientePedido(pedido);
  let estadoTexto = textoEstadoCliente(estado);
  let estadoClase = claseEstadoPedido(estado);
  let estadoIcono = iconoEstadoCliente(estado);

  if (esPagado(pedido)) {
    estadoTexto = "Pagado";
    estadoClase = "is-paid";
    estadoIcono = "bi bi-check2-circle";
  }

  return `<article class="client-current-order-card rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5" data-anim="fade-up">
    <div class="client-current-order-head mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm font-black uppercase tracking-wide text-slate-500">Pedido</p>
        <h2 class="text-2xl font-black text-slate-950">${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido}`)}</h2>
        <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(pedido.fecha || "")} ${escapeHtml(pedido.hora || "")}</p>
      </div>
      <span class="client-order-status ${estadoClase}"><i class="${estadoIcono}"></i>${estadoTexto}</span>
    </div>
    <ul class="mb-4 space-y-2">${(pedido.productos || []).map(itemHtml).join("")}</ul>
    <div class="client-order-totals grid grid-cols-2 gap-3">
      <div class="rounded-2xl bg-slate-50 p-3">
        <p class="text-xs font-black uppercase text-slate-500">Total</p>
        <p class="text-xl font-black">S/ ${soles(totalPedido(pedido))}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-3">
        <p class="text-xs font-black uppercase text-slate-500">Pendiente</p>
        <p class="text-xl font-black text-orange-600">S/ ${soles(pendiente)}</p>
      </div>
    </div>
  </article>`;
}

async function cargarPedidosMesa() {
  const mesa = obtenerMesaActual();
  mesaActualCliente = mesa;
  const numero = String(mesa || "").match(/\d+/)?.[0];
  if (!numero) return [];

  const data = await apiJson(`/pedidos/mesa/${encodeURIComponent(numero)}`);
  const pedidos = data.data || [];
  return pedidos.filter((pedido) => !esCancelado(pedido) && !esPagado(pedido));
}

function actualizarBotonSolicitarCuenta() {
  const boton = document.getElementById("btn-solicitar-cuenta");
  if (!boton) return;

  if (puedeSolicitarCuenta()) {
    boton.disabled = false;
    boton.title = "Solicitar cuenta";
    boton.className = "rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800";
    return;
  }

  boton.disabled = false;
  boton.title = "Solo puedes solicitar cuenta cuando todos los pedidos fueron entregados";
  boton.className = "rounded-2xl bg-slate-400 px-5 py-3 text-sm font-black text-white hover:bg-slate-500";
}

async function renderPedidoActual() {
  const contenedor = document.getElementById("contenedor-pedido-actual");
  if (!contenedor) return;

  const mesa = obtenerMesaActual();
  const numeroMesa = String(mesa).match(/\d+/)?.[0] || "";
  document.getElementById("stat-mesa").textContent = mesa;
  document.getElementById("btn-agregar-header").href = urlMenuMesa(numeroMesa);
  contenedor.innerHTML = `<div class="rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando pedido desde la BD...</div>`;

  try {
    pedidosActuales = await cargarPedidosMesa();
  } catch (error) {
    contenedor.innerHTML = `<div class="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar el pedido</h2><p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p></div>`;
    return;
  }

  if (!pedidosActuales.length) {
    contenedor.innerHTML = `<div class="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 class="text-2xl font-black text-slate-800">No hay pedidos activos</h2><p class="mx-auto mt-2 max-w-xl text-slate-500">Cuando confirmes un pedido, aqui veras el estado de cocina, entrega y el total acumulado.</p></div>`;
  } else {
    contenedor.innerHTML = pedidosActuales.map(pedidoHtml).join("");
  }

  const totalPendiente = pedidosActuales.reduce((s, pedido) => s + totalPendientePedido(pedido), 0);
  document.getElementById("stat-pedidos").textContent = pedidosActuales.length;
  document.getElementById("stat-pendiente").textContent = soles(totalPendiente);

  if (!pedidosActuales.length) {
    document.getElementById("stat-cuenta").textContent = "Sin cuenta";
  } else if (puedeSolicitarCuenta()) {
    document.getElementById("stat-cuenta").textContent = "Lista para cobrar";
  } else {
    document.getElementById("stat-cuenta").textContent = "En consumo";
  }

  actualizarBotonSolicitarCuenta();
}

function abrirModalComentario() {
  const modal = document.getElementById("modal-comentario-mesero");
  if (!modal) return;
  const motivo = document.getElementById("motivo-comentario-mesero");
  const detalle = document.getElementById("detalle-comentario-mesero");
  if (motivo) motivo.value = "";
  if (detalle) detalle.value = "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function cerrarModalComentario() {
  const modal = document.getElementById("modal-comentario-mesero");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

async function enviarComentarioMesero(event) {
  event.preventDefault();
  const mesa = obtenerMesaActual();
  const numero = String(mesa || "").match(/\d+/)?.[0];
  const motivo = document.getElementById("motivo-comentario-mesero")?.value || "";
  const detalle = document.getElementById("detalle-comentario-mesero")?.value || "";
  const boton = document.getElementById("btn-enviar-comentario-mesero");

  if (!numero) return window.menugoNotificar?.("No se pudo identificar la mesa. Escanea nuevamente el QR.", "error");
  if (!motivo) return window.menugoNotificar?.("Selecciona el motivo del informe.", "error");

  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Enviando...";
    }

    await apiJson(`/pedidos/mesa/${encodeURIComponent(numero)}/comentario`, {
      method: "POST",
      body: JSON.stringify({
        motivo,
        detalle,
        qr_token: obtenerTokenMesaActual(),
      }),
    });

    cerrarModalComentario();
    document.getElementById("aviso-comentario")?.classList.remove("hidden");
    window.menugoNotificar?.("Informe enviado al mesero.", "success");
  } catch (error) {
    window.menugoNotificar?.(`No se pudo enviar el informe: ${error.message}`, "error");
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Enviar informe";
    }
  }
}

async function solicitarCuenta() {
  if (!pedidosActuales.length) {
    window.menugoNotificar?.("No hay pedidos activos para solicitar cuenta.", "error");
    return;
  }

  const noEntregados = pedidosNoEntregados();
  if (noEntregados.length > 0) {
    window.menugoNotificar?.("Aún no puedes solicitar cuenta. Primero el mesero debe entregar todos los pedidos de la mesa.", "error");
    return;
  }

  const numero = String(mesaActualCliente || "").match(/\d+/)?.[0];
  if (!numero) {
    window.menugoNotificar?.("No se pudo identificar la mesa. Escanea nuevamente el QR.", "error");
    return;
  }

  try {
    await apiJson(`/pedidos/mesa/${encodeURIComponent(numero)}/solicitar-cuenta`, {
      method: "POST",
      body: JSON.stringify({ nota: "Cliente solicita cuenta desde seguimiento", qr_token: obtenerTokenMesaActual() }),
    });
    document.getElementById("aviso-solicitud")?.classList.remove("hidden");
    window.menugoNotificar?.("Solicitud de cuenta enviada al mesero.", "success");
  } catch (error) {
    window.menugoNotificar?.(`No se pudo solicitar cuenta: ${error.message}`, "error");
  }
}

function iniciarEscuchaEventosPedidoActual() {
  if (typeof realTime !== "undefined" && realTime) {
    realTime.connect();
    const handlePedidoActualizado = () => renderPedidoActual();
    realTime.on("pedido:creado", handlePedidoActualizado);
    realTime.on("pedido:actualizado", handlePedidoActualizado);
    realTime.on("pago:registrado", handlePedidoActualizado);
    realTime.on("cuenta:actualizada", handlePedidoActualizado);
  }
}

function recargarPedidoActual() {
  return renderPedidoActual();
}

document.addEventListener("DOMContentLoaded", () => {
  renderPedidoActual();
  iniciarEscuchaEventosPedidoActual();
});

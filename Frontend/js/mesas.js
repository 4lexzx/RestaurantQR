if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
var API_BASE = window.MENUGO_API || "http://localhost:4000/api";
let filtroMesas = "todas";
let busquedaMesa = "";
let mesasBase = [];
let accesosQrMesas = new Map();
let pedidosLlevarListos = [];
let firmaRenderMesas = "";

function soles(valor) { return Number(valor || 0).toFixed(2); }
function escapeHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarMesas() {
  const [data, qrData] = await Promise.all([
    apiJson("/mesas"),
    apiJson("/mesas/qr-urls"),
  ]);
  mesasBase = data.data || [];
  accesosQrMesas = new Map((qrData.data || []).map((item) => [String(item.numero_mesa), item.url_qr]));
}

async function cargarPedidosLlevarListos() {
  const data = await apiJson("/pedidos?rol=mesero&tipo=llevar&estado=listo");
  pedidosLlevarListos = data.data || [];
}

async function recargarMesas() {
  const contenedor = document.getElementById("contenedor-mesas");
  if (contenedor && mesasBase.length === 0) contenedor.innerHTML = `<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando mesas desde la BD...</div>`;
  try {
    await cargarMesas();
    await cargarPedidosLlevarListos();
    const firmaNueva = JSON.stringify([mesasBase, pedidosLlevarListos]);
    if (firmaNueva === firmaRenderMesas) return;
    firmaRenderMesas = firmaNueva;
    renderEstadisticasMesas();
    renderAlertasComentariosMesa();
    renderPedidosLlevarListos();
    renderMesas();
  } catch (error) {
    if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar mesas</h2><p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p></div>`;
  }
}

function renderEstadisticasMesas() {
  const contar = (estado) => mesasBase.filter((m) => m.estado === estado).length;
  document.getElementById("stat-libres").textContent = contar("libre");
  document.getElementById("stat-ocupadas").textContent = contar("ocupada");
  document.getElementById("stat-pagadas").textContent = contar("pagada");
  document.getElementById("stat-unidas").textContent = contar("unida");
}

function cambiarFiltroMesas(filtro) {
  filtroMesas = filtro;
  document.querySelectorAll(".mg-filter-btn").forEach((btn) => {
    const activo = btn.dataset.filtro === filtro;
    if (activo) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  renderMesas();
}

function normalizarBusquedaMesa(valor) {
  return String(valor || "").trim().toLowerCase().replace(/^mesa\s*/i, "");
}

function configurarBusquedaMesas() {
  const input = document.getElementById("buscar-mesa");
  const limpiar = document.getElementById("limpiar-busqueda-mesa");
  if (!input || input.dataset.bound === "1") return;
  input.dataset.bound = "1";
  const actualizar = () => {
    const soloNumeros = input.value.replace(/\D/g, "").slice(0, 3);
    if (input.value !== soloNumeros) input.value = soloNumeros;
    busquedaMesa = normalizarBusquedaMesa(input.value);
    limpiar.hidden = !busquedaMesa;
    renderMesas();
  };
  input.addEventListener("beforeinput", (event) => {
    if (event.data && /\D/.test(event.data)) event.preventDefault();
  });
  input.addEventListener("input", actualizar);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value) {
      input.value = "";
      actualizar();
    }
  });
  limpiar?.addEventListener("click", () => {
    input.value = "";
    actualizar();
    input.focus();
  });
}

function claseEstado(estado) {
  if (estado === "libre") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (estado === "ocupada") return "bg-orange-100 text-orange-700 ring-orange-200";
  if (estado === "pagada") return "bg-blue-100 text-blue-700 ring-blue-200";
  if (estado === "unida") return "bg-slate-200 text-slate-800 ring-slate-300";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function textoEstado(estado) {
  return ({ libre: "Libre", ocupada: "Ocupada", pagada: "Pagada", unida: "Unida" })[estado] || "Libre";
}

function alertaDeMesa(mesa) {
  return mesa.alertaCliente || mesa.comentario_cliente || null;
}

function solicitudCuentaDeMesa(mesa) {
  return mesa.solicitudCuenta || mesa.solicitud_cuenta || null;
}

function notificacionesDeMesa(mesa) {
  const notificaciones = [];
  const alerta = alertaDeMesa(mesa);
  const solicitudCuenta = solicitudCuentaDeMesa(mesa);

  if (alerta) {
    notificaciones.push({
      tipo: "comentario",
      mesa,
      id: alerta.id_comentario_mesa,
      etiqueta: "Aviso del cliente",
      titulo: alerta.motivo || "Informe del cliente",
      detalle: alerta.detalle || "Sin detalle adicional",
      color: "orange",
    });
  }

  if (solicitudCuenta) {
    notificaciones.push({
      tipo: "cuenta",
      mesa,
      id: solicitudCuenta.id_solicitud,
      etiqueta: "Solicitud de cuenta",
      titulo: "Cliente solicita cuenta",
      detalle: solicitudCuenta.nota || "El cliente solicita que el mesero se acerque para cobrar la cuenta.",
      color: "blue",
    });
  }

  return notificaciones;
}

function botonAtenderNotificacion(notificacion, modo = "oscuro") {
  const clase = modo === "claro"
    ? "rounded-xl bg-white px-3 py-2 text-xs font-black text-orange-700 ring-1 ring-orange-200"
    : "rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white";
  const accion = notificacion.tipo === "cuenta"
    ? `atenderSolicitudCuenta('${escapeHtml(String(notificacion.id))}')`
    : `atenderComentarioMesa('${escapeHtml(String(notificacion.id))}')`;
  return `<button type="button" onclick="${accion}" class="${clase}">Atendida</button>`;
}

function renderAlertasComentariosMesa() {
  const panel = document.getElementById("alertas-comentarios-mesa");
  if (!panel) return;

  const alertas = mesasBase.flatMap((mesa) => notificacionesDeMesa(mesa));

  if (!alertas.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-black uppercase tracking-wide text-orange-700">Notificaciones de clientes</p>
        <h2 class="text-xl font-black text-slate-950">${alertas.length} aviso(s) requieren atencion</h2>
      </div>
      <span class="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">Pendiente de revision</span>
    </div>
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      ${alertas.map((alerta) => `
        <article class="rounded-2xl border ${alerta.tipo === "cuenta" ? "border-blue-200" : "border-orange-200"} bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-slate-500">Mesa ${escapeHtml(alerta.mesa.numero_mesa || alerta.mesa.numero)}</p>
              <p class="text-xs font-black uppercase tracking-wide ${alerta.tipo === "cuenta" ? "text-blue-700" : "text-orange-700"}">${escapeHtml(alerta.etiqueta)}</p>
              <h3 class="mt-1 text-lg font-black ${alerta.tipo === "cuenta" ? "text-blue-700" : "text-orange-700"}">${escapeHtml(alerta.titulo)}</h3>
            </div>
            ${botonAtenderNotificacion(alerta)}
          </div>
          <p class="mt-2 text-sm font-semibold text-slate-600">${escapeHtml(alerta.detalle)}</p>
        </article>`).join("")}
    </div>`;
}

function renderPedidosLlevarListos() {
  const panel = document.getElementById("pedidos-llevar-listos");
  if (!panel) return;

  if (!pedidosLlevarListos.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-black uppercase tracking-wide text-emerald-700">Pedidos para llevar</p>
        <h2 class="text-xl font-black text-slate-950">${pedidosLlevarListos.length} pedido(s) listo(s) para recoger</h2>
      </div>
      <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Atender en caja / entrega</span>
    </div>
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      ${pedidosLlevarListos.map((pedido) => {
        const codigo = pedido.codigo_seguimiento || pedido.codigo_llevar || pedido.codigo || `LLEV-${String(pedido.id_pedido || pedido.id || "").padStart(3, "0")}`;
        return `
          <article class="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-emerald-700">Listo para recoger</p>
                <h3 class="mt-1 text-2xl font-black text-slate-950">${escapeHtml(codigo)}</h3>
                <p class="mt-1 text-sm font-semibold text-slate-600">${escapeHtml(pedido.cliente || pedido.nombre_cliente || "Cliente")}</p>
                <p class="text-sm font-semibold text-slate-500">Cel: ${escapeHtml(pedido.telefono_llevar || pedido.telefono || "No registrado")}</p>
              </div>
              <button type="button" onclick="entregarPedidoLlevar('${escapeHtml(String(pedido.id_pedido || pedido.id))}')" class="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Entregado</button>
            </div>
            <div class="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm">
              <p><strong>Total:</strong> S/ ${soles(pedido.total)}</p>
              <p><strong>Pago:</strong> ${escapeHtml(pedido.estadoPago || "Pendiente")}</p>
              <p><strong>Estado:</strong> ${escapeHtml(pedido.estadoPedido || pedido.estado || "Listo para recoger")}</p>
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

async function entregarPedidoLlevar(idPedido) {
  if (!idPedido) return;
  try {
    await apiJson(`/pedidos/${encodeURIComponent(idPedido)}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "entregado", rol: "mesero" }),
    });
    await recargarMesas();
  } catch (error) {
    alert(`No se pudo marcar el pedido como entregado: ${error.message}`);
  }
}

function renderMesas() {
  const contenedor = document.getElementById("contenedor-mesas");
  if (!contenedor) return;
  const mesasPorEstado = filtroMesas === "todas" ? mesasBase : mesasBase.filter((m) => m.estado === filtroMesas);
  const mesas = busquedaMesa
    ? mesasPorEstado.filter((mesa) => {
        const numero = String(mesa.numero_mesa ?? mesa.numero ?? "").toLowerCase();
        const etiqueta = `mesa ${numero}`;
        return numero.includes(busquedaMesa) || etiqueta.includes(busquedaMesa);
      })
    : mesasPorEstado;
  const resultado = document.getElementById("resultado-busqueda-mesas");
  if (resultado) {
    resultado.textContent = busquedaMesa
      ? `${mesas.length} ${mesas.length === 1 ? "mesa encontrada" : "mesas encontradas"}`
      : `${mesasPorEstado.length} ${mesasPorEstado.length === 1 ? "mesa visible" : "mesas visibles"}`;
  }
  if (!mesas.length) {
    const detalle = busquedaMesa ? `No encontramos la mesa ${escapeHtml(busquedaMesa)} con el filtro seleccionado.` : "No hay mesas en este estado.";
    contenedor.innerHTML = `<div class="waiter-table-empty"><i class="bi bi-search"></i><h2>Sin resultados</h2><p>${detalle}</p>${busquedaMesa ? '<button type="button" onclick="limpiarBusquedaMesa()">Ver todas las mesas</button>' : ''}</div>`;
    return;
  }
  contenedor.innerHTML = mesas.map((mesa) => {
    const numero = mesa.numero_mesa || mesa.numero;
    const notificaciones = notificacionesDeMesa(mesa);
    const alertaHtml = notificaciones.length ? notificaciones.map((alerta) => `
      <div class="mt-4 rounded-2xl border ${alerta.tipo === "cuenta" ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"} p-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-xs font-black uppercase tracking-wide ${alerta.tipo === "cuenta" ? "text-blue-700" : "text-orange-700"}">${escapeHtml(alerta.etiqueta)}</p>
            <p class="mt-1 text-sm font-black ${alerta.tipo === "cuenta" ? "text-blue-800" : "text-orange-800"}">${escapeHtml(alerta.titulo)}</p>
          </div>
          ${botonAtenderNotificacion(alerta, "claro")}
        </div>
        <p class="mt-2 text-xs font-semibold ${alerta.tipo === "cuenta" ? "text-blue-800" : "text-orange-800"}">${escapeHtml(alerta.detalle)}</p>
      </div>`).join("") : "";

    const colorEstado = ({ libre: "#16a34a", ocupada: "#f59e0b", pagada: "#2563eb", unida: "#64748b" })[mesa.estado] || "#64748b";
    const tieneCuentaPendiente = Number(mesa.pendiente || 0) > 0;
    return `<article class="waiter-table-card" style="--state:${colorEstado}">
      <div class="waiter-table-top"><div class="waiter-table-number"><span>Mesa</span><strong>${numero}</strong></div><span class="waiter-status">${textoEstado(mesa.estado)}</span></div>
      <p class="waiter-table-note">${escapeHtml(mesa.nota || mesa.grupo?.nombre || "Sin agrupación")}</p>
      ${alertaHtml}
      <div class="waiter-account-state ${tieneCuentaPendiente ? 'pending' : 'clear'}"><i class="bi ${tieneCuentaPendiente ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill'}"></i><span>${tieneCuentaPendiente ? 'Cuenta por pagar' : 'Sin cuenta pendiente'}</span></div>
      <div class="waiter-money"><div><span>Pendiente</span><strong>S/ ${soles(mesa.pendiente)}</strong></div><div><span>Pagado</span><strong>S/ ${soles(mesa.pagado)}</strong></div></div>
      <div class="waiter-table-actions ${tieneCuentaPendiente ? 'has-account' : ''}">${tieneCuentaPendiente ? `<a href="pedidos.html?mesa=${encodeURIComponent(numero)}&vista=local" class="waiter-account-action"><i class="bi bi-receipt-cutoff"></i> Ver cuenta · S/ ${soles(mesa.pendiente)}</a>` : `<a href="tomar_pedido.html?mesa=${encodeURIComponent(numero)}"><i class="bi bi-plus-circle"></i> Tomar pedido</a>`}<a href="${escapeHtml(accesosQrMesas.get(String(numero)) || '#')}" title="Abrir acceso QR autorizado de Mesa ${escapeHtml(numero)}"><i class="bi bi-qr-code"></i></a></div>
    </article>`;
  }).join("");
}

function limpiarBusquedaMesa() {
  const input = document.getElementById("buscar-mesa");
  if (input) input.value = "";
  busquedaMesa = "";
  const limpiar = document.getElementById("limpiar-busqueda-mesa");
  if (limpiar) limpiar.hidden = true;
  renderMesas();
  input?.focus();
}

async function atenderComentarioMesa(idComentario) {
  if (!idComentario) return;
  try {
    await apiJson(`/mesas/comentarios/${encodeURIComponent(idComentario)}/atender`, { method: "PATCH", body: JSON.stringify({}) });
    await recargarMesas();
  } catch (error) {
    alert(`No se pudo marcar como atendida: ${error.message}`);
  }
}

async function atenderSolicitudCuenta(idSolicitud) {
  if (!idSolicitud) return;
  try {
    await apiJson(`/mesas/solicitudes-cuenta/${encodeURIComponent(idSolicitud)}/atender`, { method: "PATCH", body: JSON.stringify({}) });
    await recargarMesas();
  } catch (error) {
    alert(`No se pudo marcar la solicitud de cuenta como atendida: ${error.message}`);
  }
}

async function restaurarMesasDemo() {
  alert("Ahora las mesas vienen de la base de datos. Para liberar una mesa registra el pago completo de su cuenta.");
}

function iniciarEscuchaEventosMesas() {
  if (typeof realTime === 'undefined' || !realTime) return;
  realTime.connect();

  const handleMesaActualizada = () => {
    firmaRenderMesas = "";
    recargarMesas();
  };

  realTime.on('mesa:actualizada', handleMesaActualizada);
  realTime.on('pedido:creado', handleMesaActualizada);
  realTime.on('pedido:actualizado', handleMesaActualizada);
  realTime.on('pago:registrado', handleMesaActualizada);
  realTime.on('cuenta:actualizada', handleMesaActualizada);
  realTime.on('comentario:mesa', handleMesaActualizada);
}

document.addEventListener("DOMContentLoaded", () => {
  configurarBusquedaMesas();
  recargarMesas();
  iniciarEscuchaEventosMesas();
  setInterval(() => {
    if (!document.hidden) recargarMesas();
  }, 15000);
});

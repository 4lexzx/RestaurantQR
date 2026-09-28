if (window.MENUGO_PERSONAL_BLOQUEADO) { throw new Error('Acceso bloqueado. Inicia sesion.'); }
var API_BASE = window.MENUGO_API || "http://localhost:4000/api";
const mesaCuentaSolicitada = new URLSearchParams(window.location.search).get("mesa");
const vistaSolicitada = new URLSearchParams(window.location.search).get("vista");
let vistaMesero = mesaCuentaSolicitada ? "local" : (["local", "cuentas-historial", "listos", "llevar", "cerradas"].includes(vistaSolicitada) ? vistaSolicitada : "listos");
let pedidosListos = [];
let pedidosMesero = [];
let cuentasActivas = [];
let mesasBackend = [];
let pagosCuenta = [];

function soles(valor) { return Number(valor || 0).toFixed(2); }
function normalizar(valor) { return String(valor || "").trim().toLowerCase(); }
function escapeHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function apiJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarDatosMesero() {
  const [listos, pedidos, cuentas, mesas, pagos] = await Promise.all([
    apiJson("/mesero/pedidos/listos"),
    apiJson("/mesero/pedidos?estado=listo,entregado,pagado"),
    apiJson("/cuentas/activas"),
    apiJson("/mesas"),
    apiJson("/cuentas/pagos"),
  ]);
  pedidosListos = listos.data || [];
  pedidosMesero = pedidos.data || [];
  cuentasActivas = (cuentas.data || []).filter((cuenta) => Number(cuenta.total_pendiente || 0) > 0);
  mesasBackend = mesas.data || [];
  pagosCuenta = pagos.data || [];
}

async function recargarMesero() {
  const contenedor = document.getElementById("contenedor-mesero");
  if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Cargando datos del mesero desde la BD...</div>`;
  try {
    await cargarDatosMesero();
    renderEstadisticas();
    cambiarVistaMesero(vistaMesero);
  } catch (error) {
    if (contenedor) contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><h2 class="text-2xl font-black">No se pudo cargar el panel</h2><p class="mt-2 text-sm font-semibold">${escapeHtml(error.message)}</p></div>`;
  }
}

function renderEstadisticas() {
  const pendientesPago = cuentasActivas.filter((c) => Number(c.total_pendiente || 0) > 0).length;
  const porCobrar = cuentasActivas.reduce((s, c) => s + Number(c.total_pendiente || 0), 0);
  const listosLlevar = pedidosListos.filter((p) => pedidoEsLlevar(p)).length;
  const listosMesa = pedidosListos.filter((p) => !pedidoEsLlevar(p)).length;
  document.getElementById("stat-cuentas").textContent = cuentasActivas.length;
  document.getElementById("stat-pendientes").textContent = pendientesPago;
  document.getElementById("stat-listos").textContent = listosMesa;
  document.getElementById("stat-llevar").textContent = listosLlevar;
  document.getElementById("stat-total").textContent = soles(porCobrar);
}

function cambiarVistaMesero(vista) {
  vistaMesero = vista;
  const url = new URL(window.location.href);
  url.searchParams.set("vista", vista);
  if (vista !== "local") url.searchParams.delete("mesa");
  window.history.replaceState({}, "", url);
  document.querySelectorAll(".vista-mesero").forEach((btn) => {
    const activo = btn.dataset.vista === vista;
    btn.className = "mg-filter-btn vista-mesero";
    btn.classList.toggle("active", activo);
  });
  configurarContextoVistaMesero();
  renderVistaMesero();
}

function configurarContextoVistaMesero() {
  const esCuentas = ["local", "cuentas-historial"].includes(vistaMesero);
  const seccion = esCuentas ? "cuentas" : "entregas";
  document.querySelectorAll("[data-stat-context]").forEach((card) => {
    const ocultar = card.dataset.statContext !== seccion;
    card.hidden = ocultar;
    card.classList.toggle("hidden", ocultar);
  });
  document.querySelectorAll(".vista-mesero[data-section]").forEach((btn) => {
    const ocultar = btn.dataset.section !== seccion;
    btn.hidden = ocultar;
    btn.classList.toggle("hidden", ocultar);
  });
  const titulo = document.getElementById("mesero-page-title");
  const descripcion = document.getElementById("mesero-page-desc");
  const eyebrow = document.getElementById("mesero-page-eyebrow");
  if (titulo) titulo.textContent = esCuentas ? "Cuentas" : "Entregas";
  if (descripcion) descripcion.textContent = esCuentas
    ? "Consulta cuentas pendientes, registra pagos y revisa el historial de cobros."
    : "Visualiza pedidos listos para llevar a mesa o entregar al cliente, sin mezclar información de cobros.";
  if (eyebrow) eyebrow.innerHTML = esCuentas
    ? '<i class="bi bi-receipt-cutoff"></i> Control de cobros'
    : '<i class="bi bi-bell"></i> Salida de pedidos';
}

function renderVistaMesero() {
  if (vistaMesero === "local") return renderCuentasLocales();
  if (vistaMesero === "cuentas-historial") return renderHistorialCuentas();
  if (vistaMesero === "llevar") return renderPedidosListos(pedidosListos.filter((p) => normalizar(p.tipo_pedido || p.tipoConsumo).includes("llevar")));
  if (vistaMesero === "cerradas") return renderHistorialMesero();
  return renderPedidosListos(pedidosListos.filter((p) => !pedidoEsLlevar(p)));
}

function pedidoEsLlevar(pedido) { return normalizar(pedido.tipo_pedido || pedido.tipoConsumo).includes("llevar"); }

function renderPedidosListos(lista) {
  const contenedor = document.getElementById("contenedor-mesero");
  if (!contenedor) return;
  if (!lista.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 class="text-2xl font-black text-slate-800">No hay pedidos listos</h2><p class="mt-2 text-slate-500">El mesero solo ve pedidos cuando cocina los marca como listos.</p></div>`;
    return;
  }

  contenedor.innerHTML = lista.map((pedido) => `
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-black uppercase tracking-wide text-emerald-600">Listo para ${pedidoEsLlevar(pedido) ? "recoger" : "llevar a mesa"}</p>
          <h2 class="text-2xl font-black text-slate-950">${escapeHtml(pedido.codigo || `PED-${pedido.id_pedido}`)}</h2>
          <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(pedido.cliente || pedido.nombre_cliente || "Cliente")}</p>
        </div>
        <span class="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-700">${escapeHtml(pedido.estadoPedido || "Listo")}</span>
      </div>
      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Mesa</p><p class="mt-1 text-xl font-black">${escapeHtml(pedido.mesa || "No aplica")}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Tipo</p><p class="mt-1 text-xl font-black">${escapeHtml(pedido.tipoConsumo || pedido.tipo_pedido)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Total</p><p class="mt-1 text-xl font-black">S/ ${soles(pedido.total)}</p></div>
      </div>
      <ul class="mb-4 space-y-2">
        ${(pedido.productos || []).map((item) => `<li class="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div class="flex items-start justify-between gap-3"><div><p class="text-sm font-black text-slate-950">${escapeHtml(item.nombre)} x${Number(item.cantidad || 1)}</p><p class="mt-1 text-xs font-semibold text-slate-500">${escapeHtml(item.observacion || item.opcion || "Sin observaciones")}</p></div><p class="text-sm font-black">S/ ${soles(item.subtotal || Number(item.precio || 0) * Number(item.cantidad || 1))}</p></div></li>`).join("")}
      </ul>
      <button type="button" onclick="marcarEntregado('${escapeHtml(String(pedido.id_pedido || pedido.id))}')" class="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">${pedidoEsLlevar(pedido) ? "Marcar recogido" : "Marcar entregado a mesa"}</button>
    </article>`).join("");
}

function renderCuentasLocales() {
  const contenedor = document.getElementById("contenedor-mesero");
  if (!contenedor) return;
  const cuentasPendientes = cuentasActivas.filter((cuenta) => Number(cuenta.total_pendiente || 0) > 0 && (!mesaCuentaSolicitada || (cuenta.mesas || []).map(String).includes(String(mesaCuentaSolicitada))));
  if (!cuentasPendientes.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 class="text-2xl font-black text-slate-800">No hay cuentas pendientes de pago</h2><p class="mt-2 text-slate-500">Los pedidos ya pagados no aparecen aqui; solo se mostraran en listos para mesa o recoger cuando cocina los marque como listos.</p></div>`;
    return;
  }
  contenedor.innerHTML = cuentasPendientes.map((cuenta) => {
    const detalles = (cuenta.detalles || []).filter((item) => !item.pagado && Number(item.subtotal) - Number(item.monto_pagado || 0) > 0);
    const tieneNoEntregados = detalles.some((item) => String(item.estado_pedido || '').trim().toLowerCase() !== 'entregado');
    const puedePagar = detalles.some((item) => item.puede_pagarse === true || String(item.estado_pedido || '').trim().toLowerCase() === 'entregado');
    
    return `
    <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div><p class="text-sm font-black uppercase tracking-wide text-slate-500">Cuenta activa</p><h2 class="text-2xl font-black text-slate-950">${escapeHtml(cuenta.etiqueta)}</h2><p class="mt-1 text-sm font-semibold text-slate-500">Mesas: ${(cuenta.mesas || []).map((m) => `Mesa ${m}`).join(", ")}</p></div>
        <span class="rounded-full bg-orange-100 px-3 py-1.5 text-sm font-black text-orange-700">Pendiente S/ ${soles(cuenta.total_pendiente)}</span>
      </div>
      <div class="mb-4 grid grid-cols-3 gap-3">
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Total</p><p class="mt-1 text-xl font-black">S/ ${soles(cuenta.total)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Pagado</p><p class="mt-1 text-xl font-black text-emerald-600">S/ ${soles(cuenta.total_pagado)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Debe</p><p class="mt-1 text-xl font-black text-orange-600">S/ ${soles(cuenta.total_pendiente)}</p></div>
      </div>
      <div class="mt-4 flex gap-3">
        <button onclick="abrirGestionCuenta('${escapeHtml(String(cuenta.id_cuenta))}')" 
          class="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800">
          <i class="bi bi-receipt-cutoff"></i> ${puedePagar ? 'Ver cuenta y registrar pago' : 'Ver detalle de la cuenta'}
        </button>
        <span class="rounded-2xl bg-orange-100 px-4 py-3 text-sm font-black text-orange-700">
           Debe S/ ${soles(cuenta.total_pendiente)}
        </span>
      </div>
      ${tieneNoEntregados ? `<div class="mt-2 rounded-2xl bg-orange-50 p-3 text-sm font-bold text-orange-800">Los productos aún no entregados permanecerán bloqueados. Puedes cobrar por separado los que ya fueron entregados.</div>` : ''}
    </article>`;
  }).join("");
}

function renderHistorialMesero() {
  const entregados = pedidosMesero.filter((p) => ["entregado", "pagado"].includes(p.estado_db));
  const contenedor = document.getElementById("contenedor-mesero");
  if (!contenedor) return;
  if (!entregados.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 class="text-2xl font-black text-slate-800">Sin historial cerrado</h2></div>`;
    return;
  }
  contenedor.innerHTML = entregados.map((p) => `<article class="rounded-3xl border border-slate-200 bg-white p-5"><h2 class="text-xl font-black">${escapeHtml(p.codigo)}</h2><p class="mt-1 text-sm text-slate-500">${escapeHtml(p.mesa)} - ${escapeHtml(p.estadoPedido)}</p><p class="mt-2 font-black">S/ ${soles(p.total)}</p></article>`).join("");
}

async function marcarEntregado(idPedido) {
  try {
    await apiJson(`/mesero/pedidos/${encodeURIComponent(idPedido)}/entregar`, { method: "PATCH", body: JSON.stringify({}) });
    await recargarMesero();
    window.menugoNotificar?.("Pedido marcado como entregado. La cuenta continúa visible hasta registrar el pago.", "success");
  } catch (error) {
    window.menugoNotificar?.(error.message || "No se pudo marcar el pedido como entregado.", "error");
  }
}

function renderHistorialCuentas() {
  const contenedor = document.getElementById("contenedor-mesero");
  if (!contenedor) return;
  if (!pagosCuenta.length) {
    contenedor.innerHTML = `<div class="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><i class="bi bi-receipt text-3xl text-slate-400"></i><h2 class="mt-3 text-2xl font-black text-slate-800">Todavía no hay cobros registrados</h2><p class="mt-2 text-slate-500">Aquí aparecerán las cuentas pagadas de este restaurante.</p></div>`;
    return;
  }
  contenedor.innerHTML = pagosCuenta.map((pago) => {
    const fecha = pago.fecha_pago ? new Date(pago.fecha_pago).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "Sin fecha";
    const documento = pago.ruc || pago.dni || "Consumidor final";
    return `<article class="waiter-payment-history rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide text-emerald-600">Cuenta cobrada</p><h2 class="mt-1 text-xl font-black text-slate-950">Pago #${escapeHtml(pago.id_pago)}</h2><p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(fecha)}</p></div><span class="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-700">S/ ${soles(pago.monto)}</span></div>
      <div class="mt-4 grid grid-cols-2 gap-3"><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Método</p><strong class="mt-1 block text-slate-900">${escapeHtml(pago.metodo_pago || "No indicado")}</strong></div><div class="rounded-2xl bg-slate-50 p-3"><p class="text-xs font-black uppercase text-slate-500">Comprobante</p><strong class="mt-1 block text-slate-900">${escapeHtml(pago.tipo_comprobante || "Boleta")} · ${escapeHtml(documento)}</strong></div></div>
    </article>`;
  }).join("");
}

function abrirGestionCuenta(idCuenta) {
  const cuenta = cuentasActivas.find((c) => String(c.id_cuenta) === String(idCuenta));
  if (!cuenta) return alert("Cuenta no encontrada.");
  
  const panel = document.getElementById("panel-gestion");
  const contenido = document.getElementById("contenido-gestion");
  const detallesPendientes = (cuenta.detalles || []).filter((item) => Number(item.subtotal || 0) - Number(item.monto_pagado || 0) > 0);
  
  const itemPuedePagarse = (item) => item.puede_pagarse === true || String(item.estado_pedido || '').trim().toLowerCase() === 'entregado';
  const noEntregados = detallesPendientes.filter((item) => !itemPuedePagarse(item));
  
  const itemsHtml = detallesPendientes.map((item) => {
    const puedePagarse = itemPuedePagarse(item);
    return `
    <label class="waiter-payment-item ${puedePagarse ? 'is-payable' : 'is-locked'}">
      <input type="checkbox" class="item-pago" data-id="${item.id_detalle_producto}" data-monto="${Number(item.subtotal) - Number(item.monto_pagado || 0)}" ${puedePagarse ? 'checked' : 'disabled'}>
      <span class="waiter-payment-check" aria-hidden="true"><i class="bi bi-check-lg"></i></span>
      <span class="flex-1"><strong>${escapeHtml(item.nombre)}</strong><br><small>${escapeHtml(item.observacion || "")}</small><span class="mt-1 block text-xs font-black ${puedePagarse ? 'text-emerald-600' : 'text-orange-600'}">${puedePagarse ? 'Entregado a la mesa' : 'Aún no entregado'}</span></span>
      <strong>S/ ${soles(Number(item.subtotal) - Number(item.monto_pagado || 0))}</strong>
    </label>`;
  }).join("");
  
  const totalPendiente = Number(cuenta.total_pendiente || 0);
  contenido.innerHTML = `
  <input type="hidden" id="monto-pago" value="${totalPendiente}">
  <div class="waiter-account-modal-head border-b border-slate-200 p-5">
    <div class="flex justify-between gap-3">
      <div>
        <p class="waiter-payment-kicker text-sm font-black uppercase tracking-wide text-slate-500">Gestión de cuenta</p>
        <h2 class="waiter-account-modal-title mt-1 text-3xl font-black text-slate-950">${escapeHtml(cuenta.etiqueta)}</h2>
      </div>
      <button onclick="cerrarGestion()" class="waiter-account-close rounded-2xl border border-slate-300 px-4 py-2 text-sm font-black"><i class="bi bi-x-lg"></i> Cerrar</button>
    </div>
  </div>
  <div class="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_360px]">
    <section class="waiter-account-items rounded-3xl border border-slate-200 p-4">
      <div class="waiter-account-section-title"><span><i class="bi bi-basket2"></i></span><div><h3>Productos pendientes</h3><p>Selecciona qué productos se cobrarán ahora.</p></div></div>
      ${noEntregados.length ? `<div class="mb-3 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm font-bold text-orange-800"><i class="bi bi-hourglass-split"></i> Los platos pendientes permanecen bloqueados; selecciona los que ya fueron entregados para cobrarlos.</div>` : ''}
      ${itemsHtml || "<p>No hay productos pendientes.</p>"}
    </section>
    <form onsubmit="registrarPagoCuenta(event, '${cuenta.id_cuenta}')" class="waiter-payment-form rounded-3xl bg-slate-50 p-4">
      <div class="waiter-payment-total">
        <span><small>Total de la cuenta</small><strong>S/ ${soles(totalPendiente)}</strong></span>
        <span><small>Seleccionado</small><strong>S/ <b id="monto-seleccionado-gestion">0.00</b></strong></span>
      </div>
      <label class="block">
        <span class="waiter-payment-label text-xs font-black uppercase text-slate-500">Método de pago</span>
        <select id="metodo-pago-gestion" class="waiter-payment-control mt-1 w-full rounded-xl border px-3 py-2">
          <option value="Efectivo">Efectivo</option>
          <option value="Yape">Yape</option>
          <option value="Tarjeta">Tarjeta</option>
        </select>
      </label>
      <div id="simulacion-pago-gestion" class="mt-3"></div>
      <label class="mt-3 block">
        <span class="waiter-payment-label text-xs font-black uppercase text-slate-500">Comprobante</span>
        <select id="tipo-comprobante" class="waiter-payment-control mt-1 w-full rounded-xl border px-3 py-2" onchange="actualizarValidacionDocumentoGestion()">
          <option value="boleta">Boleta</option>
          <option value="factura">Factura</option>
        </select>
      </label>
      <label class="mt-3 block">
        <span class="waiter-payment-label text-xs font-black uppercase text-slate-500" id="label-documento-gestion">Documento</span>
        <input id="documento-pago" value="" maxlength="11" inputmode="numeric" autocomplete="off" class="waiter-payment-control mt-1 w-full rounded-xl border px-3 py-2" placeholder="Ingrese documento">
        <p id="error-documento-gestion" class="mt-1 hidden text-xs font-bold text-red-600">El documento debe tener 8 dígitos para boleta o 11 dígitos para factura</p>
      </label>
      <button class="waiter-payment-submit mt-5 w-full rounded-2xl px-4 py-3 text-sm font-black text-white ${detallesPendientes.some(itemPuedePagarse) ? '' : 'is-disabled cursor-not-allowed'}" ${detallesPendientes.some(itemPuedePagarse) ? '' : 'disabled'}>${detallesPendientes.some(itemPuedePagarse) ? 'Guardar pago' : 'Pendiente de entrega'}</button>
    </form>
  </div>`;

  const metodoSelect = document.getElementById("metodo-pago-gestion");
  if (metodoSelect) {
    metodoSelect.addEventListener("change", () => actualizarSimulacionPagoGestion());
    actualizarSimulacionPagoGestion();
  }

  document.querySelectorAll(".item-pago").forEach((input) => {
    input.addEventListener("change", actualizarResumenPagoGestion);
  });
  actualizarResumenPagoGestion();
  
  const docInput = document.getElementById("documento-pago");
  if (docInput) {
    docInput.addEventListener("input", function(e) {
      this.value = this.value.replace(/\D/g, '');
      validarDocumentoGestion();
    });
    docInput.addEventListener("blur", function(e) {
      validarDocumentoGestion();
    });
  }
  
  const tipoSelect = document.getElementById("tipo-comprobante");
  if (tipoSelect) {
    tipoSelect.addEventListener("change", function() {
      validarDocumentoGestion();
      actualizarLabelDocumentoGestion();
    });
  }
  
  actualizarLabelDocumentoGestion();
  validarDocumentoGestion();
  panel.classList.remove("hidden");
}
function actualizarLabelDocumentoGestion() {
  const tipo = document.getElementById("tipo-comprobante")?.value || "boleta";
  const label = document.getElementById("label-documento-gestion");
  if (label) {
    label.textContent = tipo === "factura" ? "RUC (11 dígitos)" : "DNI (8 dígitos)";
  }
  const input = document.getElementById("documento-pago");
  if (input) {
    input.maxLength = tipo === "factura" ? 11 : 8;
    input.placeholder = tipo === "factura" ? "Ingrese RUC" : "Ingrese DNI";
  }
}

function validarDocumentoGestion() {
  const tipo = document.getElementById("tipo-comprobante")?.value || "boleta";
  const input = document.getElementById("documento-pago");
  const error = document.getElementById("error-documento-gestion");
  if (!input || !error) return;
  
  const valor = input.value.replace(/\D/g, '');
  input.value = valor;
  
  const longitudRequerida = tipo === "factura" ? 11 : 8;
  const esValido = valor.length === longitudRequerida || valor.length === 0;
  
  if (!esValido && valor.length > 0) {
    error.classList.remove("hidden");
    input.classList.add("border-red-500", "ring-2", "ring-red-100");
  } else {
    error.classList.add("hidden");
    input.classList.remove("border-red-500", "ring-2", "ring-red-100");
  }
  
  return esValido;
}

function actualizarValidacionDocumentoGestion() {
  actualizarLabelDocumentoGestion();
  validarDocumentoGestion();
}
function cerrarGestion() {
  document.getElementById("panel-gestion")?.classList.add("hidden");
  const contenido = document.getElementById("contenido-gestion");
  if (contenido) contenido.innerHTML = "";
}

function actualizarSimulacionPagoGestion() {
  const metodo = document.getElementById("metodo-pago-gestion")?.value || "Efectivo";
  const box = document.getElementById("simulacion-pago-gestion");
  if (!box) return;

  const totalPendiente = obtenerTotalSeleccionadoGestion();

  if (metodo === "Yape") {
    box.className = "waiter-payment-simulation is-yape mt-3 rounded-2xl border p-3";
    box.innerHTML = `<label class="block"><span class="waiter-payment-label text-xs font-black uppercase">Celular Yape</span><input id="yape-celular" type="text" inputmode="numeric" maxlength="9" placeholder="999 999 999" class="waiter-payment-control mt-1 w-full rounded-xl border px-3 py-2 font-bold"></label><div class="mt-2"><span class="waiter-payment-label text-xs font-black uppercase">Código de aprobación</span><div class="mt-1 grid grid-cols-6 gap-1">${Array.from({ length: 6 }, () => `<input type="text" inputmode="numeric" maxlength="1" class="waiter-payment-control codigo-yape-gestion h-10 w-full rounded-xl border text-center font-black">`).join('')}</div></div>`;
    activarCajasCodigoYapeGestion();
  } else if (metodo === "Tarjeta") {
    box.className = "waiter-payment-simulation is-card mt-3 rounded-2xl border p-3";
    box.innerHTML = `<label class="block"><span class="waiter-payment-label text-xs font-black uppercase">Número de tarjeta</span><input id="tarjeta-numero" type="text" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" class="waiter-payment-control mt-1 w-full rounded-xl border px-3 py-2 font-bold"></label><div class="mt-2 grid grid-cols-2 gap-2"><input id="tarjeta-vencimiento" type="text" inputmode="numeric" maxlength="5" placeholder="MM/AA" class="waiter-payment-control rounded-xl border px-3 py-2 font-bold"><input id="tarjeta-cvv" type="password" inputmode="numeric" maxlength="3" placeholder="CVV" class="waiter-payment-control rounded-xl border px-3 py-2 font-bold"></div>`;
  } else {
    box.className = "waiter-payment-simulation is-cash mt-3 rounded-2xl border p-3";
    box.innerHTML = `<label class="block"><span class="waiter-payment-label text-xs font-black uppercase">Monto recibido</span><input id="monto-recibido-gestion" type="number" inputmode="decimal" step="0.10" min="0" class="waiter-payment-control mt-1 w-full rounded-xl border px-3 py-2 font-bold" placeholder="${soles(totalPendiente)}"></label><p class="waiter-payment-change mt-2 text-sm font-bold">Vuelto: S/ <span id="vuelto-gestion">0.00</span></p>`;
    const montoRecibido = document.getElementById("monto-recibido-gestion");
    if (montoRecibido) {
      montoRecibido.value = totalPendiente;
      montoRecibido.addEventListener("input", actualizarVueltoGestion);
      actualizarVueltoGestion();
    }
  }
}

function obtenerTotalSeleccionadoGestion() {
  return Array.from(document.querySelectorAll(".item-pago:checked"))
    .reduce((suma, input) => suma + Number(input.dataset.monto || 0), 0);
}

function actualizarVueltoGestion() {
  const montoRecibido = document.getElementById("monto-recibido-gestion");
  const vueltoSpan = document.getElementById("vuelto-gestion");
  if (!montoRecibido || !vueltoSpan) return;
  const recibido = Number(String(montoRecibido.value || 0).replace(',', '.')) || 0;
  vueltoSpan.textContent = soles(Math.max(recibido - obtenerTotalSeleccionadoGestion(), 0));
}

function actualizarResumenPagoGestion() {
  const total = obtenerTotalSeleccionadoGestion();
  const salida = document.getElementById("monto-seleccionado-gestion");
  if (salida) salida.textContent = soles(total);
  const montoRecibido = document.getElementById("monto-recibido-gestion");
  if (montoRecibido && (!montoRecibido.value || Number(montoRecibido.value) < total)) {
    montoRecibido.value = total;
  }
  actualizarVueltoGestion();
}

function activarCajasCodigoYapeGestion() {
  const inputs = Array.from(document.querySelectorAll('.codigo-yape-gestion'));
  inputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && inputs[index + 1]) inputs[index + 1].focus();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && inputs[index - 1]) inputs[index - 1].focus();
    });
  });
}

async function registrarPagoCuenta(event, idCuenta) {
  event.preventDefault();
  
  const tipoComprobante = document.getElementById("tipo-comprobante")?.value || "boleta";
  const documento = document.getElementById("documento-pago")?.value || "";
  
  if (tipoComprobante === "boleta" && documento.length !== 8 && documento.length > 0) {
    window.menugoNotificar?.("El DNI debe tener exactamente 8 dígitos.", "error");
    return;
  }
  
  if (tipoComprobante === "factura" && documento.length !== 11 && documento.length > 0) {
    window.menugoNotificar?.("El RUC debe tener exactamente 11 dígitos.", "error");
    return;
  }
  
  const items = Array.from(document.querySelectorAll(".item-pago:checked")).map((input) => ({
    id_detalle_producto: Number(input.dataset.id),
    monto: Number(input.dataset.monto)
  })).filter((item) => item.id_detalle_producto && item.monto > 0);
  if (!items.length) {
    window.menugoNotificar?.("Selecciona al menos un producto entregado para registrar el pago.", "error");
    return;
  }
  
  const metodoPago = document.getElementById("metodo-pago-gestion")?.value || "Efectivo";
  let monto = items.reduce((s, item) => s + Number(item.monto || 0), 0);
  
  if (monto <= 0) {
    window.menugoNotificar?.("Esta cuenta ya no tiene monto pendiente por cobrar.", "error");
    cerrarGestion();
    recargarMesero();
    return;
  }

  if (metodoPago === "Efectivo") {
    const recibido = Number(document.getElementById("monto-recibido-gestion")?.value || 0);
    if (recibido > 0 && recibido < monto) {
      window.menugoNotificar?.("El monto recibido no puede ser menor al total seleccionado.", "error");
      return;
    }
  }
  
  if (metodoPago === "Yape") {
    const celular = (document.getElementById("yape-celular")?.value || "").replace(/\D/g, "");
    const codigos = Array.from(document.querySelectorAll('.codigo-yape-gestion')).map(i => i.value).join('');
    if (celular.length !== 9) {
      window.menugoNotificar?.("Ingresa un celular Yape válido de 9 dígitos.", "error");
      return;
    }
    if (codigos.length !== 6) {
      window.menugoNotificar?.("Ingresa el código de aprobación Yape de 6 dígitos.", "error");
      return;
    }
  }
  
  if (metodoPago === "Tarjeta") {
    const numero = (document.getElementById("tarjeta-numero")?.value || "").replace(/\D/g, "");
    const cvv = (document.getElementById("tarjeta-cvv")?.value || "").replace(/\D/g, "");
    if (numero.length < 13 || cvv.length !== 3) {
      window.menugoNotificar?.("Revisa el número de tarjeta y el CVV.", "error");
      return;
    }
  }
  
  if (!idCuenta) {
    window.menugoNotificar?.("No se encontró la cuenta seleccionada.", "error");
    return;
  }
  
  if (monto <= 0) {
    window.menugoNotificar?.("El monto a pagar debe ser mayor a cero.", "error");
    return;
  }
  
  const payload = {
    id_cuenta: Number(idCuenta),
    metodoPago: metodoPago,
    monto: monto,
    detalles: items,
    tipo_comprobante: tipoComprobante,
    dni: tipoComprobante === "boleta" ? documento : undefined,
    ruc: tipoComprobante === "factura" ? documento : undefined,
    razon_social: tipoComprobante === "factura" ? "Cliente" : undefined,
    pagado_por: "Cliente"
  };
  
  try {
    const response = await fetch(`${API_BASE}/cuentas/pagos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json().catch(() => ({}));
    
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || data.error || "Error al registrar pago");
    }
    
    window.menugoNotificar?.("Pago registrado correctamente.", "success");
    cerrarGestion();
    await recargarMesero();
  } catch (error) {
    console.error("Error en pago:", error);
    window.menugoNotificar?.(error.message || "No se pudo registrar el pago.", "error");
  }
}

function abrirPanelUnirMesas() {
  const panel = document.getElementById("panel-unir-mesas");
  if (!panel) return;
  panel.classList.remove("hidden");
  const principal = document.getElementById("unir-principal");
  const opciones = document.getElementById("unir-opciones");
  const libres = mesasBackend.filter((m) => ["libre", "ocupada"].includes(m.estado));
  principal.innerHTML = libres.map((m) => `<option value="${m.numero_mesa || m.numero}">Mesa ${m.numero_mesa || m.numero} - ${m.estado}</option>`).join("");
  opciones.innerHTML = libres.map((m) => `<label class="rounded-xl bg-white px-3 py-2 text-sm font-bold"><input type="checkbox" class="mesa-unir" value="${m.numero_mesa || m.numero}"> Mesa ${m.numero_mesa || m.numero}</label>`).join("");
}

function cerrarPanelUnirMesas() { document.getElementById("panel-unir-mesas")?.classList.add("hidden"); }

async function confirmarUnionMesas() {
  const principal = Number(document.getElementById("unir-principal")?.value || 0);
  const secundarias = Array.from(document.querySelectorAll(".mesa-unir:checked")).map((i) => Number(i.value)).filter((n) => n && n !== principal);
  if (!principal || secundarias.length === 0) return alert("Selecciona mesa principal y secundarias.");
  try {
    await apiJson("/mesas/unir", { method: "POST", body: JSON.stringify({ mesa_principal: principal, mesas_a_unir: secundarias }) });
    alert("Mesas unidas en la base de datos.");
    cerrarPanelUnirMesas();
    await recargarMesero();
  } catch (error) {
    alert(`No se pudo unir mesas: ${error.message}`);
  }
}

function iniciarEscuchaEventosMesero() {
  realTime.connect();

  const handlePedidoActualizado = () => {
    recargarMesero();
  };

  realTime.on('pedido:creado', handlePedidoActualizado);
  realTime.on('pedido:actualizado', handlePedidoActualizado);
  realTime.on('mesa:actualizada', handlePedidoActualizado);
  realTime.on('cuenta:actualizada', handlePedidoActualizado);
  realTime.on('pago:registrado', handlePedidoActualizado);
}

document.addEventListener('DOMContentLoaded', () => {
  configurarContextoVistaMesero();
  recargarMesero();
  iniciarEscuchaEventosMesero();
});

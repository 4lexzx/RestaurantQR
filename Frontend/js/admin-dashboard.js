let chartVentas = null;
let chartPlatos = null;
let refrescoDashboardAdmin = null;
let filtroFechaInicio = null;
let filtroFechaFin = null;
let ultimoReporteVentas = null;

function solesAdmin(v) { return Number(v || 0).toFixed(2); }

function escapeHtmlAdmin(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function fechaLocalISOAdmin(f = new Date()) {
  const d = f instanceof Date ? f : new Date(f);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function obtenerInicioSemana(f = new Date()) {
  const d = new Date(f); const dia = d.getDay();
  d.setDate(d.getDate() - dia + (dia === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0); return d;
}

function obtenerFinSemana(f = new Date()) {
  const d = obtenerInicioSemana(f);
  d.setDate(d.getDate() + 6); d.setHours(23, 59, 59, 999); return d;
}

function formatearFechaInput(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function obtenerRangoSemanaActual() {
  return { inicio: formatearFechaInput(obtenerInicioSemana()), fin: formatearFechaInput(obtenerFinSemana()) };
}

function obtenerRangoMesActual() {
  const h = new Date();
  return { inicio: formatearFechaInput(new Date(h.getFullYear(), h.getMonth(), 1)), fin: formatearFechaInput(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
}

function getChartColors() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const primary = cs.getPropertyValue("--mg-p500").trim() || cs.getPropertyValue("--mg-primary").trim() || "#0891B2";
  const secondary = cs.getPropertyValue("--mg-secondary").trim() || "#0F172A";

  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function withAlpha(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function lighten(hex, pct) {
    const [r, g, b] = hexToRgb(hex);
    const f = pct / 100;
    return `rgb(${Math.round(r + (255 - r) * f)}, ${Math.round(g + (255 - g) * f)}, ${Math.round(b + (255 - b) * f)})`;
  }

  return {
    primary, secondary, withAlpha, lighten,
    palette: [primary, lighten(primary, 22), lighten(primary, 40), lighten(primary, 55), lighten(primary, 70)],
  };
}

async function apiAdminDashboard(url, options = {}) {
  if (typeof apiJson === "function") return apiJson(url, options);
  const base = window.MENUGO_API || "http://localhost:4000/api";
  const res = await fetch(`${base}${url}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

async function cargarDashboard() {
  try {
    const data = await apiAdminDashboard("/admin/dashboard");
    if (data.ok && data.data) {
      document.getElementById("stat-ventas-hoy").textContent = solesAdmin(data.data.ventas_hoy || 0);
      document.getElementById("stat-pedidos-hoy").textContent = data.data.pedidos_hoy || 0;
      document.getElementById("stat-ticket-promedio").textContent = solesAdmin(data.data.ticket_promedio || 0);
      document.getElementById("stat-plato-lider").textContent = data.data.plato_lider || "Sin datos";
    }
  } catch (e) { console.error("Error cargando dashboard:", e); }
}

async function cargarGrafica() {
  const dias = document.getElementById("rango-grafica-ventas")?.value || 7;
  try {
    const data = await apiAdminDashboard(`/admin/ventas/grafica?dias=${encodeURIComponent(dias)}`);
    if (!data.ok || !data.labels || !data.valores) return;

    const el = document.getElementById("grafica-ventas");
    if (!el) return;

    const valores = data.valores.map((valor) => Number(valor || 0));
    const promedioMovil = valores.map((_, indice) => {
      const ventana = valores.slice(Math.max(0, indice - 2), indice + 1);
      return Number((ventana.reduce((suma, valor) => suma + valor, 0) / ventana.length).toFixed(2));
    });
    const total = valores.reduce((suma, valor) => suma + valor, 0);
    const indiceMejor = valores.length ? valores.indexOf(Math.max(...valores)) : -1;
    const escribir = (id, texto) => { const nodo = document.getElementById(id); if (nodo) nodo.textContent = texto; };
    escribir("chart-total-periodo", `S/ ${solesAdmin(total)}`);
    escribir("chart-promedio-periodo", `S/ ${solesAdmin(valores.length ? total / valores.length : 0)}`);
    escribir("chart-mejor-dia", indiceMejor >= 0 ? `${data.labels[indiceMejor]} · S/ ${solesAdmin(valores[indiceMejor])}` : "—");

    if (chartVentas) {
      chartVentas.updateOptions({
        xaxis: { categories: data.labels },
      }, false, false, false);
      chartVentas.updateSeries([
        { name: "Ventas", type: "area", data: valores },
        { name: "Promedio móvil", type: "line", data: promedioMovil },
      ], false);
      return;
    }

    const c = getChartColors();

    chartVentas = new ApexCharts(el, {
      chart: {
        type: "line",
        height: 330,
        parentHeightOffset: 0,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        toolbar: { show: false },
        sparkline: { enabled: false },
        animations: { enabled: true, easing: "easeinout", speed: 750, animateGradually: { enabled: true, delay: 80 }, dynamicAnimation: { enabled: true, speed: 500 } },
        dropShadow: { enabled: true, top: 5, left: 0, blur: 12, opacity: 0.14, color: c.primary },
      },
      series: [
        { name: "Ventas", type: "area", data: valores },
        { name: "Promedio móvil", type: "line", data: promedioMovil },
      ],
      colors: [c.primary, c.secondary],
      stroke: { curve: "smooth", width: [3.5, 2], lineCap: "round", dashArray: [0, 6] },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.42,
          opacityTo: 0.02,
          stops: [0, 80, 100],
          colorStops: [
            { offset: 0, color: c.primary, opacity: 0.28 },
            { offset: 50, color: c.primary, opacity: 0.08 },
            { offset: 100, color: c.primary, opacity: 0.01 },
          ]
        }
      },
      dataLabels: { enabled: false },
      markers: {
        size: [0, 3],
        hover: { size: 7, sizeOffset: 3 },
        strokeWidth: 2, strokeColors: "#fff", fillColors: c.primary,
      },
      xaxis: {
        categories: data.labels,
        labels: { style: { fontSize: "11px", fontWeight: "600", colors: "#94a3b8" }, offsetY: 4 },
        axisBorder: { show: false },
        axisTicks: { show: false },
        crosshairs: { show: true, stroke: { color: c.primary, width: 1, dashArray: 4 } },
      },
      yaxis: {
        min: 0,
        labels: { style: { fontSize: "11px", fontWeight: "600", colors: "#94a3b8" }, offsetX: 0, formatter: (v) => "S/" + v },
      },
      grid: { borderColor: "#f1f5f9", strokeDashArray: 4, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, padding: { left: 5, right: 5, top: 5, bottom: 0 } },
      legend: { show: true, position: "top", horizontalAlign: "right", fontSize: "11px", fontWeight: 700, labels: { colors: "#64748b" }, markers: { width: 8, height: 8, radius: 10 } },
      tooltip: {
        theme: "dark",
        style: { fontSize: "13px" },
        x: { show: true },
        y: { formatter: (v) => "S/ " + Number(v).toFixed(2) },
        marker: { show: true },
      },
    });

    chartVentas.render();
  } catch (e) { console.error("Error cargando grafica:", e); }
}

async function cargarRankingConFiltros(fechaDesde = null, fechaHasta = null) {
  try {
    let url = "/admin/platos/mas-vendidos";
    const params = new URLSearchParams();
    if (fechaDesde && fechaHasta) { params.append("fecha_desde", fechaDesde); params.append("fecha_hasta", fechaHasta); }
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const data = await apiAdminDashboard(url);
    const ranking = data.data || [];

    const contenedor = document.getElementById("ranking-platos");
    if (contenedor) {
      if (ranking.length === 0) {
        contenedor.innerHTML = `<p class="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay productos pagados en el periodo seleccionado.</p>`;
      } else {
        const c = getChartColors();
        contenedor.innerHTML = ranking.slice(0, 5).map((item, i) => `
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white" style="background: ${c.palette[i % c.palette.length]}">${i + 1}</div>
              <div>
                <p class="text-sm font-black text-slate-900">${escapeHtmlAdmin(item.nombre)}</p>
                <p class="text-xs font-semibold text-slate-500">S/ ${solesAdmin(item.total)}</p>
              </div>
            </div>
            <span class="rounded-full px-3 py-1 text-xs font-black" style="background: ${c.withAlpha(c.palette[i % c.palette.length], 0.12)}; color: ${c.palette[i % c.palette.length]}">${item.cantidad} und.</span>
          </div>
        `).join("");
      }
    }

    const el = document.getElementById("grafica-platos");
    if (!el || typeof ApexCharts === "undefined") return;

    const c = getChartColors();
    const topPlatos = ranking.slice(0, 6);

    if (chartPlatos && topPlatos.length > 0) {
      chartPlatos.updateSeries([{ name: "Unidades", data: topPlatos.map((p) => p.cantidad) }]);
      chartPlatos.updateOptions({
        xaxis: { categories: topPlatos.map((p) => p.nombre.length > 22 ? p.nombre.substring(0, 19) + "..." : p.nombre) },
        colors: c.palette.slice(0, topPlatos.length),
      }, false, false, false);
      return;
    }

    if (topPlatos.length > 0) {
      chartPlatos = new ApexCharts(el, {
        chart: {
          type: "bar",
          height: 285,
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          animations: { enabled: true, easing: "easeinout", speed: 600 },
          dropShadow: { enabled: true, top: 3, left: 0, blur: 8, opacity: 0.12, color: c.primary },
        },
        series: [{ name: "Unidades", data: topPlatos.map((p) => p.cantidad) }],
        colors: c.palette.slice(0, topPlatos.length),
        plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 7, borderRadiusApplication: "end", barHeight: "58%" } },
        xaxis: { categories: topPlatos.map((p) => p.nombre.length > 22 ? p.nombre.substring(0, 19) + "..." : p.nombre), labels: { style: { colors: "#94a3b8", fontSize: "10px", fontWeight: 700 } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { style: { colors: "#334155", fontSize: "11px", fontWeight: 750 } } },
        grid: { borderColor: "#eef2f6", strokeDashArray: 4, padding: { left: 4, right: 10 } },
        stroke: { width: 0 },
        dataLabels: {
          enabled: true,
          formatter: (val) => val + " und.",
          textAnchor: "start",
          offsetX: 8,
          style: { fontSize: "10px", fontWeight: "800", colors: ["#ffffff"] },
          dropShadow: { enabled: false },
        },
        legend: { show: false },
        tooltip: {
          theme: "dark",
          style: { fontSize: "13px" },
          y: { formatter: (v) => v + " unidades" },
        },
      });

      chartPlatos.render();
    }
  } catch (e) { console.error("Error cargando ranking con filtros:", e); }
}

async function cargarRankingPorSemana() { const s = obtenerRangoSemanaActual(); await cargarRankingConFiltros(s.inicio, s.fin); }
async function cargarRankingPorMes() { const m = obtenerRangoMesActual(); await cargarRankingConFiltros(m.inicio, m.fin); }

async function cargarRankingPorFecha() {
  const fd = document.getElementById("fecha-desde-ranking")?.value;
  const fh = document.getElementById("fecha-hasta-ranking")?.value;
  if (!fd || !fh) { alert("Selecciona ambas fechas"); return; }
  if (fd > fh) { alert("La fecha de inicio no puede ser mayor que la fecha de fin"); return; }
  await cargarRankingConFiltros(fd, fh);
}

function aplicarFiltroRanking(tipo) {
  switch (tipo) {
    case "semana": { const s = obtenerRangoSemanaActual(); filtroFechaInicio = s.inicio; filtroFechaFin = s.fin; break; }
    case "mes": { const m = obtenerRangoMesActual(); filtroFechaInicio = m.inicio; filtroFechaFin = m.fin; break; }
    case "personalizado": filtroFechaInicio = null; filtroFechaFin = null; break;
    default: { const s = obtenerRangoSemanaActual(); filtroFechaInicio = s.inicio; filtroFechaFin = s.fin; }
  }
  document.querySelectorAll(".mg-filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.tipo === tipo));
  const fc = document.getElementById("filtro-fecha-personalizado");
  if (fc) fc.style.display = tipo === "personalizado" ? "block" : "none";
  if (tipo === "semana" || tipo === "mes") cargarRanking();
}

async function cargarRanking() {
  if (filtroFechaInicio && filtroFechaFin) await cargarRankingConFiltros(filtroFechaInicio, filtroFechaFin);
  else { const s = obtenerRangoSemanaActual(); await cargarRankingConFiltros(s.inicio, s.fin); }
}

function pintarReporteVentas(data) {
  ultimoReporteVentas = data;
  const exportar = document.getElementById("btn-exportar-ventas");
  if (exportar) exportar.disabled = false;
  const origen = document.getElementById("origen-reporte");
  const resultado = document.getElementById("resultado-reporte");
  if (!resultado) return;
  if (origen) origen.textContent = `Reporte consultado para ${data.fecha || document.getElementById("fecha-reporte")?.value || "la fecha seleccionada"}.`;
  const c = getChartColors();
  const detalles = Array.isArray(data.detalles) ? data.detalles : [];
  const filas = detalles.length > 0
    ? detalles.map((item) => `
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2">
        <span class="text-sm font-semibold">${escapeHtmlAdmin(item.nombre)}</span>
        <span class="whitespace-nowrap font-black text-slate-900">${Number(item.cantidad || 0)} und. · S/ ${solesAdmin(item.total)}</span>
      </div>`).join("")
    : `<p class="mt-3 rounded-2xl bg-white p-3 text-slate-500">No hay productos pagados en esta fecha.</p>`;
  resultado.innerHTML = `
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="rounded-2xl bg-white p-4"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Total vendido</p><p class="mt-1 text-2xl font-black" style="color:${c.primary}">S/ ${solesAdmin(data.total)}</p></div>
      <div class="rounded-2xl bg-white p-4"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Pedidos/Pagos</p><p class="mt-1 text-2xl font-black" style="color:${c.primary}">${Number(data.pedidos || 0)} / ${Number(data.pagos || 0)}</p></div>
      <div class="rounded-2xl bg-white p-4"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Ticket promedio</p><p class="mt-1 text-2xl font-black" style="color:${c.primary}">S/ ${solesAdmin(data.ticket_promedio)}</p></div>
    </div>
    <div class="mt-4 rounded-2xl bg-white p-4">
      <p class="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">Detalle vendido</p>
      ${filas}
    </div>`;
}

function exportarReporteVentasExcel() {
  if (!ultimoReporteVentas) return alert("Primero realiza una consulta de ventas.");
  const fecha = ultimoReporteVentas.fecha || document.getElementById("fecha-reporte")?.value || fechaLocalISOAdmin();
  const resumen = [
    { Indicador: "Fecha", Valor: fecha },
    { Indicador: "Total vendido", Valor: Number(ultimoReporteVentas.total || 0) },
    { Indicador: "Pedidos", Valor: Number(ultimoReporteVentas.pedidos || 0) },
    { Indicador: "Pagos", Valor: Number(ultimoReporteVentas.pagos || 0) },
    { Indicador: "Ticket promedio", Valor: Number(ultimoReporteVentas.ticket_promedio || 0) },
  ];
  const detalle = (ultimoReporteVentas.detalles || []).map((item) => ({ Producto: item.nombre, Cantidad: Number(item.cantidad || 0), Total: Number(item.total || 0) }));
  if (typeof XLSX !== "undefined") {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Producto: "Sin ventas", Cantidad: 0, Total: 0 }]), "Detalle");
    XLSX.writeFile(libro, `ventas-${fecha}.xlsx`);
    return;
  }
  const filas = [...resumen.map((r) => [r.Indicador, r.Valor]), [], ["Producto", "Cantidad", "Total"], ...(detalle.length ? detalle.map((r) => [r.Producto, r.Cantidad, r.Total]) : [["Sin ventas", 0, 0]])];
  descargarExcelCompatibleAdmin(filas, `ventas-${fecha}.xls`);
}

function descargarExcelCompatibleAdmin(filas, nombre) {
  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const tabla = `<html><head><meta charset="UTF-8"></head><body><table>${filas.map((fila) => `<tr>${fila.map((valor) => `<td>${esc(valor)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([tabla], { type: "application/vnd.ms-excel;charset=utf-8" }));
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

async function cargarReporteVentas(e, silent = false) {
  if (e) e.preventDefault();
  const fi = document.getElementById("fecha-reporte");
  const res = document.getElementById("resultado-reporte");
  const fecha = fi?.value || fechaLocalISOAdmin();
  if (fi && !fi.value) fi.value = fecha;
  if (res && !silent) res.innerHTML = "Consultando ventas en la base de datos...";
  try {
    const data = await apiAdminDashboard(`/admin/ventas/reporte?fecha=${encodeURIComponent(fecha)}`);
    pintarReporteVentas(data);
  } catch (err) {
    if (res) res.innerHTML = `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">No se pudo consultar el reporte: ${escapeHtmlAdmin(err.message)}</div>`;
  }
}

async function cargarDatosDemoAdmin() {
  const fi = document.getElementById("fecha-reporte");
  if (fi && !fi.value) fi.value = fechaLocalISOAdmin();
  await cargarReporteVentas();
}

function iniciarEscuchaEventosAdmin() {
  if (typeof realTime === "undefined") return;
  realTime.connect();
  const h = () => { cargarDashboard(); cargarGrafica(); cargarRanking(); };
  realTime.on("pedido:creado", h);
  realTime.on("pedido:actualizado", h);
  realTime.on("pago:registrado", h);
}

function iniciarRefrescoDashboardAdmin() {
  if (refrescoDashboardAdmin) clearInterval(refrescoDashboardAdmin);
  refrescoDashboardAdmin = setInterval(() => {
    if (document.hidden) return;
    cargarDashboard(); cargarGrafica(); cargarRanking();
    if (document.getElementById("fecha-reporte")?.value) cargarReporteVentas(null, true);
  }, 15000);
}

function iniciarDashboard() {
  const sesion = typeof protegerRutaAdmin === "function" ? protegerRutaAdmin() : null;
  if (typeof protegerRutaAdmin === "function" && !sesion) return;
  const nombre = document.getElementById("admin-nombre");
  if (nombre && sesion?.restaurante_nombre) nombre.textContent = sesion.restaurante_nombre;
  const fi = document.getElementById("fecha-reporte");
  if (fi && !fi.value) fi.value = fechaLocalISOAdmin();

  cargarDashboard();
  cargarGrafica();
  const semana = obtenerRangoSemanaActual();
  cargarRankingConFiltros(semana.inicio, semana.fin);

  document.getElementById("rango-grafica-ventas")?.addEventListener("change", () => {
    if (chartVentas) { chartVentas.destroy(); chartVentas = null; }
    cargarGrafica();
  });
  document.getElementById("form-reporte-ventas")?.addEventListener("submit", cargarReporteVentas);

  iniciarEscuchaEventosAdmin();

  window.addEventListener("menugo:theme", () => {
    if (chartVentas) { chartVentas.destroy(); chartVentas = null; }
    if (chartPlatos) { chartPlatos.destroy(); chartPlatos = null; }
    cargarGrafica(); cargarRanking();
  });
}

document.addEventListener("DOMContentLoaded", iniciarDashboard);

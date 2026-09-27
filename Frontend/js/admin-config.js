// MenuGo · Configuración del restaurante (Admin) — v3
var API_BASE = window.MENUGO_API || "http://localhost:4000/api";

function slugActivoAdmin() {
  if (typeof slugActualAdmin === "function") return slugActualAdmin();
  const match = window.location.pathname.match(/\/r\/([^/]+)\//i);
  return decodeURIComponent(match?.[1] || window.MENUGO_SLUG || "menugo").toLowerCase();
}

async function apiRestaurante(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-MenuGo-Slug": slugActivoAdmin(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Error de servidor");
  return data;
}

function $id(id) { return document.getElementById(id); }

function mostrarAlerta(texto, tipo = "ok") {
  const alerta = $id("config-alerta");
  alerta.textContent = texto;
  alerta.className = `mb-5 rounded-2xl px-4 py-3 text-sm font-bold ${tipo === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`;
  alerta.classList.remove("hidden");
  clearTimeout(alerta._t);
  alerta._t = setTimeout(() => alerta.classList.add("hidden"), 6000);
}

// ── Color ──────────────────────────────────────────────────
function idColor(cual) { return cual === "pm" ? "primario" : "secundario"; }

function setColor(cual, hex) {
  hex = hex.toUpperCase();
  const nombre = idColor(cual);
  const colorInput = $id(`f-color-${nombre}`);
  const hexInput = $id(`f-color-${nombre}-hex`);
  const fill = $id(`config-swatch-fill-${cual}`);
  if (colorInput) colorInput.value = hex;
  if (hexInput) hexInput.value = hex;
  if (fill) fill.style.background = hex;
  // Marcar dot activo
  const palette = $id(`config-palette-${cual}`);
  if (palette) {
    palette.querySelectorAll(".config-palette-dot").forEach((d) => {
      d.classList.toggle("active", d.dataset.color.toUpperCase() === hex);
    });
  }
  actualizarPreview();
}

function leerColor(cual) {
  const nombre = idColor(cual);
  const hex = ($id(`f-color-${nombre}-hex`)?.value || $id(`f-color-${nombre}`)?.value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : "#2563EB";
}

function resetColores() { setColor("pm", "#2563EB"); setColor("sc", "#0F172A"); }

// ── Logo ───────────────────────────────────────────────────
function aplicarLogo(logoUrl) {
  const actual = $id("config-logo-preview")?.src || "";
  const src = logoUrl || (actual && !actual.endsWith("/img/Log.png") ? actual : "");
  if (!src) return;
  $id("config-logo-preview").src = src;
  const thumb = $id("config-logo-thumb");
  if (thumb) thumb.src = src;
  const uploadImg = $id("config-upload-img");
  if (logoUrl && uploadImg) {
    uploadImg.src = logoUrl;
    $id("config-upload-placeholder")?.classList.add("hidden");
    $id("config-upload-preview")?.classList.remove("hidden");
    $id("config-logo-thumb-wrap")?.classList.remove("hidden");
  } else {
    $id("config-upload-placeholder")?.classList.remove("hidden");
    $id("config-upload-preview")?.classList.add("hidden");
    if (!logoUrl) $id("config-logo-thumb-wrap")?.classList.add("hidden");
  }
}

function quitarLogo() { $id("f-logo").value = ""; aplicarLogo(null); }

function leerLogoComoDataUrl() {
  return new Promise((resolve) => {
    const archivo = $id("f-logo")?.files?.[0];
    if (!archivo) return resolve(undefined);
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => resolve(undefined);
    lector.readAsDataURL(archivo);
  });
}

// ── Dropzone ───────────────────────────────────────────────
function initDropzone() {
  const zone = $id("config-upload-zone");
  const input = $id("f-logo");
  if (!zone || !input) return;
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("dragover"); }));
  zone.addEventListener("drop", (e) => {
    const archivo = e.dataTransfer.files?.[0];
    if (archivo?.type.startsWith("image/")) { input.files = e.dataTransfer.files; mostrarLogoLocal(archivo); }
  });
  input.addEventListener("change", () => { if (input.files?.[0]) mostrarLogoLocal(input.files[0]); });
}

function mostrarLogoLocal(archivo) {
  const lector = new FileReader();
  lector.onload = () => aplicarLogo(lector.result);
  lector.readAsDataURL(archivo);
}

// ── Swatches + palette ─────────────────────────────────────
function initSwatches() {
  ["pm", "sc"].forEach((cual) => {
    const swatch = $id(`config-swatch-${cual}`);
    const nombre = idColor(cual);
    const colorInput = $id(`f-color-${nombre}`);
    const hexInput = $id(`f-color-${nombre}-hex`);
    if (swatch && colorInput) {
      swatch.addEventListener("click", () => colorInput.click());
      swatch.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); colorInput.click(); } });
      colorInput.addEventListener("input", (e) => setColor(cual, e.target.value));
    }
    if (hexInput) {
      hexInput.addEventListener("input", (e) => {
        const v = e.target.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) setColor(cual, v);
      });
    }
    const palette = $id(`config-palette-${cual}`);
    if (palette) {
      palette.addEventListener("click", (e) => {
        const dot = e.target.closest(".config-palette-dot");
        if (dot?.dataset.color) setColor(cual, dot.dataset.color);
      });
    }
  });
}

// ── Vista previa en vivo ───────────────────────────────────
function actualizarPreview() {
  const pm = leerColor("pm");
  const sc = leerColor("sc");
  const nombre = $id("f-nombre")?.value?.trim() || "Mi Restaurante";
  const slogan = $id("f-slogan")?.value?.trim() || "Tu eslogan aquí";
  const moneda = $id("f-moneda")?.value?.trim() || "S/";

  const set = (id, prop, val) => { const el = $id(id); if (el) el.style[prop] = val; };
  const setText = (id, val) => { const el = $id(id); if (el) el.textContent = val; };

  // Hero
  set("prev-hero-bg", "backgroundImage", `linear-gradient(to bottom right, ${sc}, ${pm})`);
  setText("prev-name", nombre);
  setText("prev-slogan", slogan);

  // Logo
  const prevLogo = $id("prev-logo");
  if (prevLogo) {
    const logoSrc = $id("config-logo-preview")?.src;
    prevLogo.innerHTML = (logoSrc && !logoSrc.includes("Log.png"))
      ? `<img src="${logoSrc}" alt="">`
      : `<span style="font-size:1rem;font-weight:900;color:${pm}">${nombre.charAt(0).toUpperCase()}</span>`;
  }

  // Chips
  set("prev-chip-on", "backgroundImage", `linear-gradient(135deg, ${pm}, ${sc})`);

  // Card price + CTA
  set("prev-price", "backgroundImage", `linear-gradient(135deg, ${pm}, ${sc})`);
  setText("prev-price", `${moneda} 35.00`);
  set("prev-btn", "backgroundImage", `linear-gradient(135deg, ${pm}, ${sc})`);
  set("prev-btn", "boxShadow", `0 8px 18px -8px ${sc}`);
  set("prev-card-img", "background", `linear-gradient(135deg, ${pm}22, ${pm}0A)`);
}

function vistaPrevia() {
  const pm = leerColor("pm");
  const sc = leerColor("sc");
  // Aplicar al sitio completo
  if (window.menugoAplicarTema) {
    window.menugoAplicarTema({
      color_primario: pm,
      color_secundario: sc,
      nombre: $id("f-nombre")?.value?.trim() || "Restaurante",
      slogan: $id("f-slogan")?.value?.trim(),
      moneda: $id("f-moneda")?.value?.trim() || "S/",
      logo_url: $id("config-logo-preview")?.src,
    });
  }
  actualizarPreview();
  mostrarAlerta("Vista previa aplicada en todo el sitio.");
}

// ── Form ───────────────────────────────────────────────────
function datosDelFormulario() {
  return {
    nombre: $id("f-nombre")?.value?.trim() || "",
    slogan: $id("f-slogan")?.value?.trim() || "",
    moneda: $id("f-moneda")?.value?.trim() || "S/",
    igv: Number($id("f-igv")?.value) || 0,
    serie_boleta: $id("f-serie")?.value?.trim() || "B001",
    ruc: $id("f-ruc")?.value?.trim() || "",
    telefono: $id("f-telefono")?.value?.trim() || "",
    direccion: $id("f-direccion")?.value?.trim() || "",
    color_primario: leerColor("pm"),
    color_secundario: leerColor("sc"),
    activo: $id("f-activo")?.checked || false,
    num_mesas: Number($id("f-num-mesas")?.value) || 20,
  };
}

function llenarFormulario(d) {
  const config = d.config || {};
  setText("config-titulo", "Centro de marca");
  setVal("f-nombre", d.nombre);
  setVal("f-slogan", d.slogan);
  setVal("f-moneda", d.moneda || "S/");
  setVal("f-igv", d.igv ?? 18);
  setVal("f-serie", d.serie_boleta || "B001");
  setVal("f-ruc", d.ruc);
  setVal("f-telefono", d.telefono);
  setVal("f-direccion", d.direccion);
  setVal("f-num-mesas", config.num_mesas ?? 20);
  if ($id("f-activo")) $id("f-activo").checked = !!d.activo;
  setColor("pm", d.color_primario || "#2563EB");
  setColor("sc", d.color_secundario || "#0F172A");
  if (window.menugoAplicarTema) window.menugoAplicarTema(d);
  aplicarLogo(d.logo_url);
}

function setText(id, val) { const el = $id(id); if (el) el.textContent = val || ""; }
function setVal(id, val) { const el = $id(id); if (el) el.value = val ?? ""; }

// ── Carga ──────────────────────────────────────────────────
async function cargarListaRestaurantes(seleccion) {
  const bar = $id("config-restaurante-bar");
  if (!bar || bar.style.display === "none") return;
  try {
    const { data } = await apiRestaurante("/restaurantes?include_inactive=true", { method: "GET" });
    const select = $id("config-select-restaurante");
    select.innerHTML = "";
    for (const r of data || []) {
      const op = document.createElement("option");
      op.value = r.slug;
      const tag = r.activo === false ? " (inactivo)" : "";
      op.textContent = `${r.nombre} (${r.slug})${tag}`;
      select.appendChild(op);
    }
    select.value = seleccion;
    select.onchange = () => { window.location.href = `/r/${encodeURIComponent(select.value)}/Admin/configuracion.html`; };
  } catch (error) {
    mostrarAlerta("No se pudo cargar la lista: " + error.message, "error");
  }
}

async function cargarConfiguracion() {
  try {
    const slug = slugActivoAdmin();
    const bar = $id("config-restaurante-bar");
    if (bar) bar.style.display = "none";
    await cargarListaRestaurantes(slug);
    const { data } = await apiRestaurante(`/restaurantes/${slug}`, { method: "GET" });
    llenarFormulario(data);
    actualizarPreview();
    mostrarAlerta(`Configuración de "${data.nombre}" cargada.`);
  } catch (error) {
    mostrarAlerta("Error al cargar: " + error.message, "error");
  }
}

async function guardarConfiguracion(e) {
  e.preventDefault();
  const slug = slugActivoAdmin();
  const datos = datosDelFormulario();
  const logoDataUrl = await leerLogoComoDataUrl();
  if (logoDataUrl) datos.logo_url = logoDataUrl;
  const configPrevia = window.MENUGO_CONFIG?.config || {};
  datos.config = { ...configPrevia, num_mesas: Number(datos.num_mesas) || 20 };
  delete datos.num_mesas;
  try {
    const config = await apiRestaurante(`/restaurantes/${slug}`, { method: "PATCH", body: JSON.stringify(datos) });
    if (window.menugoAplicarTema) window.menugoAplicarTema(config.data);
    mostrarAlerta(`Configuración de "${config.data?.nombre || datos.nombre}" guardada y aplicada.`);
  } catch (error) {
    mostrarAlerta("Error al guardar: " + error.message, "error");
  }
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Auth guard
  const sesion = typeof protegerRutaAdmin === "function" ? protegerRutaAdmin() : null;
  if (!sesion) return;

  $id("config-form")?.addEventListener("submit", guardarConfiguracion);
  initDropzone();
  initSwatches();
  $id("config-form")?.addEventListener("input", actualizarPreview);
  if (window.MENUGO_READY) await window.MENUGO_READY.catch(() => null);
  cargarConfiguracion();
});

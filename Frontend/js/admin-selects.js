(function () {
  function cerrarTodos(excepto) {
    document.querySelectorAll('.admin-select-menu.is-open').forEach((menu) => {
      if (menu !== excepto) menu.classList.remove('is-open');
    });
  }

  function mejorarSelect(select) {
    if (!select || select.dataset.enhanced === 'true') return;
    select.dataset.enhanced = 'true';
    const contenedor = document.createElement('div');
    contenedor.className = 'admin-custom-select';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'admin-select-trigger';
    boton.innerHTML = '<span></span><i class="bi bi-chevron-down"></i>';
    const menu = document.createElement('div');
    menu.className = 'admin-select-menu';

    function pintar() {
      boton.querySelector('span').textContent = select.options[select.selectedIndex]?.textContent || 'Seleccionar';
      menu.innerHTML = Array.from(select.options).map((opcion) =>
        `<button type="button" data-value="${String(opcion.value).replaceAll('&','&amp;').replaceAll('"','&quot;')}" class="${opcion.selected ? 'selected' : ''}"><span>${opcion.textContent}</span><i class="bi bi-check2"></i></button>`
      ).join('');
    }

    boton.addEventListener('click', () => {
      const abrir = !menu.classList.contains('is-open');
      cerrarTodos(menu);
      menu.classList.toggle('is-open', abrir);
      boton.setAttribute('aria-expanded', String(abrir));
    });
    menu.addEventListener('click', (event) => {
      const opcion = event.target.closest('[data-value]');
      if (!opcion) return;
      select.value = opcion.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      pintar();
      menu.classList.remove('is-open');
    });
    select.addEventListener('change', pintar);
    new MutationObserver(pintar).observe(select, { childList: true, subtree: true, attributes: true });
    select.parentNode.insertBefore(contenedor, select);
    contenedor.append(select, boton, menu);
    pintar();
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.admin-custom-select')) cerrarTodos();
  });
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => document.querySelectorAll('select.admin-select').forEach(mejorarSelect), 80);
  });
})();

// MenuGo · theme-init.js
// Se ejecuta en <head> ANTES del paint. La caché se separa por restaurante
// para evitar que una marca aparezca brevemente dentro de otro tenant.
(function(){
  var path = window.location.pathname;
  var pathLower = path.toLowerCase();
  var surface = pathLower.indexOf('/superadmin/') >= 0 ? 'superadmin'
    : pathLower.indexOf('/admin/') >= 0 ? 'admin'
    : pathLower.indexOf('/mesero/') >= 0 ? 'mesero'
    : pathLower.indexOf('/cocina/') >= 0 ? 'cocina'
    : pathLower.indexOf('/cliente/') >= 0 ? 'cliente'
    : 'publico';
  var pageName = (pathLower.split('/').pop() || 'index.html').replace(/\.html$/, '');
  document.documentElement.dataset.mgSurface = surface;
  document.documentElement.dataset.mgPage = pageName;

  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('mg-app-surface', 'mg-surface-' + surface);
    document.querySelectorAll('.mg-nav-link.active').forEach(function (link) {
      link.setAttribute('aria-current', 'page');
    });
  });

  if (surface === 'superadmin') return;

  var match = path.match(/^\/r\/([^\/]+?)(?:\/|$)/i);
  var querySlug = new URLSearchParams(window.location.search).get('restaurante');
  var slug = String((match && match[1]) || querySlug || window.MENUGO_SLUG || 'menugo').trim().toLowerCase();
  var cacheKey = 'mg_theme_cache:' + slug;
  var darkKey = 'mg_dark_mode:' + slug + ':' + surface;

  try {
    document.documentElement.dataset.mgColorScheme = localStorage.getItem(darkKey) === '1' ? 'dark' : 'light';
  } catch (_) {}

  try {
    var c = JSON.parse(localStorage.getItem(cacheKey));
    if (!c) return;

    // Colores: inyectar CSS variables antes del paint
    if (c.color_primario) {
      var base = /^#[0-9a-f]{6}$/i.test(c.color_primario) ? c.color_primario : '#2563EB';
      var mix = function(hex, white, pct) {
        var p = pct / 100, end = white ? 255 : 0;
        return '#' + [1,3,5].map(function(i){
          var channel = parseInt(hex.slice(i, i + 2), 16);
          return Math.round(end * p + channel * (1 - p)).toString(16).padStart(2, '0');
        }).join('');
      };
      var scale = {50:mix(base,true,95),100:mix(base,true,87),200:mix(base,true,74),300:mix(base,true,58),400:mix(base,true,34),500:base,600:mix(base,false,13),700:mix(base,false,26),800:mix(base,false,40),900:mix(base,false,54),950:mix(base,false,70)};
      var vars = '--mg-primary:'+base+';--mg-primary-500:'+base+';';
      Object.keys(scale).forEach(function(step){ vars += '--mg-p'+step+':'+scale[step]+';--mg-primary-'+step+':'+scale[step]+';'; });
      document.write('<style>:root{'+vars+'}</style>');
    }

    // Logo: si hay caché del tenant, reemplazar el respaldo al cargar el DOM.
    if (c.logo_url) {
      document.addEventListener('DOMContentLoaded', function(){
        document.querySelectorAll('[data-logo]').forEach(function(img){
          img.src = c.logo_url;
          img.style.visibility = 'visible';
        });
      });
    }
  } catch(_){}
})();

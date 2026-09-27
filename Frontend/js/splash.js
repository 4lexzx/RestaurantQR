// MenuGo · Splash de entrada (rápido)
(function () {
  if (window.__menugoSplash) return;
  window.__menugoSplash = true;

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce) return;

  function ls(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; }
  }

  document.documentElement.style.overflow = 'hidden';

  var style = document.createElement('style');
  style.textContent = '\
    #mg-splash {\
      position: fixed; inset: 0; z-index: 99999;\
      display: flex; align-items: center; justify-content: center;\
      background: linear-gradient(150deg, var(--mg-secondary), var(--mg-p900) 60%, var(--mg-p800));\
      transition: opacity 0.18s ease, visibility 0.18s ease;\
    }\
    #mg-splash::after {\
      content: "";\
      position: absolute; inset: 0;\
      background:\
        radial-gradient(90% 90% at 50% 120%, var(--mg-accent-soft), transparent 65%),\
        radial-gradient(70% 70% at 10% 0%, rgba(255,255,255,0.08), transparent 55%);\
    }\
    #mg-splash.mg-splash-off { opacity: 0; visibility: hidden; }\
    .mg-splash-logo {\
      position: relative; z-index: 3;\
      width: clamp(100px, 16vw, 170px); height: clamp(100px, 16vw, 170px);\
      padding: 14px; border-radius: 9999px;\
      background: #fff; object-fit: contain;\
      box-shadow: 0 30px 70px -20px rgba(0,0,0,0.55), 0 12px 28px -10px rgba(0,0,0,0.4);\
      opacity: 0; transform: scale(0.7);\
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);\
    }\
    .mg-splash-logo.mg-logo-in { opacity: 1; transform: scale(1); }\
    .mg-splash-ring {\
      position: absolute; z-index: 1;\
      width: clamp(128px, 20vw, 206px); height: clamp(128px, 20vw, 206px);\
      border-radius: 9999px;\
      border: 2px solid rgba(255,255,255,0.35);\
      animation: mg-splash-ring 0.4s ease-out 0.02s both;\
    }\
    @keyframes mg-splash-ring {\
      0%   { transform: scale(0.7); opacity: 0; }\
      100% { transform: scale(1.3); opacity: 0; }\
    }';
  (document.head || document.documentElement).appendChild(style);

  var overlay = document.createElement('div');
  overlay.id = 'mg-splash';
  overlay.innerHTML =
    '<img class="mg-splash-logo" alt="" />' +
    '<span class="mg-splash-ring"></span>';
  document.documentElement.appendChild(overlay);

  var logoImg = overlay.querySelector('.mg-splash-logo');

  function hideSplash() {
    overlay.classList.add('mg-splash-off');
    document.documentElement.classList.add('mg-ready');
    document.documentElement.style.overflow = '';
    setTimeout(function () { overlay.remove(); }, 220);
  }

  function showLogo(src) {
    if (!src) { hideSplash(); return; }
    if (logoImg.__shown) return;
    logoImg.__shown = true;
    logoImg.onload = function () {
      logoImg.classList.add('mg-logo-in');
      setTimeout(hideSplash, 180);
    };
    logoImg.src = src;
    // Si ya estaba en caché del navegador, onload dispara de inmediato
    if (logoImg.complete && logoImg.naturalWidth > 0) {
      logoImg.classList.add('mg-logo-in');
      setTimeout(hideSplash, 180);
    }
  }

  // 1) Logo en caché del restaurante activo → instantáneo
  var pathMatch = window.location.pathname.match(/^\/r\/([^\/]+?)(?:\/|$)/i);
  var querySlug = new URLSearchParams(window.location.search).get('restaurante');
  var tenantSlug = String((pathMatch && pathMatch[1]) || querySlug || window.MENUGO_SLUG || 'menugo').trim().toLowerCase();
  var cached = ls('mg_theme_cache:' + tenantSlug);
  var cachedLogo = cached && cached.logo_url ? cached.logo_url : null;
  if (cachedLogo) {
    showLogo(cachedLogo);
  } else {
    // 2) Sin cache → esperar config, con tope máximo
    var fallback = setTimeout(function () { hideSplash(); }, 500);
    var ready = window.MENUGO_READY;
    if (ready && typeof ready.then === 'function') {
      ready.then(function (config) {
        clearTimeout(fallback);
        showLogo(config && config.logo_url);
      }).catch(function () { hideSplash(); });
    } else {
      clearTimeout(fallback);
      hideSplash();
    }
  }
})();

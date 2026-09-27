// MenuGo · Motor de animaciones (F3)
// Vanilla: funciona en Vite (`vite build`/`vite dev`) y abriendo el estático.
// - Reveal por scroll: [data-anim] y [data-anim-stagger="n"]
// - Micro-interacciones en botones, zoom de fotos, floats decorativos.
// - Acepta [data-anim-delay] e [data-anim-direction].
(function () {
  if (window.__menugoAnimaciones) return;
  window.__menugoAnimaciones = true;

  const reduceMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion) {
    document.documentElement.classList.add("mg-anim");
    document.body.classList.add("mg-anim");
  }

  const OBS_CONFIG = { threshold: 0.12, rootMargin: "0px 0px -6% 0px" };

  function aplicarDelay(el) {
    const especifico = el.dataset.animDelay || el.dataset.delay;
    if (especifico) el.style.transitionDelay = especifico + "ms";
  }

  function revelar(el) {
    if (!el || el.classList.contains("mg-in")) return;
    aplicarDelay(el);
    el.classList.add("mg-in");
    if (obser.observables) obser.observables.delete(el);
    obser.unobserve(el);
  }

  const obser =
    "IntersectionObserver" in window
      ? new IntersectionObserver((entradas) => {
          entradas.forEach((e) => {
            if (e.isIntersecting) revelar(e.target);
          });
        }, OBS_CONFIG)
      : null;

  function registrar(raiz = document) {
    if (!obser) {
      raiz.querySelectorAll("[data-anim], [data-anim-stagger] > *").forEach((el) => el.classList.add("mg-in"));
      return;
    }

    raiz.querySelectorAll("[data-anim]").forEach((el) => {
      obser.observe(el);
      if (!obser.observables) obser.observables = new Set();
      obser.observables.add(el);
    });

    raiz.querySelectorAll("[data-anim-stagger]").forEach((contenedor) => {
      const base = Number(contenedor.dataset.animStagger || 0);
      const paso = Number(contenedor.dataset.animStep || 90);
      Array.from(contenedor.children).forEach((hijo, i) => {
        if (hijo.classList.contains("mg-in")) return;
        hijo.style.transitionDelay = `${base + (Number(hijo.dataset.staggerDelay) || i) * paso}ms`;
        obser.observe(hijo);
        if (!obser.observables) obser.observables = new Set();
        obser.observables.add(hijo);
      });
    });
  }

  // Hero: entrada escalonada al cargar
  function animarHero() {
    document.querySelectorAll("[data-hero]").forEach((hero) => {
      const hijos = Array.from(hero.children);
      hijos.forEach((hijo, i) => {
        if (hijo.dataset.anim) return;
        hijo.classList.add("mg-hero-in");
        hijo.style.animationDelay = `${120 + i * 110}ms`;
      });
    });
  }

  // Botones: micro-prensa
  // Botón "volver arriba" (aparece al bajar, sin tapar el carrito flotante)
  function instalarScrollTop() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Volver arriba");
    btn.className = "mg-scroll-top";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    document.body.appendChild(btn);
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    const alternar = () => btn.classList.toggle("mg-scroll-top--visible", window.scrollY > 420);
    window.addEventListener("scroll", alternar, { passive: true });
    alternar();
  }

  // Nav que se compacta al hacer scroll ([data-nav-shrink])
  function vigilarNav() {
    const navs = Array.from(document.querySelectorAll("[data-nav-shrink]"));
    if (!navs.length) return;
    const alternar = () => {
      const bajado = window.scrollY > 70;
      navs.forEach((n) => n.classList.toggle("mg-nav-slim", bajado));
    };
    window.addEventListener("scroll", alternar, { passive: true });
    alternar();
  }

  function instalarPrensa() {
    const clasePrensa = () => {
      document.addEventListener(
        "pointerdown",
        (e) => {
          const el = e.target.closest("button, a.btn, [role='button']");
          if (!el || el.hasAttribute("data-no-anim")) return;
          el.classList.add("mg-press");
          const limpiar = () => {
            el.classList.remove("mg-press");
            window.removeEventListener("pointerup", limpiar);
            el.removeEventListener("pointerleave", limpiar);
          };
          window.addEventListener("pointerup", limpiar);
          el.addEventListener("pointerleave", limpiar);
        },
        false
      );
    };
    if (reduceMotion) return;
    clasePrensa();
  }

  // DOM añadido dinámicamente (productos, listas renderizadas por JS)
  function vigilarCambios() {
    if (!("MutationObserver" in window)) return;
    const mo = new MutationObserver((mutaciones) => {
      let hay = false;
      mutaciones.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (
            n.hasAttribute && (n.hasAttribute("data-anim") || n.hasAttribute("data-anim-stagger") || n.hasAttribute("data-hero"))
          ) {
            hay = true;
          } else if (n.querySelectorAll) {
            if (n.querySelectorAll("[data-anim], [data-anim-stagger], [data-hero]").length) hay = true;
          }
        });
      });
      if (hay) registrar(document);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function iniciar() {
    registrar(document);
    animarHero();
    instalarPrensa();
    vigilarCambios();
    if (reduceMotion) return;
    instalarScrollTop();
    vigilarNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
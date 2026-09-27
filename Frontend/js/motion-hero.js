// Animación compartida sin dependencias ni bundler para todos los tenants.
const reduceMotion = typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animarHero(hero) {
  Array.from(hero.children).forEach((elemento, indice) => {
    elemento.classList.remove('mg-hero-in');
    elemento.animate([
      { opacity: 0, transform: 'translateY(24px)', filter: 'blur(5px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
    ], {
      delay: 90 + indice * 90,
      duration: 680,
      easing: 'cubic-bezier(.22,1,.36,1)',
      fill: 'both',
    });
  });
}

function animarInview() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.animate([
        { opacity: 0, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 580, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
      observer.unobserve(entrada.target);
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('[data-reveal-inview]').forEach((elemento) => observer.observe(elemento));
}

function arrancar() {
  if (reduceMotion) return;
  document.querySelectorAll('[data-hero]').forEach(animarHero);
  animarInview();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(arrancar));
} else {
  requestAnimationFrame(arrancar);
}

// MenuGo · Vite MPA
// Construye TODAS las páginas HTML del frontend (root = Frontend/)
// manteniendo la estructura de carpetas en dist/ y con base relativa
// para que funcione servido desde cualquier subruta (/r/:slug/...).
import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));

function escanearHtml(dir) {
  const paginas = {};
  const contiene = (p) => p !== 'dist' && p !== 'node_modules' && !p.startsWith('.');
  const pasear = (dirActual) => {
    for (const entrada of readdirSync(dirActual, { withFileTypes: true })) {
      if (!contiene(entrada.name)) continue;
      const ruta = join(dirActual, entrada.name);
      if (entrada.isDirectory()) pasear(ruta);
      else if (entrada.isFile() && entrada.name.endsWith('.html')) {
        const rutaRel = relative(root, ruta);
        const nombre = rutaRel.slice(0, -'.html'.length);
        paginas[nombre] = resolve(root, rutaRel);
      }
    }
  };
  pasear(dir);
  return paginas;
}

export default defineConfig({
  base: './',
  root,
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'js/*', dest: 'js' },
        { src: 'css/*', dest: 'css' },
        { src: 'img/*', dest: 'img' },
      ],
    }),
  ],
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: escanearHtml(root),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
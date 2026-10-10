import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { proxy: { '/publisher': { target: 'http://127.0.0.1:3001', changeOrigin: true, rewrite: path => path.replace(/^\/publisher/, '') } } },
  build: {
    outDir: 'www',
    assetsInlineLimit: 0,
    minify: true,
    cssCodeSplit: false,
    modulePreload: false,
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'www',
    assetsInlineLimit: 0,
    minify: true,
    cssCodeSplit: false,
    modulePreload: false,
  },
});

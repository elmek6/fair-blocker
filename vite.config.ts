import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import manifest from './manifest.config';

// CRXJS, MV3 manifest'ini alıp içerik/arka plan script'lerini ve HTML giriş
// noktalarını otomatik bağlar. `public/` altındaki dosyalar dist köküne kopyalanır
// (manifest'te `icons/...` diye referans verilmesinin sebebi bu).
export default defineConfig({
  resolve: {
    alias: {
      '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      '@filters': fileURLToPath(new URL('./filters/generated', import.meta.url)),
    },
  },
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
    // Uzantı incelemesi/okunabilirlik için minify'ı ileride kapatabiliriz;
    // şimdilik varsayılan.
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});

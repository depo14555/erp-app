import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // Мітка збірки — видно в меню, щоб одразу розуміти, яка версія завантажена
  define: {
    __BUILD_TIME__: JSON.stringify(
      new Date().toLocaleString('uk-UA', {
        timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    ),
  },
  plugins: [
    react(),
    VitePWA({
      // prompt: нова версія НЕ застосовується сама. autoUpdate перезавантажував
      // сторінку прямо посеред роботи (розкрій, тех.запуск) — усе втрачалось.
      // Тепер оновлення пропонує UpdatePrompt, і тільки коли робота не йде.
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'logo.svg'],
      manifest: {
        name: 'ERP Металообробка',
        short_name: 'ERP',
        description: 'Мобільний доступ до ERP-системи металообробки',
        theme_color: '#1F6FEB',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // pdfjs-воркер і великі чанки перевищують дефолтний ліміт прекешу 2MB
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/script\.google\.com\/macros\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      devOptions: {
        // У dev сервіс-воркер вимкнено — dev-dist/registerSW.js падав з ENOENT
        enabled: false,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  publicDir: 'public',
  // Без '**/*.json': pdf-lib імпортує JSON-модулі шрифтів — asset-режим ламає збірку
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.svg', '**/*.ico'],
});

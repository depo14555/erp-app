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
      // autoUpdate: нова версія застосовується сама при наступному відкритті.
      // З 'prompt' користувач лишався на старій, доки не натисне «Оновити».
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ERP Металообробка',
        short_name: 'ERP',
        description: 'Мобільний доступ до ERP-системи металообробки',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/script\.google\.com\/macros\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      },
      devOptions: {
        // РЈ dev (Р·РѕРєСЂРµРјР° РІ Bolt/WebContainer) РіРµРЅРµСЂР°С†С–СЏ dev-dist/registerSW.js
        // РїР°РґР°С” Р· ENOENT вЂ” СЃРµСЂРІС–СЃ-РІРѕСЂРєРµСЂ РїРѕС‚СЂС–Р±РµРЅ Р»РёС€Рµ РІ РїСЂРѕРґР°РєС€РЅ-Р·Р±С–СЂС†С–
        enabled: false
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-qr': ['html5-qrcode'],
          'vendor-icons': ['lucide-react']
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  publicDir: 'public',
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.svg', '**/*.ico']
});


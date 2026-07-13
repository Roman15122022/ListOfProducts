import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const normalizeBasePath = (configuredBasePath: string): string => {
  const path = configuredBasePath.trim();

  if (!path || path === "/") {
    return "/";
  }

  return `/${path.replace(/^\/+|\/+$/gu, "")}/`;
};

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "VITE_");
  const defaultBasePath = mode === "production" ? "/ListOfProducts/" : "/";
  const basePath = normalizeBasePath(
    environment.VITE_BASE_PATH ?? defaultBasePath,
  );

  return {
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        manifest: {
          id: basePath,
          name: "Smart Shopping List",
          short_name: "Shopping List",
          description: "A fast, offline-ready shopping list.",
          lang: "en",
          theme_color: "#0f766e",
          background_color: "#eef4ef",
          display: "standalone",
          start_url: basePath,
          scope: basePath,
          categories: ["shopping", "productivity"],
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "icons/icon-192-maskable.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable"
            },
            {
              src: "icons/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
          globIgnores: ["icon-*.svg", "icons/icon-*.png"],
          navigateFallback: "index.html",
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/www\.themealdb\.com\/api\/json\//,
              handler: "NetworkFirst",
              options: {
                cacheName: "recipe-api-v1",
                networkTimeoutSeconds: 5,
                cacheableResponse: { statuses: [0, 200] },
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 24 * 60 * 60,
                  purgeOnQuotaError: true,
                },
              },
            },
            {
              urlPattern: /^https:\/\/www\.themealdb\.com\/images\//,
              handler: "CacheFirst",
              options: {
                cacheName: "recipe-images-v1",
                cacheableResponse: { statuses: [0, 200] },
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                  purgeOnQuotaError: true,
                },
              },
            },
          ],
        }
      })
    ]
  };
});

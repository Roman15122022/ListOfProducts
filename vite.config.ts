import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/smart-shopping-list/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
      ],
      manifest: {
        name: "Smart Shopping List",
        short_name: "Shopping List",
        description: "A fast, offline-ready shopping list.",
        lang: "en",
        theme_color: "#0f766e",
        background_color: "#eef4ef",
        display: "standalone",
        start_url: "/smart-shopping-list/",
        scope: "/smart-shopping-list/",
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
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"]
      }
    })
  ]
}));

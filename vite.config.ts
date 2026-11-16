import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Same-origin in development, matching the deployed cookie model.
const proxy = {
  "/pulp": {
    target: process.env.PULP_PROXY ?? "http://localhost:8080",
    changeOrigin: false,
  },
  "/sso": {
    target: process.env.GATEWAY_PROXY ?? "http://localhost:8081",
    changeOrigin: false,
  },
};

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/ui/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: "tanstack",
              test: /node_modules[\\/]@tanstack[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
});

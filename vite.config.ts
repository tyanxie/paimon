import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "src/web/src"),
      "@protocol": path.resolve(__dirname, "src/protocol"),
    },
  },
  server: {
    // 开发时代理 WebSocket 到 Hub
    proxy: {
      "/ws": {
        target: "ws://localhost:7890",
        ws: true,
      },
      "/api": {
        target: "http://localhost:7890",
      },
    },
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});

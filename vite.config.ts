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
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});

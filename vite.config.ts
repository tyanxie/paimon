import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  root: "src/web",
  base: "./", // 相对路径：产物不含绝对路径前缀，Hub 运行时通过注入 <base href> 实现子路径部署
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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // React 核心：极少更新，长期缓存
          if (/[\/](?:react-dom|react|scheduler)[\/]/.test(id)) {
            return "framework";
          }

          // Markdown 渲染生态：体积大、独立功能
          if (
            /[\/](?:react-markdown|remark-[\w-]+|rehype-[\w-]+|highlight\.js|lowlight|parse5|unified|micromark[\w-]*|mdast[\w-]*|hast[\w-]*|vfile[\w-]*|unist[\w-]*|js-yaml|property-information|get-east-asian-width|markdown-table|comma-separated-tokens|space-separated-tokens|longest-streak|ccount|escape-string-regexp|trim-lines|decode-named-character-reference|html-void-elements|html-url-attributes|web-namespaces|inline-style-parser|style-to-object|style-to-js|is-plain-obj|bail|trough|zwitch|fault|extend|format)[\/]/.test(
              id,
            )
          ) {
            return "markdown";
          }

          // 其余第三方依赖：偶尔更新
          return "vendor";
        },
      },
    },
  },
});

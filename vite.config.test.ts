import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { build } from "vite";

test("构建保留 Mermaid、DOMPurify 和弹窗拖动的按需加载", async () => {
  const result = await build({
    configFile: resolve(import.meta.dirname, "vite.config.ts"),
    logLevel: "silent",
    build: { write: false },
  });
  if (Array.isArray(result) || !("output" in result)) {
    throw new Error("Expected a single build output");
  }

  const chunks = result.output.filter((item) => item.type === "chunk");
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const entries = chunks.filter((chunk) => chunk.isEntry);
  expect(entries.length).toBeGreaterThan(0);

  // 递归检查全部静态依赖，包括共享模块的间接引用
  const initialFiles = new Set<string>();
  function visit(fileName: string) {
    if (initialFiles.has(fileName)) return;
    initialFiles.add(fileName);
    for (const dependency of byFile.get(fileName)?.imports ?? []) {
      visit(dependency);
    }
  }
  for (const entry of entries) visit(entry.fileName);

  const diagramChunks = chunks.filter((chunk) =>
    Object.keys(chunk.modules).some((id) =>
      /\/node_modules\/(?:mermaid|dompurify|khroma)\//.test(id),
    ),
  );
  expect(diagramChunks.length).toBeGreaterThan(0);
  for (const chunk of diagramChunks) {
    expect(initialFiles.has(chunk.fileName)).toBe(false);
  }

  const mermaid = chunks.find((chunk) =>
    Object.keys(chunk.modules).some((id) =>
      id.endsWith("/mermaid/dist/mermaid.core.mjs"),
    ),
  );
  const purify = chunks.find((chunk) =>
    Object.keys(chunk.modules).some((id) =>
      /\/node_modules\/dompurify\//.test(id),
    ),
  );
  expect(mermaid?.isDynamicEntry).toBe(true);
  expect(mermaid!.dynamicImports.length).toBeGreaterThan(1);
  expect(purify?.isDynamicEntry).toBe(true);

  const drag = chunks.find((chunk) =>
    Object.keys(chunk.modules).some((id) =>
      id.endsWith("/gestures/drag/VisualElementDragControls.mjs"),
    ),
  );
  expect(drag !== undefined).toBe(true);
  expect(initialFiles.has(drag!.fileName)).toBe(false);

  const html = result.output.find(
    (item) => item.type === "asset" && item.fileName === "index.html",
  );
  if (!html || html.type !== "asset") {
    throw new Error("Expected index.html in build output");
  }
  const source =
    typeof html.source === "string"
      ? html.source
      : new TextDecoder().decode(html.source);
  const document = new DOMParser().parseFromString(source, "text/html");
  const preloads = new Set(
    Array.from(document.querySelectorAll('link[rel="modulepreload"]')).map(
      (link) =>
        new URL(
          link.getAttribute("href")!,
          "https://paimon.test/",
        ).pathname.slice(1),
    ),
  );
  for (const chunk of diagramChunks) {
    expect(preloads.has(chunk.fileName)).toBe(false);
  }
}, 60_000);

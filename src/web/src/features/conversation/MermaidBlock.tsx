// Mermaid 图表：主题适配、流式更新与源码复制

import { Check, Copy, Expand, LoaderCircle } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { ContentToolbar } from "../../components/ui/ContentBlock";
import { ImageLightbox } from "../../components/ui/ImageLightbox";
import { useResolvedTheme } from "../../stores/useSettings";

let renderQueue: Promise<void> = Promise.resolve();
let nextDiagramId = 0;

function renderMermaid(
  source: string,
  theme: "light" | "dark",
  signal: AbortSignal,
): Promise<string> {
  const result = renderQueue.then(async () => {
    signal.throwIfAborted();
    const [
      { default: mermaid },
      { default: DOMPurify },
      { createMermaidConfig },
    ] = await Promise.all([
      import("mermaid"),
      import("dompurify"),
      import("./mermaidTheme"),
    ]);
    signal.throwIfAborted();
    const config = createMermaidConfig(theme);
    mermaid.initialize(config);

    // 临时容器提供稳定的布局宽度，渲染结束后统一清理
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;left:-100000px;top:0;width:960px;visibility:hidden;pointer-events:none";
    document.body.append(container);
    try {
      const { svg } = await mermaid.render(
        `mermaid-${++nextDiagramId}`,
        source,
        container,
      );
      signal.throwIfAborted();
      // 使用 viewBox 的尺寸，让 SVG 图片按图表比例参与页面布局
      const element = new DOMParser().parseFromString(
        svg,
        "image/svg+xml",
      ).documentElement;
      if (!(element instanceof SVGSVGElement)) {
        throw new Error("Invalid Mermaid SVG document");
      }
      const viewBox = element.viewBox?.baseVal;
      if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        element.setAttribute("width", String(viewBox.width));
        element.setAttribute("height", String(viewBox.height));
      }
      element.style.backgroundColor = "transparent";
      return DOMPurify.sanitize(
        new XMLSerializer().serializeToString(element),
        {
          USE_PROFILES: { svg: true, svgFilters: true },
        },
      );
    } finally {
      container.remove();
    }
  });
  // 单个图表失败后，后续图表仍然继续渲染
  renderQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}

type RenderState =
  | { status: "loading"; source: string; theme: "light" | "dark" }
  | {
      status: "ready";
      source: string;
      theme: "light" | "dark";
      svg: string;
    }
  | { status: "error"; source: string; theme: "light" | "dark" };

export function MermaidBlock({
  source,
  streaming,
}: {
  source: string;
  streaming: boolean;
}) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const [state, setState] = useState<RenderState>({
    status: "loading",
    source,
    theme,
  });
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const svg = await renderMermaid(source, theme, controller.signal);
          if (!controller.signal.aborted) {
            setState({ status: "ready", source, theme, svg });
          }
        } catch {
          if (!controller.signal.aborted) {
            setState({ status: "error", source, theme });
          }
        }
      },
      streaming ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source, theme, streaming]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const current = state.source === source && state.theme === theme;
  const ready = current && state.status === "ready";
  const failed = current && state.status === "error" && !streaming;
  const imageSrc = ready
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.svg)}`
    : "";

  const placeholder = (
    <div className="text-[var(--label-primary)]">
      <p
        className="flex min-h-24 items-center justify-center gap-2 px-3 py-3 text-[12px] text-[var(--label-secondary)]"
        role="status"
      >
        {!failed && (
          <LoaderCircle
            size={14}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        {failed ? t("entries.mermaidError") : t("entries.mermaidLoading")}
      </p>
      {failed && (
        <pre className="px-3 py-2.5 overflow-x-auto text-[13px] leading-[20px]">
          <code>{source}</code>
        </pre>
      )}
    </div>
  );

  return (
    <>
      <div className="content-block max-w-full">
        <ContentToolbar label={t("entries.mermaidDiagram")}>
          <Button size="compact" type="button" onClick={handleCopy}>
            {copied ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
            <span aria-live="polite">
              {copied ? t("entries.copied") : t("entries.copy")}
            </span>
          </Button>
          {ready && (
            <Button
              size="compact"
              type="button"
              onClick={() => setPreviewOpen(true)}
              aria-haspopup="dialog"
            >
              <Expand size={12} aria-hidden="true" />
              {t("entries.mermaidExpand")}
            </Button>
          )}
        </ContentToolbar>
        {ready ? (
          <div className="px-3 py-2.5 overflow-x-auto">
            {/* SVG 使用图片上下文展示，图表样式与页面保持独立 */}
            <img
              src={imageSrc}
              alt={t("entries.mermaidDiagram")}
              className="block mx-auto max-w-full h-auto"
            />
          </div>
        ) : (
          placeholder
        )}
      </div>
      <AnimatePresence>
        {previewOpen && (
          <ImageLightbox
            key="preview"
            src={imageSrc}
            alt={t("entries.mermaidDiagram")}
            zoomable
            placeholder={placeholder}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

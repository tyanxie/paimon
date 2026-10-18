// Mermaid 图表：主题适配、流式更新与源码复制

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Expand } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useResolvedTheme } from "../../stores/useSettings";
import { ImageLightbox } from "../ui/ImageLightbox";

let renderQueue: Promise<void> = Promise.resolve();
let nextDiagramId = 0;

function renderMermaid(
  source: string,
  theme: "light" | "dark",
  signal: AbortSignal,
): Promise<string> {
  const result = renderQueue.then(async () => {
    signal.throwIfAborted();
    const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([
      import("mermaid"),
      import("dompurify"),
    ]);
    signal.throwIfAborted();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "default",
      htmlLabels: false,
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "maxEdges",
        "suppressErrorRendering",
        "htmlLabels",
        "dompurifyConfig",
        "theme",
        "themeCSS",
        "themeVariables",
        "fontFamily",
      ],
    });

    // 临时容器参与浏览器布局测量，渲染结束后统一清理
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
    document.body.append(container);
    try {
      const { svg } = await mermaid.render(
        `mermaid-${++nextDiagramId}`,
        source,
        container,
      );
      signal.throwIfAborted();
      // 使用 viewBox 的尺寸，让 SVG 图片按图表比例参与页面布局
      const element = new DOMParser().parseFromString(svg, "image/svg+xml")
        .documentElement as unknown as SVGSVGElement;
      const viewBox = element.viewBox?.baseVal;
      if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        element.setAttribute("width", String(viewBox.width));
        element.setAttribute("height", String(viewBox.height));
      }
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
    <div>
      <p
        className="px-3 pt-2 text-[12px] text-[var(--label-secondary)]"
        role="status"
      >
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
      <div className="my-2 min-w-0 max-w-full rounded-[8px] bg-[var(--fill-card)] border border-[var(--separator)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--separator)]">
          <span className="text-[11px] text-[var(--label-tertiary)] font-medium">
            {t("entries.mermaidDiagram")}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t("entries.copied") : t("entries.copy")}
            </button>
            {ready && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                aria-haspopup="dialog"
                className="flex items-center gap-1 rounded-[4px] text-[11px] text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              >
                <Expand size={12} />
                {t("entries.mermaidExpand")}
              </button>
            )}
          </div>
        </div>
        {ready ? (
          <div className="p-3 overflow-x-auto">
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
      {previewOpen && (
        <ImageLightbox
          src={imageSrc}
          alt={t("entries.mermaidDiagram")}
          zoomable
          placeholder={placeholder}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

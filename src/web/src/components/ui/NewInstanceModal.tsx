// 新建实例弹窗：选择 Edge + 输入工作目录，在指定 Edge 上 spawn 一个 pi 实例
//
// 复用 ModalShell 基础组件保证风格统一。

import { useState, useRef, useEffect, useCallback } from "react";
import { FolderPlus } from "lucide-react";
import { ModalShell } from "./ModalShell";
import type { InstanceId, EdgeInfo } from "../../../../protocol/types";

interface NewInstanceModalProps {
  onClose: () => void;
  /** 创建成功后回调（携带新实例 id） */
  onCreated: (id: InstanceId) => void;
}

export function NewInstanceModal({
  onClose,
  onCreated,
}: NewInstanceModalProps) {
  const [cwd, setCwd] = useState("");
  const [edges, setEdges] = useState<EdgeInfo[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [loadingEdges, setLoadingEdges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自增高：随内容换行而扩展
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // 加载可用的 Edge 列表
  useEffect(() => {
    fetch("/api/edges")
      .then((res) => res.json())
      .then((data: { edges: EdgeInfo[] }) => {
        setEdges(data.edges);
        if (data.edges.length > 0) {
          setSelectedEdgeId(data.edges[0].edgeId);
        }
        setLoadingEdges(false);
      })
      .catch(() => {
        setLoadingEdges(false);
        setError("Failed to fetch edge list");
      });
  }, []);

  useEffect(() => {
    if (!loadingEdges) {
      textareaRef.current?.focus();
    }
  }, [loadingEdges]);

  useEffect(() => {
    autoGrow();
  }, [cwd, autoGrow]);

  const handleSubmit = useCallback(async () => {
    const trimmed = cwd.trim();
    if (!trimmed || submitting) return;
    if (!selectedEdgeId) {
      setError("No edge selected");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: trimmed, edgeId: selectedEdgeId }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json()) as {
        instanceId?: InstanceId;
        error?: string;
      };
      if (!res.ok || !data.instanceId) {
        setError(data.error || `Request failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      onCreated(data.instanceId);
    } catch (err) {
      const message =
        (err as Error).name === "TimeoutError"
          ? "Request timed out"
          : (err as Error).message || "Network error";
      setError(message);
      setSubmitting(false);
    }
  }, [cwd, submitting, selectedEdgeId, onCreated]);

  // Enter 提交
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <ModalShell
      title={
        <>
          <FolderPlus size={16} />
          <span>新建实例</span>
        </>
      }
      onClose={onClose}
    >
      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Edge 选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-[var(--label-secondary)]">
            Edge 节点
          </label>
          {loadingEdges ? (
            <div className="text-[13px] text-[var(--label-tertiary)]">
              加载中…
            </div>
          ) : edges.length === 0 ? (
            <div className="text-[12px] text-[#ff4245]">
              没有可用的 Edge 节点
            </div>
          ) : edges.length === 1 ? (
            <div className="text-[13px] text-[var(--label-primary)]">
              {edges[0].hostname}
              <span className="text-[var(--label-tertiary)] ml-1.5">
                ({edges[0].edgeId})
              </span>
            </div>
          ) : (
            <select
              value={selectedEdgeId}
              onChange={(e) => setSelectedEdgeId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-[10px] px-3 py-2 bg-[var(--fill-tertiary)] border border-[var(--separator)] text-[14px] text-[var(--label-primary)] outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
            >
              {edges.map((edge) => (
                <option key={edge.edgeId} value={edge.edgeId}>
                  {edge.hostname} ({edge.edgeId})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 工作目录 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-[var(--label-secondary)]">
            工作目录（绝对路径）
          </label>
          <textarea
            ref={textareaRef}
            value={cwd}
            onChange={(e) => setCwd(e.target.value.replace(/\n/g, ""))}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="/path/to/your/project"
            disabled={submitting || loadingEdges}
            spellCheck={false}
            className="w-full resize-none overflow-hidden rounded-[10px] px-3 py-2 bg-[var(--fill-tertiary)] border border-[var(--separator)] text-[14px] leading-[20px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] outline-none focus:border-[var(--color-accent)] transition-colors break-all disabled:opacity-50"
          />
        </div>

        {error && (
          <div className="text-[12px] leading-[16px] text-[#ff4245] whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !cwd.trim() || !selectedEdgeId}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

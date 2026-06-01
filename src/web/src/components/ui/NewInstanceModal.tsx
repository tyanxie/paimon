// 新建实例弹窗：输入工作目录，在 Hub 本机 spawn 一个 pi 实例
//
// 复用 ModalShell 基础组件保证风格统一。输入框语义上是单行（Enter 提交），
// 但视觉上自动换行 + 自增高，让用户能完整看到较长的目录路径。

import { useState, useRef, useEffect, useCallback } from "react";
import { FolderPlus } from "lucide-react";
import { ModalShell } from "./ModalShell";
import type { InstanceId } from "../../../../protocol/types";

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

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    autoGrow();
  }, [cwd, autoGrow]);

  const handleSubmit = useCallback(async () => {
    const trimmed = cwd.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: trimmed }),
        // 略大于服务端注册超时（SPAWN_REGISTER_TIMEOUT），防止网络层 hang 住导致 UI 永远卡在提交态
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
  }, [cwd, submitting, onCreated]);

  // 单行语义：Enter 提交（Shift+Enter 不插入换行，路径无需多行输入）
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
          disabled={submitting}
          spellCheck={false}
          className="w-full resize-none overflow-hidden rounded-[10px] px-3 py-2 bg-[var(--fill-tertiary)] border border-[var(--separator)] text-[14px] leading-[20px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] outline-none focus:border-[var(--color-accent)] transition-colors break-all disabled:opacity-50"
        />
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
            disabled={submitting || !cwd.trim()}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

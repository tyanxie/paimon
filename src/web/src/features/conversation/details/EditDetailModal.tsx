import { ResultBlock } from "../../../components/ui/ContentBlock";
import { ModalShell } from "../../../components/ui/ModalShell";
import {
  ToolModalTitle,
  ToolPendingIndicator,
  type DetailModalProps,
} from "../ToolDetailShared";

/** Diff 行解析渲染 */
function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="text-[13px] leading-[20px] font-mono overflow-x-auto">
      <div style={{ minWidth: "fit-content" }}>
        {lines.map((line, i) => {
          const prefix = line[0];
          if (prefix === "+") {
            return (
              <div
                key={i}
                className="px-3 rounded-inline"
                style={{
                  backgroundColor: "var(--diff-add-bg)",
                  color: "var(--diff-add-text)",
                }}
              >
                {line}
              </div>
            );
          }
          if (prefix === "-") {
            return (
              <div
                key={i}
                className="px-3 rounded-inline"
                style={{
                  backgroundColor: "var(--diff-del-bg)",
                  color: "var(--diff-del-text)",
                }}
              >
                {line}
              </div>
            );
          }
          // 上下文行（空格前缀）
          return (
            <div
              key={i}
              className="px-3"
              style={{ color: "var(--diff-context-text)" }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </pre>
  );
}

/** Edit 工具专用弹窗 */
export function EditDetailModal({
  name,
  args,
  result,
  durationDisplay,
  status,
  onClose,
}: DetailModalProps) {
  const path = typeof args.path === "string" ? args.path : "";
  const diff =
    typeof result?.details?.diff === "string" ? result.details.diff : undefined;

  return (
    <ModalShell
      trailing={durationDisplay}
      title={<ToolModalTitle name={name} status={status} />}
      onClose={onClose}
    >
      {/* 地址栏 */}
      <div className="px-5 py-2 border-b border-[var(--separator)] bg-[var(--fill-quaternary)]">
        <p className="text-[13px] text-[var(--label-secondary)] break-all leading-[20px] font-mono">
          {path}
        </p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto pt-3 pb-5 scrollbar-auto">
        {result !== null ? (
          result.isError ? (
            <ResultBlock error className="mx-5">
              {result.content}
            </ResultBlock>
          ) : diff ? (
            <DiffView diff={diff} />
          ) : (
            // fallback: 无 diff 数据时显示纯文本结果
            <ResultBlock className="mx-5">{result.content}</ResultBlock>
          )
        ) : (
          <div className="px-5">
            <ToolPendingIndicator status={status} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

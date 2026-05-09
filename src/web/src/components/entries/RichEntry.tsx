// Rich 模式渲染：格式化 UI（Markdown、tool cards 等）
// TODO: 实现 Markdown 渲染、tool call 卡片、折叠面板等

import type { SessionEntry } from "../../stores/useAppState";
import { RawEntryItem } from "./RawEntry";

export function RichEntryItem({
  entry,
  isLast,
  isStreaming,
}: {
  entry: SessionEntry;
  isLast: boolean;
  isStreaming: boolean;
}) {
  // 暂时回退到 Raw 渲染，后续逐步替换
  return (
    <RawEntryItem entry={entry} isLast={isLast} isStreaming={isStreaming} />
  );
}

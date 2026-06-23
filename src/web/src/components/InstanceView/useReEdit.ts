// 重新编辑 hook：abort 后将上一条用户消息回填到输入框
//
// 条件：最后一条 entry 是 aborted assistant + 实例 idle + 能找到前一条 user 消息
// 行为：提取 text + images → 检查 draft 是否为空 → 设置 draft 或 toast 提示

import { useCallback, useMemo } from "react";
import type {
  InstanceId,
  InstanceStatus,
  ImagePayload,
} from "../../../../protocol/types";
import type { SessionEntry } from "../../stores/types";
import { useDrafts, EMPTY_DRAFT } from "../../stores/useDrafts";
import type { InputDraft } from "../../stores/useDrafts";
import type { AttachedImage } from "../../utils/image";
import { showToast } from "../ui/Toast";
import { useTranslation } from "react-i18next";

/**
 * 从 entries 中判断是否满足"重新编辑"条件，并返回回调。
 * 条件不满足时返回 undefined。
 */
export function useReEdit(
  instanceId: InstanceId,
  entries: SessionEntry[],
  instanceStatus: InstanceStatus | undefined,
): (() => void) | undefined {
  const { t } = useTranslation();
  const setDraft = useDrafts((s) => s.setDraft);

  // 找到最后一条 entry 和它前面的 user 消息
  const { canReEdit, userContent } = useMemo(() => {
    if (instanceStatus !== "idle" || entries.length === 0) {
      return { canReEdit: false, userContent: null };
    }

    const lastEntry = entries[entries.length - 1];

    // 最后一条必须是 aborted assistant
    if (
      lastEntry.type !== "message" ||
      lastEntry.message?.role !== "assistant" ||
      (lastEntry.message as any).stopReason !== "aborted"
    ) {
      return { canReEdit: false, userContent: null };
    }

    // 向上找最近的 user 消息
    for (let i = entries.length - 2; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "message" && entry.message?.role === "user") {
        return { canReEdit: true, userContent: entry.message.content };
      }
    }

    return { canReEdit: false, userContent: null };
  }, [entries, instanceStatus]);

  const handleReEdit = useCallback(() => {
    if (!canReEdit || userContent == null) return;

    // 检查当前 draft 是否非空
    const currentDraft =
      useDrafts.getState().drafts.get(instanceId) ?? EMPTY_DRAFT;
    if (currentDraft.text.trim() || currentDraft.images.length > 0) {
      showToast(t("reEdit.draftNotEmpty"));
      return;
    }

    // 从 user message content 提取 text 和 images
    const newDraft = extractDraftFromContent(userContent);
    setDraft(instanceId, newDraft);
  }, [canReEdit, userContent, instanceId, setDraft, t]);

  return canReEdit ? handleReEdit : undefined;
}

/** 从 user message content 提取 InputDraft */
function extractDraftFromContent(content: unknown): InputDraft {
  let text = "";
  const images: AttachedImage[] = [];

  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const block of content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "image") {
        const img = block as ImagePayload;
        const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        images.push({
          id,
          data: img.data,
          mimeType: img.mimeType,
          previewUrl: `data:${img.mimeType};base64,${img.data}`,
        });
      }
    }
    text = textParts.join("");
  }

  return { text, images };
}

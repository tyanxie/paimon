// 草稿全局 store：per-instance 输入草稿，跨页面切换存活

import { create } from "zustand";
import type { InstanceId } from "../../../protocol/types";
import type { AttachedImage } from "../utils/image";

// ── 类型 ──

export interface InputDraft {
  text: string;
  images: AttachedImage[];
}

export type InputDraftUpdater = InputDraft | ((prev: InputDraft) => InputDraft);

export const EMPTY_DRAFT: InputDraft = Object.freeze({
  text: "",
  images: [],
}) as InputDraft;

interface DraftsState {
  drafts: Map<InstanceId, InputDraft>;
  /** 更新指定实例的草稿 */
  setDraft: (instanceId: InstanceId, value: InputDraftUpdater) => void;
}

// ── Store ──

export const useDrafts = create<DraftsState>((set, get) => ({
  drafts: new Map(),

  setDraft: (instanceId, value) => {
    set((state) => {
      const current = state.drafts.get(instanceId) ?? EMPTY_DRAFT;
      const next = typeof value === "function" ? value(current) : value;
      const drafts = new Map(state.drafts);
      if (next.text || next.images.length > 0) {
        drafts.set(instanceId, next);
      } else {
        drafts.delete(instanceId);
      }
      return { drafts };
    });
  },
}));

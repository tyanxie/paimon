// 实例操作指令集：把 UI 操作意图翻译为 WS 消息

import { useCallback } from "react";
import { useNavigate } from "react-router";
import type {
  InstanceId,
  ImagePayload,
  ThinkingLevel,
  BrowserToHubMessage,
} from "../../../protocol/types";
import { EMPTY_DRAFT, type InputDraftUpdater } from "../stores/types";

type SendFn = (msg: BrowserToHubMessage) => void;
type SetDraftFn = (id: InstanceId, updater: InputDraftUpdater) => void;
type SetSessionListLoadingFn = (loading: boolean) => void;

export function useInstanceActions(
  selectedInstanceId: InstanceId | null,
  send: SendFn,
  setDraft: SetDraftFn,
  setSessionListLoading: SetSessionListLoadingFn,
) {
  const navigate = useNavigate();

  const handleSendMessage = useCallback(
    (message: string, images?: ImagePayload[]) => {
      if (!selectedInstanceId) return;
      send({
        type: "prompt",
        payload: {
          instanceId: selectedInstanceId,
          message,
          images: images?.length ? images : undefined,
        },
      });
      setDraft(selectedInstanceId, EMPTY_DRAFT);
    },
    [selectedInstanceId, send, setDraft],
  );

  const handleAbort = useCallback(() => {
    if (!selectedInstanceId) return;
    send({
      type: "abort",
      payload: { instanceId: selectedInstanceId },
    });
  }, [selectedInstanceId, send]);

  const handleSetModel = useCallback(
    (provider: string, id: string) => {
      if (!selectedInstanceId) return;
      send({
        type: "set_model",
        payload: { instanceId: selectedInstanceId, provider, id },
      });
    },
    [selectedInstanceId, send],
  );

  const handleSetThinkingLevel = useCallback(
    (level: ThinkingLevel) => {
      if (!selectedInstanceId) return;
      send({
        type: "set_thinking_level",
        payload: { instanceId: selectedInstanceId, level },
      });
    },
    [selectedInstanceId, send],
  );

  const handleListSessions = useCallback(() => {
    if (!selectedInstanceId) return;
    setSessionListLoading(true);
    send({
      type: "list_sessions",
      payload: { instanceId: selectedInstanceId },
    });
  }, [selectedInstanceId, send, setSessionListLoading]);

  const handleNewSession = useCallback(() => {
    if (!selectedInstanceId) return;
    send({
      type: "new_session",
      payload: { instanceId: selectedInstanceId },
    });
  }, [selectedInstanceId, send]);

  const handleSwitchSession = useCallback(
    (path: string) => {
      if (!selectedInstanceId) return;
      send({
        type: "switch_session",
        payload: { instanceId: selectedInstanceId, path },
      });
    },
    [selectedInstanceId, send],
  );

  const handleCompact = useCallback(
    (customInstructions?: string) => {
      if (!selectedInstanceId) return;
      send({
        type: "compact",
        payload: { instanceId: selectedInstanceId, customInstructions },
      });
    },
    [selectedInstanceId, send],
  );

  const handleShutdown = useCallback(
    (id: InstanceId) => {
      send({ type: "shutdown", payload: { instanceId: id } });
      // 主动关闭当前查看的实例时直接跳转，避免触发"实例不存在"提示
      if (id === selectedInstanceId) {
        navigate("/");
      }
    },
    [send, selectedInstanceId, navigate],
  );

  return {
    handleSendMessage,
    handleAbort,
    handleSetModel,
    handleSetThinkingLevel,
    handleListSessions,
    handleNewSession,
    handleSwitchSession,
    handleCompact,
    handleShutdown,
  };
}

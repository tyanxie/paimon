// 新建实例弹窗：选择 Edge + 输入工作目录（带目录自动补全），在指定 Edge 上 spawn 一个 pi 实例

import { FolderPlus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InstanceId } from "../../../../protocol/types";
import { Button } from "../../components/ui/Button";
import { FormField, SelectField } from "../../components/ui/FormControls";
import { ModalShell } from "../../components/ui/ModalShell";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { authFetch } from "../../utils/authFetch";
import { isRecord } from "../../utils/typeGuards";
import { isInstanceCreationEdgesResponse } from "./instanceData";
import type { InstanceCreationEdge } from "./types";
import { PathAutocomplete } from "./PathAutocomplete";

// ─── NewInstanceModal ────────────────────────────────────────────────────────

interface NewInstanceModalProps {
  onClose: () => void;
  /** 创建成功后回调（携带新实例 id） */
  onCreated: (id: InstanceId) => void;
}

export function NewInstanceModal({
  onClose,
  onCreated,
}: NewInstanceModalProps) {
  const { t } = useTranslation();
  const edgeFieldId = useId();
  const pathFieldId = useId();
  const [cwd, setCwd] = useState("");
  const [edges, setEdges] = useState<InstanceCreationEdge[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [loadingEdges, setLoadingEdges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载可用的 Edge 列表
  useEffect(() => {
    authFetch("/api/edges")
      .then((res) => res.json())
      .then((value: unknown) => {
        if (!isInstanceCreationEdgesResponse(value)) {
          throw new Error("Invalid Edge list response");
        }
        const edges = value.edges;
        setEdges(edges);
        if (edges.length > 0) {
          setSelectedEdgeId(edges[0].edgeId);
          const homedir = edges[0].homedir;
          if (homedir) {
            const defaultPath = homedir.endsWith("/") ? homedir : homedir + "/";
            setCwd(defaultPath);
          }
        }
        setLoadingEdges(false);
      })
      .catch(() => {
        setLoadingEdges(false);
        setError(t("newInstance.fetchEdgeError"));
      });
  }, []);

  // Edge 切换时更新默认路径
  const handleEdgeChange = useCallback(
    (edgeId: string) => {
      setSelectedEdgeId(edgeId);
      const edge = edges.find((e) => e.edgeId === edgeId);
      if (edge?.homedir) {
        const defaultPath = edge.homedir.endsWith("/")
          ? edge.homedir
          : edge.homedir + "/";
        setCwd(defaultPath);
      }
    },
    [edges],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = cwd.trim();
    if (!trimmed || submitting) return;
    if (!selectedEdgeId) {
      setError(t("newInstance.noEdgeSelected"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: trimmed, edgeId: selectedEdgeId }),
        signal: AbortSignal.timeout(20_000),
      });
      const data: unknown = await res.json();
      const instanceId =
        isRecord(data) && typeof data.instanceId === "string"
          ? data.instanceId
          : null;
      if (!res.ok || !instanceId) {
        setError(
          (isRecord(data) && typeof data.error === "string"
            ? data.error
            : "") || t("newInstance.requestFailed", { status: res.status }),
        );
        setSubmitting(false);
        return;
      }
      onCreated(instanceId);
    } catch (err) {
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? t("newInstance.requestTimeout")
          : (err instanceof Error ? err.message : "") ||
            t("newInstance.networkError");
      setError(message);
      setSubmitting(false);
    }
  }, [cwd, submitting, selectedEdgeId, onCreated]);

  return (
    <ModalShell
      mobileSheet={false}
      size="form"
      footer={
        <>
          <Button
            onClick={onClose}
            disabled={submitting}
            className="active:bg-[var(--fill-tertiary)]"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!cwd.trim() || !selectedEdgeId}
          >
            {submitting ? t("newInstance.creating") : t("newInstance.create")}
          </Button>
        </>
      }
      title={
        <>
          <FolderPlus size={16} />
          <span>{t("newInstance.title")}</span>
        </>
      }
      onClose={onClose}
    >
      <div className="ui-form-content">
        {/* Edge 选择 */}
        <FormField label={t("newInstance.edgeNode")} htmlFor={edgeFieldId}>
          {loadingEdges ? (
            <StatusMessage compact tone="loading">
              {t("common.loading")}
            </StatusMessage>
          ) : edges.length === 0 ? (
            <StatusMessage compact tone="error">
              {t("newInstance.noEdges")}
            </StatusMessage>
          ) : edges.length === 1 ? (
            <div id={edgeFieldId} className="ui-form-note">
              {edges[0].hostname}
              <span className="text-[var(--label-tertiary)] ml-1.5">
                ({edges[0].edgeId})
              </span>
            </div>
          ) : (
            <SelectField
              id={edgeFieldId}
              value={selectedEdgeId}
              onChange={(e) => handleEdgeChange(e.target.value)}
              disabled={submitting}
            >
              {edges.map((edge) => (
                <option key={edge.edgeId} value={edge.edgeId}>
                  {edge.hostname} ({edge.edgeId})
                </option>
              ))}
            </SelectField>
          )}
        </FormField>

        {/* 工作目录 */}
        <FormField label={t("newInstance.workingDir")} htmlFor={pathFieldId}>
          <PathAutocomplete
            id={pathFieldId}
            value={cwd}
            onChange={setCwd}
            edgeId={selectedEdgeId}
            disabled={submitting || loadingEdges}
            autoFocus={!loadingEdges}
            onSubmit={handleSubmit}
          />
        </FormField>

        {error && (
          <StatusMessage compact tone="error">
            {error}
          </StatusMessage>
        )}
      </div>
    </ModalShell>
  );
}

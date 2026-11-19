// 新建实例弹窗：选择 Edge 并持续浏览工作目录，在指定 Edge 上启动 Pi 实例

import { FolderPlus } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import { DirectoryBrowser } from "./DirectoryBrowser";

// ─── NewInstanceModal ────────────────────────────────────────────────────────

interface NewInstanceModalProps {
  onClose: () => void;
  /** 创建成功后回调（携带新实例 id） */
  onCreated: (id: InstanceId) => void;
}

function getEdgeLabel(edge: InstanceCreationEdge): string {
  return edge.hostname === edge.edgeId
    ? edge.hostname
    : `${edge.hostname} (${edge.edgeId})`;
}

export function NewInstanceModal({
  onClose,
  onCreated,
}: NewInstanceModalProps) {
  const { t } = useTranslation();
  const edgeFieldId = useId();
  const pathFieldId = useId();
  const formScrollRef = useRef<HTMLDivElement>(null);
  const [cwd, setCwd] = useState("");
  const [edges, setEdges] = useState<InstanceCreationEdge[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [loadingEdges, setLoadingEdges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载可用的 Edge 列表
  useEffect(() => {
    const controller = new AbortController();
    authFetch("/api/edges", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch Edge list");
        return res.json();
      })
      .then((value: unknown) => {
        if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
        setLoadingEdges(false);
        setError(t("newInstance.fetchEdgeError"));
      });
    return () => controller.abort();
  }, []);

  // Edge 切换时更新默认路径
  const handleEdgeChange = useCallback(
    (edgeId: string) => {
      setSelectedEdgeId(edgeId);
      setError(null);
      const edge = edges.find((e) => e.edgeId === edgeId);
      setCwd(
        edge?.homedir
          ? edge.homedir.endsWith("/")
            ? edge.homedir
            : edge.homedir + "/"
          : "",
      );
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
  }, [cwd, submitting, selectedEdgeId, onCreated, t]);

  return (
    <ModalShell
      size="form"
      className="instance-create-modal"
      contentLayout="contained"
      dismissible={!submitting}
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
      <div
        ref={formScrollRef}
        className="ui-form-content instance-create-form scrollbar-auto"
      >
        <div className="instance-create-edge">
          <FormField label={t("newInstance.edgeNode")} htmlFor={edgeFieldId}>
            <div className="instance-create-edge-control">
              {loadingEdges ? (
                <StatusMessage compact tone="loading">
                  {t("common.loading")}
                </StatusMessage>
              ) : edges.length === 0 ? (
                <StatusMessage compact tone="error">
                  {t("newInstance.noEdges")}
                </StatusMessage>
              ) : edges.length === 1 ? (
                <div
                  id={edgeFieldId}
                  className="ui-form-note truncate"
                  title={getEdgeLabel(edges[0])}
                >
                  {edges[0].hostname}
                  {edges[0].hostname !== edges[0].edgeId && (
                    <span className="text-[var(--label-tertiary)] ml-1.5">
                      ({edges[0].edgeId})
                    </span>
                  )}
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
                      {getEdgeLabel(edge)}
                    </option>
                  ))}
                </SelectField>
              )}
            </div>
          </FormField>
        </div>

        <DirectoryBrowser
          id={pathFieldId}
          value={cwd}
          onChange={(path) => {
            setCwd(path);
            setError(null);
          }}
          edgeId={selectedEdgeId}
          scrollContainerRef={formScrollRef}
          disabled={submitting || loadingEdges}
          loadingEdge={loadingEdges}
          autoFocus={!loadingEdges && edges.length > 0}
          onSubmit={handleSubmit}
        />

        {error && (
          <StatusMessage compact tone="error">
            {error}
          </StatusMessage>
        )}
      </div>
    </ModalShell>
  );
}

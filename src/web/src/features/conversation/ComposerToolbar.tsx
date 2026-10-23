import type { InstanceInfo, ThinkingLevel } from "@protocol/types";
import { Brain, ChevronRight, Cpu, ImagePlus, Minimize2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AdaptiveToolbar, type AdaptiveToolbarItem } from "../../components/ui/AdaptiveToolbar";
import { Button } from "../../components/ui/Button";
import { MenuItem } from "../../components/ui/MenuItem";
import { ModelOptions, ModelSelector } from "./ModelSelector";
import { ThinkingOptions, ThinkingSelector } from "./ThinkingSelector";

interface ComposerToolbarProps {
  instance: InstanceInfo | undefined;
  showCompactButton: boolean;
  compactDisabled: boolean;
  onSetModel: (provider: string, id: string) => void;
  onSetThinkingLevel: (level: ThinkingLevel) => void;
  onAttachImages: () => void;
  onOpenCompact: () => void;
}

export function ComposerToolbar({ instance, showCompactButton, compactDisabled, onSetModel, onSetThinkingLevel, onAttachImages, onOpenCompact }: ComposerToolbarProps) {
  const { t } = useTranslation();
  const contextUsage = instance?.contextUsage;
  const instanceModel = instance?.model;
  const availableModels = instance?.availableModels;
  const thinkingLevel = instance?.thinkingLevel;
  // 从 availableModels 中查找当前模型的可选思考等级
  const availableThinkingLevels = availableModels?.find(
    (m) => m.provider === instanceModel?.provider && m.id === instanceModel?.id,
  )?.availableThinkingLevels;

  const canCompact =
    showCompactButton &&
    !!contextUsage &&
    !compactDisabled &&
    contextUsage.tokens != null;
  const compactDescription = compactDisabled
    ? t("composer.compactBusy")
    : !showCompactButton || contextUsage?.tokens == null
      ? t("composer.compactUnavailable")
      : t("eventStream.compactContext");

  const toolbarItems = useMemo<AdaptiveToolbarItem[]>(
    () => [
      {
        id: "images",
        priority: 2,
        control: (
          <Button
            size="compact"
            onClick={() => onAttachImages()}
            className="composer-control shrink-0"
            title={t("eventStream.attachImage")}
            aria-label={t("eventStream.attachImage")}
          >
            <ImagePlus size={14} aria-hidden="true" />
            <span>{t("composer.images")}</span>
          </Button>
        ),
        menu: (close) => (
          <MenuItem
            onClick={() => {
              close();
              onAttachImages();
            }}
          >
            <ImagePlus size={16} aria-hidden="true" />
            <span>{t("eventStream.attachImage")}</span>
          </MenuItem>
        ),
      },
      {
        id: "model",
        priority: 3,
        flexible: true,
        minimumLabelWidth: 80,
        pageLabel: t("composer.model"),
        control: instanceModel ? (
          <ModelSelector
            currentModel={instanceModel}
            availableModels={availableModels}
            onSelect={onSetModel}
            className="composer-control"
          />
        ) : (
          <Button size="compact" disabled className="composer-control">
            {t("composer.modelWaiting")}
          </Button>
        ),
        menu: (_close, showPage) => (
          <MenuItem
            disabled={!instanceModel || !availableModels?.length}
            onClick={() => showPage("model")}
          >
            <Cpu size={16} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block">{t("composer.model")}</span>
              <span className="block truncate text-[11px] text-[var(--label-secondary)]">
                {instanceModel?.name ||
                  instanceModel?.id ||
                  t("composer.modelWaiting")}
              </span>
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </MenuItem>
        ),
        page: (close) =>
          instanceModel && (
            <ModelOptions
              currentModel={instanceModel}
              availableModels={availableModels}
              onSelect={onSetModel}
              onDone={close}
            />
          ),
      },
      {
        id: "thinking",
        priority: 1,
        pageLabel: t("composer.thinkingLevel"),
        control: (
          <ThinkingSelector
            currentLevel={thinkingLevel}
            pending={!instance}
            availableLevels={availableThinkingLevels ?? []}
            onSelect={onSetThinkingLevel}
            showLabel
            className="composer-control"
          />
        ),
        menu: (_close, showPage) => (
          <MenuItem
            disabled={thinkingLevel == null}
            onClick={() => showPage("thinking")}
          >
            <Brain size={16} aria-hidden="true" />
            <span className="flex-1">{t("composer.thinkingLabel")}</span>
            <span className="text-[11px] text-[var(--label-secondary)]">
              {thinkingLevel ??
                t(
                  !instance
                    ? "composer.pendingThinking"
                    : "composer.unsupportedThinking",
                )}
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </MenuItem>
        ),
        page: (close) =>
          thinkingLevel != null && (
            <ThinkingOptions
              currentLevel={thinkingLevel}
              availableLevels={availableThinkingLevels ?? []}
              onSelect={onSetThinkingLevel}
              onDone={close}
            />
          ),
      },
      {
        id: "compact",
        priority: 0,
        control: (
          <Button
            size="compact"
            disabled={!canCompact}
            aria-label={t("eventStream.compactContext")}
            title={compactDescription}
            onClick={() => onOpenCompact()}
            className="composer-control shrink-0"
          >
            <Minimize2 size={14} aria-hidden="true" />
            <span>{t("composer.compact")}</span>
          </Button>
        ),
        menu: (close) => (
          <MenuItem
            disabled={!canCompact}
            title={compactDescription}
            onClick={() => {
              close();
              onOpenCompact();
            }}
          >
            <Minimize2 size={16} aria-hidden="true" />
            <span>{t("eventStream.compactContext")}</span>
          </MenuItem>
        ),
      },
    ],
    [
      t,
      instanceModel,
      availableModels,
      thinkingLevel,
      instance,
      availableThinkingLevels,
      onSetModel,
      onSetThinkingLevel,
      canCompact,
      compactDescription,
      onAttachImages,
      onOpenCompact,
    ],
  );

  return <AdaptiveToolbar items={toolbarItems} />;
}

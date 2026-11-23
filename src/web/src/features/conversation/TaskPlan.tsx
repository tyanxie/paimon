import { ArrowRight, ChevronRight, Circle, CircleCheck } from "lucide-react";
import { LazyMotion, domAnimation } from "motion/react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "../../../../protocol/types";
import { Collapsible } from "../../components/ui/Collapsible";
import { isRecord } from "../../utils/typeGuards";

/** 当前计划仅消费服务端快照，不读取工具历史 */
export function TaskPlan({ tasks }: { tasks: unknown }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const currentTasks = useMemo(() => readTasks(tasks), [tasks]);
  if (currentTasks.length === 0) return null;

  const complete = currentTasks.filter(
    (task) => task.status === "complete",
  ).length;
  const activeTasks = currentTasks.filter(
    (task) => task.status === "in_progress",
  );
  const current = activeTasks[0];
  const allComplete = complete === currentTasks.length;
  const singleActive = activeTasks.length === 1;
  const summary =
    activeTasks.length > 1
      ? t("taskPlan.multipleActive")
      : (current?.name ??
        t(allComplete ? "taskPlan.finished" : "taskPlan.remaining"));
  const progress = t("taskPlan.progress", {
    complete,
    total: currentTasks.length,
  });

  return (
    <section className="composer-task-plan" aria-label={t("taskPlan.title")}>
      <button
        type="button"
        className="composer-task-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={`${t(expanded ? "taskPlan.collapse" : "taskPlan.expand")}: ${summary}${singleActive ? `, ${t("taskPlan.in_progress")}` : ""}, ${progress}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <TaskCompletionRing complete={complete} total={currentTasks.length} />
        <span
          className="composer-task-current"
          data-summary={!singleActive || undefined}
          title={summary}
        >
          {singleActive && <ArrowRight size={14} aria-hidden="true" />}
          <span>{summary}</span>
        </span>
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={expanded ? "rotate-90" : undefined}
        />
      </button>
      <LazyMotion features={domAnimation} strict>
        <Collapsible id={listId} expanded={expanded}>
          <div className="composer-task-details scrollbar-auto">
            <ol className="composer-task-list">
              {currentTasks.map((task, index) => {
                const Icon =
                  task.status === "complete"
                    ? CircleCheck
                    : task.status === "in_progress"
                      ? ArrowRight
                      : Circle;
                const label = t(`taskPlan.${task.status}`);
                return (
                  <li
                    key={index}
                    className="composer-task-item"
                    data-task-status={task.status}
                  >
                    <span role="img" aria-label={label} title={label}>
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span>{task.name}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </Collapsible>
      </LazyMotion>
    </section>
  );
}

/** 圆环只表示完成项比例，不表示执行活动或剩余时间 */
function TaskCompletionRing({
  complete,
  total,
}: {
  complete: number;
  total: number;
}) {
  const { t } = useTranslation();
  const count = `${complete}/${total}`;
  const size = 20;
  const radius = size / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className="composer-task-ring"
      role="img"
      aria-label={t("taskPlan.progress", { complete, total })}
      title={t("taskPlan.progress", { complete, total })}
      data-complete={complete === total || undefined}
    >
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="composer-task-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        {complete > 0 && (
          <circle
            className="composer-task-ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - complete / total)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {complete === total && (
          <path className="composer-task-ring-check" d="m7 10 2 2 4-4" />
        )}
      </svg>
      <span aria-hidden="true">{count}</span>
    </span>
  );
}

/** WebSocket 数据在展示入口校验，避免无效步骤产生错误进度 */
function readTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  const tasks: Task[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.name !== "string" ||
      (item.status !== "pending" &&
        item.status !== "in_progress" &&
        item.status !== "complete")
    )
      return [];
    tasks.push({ name: item.name, status: item.status });
  }
  return tasks;
}

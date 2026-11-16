import type { InstanceId, InstanceInfo } from "@protocol/types";

export function groupInstancesByEdge(instances: InstanceInfo[]) {
  const groups = new Map<string, InstanceInfo[]>();
  for (const instance of instances) {
    const group = groups.get(instance.edgeId);
    if (group) group.push(instance);
    else groups.set(instance.edgeId, [instance]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function getAdjacentInstanceId(
  instances: InstanceInfo[],
  currentId: InstanceId,
  offset: -1 | 1,
  collapsedEdges: Record<string, boolean>,
): InstanceId | undefined {
  const ordered = groupInstancesByEdge(instances).flatMap(([, group]) => group);
  const currentIndex = ordered.findIndex(
    (instance) => instance.id === currentId,
  );
  if (currentIndex === -1) return;

  // 当前实例也可能位于折叠组内，仍从它在完整列表中的位置向前或向后查找
  for (
    let index = currentIndex + offset;
    index >= 0 && index < ordered.length;
    index += offset
  ) {
    const instance = ordered[index];
    if (!collapsedEdges[instance.edgeId]) return instance.id;
  }
}

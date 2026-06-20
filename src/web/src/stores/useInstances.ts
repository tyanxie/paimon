// 实例列表状态管理

import { useState, useRef } from "react";
import type {
  InstanceInfo,
  InstanceStatus,
  InstanceId,
} from "../../../protocol/types";

export function useInstances() {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  // 标记是否已收到过 instance_list（避免初始化阶段误判实例不存在）
  const [instanceListReady, setInstanceListReady] = useState(false);

  // 跟踪每个实例的 sessionId，用于检测变化
  const sessionIdMapRef = useRef<Map<InstanceId, string | undefined>>(
    new Map(),
  );
  // 跟踪每个实例的 status，用于检测 compacting → 非 compacting 转换
  const statusMapRef = useRef<Map<InstanceId, InstanceStatus>>(new Map());

  return {
    instances,
    setInstances,
    instanceListReady,
    setInstanceListReady,
    sessionIdMapRef,
    statusMapRef,
  };
}

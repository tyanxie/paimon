// 消息转发：将 Browser / HTTP 请求转发给指定 pi 实例
//
// 三层结构：
// - forwardToInstance：核心，协议无关，仅负责查实例并转发，返回是否送达
// - forwardToInstanceForWs：WS 语境包装，失败时回 browser INSTANCE_NOT_FOUND error
// - forwardToInstanceForHttp：HTTP 语境包装，失败时返回 404 Response
//
// 注意：三个函数的转发目标恒为 pi 实例（extension），函数名中的 Ws / Http
// 指的是「调用语境 / 失败时的回复通道」，不是转发的目标。

import type { ServerWebSocket } from "bun";
import type { WsData } from "./registry";
import type {
  InstanceId,
  HubToExtensionMessage,
  HubErrorMessage,
} from "../protocol/types";
import { registry } from "./registry";

/** 转发消息给实例，返回实例是否存在（已送达） */
export function forwardToInstance(
  instanceId: InstanceId,
  message: HubToExtensionMessage,
): boolean {
  const instanceWs = registry.getInstanceWs(instanceId);
  if (!instanceWs) return false;
  instanceWs.send(JSON.stringify(message));
  return true;
}

/** WS 语境：转发给实例，失败则回 browser INSTANCE_NOT_FOUND error */
export function forwardToInstanceForWs(
  browserWs: ServerWebSocket<WsData>,
  instanceId: InstanceId,
  message: HubToExtensionMessage,
): void {
  if (forwardToInstance(instanceId, message)) return;
  browserWs.send(
    JSON.stringify({
      type: "error",
      payload: {
        message: `Instance ${instanceId} not found`,
        code: "INSTANCE_NOT_FOUND",
      },
    } satisfies HubErrorMessage),
  );
}

/** HTTP 语境：转发给实例，成功返回 null，失败返回 404 Response */
export function forwardToInstanceForHttp(
  instanceId: InstanceId,
  message: HubToExtensionMessage,
): Response | null {
  if (forwardToInstance(instanceId, message)) return null;
  return Response.json(
    { error: `Instance ${instanceId} not found` },
    { status: 404 },
  );
}

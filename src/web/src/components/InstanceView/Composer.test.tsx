import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { InstanceInfo, InstanceStatus } from "../../../../protocol/types";
import "../../i18n";
import { Composer } from "./Composer";
import { getComposerButtonMode } from "./utils";

function markup(status: InstanceStatus) {
  const instance: InstanceInfo = {
    id: "instance",
    edgeId: "edge",
    hostname: "host",
    cwd: "/project",
    homedir: "/home/user",
    model: { provider: "provider", id: "model" },
    pid: 1,
    status,
    connectedAt: 0,
    lastHeartbeat: 0,
    contextUsage: { tokens: 100, contextWindow: 1000, percent: 10 },
  };
  const noop = () => {};
  return renderToStaticMarkup(
    <Composer
      instance={instance}
      draft={{ text: "hello", images: [] }}
      onDraftChange={noop}
      onSendMessage={noop}
      onAbort={noop}
      onSetModel={noop}
      onSetThinkingLevel={noop}
      onCompact={noop}
      buttonMode={getComposerButtonMode(status)}
      showCompactButton
      compactDisabled={status !== "idle"}
      onImageLightbox={noop}
      startBottomFollow={noop}
    />,
  );
}

describe("Composer 操作与上下文", () => {
  for (const status of ["idle", "streaming", "compacting"] as const) {
    test(`${status} 状态保留上下文用量与发送或停止操作`, () => {
      const html = markup(status);
      expect(html).toContain("100 / 1.0k (10%)");
      expect(html).toContain(
        status === "idle" ? 'title="发送"' : 'title="停止"',
      );
      expect(html).not.toContain('role="status"');
    });
  }

  test("运行中保留停止操作", () => {
    expect(getComposerButtonMode("streaming")).toBe("stop");
  });
  test("压缩中保留停止操作", () => {
    expect(getComposerButtonMode("compacting")).toBe("stop");
  });
});

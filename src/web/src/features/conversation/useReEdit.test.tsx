import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "../../i18n";
import { useDrafts } from "../../stores/useDrafts";
import type { SessionEntry } from "./types";
import { useReEdit } from "./useReEdit";

let root: Root;
let container: HTMLDivElement;
let reEdit: (() => void) | undefined;
let completed: number;
const originalDrafts = useDrafts.getState().drafts;

function Probe({ content }: { content: unknown }) {
  const entries: SessionEntry[] = [
    { type: "message", id: "user", message: { role: "user", content } },
    {
      type: "message",
      id: "assistant",
      message: { role: "assistant", content: [], stopReason: "aborted" },
    },
  ];
  reEdit = useReEdit("one", entries, "idle", () => completed++);
  return null;
}

beforeEach(() => {
  completed = 0;
  useDrafts.setState({ drafts: new Map() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useDrafts.setState({ drafts: originalDrafts });
});

describe("重新编辑内容识别", () => {
  test("文字与图片保留内容和 MIME type，未知内容保持兼容", async () => {
    await act(async () =>
      root.render(
        <Probe
          content={[
            { type: "text", text: "first" },
            { type: "image", data: "base64", mimeType: "image/png" },
            { type: "text", text: "second" },
            null,
            { type: "future_block", extra: true },
            { type: "text", text: 1 },
            { type: "image", data: 1, mimeType: "image/png" },
          ]}
        />,
      ),
    );
    expect(reEdit).toBeFunction();
    await act(async () => reEdit?.());
    const draft = useDrafts.getState().drafts.get("one");
    expect(draft?.text).toBe("firstsecond");
    expect(draft?.images).toHaveLength(1);
    expect(draft?.images[0]?.data).toBe("base64");
    expect(draft?.images[0]?.mimeType).toBe("image/png");
    expect(draft?.images[0]?.previewUrl).toBe("data:image/png;base64,base64");
    expect(completed).toBe(1);
  });

  test("字符串正文直接回填", async () => {
    await act(async () => root.render(<Probe content="question" />));
    await act(async () => reEdit?.());
    expect(useDrafts.getState().drafts.get("one")?.text).toBe("question");
  });
});

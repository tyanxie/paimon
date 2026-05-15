import { beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let ComposerStatusIndicator: (props: {
  status?: "idle" | "streaming";
}) => React.ReactNode;
let getComposerButtonMode: (args: {
  instanceStatus?: "idle" | "streaming";
  inputValue: string;
}) => "send" | "stop";

beforeAll(async () => {
  const storage = new Map<string, string>();

  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
    window: {
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    },
    document: {
      documentElement: {
        setAttribute: () => undefined,
      },
    },
  });

  ({ ComposerStatusIndicator, getComposerButtonMode } = await import("./EventStream"));
});

describe("ComposerStatusIndicator", () => {
  test("renders online state without running animation", () => {
    const markup = renderToStaticMarkup(
      <ComposerStatusIndicator status="idle" />,
    );

    expect(markup).toContain("在线");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("bg-green-500/10");
    expect(markup).toContain("bg-green-500");
    expect(markup).toContain("text-green-500");
    expect(markup).not.toContain("animate-pulse");
  });

  test("renders running state with accent pulse", () => {
    const markup = renderToStaticMarkup(
      <ComposerStatusIndicator status="streaming" />,
    );

    expect(markup).toContain("执行中");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]");
    expect(markup).toContain("bg-[var(--color-accent)]");
    expect(markup).toContain("text-[var(--color-accent)]");
    expect(markup).toContain("animate-pulse");
  });

  test("keeps stop action visible while streaming with a draft", () => {
    expect(
      getComposerButtonMode({
        instanceStatus: "streaming",
        inputValue: "queued draft",
      }),
    ).toBe("stop");
  });
});

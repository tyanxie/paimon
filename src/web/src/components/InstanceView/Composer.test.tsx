import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { InstanceStatus } from "../../../../protocol/types";
import "../../i18n";
import { ComposerStatusIndicator } from "./Composer";
import { getComposerButtonMode } from "./utils";

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
    expect(markup).toContain(
      "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]",
    );
    expect(markup).toContain("bg-[var(--color-accent)]");
    expect(markup).toContain("text-[var(--color-accent)]");
    expect(markup).toContain("animate-pulse");
  });

  test("renders compacting state with amber pulse", () => {
    const markup = renderToStaticMarkup(
      <ComposerStatusIndicator status="compacting" />,
    );

    expect(markup).toContain("压缩中");
    expect(markup).toContain("bg-amber-500/10");
    expect(markup).toContain("bg-amber-500");
    expect(markup).toContain("text-amber-500");
    expect(markup).toContain("animate-pulse");
  });

  test("keeps stop action visible while streaming with a draft", () => {
    expect(getComposerButtonMode("streaming")).toBe("stop");
  });

  test("shows send button during compacting", () => {
    expect(getComposerButtonMode("compacting")).toBe("send");
  });
});

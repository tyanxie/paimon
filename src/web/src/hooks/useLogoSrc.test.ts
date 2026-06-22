import { describe, expect, test } from "bun:test";
import { getLogoSrc } from "./useLogoSrc";

describe("logo 资源路径", () => {
  test("根据背景预设和实际主题返回分层 logo 路径", () => {
    expect(getLogoSrc("aurora", "dark")).toBe(
      "/logos/aurora/dark/paimon-logo.png",
    );
  });

  test("缺少背景或主题时回退到 mist/light logo", () => {
    expect(getLogoSrc(undefined, "dark")).toBe(
      "/logos/mist/light/paimon-logo.png",
    );
    expect(getLogoSrc("ember", undefined)).toBe(
      "/logos/mist/light/paimon-logo.png",
    );
  });
});

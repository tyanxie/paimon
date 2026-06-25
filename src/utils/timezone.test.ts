// timezone.ts 单元测试

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initTimezone, isValidTimezone } from "./timezone";
import { timestamp } from "./logger";

describe("isValidTimezone", () => {
  it("识别常见 IANA 时区名", () => {
    expect(isValidTimezone("Asia/Shanghai")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
  });

  it("识别 UTC 变体", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Etc/UTC")).toBe(true);
  });

  it("拒绝不存在的时区", () => {
    expect(isValidTimezone("Fake/Zone")).toBe(false);
    expect(isValidTimezone("Invalid")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("initTimezone", () => {
  let originalTZ: string | undefined;

  beforeEach(() => {
    originalTZ = process.env.TZ;
  });

  afterEach(() => {
    if (originalTZ !== undefined) {
      process.env.TZ = originalTZ;
    } else {
      delete process.env.TZ;
    }
  });

  it("已设置 TZ 时不覆盖", () => {
    process.env.TZ = "America/New_York";
    initTimezone();
    expect(process.env.TZ).toBe("America/New_York");
  });

  it("未设置 TZ 时尝试探测并设置", () => {
    delete process.env.TZ;
    initTimezone();
    // 在 CI/本地环境中，只要系统有时区配置就应该能探测到
    // 如果探测成功，TZ 应该是一个有效的 IANA 时区名
    if (process.env.TZ) {
      expect(isValidTimezone(process.env.TZ)).toBe(true);
    }
  });
});

describe("timestamp", () => {
  it("输出格式匹配 YYYY-MM-DD HH:mm:ss.SSS", () => {
    const ts = timestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("多次调用格式一致", () => {
    const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
    for (let i = 0; i < 5; i++) {
      expect(timestamp()).toMatch(pattern);
    }
  });
});

// preprocessFrontmatter 单元测试
import { describe, it, expect } from "bun:test";
import { preprocessFrontmatter } from "./Markdown";

describe("preprocessFrontmatter", () => {
  it("合法 YAML front matter → 保持原样", () => {
    const input = "---\ntitle: Hello\ndate: 2024-01-01\n---\n\n# Content";
    expect(preprocessFrontmatter(input)).toBe(input);
  });

  it("开头 --- 后面是 markdown 内容（非 YAML object）→ 替换为 ***", () => {
    const input =
      "---\n\n## 方案分析\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n\n**总结**";
    const result = preprocessFrontmatter(input);
    expect(result).toStartWith("***");
    expect(result).not.toStartWith("---");
    // 后续内容保持不变
    expect(result.slice(3)).toBe(input.slice(3));
  });

  it("不以 --- 开头的内容 → 不做任何处理", () => {
    const input = "# Hello\n\n---\n\nWorld";
    expect(preprocessFrontmatter(input)).toBe(input);
  });

  it("只有开头 --- 没有闭合 --- → 不做处理", () => {
    const input = "---\nsome content without closing fence";
    expect(preprocessFrontmatter(input)).toBe(input);
  });

  it("YAML 解析为纯字符串（非 object）→ 替换为 ***", () => {
    const input = "---\nhello world\n---\n\ncontent";
    const result = preprocessFrontmatter(input);
    expect(result).toStartWith("***");
  });

  it("YAML 解析为数组 → 替换为 ***", () => {
    const input = "---\n- item1\n- item2\n---\n\ncontent";
    const result = preprocessFrontmatter(input);
    expect(result).toStartWith("***");
  });

  it("YAML 解析为空对象 → 替换为 ***", () => {
    const input = "---\n{}\n---\n\ncontent";
    const result = preprocessFrontmatter(input);
    expect(result).toStartWith("***");
  });

  it("复杂合法 front matter（嵌套对象）→ 保持原样", () => {
    const input =
      "---\ntitle: Test\ntags:\n  - a\n  - b\nauthor:\n  name: John\n---\n\n# Doc";
    expect(preprocessFrontmatter(input)).toBe(input);
  });

  it("开头 --- 后紧跟空行再跟内容（用户场景复现）→ 替换为 ***", () => {
    // 这就是用户遇到的典型场景
    const input = "---\n\n## 标题\n\n正文内容\n\n---\n\n结尾";
    const result = preprocessFrontmatter(input);
    expect(result).toStartWith("***");
    expect(result).toContain("## 标题");
    expect(result).toContain("结尾");
  });
});

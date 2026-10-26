import { describe, expect, test } from "bun:test";
import { generateReleaseNotes, parseCommit } from "./generate-release-notes";

const hash = "1234567890abcdef";

function render(message: string): string {
  return generateReleaseNotes([parseCommit(hash, message)], "v1.7.0", "v2.0.0");
}

describe("Release Notes", () => {
  test("普通提交保留分类、scope、PR 和提交引用", () => {
    const output = render("feat(web): 支持图表 (#51)\n\n功能说明。");
    expect(output).toContain("## ✨ 新功能");
    expect(output).toContain("**web:** 支持图表");
    expect(output).toContain("pull/51");
    expect(output).toContain("[`1234567`]");
    expect(output).toContain("v1.7.0...v2.0.0");
    expect(output).not.toContain("升级要求");
    expect(output).not.toContain("功能说明");
  });

  test("带 scope 和 ! 的提交同时展示功能与升级要求", () => {
    const output = render(
      "feat(notification)!: 使用 agent_settled 触发完成通知 (#48)\n\nBREAKING CHANGE: 要求 Pi >= 1.1.0，各层 Paimon 需同时更新以支持任务完成通知。",
    );
    expect(output).toContain("## 升级要求");
    expect(output).toContain(
      "要求 Pi >= 1.1.0，各层 Paimon 需同时更新以支持任务完成通知。",
    );
    expect(output).toContain(
      "**notification:** 使用 agent_settled 触发完成通知",
    );
    expect(output).toContain("pull/48");
    expect(output.indexOf("升级要求")).toBeLessThan(output.indexOf("新功能"));
  });

  test("没有 scope 的 ! 提交使用标题生成升级要求", () => {
    const output = render("feat!: 更新通信协议 (#60)");
    expect(output).toContain("## 升级要求");
    expect(output).toContain("## ✨ 新功能");
    expect(output).toContain("- 更新通信协议");
  });

  test("没有 ! 的提交也提取多行 BREAKING CHANGE，保留条目缩进", () => {
    const output = render(
      "fix(hub): 更新认证\n\n正文说明。\n\nBREAKING CHANGE: 更新 Access Token。\n重新启动 Hub。\n\nRefs: #42",
    );
    expect(output).toContain("- 更新 Access Token。\n  重新启动 Hub。");
    expect(output).toContain("## 🐛 修复");
    expect(output).not.toContain("正文说明");
    expect(output).not.toContain("Refs:");
  });

  test("未展示分类的提交仍然提供 BREAKING-CHANGE 升级说明", () => {
    const output = render(
      "chore: 更新配置\n\nBREAKING-CHANGE: 使用新版配置格式。",
    );
    expect(output).toContain("## 升级要求");
    expect(output).toContain("- 使用新版配置格式。");
  });

  test("普通非 conventional commit 保持过滤", () => {
    const output = render("Release version 2.0.0");
    expect(output).not.toContain("Release version");
    expect(output).not.toContain("升级要求");
    expect(output).toContain("Full Changelog");
  });
});

#!/usr/bin/env bun

/**
 * 从 git log 生成 release notes
 *
 * 用法：
 *   bun run scripts/generate-release-notes.ts          # 从上一个 tag 到 HEAD
 *   bun run scripts/generate-release-notes.ts v1.0.4   # 从指定 tag 到 HEAD
 *   bun run scripts/generate-release-notes.ts v1.0.4 v1.1.0  # 指定范围
 */

import { CommitParser } from "conventional-commits-parser";

const REPO = "tyanxie/paimon";
const parser = new CommitParser({
  headerPattern: /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/,
  breakingHeaderPattern: /^(\w+)(?:\(([^)]+)\))?!:\s*(.+)$/,
});

interface Commit {
  hash: string;
  type: string;
  scope: string;
  subject: string;
  pr: string;
  breakingChanges: string[];
}

export function parseCommit(hash: string, message: string): Commit {
  const parsed = parser.parse(message);
  const subject = parsed.subject || parsed.header || "";
  const prMatch = subject.match(/\(#(\d+)\)\s*$/);
  const pr = prMatch ? prMatch[1] : "";

  return {
    hash,
    type: parsed.type || "other",
    scope: parsed.scope || "",
    subject: pr ? subject.replace(/\s*\(#\d+\)\s*$/, "") : subject,
    pr,
    breakingChanges: parsed.notes.map((note) => note.text),
  };
}

// 分类配置：type → { emoji, title }
const CATEGORIES: Record<string, { emoji: string; title: string }> = {
  feat: { emoji: "✨", title: "新功能" },
  fix: { emoji: "🐛", title: "修复" },
  refactor: { emoji: "♻️", title: "重构" },
  perf: { emoji: "⚡", title: "性能优化" },
  ci: { emoji: "🔧", title: "CI" },
};

function main(): void {
  // 解析命令行参数
  const args = process.argv.slice(2);
  let fromTag = args[0] || "";
  let toRef = args[1] || "HEAD";

  // 如果未指定 toRef，尝试获取 HEAD 精确对应的 tag
  if (toRef === "HEAD") {
    const exactTag = Bun.spawnSync([
      "git",
      "describe",
      "--tags",
      "--exact-match",
      "HEAD",
    ]);
    if (exactTag.exitCode === 0) {
      toRef = exactTag.stdout.toString().trim();
    }
  }

  if (!fromTag) {
    // 获取最近的 tag
    const result = Bun.spawnSync([
      "git",
      "describe",
      "--tags",
      "--abbrev=0",
      `${toRef}^`,
    ]);
    if (result.exitCode !== 0) {
      console.error(
        `Error: git describe failed: ${result.stderr.toString().trim()}`,
      );
      process.exit(1);
    }
    fromTag = result.stdout.toString().trim();
    if (!fromTag) {
      console.error("Error: no previous tag found");
      process.exit(1);
    }
  }

  // 按时间顺序读取完整提交信息，字段和记录使用 NUL 分隔
  const range = `${fromTag}..${toRef}`;
  const logResult = Bun.spawnSync([
    "git",
    "log",
    range,
    "--pretty=format:%H%x00%B%x00",
    "--no-merges",
    "--reverse",
  ]);
  if (logResult.exitCode !== 0) {
    console.error(
      `Error: git log failed: ${logResult.stderr.toString().trim()}`,
    );
    process.exit(1);
  }
  const rawLog = logResult.stdout.toString().trim();

  if (!rawLog) {
    console.error(`Error: no commits found in range ${range}`);
    process.exit(1);
  }

  const fields = rawLog.split("\0");
  const commits: Commit[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    commits.push(parseCommit(fields[index].trim(), fields[index + 1]));
  }
  console.log(generateReleaseNotes(commits, fromTag, toRef));
}

export function generateReleaseNotes(
  commits: Commit[],
  fromTag: string,
  toRef: string,
): string {
  // 按类型分组
  const grouped: Record<string, Commit[]> = {};
  for (const commit of commits) {
    if (!(commit.type in CATEGORIES)) continue;
    if (!grouped[commit.type]) grouped[commit.type] = [];
    grouped[commit.type].push(commit);
  }

  // 生成 markdown
  const lines: string[] = [];
  const breakingCommits = commits.filter(
    (commit) => commit.breakingChanges.length > 0,
  );
  if (breakingCommits.length > 0) {
    lines.push("## 升级要求\n");
    for (const commit of breakingCommits) {
      for (const note of commit.breakingChanges) {
        lines.push(`- ${note.trim().replace(/\n/g, "\n  ")}`);
      }
    }
    lines.push("");
  }

  for (const [type, { emoji, title }] of Object.entries(CATEGORIES)) {
    const items = grouped[type];
    if (!items || items.length === 0) continue;

    lines.push(`## ${emoji} ${title}\n`);

    for (const commit of items) {
      const shortHash = commit.hash.slice(0, 7);
      const hashLink = `[\`${shortHash}\`](https://github.com/${REPO}/commit/${commit.hash})`;
      const scopeStr = commit.scope ? `**${commit.scope}:** ` : "";
      const prLink = commit.pr
        ? ` ([#${commit.pr}](https://github.com/${REPO}/pull/${commit.pr}))`
        : "";

      lines.push(`- ${scopeStr}${commit.subject}${prLink} ${hashLink}`);
    }

    lines.push("");
  }

  // 添加 full changelog 链接
  lines.push(
    `**Full Changelog**: [\`${fromTag}...${toRef}\`](https://github.com/${REPO}/compare/${fromTag}...${toRef})`,
  );

  return lines.join("\n");
}

if (import.meta.main) main();

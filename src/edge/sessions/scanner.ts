import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { SessionSummary } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : undefined;
  } catch {
    // 正在写入的尾行和无法解析的历史条目不参与摘要
    return undefined;
  }
}

function readText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        isRecord(block) &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join(" ");
}

export async function scanSessionFile(
  path: string,
): Promise<SessionSummary | null> {
  try {
    const input = createReadStream(path, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Infinity });
    let header: Record<string, unknown> | undefined;
    let name: string | undefined;
    let messageCount = 0;
    let firstMessage = "";
    let lastActivityTime = 0;
    try {
      for await (const line of lines) {
        const entry = parseEntry(line);
        if (!entry) continue;
        if (!header) {
          if (
            entry.type !== "session" ||
            typeof entry.id !== "string" ||
            typeof entry.timestamp !== "string"
          )
            return null;
          header = entry;
          continue;
        }
        if (entry.type === "session_info") {
          name =
            typeof entry.name === "string"
              ? entry.name.trim() || undefined
              : undefined;
        }
        if (entry.type !== "message") continue;
        messageCount++;
        const message = entry.message;
        if (
          !isRecord(message) ||
          !("content" in message) ||
          (message.role !== "user" && message.role !== "assistant")
        )
          continue;
        const timestamp =
          typeof message.timestamp === "number"
            ? message.timestamp
            : typeof entry.timestamp === "string"
              ? Date.parse(entry.timestamp)
              : NaN;
        if (Number.isFinite(timestamp))
          lastActivityTime = Math.max(lastActivityTime, timestamp);
        if (!firstMessage && message.role === "user") {
          firstMessage = readText(message.content).slice(0, 100);
        }
      }
    } finally {
      lines.close();
      input.destroy();
    }
    if (
      !header ||
      typeof header.id !== "string" ||
      typeof header.timestamp !== "string"
    )
      return null;
    const created = Date.parse(header.timestamp);
    if (!Number.isFinite(created)) return null;
    return {
      path,
      id: header.id,
      name,
      cwd: typeof header.cwd === "string" ? header.cwd : "",
      created: new Date(created).toISOString(),
      modified: new Date(
        lastActivityTime > 0 ? lastActivityTime : created,
      ).toISOString(),
      messageCount,
      firstMessage: firstMessage || "(no messages)",
    };
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

interface DirectoryScanResult {
  sessions: SessionSummary[];
  failedPaths: string[];
}

export async function scanSessionDirectory(
  directory: string,
  onError: (path: string, error: unknown) => void,
): Promise<DirectoryScanResult> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT")
      return { sessions: [], failedPaths: [] };
    throw error;
  }
  const paths = entries
    .filter((entry) => entry.endsWith(".jsonl"))
    .sort((a, b) => b.localeCompare(a));
  const results: (SessionSummary | null)[] = new Array(paths.length);
  const failedPaths: string[] = [];
  let next = 0;
  // 限制同时打开的文件数量，避免目录扫描占满文件句柄
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(10, paths.length) }, async () => {
      while (next < paths.length) {
        const index = next++;
        const path = join(directory, paths[index]);
        try {
          results[index] = await scanSessionFile(path);
        } catch (error) {
          results[index] = null;
          failedPaths.push(path);
          onError(path, error);
        }
      }
    }),
  );
  for (const worker of workers) {
    if (worker.status === "rejected") throw worker.reason;
  }
  return {
    sessions: results.filter(
      (session): session is SessionSummary => session !== null,
    ),
    failedPaths,
  };
}

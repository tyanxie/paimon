/** 从 args 中提取摘要信息 */
export function getToolSummary(name: string, args: Record<string, any>): string {
  switch (name) {
    case "read": {
      const path = args.path ?? "";
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      if (offset != null || limit != null) {
        const start = offset ?? "";
        const end = limit != null ? (offset ?? 1) + limit - 1 : "";
        return `${path} [${start}:${end}]`;
      }
      return path;
    }
    case "bash":
      return args.command ? String(args.command).slice(0, 80) : "";
    case "edit":
      return args.path ?? "";
    case "write":
      return args.path ?? "";
    default:
      return "";
  }
}

/** 构造动态长度的 fenced code block，避免内容中的 ``` 导致解析异常 */
export function wrapInFence(content: string, language: string): string {
  // 找到内容中最长的连续 backtick 序列长度
  let maxBackticks = 0;
  const regex = /`+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[0].length > maxBackticks) maxBackticks = match[0].length;
  }
  // 外层 fence 至少比内容中最长的多 1 个，且至少 3 个
  const fence = "`".repeat(Math.max(3, maxBackticks + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

/** 文件扩展名到 highlight.js 语言的映射 */
const extToLanguage: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  mdx: "markdown",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
  lua: "lua",
  vim: "vim",
  diff: "diff",
  patch: "diff",
};

/** 从文件路径提取语言 */
export function getLanguageFromPath(path: string): string | undefined {
  const filename = path.split("/").pop() ?? "";
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile" || lower === "gnumakefile") return "makefile";
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return extToLanguage[ext];
}

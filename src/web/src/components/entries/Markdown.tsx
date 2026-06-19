// Markdown 渲染器：react-markdown + macOS 26 样式覆盖

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import rehypeHighlight from "rehype-highlight";
import yaml from "js-yaml";
import { useState, useCallback } from "react";
import type { Components } from "react-markdown";
import { Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * 自定义 remark 插件：将 remark-frontmatter 解析出的 yaml 节点
 * 转为带特殊语言标记的 code 节点，使其能通过 remark-rehype 传递到组件层
 */
function remarkFrontmatterToCode() {
  return (tree: any) => {
    if (tree.children[0]?.type === "yaml") {
      tree.children[0] = {
        type: "code",
        lang: "__frontmatter__",
        value: tree.children[0].value,
      };
    }
  };
}

/** Frontmatter 元数据表格：key 左列，value 右列 */
function FrontmatterBlock({ yamlText }: { yamlText: string }) {
  // 解析 YAML 为 key-value 对
  let entries: [string, string][] = [];
  try {
    const parsed = yaml.load(yamlText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      entries = Object.entries(parsed as Record<string, unknown>).map(
        ([key, value]) => {
          // 值转为可读字符串
          const display =
            typeof value === "string" ? value : JSON.stringify(value, null, 2);
          return [key, display];
        },
      );
    }
  } catch {
    // YAML 解析失败时回退为原始文本展示
    entries = [["raw", yamlText]];
  }

  if (entries.length === 0) return null;

  return (
    <div className="my-2 rounded-[8px] border border-[var(--separator)] overflow-hidden">
      <table className="w-full text-[13px]">
        <tbody>
          {entries.map(([key, value]) => (
            <tr
              key={key}
              className="border-b last:border-b-0 border-[var(--separator)]"
            >
              <td className="px-3 py-1.5 bg-[var(--fill-quaternary)] text-[var(--label-secondary)] font-medium whitespace-nowrap align-top w-[1%]">
                {key}
              </td>
              <td className="px-3 py-1.5 text-[var(--label-primary)] whitespace-pre-wrap break-all">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 从 React children 中递归提取纯文本 */
function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node as React.ReactElement<any>).props.children);
  }
  return "";
}

/** 代码块：带语法高亮 + 复制按钮 */
function CodeBlock({
  language,
  children,
}: {
  language: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const code = extractText(children).replace(/\n$/, "");
  const { t } = useTranslation();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="group/code relative my-2 rounded-[8px] bg-[var(--fill-card)] border border-[var(--separator)] overflow-hidden">
      {/* 语言标签 + 复制按钮 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--separator)]">
        <span className="text-[11px] text-[var(--label-tertiary)] font-medium">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-[var(--label-tertiary)] hover:text-[var(--label-secondary)] transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("entries.copied") : t("entries.copy")}
        </button>
      </div>
      {/* 代码内容 */}
      <pre className="px-3 py-2.5 overflow-x-auto text-[13px] leading-[20px]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/** react-markdown 自定义组件映射 */
const components: Components = {
  // 代码：区分行内和块级
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");

    // frontmatter 特殊标记 → 元数据表格
    if (match?.[1] === "__frontmatter__") {
      const yamlText = extractText(children).replace(/\n$/, "");
      return <FrontmatterBlock yamlText={yamlText} />;
    }

    if (match) {
      // 有语言标记 → fenced code block
      return <CodeBlock language={match[1]}>{children}</CodeBlock>;
    }

    // 无语言但有换行 → 无标注的 code block
    if (String(children).includes("\n")) {
      return <CodeBlock language="">{children}</CodeBlock>;
    }

    // 行内代码
    return (
      <code
        className="px-1.5 py-0.5 rounded-[4px] bg-[var(--fill-secondary)] text-[13px] font-mono break-words"
        {...props}
      >
        {children}
      </code>
    );
  },
  // pre 只做透传（CodeBlock 自己处理外包装）
  pre({ children }) {
    return <>{children}</>;
  },
  // 段落
  p({ children }) {
    return (
      <p className="text-[14px] leading-[22px] text-[var(--label-primary)] mb-2 last:mb-0">
        {children}
      </p>
    );
  },
  // 标题
  h1({ children }) {
    return (
      <h1 className="text-[20px] leading-[26px] font-semibold text-[var(--label-primary)] mt-4 mb-2">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="text-[17px] leading-[23px] font-semibold text-[var(--label-primary)] mt-3 mb-1.5">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="text-[15px] leading-[21px] font-semibold text-[var(--label-primary)] mt-2 mb-1">
        {children}
      </h3>
    );
  },
  // 列表
  ul({ children }) {
    return (
      <ul className="text-[14px] leading-[22px] text-[var(--label-primary)] pl-5 mb-2 list-disc space-y-0.5">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="text-[14px] leading-[22px] text-[var(--label-primary)] pl-5 mb-2 list-decimal space-y-0.5">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="text-[14px] leading-[22px]">{children}</li>;
  },
  // 引用块
  blockquote({ children }) {
    return (
      <blockquote className="pl-3 border-l-2 border-[var(--color-accent)] text-[14px] leading-[22px] text-[var(--label-secondary)] my-2">
        {children}
      </blockquote>
    );
  },
  // 表格
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2 rounded-[8px] border border-[var(--separator)]">
        <table className="w-full text-[13px]">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="bg-[var(--fill-tertiary)] text-[var(--label-secondary)]">
        {children}
      </thead>
    );
  },
  th({ children }) {
    return (
      <th className="px-3 py-1.5 text-left font-medium border-b border-[var(--separator)]">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-3 py-1.5 border-b border-[var(--separator)]">
        {children}
      </td>
    );
  },
  // 分隔线
  hr() {
    return <hr className="my-3 border-[var(--separator)]" />;
  },
  // 链接
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-accent)] hover:underline"
      >
        {children}
      </a>
    );
  },
  // 强调
  strong({ children }) {
    return (
      <strong className="font-semibold text-[var(--label-primary)]">
        {children}
      </strong>
    );
  },
  em({ children }) {
    return <em className="italic text-[var(--label-primary)]">{children}</em>;
  },
};

/** Markdown 渲染入口 */
export function MarkdownRenderer({ content }: { content: string }) {
  if (!content.trim()) return null;

  return (
    <div className="markdown-body min-w-0 max-w-full break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFrontmatter, remarkFrontmatterToCode]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

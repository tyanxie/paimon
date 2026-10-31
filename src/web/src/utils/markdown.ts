import { toString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter);

/** 将 Markdown 转换为完整纯文字，并合并连续空白。 */
export function markdownToPlainText(markdown: string): string {
  const tree = parser.parse(markdown);
  return tree.children
    .filter((node) => node.type !== "yaml" && node.type !== "definition")
    .map((node) => {
      if (node.type === "list") {
        return node.children
          .map((item) =>
            item.children
              .map((child) => toString(child, { includeHtml: false }))
              .join(" "),
          )
          .join(" ");
      }
      if (node.type === "table") {
        return node.children
          .map((row) =>
            row.children
              .map((cell) => toString(cell, { includeHtml: false }))
              .join(" "),
          )
          .join(" ");
      }
      return toString(node, { includeHtml: false });
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

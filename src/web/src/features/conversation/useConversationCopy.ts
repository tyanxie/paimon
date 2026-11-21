import { useEffect, type RefObject } from "react";

interface ListItemCopy {
  marker: string;
  depth: number;
}

interface SelectionCopyContext {
  lists: ReadonlySet<Element>;
  numbers: ReadonlyMap<HTMLLIElement, number>;
  items: WeakMap<Node, ListItemCopy>;
  whiteSpace: WeakMap<Node, string>;
}

const blockTags = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "DT",
  "DD",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "MAIN",
  "P",
  "SECTION",
]);
const excludedTags = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
]);

function listItemNumbers(
  lists: ReadonlySet<Element>,
  range: Range,
): Map<HTMLLIElement, number> {
  const numbers = new Map<HTMLLIElement, number>();
  for (const list of lists) {
    if (!(list instanceof HTMLOListElement) || !range.intersectsNode(list))
      continue;
    const items = Array.from(list.children).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement,
    );
    const step = list.reversed ? -1 : 1;
    let number = list.hasAttribute("start")
      ? list.start
      : list.reversed
        ? items.length
        : 1;
    for (const item of items) {
      if (item.hasAttribute("value")) number = item.value;
      numbers.set(item, number);
      number += step;
    }
  }
  return numbers;
}

function listItemCopy(
  item: HTMLLIElement,
  range: Range,
  number: number | undefined,
): ListItemCopy {
  const walker = item.ownerDocument.createTreeWalker(
    item,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let first: Text | HTMLImageElement | undefined;
  let last: Text | HTMLImageElement | undefined;
  let node = walker.nextNode();
  while (node) {
    if (
      node instanceof HTMLImageElement ||
      (node instanceof Text && node.data.trim())
    ) {
      const owner =
        node instanceof Element
          ? node.closest("li")
          : node.parentElement?.closest("li");
      if (owner === item) {
        first ??= node;
        last = node;
      }
    }
    node = walker.nextNode();
  }

  // 文字按字符边界判断，图片按节点边界判断；子列表内容不属于父项正文
  let complete = false;
  if (first && last) {
    const contents = item.ownerDocument.createRange();
    if (first instanceof Text)
      contents.setStart(first, first.data.search(/\S/));
    else contents.setStartBefore(first);
    if (last instanceof Text) contents.setEnd(last, last.data.trimEnd().length);
    else contents.setEndAfter(last);
    complete =
      range.comparePoint(contents.startContainer, contents.startOffset) === 0 &&
      range.comparePoint(contents.endContainer, contents.endOffset) === 0;
  }
  let depth = 0;
  for (
    let parent = item.parentElement?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent.matches("ol, ul")) depth++;
  }
  return {
    marker: complete ? (number !== undefined ? `${number}.` : "•") : "",
    depth,
  };
}

function cloneSelection(
  source: Node,
  range: Range,
  context: SelectionCopyContext,
  inheritedWhiteSpace = "normal",
  inheritedSelectable = true,
): Node | null {
  if (!range.intersectsNode(source)) return null;
  if (source instanceof Text) {
    if (!inheritedSelectable) return null;
    const start = source === range.startContainer ? range.startOffset : 0;
    const end = source === range.endContainer ? range.endOffset : source.length;
    if (end <= start) return null;
    const clone = source.ownerDocument.createTextNode(
      source.data.slice(start, end),
    );
    context.whiteSpace.set(clone, inheritedWhiteSpace);
    return clone;
  }
  if (!(source instanceof Element) || excludedTags.has(source.tagName))
    return null;
  const style = source.ownerDocument.defaultView?.getComputedStyle(source);
  if (
    source.hasAttribute("hidden") ||
    style?.display === "none" ||
    style?.visibility === "hidden"
  )
    return null;
  const whiteSpace = style?.whiteSpace || inheritedWhiteSpace;
  const userSelect = style?.userSelect;
  const selectable =
    userSelect === "none"
      ? false
      : userSelect === "text" || userSelect === "all"
        ? true
        : inheritedSelectable;

  const clone = source.cloneNode(false);
  if (!(clone instanceof Element)) return null;
  // 仅保留内容相关的属性，排除页面状态和内联事件
  for (const attribute of Array.from(clone.attributes)) {
    if (
      ![
        "href",
        "title",
        "src",
        "alt",
        "start",
        "reversed",
        "value",
        "colspan",
        "rowspan",
      ].includes(attribute.name)
    ) {
      clone.removeAttribute(attribute.name);
    }
  }
  // white-space 决定内容语义，保留它的变化而不复制页面的视觉样式
  if (clone instanceof HTMLElement && whiteSpace !== inheritedWhiteSpace) {
    clone.style.whiteSpace = whiteSpace;
  }
  for (const child of source.childNodes) {
    const selected = cloneSelection(
      child,
      range,
      context,
      whiteSpace,
      selectable,
    );
    if (selected) clone.appendChild(selected);
  }
  if (!clone.hasChildNodes() && !source.matches("br, img, hr")) return null;
  if (
    source instanceof HTMLLIElement &&
    source.parentElement &&
    context.lists.has(source.parentElement)
  ) {
    const number = context.numbers.get(source);
    const item = listItemCopy(source, range, number);
    context.items.set(clone, item);
    if (number !== undefined) clone.setAttribute("value", String(number));
    if (!item.marker && clone instanceof HTMLElement) {
      clone.style.listStyleType = "none";
    }
  }
  if (clone instanceof HTMLOListElement && context.lists.has(source)) {
    const first = clone.firstElementChild;
    if (first instanceof HTMLLIElement) clone.start = first.value;
  }
  return clone;
}

function selectionText(root: Node, context: SelectionCopyContext): string {
  let text = "";
  let pendingBreaks = 0;
  let linePrefix = "";
  let preserveTail = false;
  const breakLine = (count: number) => {
    pendingBreaks = Math.max(pendingBreaks, count);
  };
  const flushBreaks = () => {
    if (!pendingBreaks) return;
    if (!preserveTail) text = text.replace(/[ \t]+$/, "");
    const trailingBreaks = text.match(/\n*$/)?.[0].length ?? 0;
    if (text) text += "\n".repeat(Math.max(0, pendingBreaks - trailingBreaks));
    pendingBreaks = 0;
  };
  const append = (value: string, preserveWhitespace = false) => {
    if (!value) return;
    if (!preserveWhitespace && !value.trim()) {
      if (
        !pendingBreaks &&
        text &&
        !text.endsWith("\n") &&
        !text.endsWith(" ")
      ) {
        text += value;
      }
      return;
    }
    const atLineBoundary = pendingBreaks > 0 || text.endsWith("\n");
    flushBreaks();
    if (atLineBoundary && !preserveWhitespace) value = value.trimStart();
    if (!value) return;
    if (!text || text.endsWith("\n")) text += linePrefix;
    text +=
      preserveWhitespace && linePrefix
        ? value.replace(/\n(?=[^\n])/g, `\n${linePrefix}`)
        : value;
    preserveTail = preserveWhitespace;
  };
  const visit = (node: Node, inItem = false, leadingItemContent = false) => {
    if (node instanceof Text) {
      const whiteSpace = context.whiteSpace.get(node);
      if (
        whiteSpace === "pre" ||
        whiteSpace === "pre-wrap" ||
        whiteSpace === "break-spaces"
      ) {
        append(node.data, true);
      } else if (whiteSpace === "pre-line") {
        append(
          node.data.replace(/\r\n?/g, "\n").replace(/[ \t\f]+/g, " "),
          true,
        );
      } else {
        append(node.data.replace(/[ \t\r\n\f]+/g, " "));
      }
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === "PRE") {
      if (!leadingItemContent) breakLine(inItem ? 1 : 2);
      append(node.textContent ?? "", true);
      breakLine(inItem ? 1 : 2);
      return;
    }
    if (node.tagName === "BR") {
      // 显式换行逐个写入，不与块级元素的分隔间距合并
      flushBreaks();
      if (!preserveTail) text = text.replace(/[ \t]+$/, "");
      text += "\n";
      preserveTail = true;
      return;
    }
    if (node.tagName === "IMG") {
      append(node.getAttribute("alt") ?? "");
      return;
    }
    if (node.tagName === "LI") {
      const item = context.items.get(node);
      if (!item) {
        breakLine(1);
        for (const child of node.childNodes) visit(child, inItem);
        breakLine(1);
        return;
      }
      const previousPrefix = linePrefix;
      const indent = "  ".repeat(item.depth);
      breakLine(1);
      linePrefix = indent;
      if (item.marker) append(`${item.marker} `);
      linePrefix =
        indent + (item.marker ? " ".repeat(item.marker.length + 1) : "");
      let leading = true;
      for (const child of node.childNodes) {
        if (
          child instanceof Text &&
          !child.data.trim() &&
          context.whiteSpace.get(child) === "normal"
        )
          continue;
        visit(child, true, leading);
        leading = false;
      }
      linePrefix = previousPrefix;
      breakLine(1);
      return;
    }
    if (node.matches("ol, ul")) {
      breakLine(inItem ? 1 : 2);
      for (const child of node.childNodes) visit(child, inItem);
      breakLine(inItem ? 1 : 2);
      return;
    }
    if (node.tagName === "TR") breakLine(1);
    if (node.matches("td, th") && node.previousElementSibling)
      append("\t", true);
    const block = blockTags.has(node.tagName);
    if (block && !leadingItemContent) breakLine(inItem ? 1 : 2);
    for (const child of node.childNodes)
      visit(child, inItem, leadingItemContent);
    if (block) breakLine(inItem ? 1 : 2);
    if (node.tagName === "TR") breakLine(1);
  };
  visit(root);
  return preserveTail ? text : text.trimEnd();
}

function selectionHtml(
  root: Element,
  items: WeakMap<Node, ListItemCopy>,
): string {
  const container = root.ownerDocument.createElement("div");
  container.appendChild(root);
  for (const list of container.querySelectorAll("ol, ul")) {
    const children = Array.from(list.children);
    const contextOnly =
      children.length > 0 &&
      children.every(
        (item) =>
          item instanceof HTMLLIElement &&
          items.get(item)?.marker === "" &&
          item.children.length > 0 &&
          Array.from(item.childNodes).every((child) =>
            child instanceof Element
              ? child.matches("ol, ul")
              : child instanceof Text && !child.data.trim(),
          ),
      );
    if (!contextOnly) continue;
    // 只有子列表被选中时，用缩进容器替代空的父列表项
    const wrapper = root.ownerDocument.createElement("div");
    wrapper.style.marginInlineStart = "2em";
    for (const item of children) wrapper.append(...item.childNodes);
    list.replaceWith(wrapper);
  }
  return container.innerHTML;
}

function copyListSelection(event: ClipboardEvent, container: HTMLElement) {
  if (event.defaultPrevented || !event.clipboardData) return;
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return;
  const selection = container.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  const lists = new Set(
    container.querySelectorAll(".markdown-body ol, .markdown-body ul"),
  );
  if (![...lists].some((list) => range.intersectsNode(list))) return;

  let source = range.commonAncestorContainer;
  if (!(source instanceof Element)) source = source.parentElement ?? source;
  // 复制共同祖先内的选区时，需要保留外层列表的上下文
  if (source instanceof Element) {
    for (
      let parent: Element | null = source;
      parent && container.contains(parent);
      parent = parent.parentElement
    ) {
      if (parent.matches("ol, ul")) source = parent;
    }
  }
  if (!(source instanceof Element)) return;
  // 可编辑区域和含文字的 SVG 选区保留默认复制行为
  const candidates = [
    source,
    ...source.querySelectorAll("[contenteditable], svg"),
  ];
  if (
    candidates.some(
      (node) =>
        range.intersectsNode(node) &&
        (node.matches('[contenteditable]:not([contenteditable="false"])') ||
          (node.matches("svg") && !!node.textContent?.trim())),
    )
  )
    return;

  const context: SelectionCopyContext = {
    lists,
    numbers: listItemNumbers(lists, range),
    items: new WeakMap(),
    whiteSpace: new WeakMap(),
  };
  const clone = cloneSelection(source, range, context);
  if (!(clone instanceof Element)) return;
  const selectedItems = [clone, ...clone.querySelectorAll("li")];
  if (!selectedItems.some((item) => context.items.get(item)?.marker)) return;
  const plainText = selectionText(clone, context);
  if (!plainText) return;
  event.clipboardData.setData("text/plain", plainText);
  event.clipboardData.setData("text/html", selectionHtml(clone, context.items));
  event.preventDefault();
}

export function useConversationCopy(
  containerRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const document = containerRef.current?.ownerDocument;
    if (!document) return;
    // 监听 document，覆盖全选及跨多条回复的选区，是否接管由选区内容决定
    const onCopy = (event: ClipboardEvent) => {
      const container = containerRef.current;
      if (container) copyListSelection(event, container);
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [containerRef]);
}

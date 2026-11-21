import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useConversationCopy } from "./useConversationCopy";

let root: Root;
let scope: HTMLDivElement;
let content: HTMLDivElement;
let contentRef: RefObject<HTMLDivElement | null>;
let previousRanges: Range[];
const originalPlainText = "原有纯文本";
const originalHtml = "<p>原有富文本</p>";
const imageSource =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

function Probe({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  useConversationCopy(containerRef);
  return null;
}

function selection(): Selection {
  const value = document.getSelection();
  if (!value) throw new Error("Selection is unavailable");
  return value;
}

function element(selector: string): HTMLElement {
  const value = content.querySelector(selector);
  if (!(value instanceof HTMLElement))
    throw new Error(`Missing element: ${selector}`);
  return value;
}

function text(selector: string): Text {
  const value = element(selector).firstChild;
  if (!(value instanceof Text)) throw new Error(`Missing text: ${selector}`);
  return value;
}

function setRange(range: Range): Range {
  selection().removeAllRanges();
  selection().addRange(range);
  return range;
}

function selectContents(node: Node = content): Range {
  const range = document.createRange();
  range.selectNodeContents(node);
  return setRange(range);
}

function selectNode(node: Node): Range {
  const range = document.createRange();
  range.selectNode(node);
  return setRange(range);
}

function selectText(
  start: Text,
  startOffset = 0,
  end = start,
  endOffset = end.length,
): Range {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  return setRange(range);
}

async function mount() {
  await act(async () => root.render(<Probe containerRef={contentRef} />));
}

function copy(target: Element = content, prevented = false) {
  // DataTransfer 只保存本次事件的内存数据，不调用系统剪贴板
  const data = new DataTransfer();
  data.setData("text/plain", originalPlainText);
  data.setData("text/html", originalHtml);
  const event = new ClipboardEvent("copy", {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  });
  if (prevented) event.preventDefault();
  target.dispatchEvent(event);
  return { event, data };
}

function expectDefaultCopy(result: ReturnType<typeof copy>) {
  expect(result.event.defaultPrevented).toBe(false);
  expect(result.data.getData("text/plain")).toBe(originalPlainText);
  expect(result.data.getData("text/html")).toBe(originalHtml);
}

function parsedHtml(data: DataTransfer): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = data.getData("text/html");
  return template.content;
}

beforeEach(() => {
  const current = selection();
  previousRanges = Array.from({ length: current.rangeCount }, (_, index) =>
    current.getRangeAt(index).cloneRange(),
  );
  current.removeAllRanges();
  scope = document.createElement("div");
  const mountPoint = document.createElement("div");
  content = document.createElement("div");
  scope.append(mountPoint, content);
  document.body.append(scope);
  contentRef = { current: content };
  root = createRoot(mountPoint);
});

afterEach(async () => {
  try {
    await act(async () => root.unmount());
  } finally {
    selection().removeAllRanges();
    scope.remove();
    for (const range of previousRanges) {
      if (range.startContainer.isConnected && range.endContainer.isConnected)
        selection().addRange(range);
    }
  }
});

describe("列表复制内容", () => {
  test("有序列表同时生成带编号的纯文本和语义化 HTML", async () => {
    content.innerHTML =
      '<div class="markdown-body"><h3>步骤</h3><ol><li>阅读代码</li><li>检查结果</li></ol></div>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("步骤\n\n1. 阅读代码\n2. 检查结果");
    const html = parsedHtml(data);
    expect(html.querySelector("h3")?.textContent).toBe("步骤");
    expect(html.querySelectorAll("ol > li")).toHaveLength(2);
    expect(
      Array.from(html.querySelectorAll("ol > li"), (item) =>
        item.getAttribute("value"),
      ),
    ).toEqual(["1", "2"]);
  });

  test("无序列表保留圆点，列表项内的段落不会将标记与正文分开", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ul><li><p>苹果</p></li><li><p>香蕉</p></li></ul></div>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("• 苹果\n• 香蕉");
    expect(parsedHtml(data).querySelectorAll("ul > li")).toHaveLength(2);
  });

  test("有序与无序列表混合嵌套时保留原顺序和层级", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>准备材料<ul><li>面包</li><li>牛奶</li></ul></li><li>收拾餐桌</li></ol></div>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe(
      "1. 准备材料\n  • 面包\n  • 牛奶\n2. 收拾餐桌",
    );
    expect(parsedHtml(data).querySelectorAll("ol > li > ul > li")).toHaveLength(
      2,
    );
  });

  test.each([
    { name: "普通列表", attributes: "", value: "", expected: [2, 3] },
    {
      name: "非 1 起始编号",
      attributes: 'start="5"',
      value: "",
      expected: [6, 7],
    },
    { name: "倒序列表", attributes: "reversed", value: "", expected: [2, 1] },
    {
      name: "列表项指定编号",
      attributes: "",
      value: 'value="9"',
      expected: [9, 10],
    },
  ])(
    "从中间选择保留实际编号：$name",
    async ({ attributes, value, expected }) => {
      content.innerHTML = `<div class="markdown-body"><ol ${attributes}><li>甲</li><li data-item="second" ${value}>乙</li><li data-item="third">丙</li></ol></div>`;
      await mount();
      selectText(text('[data-item="second"]'), 0, text('[data-item="third"]'));
      const { event, data } = copy();
      expect(event.defaultPrevented).toBe(true);
      expect(data.getData("text/plain")).toBe(
        `${expected[0]}. 乙\n${expected[1]}. 丙`,
      );
      const html = parsedHtml(data);
      expect(html.querySelector("ol")?.getAttribute("start")).toBe(
        String(expected[0]),
      );
      expect(
        Array.from(html.querySelectorAll("li"), (item) =>
          item.getAttribute("value"),
        ),
      ).toEqual(expected.map(String));
      expect(html.textContent).toBe("乙丙");
    },
  );

  test("只选择列表项中的几个字时不接管默认复制", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li data-item="first">阅读代码</li></ol></div>';
    await mount();
    selectText(text('[data-item="first"]'), 2);
    expect(selection().toString()).toBe("代码");
    expectDefaultCopy(copy());
  });

  test.each([
    {
      startOffset: 2,
      endOffset: 3,
      expected: "第一项\n2. 第二项",
      partialIndex: 0,
    },
    {
      startOffset: 0,
      endOffset: 2,
      expected: "1. 完整第一项\n第二",
      partialIndex: 1,
    },
  ])(
    "跨项局部选择只复制选中文字：$startOffset/$endOffset",
    async ({ startOffset, endOffset, expected, partialIndex }) => {
      content.innerHTML =
        '<div class="markdown-body"><ol><li data-item="first">完整第一项</li><li data-item="second">第二项</li><li>未选中的第三项</li></ol></div>';
      await mount();
      selectText(
        text('[data-item="first"]'),
        startOffset,
        text('[data-item="second"]'),
        endOffset,
      );
      const { event, data } = copy();
      expect(event.defaultPrevented).toBe(true);
      expect(data.getData("text/plain")).toBe(expected);
      const html = parsedHtml(data);
      expect(html.querySelectorAll("li")).toHaveLength(2);
      expect(html.textContent).not.toContain("未选中");
      expect(
        html.querySelectorAll("li")[partialIndex]?.style.listStyleType,
      ).toBe("none");
    },
  );

  test("只选择深层子列表时保留缩进，HTML 不包含空父列表项", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>未选中的父项<ul><li>未选中的中间项<ol start="3"><li data-item="leaf">子项</li></ol></li></ul></li></ol></div>';
    await mount();
    selectText(text('[data-item="leaf"]'));
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("    3. 子项");
    const html = parsedHtml(data);
    expect(html.querySelectorAll("ol, ul")).toHaveLength(1);
    expect(html.querySelectorAll("li")).toHaveLength(1);
    expect(html.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect(html.textContent).toBe("子项");
  });

  test("纯图片项与文字项混合复制时保留图片项编号", async () => {
    content.innerHTML = `<div class="markdown-body"><ol><li><img src="${imageSource}" alt="示意图"></li><li>检查结果</li></ol></div>`;
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("1. 示意图\n2. 检查结果");
    const html = parsedHtml(data);
    expect(html.querySelector("img")?.getAttribute("src")).toBe(imageSource);
    expect(html.querySelector("li")?.getAttribute("value")).toBe("1");
    expect(html.querySelector("li")?.style.listStyleType).not.toBe("none");
  });

  test.each([
    { tag: "ol", expected: "1. 示意图\n2. 补充图" },
    { tag: "ul", expected: "• 示意图\n• 补充图" },
  ])("所有列表项都只有图片时仍保留标记：$tag", async ({ tag, expected }) => {
    content.innerHTML = `<div class="markdown-body"><${tag}><li><img src="${imageSource}" alt="示意图"></li><li><img src="${imageSource}" alt="补充图"></li></${tag}></div>`;
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe(expected);
    const html = parsedHtml(data);
    expect(html.querySelectorAll("li")).toHaveLength(2);
    expect(html.querySelectorAll("img")).toHaveLength(2);
    expect(
      Array.from(
        html.querySelectorAll("li"),
        (item) => item.style.listStyleType,
      ),
    ).not.toContain("none");
  });

  test("只选择图片节点也能保留所属列表项编号", async () => {
    content.innerHTML = `<div class="markdown-body"><ol start="4"><li><a href="#diagram"><img src="${imageSource}" alt="示意图"></a></li><li>未选中的项目</li></ol></div>`;
    await mount();
    selectNode(element("img"));
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("4. 示意图");
    const html = parsedHtml(data);
    expect(html.querySelectorAll("li")).toHaveLength(1);
    expect(html.querySelector("li")?.getAttribute("value")).toBe("4");
    expect(html.querySelector("img")?.getAttribute("src")).toBe(imageSource);
    expect(html.textContent).not.toContain("未选中");
  });

  test.each(["before", "after"])(
    "只选文字而未选图片时不补编号：图片位于 %s",
    async (position) => {
      const image = `<img src="${imageSource}" alt="未选中的图片">`;
      const label = '<span data-label="text">说明文字</span>';
      content.innerHTML = `<div class="markdown-body"><ol><li>${position === "before" ? image + label : label + image}</li></ol></div>`;
      await mount();
      selectText(text('[data-label="text"]'));
      expect(selection().toString()).toBe("说明文字");
      expectDefaultCopy(copy());
    },
  );

  test("选择子项图片时不复制父项图片，也不生成空父项标记", async () => {
    content.innerHTML = `<div class="markdown-body"><ol><li><img src="${imageSource}" alt="父项图片"><ul><li><img data-image="child" src="${imageSource}" alt="子项图片"></li></ul></li></ol></div>`;
    await mount();
    selectNode(element('[data-image="child"]'));
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("  • 子项图片");
    const html = parsedHtml(data);
    expect(html.querySelectorAll("li")).toHaveLength(1);
    expect(html.querySelectorAll("ol")).toHaveLength(0);
    expect(html.querySelectorAll("img")).toHaveLength(1);
    expect(html.querySelector("img")?.getAttribute("alt")).toBe("子项图片");
  });

  test("跨多条回复的选区保留每条回复的列表", async () => {
    content.innerHTML =
      '<article><div class="markdown-body"><ol><li>第一条回复</li></ol></div></article><article><div class="markdown-body"><ul><li>第二条回复</li></ul></div></article>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("1. 第一条回复\n\n• 第二条回复");
    const html = parsedHtml(data);
    expect(html.querySelectorAll("ol > li")).toHaveLength(1);
    expect(html.querySelectorAll("ul > li")).toHaveLength(1);
  });
});

describe("混合选区与内容过滤", () => {
  test.each([1, 2, 3])(
    "列表项中的 %i 个连续 br 保留对应换行",
    async (count) => {
      content.innerHTML = `<div class="markdown-body"><ul><li>第一行${"<br>".repeat(count)}第二行</li><li>第三行</li></ul></div>`;
      await mount();
      selectContents();
      const { event, data } = copy();
      expect(event.defaultPrevented).toBe(true);
      expect(data.getData("text/plain")).toBe(
        `• 第一行${"\n".repeat(count)}  第二行\n• 第三行`,
      );
      expect(parsedHtml(data).querySelectorAll("br")).toHaveLength(count);
    },
  );

  test("显式换行独立保留，段落与列表分隔不重复累加", async () => {
    content.innerHTML =
      '<div class="markdown-body"><p>前言</p><ul><li><p>第一行<br><br>第二行</p><p>第三段</p></li></ul><p>结尾</p></div>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe(
      "前言\n\n• 第一行\n\n  第二行\n  第三段\n\n结尾",
    );
    expect(parsedHtml(data).querySelectorAll("br")).toHaveLength(2);
  });

  test("选区末尾的显式换行不被段落清理移除", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ul><li>第一行<br><br></li></ul></div>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("• 第一行\n\n");
    expect(parsedHtml(data).querySelectorAll("br")).toHaveLength(2);
  });

  test("保留空白的正文换行与紧随其后的 br 分别计数", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ul><li style="white-space: pre-wrap">第一行\n<br>第二行</li></ul></div>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("• 第一行\n\n  第二行");
    expect(parsedHtml(data).querySelectorAll("br")).toHaveLength(1);
  });

  test("多行正文与列表一起复制时保留换行、空格和 HTML 空白语义", async () => {
    // 测试环境不加载 Tailwind 产物，直接提供与用户消息相同的空白语义
    content.innerHTML =
      '<p style="white-space: pre-wrap"></p><div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
    const body = "第一行\n  第二行\t保留  空格";
    element("p").textContent = body;
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe(`${body}\n\n1. 执行步骤`);
    const paragraph = parsedHtml(data).querySelector("p");
    expect(paragraph?.textContent).toBe(body);
    expect(paragraph?.style.whiteSpace).toBe("pre-wrap");
  });

  test.each(["before", "after"])(
    "代码块位于列表 %s 时保留缩进与尾部空格",
    async (position) => {
      const list = "<ol><li>执行步骤</li></ol>";
      const code = "  const value = 1;\n\treturn value;  ";
      content.innerHTML = `<div class="markdown-body">${position === "before" ? "<pre><code></code></pre>" + list : list + "<pre><code></code></pre>"}</div>`;
      element("code").textContent = code;
      await mount();
      selectContents();
      const { event, data } = copy();
      expect(event.defaultPrevented).toBe(true);
      expect(data.getData("text/plain")).toBe(
        position === "before"
          ? `${code}\n\n1. 执行步骤`
          : `1. 执行步骤\n\n${code}`,
      );
      expect(parsedHtml(data).querySelector("pre")?.textContent).toBe(code);
    },
  );

  test("选区末尾代码块中的空行不被清理", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ul><li>步骤</li></ul><pre><code></code></pre></div>';
    const code = "第一行\n\n";
    element("code").textContent = code;
    await mount();
    selectContents();
    const { data } = copy();
    expect(data.getData("text/plain")).toBe(`• 步骤\n\n${code}`);
    expect(parsedHtml(data).querySelector("pre")?.textContent).toBe(code);
  });

  test("不可选控件和隐藏文字被排除，可选子内容仍保留", async () => {
    content.innerHTML =
      '<button style="user-select: none">重新编辑</button><p hidden>hidden 内容</p><p style="display: none">display 内容</p><p style="visibility: hidden">visibility 内容</p><div style="user-select: none"><span style="user-select: auto">不可选文字</span><span style="user-select: text">可选子内容</span></div><div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("可选子内容\n\n1. 执行步骤");
    const html = parsedHtml(data);
    expect(html.querySelector("button")).toBeNull();
    expect(html.textContent).toBe("可选子内容执行步骤");
  });

  test("图片与列表混合复制时保留原始 data URL 和 MIME type", async () => {
    const source = imageSource;
    content.innerHTML =
      '<button><img alt="附件"></button><div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
    element("img").setAttribute("src", source);
    await mount();
    selectContents();
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe("附件\n\n1. 执行步骤");
    const image = parsedHtml(data).querySelector("img");
    expect(image?.getAttribute("src")).toBe(source);
    expect(image?.getAttribute("alt")).toBe("附件");
  });
});

describe("默认复制边界与资源释放", () => {
  test("非列表选区不接管，也不改写原有事件数据", async () => {
    content.innerHTML =
      '<p>普通文字</p><div class="markdown-body"><ol><li>列表内容</li></ol></div>';
    await mount();
    selectContents(element("p"));
    expectDefaultCopy(copy());
  });

  test.each(["input", "textarea", "select", "editable"])(
    "来自 %s 的复制不接管",
    async (tag) => {
      content.innerHTML =
        '<div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
      const target = document.createElement(tag === "editable" ? "div" : tag);
      if (tag === "editable") target.setAttribute("contenteditable", "true");
      scope.append(target);
      await mount();
      selectContents();
      expectDefaultCopy(copy(target));
    },
  );

  test("没有选区或选区已折叠时保留默认行为", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
    await mount();
    expectDefaultCopy(copy());
    const range = selectContents();
    range.collapse(true);
    expectDefaultCopy(copy());
  });

  test("已经被其他处理器阻止的事件不改写数据", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
    await mount();
    selectContents();
    const { event, data } = copy(content, true);
    expect(event.defaultPrevented).toBe(true);
    expect(data.getData("text/plain")).toBe(originalPlainText);
    expect(data.getData("text/html")).toBe(originalHtml);
  });

  test("没有 clipboardData 的事件不被接管", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
    await mount();
    selectContents();
    const event = new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData: null,
    });
    content.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test.each([
    '<div contenteditable="true">可编辑文字</div>',
    "<svg><text>图形文字</text></svg>",
  ])("选区包含不支持转换的内容时保留默认行为：%s", async (extra) => {
    content.innerHTML = `<div class="markdown-body"><ol><li>执行步骤</li></ol>${extra}</div>`;
    await mount();
    selectContents();
    expectDefaultCopy(copy());
  });

  test("对话容器以外的列表选区不被接管", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>对话内容</li></ol></div>';
    const external = document.createElement("div");
    external.innerHTML =
      '<div class="markdown-body"><ol><li>其他区域</li></ol></div>';
    scope.append(external);
    await mount();
    selectContents(external);
    expectDefaultCopy(copy(external));
  });

  test("重渲染不重复监听，卸载释放监听并允许重新挂载", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>执行步骤</li></ol></div>';
    const add = spyOn(document, "addEventListener");
    const remove = spyOn(document, "removeEventListener");
    try {
      await mount();
      await mount();
      const registrations = add.mock.calls.filter(([type]) => type === "copy");
      expect(registrations).toHaveLength(1);
      selectContents();
      expect(copy().data.getData("text/plain")).toBe("1. 执行步骤");
      await act(async () => root.render(null));
      const removals = remove.mock.calls.filter(([type]) => type === "copy");
      expect(removals).toHaveLength(1);
      expect(removals[0]?.[1]).toBe(registrations[0]?.[1]);
      expectDefaultCopy(copy());
      await mount();
      expect(add.mock.calls.filter(([type]) => type === "copy")).toHaveLength(
        2,
      );
      expect(copy().data.getData("text/plain")).toBe("1. 执行步骤");
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  test("重复复制不修改原 DOM、选区或后续复制结果", async () => {
    content.innerHTML =
      '<div class="markdown-body"><ol><li>父项<ul><li data-item="leaf">子项</li></ul></li></ol></div>';
    await mount();
    selectText(text('[data-item="leaf"]'));
    const before = content.innerHTML;
    const range = selection().getRangeAt(0);
    const boundaries = {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
    };
    const selectedText = selection().toString();
    const first = copy();
    const second = copy();
    expect(first.event.defaultPrevented).toBe(true);
    expect(second.event.defaultPrevented).toBe(true);
    expect(content.innerHTML).toBe(before);
    expect(selection().toString()).toBe(selectedText);
    const current = selection().getRangeAt(0);
    expect(current.startContainer).toBe(boundaries.startContainer);
    expect(current.startOffset).toBe(boundaries.startOffset);
    expect(current.endContainer).toBe(boundaries.endContainer);
    expect(current.endOffset).toBe(boundaries.endOffset);
    expect(second.data.getData("text/plain")).toBe(
      first.data.getData("text/plain"),
    );
    expect(second.data.getData("text/html")).toBe(
      first.data.getData("text/html"),
    );
  });
});

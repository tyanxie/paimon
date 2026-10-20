import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "./Button";
import { FormField, TextField, TextArea, SelectField } from "./FormControls";
import { MenuItem } from "./MenuItem";
import { SegmentedControl } from "./SegmentedControl";
import { StatusMessage } from "./StatusMessage";
import { ResultBlock } from "./ContentBlock";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("公共控件功能", () => {
  test("按钮保留 ref、名称、类型和点击操作", async () => {
    const ref = createRef<HTMLButtonElement>();
    let clicks = 0;
    await act(async () =>
      root.render(
        <Button
          ref={ref}
          aria-label="create"
          variant="primary"
          onClick={() => clicks++}
        >
          create
        </Button>,
      ),
    );
    expect(ref.current === container.querySelector("button")).toBe(true);
    expect(ref.current!.type).toBe("button");
    expect(ref.current!.classList.contains("ui-button--primary")).toBe(true);
    await act(async () => ref.current!.click());
    expect(clicks).toBe(1);
  });
  test("附属按钮保留独立规格、名称和点击操作", async () => {
    let clicks = 0;
    await act(async () =>
      root.render(
        <Button size="badge" aria-label="remove image" onClick={() => clicks++}>
          remove
        </Button>,
      ),
    );
    const button = container.querySelector("button")!;
    expect(button.classList.contains("ui-button--badge")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("remove image");
    await act(async () => button.click());
    expect(clicks).toBe(1);
  });
  test("加载按钮具有 busy 状态并阻止重复提交", async () => {
    let clicks = 0;
    await act(async () =>
      root.render(
        <Button loading onClick={() => clicks++}>
          create
        </Button>,
      ),
    );
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => button.click());
    expect(clicks).toBe(0);
  });
  test("字段保留标签关联、ref、输入值和错误状态", async () => {
    const ref = createRef<HTMLInputElement>();
    await act(async () =>
      root.render(
        <FormField label="directory" htmlFor="directory">
          <TextField
            id="directory"
            ref={ref}
            defaultValue="/project"
            invalid
            aria-describedby="error"
          />
        </FormField>,
      ),
    );
    expect(container.querySelector("label")!.htmlFor).toBe("directory");
    expect(ref.current!.value).toBe("/project");
    expect(ref.current!.getAttribute("aria-invalid")).toBe("true");
    expect(ref.current!.getAttribute("aria-describedby")).toBe("error");
  });
  test("textarea 与原生 select 保留各自输入语义", async () => {
    await act(async () =>
      root.render(
        <>
          <TextArea defaultValue="instructions" rows={3} />
          <SelectField defaultValue="two">
            <option value="one">one</option>
            <option value="two">two</option>
          </SelectField>
        </>,
      ),
    );
    expect(container.querySelector("textarea")!.value).toBe("instructions");
    expect(container.querySelector("select")!.value).toBe("two");
  });
  test("菜单条目保留选中、危险与禁用状态", async () => {
    let clicks = 0;
    await act(async () =>
      root.render(
        <MenuItem selected danger disabled onClick={() => clicks++}>
          exit
        </MenuItem>,
      ),
    );
    const item = container.querySelector("button")!;
    expect(item.dataset.selected).toBe("true");
    expect(item.dataset.danger).toBe("true");
    await act(async () => item.click());
    expect(clicks).toBe(0);
  });
  test("分段控件显示当前值并提交原始 option value", async () => {
    let selected = "";
    await act(async () =>
      root.render(
        <SegmentedControl
          label="theme"
          value="light"
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(value) => (selected = value)}
        />,
      ),
    );
    expect(
      container.querySelector('[role="group"]')!.getAttribute("aria-label"),
    ).toBe("theme");
    expect(container.querySelector('[aria-pressed="true"]')!.textContent).toBe(
      "Light",
    );
    await act(async () => container.querySelectorAll("button")[1]!.click());
    expect(selected).toBe("dark");
  });
  test("状态说明与结果保留错误含义和完整文本", async () => {
    await act(async () =>
      root.render(
        <>
          <StatusMessage tone="error" detail="details">
            failed
          </StatusMessage>
          <ResultBlock error>{"line one\nline two"}</ResultBlock>
        </>,
      ),
    );
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      "faileddetails",
    );
    expect(container.querySelector("pre")!.textContent).toBe(
      "line one\nline two",
    );
    expect(
      container.querySelector("pre")!.classList.contains("tool-result-error"),
    ).toBe(true);
  });
});

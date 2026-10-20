import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { MemoryRouter } from "react-router";
import i18n from "../i18n";
import { LoginPage } from "./LoginPage";
import { Settings } from "./Settings";
import { useSettings } from "../stores/useSettings";

let root: Root;
let container: HTMLDivElement;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const preconnect = globalThis.fetch.preconnect;
function fakeFetch(
  handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(handler, { preconnect });
}
let state: ReturnType<typeof useSettings.getState>;
let stored: Map<string, string | null>;
const keys = [
  "paimon:accessToken",
  "paimon:appearance",
  "paimon:background",
  "paimon:language",
  "paimon:notification",
];
beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  state = useSettings.getState();
  stored = new Map(keys.map((key) => [key, localStorage.getItem(key)]));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    fakeFetch(async () => new Response("{}")),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchSpy.mockRestore();
  useSettings.setState(state);
  useSettings.getState().setAppearance(state.appearance);
  useSettings.getState().setBackground(state.background);
  for (const [key, value] of stored) {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }
  await i18n.changeLanguage("zh-CN");
});
async function login(onLogin = (_: string) => {}) {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <LoginPage onLogin={onLogin} />
      </MotionConfig>,
    ),
  );
}
async function token(value: string) {
  const field = container.querySelector("input")!;
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(field, value);
  await act(async () =>
    field.dispatchEvent(new Event("input", { bubbles: true })),
  );
}
async function submit() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function settings() {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </MotionConfig>,
    ),
  );
}
function button(label: string) {
  const result = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => element.textContent === label);
  expect(Boolean(result)).toBe(true);
  return result!;
}

describe("登录表单功能", () => {
  test("标签关联密码字段，空 Token 保持连接禁用", async () => {
    await login();
    expect(container.querySelector("input")!.type).toBe("password");
    expect(container.querySelector("label")!.htmlFor).toBe(
      container.querySelector("input")!.id,
    );
    expect(button("连接").disabled).toBe(true);
  });
  test("验证成功提交去除首尾空白的 Token", async () => {
    const logged: string[] = [];
    await login((value) => logged.push(value));
    await token(" test-token ");
    await submit();
    expect(logged).toEqual(["test-token"]);
    expect(localStorage.getItem("paimon:accessToken")).toBe("test-token");
  });
  test("401 显示错误并保留可重新输入的状态", async () => {
    fetchSpy.mockImplementation(
      fakeFetch(async () => new Response("", { status: 401 })),
    );
    await login();
    await token("invalid");
    await submit();
    expect(container.querySelector("input")!.getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      "Token 无效，请检查后重试。",
    );
    expect(button("连接").disabled).toBe(false);
  });
});
describe("设置页面功能", () => {
  test("主题分段控件保留选中状态与持久化", async () => {
    await settings();
    await act(async () => button("深色").click());
    expect(useSettings.getState().appearance).toBe("dark");
    expect(localStorage.getItem("paimon:appearance")).toBe("dark");
    expect(button("深色").getAttribute("aria-pressed")).toBe("true");
  });
  test("背景按钮保留三种颜色组与原始 value", async () => {
    await settings();
    await act(async () => button("极光").click());
    expect(useSettings.getState().background).toBe("aurora");
    expect(button("极光").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".ui-background-choice").length).toBe(3);
  });
  test("语言控件继续切换并保存用户选择", async () => {
    await settings();
    await act(async () => button("English").click());
    expect(localStorage.getItem("paimon:language")).toBe("en");
    expect(i18n.resolvedLanguage).toBe("en");
    expect(
      container.querySelector('[role="group"][aria-label="Language"]') !== null,
    ).toBe(true);
  });
});

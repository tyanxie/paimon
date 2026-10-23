import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "../../utils/token";
import { useAuth } from "./useAuth";

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useAuth>;
let response: unknown;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
let storedToken: string | null;

function Probe() {
  state = useAuth();
  return null;
}

beforeEach(() => {
  storedToken = getStoredToken();
  clearStoredToken();
  response = null;
  const preconnect = globalThis.fetch.preconnect;
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => Response.json(response), { preconnect }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchSpy.mockRestore();
  if (storedToken === null) clearStoredToken();
  else setStoredToken(storedToken);
});

describe("认证响应字段识别", () => {
  test("合法 token 自动保存并结束探测", async () => {
    response = { token: "access-token" };
    await act(async () => root.render(<Probe />));
    expect(state.authToken).toBe("access-token");
    expect(getStoredToken()).toBe("access-token");
    expect(state.probing).toBe(false);
  });

  test("无效响应保留未认证状态并结束探测", async () => {
    for (const value of [null, [], {}, { token: 1 }]) {
      response = value;
      await act(async () => root.render(<Probe />));
      expect(state.authToken).toBeNull();
      expect(getStoredToken()).toBeNull();
      expect(state.probing).toBe(false);
      await act(async () => root.render(null));
    }
  });
});

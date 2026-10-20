import { describe, expect, test } from "bun:test";
import postcss from "postcss";

const css = postcss.parse(
  await Bun.file(new URL("../../index.css", import.meta.url)).text(),
);

function declarations(selector: string, coarse = false) {
  const result: Record<string, string> = {};
  css.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    let touch = false;
    for (
      let parent: postcss.AnyNode | undefined = rule.parent;
      parent;
      parent = parent.parent
    ) {
      if (
        parent.type === "atrule" &&
        parent.name === "media" &&
        parent.params === "(pointer: coarse)"
      ) {
        touch = true;
      }
    }
    if (touch !== coarse) return;
    rule.walkDecls((declaration) => {
      result[declaration.prop] = declaration.value;
    });
  });
  return result;
}

describe("控件尺寸与间距", () => {
  test("桌面按钮采用常规、图标、紧凑和附属入口规格", () => {
    expect(declarations(".ui-button")["min-height"]).toBe("36px");
    expect(declarations(".ui-button--icon")["width"]).toBe("32px");
    expect(declarations(".ui-button--icon")["min-height"]).toBe("32px");
    expect(declarations(".ui-button--compact")["min-height"]).toBe("28px");
    expect(declarations(".ui-button--badge")["min-width"]).toBe("24px");
    expect(declarations(".ui-button--badge")["padding"]).toBe("0");
  });

  test("触摸设备保留按钮尺寸与附属入口的独立点击区域", () => {
    expect(
      declarations(
        ".ui-button:not(.ui-button--inline):not(.ui-button--badge)",
        true,
      )["min-height"],
    ).toBe("44px");
    expect(declarations(".ui-button--icon", true)["width"]).toBe("44px");
    for (const selector of [
      ".ui-button--badge::after",
      ".ui-button--inline::after",
    ]) {
      expect(declarations(selector, true)["width"]).toBe("max(100%, 44px)");
      expect(declarations(selector, true)["height"]).toBe("max(100%, 44px)");
    }
  });

  test("字段、菜单和分段选项按输入方式设置高度", () => {
    for (const [selector, height] of [
      [".ui-field", "36px"],
      [".ui-menu-item", "32px"],
      [".ui-segment", "28px"],
    ] as const) {
      expect(declarations(selector)["min-height"]).toBe(height);
      expect(declarations(selector, true)["min-height"]).toBe("44px");
    }
    expect(declarations(".ui-field--multiline")["min-height"]).toBe("88px");
    expect(declarations(".ui-field--multiline", true)["min-height"]).toBe(
      "88px",
    );
  });

  test("导航、工具栏和执行入口采用桌面与触摸规格", () => {
    for (const selector of [
      ".navigation-create",
      ".composer-toolbar button",
      ".conversation-reply-toggle",
      ".conversation-execution-toggle",
      ".conversation-tool-row",
      ".conversation-thinking-toggle",
      ".modal-close",
      ".image-lightbox button",
    ]) {
      expect(declarations(selector)["min-height"]).toBe("32px");
      expect(declarations(selector, true)["min-height"]).toBe("44px");
    }
  });

  test("实例进度轨道使用全宽，操作位置只在文字行预留", () => {
    expect(declarations(".instance-progress-track")["width"]).toBe("100%");
    expect(declarations(".instance-item-text")["padding-right"]).toBe("36px");
    expect(declarations(".instance-item-text", true)["padding-right"]).toBe(
      "48px",
    );
  });

  test("表单和设置保留内容分组与底部 Safe Area", () => {
    expect(declarations(".ui-form-content")["padding"]).toBe("16px");
    expect(declarations(".ui-form-content")["gap"]).toBe("16px");
    expect(declarations(".ui-dialog-actions")["padding"]).toBe(
      "10px 16px max(12px, env(safe-area-inset-bottom))",
    );
    expect(declarations(".settings-row")["padding"]).toBe("12px 16px");
    expect(declarations(".content-toolbar")["padding"]).toBe("4px 12px");
  });
});

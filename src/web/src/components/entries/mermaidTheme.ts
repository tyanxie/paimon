// Paimon 图表主题：项目颜色转换为独立 SVG 可使用的 HEX 色值

import { alpha, change, mix, toHex } from "khroma";
import type { MermaidConfig } from "mermaid";

export function createMermaidConfig(theme: "light" | "dark"): MermaidConfig {
  const dark = theme === "dark";
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  const contentRadius = Number.parseFloat(token("--radius-content", "8px"));
  const inlineRadius = Number.parseFloat(token("--radius-inline", "4px"));
  const background = toHex(token("--btn-solid", dark ? "#282828" : "#f6f6f6"));
  // 透明颜色与阅读底色合成，图片内部无需依赖页面背景或 CSS 变量
  const opaque = (color: string) =>
    toHex(mix(change(color, { a: 1 }), background, alpha(color) * 100));
  const text = opaque(
    token("--label-primary", dark ? "#ffffffd9" : "#000000d9"),
  );
  const secondaryText = opaque(
    token("--label-secondary", dark ? "#ffffff8c" : "#00000080"),
  );
  const tint = (color: string, weight: number) =>
    toHex(mix(color, background, weight));
  const node = dark ? opaque(token("--fill-primary", "#ffffff1a")) : "#ffffff";
  const group = opaque(
    token("--fill-quaternary", dark ? "#ffffff08" : "#00000008"),
  );
  const border = tint(text, 48);
  const groupBorder = tint(text, 25);
  const accent = toHex(token("--color-accent", "#0091ff"));
  const success = toHex(
    token("--toast-icon-success", dark ? "#3bdb63" : "#30d158"),
  );
  const warning = toHex(
    token("--toast-icon-warning", dark ? "#ff9e33" : "#ff9230"),
  );
  const error = toHex(
    token("--toast-icon-error", dark ? "#ff4747" : "#ff4245"),
  );
  const accentFill = tint(accent, dark ? 22 : 12);
  const note = tint(warning, dark ? 18 : 10);
  const fontFamily = token(
    "--font-sans",
    '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro", sans-serif',
  );
  const accents = [
    accent,
    "#6d7cff",
    success,
    warning,
    "#ff375f",
    "#00d2e0",
    "#db34f2",
    "#b78a66",
    "#ffd600",
    error,
    "#3cd3fe",
    "#00dac3",
  ];
  const fills = accents.map((color) => tint(color, dark ? 28 : 24));
  const chartFills = accents.map((color) => tint(color, dark ? 32 : 45));
  const colors: Record<string, string> = {};
  accents.forEach((color, index) => {
    colors[`cScale${index}`] = fills[index]!;
    colors[`cScalePeer${index}`] = tint(color, dark ? 45 : 60);
    colors[`cScaleInv${index}`] = text;
    colors[`cScaleLabel${index}`] = text;
    colors[`pie${index + 1}`] = chartFills[index]!;
    if (index < 8) {
      colors[`fillType${index}`] = fills[index]!;
      colors[`git${index}`] = fills[index]!;
      colors[`gitInv${index}`] = text;
      colors[`gitBranchLabel${index}`] = text;
    }
  });
  for (let index = 0; index < 5; index++) {
    colors[`surface${index}`] = tint(
      text,
      dark ? 6 + index * 3 : 3 + index * 2,
    );
    colors[`surfacePeer${index}`] = tint(
      text,
      dark ? 10 + index * 3 : 7 + index * 2,
    );
  }

  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    look: "classic",
    darkMode: dark,
    htmlLabels: false,
    fontFamily,
    themeVariables: {
      darkMode: dark,
      background,
      fontFamily,
      fontSize: "14px",
      fontWeight: "400",
      radius: contentRadius,
      strokeWidth: 1,
      useGradient: false,
      dropShadow: "none",
      primaryColor: node,
      primaryTextColor: text,
      primaryBorderColor: border,
      secondaryColor: accentFill,
      secondaryTextColor: text,
      secondaryBorderColor: accent,
      tertiaryColor: group,
      tertiaryTextColor: text,
      tertiaryBorderColor: groupBorder,
      textColor: text,
      lineColor: secondaryText,
      arrowheadColor: secondaryText,
      nodeBkg: node,
      mainBkg: node,
      nodeBorder: border,
      nodeTextColor: text,
      clusterBkg: group,
      clusterBorder: groupBorder,
      titleColor: text,
      defaultLinkColor: secondaryText,
      edgeLabelBackground: background,
      noteBkgColor: note,
      noteTextColor: text,
      noteBorderColor: tint(warning, 50),
      noteFontWeight: "400",
      actorBkg: node,
      actorBorder: border,
      actorTextColor: text,
      actorLineColor: border,
      signalColor: secondaryText,
      signalTextColor: text,
      labelBoxBkgColor: group,
      labelBoxBorderColor: groupBorder,
      labelTextColor: text,
      loopTextColor: text,
      activationBkgColor: accentFill,
      activationBorderColor: accent,
      sequenceNumberColor: background,
      rectBkgColor: group,
      stateBkg: node,
      stateLabelColor: text,
      transitionColor: secondaryText,
      transitionLabelColor: text,
      labelBackgroundColor: background,
      compositeBackground: group,
      compositeTitleBackground: node,
      compositeBorder: groupBorder,
      altBackground: background,
      innerEndBackground: secondaryText,
      specialStateColor: secondaryText,
      classText: text,
      attributeBackgroundColorOdd: node,
      attributeBackgroundColorEven: group,
      rowOdd: node,
      rowEven: group,
      sectionBkgColor: group,
      altSectionBkgColor: background,
      sectionBkgColor2: group,
      excludeBkgColor: group,
      taskBkgColor: accentFill,
      taskBorderColor: accent,
      activeTaskBkgColor: tint(success, dark ? 22 : 14),
      activeTaskBorderColor: tint(success, 70),
      doneTaskBkgColor: group,
      doneTaskBorderColor: border,
      critBkgColor: tint(error, dark ? 24 : 14),
      critBorderColor: error,
      todayLineColor: error,
      taskTextColor: text,
      taskTextOutsideColor: text,
      taskTextLightColor: text,
      taskTextDarkColor: text,
      taskTextClickableColor: text,
      gridColor: groupBorder,
      vertLineColor: secondaryText,
      faceColor: note,
      personBkg: node,
      personBorder: border,
      scaleLabelColor: text,
      pieTitleTextSize: "17px",
      pieTitleTextColor: text,
      pieSectionTextSize: "14px",
      pieSectionTextColor: text,
      pieLegendTextSize: "13px",
      pieLegendTextColor: text,
      pieStrokeColor: background,
      pieStrokeWidth: "2px",
      pieOuterStrokeColor: background,
      pieOuterStrokeWidth: "0px",
      pieOpacity: "1",
      branchLabelColor: text,
      tagLabelColor: text,
      tagLabelBackground: note,
      tagBorder: tint(warning, 50),
      tagLabelBorder: tint(warning, 50),
      tagLabelFontSize: "12px",
      commitLabelColor: text,
      commitLabelBackground: background,
      commitLabelFontSize: "12px",
      requirementBackground: node,
      requirementBorderColor: border,
      requirementTextColor: text,
      relationColor: secondaryText,
      relationLabelBackground: background,
      relationLabelColor: text,
      archEdgeColor: secondaryText,
      archEdgeArrowColor: secondaryText,
      archEdgeWidth: "1.5",
      archGroupBorderColor: groupBorder,
      archGroupBorderWidth: "1px",
      quadrant1Fill: fills[0],
      quadrant2Fill: fills[1],
      quadrant3Fill: fills[2],
      quadrant4Fill: fills[3],
      quadrant1TextFill: text,
      quadrant2TextFill: text,
      quadrant3TextFill: text,
      quadrant4TextFill: text,
      quadrantPointFill: secondaryText,
      quadrantPointTextFill: text,
      quadrantXAxisTextFill: text,
      quadrantYAxisTextFill: text,
      quadrantInternalBorderStrokeFill: groupBorder,
      quadrantExternalBorderStrokeFill: border,
      quadrantTitleFill: text,
      xyChart: {
        backgroundColor: "transparent",
        titleColor: text,
        dataLabelColor: text,
        legendTextColor: text,
        xAxisTitleColor: text,
        xAxisLabelColor: secondaryText,
        xAxisTickColor: groupBorder,
        xAxisLineColor: border,
        yAxisTitleColor: text,
        yAxisLabelColor: secondaryText,
        yAxisTickColor: groupBorder,
        yAxisLineColor: border,
        plotColorPalette: accents.map((color) => tint(color, 75)).join(","),
      },
      radar: { axisColor: border, graticuleColor: groupBorder },
      ...colors,
    },
    // 使用局部选择器保留特殊形状，以及源码通过 style、classDef 指定的外观
    themeCSS: `
      text { fill: ${text}; }
      .titleText, text[font-size="4ex"] { font-size: 17px; font-weight: 500; }
      .lineWrapper line, line[stroke="black"][marker-end] {
        stroke: ${secondaryText};
        stroke-width: 1.5px;
      }
      marker[id$="-arrowhead"] path { fill: ${secondaryText}; }
      .eventWrapper { filter: none; }
      .edge[class*="edge-depth-"] { stroke-width: 2px; }
      ${accents.map((color, index) => `.section-edge-${index - 1} { stroke: ${tint(color, 65)}; }`).join("\n")}
      .node > rect.label-container:not([rx]), .node > rect.label-container[rx="0"],
      .node > rect.outer, .cluster > rect, rect.actor, rect.note, rect.labelBox {
        rx: ${contentRadius}px;
        ry: ${contentRadius}px;
      }
      .edgeLabel rect { opacity: 1; rx: ${inlineRadius}px; ry: ${inlineRadius}px; }
      .cluster-label text, .cluster-label span { font-weight: 500; }
      .flowchart-link, .transition, .messageLine0, .messageLine1 {
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `,
    flowchart: {
      padding: 12,
      nodeSpacing: 36,
      rankSpacing: 48,
      diagramPadding: 16,
    },
    sequence: {
      actorFontFamily: fontFamily,
      noteFontFamily: fontFamily,
      messageFontFamily: fontFamily,
      actorFontSize: 14,
      noteFontSize: 13,
      messageFontSize: 13,
      actorFontWeight: 500,
      noteFontWeight: 400,
      messageFontWeight: 400,
      diagramMarginX: 16,
      diagramMarginY: 16,
    },
    state: { fontSize: 14, radius: contentRadius },
    er: { fontSize: 14 },
    gantt: { fontSize: 13, sectionFontSize: 13 },
    xyChart: {
      titleFontSize: 17,
      legendFontSize: 13,
      xAxis: { labelFontSize: 13, titleFontSize: 14 },
      yAxis: { labelFontSize: 13, titleFontSize: 14 },
    },
    quadrantChart: {
      titleFontSize: 17,
      xAxisLabelFontSize: 13,
      yAxisLabelFontSize: 13,
      quadrantLabelFontSize: 14,
      pointLabelFontSize: 12,
    },
    journey: {
      actorColours: accents,
      titleColor: text,
      titleFontFamily: fontFamily,
      titleFontSize: "17px",
      sectionFills: fills,
      sectionColours: fills.map(() => text),
      taskFontSize: 14,
      taskFontFamily: fontFamily,
    },
    secure: [
      "secure",
      "securityLevel",
      "startOnLoad",
      "maxTextSize",
      "maxEdges",
      "suppressErrorRendering",
      "htmlLabels",
      "dompurifyConfig",
      "theme",
      "themeCSS",
      "themeVariables",
      "fontFamily",
      "darkMode",
      "look",
    ],
  };
}

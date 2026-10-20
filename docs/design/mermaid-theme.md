# Mermaid 图表视觉规范

Paimon 使用 Mermaid `base` 主题，并通过 `src/web/src/components/entries/mermaidTheme.ts` 生成亮色与暗色配置。

## 内容容器

Mermaid 的外框使用 `content-block`，标题栏使用公共 `ContentToolbar`，操作使用 `Button`，与普通代码块共用基本样式。规则位于 `src/web/src/index.css`，颜色引用项目 CSS variables。

- 外框采用 14px 圆角、8px 上下间距和 `--separator` 边框。
- 背景使用 `--fill-card`：亮色为黑色 3%，暗色为白色 8%。标题栏和内容区共同叠加在页面面板上。
- 类型标签采用 11px 系统字体、`--label-secondary`；操作使用 compact 按钮规格，字体为 12px。
- Mermaid 标题栏显示图表名称、源码复制和放大查看操作。
- 操作按钮使用公共聚焦、按下与 hover 反馈，常规指针下至少具有 36px 操作区域，触摸设备中至少为 44px；reduced motion 下关闭颜色与按下过渡。
- 代码正文保持 13px 等宽字体、20px 行高和现有语法高亮配色，内边距对应 `px-3 py-2.5`。图表使用相同内边距，内部字体与节点样式独立配置。
- Mermaid 源码复制成功后显示两秒反馈，卸载时清理计时器。
- 毛玻璃用于页面面板与预览控件；代码与图表内容块使用相同的半透明卡片背景。

## 颜色与文字

- SVG 与 XY chart 使用透明背景，卡片中的图表自然显示 `--fill-card` 背景；全屏预览使用相同 SVG 图片，并由 `ImageLightbox` 提供 `--btn-solid` 阅读底色。
- 默认字体使用 `--font-sans`。节点正文为 14px，时序图说明与图例为 13px，图表标题为 17px。源码可通过各图表独立配置自定义字体与字号，例如 `sequence.actorFontFamily` 和 `sequence.messageFontSize`。
- 主要文字、次要文字使用 `--label-primary`、`--label-secondary`。khroma 将透明颜色与参考底色 `--btn-solid` 合成，向 Mermaid 提供不透明的 HEX 色值。
- 普通节点使用中性表面。分组通过背景与边框区别于节点，连线标签使用阅读底色。
- 强调元素使用项目蓝色；注释采用淡橙色；甘特图的运行任务与关键任务使用绿色、红色。
- 多分类图表使用 macOS Accent Colors。分类填充与底色混合，保持文字可读性；思维导图、时间线、饼图、Git graph、quadrantChart 和 journey 使用同一组分类颜色。
- 默认主题的主要文字与填充背景对比度至少为 4.5:1，主要连线与参考底色、分组背景至少为 3:1；卡片背景下的页面效果由用户检查。源码指定的颜色由图表作者控制。

## 图形与展示

- 常见矩形节点、分组、时序图参与者和注释使用 8px 圆角，连线标签使用 4px 圆角。
- 判断、圆形、数据库、终止节点等特殊形状保留各自的结构。
- 主题样式使用局部 CSS 选择器，保留源码中的 `style`、`classDef`、`linkStyle` 以及显式圆角设置。
- 图表生成提示支持 reduced motion。
- 临时渲染容器使用 960px 布局宽度，使 gantt 等依赖容器尺寸的图表拥有稳定的原始尺寸。图表图片适应卡片宽度，完整阅读可使用全屏预览与原始尺寸模式。
- 毛玻璃应用于外部面板与预览控件，卡片使用半透明背景，全屏预览提供独立阅读底色。

## 渲染约定

Mermaid、DOMPurify、主题配置和 khroma 按需加载。渲染串行执行，切换主题时重新生成 SVG，保留预览窗口、尺寸模式和阅读位置。

`securityLevel: "strict"`、`htmlLabels: false` 与 DOMPurify 的 SVG 清理共同用于图片展示。`secure` 保护顶层 `theme`、`themeVariables`、`themeCSS`、`fontFamily`、`darkMode` 和 `look` 等配置。源码可通过各图表独立配置覆盖默认字体与字号，也可使用局部样式。

## 验证

```bash
bun test
bunx tsc --noEmit
bun run build
```

单元测试覆盖主题配置、颜色转换、文字与连线对比度、源码复制、渲染队列、流式更新和预览生命周期。页面的配色、排版和交互效果由用户验证。

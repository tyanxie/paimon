# macOS 26 Design Tokens

从 Figma 文件 `macOS 26 (Community)` 提取。
数据来源: `design-tokens.tokens.json` (Design Tokens 插件导出) + Figma REST API 原始数据

---

## Accent Colors (强调色)

### Opaque (标准)

| 名称     | 色值          |
| -------- | ------------- |
| Red      | `#ff4245`     |
| Orange   | `#ff9230`     |
| Yellow   | `#ffd600`     |
| Green    | `#30d158`     |
| Mint     | `#00dac3`     |
| Teal     | `#00d2e0`     |
| Cyan     | `#3cd3fe`     |
| **Blue** | **`#0091ff`** |
| Indigo   | `#6d7cff`     |
| Purple   | `#db34f2`     |
| Pink     | `#ff375f`     |
| Brown    | `#b78a66`     |

### Vibrant (鲜艳)

| 名称     | 色值          |
| -------- | ------------- |
| Red      | `#ff4747`     |
| Orange   | `#ff9e33`     |
| Yellow   | `#ffe014`     |
| Green    | `#3bdb63`     |
| Mint     | `#2de0cd`     |
| Teal     | `#2dd7e0`     |
| Cyan     | `#47d8fc`     |
| **Blue** | **`#0a99ff`** |
| Indigo   | `#7163ff`     |
| Purple   | `#e647fc`     |
| Pink     | `#ff4169`     |
| Brown    | `#c29672`     |

---

## Labels (文字颜色)

### Dark Mode (白字，Alpha 透明度)

| 级别       | 色值                    | 用途      |
| ---------- | ----------------------- | --------- |
| Primary    | `#ffffffd9` (white/85%) | 主要文字  |
| Secondary  | `#ffffff8c` (white/55%) | 次要文字  |
| Tertiary   | `#ffffff40` (white/25%) | 辅助文字  |
| Quaternary | `#ffffff1a` (white/10%) | 占位/禁用 |
| Quinary    | `#ffffff0d` (white/5%)  | 极弱提示  |
| Seximal    | `#ffffff08` (white/3%)  | 最弱      |
| White      | `#ffffff`               | 纯白      |

### Light Mode (黑字，Alpha 透明度)

| 级别       | 色值                    | 用途      |
| ---------- | ----------------------- | --------- |
| Primary    | `#000000d9` (black/85%) | 主要文字  |
| Secondary  | `#00000080` (black/50%) | 次要文字  |
| Tertiary   | `#00000040` (black/25%) | 辅助文字  |
| Quaternary | `#0000001a` (black/10%) | 占位/禁用 |
| Quinary    | `#0000000d` (black/5%)  | 极弱提示  |
| Seximal    | `#00000008` (black/3%)  | 最弱      |

### Vibrant (Plus Lighter/Darker 混合模式)

| 级别       | 色值      |
| ---------- | --------- |
| Primary    | `#f5f5f5` |
| Secondary  | `#8a8a8a` |
| Tertiary   | `#404040` |
| Quaternary | `#262626` |
| Quinary    | `#111111` |

### Grays

| 名称  | 色值      |
| ----- | --------- |
| Black | `#000000` |
| White | `#ffffff` |
| Gray  | `#98989f` |

---

## Fills (填充色)

### Dark Mode - Opaque (白色叠加，用于暗色背景)

| 级别       | 色值                    |
| ---------- | ----------------------- |
| Primary    | `#ffffff1a` (white/10%) |
| Secondary  | `#ffffff14` (white/8%)  |
| Tertiary   | `#ffffff0d` (white/5%)  |
| Quaternary | `#ffffff08` (white/3%)  |
| Quinary    | `#ffffff05` (white/2%)  |

### Light Mode - Opaque (黑色叠加，用于亮色背景)

| 级别       | 色值                    |
| ---------- | ----------------------- |
| Primary    | `#0000001a` (black/10%) |
| Secondary  | `#00000014` (black/8%)  |
| Tertiary   | `#0000000d` (black/5%)  |
| Quaternary | `#00000008` (black/3%)  |
| Quinary    | `#00000005` (black/2%)  |

### Vibrant (Plus Lighter/Darker 混合模式)

| 级别       | 色值      |
| ---------- | --------- |
| Primary    | `#242424` |
| Secondary  | `#141414` |
| Tertiary   | `#0d0d0d` |
| Quaternary | `#090909` |
| Quinary    | `#070707` |

---

## Materials (毛玻璃材质)

### Light Mode (color.materials)

| 级别        | 色值 (含 alpha) | 等效            |
| ----------- | --------------- | --------------- |
| Ultra Thin  | `#f6f6f65c`     | `#f6f6f6` / 36% |
| Thin        | `#f6f6f67a`     | `#f6f6f6` / 48% |
| Medium      | `#f6f6f699`     | `#f6f6f6` / 60% |
| Thick       | `#f6f6f6b8`     | `#f6f6f6` / 72% |
| Ultra Thick | `#f6f6f6d6`     | `#f6f6f6` / 84% |

### Dark Mode (color.materials + appearance.material)

| 级别        | color.materials         | appearance.material       |
| ----------- | ----------------------- | ------------------------- |
| Ultra Thin  | `#0000001a` (black/10%) | `#28282866` (#282828/40%) |
| Thin        | `#00000033` (black/20%) | `#28282880` (#282828/50%) |
| Medium      | `#0000004a` (black/29%) | `#28282899` (#282828/60%) |
| Thick       | `#00000066` (black/40%) | `#282828b3` (#282828/70%) |
| Ultra Thick | `#00000080` (black/50%) | `#282828cc` (#282828/80%) |

背景模糊: **30px** (所有级别)

---

## Separator

| 变体    | 色值      |
| ------- | --------- |
| Vibrant | `#404042` |

---

## Glyphs (图标颜色)

| 状态               | 色值                                  |
| ------------------ | ------------------------------------- |
| Neutral - Idle     | = labels vibrant primary (`#f5f5f5`)  |
| Neutral - Disabled | = labels vibrant tertiary (`#404040`) |
| Primary - Idle     | `#ffffff`                             |
| Primary - Disabled | `#ffffff80` (white/50%)               |

---

## Liquid Glass

### 参数 (kit.liquid glass)

| 属性        | Regular | Medium | Large |
| ----------- | ------- | ------ | ----- |
| Depth       | 16      | 16     | 16    |
| Frost       | 7       | 12     | 14    |
| Splay       | 6       | 6      | 6     |
| Light Angle | -45°    | -45°   | -45°  |
| Refraction  | 100     | 100    | 100   |
| Dispersion  | 0       | 0      | 0     |
| Opacity     | 60%     | 60%    | 60%   |

### Shadow

| 属性                | 值   |
| ------------------- | ---- |
| Shadow Blur (Layer) | 30px |
| Shadow Blur (BG)    | 60px |

### Large (圆角 34px)

| Mode  | 填充叠层                                                           | 阴影                          |
| ----- | ------------------------------------------------------------------ | ----------------------------- |
| Light | `#262626` base → `#fafafa`/0.8 overlay                             | `0 8px 40px rgba(0,0,0,0.12)` |
| Dark  | `#cccccc` base → `#000000`/0.85 overlay → `#ffffff`/0.03 highlight | `0 8px 40px rgba(0,0,0,0.12)` |

Glass Effect 层: `#000000`/0.2

### Medium (圆角 34px)

| Mode  | 填充叠层                                                           | 阴影                          |
| ----- | ------------------------------------------------------------------ | ----------------------------- |
| Light | `#262626` base → `#f5f5f5`/0.67 overlay                            | `0 8px 40px rgba(0,0,0,0.12)` |
| Dark  | `#cccccc` base → `#000000`/0.67 overlay → `#ffffff`/0.03 highlight | `0 8px 40px rgba(0,0,0,0.12)` |

### Small / Controls (圆角 pill)

| Mode  | State   | 填充                                           |
| ----- | ------- | ---------------------------------------------- |
| Light | Default | `#333333` → `#ffffff`/0.5 → `#f7f7f7`          |
| Light | Primary | `#ffffff`/0.5 → tint `#0091ff`                 |
| Dark  | Default | `#cccccc`/0.5 → `#000000`/0.6 → `#ffffff`/0.06 |
| Dark  | Primary | `#ffffff`/0.5 → tint `#0091ff`                 |

---

## Sizes (尺寸)

### Global

| 属性           | 值   |
| -------------- | ---- |
| Control Height | 36px |
| Control Radius | 9px  |
| Font Size      | 13px |

### Button

| 属性               | 值            |
| ------------------ | ------------- |
| Padding Horizontal | 16px          |
| Radius             | 1000px (pill) |

### Fields (输入框)

| 属性                 | 值   |
| -------------------- | ---- |
| Inset Left           | 10px |
| Inset Right          | 8px  |
| Search Glyph Size    | 13px |
| Search Glyph Leading | 15px |

### Menu

| 属性                | 值   |
| ------------------- | ---- |
| Height              | 24px |
| Font Size           | 13px |
| Symbol Width        | 12px |
| Separator Inset     | 18px |
| Header Inset Left   | 18px |
| Header Inset Top    | 5px  |
| Header Inset Bottom | 4px  |

### Segmented Control

| 属性             | 值   |
| ---------------- | ---- |
| Margins          | 14px |
| Separator Height | 20px |

---

## Window (从 API 数据)

| 属性          | Light                       | Dark (推断)                |
| ------------- | --------------------------- | -------------------------- |
| Corner Radius | 26px                        | 26px                       |
| Background    | `#ffffff`                   | `#1e1e1e`                  |
| Shadow        | `0 0 48px rgba(0,0,0,0.12)` | `0 0 48px rgba(0,0,0,0.4)` |
| Inner Shadow  | radius=0 (边缘线)           | radius=0                   |

---

## Sidebar (从 API 数据)

| 属性                   | 值                  |
| ---------------------- | ------------------- |
| Width                  | 240px               |
| Padding                | 8px (all)           |
| Panel Radius           | 18px                |
| Panel Fill (Light)     | Liquid Glass Medium |
| Item Outer Padding     | 0 10px              |
| Item Inner Radius      | 8px                 |
| Item Inner Padding     | 4px 10px 4px 6px    |
| Item Gap               | 4px                 |
| Selected Fill          | `#000000`/0.11      |
| Section Header Padding | 15px 12px 5px 18px  |
| Section Header Font    | SF Pro 11px w700    |
| Section Header Color   | `#000000`/0.5       |

---

## Toolbar (从 API 数据)

| 属性                     | 值               |
| ------------------------ | ---------------- |
| Height                   | ~52px            |
| Padding                  | 8px              |
| Gap                      | 8px              |
| Search Radius            | pill (100px)     |
| Search Padding           | 0 10px           |
| Search Gap               | 6px              |
| Search Placeholder Color | `#727272`        |
| Search Font              | SF Pro 13px w510 |

---

## Typography

字体族: **SF Pro** (Web fallback: `-apple-system, BlinkMacSystemFont, Inter, sans-serif`)

| Style       | Size | Weight (Regular) | Weight (Emphasized) | Line Height |
| ----------- | ---- | ---------------- | ------------------- | ----------- |
| Large Title | 26px | 400              | 700                 | 32px        |
| Title 1     | 22px | 400              | 700                 | 26px        |
| Title 2     | 17px | 400              | 700                 | 22px        |
| Title 3     | 15px | 400              | 600                 | 20px        |
| Headline    | 13px | 700              | 900                 | 16px        |
| Body        | 13px | 400              | 600                 | 16px        |
| Callout     | 12px | 400              | 600                 | 15px        |
| Subheadline | 11px | 400              | 600                 | 14px        |
| Footnote    | 10px | 400              | 600                 | 13px        |
| Caption 1   | 10px | 400              | 500                 | 13px        |
| Caption 2   | 10px | 500              | 600                 | 13px        |

---

## Paimon 项目适用总结

### 核心设计值

```
--radius-window: 26px;
--radius-panel: 18px;
--radius-item: 8px;
--radius-control: 9px;
--radius-button: 1000px;  /* pill */

--shadow-window: 0 0 48px rgba(0,0,0,0.12);
--shadow-panel: 0 8px 40px rgba(0,0,0,0.12);

--blur-material: 30px;
--blur-layer: 30px;
--blur-bg: 60px;

--accent: #0091ff;
--accent-vibrant: #0a99ff;

--control-height: 36px;
--font-size-base: 13px;
```

### Tailwind 映射建议

```js
// tailwind.config.js
theme: {
  extend: {
    borderRadius: {
      'window': '26px',
      'panel': '18px',
      'item': '8px',
      'control': '9px',
    },
    backdropBlur: {
      'material': '30px',
      'bg': '60px',
    },
    boxShadow: {
      'window': '0 0 48px rgba(0,0,0,0.12)',
      'panel': '0 8px 40px rgba(0,0,0,0.12)',
    },
    fontSize: {
      'large-title': ['26px', '32px'],
      'title-1': ['22px', '26px'],
      'title-2': ['17px', '22px'],
      'title-3': ['15px', '20px'],
      'headline': ['13px', '16px'],
      'body': ['13px', '16px'],
      'callout': ['12px', '15px'],
      'subheadline': ['11px', '14px'],
      'footnote': ['10px', '13px'],
      'caption': ['10px', '13px'],
    },
    colors: {
      accent: {
        DEFAULT: '#0091ff',
        vibrant: '#0a99ff',
      },
      // Dark mode labels (白字)
      'label-dark': {
        primary: 'rgba(255,255,255,0.85)',
        secondary: 'rgba(255,255,255,0.55)',
        tertiary: 'rgba(255,255,255,0.25)',
      },
      // Light mode labels (黑字)
      'label-light': {
        primary: 'rgba(0,0,0,0.85)',
        secondary: 'rgba(0,0,0,0.50)',
        tertiary: 'rgba(0,0,0,0.25)',
      },
    }
  }
}
```

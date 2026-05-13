"""
Paimon logo 生成脚本。

按 Web 外观的 data-bg / data-theme 组合生成 6 套 logo：
- 背景色使用对应背景预设的四色渐变
- 文字和分界线使用同一 data-bg 的反向主题预设色，保证对比度
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
PADDING = 130
CX = CY = SIZE // 2
MAX_R = SIZE // 2 - 2

# === 路径 ===
DESIGN_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DESIGN_DIR.parents[1]
PUBLIC_DIR = PROJECT_ROOT / "src" / "web" / "public"
OUTPUT_DIRS = [
    DESIGN_DIR / "logos",
    PUBLIC_DIR / "logos",
]

# === 配色 ===
THEMES = {
    "mist": {
        "light": ["#e8f0fe", "#f5e6f0", "#e6f0f5", "#f0f5e6"],
        "dark": ["#1a1a2e", "#2d1b3e", "#1b2838", "#1e2e1e"],
        "text": {"light": "#1b2838", "dark": "#e6f0f5"},
        "divider": {"light": "#2d1b3e", "dark": "#f5e6f0"},
    },
    "aurora": {
        "light": ["#a8d8ea", "#aa96da", "#8fd3c4", "#c4a8d8"],
        "dark": ["#0d1b2a", "#1b0033", "#0a2e26", "#1a0a2e"],
        "text": {"light": "#0d1b2a", "dark": "#a8d8ea"},
        "divider": {"light": "#1b0033", "dark": "#aa96da"},
    },
    "ember": {
        "light": ["#f8d4b0", "#f0b0c0", "#f8e0a0", "#e8c0d0"],
        "dark": ["#2e1a0a", "#3e1b2d", "#2e2410", "#2d1a2e"],
        "text": {"light": "#2e1a0a", "dark": "#f8d4b0"},
        "divider": {"light": "#3e1b2d", "dark": "#f0b0c0"},
    },
}

# === 布局参数 ===
GROUP_SHIFT = 30          # 文字组整体下移
PAI_OFFSET = -20          # PAI 微调（负=上移）
MON_COMPENSATION = 135    # MON 视觉补偿（字重较轻，往上靠）
TARGET_H_RATIO = 0.92     # 字号高度占比
TARGET_W_RATIO = 0.78     # 字号宽度占比
LINE_W = 5                # 分割线核心宽度
LINE_ALPHA = 140          # 分割线透明度
GLOW_MID_ALPHA = 50
GLOW_OUTER_ALPHA = 18
TEXT_ALPHA = 235

# === 字体 ===
BOLD = "/usr/share/fonts/truetype/inter/Inter-Bold.ttf"
SEMIBOLD = "/usr/share/fonts/truetype/inter/Inter-SemiBold.ttf"
try:
    ImageFont.truetype(BOLD, 100)
except OSError:
    BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    SEMIBOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return int(a + (b - a) * t)


def interpolate_stops(stops, t):
    """按 0-1 位置在多段颜色中插值。"""
    if t <= 0:
        return stops[0]
    if t >= 1:
        return stops[-1]

    segment_count = len(stops) - 1
    position = t * segment_count
    index = min(int(position), segment_count - 1)
    local_t = position - index
    start = stops[index]
    end = stops[index + 1]
    return tuple(lerp(start[i], end[i], local_t) for i in range(3))


def measure(text, path, size):
    f = ImageFont.truetype(path, size)
    b = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), text, font=f)
    return b[2] - b[0], b[3] - b[1]


def fill_squircle(img, stops):
    """逐像素填充 squircle 四色对角渐变底色。"""
    for y in range(SIZE):
        for x in range(SIZE):
            if ((x - CX) / MAX_R) ** 4 + ((y - CY) / MAX_R) ** 4 <= 1.0:
                t = (x + y) / (2 * (SIZE - 1))
                r, g, b = interpolate_stops(stops, t)
                img.putpixel((x, y), (r, g, b, 255))


def add_shine(img):
    """顶部柔光。"""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(0, int(SIZE * 0.48)):
        for x in range(SIZE):
            if ((x - CX) / MAX_R) ** 4 + ((y - CY) / MAX_R) ** 4 <= 1.0:
                t = max(0, 1 - y / (SIZE * 0.45))
                a = int(35 * t**2.5 * (1 - abs(x - CX) / (SIZE / 3)))
                if a > 0:
                    d.point((x, y), (255, 255, 255, a))
    return Image.alpha_composite(img, layer)


def add_rim(img, color):
    """底部边缘淡色反光。"""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(SIZE):
        for x in range(SIZE):
            v = ((x - CX) / MAX_R) ** 4 + ((y - CY) / MAX_R) ** 4
            if 0.88 <= v <= 1.02:
                ty = y / SIZE
                a = int(15 * ty * (1 - abs(x - CX) / (SIZE / 3.2)))
                if a > 0:
                    d.point((x, y), (*color, a))
    return Image.alpha_composite(img, layer)


def apply_squircle_mask(img):
    """将 squircle 外的区域设为透明。"""
    mask = Image.new("L", (SIZE, SIZE), 0)
    for y in range(SIZE):
        for x in range(SIZE):
            if ((x - CX) / MAX_R) ** 4 + ((y - CY) / MAX_R) ** 4 <= 1.0:
                mask.putpixel((x, y), 255)
    img.putalpha(mask)


def find_font_size(text, font_path, target_h, target_w_max):
    """二分查找最大字号。"""
    lo, hi = 50, 600
    best = 50
    while lo <= hi:
        mid = (lo + hi) // 2
        w, h = measure(text, font_path, mid)
        if h <= target_h and w <= target_w_max:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def save_browser_icons(source_img):
    """用 mist/light logo 派生浏览器固定入口图标。"""
    icons = {
        "apple-touch-icon.png": (180, 180),
        "favicon-32.png": (32, 32),
        "favicon-16.png": (16, 16),
    }
    for filename, size in icons.items():
        target = PUBLIC_DIR / filename
        source_img.resize(size, Image.Resampling.LANCZOS).save(target)
        print(f"Generated {target}")

    favicon = PUBLIC_DIR / "favicon.ico"
    source_img.save(favicon, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"Generated {favicon}")


def create_logo(bg_name, theme_name):
    palette = THEMES[bg_name]
    stops = [hex_to_rgb(value) for value in palette[theme_name]]
    text = (*hex_to_rgb(palette["text"][theme_name]), TEXT_ALPHA)
    divider = hex_to_rgb(palette["divider"][theme_name])

    usable = SIZE - 2 * PADDING
    target_h = int(usable // 2 * TARGET_H_RATIO)
    target_w_max = int(usable * TARGET_W_RATIO)

    size_top = find_font_size("PAI", BOLD, target_h, target_w_max)
    size_bot = find_font_size("MON", SEMIBOLD, target_h, target_w_max)

    tw, th = measure("PAI", BOLD, size_top)
    bw, bh = measure("MON", SEMIBOLD, size_bot)

    fb = ImageFont.truetype(BOLD, size_top)
    fs = ImageFont.truetype(SEMIBOLD, size_bot)

    divider_y = SIZE // 2 + GROUP_SHIFT
    max_gap_top = divider_y - PADDING - th
    max_gap_bot = SIZE - PADDING - divider_y - bh
    gap = (max_gap_top + max_gap_bot) // 2

    top_base = divider_y - gap - PAI_OFFSET
    bot_base = divider_y + gap + bh - MON_COMPENSATION

    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fill_squircle(img, stops)

    draw = ImageDraw.Draw(img)
    draw.text((CX - tw // 2, top_base - th), "PAI", fill=text, font=fb)
    draw.text((CX - bw // 2, bot_base - bh), "MON", fill=text, font=fs)

    llen = int(min(tw, bw) * 0.65)
    lx = CX - llen // 2
    draw.line([(lx - 22, divider_y), (lx + llen + 22, divider_y)],
              fill=(*divider, GLOW_OUTER_ALPHA), width=30)
    draw.line([(lx - 8, divider_y), (lx + llen + 8, divider_y)],
              fill=(*divider, GLOW_MID_ALPHA), width=15)
    draw.line([(lx, divider_y), (lx + llen, divider_y)],
              fill=(*divider, LINE_ALPHA), width=LINE_W)

    img = add_shine(img)
    img = add_rim(img, divider)
    apply_squircle_mask(img)
    return img, size_top, size_bot, divider_y - top_base, bot_base - bh - divider_y


def main():
    default_logo = None
    for bg_name in THEMES:
        for theme_name in ("light", "dark"):
            img, size_top, size_bot, gap_top, gap_bottom = create_logo(bg_name, theme_name)
            if bg_name == "mist" and theme_name == "light":
                default_logo = img.copy()
            for output_dir in OUTPUT_DIRS:
                target = output_dir / bg_name / theme_name / "paimon-logo.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                img.save(target)
                print(
                    f"Generated {target} "
                    f"PAI={size_top}pt MON={size_bot}pt gap={gap_top}/{gap_bottom}"
                )

    if default_logo is not None:
        save_browser_icons(default_logo)


if __name__ == "__main__":
    main()

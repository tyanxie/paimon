"""
Paimon logo - 雾主题浅色模式
颜色全部取自 CSS 雾背景四色: #e8f0fe #f5e6f0 #e6f0f5 #f0f5e6
"""
from PIL import Image, ImageDraw, ImageFont
import math

SIZE = 1024
PADDING = 130
CX = CY = SIZE // 2
MAX_R = SIZE // 2 - 2

# === 颜色 ===
BG_TOP = (0xE8, 0xF0, 0xFE)      # #e8f0fe 浅蓝
BG_BOTTOM = (0xF0, 0xF5, 0xE6)   # #f0f5e6 浅绿
TEXT = (0x4A, 0x58, 0x62, 230)   # #e6f0f5 加深灰
DIVIDER = (0x9A, 0xB8, 0xC4)     # #e6f0f5 加深

# === 布局参数 ===
GROUP_SHIFT = 30          # 文字组整体下移
PAI_OFFSET = -20           # PAI 微调（负=上移）
MON_COMPENSATION = 135     # MON 视觉补偿（字重较轻，往上靠）
TARGET_H_RATIO = 0.92      # 字号高度占比
TARGET_W_RATIO = 0.78      # 字号宽度占比
LINE_W = 5                 # 分割线核心宽度
LINE_ALPHA = 140           # 分割线透明度
GLOW_MID_ALPHA = 50
GLOW_OUTER_ALPHA = 18

# === 字体 ===
BOLD = "/usr/share/fonts/truetype/inter/Inter-Bold.ttf"
SEMIBOLD = "/usr/share/fonts/truetype/inter/Inter-SemiBold.ttf"
try:
    ImageFont.truetype(BOLD, 100)
except OSError:
    BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    SEMIBOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def measure(text, path, size):
    f = ImageFont.truetype(path, size)
    b = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), text, font=f)
    return b[2] - b[0], b[3] - b[1]


def fill_squircle(img, color_top, color_bottom):
    """逐像素填充 squircle 渐变底色"""
    for y in range(SIZE):
        for x in range(SIZE):
            if ((x - CX) / MAX_R) ** 4 + ((y - CY) / MAX_R) ** 4 <= 1.0:
                t = (x + y) / (2 * SIZE)
                r = int(color_top[0] + (color_bottom[0] - color_top[0]) * t)
                g = int(color_top[1] + (color_bottom[1] - color_top[1]) * t)
                b = int(color_top[2] + (color_bottom[2] - color_top[2]) * t)
                img.putpixel((x, y), (r, g, b, 255))


def add_shine(img):
    """顶部柔光"""
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


def add_rim(img):
    """底部边缘淡色反光"""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(SIZE):
        for x in range(SIZE):
            v = ((x - CX) / MAX_R) ** 4 + ((y - CY) / MAX_R) ** 4
            if 0.88 <= v <= 1.02:
                ty = y / SIZE
                a = int(15 * ty * (1 - abs(x - CX) / (SIZE / 3.2)))
                if a > 0:
                    d.point((x, y), (180, 170, 200, a))
    return Image.alpha_composite(img, layer)


def apply_squircle_mask(img):
    """将 squircle 外的区域设为透明"""
    mask = Image.new("L", (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)
    for y in range(SIZE):
        for x in range(SIZE):
            if ((x - CX) / MAX_R) ** 4 + ((y - CY) / MAX_R) ** 4 <= 1.0:
                mask.putpixel((x, y), 255)
    img.putalpha(mask)


def find_font_size(text, font_path, target_h, target_w_max):
    """二分查找最大字号"""
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


# ============================================================
# 主流程
# ============================================================

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

# 画布
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
fill_squircle(img, BG_TOP, BG_BOTTOM)

draw = ImageDraw.Draw(img)
draw.text((CX - tw // 2, top_base - th), "PAI", fill=TEXT, font=fb)
draw.text((CX - bw // 2, bot_base - bh), "MON", fill=TEXT, font=fs)

# 分割线（核心 + 两层发光）
llen = int(min(tw, bw) * 0.65)
lx = CX - llen // 2
draw.line([(lx - 22, divider_y), (lx + llen + 22, divider_y)],
          fill=(*DIVIDER, GLOW_OUTER_ALPHA), width=30)
draw.line([(lx - 8, divider_y), (lx + llen + 8, divider_y)],
          fill=(*DIVIDER, GLOW_MID_ALPHA), width=15)
draw.line([(lx, divider_y), (lx + llen, divider_y)],
          fill=(*DIVIDER, LINE_ALPHA), width=LINE_W)

img = add_shine(img)
img = add_rim(img)
apply_squircle_mask(img)

img.save("/data/home/tyanxie/Projects/tyanxie/paimon/docs/design/paimon-logo.png")
print(f"Done! PAI={size_top}pt MON={size_bot}pt  gap: {divider_y - top_base} / {bot_base - bh - divider_y}")
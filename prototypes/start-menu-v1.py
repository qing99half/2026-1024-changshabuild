"""Standalone start-menu concept render. Does not change the game UI."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path(__file__).with_suffix(".png")
S = 2
W, H = 1600, 900
FONT = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"


def scale_box(box):
    return tuple(int(v * S) for v in box)


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, int(size * S))


def txt(x, y, value, size, color, bold=False, anchor=None):
    draw.text((int(x * S), int(y * S)), value, font=font(size, bold), fill=color, anchor=anchor)


def rect(box, fill, radius=0, outline=None, width=1):
    draw.rounded_rectangle(scale_box(box), radius=int(radius * S), fill=fill, outline=outline, width=int(width * S))


def line(points, fill, width=1, joint="curve"):
    draw.line([(int(x * S), int(y * S)) for x, y in points], fill=fill, width=int(width * S), joint=joint)


def ellipse(box, fill=None, outline=None, width=1):
    draw.ellipse(scale_box(box), fill=fill, outline=outline, width=int(width * S))


img = Image.new("RGB", (W * S, H * S), "#17181b")
draw = ImageDraw.Draw(img)

# Quiet game-field atmosphere, leaving the actual UI hierarchy legible.
for i in range(65, 0, -1):
    c = (800, 450)
    r = 420 + i * 9
    opacity = int(12 * (1 - i / 66))
    ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), outline=(29 + opacity, 30 + opacity, 34 + opacity), width=2)
for x in range(0, W, 80):
    line([(x, 0), (x, H)], "#202126")
for y in range(0, H, 80):
    line([(0, y), (W, y)], "#202126")

# Top bar.
rect((36, 32, 1564, 868), None, 24, "#3a3b3f", 2)
txt(78, 62, "ONE BUTTON ARCADE", 17, "#e47368", True)
line([(78, 101), (504, 101)], "#535053", 2)

# Right upper brand block.
txt(1520, 72, "RIGHTY", 49, "#f4f0ea", True, "ra")
txt(1520, 129, "TIGHTY", 49, "#f4f0ea", True, "ra")
txt(1521, 185, "99", 82, "#e2665b", True, "ra")
txt(1520, 290, "点击即右转  ·  极简街机", 19, "#a9a9ad", False, "ra")

# The three parts of the gameplay loop remain visible on the landing screen.
txt(78, 128, "玩法速览", 43, "#f6f3ef", True)
txt(78, 189, "看懂规则，再挑战高分", 20, "#aeb0b5")

card_x0, card_x1 = 78, 504
cards = [(240, "01", "点击屏幕 / 按空格", "每次右转 90°", "turn"),
         (407, "02", "抓取小球", "带回光环即可得分", "gather"),
         (574, "03", "躲避敌人", "碰到敌人或边界即结束", "avoid")]
for y, number, title, detail, kind in cards:
    rect((card_x0, y, card_x1, y + 147), "#242529", 18, "#414248", 2)
    rect((card_x0 + 16, y + 17, card_x0 + 53, y + 54), "#d96057", 9)
    txt(card_x0 + 34.5, y + 37, number, 16, "#fff", True, "mm")
    txt(card_x0 + 78, y + 22, title, 27, "#f5f3ee", True)
    txt(card_x0 + 78, y + 65, detail, 20, "#b1b2b6")
    line([(card_x0 + 78, y + 108), (card_x1 - 22, y + 108)], "#393a40", 2)
    if kind == "turn":
        ellipse((card_x0 + 92, y + 117, card_x0 + 111, y + 136), "#dc675d")
        line([(card_x0 + 111, y + 127), (card_x0 + 171, y + 127), (card_x0 + 171, y + 115)], "#e4dfd8", 4)
        line([(card_x0 + 160, y + 122), (card_x0 + 171, y + 112), (card_x0 + 181, y + 122)], "#e4dfd8", 4)
        txt(card_x0 + 220, y + 112, "右转 90°", 17, "#efaa9e")
    elif kind == "gather":
        ellipse((card_x0 + 95, y + 115, card_x0 + 115, y + 135), "#fff5d5")
        line([(card_x0 + 122, y + 125), (card_x0 + 215, y + 125)], "#a9a9aa", 3)
        line([(card_x0 + 204, y + 118), (card_x0 + 217, y + 125), (card_x0 + 204, y + 132)], "#a9a9aa", 3)
        ellipse((card_x0 + 225, y + 112, card_x0 + 251, y + 138), outline="#eef2ee", width=4)
        txt(card_x0 + 286, y + 112, "+1 分", 17, "#b5e2cf")
    else:
        ellipse((card_x0 + 96, y + 117, card_x0 + 115, y + 136), "#dc675d")
        line([(card_x0 + 125, y + 127), (card_x0 + 217, y + 127)], "#a7a8ac", 3)
        rect((card_x0 + 225, y + 116, card_x0 + 253, y + 138), "#e59156", 4)
        txt(card_x0 + 286, y + 112, "避开危险", 17, "#f0b49c")

txt(80, 791, "最高分  0", 22, "#ece8e4", True)
txt(278, 791, "可用点数  0", 22, "#ece8e4", True)

# Central skin selection is the largest focal point.
txt(841, 101, "切换小球", 30, "#e8e2dd", True, "mm")
txt(841, 143, "左右选择你要出场的小球", 18, "#9fa0a5", False, "mm")

ellipse((668, 178, 1014, 524), outline="#37373c", width=2)
ellipse((703, 213, 979, 489), outline="#494044", width=3)
ellipse((734, 244, 948, 458), outline="#6c383a", width=2)
ellipse((749, 259, 933, 443), "#aa3737")
ellipse((761, 268, 923, 430), "#d75a53")
ellipse((782, 284, 873, 350), "#f38c7b")
ellipse((819, 333, 914, 421), "#bd4643")

rect((577, 310, 641, 374), "#313238", 18, "#616168", 2)
txt(609, 339, "‹", 55, "#f0ece8", True, "mm")
rect((1041, 310, 1105, 374), "#313238", 18, "#616168", 2)
txt(1073, 339, "›", 55, "#f0ece8", True, "mm")
txt(841, 473, "经典红", 35, "#f8f4ef", True, "mm")
txt(841, 517, "已拥有  ·  原版圆环  ·  清脆音色", 18, "#c5b9b7", False, "mm")
txt(841, 555, "◦ 试听转向音效", 17, "#e7a59d", False, "mm")

rect((628, 603, 1054, 679), "#d45e55", 14)
txt(841, 642, "开始游戏", 31, "#fff9f4", True, "mm")
txt(1011, 642, "↗", 32, "#fff9f4", True, "mm")
rect((628, 702, 829, 766), "#292a2e", 12, "#7b6766", 2)
txt(728.5, 734, "教程", 24, "#f3ece8", True, "mm")
rect((853, 702, 1054, 766), "#292a2e", 12, "#7b6766", 2)
txt(953.5, 734, "设置", 24, "#f3ece8", True, "mm")
txt(841, 810, "首次游玩会进入教程  ·  之后可随时重看", 17, "#929397", False, "mm")

# A small right-side preview ties the three steps into one journey.
rect((1189, 363, 1523, 722), "#222327", 18, "#3c3d42", 2)
txt(1214, 393, "本局目标", 24, "#ede9e4", True)
txt(1214, 430, "拾取  →  返回  →  得分", 17, "#b6b7ba")
ellipse((1229, 500, 1275, 546), "#d85d55")
line([(1272, 522), (1346, 522), (1346, 611), (1442, 611)], "#cc7670", 6)
ellipse((1325, 478, 1367, 520), "#f5ecd5")
ellipse((1438, 568, 1514, 644), outline="#e8e9e3", width=7)
rect((1336, 552, 1374, 582), "#e18b55", 5)
txt(1214, 675, "别撞上敌人或场地边界", 17, "#e2a09a")

txt(1520, 811, "START MENU  /  WIREFRAME V1", 14, "#77787f", False, "ra")

img.resize((W, H), Image.Resampling.LANCZOS).save(OUT)
print(OUT)

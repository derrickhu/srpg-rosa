#!/usr/bin/env python3
"""拼一张杂兵接触图：每章一行，左边大图看细节，右边 40px 看棋盘可读性。

40px 那一栏才是验收标准——棋盘上一格就这么大，大图好看但认不出来是不合格的。
底色取战场地面的中明度灰绿，避免在纯白/纯黑上误判对比度。
"""
import sys
from PIL import Image, ImageDraw

UNITS = "images/units"
BIG, SMALL, PAD = 96, 40, 8
BG = (86, 96, 82)

ROWS = [
    ("Player", ["sword", "bow", "cavalry", "shield", "mage", "healer"]),
    ("Ch1 grass", ["slime", "sporecap", "bloodwolf", "rockshell"]),
    ("Ch2 forest", ["vinecocoon", "sporesac", "leafpanther", "mosswarden"]),
    ("Ch3 fortress", ["fangtrooper", "wallbalist", "wallrider", "gatewarden"]),
    ("Ch4 mire", ["mirehand", "dartbug", "miregator", "mudcarapace"]),
    ("Ch5 drake", ["magmacore", "emberbat", "scalewyrm", "ashshell"]),
]

LABEL_W = 96
MAX_N = max(len(ids) for _, ids in ROWS)
row_h = BIG + PAD * 2
W = LABEL_W + MAX_N * (BIG + PAD) + PAD + MAX_N * (SMALL + PAD) + PAD * 2
H = row_h * len(ROWS) + PAD * 2

sheet = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(sheet)

for r, (label, ids) in enumerate(ROWS):
    y0 = r * row_h
    draw.line([(0, y0), (W, y0)], fill=(60, 68, 58))
    draw.text((6, y0 + row_h // 2 - 6), label, fill=(230, 230, 220))
    for c, uid in enumerate(ids):
        try:
            im = Image.open(f"{UNITS}/{uid}.png").convert("RGBA")
        except FileNotFoundError:
            print(f"missing: {uid}", file=sys.stderr)
            continue
        # 只按高度缩放，和 createUnitToken 的口径一致
        for size, xbase in ((BIG, LABEL_W), (SMALL, LABEL_W + MAX_N * (BIG + PAD) + PAD)):
            step = BIG + PAD if size == BIG else SMALL + PAD
            w = max(1, round(im.width * size / im.height))
            thumb = im.resize((w, size), Image.LANCZOS)
            x = xbase + c * step + (step - PAD - w) // 2
            sheet.paste(thumb, (x, y0 + (row_h - size) // 2), thumb)

sheet.save("art/mook-contact-sheet.png")
print(f"art/mook-contact-sheet.png {W}x{H}")

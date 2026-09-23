# 雾钟（bell_peal）特效 —— 黑底 additive 同心圆 9 帧（3x3）
#
# 技能：Boss 雾钟主，discAoE 半径 2，anchor caster，mode burst，cells 3.2。
# 形态：由内向外的光滑同心圆，和犬齿环、火柱、贯穿线、下沉雾、扇形、向内漩涡分开。
# 配色：白热核 → 雨窗灰 → 旧铜币外缘。
# 处理：scripts/vfx-sheet.py --rows 3 --cols 3 --align center
#       node scripts/sprite2anim.mjs --only bell_peal

A 3x3 sprite sheet (3 rows, 3 columns) of 9 frames. PURE BLACK background #000000.
Additive blend: every pixel that is not the glow must be absolutely black.

SHAPE: smooth CONCENTRIC CIRCLES seen from directly above. A bright core and one clean
expanding ring. The ring edge is smooth, like a ripple on still water. Even stroke,
round, centered.

COLOR: white-hot core #F4F7FA, mid ring in rainy-window gray-blue #C5D4DE, outer rim
in old-coin brass #E8C878. Cool and warm metal. High contrast against black.

FRAME ORDER, left-to-right, top-to-bottom. The ring GROWS:
  Frame 1 top-left:      tight core, ring about 12% of the cell.
  Frame 2 top-center:    ring about 24%.
  Frame 3 top-right:     ring about 36%.
  Frame 4 middle-left:   ring about 48%, a second faint inner ripple appears.
  Frame 5 center:        ring about 60%, peak brightness, brass rim clear.
  Frame 6 middle-right:  ring about 70%, thinner.
  Frame 7 bottom-left:   ring about 80%, core dimming.
  Frame 8 bottom-center: ring about 88%, thin brass arc, fading.
  Frame 9 bottom-right:  a faint thin brass circle at about 94%, almost gone.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000, including between cells.
2. EXACTLY 9 equal cells, 3x3. No borders, no gutters, no frames.
3. Every ring is CENTERED on the cell center. Only the radius changes.
4. Diameter increases from frame 1 to frame 9. Leave a thin black margin inside each cell.
5. Only the glowing rings. No character, no bell object, no floor, no smoke cloud.
6. Flat 2D game VFX. Crisp edges. No motion blur, no photographic glow bloom across the frame.
7. NO text, no numbers, no watermark.

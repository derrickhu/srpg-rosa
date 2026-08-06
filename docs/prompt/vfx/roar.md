# 狂暴战吼（savage_roar）特效 —— 黑底 additive 冲击波 6 帧（2x3 网格）
#
# 技能：src/data/skillCatalog.ts savage_roar —— 以自身为中心的曼哈顿 1 环 AoE + 自身 +6 atk / 2 回合。
#       所以视觉是「从脚下向外扩散的冲击波环」，不是定向斩击。
# 运行时：src/data/vfxCatalog.ts 的 SKILL_VFX 里 anchor='caster' mode='burst' cells=3，覆盖 3x3 格。
# 混合模式：add（黑色即透明），所以背景必须是纯黑而不是品红——这条路线不走抠色。
# 配色刻意用血红-橙区别于金色的普攻 slash 特效。
# 参考图：godot/art/vfx/slash/frames/slash_02.png —— 单帧，只锁辉光质感，不锁布局。

The attached reference image is ONE SINGLE VFX frame. Match its rendering style: pure black
background, bright white-hot core, crisp radiating light spikes, small sparkle glints, hard
glowing edges, no soft photographic blur. It defines the STYLE ONLY, not the layout — you
must produce the 2x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that
is not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient,
no vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and
black is what becomes invisible in the game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of an EXPANDING SHOCKWAVE RING — the
visual of an orc warlord's savage battle roar blasting outward from where he stands.

SHAPE: concentric rings of raw sound and rage seen from DIRECTLY ABOVE, top-down, so the
shockwave is a CIRCLE (not an ellipse, not a dome, not a cone). A bright hot core at the exact
center of the cell, one sharp expanding ring, and short jagged light spikes radiating outward
from the ring.

COLOR: white-hot at the very center, blazing orange in the mid glow, deep blood red at the
outer ring edge. Warm reds and oranges only. No blue, no green, no purple.

FRAME ORDER, reading left-to-right then top-to-bottom. The ring GROWS steadily across all
6 frames — this growth is the whole point of the animation:
  Frame 1 (top-left):     A small tight brilliant burst at the center. Ring diameter about
                          15% of the cell width. Very bright, very compact.
  Frame 2 (top-center):   Ring expanded to about 35% of the cell width, peak brightness,
                          sharp jagged spikes appearing all around it.
  Frame 3 (top-right):    Ring expanded to about 55% of the cell width, still very bright,
                          spikes at their longest, core still hot.
  Frame 4 (bottom-left):  Ring expanded to about 72% of the cell width, becoming thinner,
                          core dimming, spikes shortening.
  Frame 5 (bottom-center):Ring expanded to about 85% of the cell width, thin and breaking up
                          into arcs, clearly fading, core nearly gone.
  Frame 6 (bottom-right): Only a faint thin broken outer arc remains at about 95% of the cell
                          width. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The ring is CENTERED in its cell in all 6 frames. The center point must not drift between
   frames — only the radius changes.
5. The ring diameter must clearly INCREASE from frame 1 to frame 6, following the percentages
   above. Do NOT draw six rings of the same size. Do NOT shrink the ring.
6. The effect must stay INSIDE its own cell. Even in frame 6 leave a thin black margin between
   the outermost glow and the cell edge. Nothing may bleed into a neighboring cell.
7. NO character, NO orc, NO body part, NO weapon, NO cleaver, NO silhouette, NO ground, NO
   terrain, NO grass, NO floor, NO shadow. Only the glowing effect on black.
8. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic
   depth of field, NO lens flare streaks across the image.
9. NO text, NO labels, NO numbers, NO arrows, NO UI, NO watermark anywhere in the image.

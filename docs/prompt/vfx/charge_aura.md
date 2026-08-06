# 冲锋光环（charge_aura）—— 黑底 additive 速度环 6 帧（2x3 网格）

- 用途：骑兵被动「冲锋」吃到移动加成时的光环，`vfxCatalog.CHARGE_VFX`，
  `anchor='caster' mode='burst' cells=2.0 alpha=0.9`。
- `charge` 是被动、永远不发 `skillCast`，所以它挂在 `attack` 事件的 `charged` 标记上。
- 色相家族：**紫红**（骑兵），与普攻 `thrust` 同族。
- 实测：一次成图可用。**模型把 chevron 画成朝内了**（要求朝外）。没重生：在 2 格直径、250ms
  的播放尺度下箭头指向读不出来，能读出来的只有「一圈紫红在往外扩」，而这一点是对的。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png`，只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
2x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of a CHARGE MOMENTUM AURA — the burst of
speed energy that flares around a cavalry rider the moment his charge connects, seen from DIRECTLY
ABOVE (top-down).

SHAPE: a ring of SIX chevron shapes, like small arrowheads, evenly spaced around a common center
and all pointing OUTWARD away from the center, so the whole thing reads as speed radiating outward.
Each chevron has a bright white leading edge and a short double tail streak behind it. Between the
chevrons sit a few tiny glints. The very center stays almost dark — this is a hollow ring, not a
burst with a bright middle.

COLOR: white-hot at each chevron's leading edge, brilliant hot magenta pink in the chevron body,
deep violet purple in the tail streaks. Magentas and violets only. No orange, no red, no gold, no
blue, no green.

FRAME ORDER, reading left-to-right then top-to-bottom. The chevron ring EXPANDS outward and fades;
this outward rush is the whole point:
  Frame 1 (row1 col1): Chevrons tight around the center, ring radius about 22% of cell width, small
                       and very bright, tails short.
  Frame 2 (row1 col2): PEAK. Ring radius about 40%, maximum brightness, tails at their longest,
                       most glints.
  Frame 3 (row1 col3): Ring radius about 56%, still bright, chevrons slightly thinner.
  Frame 4 (row2 col1): Ring radius about 70%, chevrons noticeably thinner and dimmer, tails
                       stretching.
  Frame 5 (row2 col2): Ring radius about 82%, faint thin chevrons, tails almost gone.
  Frame 6 (row2 col3): Ring radius about 92%, only dim chevron outlines and a few specks. Almost
                       entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The ring centre stays at the exact center of its cell in all 6 frames and must not drift. Only
   the radius and brightness change.
5. Keep SIX chevrons, evenly spaced, all pointing OUTWARD, radially symmetric with no dominant
   direction — this effect is never rotated by the game.
6. The centre of the ring must stay dark and hollow in every frame. Do not fill it with a bright
   core.
7. Ring radius must clearly INCREASE from frame 1 to frame 6 following the percentages above. Do
   NOT draw six identical frames.
8. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing may
   bleed into a neighboring cell.
9. NO horse, NO rider, NO hoof, NO lance, NO character, NO body part, NO silhouette, NO ground, NO
   terrain, NO grass, NO dust, NO shadow. Only the abstract glowing light effect on black.
10. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO photographic depth of field. NO
    text, NO labels, NO numbers, NO arrow symbols as UI, NO watermark anywhere.

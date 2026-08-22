# 破甲咒（hex_mark）—— 黑底 additive 碎裂符印 9 帧（3x3 网格）

- 技能：`skillCatalog.hex_mark`「破甲咒」—— 弓系可学（`reserved`，主槽等一个控制路线的弓手，
  但**商店临时槽在卖，玩家拿得到**），正好 2 格外点名单体，**零伤害**，削攻 5 点 / 3 回合。
- 用途：`vfxCatalog.SKILL_VFX.hex_mark`，`anchor='target' mode='burst' cells=2.2`。
- 色相家族：**青蓝**（弓手）。同族已有三个形态，这一张必须和它们都分得开：

  | 招式 | 形态 | 读作 |
  |---|---|---|
  | 普攻 `arrow_hit` | 单点箭星 | 中了一箭 |
  | 穿透箭 `pierce` | 长尾迹 + 贯穿星 | 穿过去了 |
  | 速射 `snap_hit` | 连续短促多星 | 连了好几发 |
  | **破甲咒 `hex_mark` `** | **一枚菱形符印烙在敌人身上，然后从中间裂开** | **被下咒了 / 甲开了** |

  这一招**没有伤害**，所以绝对不能画成任何形式的「击中」——同族三招都是命中星爆，
  再来一个星爆就是第四个一样的东西。它要读作**印记附着**：先亮起一个几何符文，
  再裂成两半。裂开正是「破甲」的动词。
- 零伤害技能最容易被玩家误认成「放空了」（回放里连伤害数字都不飘），所以这一张的
  **持续时间要比命中类更长**（fps 压到 16），让符印真的「停在」敌人身上一会儿再裂。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png`，只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
3x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a HEX SIGIL BRANDING AND THEN
CRACKING APART — a geometric rune stamped onto a target, which then splits down the middle.

SHAPE: ONE upright DIAMOND (rhombus) RUNE OUTLINE centered in the cell, drawn as a crisp thin
hard-edged glowing outline, with a short vertical bar and two small angular ticks inside it so it
reads as an engraved SIGIL rather than a plain shape. A second, smaller diamond outline sits
nested inside the first. In the later frames a JAGGED VERTICAL CRACK splits the sigil down its
center and the two halves tilt apart, with a few small angular splinters flicking off. This must
read as A RUNE MARK THAT GETS STAMPED ON AND THEN BREAKS IN HALF. Do NOT draw a star burst. Do
NOT draw an impact flash. Do NOT draw a crescent slash or arc. Do NOT draw an arrow. Do NOT draw
a circular ring. Do NOT draw radial spikes.

COLOR: brilliant white-hot along the sigil outline, saturated bright cyan in the body of the
lines, deep hard-edged teal blue at the outer edges and on the splinters. Cyans, aquas and cold
teal blues only. No gold, no yellow, no orange, no red, no green, no purple, no silver-grey.

FRAME ORDER, reading left-to-right then top-to-bottom. The sigil BRANDS ON, HOLDS, then CRACKS.
Note this effect HOLDS in the middle frames instead of fading immediately:
  Frame 1 (row1 col1): The outer diamond outline appears at about 45% of cell height, thin and
                       moderately bright. No inner diamond, no crack.
  Frame 2 (row1 col2): PEAK BRIGHTNESS. Outer diamond at full size, about 70% of cell height,
                       THICK and blazing white. Inner diamond and the vertical bar visible.
  Frame 3 (row1 col3): Sigil fully formed and still very bright — outer diamond, inner diamond,
                       vertical bar and the two angular ticks all crisp. No crack yet.
  Frame 4 (row2 col1): Sigil holding, brightness clearly down from the peak but still solid and
                       fully legible. A hairline vertical crack just starting at the top.
  Frame 5 (row2 col2): The jagged vertical crack now runs the full height of the sigil. The two
                       halves have just begun to separate, a narrow black gap between them.
  Frame 6 (row2 col3): The two halves tilt apart, gap about 12% of cell width. A few small
                       splinters flick outward. Dimmer.
  Frame 7 (row3 col1): Halves clearly separated and tilted, gap about 20%, outlines breaking
                       into segments, faint.
  Frame 8 (row3 col2): Only dim broken segments of the two halves remain, drifting outward,
                       very faint.
  Frame 9 (row3 col3): Almost entirely black, two or three dim splinter tips near the edges.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The sigil stays CENTERED in its cell in all 9 frames and must not drift. Only its size, the
   crack, the separation of the halves and the brightness change.
5. Brightness must PEAK AT FRAME 2 and then decrease monotonically to frame 9. Do NOT make
   frame 5 or frame 9 the brightest.
6. The sigil must stay FULLY LEGIBLE as a diamond rune through frame 4 — this effect holds
   before it breaks, it must not fade out early.
7. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing
   may bleed into a neighboring cell.
8. NO character, NO archer, NO bow, NO arrow, NO weapon, NO armor, NO hand, NO body part, NO
   ground, NO grass, NO terrain, NO shadow. Only the abstract glowing light effect on black.
9. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust, NO photographic depth of
   field. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.

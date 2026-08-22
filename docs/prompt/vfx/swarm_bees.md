# 惊扰蜂群（temp_gl_swarm）—— 品红底多帧蜂群 6 帧（2x3 网格）

- 用途：草原战线临时技能「惊扰蜂群」的弹体，`travel.spriteSet='temp_gl_swarm'`。
- 章节色系：草原（琥珀黄黑，蜜蜂本色）。

## 为什么要这套图

原先是 `images/fx/proj_bees.png` **一张静态图**沿轨道平移 + 绕目标三圈。屏幕上看到的是
一块贴纸在滑动，和剑士从前拿一张剑的抠图沿弧线钉下去是同一种毛病：
**群体的信息量在个体的相对扰动里**，而那正是单图运动丢掉的东西。

同时修掉一个渲染 bug：`vfxProjectile` 从前写的是 `laps > 0 || !def.noRotate`，
绕圈时强制跟着切线旋转、`noRotate` 被无条件覆盖，而绕圈的 heading 每圈扫满 360°——
蜂群绕目标三圈就是翻三个滚，蜜蜂**倒着飞**。

所以这一招不是「换张图」，是两件事一起：多帧扰动 + 不再翻滚。

## 这套图和别的不一样：走抠图路线，不是黑底

蜜蜂是**实体**，不是光。黑底 additive 那条路要求「暗部即透明」，而蜜蜂身上最有辨识度的
就是黑色条纹——走 additive 会把条纹整个吃掉，剩下一团发光的黄雾。
所以走品红抠图 + 普通混合（`blend: 'normal'`），和角色贴图同一条路。

配套加了 `TravelDef.spriteSet`：`glowSet` 会叠 additive 核心层（那是给光准备的），
给一团蜜蜂叠辉光会让它变成发光的雾。`spriteSet` 只走普通混合。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE MAGENTA #FF00FF. Every pixel that
is not part of the bees must be absolutely solid magenta. No gradient, no vignette, no shadow on
the background, no soft edge blending into the background. This background will be keyed out to
transparency, so any magenta tint bleeding onto the bees will show up as pink fringing in game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 animation frames of an ANGRY SWARM OF BEES —
a loose churning cluster of about 9 to 12 individual honeybees seen from the side, flying as a
group. This is a LOOPING animation of the same swarm churning in place: the cluster keeps roughly
the same overall size and center in every frame, but the individual bees shift position, so
playing the frames in a loop reads as the swarm boiling and agitating.

STYLE: clean 2D game art, cel-shaded with crisp readable edges and a thin dark outline on each
bee, like a high-end mobile game item icon. Each bee is small but individually readable: amber
and golden-yellow body with BLACK stripes, small dark head, and pale translucent wings shown as
light blurred ovals to suggest fast beating. Tiny motion streaks behind a few bees.

LAYOUT: the swarm cluster is WIDER than tall, roughly a 2:1 horizontal oval overall, drifting
toward the RIGHT (the game rotates nothing, but the art should read as moving right). The bees
are NOT in a neat grid or arc — they are scattered at irregular spacing with a few strays at the
edges and black magenta gaps clearly visible between individual bees.

COLOR: amber #FFB020 and golden #FFF0C0 on the bodies, true BLACK stripes, dark brown #C45A00
on the legs and outlines, pale near-white wings. No green, no blue, no purple, no red.

FRAME PROGRESSION, reading left-to-right then top-to-bottom. All 6 frames show the SAME swarm at
the SAME overall size and position — only the individual bees rearrange:
  Frame 1 (row1 col1): bees fairly bunched toward the center of the cluster.
  Frame 2 (row1 col2): a few bees push outward, two strays break toward the upper right.
  Frame 3 (row1 col3): the cluster is at its loosest, gaps largest, one bee near each edge.
  Frame 4 (row2 col1): bees pulling back toward center, strays returning.
  Frame 5 (row2 col2): bunched again but with a different internal arrangement than frame 1.
  Frame 6 (row2 col3): mid-way loosening again, so frame 6 flows back into frame 1 seamlessly.

ABSOLUTE RULES:
1. Background is PURE MAGENTA #FF00FF everywhere, including between the cells and between bees.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The swarm cluster stays the same overall size and stays centered in its cell in all 6 frames.
   Do NOT make the swarm grow, shrink, or drift across the frames.
5. Individual bees MUST be readable as separate insects with magenta gaps between them. This is
   not a solid blob and not a cloud.
6. Keep the black stripes truly black — they are what makes it read as bees.
7. NO character, NO hand, NO flower, NO hive, NO ground, NO terrain, NO grass, NO shadow.
8. NO glow, NO bloom, NO magic sparkle, NO energy aura. These are ordinary insects.
9. Flat 2D game illustration. NO photographic depth of field, NO heavy motion blur over the
   whole frame.
10. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.

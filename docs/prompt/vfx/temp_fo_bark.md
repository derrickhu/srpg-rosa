# 树皮庇护（temp_fo_bark）—— 洋红抠图 / 普通混合 甲片左右夹合 9 帧（3x3 网格）

- 技能：`temp_fo_bark`（给自己/友军加防）。
- 运行时：`SKILL_VFX.temp_fo_bark`，`anchor='target' mode='burst' cells=1.9`。
- 切帧：`python3 scripts/vfx-sheet.py --key magenta --align center`。
- 图集：`blend: 'normal'`。

## 两处必须注意的坑

**一、它从前和守林人之姿共用 `ward_aegis` 一张图。** 两招同章、同色、同形，
放出来根本分不清是哪一招——这是这一轮要消灭的头号问题。现在两张按**轴向**分开：
这张甲片只长在左右两侧、中间留竖缝；那张是根须在下、树冠在上、中间留横带。

**二、普通混合会真的遮住单位，而这一招盖的是友军。** additive 只加不减，所以从前
再大也不挡人；改成普通混合后就必须自己保证不挡。这一条走了两次弯路：

- 第一版画成一圈闭合的桶。前壁比人还高，`cells` 缩到 0.95 仍糊住胸口（遮挡 73%）。
- 第二版按「甜甜圈中心留空」重画。但环是带透视的，洞在上半、前壁在下半，
  几何中心照样压在前壁上，遮挡还是 73%。

结论是**别指望用 `alpha` 或尺寸去救构图**。真正管用的是把甲片挪出人所在的那条竖带：
第三版只在左右两侧长甲片，中间 40% 宽度全程留空，遮挡降到 32%，
而且「甲片从两侧夹上来」本身就比一只桶更像护甲。所以配方里也不再需要 `alpha`。

判据：`cells=1.9` 时人脸和躯干必须从缝里看得见。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE MAGENTA #FF00FF. Every pixel that is not
part of the bark must be pure saturated magenta. No dark edges, no black vignette, no gradient, no
glow, no drop shadow. This is a chroma-key cutout: magenta is what gets deleted.
Do NOT use any magenta, pink, purple or violet anywhere in the bark.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of BARK ARMOR PLATES closing in from the LEFT
and RIGHT sides, with a completely EMPTY VERTICAL CORRIDOR down the middle of every cell.

MOST IMPORTANT RULE — THE EMPTY MIDDLE CORRIDOR: in EVERY one of the 9 frames, a VERTICAL BAND
running from the top edge to the bottom edge and covering the CENTRAL 40% OF THE CELL'S WIDTH must be
COMPLETELY EMPTY PURE MAGENTA. No plate, no chip, no wisp, no shadow may enter that corridor. All
bark is confined to the LEFT THIRD and the RIGHT THIRD of the cell. A closed ring, a barrel, a wall
across the middle, or anything spanning left to right is WRONG and unusable.

SHAPE: on each side, three or four thick CURVED slabs of rough cracked tree bark, stacked and
overlapping like segments of shoulder armor, their concave faces turned toward the empty middle
corridor as if clamping onto something standing there. Slabs are chunky with visible seams, cracks
and knots, separated from each other by thin magenta gaps. A few small bark chips float just outside
the slabs. The left group and the right group mirror each other.

COLOR: DARK and DESATURATED so it reads against bright yellow-green turf —
dark bark brown, grey-brown, near-black crevices, with pale sap-cream highlights only on the edges
facing the middle. NO bright lime green. NO gold. NO glow. NO blue.

FRAME ORDER, left-to-right then top-to-bottom. The two groups CLOSE IN but never cross the corridor:
  Frame 1: Small thin bark shards at the far left and far right edges, dim and sparse.
  Frame 2: Shards thicken into short slabs, still at the outer edges.
  Frame 3: Slabs grow and drift inward, corridor still wide.
  Frame 4: Slabs tall and clearly curved, edges approaching the corridor.
  Frame 5: Closest and densest — slabs clamped at the corridor's edges, darkest frame,
           corridor still completely empty.
  Frame 6: Slabs hold position, a few bark chips break off outward.
  Frame 7: Slabs begin cracking and drifting back outward.
  Frame 8: Slabs thin and broken, back near the outer edges.
  Frame 9: A couple of small dark shards at the far edges, rest empty.

ABSOLUTE RULES:
1. Background PURE MAGENTA #FF00FF everywhere, including between cells AND in the central corridor.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Symmetric left-to-right and CENTERED in every cell; must not drift between frames.
4. Stay INSIDE each cell; leave a thin magenta margin at top and bottom.
5. NO character, NO tree trunk, NO ground texture, NO text, NO watermark.
6. Flat 2D game asset, hard opaque edges. NO motion blur, NO haze, NO bloom.

# 血牙咆哮（bloodfang_roar）特效 —— 黑底 additive 血色冲击波 9 帧（3x3 网格）

- 技能皮肤：`enemySkillCatalog` `bloodfang_roar` → 底层 `savage_roar`（自身曼哈顿 1 环 AoE + 攻 buff）。
- 运行时：`vfxCatalog.ts` 的 `SKILL_VFX.bloodfang_roar`，`anchor='caster' mode='burst' cells=3`。
- **与旧 `roar` 的区别**：`roar` 是光滑橙金扩散环（通用战吼）；本条必须读成「血牙部族」——
  **血红主色 + 犬齿状尖刺环**，不能再画成光滑圆环，也不能用剑士金橙。
- 第一章唯一有技能的敌方特效，要独特、可读、够狠。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a BLOODFANG WAR-HOWL SHOCKWAVE —
savage crimson sonic blast from a wolf-orc chieftain, seen from DIRECTLY ABOVE (top-down).

SHAPE: a bright white-hot core at the exact center, surrounded by ONE expanding RING made of
SHARP FANG-LIKE SPIKES pointing outward (like a circular saw of canine teeth / blood fangs),
NOT a smooth clean circle. Between spikes leave pure black gaps so the silhouette reads as
"fangs" not "smooth ring". Outer tips can crack into shorter jagged shards as it expands.

COLOR: white-hot core → blazing scarlet / crimson mid → deep blood red (#8B0000-ish) outer tips.
Warm reds and a little orange only. NO gold-yellow hero slash colors. NO blue, NO green, NO purple.

FRAME ORDER, left-to-right then top-to-bottom. The spiked ring GROWS and thins — growth is the
whole point:
  Frame 1: Tiny tight crimson burst, spiked ring ~18% of cell width, very bright.
  Frame 2: Ring ~30%, fangs clearly readable, peak brightness.
  Frame 3: Ring ~42%, long jagged fangs, still hot core.
  Frame 4: Ring ~55%, fangs lengthening, core starting to dim.
  Frame 5: Ring ~68%, thinner ring, spikes slightly shorter.
  Frame 6: Ring ~78%, breaking into arcs of fangs, core weak.
  Frame 7: Ring ~88%, thin broken crimson arcs, mostly fangs tips.
  Frame 8: Ring ~94%, faint fragmented outer fangs only.
  Frame 9: Almost black; only a few dim blood-red tip fragments at ~98%.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED in every cell — only radius changes, center must not drift.
4. Stay INSIDE each cell; leave thin black margin even on frame 9.
5. NO character, NO wolf head, NO body, NO weapon, NO ground, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO smoke clouds, NO photographic DOF.

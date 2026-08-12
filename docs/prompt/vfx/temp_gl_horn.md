# 牧野号角（temp_gl_horn）特效 —— 黑底 additive 号角音波 9 帧（3x3 网格）

- 技能：`temp_gl_horn`（对自己释放，嘲讽 + 攻）。
- 运行时：`SKILL_VFX.temp_gl_horn`，`anchor='caster' mode='burst' cells=2.2`。
- 铜色号角音波（双环短促脉冲），读成「吹号」，不是 Boss 血红犬齿环，也不是剑士旋风刃。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of HORNLIGHT SOUNDWAVE —
brass / copper glowing concentric sound rings from a war-horn call, seen from DIRECTLY ABOVE.

SHAPE: TWO thin concentric rings (soundwave ripples) expanding, slightly uneven like brass
resonance — NOT spiked fang ring, NOT vine snare, NOT insect cloud, NOT triple blade whirl.
Keep rings thin with black between them.

COLOR: white-hot core flash → warm brass / copper mid (#FFC040-ish) → deep bronze outer.
NO green. NO cyan. NO blood crimson. Avoid pure sword-slash orange wedges.

FRAME ORDER, left-to-right then top-to-bottom. Rings GROW:
  Frame 1: Tiny bright brass burst ~18%.
  Frame 2: First ring ~30%, second ring just appearing.
  Frame 3: Double rings ~42%, peak brightness.
  Frame 4: Rings ~55%, still hot.
  Frame 5: Rings ~68%, thinner.
  Frame 6: Rings ~78%, fading brass.
  Frame 7: Rings ~88%, broken arcs.
  Frame 8: Faint outer ripple ~94%.
  Frame 9: Almost black; dim bronze tip fragments.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED; only radius changes.
4. Stay INSIDE each cell; leave thin black margin even on frame 9.
5. NO character, NO physical horn prop, NO ground, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO smoke.

战斗底部「托管 / 接手」开关图标（只出剪影，按钮壳用代码画）
产出 → images/ui/icon_pilot_auto.png、images/ui/icon_pilot_take.png
生成器：Cursor 内置 GenerateImage，aspect_ratio 1:1
规范：美术风格圣经 §6。和 `act_wait` / `act_attack` 同类——黑底厚描边剪影，
不带圆框、不带字。可点外壳（色环、下沿、底下一行字）在 `BattlePlaybackView` 里画。

---

Two separate 1:1 glyph icons. Solid BLACK #000000 background. Subject centered, ~70% of frame.
Thick near-black outline #1A1410. Flat cartoon fills, 3–4 colors, no gradients, no photoreal.
NO button chrome, NO plaque, NO circle frame, NO text, NO letters, NO watermark.

1) 托管 (auto-pilot)
- A simple six-tooth gear + a small play triangle
- Gear #54708C, cream hole #FCFCF6, triangle teal #5EC4D4

2) 接手 (take back control)
- Open cream hand catching a small sword hilt
- Grey blade, brown hilt, gold #EEC462 guard accent

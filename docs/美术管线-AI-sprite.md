# 美术管线：AI 生图 → 单位动画

这条管线用 AI 生图产出网格 sheet，再用确定性脚本抠色、切帧、对齐、打包，产物和 Godot
路线完全一致，因此不需要开 Godot 就能加单位。

两条路线并存，各自适用范围：

| 路线 | 入口 | 适用 |
|---|---|---|
| Godot | `npm run anim:build`（`scripts/tres2pixi.mjs`） | 已在 Godot 里搭好 SpriteFrames 的资源，如 `sword`、`slash` |
| AI 生图 | `npm run anim:build:sprite`（`scripts/sprite2anim.mjs`） | 新单位、新特效 |

两者共用 `scripts/lib/animAtlas.mjs` 做图集打包与清单落盘，所以 `src/data/anim/<id>.json`
的格式只有一处定义。

依赖：`generate2dsprite` skill（`~/.cursor/skills/generate2dsprite/`，MIT，来自
[0x0funky/agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge)）。脚本只用
numpy 和 Pillow，不调任何生图 API。

## 步骤

### 1. 生图

**风格与配色一律以 [美术风格圣经](./美术风格圣经.md) 为准**，动笔前先读它的 §2.1 配色编码、
§4.1 怎么避免"普通"、§4.3 已知色彩冲突。风格段落原样粘贴 `docs/prompt/_style_block.txt`，
不要自己重写措辞，否则又会退回"每个 prompt 各写各的"的老路（约定见
[docs/prompt/README.md](./prompt/README.md)）。

**不要用 `build-prompt` 子命令的默认模板**——它输出的是像素风，和本项目的 SD 卡通厚描边
风格不符。

prompt 存到 `docs/prompt/unit_<id>_<action>_prompt.txt`。除风格块外必须写进 prompt 的
结构性硬约束：

- 精确的网格形状，且格与格之间只有纯色背景，没有分割线和边框
- 背景是 100% 纯色键色，无渐变、无暗角、无角色投影
- 所有格子里角色的身高、肩宽、镜头距离完全一致，不许某些格子放大或裁得更紧
- 角色居中、占格高约 65%、四边留等量余量
- 任何部件（头发、斗篷、武器、箭袋、脚）都不许越过格子边界
- 脚踩在同一条水平基线上
- 全图无文字、标签、数字、箭头、水印

### 2. 选键色

**先列出角色主色，再选键色**，不要无脑用品红。判据是主色到键色 `(255,0,255)` 的欧氏距离要
远大于 `--edge-threshold`：

| 角色主色 | 到品红色距 | 键色 |
|---|---|---|
| 绿、青、蓝、棕、皮革 | > 250 | 品红 `#FF00FF`（`generate2dsprite` 默认路径） |
| 血红 `#8B1A1A`、亮红 `#E03030` | 258 / 215 | 品红仍然安全，但 prompt 必须禁掉粉/品红/紫罗兰 |
| 粉、紫、洋红本身 | < 150 | 品红会吃掉服装色，改用绿 `#00FF00`（需自己补抠色逻辑，`generate2dsprite` 只认品红） |

生图模型给的背景通常不是精确键色（实测 bow 拿到的是 `#F503F4`，四角还有暗角衰减到
`#E40AE8`）。这是正常的，`process` 的 `--threshold` / `--edge-threshold` 容差就是为此设计。
抠完必须检查角色主色有没有被吃掉——掉色说明键色和素材撞了，要换键色重生成，不是本地补色。

### 2.5 去溢色（必做）

`remove_bg_magenta` 靠「到 `(255,0,255)` 的色距」判背景，边缘那些「品红 × 描边」混合出来的
像素色距太大删不掉，会在轮廓上留一圈紫边。**这个问题在阈值维度上没有可行解**：实测把
`--edge-threshold` 从 150 提到 280 时紫边降到 0.06%，但角色可见像素同时掉了 33%——骨白、皮毛
高光的色距和溢色像素一样大，被一起挖穿了。

所以不删而是校正。溢色的特征是红蓝双高、绿通道被压低，即 `min(r,b) - g > 0`；把 r、b 压回 g，
溢色像素就还原成中性的深色描边：

```bash
python3 scripts/despill-magenta.py art/sprite-runs/<id>/<action>
```

实测 blood­fang 紫边 1.18% → 0，83% 的像素完全没被触碰，血红/棕皮/骨白/钢灰全部保留。
前提是配色里没有粉/品红/紫（prompt 里已禁），否则这些颜色会被判成溢色。

目录模式会跳过 `raw-sheet.png`：那是未抠色的原始生图，纯品红 `min(r,b)-g = 255`，
despill 会把整片背景压成黑色、毁掉复现锚点。

推荐阈值组合：`--threshold 120 --edge-threshold 240` 再叠 despill。

### 2.8 给挤满格子的 sheet 留边（`--strict-qc` 报触边时做）

严格 QC 报 `raw subjects touch a source-cell edge` 说明角色画到了单元格边界上，切帧会削掉
弓尖或脚底。生图模型很难稳定遵守"只占单元格 X%、四周留白"，重摇是抽奖，缩放是确定性的：

```bash
python3 scripts/respace-sheet.py --input raw.png --output raw-spaced.png
```

它对**每个单元格施加同一个缩放系数、各自绕自己的中心缩放**，这是对每格完全相同的相似变换，
帧间的大小与站位关系原样保留，不会破坏 `--shared-scale` 和 `--align feet`。
逐格各缩各的会让角色忽大忽小，绝对不要那样做。bow v3 实测系数 0.92 即通过严格 QC。

### 3. 后处理

第一个动作建立 scale profile：

```bash
python3 ~/.cursor/skills/generate2dsprite/scripts/generate2dsprite.py process \
  --input <生图产出的 raw.png> \
  --target player --mode player_sheet \
  --output-dir art/sprite-runs/<id>/walk \
  --cell-size 256 --align feet --shared-scale --component-mode largest \
  --write-scale-profile art/sprite-runs/<id>/scale-profile.json
```

后续每个动作复用同一个 profile，这是保证单位在动作之间不跳大小的关键：

```bash
python3 ~/.cursor/skills/generate2dsprite/scripts/generate2dsprite.py process \
  --input <attack_down.png> --target player --mode attack \
  --output-dir art/sprite-runs/<id>/attack-down \
  --scale-profile art/sprite-runs/<id>/scale-profile.json \
  --align feet --shared-scale --component-mode largest
```

参数取值理由：

- `--cell-size 256`：棋盘格 28–56px（`src/view/boardLayout.ts`），单位站立高约 1 格，
  手机像素比 2–3 倍，所以原生帧高要 200px 以上才不糊。不指定的话会自动选到 96，偏小。
  注意帧尺寸只决定清晰度，**不决定屏幕上的大小**——大小由下面的统一标准控制。
- `--align feet --shared-scale`：统一脚线和缩放，这是 `sword` 单位当年缺的东西。
- `--component-mode largest`：角色本体 sheet 用，滤掉离体的碎屑。特效、弹道、冲击 sheet
  要改成 `all`，因为离体部分是效果本身。
- 角色本体 sheet **不要**包含大挥砍弧光、枪口火光、飞溅——那些单独出 `fx` / `impact` sheet，
  在运行时用 `playFxAnimation` 叠加（`blend: 'add'`）。混在一起会让固定格里的身体被迫缩小。

**scale profile 并不锁死实际缩放，跨动作体型由打包期兜底。** profile 只复制处理参数
（`SCALE_PROFILE_PROCESSING_KEYS`），而默认的 `--scale-strategy fit` 是每个 run 各自把包围盒
缩放填满格子。举刀过顶的姿势包围盒更高，就会被缩得更小——实测 bloodfang 漂移 10.4%，
剑士因为巨剑更长，`profile_body_scale_drift` 直接到 **30.4%**，玩家会看到他一挥剑就大三成。
换 `preserve` 也不是解：它忠实保留 prompt 里写的占比，等于把一致性押在模型听不听话上。

所以不要在这一步较劲，`--max-profile-scale-drift 0.5` 放过即可。真正的对齐做在
`sprite2anim.mjs` 的 `bodyScaleByRun`：它用和清单 `metrics` 同一个 `bodySpan` 量出各动作的
身体高度中位数，按静止参考动作等比校正，以脚点为不动点重采样。这是确定性的，不依赖生图发挥。
构建日志会打印每个动作的校正系数：

```
[sprite2anim] sword: sword/attack_up 身体 113 → 对齐 sword/walk 的 147，缩放 ×1.301
```

校正后实测剑士全动作体型 CV 3.9%、弓手 2.4%、血牙 2.0%。**系数离 1 太远（比如 >1.25）说明
那张 sheet 本来就画歪了**，虽然能救回来但要靠放大、会损失锐度，值得重出一张。

### 3.5 采样多张候选，别靠单次运气

生图是随机的。同一个 prompt 反复跑会随机出现背景变黑、画上帧名文字、武器穿出格子边界。
这些硬伤大部分能程序化判定，所以用：

```bash
python3 scripts/gen-sprite-candidates.py \
  --prompt docs/prompt/unit_<id>_<action>_prompt.txt \
  --ref art/sprite-runs/<id>/identity-ref.png \
  --out-dir art/sprite-runs/<id>/attack_down \
  --rows 2 --cols 2 --label-prefix attack \
  --scale-profile art/sprite-runs/<id>/scale-profile.json \
  --attempts 4
```

它采样 N 张，按「品红底占比 → `source_edge_touch_frames` → `empty_frames`」淘汰硬伤，
再按 `body_scale_cv + anchor_y_std` 取体型最一致的一张，最后自动 despill。实测 4 次采样里
稳定有 1 次背景整片变黑，被自动淘汰。文字水印判不出来，仍需人眼过一遍
`sheet-transparent.png`。

**参考图要传单帧，不要传整张 sheet。** 实测把 4×4 的 `raw-sheet.png` 当参考图去要 2×2 攻击
sheet，布局锚定会压过文字指令，模型直接复刻出一张 4×4 行走 sheet。裁一格出来存成
`identity-ref.png`（512×512，保留品红底）即可，只锁身份和风格。

**朝向也靠参考图控制。** 4×4 里有行间上下文时模型能画出侧面，孤立的 2×2 会漂回正面——
实测朝左的攻击 sheet 用朝下的参考图生出来 4 帧全是正面。改传从行走 sheet 第 2 行裁的朝左单帧
（`identity-ref-left.png`）后一次就对，主体高漂移也从 11% 降到 2%。

**长武器要写成紧凑的过顶劈砍。** 大幅横挥时长柄武器必然穿出格子边界，光靠「不许越界」这句
文字压不住。把动作描述成沿角色自身竖直方向的劈砍，再把占格压到 45%，越界问题就消失了。

### 3.9 黑底 additive 特效走另一条支线

> 特效有独立的《[特效圣经](./特效圣经.md)》：设计规则（配色分族、帧数两档、三种朝向模式）、
> 五步管线、prompt 模板、登记表怎么加行，都在那边。这一节只留和角色管线的差异对比。

技能特效**不能**走抠色管线：additive 混合靠「黑色即透明」，背景必须是纯黑，而抠色会把黑色
描边一起吃掉。所以特效用 `scripts/vfx-sheet.py`，产物落在 `art/vfx-runs/<id>/`：

```bash
python3 scripts/vfx-sheet.py <生图产出的黑底网格图> \
  --out-dir art/vfx-runs/roar --rows 3 --cols 3 --label roar --size 256
```

prompt 要求（参考 `docs/prompt/vfx_savage_roar_prompt.txt`）：纯黑 `#000000` 背景、白热核心 +
暖色外辉、清晰放射尖刺、无烟雾/景深/动态模糊、不含任何角色与地形。风格参考图可以直接传
`godot/art/vfx/slash/frames/slash_02.png`（单帧，只锁质感不锁布局）。

**关键：所有帧共用一个缩放系数。** `game-vfx-pipeline` 的 `process_vfx_frames.py` 对每帧独立求
包围盒再缩放填满画布，用在扩散型特效（冲击波、爆炸）上会把「环在变大」这个信息整个抹掉——
第 1 帧的小环和最后一帧的大环被放大到同样大小，动画看起来就是在原地闪。`vfx-sheet.py` 用全部
帧亮区并集决定唯一的裁剪边长，扩散过程才保得住。

裁剪窗口的位置则按每帧自身**亮度加权质心**对齐：生图很难把每格的效果画在同一个中心上，固定
窗口会让播放时整个特效左右抖；只挪窗口不改边长，所以不影响半径增长。

生图给的网格数可能和要求的不一样（实测要 2×3 给了 3×3）。多出来的帧是白拿的，按实际网格传
`--rows/--cols` 即可。

### 4. 转成清单

在 `scripts/sprite2anim.mjs` 顶部的 `SETS` 里登记，然后：

```bash
npm run anim:build:sprite            # 全部
npm run anim:build:sprite -- --only bow
```

脚本会做三件构建期把关：

- 同一集合内所有动作的 `cell_size` 必须一致，否则直接报错并提示重跑 scale profile
- 把 `process` 的 QC 结论转成告警：空帧、贴边帧、`body_scale_cv > 0.08`、
  `anchor_y_std > 0.05`
- 动画引用的帧标签必须真实存在

### 5. 注册到运行时

在 `src/view/animSets.ts` 的 `MANIFESTS` 里加一行。

普通单位的**集合 id 要等于 `defId`，也就是职业名**（`sword` / `bow` / `shield` / `cavalry`，见
`src/data/stagesMvp.ts` 的 `UnitKind`；`characterCatalog.ts` 里的 `hero_bow_hill` 是角色 id，
不是 `defId`，`defId` 取的是 `profession`）。id 对不上时 `hasAnimSet` 为 false，单位会静默
退回静态 token，不报错。

**Boss / 精英用 `animSet` 字段而不是新 `defId`。** `defId` 决定数值和三角克制关系，不能为了
换皮去改。在 `stagesMvp.ts` 的 spawn 上写 `animSet: 'bloodfang'`，字段经
`DeployManager.buildBattleUnits` → `UnitState` → `engine.cloneUnits` 一路传到
`BattlePlaybackView`，那里取 `u.animSet ?? u.defId`。

`createAnimatedUnit` 要求集合里有 `idle` 或 `default`，否则返回 null 回退到静态 token。

#### 单位大小的统一标准

**所有单位的身体高度固定为 `UNIT_HEIGHT_CELLS = 0.92` 格**（`AnimatedUnit.ts`），boss 再乘
`BattlePlaybackView` 里的 1.3。新集合不需要调任何缩放参数，出图时也不必凑角色在帧里的占比。

实现靠清单里的 `metrics`，由 `animAtlas.mjs` 在构建期从**静止参考帧**（`default`，退 `idle`）
算出：`subjectHeight`（身体实高）决定缩放，`baselineY`（脚线）决定站位。
运行时 `scale = cell * 0.92 / subjectHeight`，再按脚线把 sprite 挪到格心下方 0.2 格。
`0.92` 这个数字本身没有含义，它只是让屏幕大小跟着 `bodySpan` 的口径走——**判据改一次就按剑士
重新标定一次**，否则改进判据会连带悄悄改变所有已有单位的大小。

**归一化的是身体，不是包围盒，所以道具可以自由超出格子。** 竖举的长枪、法杖、犄角既不会被裁
（棋盘没有 mask 也没有 z 排序），也不会把角色压小。曾经为此在美术侧立过一条"道具不许高过头顶"
的规矩，那是拿设计自由去补引擎缺陷，已废除，别加回来。

`bodySpan` 怎么切身体：**头顶用距离变换定，脚线用逐行宽度定**。距离变换测的是「这里能塞进
多大的圆」，头和躯干厚、刀刃再宽也薄，且**与道具角度无关**——`D >= 0.45*dmax` 的像素即躯干
核心，其最高点往上补 `0.45*dmax`（圆形的头被这样阈值化正好缩进这么多）就是头顶。
脚线仍用「行宽低于最宽行 25%」，因为腿本来就细、距离变换分不出它和刀刃，而道具极少伸到脚下。

这里原本头顶也用逐行宽度（行宽达到最宽行 50% 即头顶），前提是"道具细、身体宽"。
**斜 45° 扛着的宽刃巨剑每一行都很宽，会被整段当成身体**，剑士朝左那帧因此报 240，
而同一角色朝下只有 163。换成距离变换后全表离散度从 21% 降到 6.6%。JS 侧没有 scipy，
用的是两遍 chamfer(3,4) 近似，精度约 5%，和 scipy 的 EDT 实测差 1–2px。

改了 `bodySpan` 之后跑 `node scripts/remetrics.mjs` 让已有资产跟上，不必重新打包图集；
然后**别忘了按剑士重新标定 `UNIT_HEIGHT_CELLS`**。

不要退回按帧框缩放。图集帧是裁剪过的，Pixi 的 `texture.width` 返回未裁剪的 `sourceSize`，
所有集合都是 256，等于拿「画布」当基准——谁在帧里画得满谁就显示得大。历史上就是这么坏的：
sword 站立高只占源帧 50%、bow 占 85%，同样的 1.35 倍率下 bow 比 sword 高出 47%，
在地图上明显过大。脚线同理，sword 的脚曾落在格心下方 0.65 格，已经掉出格子。

取度量只用静止帧、不用逐帧包围盒，是因为举武器过顶的帧会把高度撑起来，按它归一化会让
攻击动作多的角色整体偏小。旧清单没有 `metrics` 时运行时回退到老的按帧框缩放。

#### 集合 id 撞车守卫

`tres2pixi.mjs` 和 `sprite2anim.mjs` 都往 `src/data/anim/` 写清单，同一个 id 会互相覆盖，
而且谁后跑谁赢、毫无提示。`writeAnimSet` 因此按清单里的 `source` 字段认领所有权，换生产者
会直接报错：

```
集合 id 撞车: sword 现属于 godot/art/units/sword/sword_frames.tres，本次来源是 art/sprite-runs/sword。
确实要换生产者就先删掉 src/data/anim/sword.json 再跑。
```

有意迁移就按提示删掉旧清单——这一步是故意留成手动的，逼你确认这是迁移而不是重名。
`sword` 已经这样从 Godot 迁到 AI 管线，`tres2pixi` 的 `SETS` 里只剩 `slash`。

角色本身画多大也有硬标准，见[美术风格圣经](./美术风格圣经.md) §3：头连头发占总高一半、
**身体**（不含道具）宽高比 0.9–1.0。prompt 里千万别写 "2.5 heads tall"——bow v1 和
第一版四职业 lineup 都栽在这句上，出来的角色宽高比只有 0.54–0.67，在棋盘上细节糊成一团。

#### 加载时机

`loadAnimSets()` 在 `GameFlow.loadAssetsAndStart` 里被 await，但只阻塞 `CORE_SET_IDS`
（第 1 关就会出现的单位外观与普攻特效）；其余集合转后台补齐。Boss 专属外观和大招特效体积不小
（bloodfang 540KB、roar 79KB），不该挡首屏，而运行时本来就有回退静态贴图的兜底。

新增集合默认进后台队列。如果它在某关必须就位，在进战前调 `ensureAnimSets`——
`GameFlow.renderDeploy` 已经用 `animSetsForUnits(...)` 在布阵期间预取本场要用的集合。

#### 按技能播序列帧特效

取用登记在 `src/data/vfxCatalog.ts`，一个技能一行，键是 **`skillId`**：

```ts
whirl: { set: 'whirl', anchor: 'caster', cells: 3, mode: 'burst', sparks: skillSparks(GOLD) },
```

字段含义与设计规则见《[特效圣经](./特效圣经.md)》§5。没登记的技能仍按 `displayKind` 取
`images/fx/` 下的静态贴图；图集缺失或加载失败时 `playFxAnimation` 返回 0，也回退到那条路。

#### 静止与行走的切换

走路动画是 `loop: true`，**播完最后一步必须主动切回静止**，否则单位会站在原地一直迈腿。
`BattlePlaybackView` 的事件循环在 `moveStep` 之后前瞻一个事件，下一个不是同一 uid 的
`moveStep` 就调 `playIdle()`；攻击动作则由 `playAttack` 的 `onComplete` 负责回到静止。

`idle_from_walk` 预设会从行走 sheet 第 1 列（双脚并立的中立姿势）额外注册
`idle_up/down/left/right`，`playIdle` 优先按当前朝向取，走完不会突然转向镜头。
这些帧和行走共用，图集里会去重，不额外占体积。只有 `idle` / `default` 两帧的老集合
（如 `sword`）自动退回原来的正/背两态。

## 各集合当前状态

四个兵种（`UnitKind` = sword / bow / shield / cavalry）敌我通用，全部走 AI 管线、四方向行走 +
四方向攻击，规格一致。Boss 与特效另计。

| 集合 | 体积 | idle | walk | attack | 备注 |
|---|---:|---|---|---|---|
| `sword` | 270KB | 四方向（复用行走中立帧） | 四方向 10fps | 四方向（right 镜像） | 深红，巨剑 |
| `bow` | 351KB | 同上 | 四方向 10fps | 四方向（right 镜像） | 叶绿，大弓 + 米白披风 |
| `shield` | 378KB | 同上 | 四方向 9fps | 四方向（right 镜像） | 钢蓝，米白塔盾 + 蓝十字 |
| `cavalry` | 418KB | 同上 | 四方向 11fps | 四方向（right 镜像） | 金黄，白马 + 长枪，唯一宽大于高的剪影 |
| `bloodfang` | 450KB | 同上 | 四方向 9fps | down / left / right（right 镜像） | 第一章 Boss 血牙酋长，关 7 的 `animSet` |
| `slash` | 45KB | — | — | — | add 混合，普攻命中特效 |
| `roar` | 79KB | — | — | — | add 混合，狂暴战吼冲击波 9 帧 20fps |

第一章杂兵是**单帧静止怪**，四只共用一张 2x2 生图（`docs/prompt/mobs_ch1_v1_prompt.txt`），
`preset: 'single'` 每只取一帧。`defId` 仍是四兵种，数值/克制/AI 全不变，只有 `animSet` 换掉。

| 集合 | 体积 | 对应 defId | 剪影 |
|---|---:|---|---|
| `slime` | 7.7KB | sword | 黏泥怪，圆滚水滴 |
| `sporecap` | 12.0KB | bow | 孢子菇，宽伞盖 |
| `bloodwolf` | 11.1KB | cavalry | 血牙狼，四足低伏 |
| `rockshell` | 13.8KB | shield | 岩甲龟，厚穹顶 |

### 杂兵只出一张图，动起来的部分交给代码

四只怪一次出全套是为了让描边粗细、简化程度、俯视角度天然一致——它们要并排站在同一块棋盘上，
分四次生图必然漂移。用 `--mode grid --rows 2 --cols 2 --label-prefix mob`
配 `--align feet --shared-scale`，四只自动落在同一条脚线、同一个缩放上。

**呼吸不出图。** 两张几乎一样的 AI 帧之间必然抖动（行走 sheet 打包成 1-2-1-4 就是为了躲这个），
画出来的呼吸读成画面在沸腾。`AnimatedUnit` 对没有 `walk_down` 的集合按脚线做挤压拉伸，
竖向 ±4.5%、周期 2.3s、横向反向补偿 0.7、相位随机错开。缩放的不动点是源帧中心，
所以每帧要按当前倍率把 y 反算回同一条站立线，否则脚会跟着飘。

**没有攻击图集时也不能什么都不做。** 伤害数字和挥砍特效都出现在被打的那一格，
攻击方全程杵着不动的话，读起来像是它旁边的人在打。`playAttack` 缺动画时回退到代码突刺：
朝目标冲出 0.26 格再回来，260ms，正好给这一拍一个起点。

呼吸和突刺都在写同一个 sprite 的 scale/position，必须在同一个 ticker 回调里算完再写一次，
分成两个回调会互相覆盖。回调挂在 `PIXI.Ticker.shared` 上，**必须自摘**——切场景时整棵树被
destroy，但 `handle.destroy()` 只在单位阵亡时调用，存活单位的回调会一直跑在已销毁的 sprite 上
（同 `updateSkillRings` 的写法，检查 `sprite.destroyed`）。

### 静态 token 从图集派生，不要手工维护

布阵格子、队伍卡片、冒险地图、元商店、战斗里的技能头像，用的都不是动画，而是
`images/units/<兵种>.png` 这批静态图（8 处调用点全部经过 `renderHelpers.createUnitToken`
→ `UNIT_BUNDLE`）。四兵种换成 AI 管线那版之后这批图没跟着换，于是布阵界面还是旧美术、
一进战斗人就变了——**这是资产脱节，不是漏改代码**。

现在由 `scripts/anim2token.mjs` 从各集合的静止正面帧派生，已并进 `npm run anim:build:sprite`，
单独重跑用 `npm run anim:tokens`。

`createUnitToken` 只按**高度**撑满格子，所以派生时要把比例烤进图片：所有集合共用同一个裁剪框，
站位复刻 `AnimatedUnit`（身体 0.92 格、脚线在格心下方 0.2 格）。裁剪框取全集合并集而不是对称方图
——剑士的巨剑向上探出 1.10 格、脚下只要 0.21 格，对称留边会白扔掉半张图，把角色压到只剩四成高。
当前实测 1.38×1.41 格 → 126×128px，身体占图高 65%。

**敌方杂兵必须进同一个裁剪框**：布阵格里敌我并排站，各切各的框就没法比大小了。
也因此 `createUnitToken` 不能改回按长边撑满——血牙狼是横向剪影，长边是宽，
按长边它自己会缩小，而共用框一变，所有人跟着缩。横向溢出格子是可以的，
棋盘没有 mask 也没有 z 排序，和 `AnimatedUnit` 让长兵器探出格子是同一个取舍。

`images/units` 也在 `cdnDirs` 里，改完同样要 `bash scripts/upload.sh`。

### 图集走 CDN，不随包

四兵种做齐后 `images/anim` 合计 2MB，加上代码 688KB 和当时 496KB 的 `images/ui`，主包 3.1MB / 4MB，
只剩不到 1MB 余量，而每个新单位就是 350–450KB。降采样不是出路：格子最大 56 CSS px，
DPR 3 下需要约 155 物理像素，现在源图身体 145–208 已在临界点。所以 `images/anim` 迁到了
`cdnDirs`。

`images/ui` 后来重做时又从 496KB 降到 83KB：删掉三张从未被引用的 392×440 按钮/面板母版，
按钮改成代码绘制，图标从 64px 长边重出。现在主包只剩代码 + 83KB 的 `images/ui`。

**同时要改 `project.config.json` 的 `packOptions.ignore`。** 之前那里只忽略了 `node_modules`，
CDN 目录一边从云端下载、一边照样打进包里，等于白配。五个 CDN 目录现在都在 ignore 列表内，
新增 CDN 目录时记得两处一起改。

加载时序（`animSets.ts` + `GameFlow`）：
- `loadAnimSets()` 启动时调用但**不 await**，后台按 `CORE_SET_IDS`（四兵种 + slash）优先拉全部。
  await 它就是主页白屏几秒。
- 布阵界面 `void ensureAnimSets(animSetsForUnits(...))` 提前拉本场要用的 Boss 外观与技能特效。
- `resolveBattle` 进战前检查 `animSetReady`，没就绪就弹「资源加载中…」并 await。宁可多等一下，
  也不要开场满屏静态棋子。`ensureAnimSets` 幂等，会复用已经在飞的请求。

改完记得 `bash scripts/upload.sh` 把 `images/anim` 传上 CDN，否则线上直接白图。

`bloodfang` 没做 `attack_up`：`AnimatedUnit.playAttack` 找不到对应动画时回退到 `attack_right`
（`AnimatedUnit.ts:111`），朝上攻击会用镜像出来的右向动作。Boss 站在关 7 北侧高台、玩家从
南侧上来，朝上攻击几乎不会发生，不值得为它单独生一张。兵种则四向做齐，因为它们哪个方向都可能打。

### 行走动作的验收标准

**腿部剪影差异 ≥ 15%**，低于这个数就重出，不要靠肉眼判断。取每方向第 1 帧（中立）与第 2/4 帧
（迈步）的下 30% 区域，算 alpha 剪影的异或占比：

```
第 1 版（prompt 写 "slight body bob down"）  剑士 6.2% / 弓手 2.8~11.9%   ← 像雕像平移
血牙（prompt 写 "heavy body bob down"）      23~52%                       ← 好基准
换 _walk_motion_block.txt 之后              剑士 15.4~47.5% / 盾卫 17.6~23.8% / 骑兵 21.4~37.4%
```

一个 "slight" 和 "heavy" 的措辞差就是这个量级，所以迈腿描述抽成了
[`_walk_motion_block.txt`](./prompt/_walk_motion_block.txt)，别在各 prompt 里重写。

### 行走只打包 3 帧

`player_sheet` 的播放序是 **1-2-1-4** 而不是 1-2-3-4。prompt 要求第 1、3 列都是"双脚并拢的中立
姿势"，复用第 1 列既省掉每方向一帧（全表图集 -13%，2304→2004KB），又消掉两张中立帧之间的生图
抖动。第 3 列仍然要出图——少画一列模型会把节奏排乱，它只是不进图集。

## 场景、地形、UI 走一条更短的支线

背景、地形贴图、UI 图标、logo 这些**不是动画**，用不上 `generate2dsprite` 的切帧、对齐、
体型归一化。它们的管线只有三步：

```bash
# 1. 生图（品红底，多个素材出在一张 sheet 上），prompt 见 docs/prompt/
# 2. 按连通域切开
python3 scripts/split-tile-sheet.py --input sheet.png --out-dir images/terrain \
    --names high forest river swamp wall abyss --size 128
# 3. 清紫边 + 压缩
python3 scripts/despill-magenta.py images/terrain
pngquant --force --strip --quality=70-95 --speed 1 --output <f> <f>
```

`split-tile-sheet.py` 有三个地方是踩过坑才那么写的：

- **按连通域找素材，不按名义网格等分切。** 模型画格子的位置从来不准，等分切会削掉边缘。
- **填洞的结果只用于分块，不能当 alpha。** 齿轮的轴孔会把图标切成两块，所以要填洞；
  但拿填过洞的掩码去当 alpha，孔就被糊成不透明的品红了。
- **缩放前要预乘 alpha。** 直接缩 RGBA 会把透明像素里残留的品红混进边缘，出一圈紫边。

抠像用「品红度」= `min(r,b) - g` 这个连续分数配阈值，而不是 RGB 距离：品红键色压缩后
会晕开成一圈紫，单纯比距离要么留紫边、要么啃掉素材本身的暖色。

### 素材本身带紫时，两个阈值都要抬

紫和品红在色相上挨着，默认参数会把紫色素材当成键色残留一起处理掉。魂晶那张图里的紫水晶
第一次切出来是**白配深蓝**，紫全没了。两个环节各有一个开关：

| 环节 | 参数 | 作用 |
|---|---|---|
| `split-tile-sheet.py` | `--key-threshold`（默认 170） | 品红度高于此值判为背景 |
| `despill-magenta.py` | `--min-spill`（默认 0） | 品红度高于此值才算溢色去校正 |

定值先量再定，别拍脑袋：

```bash
python3 -c "
from PIL import Image; import numpy as np
a=np.array(Image.open('sheet.png').convert('RGB')).astype(int)
s=np.minimum(a[...,0],a[...,2])-a[...,1]
print('键色底', np.percentile(s[s>200],[5,50]))     # 实测 237~245
print('素材最高', np.percentile(s[s<200],99))        # 紫水晶实测 133"
```

素材最高值和键色底之间取一个数即可（那张图取的 140）。两者之间没有空隙时说明键色选错了，
换绿键重出，别硬调阈值。

各类资产的规格见[风格圣经 §8](./美术风格圣经.md#8-资产标准)。按钮和面板**没有贴图**，
是 `PIXI.Graphics` 画的，原因见[圣经 §6](./美术风格圣经.md#6-ui-视觉语言)。

## 已知坑

**第三行朝向。** 生图模型很难可靠地把 4×4 行走 sheet 的第三行画成第二行的镜像，实测
bow sheet 的第二、三行都朝左。不要为此重摇生图——镜像是确定性操作，在 `SETS` 里写
`mirrorRight: true`，`walk_right` 就会由 `left-*` 帧水平镜像得到。转身导致持械手换边是
合理的，不算持械手漂移。

**`anchor_y_std` 轻微超标。** bow 实测 0.052、bloodfang 0.050，略高于 0.05 阈值，原因是背面
（up）行的斗篷/皮毛盖住了脚，包围盒底边和其他行不在一处。这个量级可以接受，告警是提示不是拦截。

**背景颜色是最不稳的一项。** 不管把「纯品红」/「纯黑」写得多显眼，仍有约 1/4 的概率整张背景
变成黑色或别的颜色。这是 `gen-sprite-candidates.py` 要做品红占比检查的直接原因。把键色要求写在
prompt 最前面并声明「overrides everything else」能降低概率，但压不到 0。

**静止帧可以复用行走帧。** 行走 sheet 第 1 列本来就是双脚并立的中立姿势，用
`idle_from_walk` preset 就能拿到 `idle`（背面，玩家朝上迎敌）和 `default`（正面，敌人朝下），
不用额外生一张。图集里这些帧会去重，不会重复占体积。想要真正的呼吸循环再单独出
`--mode idle` 的 2×2。

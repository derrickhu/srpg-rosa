import * as PIXI from 'pixi.js';

/**
 * 黑底特效的两段式混合。
 *
 * ## 为什么不能用纯 additive
 *
 * 战场草地是 RGB(202,225,54)，绿通道已经 225/255。additive 叠上去只能往 255 推，
 * 于是中间调和暗部——形状与质感的全部信息——在屏幕上一起消失，每个特效都退化成
 * 它最亮的那一团白光。实测（`scripts/vfx-preview.py` 能离线复现这一步）：
 *
 * - 赤焰火环的深红外沿整个不见，剩一团苍白的黄光；
 * - **银白**的盾墙冲击环在草地上叠成了**黄绿色**；
 * - **青蓝**的破甲符印变成苍白薄荷。
 *
 * 也就是说《特效圣经》§4.1「一个职业一套色相，金橙闪一下就知道是剑士」这条规则
 * 在游戏里其实从来没生效过——所有 additive 特效叠到黄绿草地上都收敛到同一种白。
 * 这同时解释了两件看起来无关的抱怨：「太亮」和「不同技能没有新鲜感」。
 *
 * ## 两段分别做什么
 *
 * - **形体层**：普通混合，靠图集里烘好的 alpha（亮度^2，见 `scripts/vfx-sheet.py`）
 *   遮挡背景。有遮挡才有体积，红才是红。
 * - **核心层**：同一批贴图叠一层低增益 additive，只贡献白热核心的光溢出，
 *   让它读作光而不是贴纸。
 *
 * ## 为什么核心层做成形体层的**子节点**
 *
 * 变换自动同步。做成兄弟节点就得在每个调用点把 position / rotation / scale 抄一遍，
 * 而这些调用点分散在弹体、光束、闪光三处，抄漏一个就是两层错位的重影。
 * 子节点还顺带让外部代码完全不用改——`sprite.texture`、`sprite.position`、
 * `sprite.destroy()` 照旧可用，销毁父节点会连子节点一起回收。
 */

/**
 * 形体层不给满 1.0：特效盖在挨打的单位身上，全不透明会把人整个挡掉，
 * 玩家看不见谁在受击。留一线透光比「更实」重要。
 */
export const VFX_BODY_ALPHA = 0.9;
/** 核心层增益。再高就会开始把形体层辛苦压出来的暗部重新洗白 */
export const VFX_CORE_GAIN = 0.5;

/**
 * 给一个已配置好的 additive 特效精灵补上核心层，返回它自己（便于链式调用）。
 *
 * 传进来的精灵会被改成**普通混合**当形体层，核心层作为子节点挂上去。
 * `opacity` 是整体不透明度，两段都乘它。
 */
export function attachCorePass<T extends PIXI.Sprite>(
  body: T,
  textures: readonly PIXI.Texture[] | null,
  opacity = 1,
): T {
  body.blendMode = PIXI.BLEND_MODES.NORMAL;
  body.alpha = VFX_BODY_ALPHA * opacity;

  // 子节点不继承 anchor，只继承变换。父节点 anchor=0.5 时它的变换原点就是图心，
  // 所以核心层放在 (0,0) 且自己也 anchor=0.5 才对得上。
  if (textures && textures.length > 1 && body instanceof PIXI.AnimatedSprite) {
    const core = new PIXI.AnimatedSprite(textures as PIXI.Texture[]);
    core.anchor.set(body.anchor.x, body.anchor.y);
    core.blendMode = PIXI.BLEND_MODES.ADD;
    core.alpha = VFX_CORE_GAIN * opacity;
    // 帧同步跟着形体层走，不各自计时：两个 AnimatedSprite 分别计时的话，
    // 只要有一帧 deltaMS 抖动就会错开一帧，边缘会出现重影
    core.autoUpdate = false;
    core.gotoAndStop(body.currentFrame);
    body.onFrameChange = () => {
      if (!core.destroyed) core.gotoAndStop(body.currentFrame);
    };
    body.addChild(core);
    return body;
  }

  const core = new PIXI.Sprite(body.texture);
  core.anchor.set(body.anchor.x, body.anchor.y);
  core.blendMode = PIXI.BLEND_MODES.ADD;
  core.alpha = VFX_CORE_GAIN * opacity;
  body.addChild(core);
  return body;
}

import * as PIXI from 'pixi.js';
import {
  animSetReady,
  getAnimBlend,
  getAnimManifest,
  getAnimTextures,
  getClip,
  isMookArt,
  sharesPlayerArt,
  type AnimManifest,
} from '@/view/animSets';

/** 缺 metrics 的旧清单回退用的源尺寸基准（Godot 帧为 512px 方图） */
const SOURCE_FRAME_SIZE = 512;
/** 缺 metrics 时按帧框缩放的倍率（旧行为，各集合大小会不一致） */
const DISPLAY_SCALE = 1.35;

/**
 * 棋盘单位的**身体**（头顶到脚，不含道具）占几格。这是全项目单位大小的唯一标准：
 * 清单里的 metrics.subjectHeight 由打包期的 bodySpan 切出，已排除举过头顶的武器、
 * 翎羽、犄角这类细长道具，按它归一化，不同来源（Godot / AI 生图）、不同画法占比的角色
 * 都会渲染成同一个屏幕高度。
 *
 * 归一化的是身体而不是整个包围盒，所以**道具可以自由超出格子**——棋盘没有 mask 也没有
 * z 排序，溢出不会被裁。美术因此不必为了"框进一格"而把长兵器缩小或压低，竖举的长枪、
 * 法杖、犄角都可以正常设计。
 *
 * 不要改回按源帧边长缩放——那样谁在帧里画得满谁就显示得大，实测 bow 比 sword 高 47%。
 * 数值本身没有含义，只是让屏幕大小跟着 bodySpan 的口径走：口径改一次就按剑士重新标定一次
 * （剑士身体现测 125、包围盒 129，历史上按整包围盒是 0.95，故 0.95 × 125/129 ≈ 0.92），
 * 保证判据演进不会悄悄改变已有单位的大小。
 */
export const UNIT_HEIGHT_CELLS = 0.92;
/**
 * 杂兵身体高度。块状剪影（水滴/伞盖/四足/龟壳）同高时视觉质量比人形大一圈，
 * 缩到约 3/4 才读得像「小怪」而不是「另一拨英雄」。
 */
export const MOOK_HEIGHT_CELLS = 0.7;
/** 脚线落在格心下方多少格，让单位站住而不是浮在格心 */
export const FEET_BELOW_CENTER = 0.2;
const ENEMY_TINT = 0xffaaaa;

/** 该集合在棋盘上的身体高度（格）。杂兵矮一档，其余一律 UNIT_HEIGHT_CELLS。 */
export function unitHeightCells(setId: string): number {
  return isMookArt(setId) ? MOOK_HEIGHT_CELLS : UNIT_HEIGHT_CELLS;
}

/**
 * 头顶相对单位容器原点（格心）的本地 y（向上为负）。
 *
 * 脚线在 `+FEET_BELOW_CENTER`，头顶再往上一个身体高度。血条底边应对齐这里再留一点空隙，
 * 以前写死 `cell * 0.4`——实际头顶约在 `0.72` 格，血条就会压进头发/伞盖。
 */
export function unitHeadLocalY(setId: string, cell: number): number {
  return cell * (FEET_BELOW_CENTER - unitHeightCells(setId));
}

/**
 * 没有行走图集的单位（第一章的单帧杂兵）靠代码做呼吸。
 *
 * 呼吸不出图是有意的：两张几乎一样的 AI 帧之间必然抖动，画出来的呼吸读成画面在沸腾
 * 而不是生物在喘气（行走 sheet 打成 1-2-1-4 也是为了躲这个）。挤压拉伸是纯几何变换，
 * 交给代码保证干净，还省掉每只怪三四帧图集。横向做反向的轻微补偿，比单纯拉高更像活物。
 * 相位随机错开，否则一排怪会整齐划一地同频起伏，比不动还假。
 */
const BREATH_AMP = 0.045;
const BREATH_PERIOD_MS = 2300;
const BREATH_SQUASH = 0.7;

/**
 * 没有攻击图集时的代码突刺：朝目标冲出去再回来。
 *
 * 不能就这么 return 0 —— 伤害数字和挥砍特效都出现在被打的那一格，攻击方全程杵着不动的话
 * 读起来像是它旁边的人在打，出手的是谁看不出来。位移只要给这一拍一个起点就够。
 */
const LUNGE_MS = 260;
const LUNGE_CELLS = 0.26;

export interface AnimatedUnitHandle {
  view: PIXI.Container;
  playIdle(): void;
  playWalk(dx: number, dy: number): void;
  /** 播放朝向目标的攻击动画，返回时长(ms)，播完自动回到 idle */
  playAttack(dx: number, dy: number): number;
  /**
   * 受击闪白。打击感里最便宜也最有效的一项：告诉玩家「就是这一下打到了他」。
   * 敌人平时是染红的，闪白因此格外明显。
   */
  flashHit(ms: number): void;
  destroy(): void;
}

type Facing = 'up' | 'down' | 'left' | 'right';

function resolveWalk(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return 'idle';
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'walk_left' : 'walk_right';
  return dy < 0 ? 'walk_up' : 'walk_down';
}

function resolveAttack(dx: number, dy: number): string {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'attack_left' : 'attack_right';
  return dy < 0 ? 'attack_up' : 'attack_down';
}

function facingFromDelta(dx: number, dy: number, prev: Facing): Facing {
  if (dx === 0 && dy === 0) return prev;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * 用 Godot 导出的图集创建一个可播放走/攻击/idle 的棋盘单位。
 * 图集未就绪或缺 idle 动画时返回 null（调用方应回退到 createUnitToken）。
 */
export function createAnimatedUnit(
  setId: string,
  faction: 'player' | 'enemy',
  cell: number,
): AnimatedUnitHandle | null {
  const manifest: AnimManifest | null = getAnimManifest(setId);
  if (!manifest || !animSetReady(setId)) return null;

  const idleName = manifest.animations.idle
    ? 'idle'
    : manifest.animations.default
      ? 'default'
      : null;
  if (!idleName) return null;
  const idleTextures = getAnimTextures(setId, idleName);
  if (idleTextures.length === 0) return null;

  const view = new PIXI.Container();
  // 玩家从下往上迎敌默认背面(up)，敌人默认正面(down)
  let facing: Facing = faction === 'player' ? 'up' : 'down';

  // 图集帧是裁剪过的，Pixi 的 texture.width 返回未裁剪的 sourceSize，各集合都一样大，
  // 所以只能靠 metrics 里记录的角色实际高度来对齐大小。
  const metrics = manifest.metrics;
  const heightCells = unitHeightCells(setId);
  const fit = metrics
    ? (cell * heightCells) / metrics.subjectHeight
    : (cell * DISPLAY_SCALE) / (idleTextures[0]!.width || SOURCE_FRAME_SIZE);

  const sprite = new PIXI.AnimatedSprite(idleTextures);
  sprite.anchor.set(0.5);
  sprite.scale.set(fit);
  // anchor 0.5 对准的是源帧中心，而角色在帧里的高低各不相同，
  // 得按脚线把它挪到统一的站立位置，否则不同集合会一个悬空一个陷进格子。
  const feetOffset = metrics
    ? (metrics.baselineY - metrics.frameSize / 2) * fit
    : cell * 0.5;
  const standY = cell * FEET_BELOW_CENTER;
  sprite.position.set(0, standY - feetOffset);
  if (faction === 'enemy' && sharesPlayerArt(setId)) sprite.tint = ENEMY_TINT;
  view.addChild(sprite);

  let currentName = '';

  function play(name: string, opts?: { onComplete?: () => void }): boolean {
    const clip = getClip(setId, name);
    const textures = getAnimTextures(setId, name);
    if (!clip || textures.length === 0) return false;
    // 同一个循环动画正在播则不重启，避免移动多步抖动
    if (name === currentName && clip.loop) return true;
    currentName = name;
    sprite.textures = textures;
    sprite.loop = clip.loop;
    sprite.animationSpeed = (clip.fps || 12) / 60;
    sprite.onComplete = opts?.onComplete ?? undefined;
    sprite.gotoAndPlay(0);
    return true;
  }

  const breathes = !manifest.animations.walk_down;
  const hasAttackClip = (['down', 'left', 'right', 'up'] as const).some(
    (d) => manifest.animations[`attack_${d}`],
  );
  let breathT = Math.random() * BREATH_PERIOD_MS;
  let lungeT = -1;
  let lungeX = 0;
  let lungeY = 0;

  // 呼吸和突刺都在写 sprite 的 scale/position，必须由同一个回调统一算完再写一次，
  // 否则两者会互相覆盖（突刺期间呼吸把 y 拉回去）。
  function tick(): void {
    // 切场景时整棵树被 destroy，存活单位的 handle.destroy 不会被逐个调用（只有阵亡才调），
    // 回调不自摘就会一直跑在已销毁的 sprite 上。同 updateSkillRings 的写法。
    if (sprite.destroyed) {
      PIXI.Ticker.shared.remove(tick);
      return;
    }
    let sy = 1;
    if (breathes) {
      breathT += PIXI.Ticker.shared.deltaMS;
      sy = 1 + BREATH_AMP * Math.sin((breathT / BREATH_PERIOD_MS) * Math.PI * 2);
      // 竖向缩放的不动点是源帧中心，脚线会跟着飘；按当前倍率反算回同一条站立线
      sprite.scale.set(fit * (1 - (sy - 1) * BREATH_SQUASH), fit * sy);
    }
    let ox = 0;
    let oy = 0;
    if (lungeT >= 0) {
      lungeT += PIXI.Ticker.shared.deltaMS;
      if (lungeT >= LUNGE_MS) lungeT = -1;
      else {
        const d = Math.sin((lungeT / LUNGE_MS) * Math.PI) * cell * LUNGE_CELLS;
        ox = lungeX * d;
        oy = lungeY * d;
      }
    }
    sprite.position.set(ox, standY - feetOffset * sy + oy);
  }

  const animated = breathes || !hasAttackClip;
  if (animated) PIXI.Ticker.shared.add(tick);

  /** 缺攻击动画时的替代出手，返回这一拍的时长(ms) */
  function startLunge(dx: number, dy: number): number {
    if (!animated || (dx === 0 && dy === 0)) return 0;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    lungeX = horizontal ? Math.sign(dx) : 0;
    lungeY = horizontal ? 0 : Math.sign(dy);
    lungeT = 0;
    return LUNGE_MS;
  }

  function playIdle(): void {
    // 有四向静止帧就按朝向站（走完不会突然转向镜头）；
    // 只有正/背两帧的老集合退回原逻辑
    if (play(`idle_${facing}`)) return;
    const name = facing === 'up' && manifest!.animations.idle ? 'idle' : 'default';
    if (!play(name)) play('idle');
  }

  function playWalk(dx: number, dy: number): void {
    facing = facingFromDelta(dx, dy, facing);
    const name = resolveWalk(dx, dy);
    if (!play(name)) playIdle();
  }

  function playAttack(dx: number, dy: number): number {
    facing = facingFromDelta(dx, dy, facing);
    let name = resolveAttack(dx, dy);
    if (!manifest!.animations[name]) name = 'attack_right';
    const clip = getClip(setId, name);
    const textures = getAnimTextures(setId, name);
    // 没有攻击图集的集合（单帧杂兵）转身面向目标，出手交给代码突刺
    if (!clip || textures.length === 0) {
      playIdle();
      return startLunge(dx, dy);
    }
    play(name, { onComplete: () => playIdle() });
    return (textures.length / (clip.fps || 12)) * 1000;
  }

  // 阵营染色在构造时定下就不再变，所以底色可以一次记住。
  // 不能在 flashHit 里现取：连吃两下时第二次会把「白」当成底色存下来，闪完再也回不到红。
  const baseTint = sprite.tint;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  function flashHit(ms: number): void {
    if (ms <= 0 || sprite.destroyed) return;
    sprite.tint = 0xffffff;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = undefined;
      if (!sprite.destroyed) sprite.tint = baseTint;
    }, ms);
  }

  playIdle();

  return {
    view,
    playIdle,
    playWalk,
    playAttack,
    flashHit,
    destroy(): void {
      if (flashTimer) clearTimeout(flashTimer);
      // 仅停止动画；view 作为 token 的子节点，由 token.destroy 统一回收。
      // ticker 挂在全局共享实例上，不摘会一直跑在已销毁的 sprite 上。
      if (animated) PIXI.Ticker.shared.remove(tick);
      sprite.stop();
      sprite.onComplete = undefined;
    },
  };
}

export interface FxPlayOptions {
  /**
   * 旋转角（弧度）。素材一律画成朝右（+X），运行时转到实际方向。
   * 环形/星形这类径向对称的特效不要传——转了看不出来，白算。
   */
  rotation?: number;
  /**
   * 射线模式：沿朝向拉长到 `lengthPx`，锚点移到左端（贴在施法者身上）。
   * 射线技能的长度是变量，固定尺寸的贴图盖不住，只能拉。
   */
  lengthPx?: number;
  /**
   * 亮度闸门。生图给的亮度是不可控的——同一套 prompt 出来的素材，有的峰值亮区
   * 只占 20%，有的能到 54%，后者叠加上去会把挨打的人整个糊白，玩家看不出是谁中招。
   * 素材不重生，运行时收一档。
   */
  alpha?: number;
}

/**
 * 一次性序列帧特效（如挥砍）。播完自毁。返回时长(ms)。
 */
export function playFxAnimation(
  layer: PIXI.Container,
  x: number,
  y: number,
  setId: string,
  animName: string,
  sizePx: number,
  opts: FxPlayOptions = {},
): number {
  const clip = getClip(setId, animName);
  const textures = getAnimTextures(setId, animName);
  if (!clip || textures.length === 0) return 0;

  const sprite = new PIXI.AnimatedSprite(textures);
  const native = textures[0]!.width || sizePx;
  if (opts.lengthPx !== undefined) {
    // 左端对齐施法者，横向拉到射程；纵向仍按 sizePx，否则细长射线会被一起拉粗
    sprite.anchor.set(0, 0.5);
    sprite.scale.set(opts.lengthPx / native, sizePx / native);
  } else {
    sprite.anchor.set(0.5);
    sprite.scale.set(sizePx / native);
  }
  sprite.position.set(x, y);
  sprite.rotation = opts.rotation ?? 0;
  if (opts.alpha !== undefined) sprite.alpha = opts.alpha;
  // 黑底发光特效用叠加混合，黑色不显示（对齐 Godot blend_mode=1）
  if (getAnimBlend(setId) === 'add') sprite.blendMode = PIXI.BLEND_MODES.ADD;
  sprite.loop = false;
  sprite.animationSpeed = (clip.fps || 16) / 60;
  sprite.onComplete = () => {
    if (!sprite.destroyed) {
      layer.removeChild(sprite);
      sprite.destroy();
    }
  };
  layer.addChild(sprite);
  sprite.gotoAndPlay(0);
  return (textures.length / (clip.fps || 16)) * 1000;
}

import * as PIXI from 'pixi.js';
import { makeText, type TextRole } from '@/theme/typography';

/**
 * 战斗飘字——打击反馈的文字层。
 *
 * 类型靠「颜色 + 字体角色」区分，技能名也不套方框：
 * - 伤害/治疗：得意黑大字
 * - 技能名 / 普攻：得意黑描边字（无底，和伤害同属「出手一瞬」）
 * - 地形：系统字小号（加成琥珀 / 减伤青绿）
 */

export type CombatFloatKind =
  | 'damage'
  | 'heal'
  | 'poison'
  | 'terrain'
  | 'terrainBuff'
  | 'buff'
  | 'debuff'
  | 'utility';

interface FloatStyle {
  role: TextRole;
  fill: number;
  fontSize: number;
  stroke: number;
  strokeThickness: number;
  dropShadow: boolean;
  dropShadowDistance: number;
  dropShadowAlpha: number;
  startScale: number;
  risePx: number;
  durationMs: number;
  /** 相对锚点的垂直偏移 */
  yOffset: number;
}

const FLOAT_STYLE: Record<CombatFloatKind, FloatStyle> = {
  // 伤害：大字得意黑；描边够清、阴影要轻——重黑影会糊成双层字
  damage: {
    role: 'combatFloat',
    fill: 0xff6b52,
    fontSize: 24,
    stroke: 0x3a1010,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowDistance: 1,
    dropShadowAlpha: 0.28,
    startScale: 1.3,
    risePx: 38,
    durationMs: 720,
    yOffset: -10,
  },
  heal: {
    role: 'combatFloat',
    fill: 0x7ef08a,
    fontSize: 22,
    stroke: 0x143820,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowDistance: 1,
    dropShadowAlpha: 0.25,
    startScale: 1.22,
    risePx: 34,
    durationMs: 720,
    yOffset: -8,
  },
  // 中毒 / 地形持续掉血：毒绿，和普攻红伤分开，否则「每回合掉血」读成又挨了一刀
  poison: {
    role: 'combatFloat',
    fill: 0xb8ff4a,
    fontSize: 20,
    stroke: 0x1a3208,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowDistance: 1,
    dropShadowAlpha: 0.25,
    startScale: 1.18,
    risePx: 32,
    durationMs: 700,
    yOffset: -8,
  },
  // 承伤地形（目标侧）：系统字青绿，压在伤害下方
  terrain: {
    role: 'uiStrong',
    fill: 0x6ee8c4,
    fontSize: 12,
    stroke: 0x0a2420,
    strokeThickness: 2,
    dropShadow: false,
    dropShadowDistance: 0,
    dropShadowAlpha: 0,
    startScale: 1.0,
    risePx: 20,
    durationMs: 750,
    yOffset: 16,
  },
  // 攻击地形（出手侧）：系统字琥珀，和技能胶囊分开飘
  terrainBuff: {
    role: 'uiStrong',
    fill: 0xffd27a,
    fontSize: 13,
    stroke: 0x3a2410,
    strokeThickness: 2,
    dropShadow: false,
    dropShadowDistance: 0,
    dropShadowAlpha: 0,
    startScale: 1.05,
    risePx: 24,
    durationMs: 700,
    yOffset: 0,
  },
  // 属性增益：亮金，和绿治疗 / 红伤害分开
  buff: {
    role: 'combatFloat',
    fill: 0xffe14a,
    fontSize: 22,
    stroke: 0x4a3008,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowDistance: 1,
    dropShadowAlpha: 0.28,
    startScale: 1.22,
    risePx: 36,
    durationMs: 820,
    yOffset: -8,
  },
  // 属性减益：紫，和红伤害分开
  debuff: {
    role: 'combatFloat',
    fill: 0xd4a0ff,
    fontSize: 22,
    stroke: 0x2a1040,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowDistance: 1,
    dropShadowAlpha: 0.28,
    startScale: 1.22,
    risePx: 36,
    durationMs: 820,
    yOffset: -8,
  },
  // 用药 / 系统提示：系统字冰蓝
  utility: {
    role: 'uiStrong',
    fill: 0x9ae8ff,
    fontSize: 16,
    stroke: 0x0a1a28,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowDistance: 1,
    dropShadowAlpha: 0.25,
    startScale: 1.1,
    risePx: 28,
    durationMs: 750,
    yOffset: 0,
  },
};

export interface CombatFloatHost {
  layer: PIXI.Container;
  skipping: () => boolean;
  /** 把逻辑时长换成当前倍速下的毫秒 */
  dur: (ms: number) => number;
  awaitEase: (ms: number, onUpdate: (k: number) => void) => Promise<void>;
}

/** 伤害 / 治疗 / 地形注记 / 用药提示 */
export function spawnCombatFloat(
  host: CombatFloatHost,
  x: number,
  y: number,
  msg: string,
  kind: CombatFloatKind,
  opts?: { fill?: number },
): void {
  if (host.skipping()) return;
  const st = FLOAT_STYLE[kind];
  const t = makeText(msg, st.role, {
    fill: opts?.fill ?? st.fill,
    fontSize: st.fontSize,
    stroke: st.stroke,
    strokeThickness: st.strokeThickness,
    dropShadow: st.dropShadow,
    dropShadowColor: 0x000000,
    dropShadowDistance: st.dropShadowDistance,
    dropShadowBlur: 0,
    dropShadowAlpha: st.dropShadowAlpha,
  });
  t.anchor.set(0.5);
  t.x = x;
  t.y = y + st.yOffset;
  t.scale.set(st.startScale);
  host.layer.addChild(t);

  void (async () => {
    const startY = t.y;
    const startScale = t.scale.x;
    await host.awaitEase(host.dur(st.durationMs), (k) => {
      t.y = startY - st.risePx * k;
      if (k < 0.12) {
        t.alpha = 1;
        t.scale.set(startScale * (1 + 0.22 * (k / 0.12)));
      } else if (k < 0.65) {
        t.alpha = 1;
        const settle = (k - 0.12) / 0.53;
        t.scale.set(startScale * (1.22 - 0.14 * settle));
      } else {
        t.alpha = 1 - (k - 0.65) / 0.35;
        t.scale.set(startScale * 1.08);
      }
    });
    if (!t.destroyed) {
      host.layer.removeChild(t);
      t.destroy();
    }
  })();
}

/**
 * 技能名 / 「普攻」「冲锋」一类出手标签。
 *
 * 不要圆角底：方块压在草地上又死板又像按钮。靠得意黑 + 暖金描边字本身认形，
 * 和伤害飘字同一套「字在飞」的语言；地形注记继续用系统字小号，别混进来。
 */
export function spawnSkillNameTag(
  host: CombatFloatHost,
  x: number,
  y: number,
  name: string,
): void {
  if (host.skipping()) return;
  // 暖金偏亮一档：战场草地 #CCE43C 明度高，太深的橙会陷进去
  const tx = makeText(name, 'combatLabel', {
    fill: 0xfff0b8,
    fontSize: 16,
    stroke: 0x2a1808,
    strokeThickness: 4,
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowDistance: 1,
    dropShadowBlur: 0,
    dropShadowAlpha: 0.35,
  });
  tx.anchor.set(0.5);
  tx.x = x;
  tx.y = y;
  tx.alpha = 0;
  tx.scale.set(0.82);
  host.layer.addChild(tx);

  void (async () => {
    const startY = y;
    await host.awaitEase(host.dur(620), (k) => {
      if (k < 0.16) {
        const u = k / 0.16;
        tx.alpha = u;
        tx.scale.set(0.82 + 0.28 * u);
        tx.y = startY;
      } else if (k < 0.7) {
        tx.alpha = 1;
        const settle = (k - 0.16) / 0.54;
        tx.scale.set(1.1 - 0.08 * settle);
        tx.y = startY - 10 * settle;
      } else {
        const u = (k - 0.7) / 0.3;
        tx.alpha = 1 - u;
        tx.y = startY - 10 - 16 * u;
        tx.scale.set(1.02);
      }
    });
    if (!tx.destroyed) {
      host.layer.removeChild(tx);
      tx.destroy();
    }
  })();
}

/** 回合切换条：深底胶囊 + 展示字体，回放层可 await 节奏 */
export async function spawnRoundBanner(
  host: CombatFloatHost,
  cx: number,
  cy: number,
  text: string,
): Promise<void> {
  if (host.skipping()) return;
  const banner = new PIXI.Container();
  const tx = makeText(text, 'combatLabel', {
    fill: 0xfff4dd,
    fontSize: 17,
    stroke: 0x1a1208,
    strokeThickness: 4,
  });
  tx.anchor.set(0.5);
  const padX = 22;
  const padY = 8;
  const w = Math.max(140, tx.width + padX * 2);
  const h = tx.height + padY * 2;
  const bg = new PIXI.Graphics();
  bg.beginFill(0x1a1410, 0.72);
  bg.lineStyle(2, 0xd4a24a, 0.85);
  bg.drawRoundedRect(-w / 2, -h / 2, w, h, 10);
  bg.endFill();
  banner.addChild(bg);
  banner.addChild(tx);
  banner.x = cx;
  banner.y = cy;
  banner.alpha = 0;
  banner.scale.set(0.88);
  host.layer.addChild(banner);

  await host.awaitEase(host.dur(900), (k) => {
    if (k < 0.18) {
      const u = k / 0.18;
      banner.alpha = u;
      banner.scale.set(0.88 + 0.18 * u);
    } else if (k < 0.72) {
      banner.alpha = 1;
      banner.scale.set(1.06 - 0.06 * ((k - 0.18) / 0.54));
    } else {
      banner.alpha = 1 - (k - 0.72) / 0.28;
    }
  });
  if (!banner.destroyed) {
    host.layer.removeChild(banner);
    banner.destroy({ children: true });
  }
}

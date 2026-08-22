import * as PIXI from 'pixi.js';
import type { ShakeSpec } from '@/data/vfxCatalog';
import { isDisplayLive } from '@/view/pixiLive';

/**
 * 棋盘震动。
 *
 * 打击感的三件套里，闪白和击退都作用在**挨打的那一个人**身上（见 `hitFeel.ts`）。
 * 少的是「这一下有多重」——同样的闪白配上不同的震动，一记是拍了一下，一记是砸下来。
 * 业内 2D 动作/战棋一律把这一层放在相机上，因为它是唯一能让**画面之外**的东西
 * 也参与反馈的手段。
 *
 * 这里震的是棋盘层而不是 `root`：HUD（齿轮、回合、金币）跟着抖会读成界面坏了。
 * 背景也不抖——背景一起动就变成整屏晃，晕且廉价。
 *
 * 档位（`SHAKE_LIGHT` / `SHAKE_HEAVY` / `SHAKE_BLAST`）在 `vfxCatalog` 里，
 * 和配方放在一起，避免每个技能自己编数字。
 */

export interface BoardShaker {
  /** `aimRad` 只在 `spec.alongAim` 时用到：沿出手方向单向抖 */
  shake(spec: ShakeSpec, aimRad?: number): void;
  /** 立刻归零并摘掉 ticker。切场景时调 */
  destroy(): void;
}

/**
 * 把一组层绑成一个可震的「相机」。
 *
 * 这些层的子节点用的都是屏幕绝对坐标（`originX/originY` 推出来的），
 * 层自身的 `position` 全程是 0，所以直接拿它当偏移量用是安全的。
 */
export function createBoardShaker(layers: readonly PIXI.Container[]): BoardShaker {
  let spec: ShakeSpec | null = null;
  let aim = 0;
  let elapsed = 0;
  let running = false;
  let seed = 1;

  const apply = (dx: number, dy: number): void => {
    for (const l of layers) {
      if (isDisplayLive(l)) l.position.set(dx, dy);
    }
  };

  const stop = (): void => {
    if (running) {
      PIXI.Ticker.shared.remove(tick);
      running = false;
    }
    spec = null;
    apply(0, 0);
  };

  const tick = (): void => {
    // 切场景时层先被拆。不自己摘掉 ticker 的话它会一直跑在已销毁的容器上
    if (!spec || !layers.some(isDisplayLive)) {
      stop();
      return;
    }
    elapsed += PIXI.Ticker.shared.deltaMS;
    const t = Math.min(1, elapsed / Math.max(1, spec.durationMs));
    if (t >= 1) {
      stop();
      return;
    }
    // 二次衰减包络：起手就是最大振幅，尾巴收得干净。线性衰减会拖出一段
    // 「还在轻轻抖」的尾音，连着放两招时糊成一片持续抖动。
    const decay = (1 - t) * (1 - t);
    const phase = (elapsed / 1000) * (spec.frequencyHz ?? 20) * Math.PI * 2;
    const amp = spec.amplitudePx * decay * Math.sin(phase);
    if (spec.alongAim) {
      apply(Math.cos(aim) * amp, Math.sin(aim) * amp);
    } else {
      // 无方向：每帧换一个随机轴，读起来是「炸开」而不是「被推」
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const ang = ((seed % 1000) / 1000) * Math.PI * 2;
      apply(Math.cos(ang) * amp, Math.sin(ang) * amp * 0.7);
    }
  };

  return {
    shake(next, aimRad = 0) {
      if (next.amplitudePx <= 0 || next.durationMs <= 0) return;
      // 叠加时取振幅更大的那一档，并重置计时。两记重击之间不会互相抵消成静止
      if (spec && elapsed < spec.durationMs && spec.amplitudePx > next.amplitudePx) {
        elapsed = 0;
        return;
      }
      spec = next;
      aim = aimRad;
      elapsed = 0;
      if (!running) {
        PIXI.Ticker.shared.add(tick);
        running = true;
      }
    },
    destroy: stop,
  };
}

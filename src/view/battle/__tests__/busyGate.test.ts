import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBusyGate } from '../busyGate';

describe('战斗暂停门', () => {
  it('没锁着时 wait 立刻过', async () => {
    const gate = createBusyGate();
    await expect(gate.wait()).resolves.toBeUndefined();
  });

  it('锁着时要等 set(false) 才放行', async () => {
    const gate = createBusyGate();
    gate.set(true);
    expect(gate.busy).toBe(true);
    let released = false;
    const p = gate.wait().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    gate.set(false);
    await p;
    expect(released).toBe(true);
    expect(gate.busy).toBe(false);
  });
});

describe('托管离开必须先停主循环', () => {
  it('回放循环在 stepTurn 之前等暂停门', () => {
    const src = readFileSync('src/view/BattlePlaybackView.ts', 'utf8');
    expect(src).toContain('await pauseGate.wait()');
    expect(src).toContain('if (pauseGate.busy) continue');
    expect(src.indexOf('await pauseGate.wait()')).toBeLessThan(src.indexOf('sim.stepTurn()'));
  });

  it('复活在门还锁着时也能播完上场，避免广告回来卡死', () => {
    const src = readFileSync('src/view/BattlePlaybackView.ts', 'utf8');
    const start = src.indexOf('async function applyRevive');
    const fn = src.slice(start, start + 800);
    expect(fn).toContain('playbackThroughPause += 1');
    expect(fn.indexOf('playbackThroughPause += 1')).toBeLessThan(fn.indexOf('await playEvents(evs)'));
    expect(fn).toContain('finally');
    expect(src).toContain('playbackThroughPause === 0');
  });

  it('转发领药在拉起分享之前锁门，回来再开', () => {
    const src = readFileSync('src/view/BattlePlaybackView.ts', 'utf8');
    const start = src.indexOf('async function claimShareHeal');
    const fn = src.slice(start, start + 1400);
    expect(fn.indexOf('pauseGate.set(true)')).toBeLessThan(fn.indexOf('shareAppMessage()'));
    expect(fn).toContain('pauseGate.set(false)');
    expect(fn).toContain('finally');
    expect(fn).not.toContain('await playEvents');
    expect(fn).not.toContain('playbackThroughPause');
  });
});


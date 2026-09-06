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

describe('托管复活必须先停主循环', () => {
  it('回放循环在 stepTurn 之前等暂停门', () => {
    const src = readFileSync('src/view/BattlePlaybackView.ts', 'utf8');
    expect(src).toContain('await reviveGate.wait()');
    expect(src).toContain('if (reviveGate.busy) continue');
    expect(src.indexOf('await reviveGate.wait()')).toBeLessThan(src.indexOf('sim.stepTurn()'));
  });
});


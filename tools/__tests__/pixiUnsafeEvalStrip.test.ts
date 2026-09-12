import { describe, expect, it } from 'vitest';
import {
  remainingUnsafeEvalThrows,
  stripPixiUnsafeEval,
} from '../pixiUnsafeEvalStrip';

const MSG = 'Current environment does not allow unsafe-eval, please use @pixi/unsafe-eval module to enable support.';

describe('stripPixiUnsafeEval', () => {
  it('能剥掉 esbuild 压成 $k 的检测函数', () => {
    const src = `class Ul{constructor(e){this.systemCheck()}systemCheck(){if(!$k())throw new Error("${MSG}")}}`;
    const { code, patched } = stripPixiUnsafeEval(src);
    expect(patched).toBe(1);
    expect(code).toContain('systemCheck(){}');
    expect(remainingUnsafeEvalThrows(code)).toBe(0);
  });

  it('也能剥掉普通标识符', () => {
    const src = `systemCheck(){if(!isWebGLSupported())throw new Error("${MSG}")}`;
    const { patched } = stripPixiUnsafeEval(src);
    expect(patched).toBe(1);
  });
});

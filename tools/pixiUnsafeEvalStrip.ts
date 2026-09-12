/**
 * 构建后抽空 Pixi ShaderSystem.systemCheck。
 * esbuild 会把检测函数压成 `$k` 这种带 $ 的名字，`\w+` 匹配不上就会漏剥，
 * iOS 微信真机一 new Application 就 throw unsafe-eval。
 */
export const SYSTEM_CHECK_THROW_RE =
  /systemCheck\(\)\{if\(![$\w]+\(\)\)throw new Error\("Current environment does not allow unsafe-eval[^}]*\}/g;

export function stripPixiUnsafeEval(code: string): { code: string; patched: number } {
  let patched = 0;
  const next = code.replace(SYSTEM_CHECK_THROW_RE, () => {
    patched += 1;
    return 'systemCheck(){}';
  });
  return { code: next, patched };
}

export function remainingUnsafeEvalThrows(code: string): number {
  return (code.match(/does not allow unsafe-eval/g) || []).length;
}

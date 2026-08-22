import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import { mapEditorPlugin } from './tools/map-editor/server/plugin';

/** 与 game2D_huahua 一致：构建后去掉 ShaderSystem 的 unsafe-eval 抛错 */
function pixiUnsafeEvalPlugin(): Plugin {
  return {
    name: 'pixi-unsafe-eval-patch',
    writeBundle(options) {
      const outDir = options.dir || 'minigame';
      const bundlePath = path.resolve(outDir, 'game-bundle.js');
      if (!fs.existsSync(bundlePath)) return;
      let code = fs.readFileSync(bundlePath, 'utf8');
      const re =
        /systemCheck\(\)\{if\(!\w+\(\)\)throw new Error\("Current environment does not allow unsafe-eval[^}]*\}/g;
      const patched = code.replace(re, 'systemCheck(){}');
      if (patched !== code) {
        fs.writeFileSync(bundlePath, patched, 'utf8');
        console.log('[pixi-unsafe-eval-patch] Patched systemCheck in bundle');
      }
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    dedupe: ['@pixi/core', '@pixi/display', '@pixi/settings', '@pixi/constants', '@pixi/utils'],
  },
  publicDir: false,
  // GM 地图编辑器只在 dev server 下挂载（插件自带 `apply: 'serve'`），
  // 正式构建走 lib 模式，它一行代码都进不了包体——包体是 4MB 硬上限
  plugins: [pixiUnsafeEvalPlugin(), mapEditorPlugin()],
  build: {
    outDir: 'minigame',
    assetsInlineLimit: 0,
    lib: {
      entry: path.resolve(__dirname, 'src/main.ts'),
      formats: ['iife'],
      name: 'WenzhangGame',
      fileName: () => 'game-bundle.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
    emptyOutDir: false,
  },
});

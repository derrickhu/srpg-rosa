import fs from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { applyStageEdit, parseStageFile, stageIndexMap, type StageEdit } from './stageSource';

/**
 * GM 地图编辑器的 dev server 端。
 *
 * 只在 `vite` 的 serve 模式下挂载（`apply: 'serve'`），所以它对小游戏的正式构建
 * （`npm run build` 走 lib 模式）完全没有影响——这一点是有意的：GM 工具不该有任何
 * 机会把代码带进包体，包体是 4MB 硬上限。
 *
 * 为什么服务端要做这么多事，而不是让浏览器直接 import 关卡数据：
 *
 * - **写回文件**只能在 node 侧做。
 * - **解析源码范围**要用 `typescript` 编译器，把它塞进浏览器等于为了一个内部工具
 *   下载几 MB 的 parser。
 * - **胜率模拟**跑的是真实战斗引擎，几百局在 node 里几秒钟，在浏览器主线程上会卡死页面。
 *
 * 数据有两个来源，各管一段，缺一不可：
 * - **源码解析**给出可写回的字节范围、模板 helper 形式、注释锚点；
 * - **`ssrLoadModule` 求值**给出解析不出来的东西——`rookie('sword',2,1)` 展开后
 *   真正的名字、面板、animSet。编辑器要显示「黏泥怪 78 血」而不是「rookie(...)」。
 */

const STAGE_FILE = 'src/data/stagesMvp.ts';

interface RuntimeStageEnemy {
  defId: string;
  x: number;
  y: number;
  uid: string;
  name?: string;
  boss?: boolean;
  animSet?: string;
  skillSkin?: string;
  skillId?: string;
  stats?: Record<string, number>;
}

interface RuntimeStage {
  id: number;
  name: string;
  enemies: RuntimeStageEnemy[];
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: Connect.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length === 0 ? {} : JSON.parse(raw);
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function mapEditorPlugin(): Plugin {
  return {
    name: 'srpg-map-editor',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      const stagePath = path.resolve(root, STAGE_FILE);

      /** 每次请求都重新读盘 + 重新求值：编辑器开着的时候我可能正在另一边手改这个文件 */
      const loadAll = async () => {
        const source = fs.readFileSync(stagePath, 'utf8');
        const parsed = parseStageFile(source);
        const idx = stageIndexMap(parsed.chapters);

        const stagesMod = await server.ssrLoadModule('/src/data/stagesMvp.ts');
        const terrainMod = await server.ssrLoadModule('/src/data/terrainSpec.ts');
        const dungeonMod = await server.ssrLoadModule('/src/data/dungeonCatalog.ts');
        const charMod = await server.ssrLoadModule('/src/data/characterCatalog.ts');
        const unitMod = await server.ssrLoadModule('/src/data/unitDefs.ts');

        const runtime = stagesMod.STAGES_MVP as RuntimeStage[];

        const terrains = (terrainMod.TERRAIN_IDS as string[]).map((id) => {
          const s = terrainMod.getTerrainSpec(id);
          return {
            id,
            name: s.name as string,
            color: hex(s.color as number),
            moveCost: s.moveCost === Infinity ? null : (s.moveCost as number),
            atkMul: s.atkMul as number,
            defMul: s.defMul as number,
            dotPerRound: s.dotPerRound as number,
            passable: terrainMod.isPassable(id) as boolean,
            blocksSight: !!s.blocksSight,
            opensGates: !!s.opensGates,
            opensTo: (s.opensTo as string | undefined) ?? null,
            ignitesTo: (s.ignitesTo as string | undefined) ?? null,
          };
        });

        const dungeons = (dungeonMod.DUNGEON_DEFS as Array<Record<string, unknown>>).map((d) => ({
          id: d.id as string,
          name: d.name as string,
          desc: d.desc as string,
          enemyScaleBase: d.enemyScaleBase as number,
          maxParty: d.maxParty as number,
          // 商店池按类别计数：章节节奏面板要显示「本章卖几个临时技能 / 几种地形券」，
          // 那正是「循序渐进」这件事唯一能量化的地方
          pool: (d.roguelikePool as Array<Record<string, unknown>>).map((p) => ({
            category: p.category as string,
            id: (p.skillId ?? p.potionId ?? p.terrainId) as string,
          })),
          nodes: (d.nodes as Array<Record<string, unknown>>).map((n) => ({
            kind: n.kind as string,
            name: n.name as string,
            stageIndex: (n.stageIndex as number | undefined) ?? null,
            enemyScale: (n.enemyScale as number | undefined) ?? 1,
          })),
        }));

        /** 取属性的源码文本；字符串属性顺手剥掉引号 */
        const propText = (s: (typeof parsed.stages)[string], name: string): string | null => {
          const p = s.props[name];
          if (!p) return null;
          return source.slice(p.value.start, p.value.end);
        };
        const unquote = (v: string | null): string | null =>
          v === null ? null : v.replace(/^['"]|['"]$/g, '');

        const stages = Object.fromEntries(
          Object.entries(parsed.stages).map(([key, s]) => {
            const meta = idx[key];
            const rt = meta ? runtime[meta.globalIndex] : undefined;
            const dungeon = meta ? dungeons[meta.chapter - 1] : undefined;
            const node = dungeon?.nodes.find((n) => n.stageIndex === meta?.globalIndex);
            const gold = propText(s, 'goldReward');
            const deploy = propText(s, 'maxDeploy');
            return [
              key,
              {
                key,
                chapter: meta?.chapter ?? 0,
                indexInChapter: meta?.indexInChapter ?? 0,
                globalIndex: meta?.globalIndex ?? -1,
                displayName: rt?.name ?? key,
                title: unquote(propText(s, 'title')) ?? key,
                goldReward: gold === null ? 0 : Number(gold),
                aiDifficulty: unquote(propText(s, 'aiDifficulty')),
                maxDeploy: deploy === null ? null : Number(deploy),
                isBoss: !!s.props.isBoss,
                width: s.terrain.width,
                height: s.terrain.height,
                grid: s.terrain.grid,
                enemyScale: (dungeon?.enemyScaleBase ?? 1) * (node?.enemyScale ?? 1),
                enemies: s.enemies.map((e) => {
                  const r = rt?.enemies[e.index];
                  return {
                    origIndex: e.index,
                    defId: e.defId,
                    x: e.x,
                    y: e.y,
                    template: e.template,
                    srcText: e.text,
                    hasComment: e.leadingComments.length > 0,
                    name: r?.name ?? null,
                    boss: !!r?.boss,
                    animSet: r?.animSet ?? null,
                    skillSkin: r?.skillSkin ?? null,
                    stats: r?.stats ?? null,
                  };
                }),
              },
            ];
          }),
        );

        const characters = (charMod.CHARACTER_DEFS as Array<Record<string, unknown>>).map((c) => ({
          id: c.id as string,
          name: c.name as string,
          profession: c.profession as string,
        }));

        return {
          chapters: parsed.chapters.map((keys, i) => ({
            index: i + 1,
            dungeon: dungeons[i] ?? null,
            stageKeys: keys,
          })),
          stages,
          terrains,
          characters,
          troopKinds: Object.keys(unitMod.UNIT_DEFS as Record<string, unknown>),
          templates: ['rookie', 'forest', 'forestYoung', 'garrison', 'garrisonGreen'],
        };
      };

      server.middlewares.use('/api/map-editor/stages', (req, res, next) => {
        if (req.method !== 'GET') return next();
        loadAll().then(
          (data) => json(res, 200, data),
          (e: Error) => json(res, 500, { error: `${e.message}` }),
        );
      });

      server.middlewares.use('/api/map-editor/save', (req, res, next) => {
        if (req.method !== 'POST') return next();
        void (async () => {
          try {
            const edit = (await readBody(req)) as StageEdit;
            const source = fs.readFileSync(stagePath, 'utf8');
            const out = applyStageEdit(source, edit);
            if (out.text === source) {
              json(res, 200, { saved: false, message: '没有改动，未写盘', droppedComments: [] });
              return;
            }
            fs.writeFileSync(stagePath, out.text, 'utf8');
            json(res, 200, {
              saved: true,
              changedFields: out.changedFields,
              droppedComments: out.droppedComments,
            });
          } catch (e) {
            json(res, 500, { error: (e as Error).message });
          }
        })();
      });

      /** 保存前的 diff 预览：只算不写，让人先看清这次会动哪几行 */
      server.middlewares.use('/api/map-editor/preview', (req, res, next) => {
        if (req.method !== 'POST') return next();
        void (async () => {
          try {
            const edit = (await readBody(req)) as StageEdit;
            const source = fs.readFileSync(stagePath, 'utf8');
            const out = applyStageEdit(source, edit);
            json(res, 200, {
              changedFields: out.changedFields,
              droppedComments: out.droppedComments,
              diff: unifiedDiff(source, out.text),
            });
          } catch (e) {
            json(res, 500, { error: (e as Error).message });
          }
        })();
      });

      server.middlewares.use('/api/map-editor/sim', (req, res, next) => {
        if (req.method !== 'POST') return next();
        void (async () => {
          try {
            const body = (await readBody(req)) as {
              stageKey: string;
              deployIds: string[];
              level: number;
              bonusAtkEach: number;
              enemyScale: number;
              healPotions: number;
              n: number;
              /** 编辑器里还没存盘的这版布局 */
              stage: { terrain: string[][]; enemies: RuntimeStageEnemy[]; aiDifficulty?: string };
            };
            const simMod = await server.ssrLoadModule('/src/data/__tests__/helpers/stageSim.ts');
            const r = simMod.simulateStage(
              {
                stageIdx: 0,
                deployIds: body.deployIds,
                level: body.level,
                bonusAtkEach: body.bonusAtkEach,
                enemyScale: body.enemyScale,
                healPotions: body.healPotions,
                stage: {
                  id: 0,
                  name: body.stageKey,
                  goldReward: 0,
                  terrain: body.stage.terrain,
                  enemies: body.stage.enemies,
                  aiDifficulty: body.stage.aiDifficulty,
                },
              },
              body.n,
            );
            json(res, 200, r);
          } catch (e) {
            json(res, 500, { error: (e as Error).message });
          }
        })();
      });
    },
  };
}

/**
 * 极简 unified diff，只用来在保存前给人看一眼。
 *
 * 不引第三方 diff 库：这里只需要「哪些行变了」，而工具链每多一个依赖都要跟着升级维护。
 * 算法是最长公共子序列的行级版本，29 关的文件规模（约 1000 行）下开销可以忽略。
 */
function unifiedDiff(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // LCS 长度表
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push(`- ${a[i]}`);
      i += 1;
    } else {
      out.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  for (; i < n; i += 1) out.push(`- ${a[i]}`);
  for (; j < m; j += 1) out.push(`+ ${b[j]}`);
  return out;
}

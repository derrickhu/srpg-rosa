import type { TerrainId } from '@/battle/types';

export interface TerrainSpec {
  id: TerrainId;
  name: string;
  /** 进入该格的移动消耗。Infinity = 不可通行 */
  moveCost: number;
  /** 站在此格时，本单位造成的伤害乘数 */
  atkMul: number;
  /** 站在此格时，本单位**受到**的伤害乘数（< 1 = 更耐打） */
  defMul: number;
  /** 站在此格时每回合流失的血量（0 = 无） */
  dotPerRound: number;
  /**
   * **贴图加载失败时**的兜底纯色（`createTerrainCell` 走不到纹理分支时用）。
   * 取值来自 `images/terrain/*.png` 的实测主色，见风格圣经 §2.2——改贴图时一并改这里，
   * 否则 CDN 抖动的那几秒棋盘会是另一套配色。深渊取洞口的黑而不是岩缘的灰，因为玩家
   * 读到的是中间那个洞。
   */
  color: number;
}

/**
 * 地形设计契约：**一种地形只有一个动词，且必须是确定性的。**
 *
 * 一个动词——玩家在布阵那 30 秒里要同时权衡站位、克制、射程，地形再带两条规则就读不完了。
 * 所以高地只管进攻、森林只管挨打、河流只管惩罚输出、沼泽只管掉血，各占一个词，
 * 布阵格上的角标也就能压进 5 个字（见 `renderHelpers.terrainBadgeText`）。
 *
 * 确定性——原先森林是 30% 闪避。战斗是全自动的、一场 40 秒，玩家对一次暗抛硬币既看不见
 * 也无法应对，它只会让同一套布阵有时赢有时输，把「策略有效」这件事变成噪声。改成固定减伤后
 * 布阵重新变成一道可解的题，这才撑得住「易上手难精通」。要加随机性得加在玩家能响应的地方。
 *
 * 另外注意：`defMul` 只对**可通行**地形有意义。历史上唯一带 `defMul` 的是城墙（0.5），
 * 而城墙 `moveCost` 是 Infinity，没有单位能站上去——那个 0.5 从写下那天就没生效过，
 * 却让人以为地形已经有防御维度了。新增减伤一律加在可通行地形上。
 */
const SPECS: Record<TerrainId, TerrainSpec> = {
  plain: {
    id: 'plain',
    name: '平原',
    moveCost: 1,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0xcce43c,
  },
  high: {
    id: 'high',
    name: '高地',
    moveCost: 1,
    atkMul: 1.25,
    defMul: 1,
    dotPerRound: 0,
    color: 0xe4b46c,
  },
  // 与高地对称：一个 +25% 输出、一个 -25% 承伤，两个数字一样好记。
  // 移动消耗 2 是它的代价，否则远程躲进林子就没有取舍了。
  forest: {
    id: 'forest',
    name: '森林',
    moveCost: 2,
    atkMul: 1,
    defMul: 0.75,
    dotPerRound: 0,
    color: 0x3c8424,
  },
  river: {
    id: 'river',
    name: '河流',
    moveCost: 3,
    atkMul: 0.8,
    defMul: 1,
    dotPerRound: 0,
    color: 0x249cfc,
  },
  swamp: {
    id: 'swamp',
    name: '沼泽',
    moveCost: 2,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 5,
    color: 0x545424,
  },
  // 不可通行地形的 atkMul/defMul 恒为 1：没有单位能站上去，写别的值只会误导读者
  wall: {
    id: 'wall',
    name: '城墙',
    moveCost: Infinity,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x6c6c6c,
  },
  abyss: {
    id: 'abyss',
    name: '深渊',
    moveCost: Infinity,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x140322,
  },
};

export function getTerrainSpec(id: TerrainId): TerrainSpec {
  return SPECS[id] ?? SPECS.plain;
}

export function isPassable(id: TerrainId): boolean {
  return SPECS[id].moveCost < Infinity;
}

export function terrainColor(id: TerrainId): number {
  return SPECS[id].color;
}

import type { SkillShape } from './skillCatalog';

/**
 * 技能面板格子图的一格。和战斗高亮不是同一套颜色，但**哪些格该亮**必须和结算一致。
 *
 * 霜环那种「整片射程涂成伤害色」会让选点爆炸读成以自己为心的大圈；
 * 圣疗那种 `within` 若按环画，贴脸的友军在图上是空的，玩家会以为救不到。
 */
export type RangePreviewKind = 'empty' | 'center' | 'hit' | 'ray' | 'pick' | 'focus';

export interface SkillRangePreview {
  gridR: number;
  cells: RangePreviewKind[][];
}

function emptyGrid(gridR: number): RangePreviewKind[][] {
  const d = gridR * 2 + 1;
  const cells: RangePreviewKind[][] = [];
  for (let y = 0; y < d; y++) {
    cells.push([]);
    for (let x = 0; x < d; x++) cells[y]!.push('empty');
  }
  cells[gridR]![gridR] = 'center';
  return cells;
}

function inGrid(gridR: number, gx: number, gy: number): boolean {
  const d = gridR * 2 + 1;
  return gx >= 0 && gy >= 0 && gx < d && gy < d;
}

function set(cells: RangePreviewKind[][], gridR: number, dx: number, dy: number, kind: RangePreviewKind): void {
  const gx = gridR + dx;
  const gy = gridR + dy;
  if (inGrid(gridR, gx, gy)) cells[gy]![gx] = kind;
}

/**
 * `within` 是整片，`exact`（缺省）是环。友军点名和敌军点名同一把尺子，
 * 漏掉 ally 就会把圣疗的贴脸格画没。
 */
function pickIsSolid(shape: SkillShape): boolean {
  return (shape.type === 'neighborPickFoe' || shape.type === 'neighborPickAlly')
    && shape.reach === 'within';
}

export function buildSkillRangePreview(shape: SkillShape): SkillRangePreview {
  let gridR = 2;
  if (shape.type === 'neighborAoE') gridR = shape.manhattan + 1;
  else if (shape.type === 'discAoE' || shape.type === 'squareAoE') gridR = shape.radius + 1;
  else if (shape.type === 'neighborPickFoe' || shape.type === 'neighborPickAlly') {
    gridR = shape.manhattan + 1;
  } else if (shape.type === 'selfCast') gridR = 1;
  else if (shape.type === 'lineBestRayAllFoes') gridR = shape.range ?? 3;
  else if (shape.type === 'groundPickAoE') {
    const sampleReach = Math.min(2, shape.castRange);
    gridR = Math.max(shape.castRange, sampleReach + shape.blastRadius);
  }

  const cells = emptyGrid(gridR);

  if (shape.type === 'squareAoE') {
    for (let dy = -shape.radius; dy <= shape.radius; dy++) {
      for (let dx = -shape.radius; dx <= shape.radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        set(cells, gridR, dx, dy, 'hit');
      }
    }
  } else if (
    shape.type === 'neighborAoE'
    || shape.type === 'neighborPickFoe'
    || shape.type === 'neighborPickAlly'
    || shape.type === 'discAoE'
  ) {
    const md = shape.type === 'discAoE' ? shape.radius : shape.manhattan;
    const solid = shape.type === 'discAoE' || pickIsSolid(shape);
    const axisOnly = shape.type === 'neighborPickFoe' && shape.axisOnly === true;
    for (let dy = -md; dy <= md; dy++) {
      for (let dx = -md; dx <= md; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (axisOnly && dx !== 0 && dy !== 0) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (solid ? d <= md : d === md) set(cells, gridR, dx, dy, 'hit');
      }
    }
  } else if (shape.type === 'lineBestRayAllFoes') {
    for (const [ddx, ddy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      for (let s = 1; s <= gridR; s++) set(cells, gridR, ddx * s, ddy * s, 'ray');
    }
  } else if (shape.type === 'groundPickAoE') {
    const sampleDy = -Math.min(2, shape.castRange);
    for (let dy = -shape.castRange; dy <= shape.castRange; dy++) {
      for (let dx = -shape.castRange; dx <= shape.castRange; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) > shape.castRange) continue;
        set(cells, gridR, dx, dy, 'pick');
      }
    }
    for (let dy = -shape.blastRadius; dy <= shape.blastRadius; dy++) {
      for (let dx = -shape.blastRadius; dx <= shape.blastRadius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > shape.blastRadius) continue;
        set(cells, gridR, dx, sampleDy + dy, 'hit');
      }
    }
    cells[gridR]![gridR] = 'center';
    set(cells, gridR, 0, sampleDy, 'focus');
  }

  return { gridR, cells };
}

export function previewKindAt(
  preview: SkillRangePreview,
  dx: number,
  dy: number,
): RangePreviewKind {
  return preview.cells[preview.gridR + dy]![preview.gridR + dx]!;
}

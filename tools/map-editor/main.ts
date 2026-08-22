/**
 * 关卡地图 GM 编辑器（浏览器端）。
 *
 * 定位：**和策划对齐地图设计的工作台**，不是给玩家的功能，所以只在 `vite` dev server
 * 下存在（见 `server/plugin.ts` 的 `apply: 'serve'`），一行代码都不会进小游戏包体。
 *
 * 为什么值得单独做一个页面，而不是在游戏里加 GM 面板：改地图这件事的瓶颈不是"看效果"，
 * 是**改完要立刻知道难度变没变**。所以这个页面把三件事摆在同一屏上——布局、
 * 完整性校验、胜率模拟——而这三件里有两件在真机上根本跑不动（几百局模拟会卡死渲染线程）。
 *
 * 另外它顺手回答了这一轮真正的设计问题：**每章的节奏**。左上角那张表列出每章的节点数、
 * 本章首次出现的地形、商店卖几个临时技能——"循序渐进"这件事只有量化了才能讨论。
 */

// ─────────────────────────── 与 server/plugin.ts 对齐的数据形状 ───────────────────────────

interface TerrainInfo {
  id: string;
  name: string;
  color: string;
  moveCost: number | null;
  atkMul: number;
  defMul: number;
  dotPerRound: number;
  passable: boolean;
  blocksSight: boolean;
  opensGates: boolean;
  opensTo: string | null;
  ignitesTo: string | null;
}

interface EnemyInfo {
  origIndex: number | null;
  defId: string;
  x: number;
  y: number;
  template: string | null;
  srcText?: string;
  hasComment?: boolean;
  name: string | null;
  boss: boolean;
  animSet: string | null;
  skillSkin: string | null;
  stats: Record<string, number> | null;
}

interface StageInfo {
  key: string;
  chapter: number;
  indexInChapter: number;
  globalIndex: number;
  displayName: string;
  title: string;
  goldReward: number;
  aiDifficulty: string | null;
  maxDeploy: number | null;
  isBoss: boolean;
  width: number;
  height: number;
  grid: string[][];
  enemyScale: number;
  enemies: EnemyInfo[];
}

interface DungeonInfo {
  id: string;
  name: string;
  desc: string;
  enemyScaleBase: number;
  maxParty: number;
  pool: { category: string; id: string }[];
  nodes: { kind: string; name: string; stageIndex: number | null; enemyScale: number }[];
}

interface ApiData {
  chapters: { index: number; dungeon: DungeonInfo | null; stageKeys: string[] }[];
  stages: Record<string, StageInfo>;
  terrains: TerrainInfo[];
  characters: { id: string; name: string; profession: string }[];
  troopKinds: string[];
  templates: string[];
}

// ─────────────────────────── 状态 ───────────────────────────

const API = '/api/map-editor';

let data: ApiData | null = null;
/** 当前编辑的关卡（深拷贝，改它不影响 data） */
let model: StageInfo | null = null;
/** 打开时的原始快照，用来判断有没有改动 */
let pristine = '';
const undoStack: string[] = [];

let tool: 'terrain' | 'enemy' = 'terrain';
let brush = 'high';
let template: string | null = 'rookie';
let troop = 'sword';
let selected: number | null = null;
let dragging = false;

/** 地形 / 单位贴图缓存。取不到就退回纯色，和游戏里 CDN 抖动时的兜底一致 */
const images = new Map<string, HTMLImageElement | null>();

// ─────────────────────────── DOM ───────────────────────────

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;

function setStatus(msg: string, tone: 'info' | 'bad' | 'ok' = 'info'): void {
  const el = $('status');
  el.textContent = msg;
  el.style.color = tone === 'bad' ? 'var(--bad)' : tone === 'ok' ? 'var(--ok)' : 'var(--warn)';
}

function terrainInfo(id: string): TerrainInfo | undefined {
  return data?.terrains.find((t) => t.id === id);
}

/** 玩家部署行：与 `battle/constants.playerDeployRowRange` 同口径 */
function deployRows(height: number): [number, number] {
  const h = Math.max(2, height);
  return [h - 2, h - 1];
}

function loadImage(src: string): HTMLImageElement | null {
  const hit = images.get(src);
  if (hit !== undefined) return hit;
  const img = new Image();
  images.set(src, img);
  img.onload = () => draw();
  img.onerror = () => {
    images.set(src, null);
    draw();
  };
  img.src = src;
  return img;
}

// ─────────────────────────── 绘制 ───────────────────────────

interface Layout {
  cell: number;
  ox: number;
  oy: number;
}

function layout(): Layout {
  const m = model!;
  const pad = 8;
  const cell = Math.floor(
    Math.min((canvas.width - pad * 2) / m.width, (canvas.height - pad * 2) / m.height),
  );
  return {
    cell,
    ox: Math.floor((canvas.width - cell * m.width) / 2),
    oy: Math.floor((canvas.height - cell * m.height) / 2),
  };
}

function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!model) return;
  const m = model;
  const { cell, ox, oy } = layout();
  const [top, bottom] = deployRows(m.height);

  for (let y = 0; y < m.height; y += 1) {
    for (let x = 0; x < m.width; x += 1) {
      const id = m.grid[y]?.[x] ?? 'plain';
      const info = terrainInfo(id);
      const px = ox + x * cell;
      const py = oy + y * cell;

      ctx.fillStyle = info?.color ?? '#333';
      ctx.fillRect(px, py, cell, cell);

      const img = id === 'plain' ? null : loadImage(`/images/terrain/${id}.png`);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, px, py, cell, cell);
      } else if (id !== 'plain') {
        // 贴图还在飞（或 CDN 没跟上）时用纯色 + 名字，别画成看不出区别的空格。
        // 机关 / 闸门两态 / 燃烧 / 焦土现在都有正式贴图，这条只是加载失败的兜底。
        ctx.fillStyle = '#000a';
        ctx.font = `${Math.floor(cell * 0.36)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(info?.name.slice(0, 2) ?? id.slice(0, 2), px + cell / 2, py + cell / 2);
      }

      if (y >= top && y <= bottom) {
        ctx.fillStyle = 'rgba(90,143,208,0.22)';
        ctx.fillRect(px, py, cell, cell);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);

      // 坐标印在格角：改完要能和 stagesMvp.ts 里的 { x, y } 对上，否则没法和我核对
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.font = `${Math.max(8, Math.floor(cell * 0.2))}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${x},${y}`, px + 2, py + 2);
    }
  }

  m.enemies.forEach((e, i) => {
    const px = ox + e.x * cell;
    const py = oy + e.y * cell;
    const key = e.animSet ?? e.defId;
    const img = loadImage(`/images/units/${key}.png`);
    const size = cell * (e.boss ? 0.98 : 0.82);
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, px + (cell - w) / 2, py + (cell - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(px + cell / 2, py + cell / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (e.boss) {
      ctx.strokeStyle = '#ffcc66';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
    }
    if (i === selected) {
      ctx.strokeStyle = '#7ee2a8';
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
    }

    const label = e.name ?? e.defId;
    ctx.font = `${Math.max(9, Math.floor(cell * 0.22))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px + cell / 2 - tw / 2 - 3, py + cell - 14, tw + 6, 13);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, px + cell / 2, py + cell - 2);
  });
}

// ─────────────────────────── 校验（复刻 stageIntegrity） ───────────────────────────

interface Issue {
  bad: boolean;
  text: string;
}

function validate(m: StageInfo): Issue[] {
  const out: Issue[] = [];
  const push = (bad: boolean, text: string) => out.push({ bad, text });
  const [top, bottom] = deployRows(m.height);
  const passable = (x: number, y: number): boolean => {
    const t = m.grid[y]?.[x];
    return !!t && !!terrainInfo(t)?.passable;
  };

  if (m.width < 5) push(true, `宽度 ${m.width} < 5`);
  if (m.height < 6) push(true, `高度 ${m.height} < 6`);
  if (m.enemies.length === 0) push(true, '没有敌人，开局即胜');

  const cells = new Set<string>();
  for (const e of m.enemies) {
    const who = `${e.name ?? e.defId}(${e.x},${e.y})`;
    if (e.x < 0 || e.x >= m.width || e.y < 0 || e.y >= m.height) push(true, `${who} 越界`);
    else if (!passable(e.x, e.y)) push(true, `${who} 站在不可通行的 ${m.grid[e.y]![e.x]}`);
    if (e.y >= top && e.y <= bottom) push(true, `${who} 占用玩家部署行 y=${e.y}`);
    const k = `${e.x},${e.y}`;
    if (cells.has(k)) push(true, `两个敌人叠在 (${k})`);
    cells.add(k);
  }

  let room = 0;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < m.width; x += 1) if (passable(x, y)) room += 1;
  }
  if (m.maxDeploy !== null) {
    if (m.maxDeploy <= 0) push(true, 'maxDeploy 必须为正');
    if (m.maxDeploy > room) push(true, `maxDeploy ${m.maxDeploy} 超过部署区 ${room} 格`);
  }

  const flat = m.grid.flat();
  const hasGate = flat.includes('gate_closed');
  const hasLever = flat.includes('lever');
  if (hasGate !== hasLever) {
    push(true, hasGate ? '有闸门但没有机关，门永远打不开' : '有机关但没有闸门，按了没反应');
  }

  // 不开闸门也要能走到每个敌人，否则托管 / 扫荡 / 胜率模拟都会磨到回合上限
  const seen = new Set<string>();
  const queue: [number, number][] = [];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < m.width; x += 1) {
      if (!passable(x, y)) continue;
      seen.add(`${x},${y}`);
      queue.push([x, y]);
    }
  }
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !passable(nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  for (const e of m.enemies) {
    if (!seen.has(`${e.x},${e.y}`)) {
      push(true, `${e.name ?? e.defId}(${e.x},${e.y}) 不开闸门走不到，自动模式会死锁`);
    }
  }

  if (out.length === 0) push(false, '全部通过');
  return out;
}

// ─────────────────────────── 章节节奏面板 ───────────────────────────

function renderPacing(): void {
  if (!data) return;
  const seenTerrain = new Set<string>();
  const rows: string[] = [];

  for (const ch of data.chapters) {
    const d = ch.dungeon;
    const nodes = d?.nodes ?? [];
    const battles = nodes.filter((n) => n.kind === 'battle').length;
    const shops = nodes.filter((n) => n.kind === 'shop').length;
    const bosses = nodes.filter((n) => n.kind === 'boss').length;
    const total = nodes.length;

    // 本章首次出现的地形——「每章新增 1~2 种」这条节奏只有这样才看得见
    const fresh: string[] = [];
    for (const key of ch.stageKeys) {
      const s = data.stages[key];
      if (!s) continue;
      for (const t of new Set(s.grid.flat())) {
        if (t === 'plain' || seenTerrain.has(t)) continue;
        seenTerrain.add(t);
        fresh.push(terrainInfo(t)?.name ?? t);
      }
    }

    const temps = (d?.pool ?? []).filter((p) => p.category === 'tempSkill').length;
    const over = total > 10;
    rows.push(
      `<tr>
        <td>${ch.index} ${d?.name ?? ''}</td>
        <td class="num ${over ? 'over' : ''}">${total}</td>
        <td class="num">${battles}+${bosses}/${shops}</td>
        <td class="newTerrain">${fresh.join('、') || '—'}</td>
        <td class="num">${temps}</td>
      </tr>`,
    );
  }

  $('pacing').innerHTML = `<table>
    <tr><th>章</th><th>节点</th><th>战/店</th><th>新地形</th><th>临时技</th></tr>
    ${rows.join('')}
  </table>
  <div class="muted" style="margin-top:6px;font-size:11px">
    节点 &gt; 10 标红。「战/店」= 普通战+Boss / 商店。
  </div>`;
}

// ─────────────────────────── 关卡列表 ───────────────────────────

function renderStageList(): void {
  if (!data) return;
  const box = $('stageList');
  box.innerHTML = '';
  for (const ch of data.chapters) {
    const head = document.createElement('div');
    head.className = 'ch';
    head.textContent = `第 ${ch.index} 章 · ${ch.dungeon?.name ?? ''}（${ch.stageKeys.length} 关）`;
    box.appendChild(head);
    for (const key of ch.stageKeys) {
      const s = data.stages[key];
      if (!s) continue;
      const el = document.createElement('div');
      el.className = `item${key === model?.key ? ' active' : ''}`;
      el.innerHTML = `<span>${s.indexInChapter}. ${s.title}</span>`
        + `<span class="badge">${s.isBoss ? 'BOSS' : ''} ${s.width}×${s.height}</span>`;
      el.onclick = () => selectStage(key);
      box.appendChild(el);
    }
  }
}

// ─────────────────────────── 右栏面板 ───────────────────────────

function renderTerrainPalette(): void {
  if (!data) return;
  const box = $('terrainPalette');
  box.innerHTML = '';
  for (const t of data.terrains) {
    const fx: string[] = [];
    if (!t.passable) fx.push('不可通行');
    if (t.moveCost !== null && t.moveCost > 1) fx.push(`移动${t.moveCost}`);
    if (t.atkMul !== 1) fx.push(`攻${Math.round((t.atkMul - 1) * 100)}%`);
    if (t.defMul !== 1) fx.push(`承伤${Math.round((t.defMul - 1) * 100)}%`);
    if (t.dotPerRound > 0) fx.push(`每回合-${t.dotPerRound}`);
    if (t.blocksSight) fx.push('挡视线');
    if (t.opensGates) fx.push('开闸');
    if (t.opensTo) fx.push('可开启');
    if (t.ignitesTo) fx.push('可燃');

    const el = document.createElement('div');
    el.className = `sw${t.id === brush ? ' active' : ''}`;
    el.innerHTML = `<span class="chip" style="background:${t.color}"></span>`
      + `<span class="nm">${t.name}</span><span class="fx">${fx.join('·') || '基准'}</span>`;
    el.onclick = () => {
      brush = t.id;
      tool = 'terrain';
      renderTools();
      renderTerrainPalette();
    };
    box.appendChild(el);
  }
}

function renderEnemyPalette(): void {
  if (!data) return;
  const tp = $('templatePalette');
  tp.innerHTML = '';
  for (const t of [...data.templates, '(裸字面量)']) {
    const val = t === '(裸字面量)' ? null : t;
    const b = document.createElement('button');
    b.textContent = t;
    if (val === template) b.className = 'active';
    b.onclick = () => {
      template = val;
      renderEnemyPalette();
    };
    tp.appendChild(b);
  }
  const kp = $('troopPalette');
  kp.innerHTML = '';
  for (const k of data.troopKinds) {
    const b = document.createElement('button');
    b.textContent = k;
    if (k === troop) b.className = 'active';
    b.onclick = () => {
      troop = k;
      renderEnemyPalette();
    };
    kp.appendChild(b);
  }
}

function renderTools(): void {
  for (const b of Array.from($('tools').querySelectorAll('button'))) {
    b.className = b.dataset.tool === tool ? 'active' : '';
  }
  $('terrainPanel').classList.toggle('hidden', tool !== 'terrain');
  $('enemyPanel').classList.toggle('hidden', tool !== 'enemy');
}

function renderInspector(): void {
  const box = $('enemyInspector');
  if (!model || selected === null || !model.enemies[selected]) {
    box.className = 'muted';
    box.textContent = tool === 'enemy' ? '点棋盘上的敌人以选中' : '未选中';
    return;
  }
  const e = model.enemies[selected]!;
  const stats = e.stats
    ? Object.entries(e.stats).map(([k, v]) => `${k} ${v}`).join(' / ')
    : '按兵种基准';
  box.className = '';
  box.innerHTML = `
    <div><strong>${e.name ?? e.defId}</strong>${e.boss ? ' <span class="tag">BOSS</span>' : ''}</div>
    <div class="muted">兵种 ${e.defId} · 坐标 (${e.x},${e.y})</div>
    <div class="muted">模板 ${e.template ?? '裸字面量'}${e.origIndex === null ? '（新增）' : ''}</div>
    <div class="muted">面板 ${stats}</div>
    ${e.skillSkin ? `<div class="muted">技能皮肤 ${e.skillSkin}</div>` : ''}
    ${e.hasComment ? '<div class="muted">源码里有前导注释，会跟着一起保留</div>' : ''}
    <div class="row" style="margin-top:6px">
      <button id="btnDelEnemy">删除这个敌人</button>
    </div>`;
  $('btnDelEnemy').onclick = () => {
    snapshot();
    model!.enemies.splice(selected!, 1);
    selected = null;
    afterChange();
  };
}

function renderStageForm(): void {
  if (!model) return;
  const m = model;
  const box = $('stageForm');
  box.innerHTML = `
    <label>标题</label><input id="fTitle" value="${m.title}" />
    <label>金币</label><input id="fGold" type="number" value="${m.goldReward}" />
    <label>宽</label><input id="fW" type="number" min="5" value="${m.width}" />
    <label>高</label><input id="fH" type="number" min="6" value="${m.height}" />
    <label>AI</label>
    <select id="fAi">
      ${['', 'easy', 'normal', 'hard']
        .map((v) => `<option value="${v}"${(m.aiDifficulty ?? '') === v ? ' selected' : ''}>${v || '（缺省 normal）'}</option>`)
        .join('')}
    </select>
    <label>上阵上限</label><input id="fDeploy" type="number" min="1" value="${m.maxDeploy ?? ''}" placeholder="缺省 3" />
    <label>Boss 关</label><input id="fBoss" type="checkbox" ${m.isBoss ? 'checked' : ''} />
  `;

  $<HTMLInputElement>('fTitle').onchange = (ev) => {
    snapshot();
    m.title = (ev.target as HTMLInputElement).value;
    afterChange();
  };
  $<HTMLInputElement>('fGold').onchange = (ev) => {
    snapshot();
    m.goldReward = Number((ev.target as HTMLInputElement).value);
    afterChange();
  };
  $<HTMLInputElement>('fW').onchange = (ev) => resize(Number((ev.target as HTMLInputElement).value), m.height);
  $<HTMLInputElement>('fH').onchange = (ev) => resize(m.width, Number((ev.target as HTMLInputElement).value));
  $<HTMLSelectElement>('fAi').onchange = (ev) => {
    snapshot();
    const v = (ev.target as HTMLSelectElement).value;
    m.aiDifficulty = v === '' ? null : v;
    afterChange();
  };
  $<HTMLInputElement>('fDeploy').onchange = (ev) => {
    snapshot();
    const v = (ev.target as HTMLInputElement).value;
    m.maxDeploy = v === '' ? null : Number(v);
    afterChange();
  };
  $<HTMLInputElement>('fBoss').onchange = (ev) => {
    snapshot();
    m.isBoss = (ev.target as HTMLInputElement).checked;
    afterChange();
  };
}

/**
 * 改尺寸。保留左上角对齐的重叠区域，新出来的格子填平原。
 *
 * 不做「按比例缩放地形」：地图是手摆的隘口和高地，等比拉伸只会把两格宽的浅滩
 * 变成三格半，那不是任何人想要的结果。
 */
function resize(w: number, h: number): void {
  if (!model) return;
  const nw = Math.max(5, Math.min(20, Math.floor(w) || model.width));
  const nh = Math.max(6, Math.min(20, Math.floor(h) || model.height));
  if (nw === model.width && nh === model.height) return;
  snapshot();
  const next = Array.from({ length: nh }, (_, y) =>
    Array.from({ length: nw }, (_, x) => model!.grid[y]?.[x] ?? 'plain'),
  );
  model.grid = next;
  model.width = nw;
  model.height = nh;
  model.enemies = model.enemies.filter((e) => e.x < nw && e.y < nh);
  selected = null;
  afterChange();
}

/**
 * `chapter*Sim.test.ts` 里那套「首通玩家」假设：1 级三初始角色，精华随推进累积。
 *
 * 这个默认值必须和回归测试一致，否则工具给出的胜率和 CI 里的胜率是两把尺子——
 * 那比没有数字更糟，因为它看起来像结论。实测口径见 `chapter1Sim`：
 * 关 1–2 精华 0、关 3–4 精华 1、关 5–6 精华 2、关 7（Boss）精华 3，
 * 也就是每推进两关多一点，所以这里按章内序号推。
 */
function defaultBonusAtk(indexInChapter: number): number {
  return Math.floor((Math.max(1, indexInChapter) - 1) / 2);
}

/** 首通阵容：剑弓盾三人组（`stageSim` 的 TRIO），关卡只让上两个时砍成剑弓 */
const TRIO = ['hero_sword_ray', 'hero_bow_hill', 'hero_shield_gron'];

function renderSimForm(): void {
  if (!data || !model) return;
  const box = $('simForm');
  const bonus = defaultBonusAtk(model.indexInChapter);
  const slots = model.maxDeploy ?? 3;
  box.innerHTML = `
    <div class="full muted" style="font-size:11px">
      默认按 chapter*Sim 的首通假设：1 级、精华攻 ${bonus}/人、上阵 ${slots} 人。
      这样跑出来的数字可以直接和回归测试对照。
    </div>
    <label class="full">上阵角色（按住 Ctrl 多选）</label>
    <select id="sParty" multiple size="6" class="full">
      ${data.characters
        .map((c) => `<option value="${c.id}">${c.name}（${c.profession}）</option>`)
        .join('')}
    </select>
    <label>等级</label><input id="sLevel" type="number" min="1" value="1" />
    <label>精华攻/人</label><input id="sBonus" type="number" min="0" value="${bonus}" />
    <label>敌人缩放</label><input id="sScale" type="number" step="0.01" value="${model.enemyScale.toFixed(3)}" />
    <label>治疗药剂</label><input id="sPotion" type="number" min="0" value="${model.isBoss ? 2 : 0}" />
    <label>局数</label><input id="sN" type="number" min="20" step="20" value="200" />
  `;
  const party = $<HTMLSelectElement>('sParty');
  const want = TRIO.slice(0, Math.max(1, Math.min(TRIO.length, slots)));
  for (const opt of Array.from(party.options)) opt.selected = want.includes(opt.value);
}

// ─────────────────────────── 改动 / 撤销 ───────────────────────────

function snapshot(): void {
  if (!model) return;
  undoStack.push(JSON.stringify(model));
  if (undoStack.length > 60) undoStack.shift();
}

function isDirty(): boolean {
  return !!model && JSON.stringify(model) !== pristine;
}

function afterChange(): void {
  draw();
  renderInspector();
  renderStageForm();
  $('dirty').classList.toggle('hidden', !isDirty());
  const issues = model ? validate(model) : [];
  $('issues').innerHTML = issues
    .map((i) => `<div class="${i.bad ? 'bad' : 'ok'}">${i.bad ? '✕' : '✓'} ${i.text}</div>`)
    .join('');
  $<HTMLButtonElement>('btnUndo').disabled = undoStack.length === 0;
}

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  model = JSON.parse(prev) as StageInfo;
  selected = null;
  afterChange();
}

// ─────────────────────────── 棋盘交互 ───────────────────────────

function cellAt(ev: MouseEvent): { x: number; y: number } | null {
  if (!model) return null;
  const rect = canvas.getBoundingClientRect();
  const { cell, ox, oy } = layout();
  const x = Math.floor((((ev.clientX - rect.left) * canvas.width) / rect.width - ox) / cell);
  const y = Math.floor((((ev.clientY - rect.top) * canvas.height) / rect.height - oy) / cell);
  if (x < 0 || y < 0 || x >= model.width || y >= model.height) return null;
  return { x, y };
}

function enemyAt(x: number, y: number): number | null {
  const i = model?.enemies.findIndex((e) => e.x === x && e.y === y) ?? -1;
  return i < 0 ? null : i;
}

canvas.addEventListener('mousedown', (ev) => {
  const c = cellAt(ev);
  if (!c || !model) return;

  if (tool === 'terrain') {
    snapshot();
    dragging = true;
    paint(c.x, c.y);
    return;
  }

  const hit = enemyAt(c.x, c.y);
  if (hit !== null) {
    if (ev.shiftKey) {
      snapshot();
      model.enemies.splice(hit, 1);
      selected = null;
      afterChange();
      return;
    }
    selected = hit;
    dragging = true;
    afterChange();
    return;
  }

  // 空格子：放一个新敌人。落在部署行或不可通行格上会被校验面板立刻标红，
  // 但仍然允许放下——编辑中途出现不合法状态是正常的，拦下来只会打断手感
  snapshot();
  model.enemies.push({
    origIndex: null,
    defId: troop,
    x: c.x,
    y: c.y,
    template: template,
    name: null,
    boss: false,
    animSet: null,
    skillSkin: null,
    stats: null,
  });
  selected = model.enemies.length - 1;
  afterChange();
});

canvas.addEventListener('mousemove', (ev) => {
  const c = cellAt(ev);
  if (!c || !model) return;
  const t = model.grid[c.y]?.[c.x] ?? 'plain';
  setStatus(`(${c.x},${c.y}) ${terrainInfo(t)?.name ?? t}`);
  if (!dragging) return;
  if (tool === 'terrain') {
    paint(c.x, c.y);
  } else if (selected !== null && model.enemies[selected]) {
    const e = model.enemies[selected]!;
    if (e.x !== c.x || e.y !== c.y) {
      e.x = c.x;
      e.y = c.y;
      afterChange();
    }
  }
});

for (const evt of ['mouseup', 'mouseleave'] as const) {
  canvas.addEventListener(evt, () => {
    dragging = false;
  });
}

function paint(x: number, y: number): void {
  if (!model) return;
  if (model.grid[y]![x] === brush) return;
  model.grid[y]![x] = brush;
  afterChange();
}

window.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    ev.preventDefault();
    undo();
  }
});

// ─────────────────────────── 保存 / 预览 / 模拟 ───────────────────────────

function editPayload(): unknown {
  const m = model!;
  return {
    key: m.key,
    title: m.title,
    goldReward: m.goldReward,
    aiDifficulty: m.aiDifficulty,
    maxDeploy: m.maxDeploy,
    isBoss: m.isBoss ? true : null,
    width: m.width,
    height: m.height,
    grid: m.grid,
    enemies: m.enemies.map((e) => ({
      origIndex: e.origIndex,
      defId: e.defId,
      x: e.x,
      y: e.y,
      template: e.template,
    })),
  };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function showModal(title: string, body: string, html = false): void {
  $('modalTitle').textContent = title;
  if (html) $('modalBody').innerHTML = body;
  else $('modalBody').textContent = body;
  $('modal').classList.remove('hidden');
}

$('modalClose').onclick = () => $('modal').classList.add('hidden');

$('btnPreview').onclick = () => {
  if (!model) return;
  void post<{ diff: string[]; changedFields: string[]; droppedComments: string[] }>(
    `${API}/preview`,
    editPayload(),
  ).then(
    (r) => {
      const lines = r.diff.length === 0
        ? ['（没有改动）']
        : r.diff.map((l) =>
            l.startsWith('+')
              ? `<span class="add">${escapeHtml(l)}</span>`
              : `<span class="del">${escapeHtml(l)}</span>`,
          );
      const warn = r.droppedComments.length
        ? `<span class="del">⚠ 以下注释的锚点已被删掉，保存后会丢失：\n`
          + `${escapeHtml(r.droppedComments.join('\n'))}</span>\n\n`
        : '';
      showModal(`预览 · 改动字段：${r.changedFields.join('、') || '无'}`, warn + lines.join('\n'), true);
    },
    (e: Error) => setStatus(`预览失败：${e.message}`, 'bad'),
  );
};

$('btnSave').onclick = () => {
  if (!model) return;
  const issues = validate(model).filter((i) => i.bad);
  if (issues.length > 0 && !confirm(`还有 ${issues.length} 条校验没过，仍然保存？`)) return;
  void post<{ saved: boolean; message?: string; changedFields: string[]; droppedComments: string[] }>(
    `${API}/save`,
    editPayload(),
  ).then(
    (r) => {
      if (!r.saved) {
        setStatus(r.message ?? '没有改动', 'info');
        return;
      }
      pristine = JSON.stringify(model);
      undoStack.length = 0;
      const dropped = r.droppedComments.length
        ? `；丢失注释 ${r.droppedComments.length} 条（见控制台）`
        : '';
      if (r.droppedComments.length) console.warn('丢失的注释：', r.droppedComments);
      setStatus(`已保存：${r.changedFields.join('、')}${dropped}`, 'ok');
      afterChange();
      void reload(model!.key);
    },
    (e: Error) => setStatus(`保存失败（未写盘）：${e.message}`, 'bad'),
  );
};

$('btnSim').onclick = () => {
  if (!model) return;
  const party = Array.from($<HTMLSelectElement>('sParty').selectedOptions).map((o) => o.value);
  if (party.length === 0) {
    setStatus('先选至少一个上阵角色', 'bad');
    return;
  }
  const btn = $<HTMLButtonElement>('btnSim');
  btn.disabled = true;
  $('simOut').textContent = '跑着…';
  void post<{ winRate: number; avgRounds: number; skillCasts: Record<string, number> }>(
    `${API}/sim`,
    {
      stageKey: model.key,
      deployIds: party,
      level: Number($<HTMLInputElement>('sLevel').value),
      bonusAtkEach: Number($<HTMLInputElement>('sBonus').value),
      enemyScale: Number($<HTMLInputElement>('sScale').value),
      healPotions: Number($<HTMLInputElement>('sPotion').value),
      n: Number($<HTMLInputElement>('sN').value),
      stage: {
        terrain: model.grid,
        aiDifficulty: model.aiDifficulty ?? undefined,
        // 敌人要带上真实面板：模拟器读 stats 覆盖，丢了它精英就退回兵种基准
        enemies: model.enemies.map((e, i) => ({
          defId: e.defId,
          x: e.x,
          y: e.y,
          uid: `e_${i + 1}`,
          name: e.name ?? undefined,
          boss: e.boss || undefined,
          skillSkin: e.skillSkin ?? undefined,
          stats: e.stats ?? undefined,
        })),
      },
    },
  ).then(
    (r) => {
      const casts = Object.entries(r.skillCasts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${k} ${v}`)
        .join(' / ');
      $('simOut').className = 'sim-out';
      $('simOut').textContent =
        `胜率 ${(r.winRate * 100).toFixed(1)}%\n平均 ${r.avgRounds.toFixed(1)} 回合\n技能 ${casts || '—'}`;
    },
    (e: Error) => {
      $('simOut').className = 'sim-out';
      $('simOut').textContent = `失败：${e.message}`;
    },
  ).finally(() => {
    btn.disabled = false;
  });
};

$('btnUndo').onclick = () => undo();
$('btnReload').onclick = () => {
  if (isDirty() && !confirm('当前改动会丢失，继续？')) return;
  void reload(model?.key);
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}

// ─────────────────────────── 启动 ───────────────────────────

function selectStage(key: string): void {
  if (isDirty() && key !== model?.key && !confirm('当前关卡有未保存改动，切走会丢失，继续？')) return;
  const s = data?.stages[key];
  if (!s) return;
  model = JSON.parse(JSON.stringify(s)) as StageInfo;
  pristine = JSON.stringify(model);
  undoStack.length = 0;
  selected = null;
  $('boardTitle').textContent = s.displayName;
  $('boardMeta').textContent =
    `${s.key} · 第 ${s.chapter} 章第 ${s.indexInChapter} 关 · ${s.width}×${s.height}`
    + ` · 敌人缩放 ${s.enemyScale.toFixed(2)}`;
  renderStageList();
  renderSimForm();
  afterChange();
}

async function reload(keepKey?: string): Promise<void> {
  setStatus('加载中…');
  const res = await fetch(`${API}/stages`);
  const json = (await res.json()) as ApiData & { error?: string };
  if (json.error) {
    setStatus(`加载失败：${json.error}`, 'bad');
    return;
  }
  data = json;
  renderPacing();
  renderTerrainPalette();
  renderEnemyPalette();
  renderTools();
  renderStageList();
  const key = keepKey && data.stages[keepKey] ? keepKey : data.chapters[0]?.stageKeys[0];
  if (key) selectStage(key);
  setStatus(`已加载 ${Object.keys(data.stages).length} 关`, 'ok');
}

for (const b of Array.from($('tools').querySelectorAll('button'))) {
  b.onclick = () => {
    tool = (b.dataset.tool as 'terrain' | 'enemy') ?? 'terrain';
    renderTools();
    renderInspector();
  };
}

void reload();

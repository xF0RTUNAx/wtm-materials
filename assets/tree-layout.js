// Vertical research tree layout. Shared by the generator (first render) and the browser
// (fit mode and resizes), so both always produce the same picture.
//
// The game grid is transposed: game col -> step from top to bottom, game row -> line (column).
// Each step belongs to one rank; a rank can hold several steps. Like War Thunder Wiki, every rank
// row has two parts: the research lines on the left, then a vertical divider, then a separate
// block with the vehicles outside the lines (premium, seasonal, blueprint, clan) in two columns.
// A rank is as tall as the taller part, so rank rows stay aligned across both parts.
//
// Links are drawn per net (a "bus" like in the game): every source drops down to one horizontal
// line just above the targets, and every target hangs from it. A link with via "v" joins two
// vehicles of the same game column and is drawn sideways. Links stay inside the research part.

const SIDE_ORDER = { premium: 0, event: 1, blueprint: 2, clan: 3 };

export function layoutTree(T, o) {
  const fit = !!o.fit;
  const avail = Math.max(o.avail || 340, 200);
  const tree = [], extra = [];
  for (const v of T.vehicles) (v.kind === 'tree' ? tree : extra).push(v);

  const lines = uniq(tree.map((v) => v.row));
  const lineIx = {}; lines.forEach((r, i) => { lineIx[r] = i; });
  const steps = uniq(tree.map((v) => v.col));
  const stepIx = {}; steps.forEach((s, i) => { stepIx[s] = i; });
  const stepRank = {};
  for (const v of tree) stepRank[v.col] = Math.min(stepRank[v.col] || 99, v.rank);
  const ranks = uniq(T.vehicles.map((v) => v.rank));
  const n = Math.max(lines.length, 1);
  const hasSide = extra.length > 0;
  const sideCols = 2;

  const S = fit
    ? { G: 4, P: 2, D: 10, VG: 18, HEAD: 22, DH: 22, AD: 12, RG: 4, RK: 10, bus: 5, lane: 3, minW: 24, maxW: 400 }
    : { G: 12, P: 6, D: 26, VG: 30, HEAD: 34, DH: 30, AD: 18, RG: 10, RK: 20, bus: 8, lane: 6, minW: 150, maxW: 210 };
  const G = S.G, P = S.P;
  const cols = n + (hasSide ? sideCols : 0);
  const fixed = 2 * P + (n - 1) * G + (hasSide ? S.D + 2 * P + (sideCols - 1) * G : 0);
  const Wfit = Math.floor((avail - fixed) / cols);
  const W = Math.max(S.minW, Math.min(Wfit, S.maxW));
  const H = Math.round(W * 134 / 344);
  const colX = (i) => P + i * (W + G);
  const researchW = 2 * P + n * W + (n - 1) * G;
  const sepX = researchW + S.D / 2;
  const sideX0 = researchW + S.D + P;
  const sideX = (j) => sideX0 + j * (W + G);
  const width = hasSide ? sideX0 + sideCols * W + (sideCols - 1) * G + P : researchW;

  const pos = {}, rankBoxes = [], stepTop = {};
  let y = S.HEAD;
  ranks.forEach((r, ri) => {
    const rs = steps.filter((s) => stepRank[s] === r);
    const ex = extra.filter((v) => v.rank === r)
      .sort((a, b) => (SIDE_ORDER[a.kind] ?? 9) - (SIDE_ORDER[b.kind] ?? 9) || a.col - b.col || a.row - b.row);
    const count = T.vehicles.filter((v) => v.rank === r).length;
    if (ri > 0) y += S.RK;
    rankBoxes.push({ rank: r, y, h: S.DH, count });
    y += S.DH + S.AD;
    const top = y;
    let ly = top;
    rs.forEach((s, si) => {
      stepTop[s] = ly;
      for (const v of tree) if (v.col === s) pos[v.id] = { x: colX(lineIx[v.row]), y: ly, step: s, line: lineIx[v.row], rank: r };
      ly += H + (si < rs.length - 1 ? S.VG : 0);
    });
    const rows = Math.ceil(ex.length / sideCols);
    ex.forEach((v, i) => {
      pos[v.id] = { x: sideX(i % sideCols), y: top + Math.floor(i / sideCols) * (H + S.RG), side: true, rank: r };
    });
    const sideH = rows ? rows * H + (rows - 1) * S.RG : 0;
    y = top + Math.max(ly - top, sideH);
  });
  const height = y + 6;

  // ---- links (research part only) ----
  const occupied = {};
  for (const v of tree) occupied[v.col + ':' + lineIx[v.row]] = true;
  const columnClear = (line, fromStep, toStep) => {
    for (const s of steps) if (s > fromStep && s < toStep && occupied[s + ':' + line]) return false;
    return true;
  };

  const groups = new Map();
  const sideways = [];
  for (const l of T.links || []) {
    const a = pos[l.from], b = pos[l.to];
    if (!a || !b || a.side || b.side) continue;
    if (l.via === 'v' || a.step === b.step) { sideways.push(l); continue; }
    if (stepIx[b.step] < stepIx[a.step]) continue; // backward link: not in the data
    const key = (l.net ?? (l.from + '>' + l.to)) + '@' + b.step;
    if (!groups.has(key)) groups.set(key, { step: b.step, sources: new Set(), targets: new Set() });
    const g = groups.get(key);
    g.sources.add(l.from); g.targets.add(l.to);
  }

  const plans = [];
  for (const g of groups.values()) {
    const tTop = stepTop[g.step];
    const tx = [...g.targets].map((id) => pos[id].x + W / 2);
    const srcs = [...g.sources].map((id) => {
      const a = pos[id];
      const xs = a.x + W / 2, yb = a.y + H;
      if (columnClear(a.line, a.step, g.step)) return { kind: 'straight', xs, yb, xa: xs };
      // blocked by a tile further down its own line: step aside under the source, then go down
      const tgt = [...g.targets].map((tid) => pos[tid]).sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
      if (columnClear(tgt.line, a.step, g.step)) return { kind: 'jog', xs, yb, xa: tgt.x + W / 2 };
      const gx = tgt.x > a.x ? a.x + W + G / 2 : a.x - G / 2; // the gap between lines is always free
      return { kind: 'jog', xs, yb, xa: gx };
    });
    const all = tx.concat(srcs.map((s) => s.xa));
    plans.push({ g, tTop, tx, srcs, lo: Math.min(...all), hi: Math.max(...all) });
  }
  const byStep = {};
  for (const p of plans) (byStep[p.g.step] = byStep[p.g.step] || []).push(p);
  for (const list of Object.values(byStep)) {
    list.sort((a, b) => a.lo - b.lo);
    const laneEnd = [];
    for (const p of list) {
      let k = 0;
      while (laneEnd[k] !== undefined && laneEnd[k] > p.lo - 3) k++;
      laneEnd[k] = p.hi; p.lane = k;
    }
  }

  const paths = [];
  for (const p of plans) {
    const busY = p.tTop - S.bus - p.lane * S.lane;
    const segs = [];
    if (p.hi > p.lo) segs.push(`M${r(p.lo)} ${r(busY)}H${r(p.hi)}`);
    for (const x of p.tx) segs.push(`M${r(x)} ${r(busY)}V${r(p.tTop)}`);
    for (const s of p.srcs) {
      if (s.kind === 'straight') { segs.push(`M${r(s.xs)} ${r(s.yb)}V${r(busY)}`); continue; }
      const yj = s.yb + Math.min(S.VG / 2, 9);
      segs.push(`M${r(s.xs)} ${r(s.yb)}V${r(yj)}H${r(s.xa)}V${r(busY)}`);
    }
    paths.push(segs.join(''));
  }
  for (const l of sideways) {
    const a = pos[l.from], b = pos[l.to];
    const ym = a.y + H / 2;
    paths.push(b.x > a.x ? `M${r(a.x + W)} ${r(ym)}H${r(b.x)}` : `M${r(a.x)} ${r(ym)}H${r(b.x + W)}`);
  }

  return {
    W, H, width, height, pos, ranks: rankBoxes, paths, fit, head: S.HEAD, P, G,
    researchW, side: hasSide ? { sep: sepX, x0: sideX0 } : null,
  };
}

function uniq(a) { return [...new Set(a)].sort((x, y) => x - y); }
function r(v) { return Math.round(v * 2) / 2; }

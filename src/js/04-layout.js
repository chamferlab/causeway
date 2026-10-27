// Automatic left-to-right layout of the cause-and-effect chart.
//
// Each node sits in the column of its longest path from the primary effect, so a shared cause
// lands to the right of every effect it supports. Every node has one layout parent, the
// effect in the column just left of it; along those links the chart is a tree, laid out with
// subtree contours so branches pack closely without overlapping. Links to further effects of a
// shared cause are routed separately, through gaps between the nodes of the columns they cross.
//
// A cause moved by hand (its offsetY) moves up or down from there, with its branch; its effect stays
// where it was. It moves up only into free space, and moving down it pushes the causes below it.

const measureContext = document.createElement('canvas').getContext('2d');
const textWidth = (text, size, weight = 400, font = CHART_FONT) => {
  measureContext.font = `${weight} ${size}px ${font}`;
  return measureContext.measureText(text).width;
};

// Splits text into lines no wider than `width`, breaking long words where they must.
function wrapText(text, width, size, weight) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (textWidth(word, size, weight) > width) {
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), size, weight) > width) cut--;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, cut)); word = word.slice(cut);
      }
      const next = line ? line + ' ' + word : word;
      if (line && textWidth(next, size, weight) > width) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

// The small line under a node's title: evidence codes, tags, and hidden causes.
function nodeFoot(n, hidden) {
  const codes = n.evidenceIds.map(evidenceById).filter(Boolean).map(e => e.code);
  return {codes, controllable: n.controllable, stop: !!n.stopPoint, hidden};
}
const hasFoot = f => f.codes.length || f.controllable || f.stop || f.hidden;

// In a cause tree a cause has no kind label: its status badge in the corner says it. The label line
// stays for its root cause type, when it has one.
const statusBadge = n => treeStyle() && isCause(n);
const kindLine = n => statusBadge(n) && !n.causeType ? 0 : KIND_LINE;

function nodeSize(n, hidden) {
  const lines = wrapText(n.title.trim() || 'Untitled', NODE_W - 2 * NODE_PAD_X - (statusBadge(n) ? BADGE_ROOM : 0), TITLE_SIZE, 600);
  const foot = nodeFoot(n, hidden);
  const h = NODE_PAD_Y * 2 + kindLine(n) + lines.length * TITLE_LINE + (hasFoot(foot) ? FOOT_LINE : 0);
  return {w: NODE_W, h, lines, foot};
}

function computeLayout() {
  const primaryId = state.problem.primaryEffectId;
  // Roots: the primary effect, then any node no effect links to (only in hand-edited files).
  const linked = new Set(state.links.map(l => l.causeId));
  const roots = [primaryId, ...state.nodes.filter(n => n.id !== primaryId && !linked.has(n.id)).map(n => n.id)].filter(byId);

  // Visible nodes: everything reached without passing through a collapsed node.
  const visible = new Set(), stack = [...roots];
  while (stack.length) {
    const id = stack.pop();
    if (visible.has(id)) continue;
    visible.add(id);
    if (!collapsed.has(id)) for (const l of causeLinks(id)) stack.push(l.causeId);
  }
  const links = state.links.filter(l => visible.has(l.effectId) && visible.has(l.causeId) && !collapsed.has(l.effectId));

  // Columns by longest path, visiting each node after all of its visible effects.
  const rank = new Map(), incoming = new Map();
  for (const l of links) incoming.set(l.causeId, (incoming.get(l.causeId) || 0) + 1);
  const queue = roots.filter(id => !incoming.get(id));
  for (const id of queue) rank.set(id, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const l of links) {
      if (l.effectId !== id) continue;
      rank.set(l.causeId, Math.max(rank.get(l.causeId) ?? 0, rank.get(id) + 1));
      incoming.set(l.causeId, incoming.get(l.causeId) - 1);
      if (!incoming.get(l.causeId)) queue.push(l.causeId);
    }
  }

  // Layout parent: the first-linked effect in the column just to the left.
  const parent = new Map(), children = new Map();
  for (const l of links) {
    if (parent.has(l.causeId) || rank.get(l.effectId) !== rank.get(l.causeId) - 1) continue;
    parent.set(l.causeId, l.effectId);
    if (!children.has(l.effectId)) children.set(l.effectId, []);
    children.get(l.effectId).push(byId(l.causeId));
  }
  // Within an effect, its actions come above its conditions, and causes without a type below them.
  // Alternatives (OR) stay together, where the first of their kinds would go. In a cause tree, causes
  // keep their order.
  const order = {action: 0, condition: 1, cause: 2, effect: 3};
  if (!treeStyle()) for (const [effectId, list] of children) {
    const unit = new Map(), place = new Map(), first = new Map();
    for (const l of links) if (l.effectId === effectId) unit.set(l.causeId, l.orGroup || l.causeId);
    list.forEach((k, i) => {
      const u = unit.get(k.id);
      place.set(u, Math.min(place.get(u) ?? Infinity, order[k.kind]));
      if (!first.has(u)) first.set(u, i);
    });
    list.sort((a, b) => place.get(unit.get(a.id)) - place.get(unit.get(b.id)) || first.get(unit.get(a.id)) - first.get(unit.get(b.id)));
  }

  // Summaries drawn as such: {id, members}, the causes it is the only cause of, neighbours under one
  // effect, in their order. The summary is taken out of its first member's causes, and is placed with them.
  const summaries = [];
  for (const n of state.nodes) {
    if (!n.summary || !visible.has(n.id) || !parent.has(n.id)) continue;
    const from = links.filter(l => l.causeId === n.id).map(l => l.effectId), effectId = parent.get(from[0]);
    if (from.length < 2 || from.some(id => parent.get(id) !== effectId || links.some(l => l.effectId === id && l.causeId !== n.id))) continue;
    const kids = children.get(effectId).map(k => k.id), at = from.map(id => kids.indexOf(id)).sort((a, b) => a - b);
    if (at.some((x, i) => x !== at[0] + i)) continue;
    summaries.push({id: n.id, members: kids.slice(at[0], at[0] + from.length)});
    const list = children.get(parent.get(n.id));
    list.splice(list.findIndex(k => k.id === n.id), 1);
  }
  const summaryAt = new Map(summaries.map(x => [x.members[0], x])), inSummary = new Set(summaries.flatMap(x => x.members));

  // Hidden causes under a collapsed node, for its "+N" tag.
  const hiddenCount = id => {
    if (!collapsed.has(id)) return 0;
    const seen = new Set(), todo = causeLinks(id).map(l => l.causeId);
    while (todo.length) {
      const c = todo.pop();
      if (seen.has(c) || visible.has(c)) continue;
      seen.add(c);
      for (const l of causeLinks(c)) todo.push(l.causeId);
    }
    return seen.size;
  };
  const sizes = new Map([...visible].map(id => [id, nodeSize(byId(id), hiddenCount(id))]));

  // Contour packing. A subtree is {contour: [[top, bottom] per column depth], members: [[id, top]],
  // centers: [first, last]} in coordinates relative to the subtree; centers are those of the boxes its
  // effect is centred between. With `hand`, causes are moved by hand; without, the
  // result places each effect, centred on its causes as they would be without hand moves.
  const plain = new Map();
  function subtree(id, hand) {
    if (!hand && plain.has(id)) return plain.get(id);
    const h = sizes.get(id).h, kids = children.get(id) || [];
    if (!kids.length) return {contour: [[0, h]], members: [[id, 0]], centers: [h / 2, h / 2]};
    // A summary's members go together, as one unit with the summary.
    const units = [];
    for (let i = 0; i < kids.length; i++) {
      const sum = summaryAt.get(kids[i].id);
      units.push(sum ? {sum} : {kid: kids[i]});
      if (sum) i += sum.members.length - 1;
    }
    const acc = [], members = [], offsets = [];
    let firstCenter = null, lastCenter = null;
    for (const [i, {kid, sum}] of units.entries()) {
      const t = sum ? summaryTree(sum, hand) : subtree(kid.id, hand);
      // Packed below the causes before it; the first has nothing above it, except by hand.
      let offset = hand ? -Infinity : 0;
      if (members.length) {
        offset = -Infinity;
        for (let d = 0; d < Math.min(acc.length, t.contour.length); d++)
          offset = Math.max(offset, acc[d][1] + (d ? SUBTREE_GAP : SIBLING_GAP) - t.contour[d][0]);
      }
      // By hand, a cause goes where it would be without hand moves, moved by its offset, unless the
      // causes above it need the room.
      if (hand) offset = Math.max(offset, subtree(id, false).offsets[i] + (kid?.offsetY || 0));
      offsets.push(offset);
      t.contour.forEach(([top, bottom], d) => {
        acc[d] = acc[d] ? [Math.min(acc[d][0], top + offset), Math.max(acc[d][1], bottom + offset)] : [top + offset, bottom + offset];
      });
      for (const [m, y] of t.members) members.push([m, y + offset]);
      firstCenter ??= offset + t.centers[0]; lastCenter = offset + t.centers[1];
    }
    const top = hand ? subtree(id, false).members[0][1] : (firstCenter + lastCenter) / 2 - h / 2;
    const result = {contour: [[top, top + h], ...acc], members: [[id, top], ...members], offsets, centers: [top + h / 2, top + h / 2]};
    if (!hand) plain.set(id, result);
    return result;
  }

  // A summary's members, one below the other, and the summary's branch in the next column, its box
  // centred on them.
  function summaryTree(sum, hand) {
    const members = [];
    let y = 0;
    for (const m of sum.members) { members.push([m, y]); y += sizes.get(m).h + SIBLING_GAP; }
    const bottom = y - SIBLING_GAP, t = subtree(sum.id, hand), off = bottom / 2 - t.members[0][1] - sizes.get(sum.id).h / 2;
    return {contour: [[0, bottom], ...t.contour.map(([a, b]) => [a + off, b + off])], members: [...members, ...t.members.map(([m, my]) => [m, my + off])],
      centers: [sizes.get(sum.members[0]).h / 2, bottom - sizes.get(sum.members.at(-1)).h / 2]};
  }

  // Each tree is placed below the last, its top where it would be without hand moves, so that a
  // cause moved up into the space above does not move the rest of the chart.
  const boxes = new Map();
  let bottom = null;
  for (const root of roots) {
    if (!visible.has(root) || rank.get(root) !== 0) continue;
    const t = subtree(root, true), top = Math.min(...subtree(root, false).contour.map(c => c[0]));
    const origin = bottom === null ? 0 : bottom + SUBTREE_GAP * 2 - (Math.min(...t.contour.map(c => c[0])) - top);
    for (const [id, y] of t.members) {
      const size = sizes.get(id);
      boxes.set(id, {id, node: byId(id), x: rank.get(id) * (NODE_W + COL_GAP), y: y - top + origin, inSummary: inSummary.has(id), ...size});
    }
    bottom = origin + Math.max(...t.contour.map(c => c[1])) - top;
  }

  const placed = links.filter(l => boxes.has(l.effectId) && boxes.has(l.causeId));
  // parent and children: the effect each cause is drawn under, and each effect's causes in drawing order.
  // summaries: those drawn with a brace.
  return {boxes, edges: routeEdges(boxes, placed, parent, rank, summaries), bounds: chartBounds(boxes), parent, children, summaries};
}

// ---- Connectors ----

const midY = b => b.y + b.h / 2;

function routeEdges(boxes, links, parent, rank, summaries) {
  const edges = [], braced = new Set(summaries.map(x => x.id));
  // A summary: a brace across its members, from just right of them, pointing at it.
  for (const sum of summaries) {
    const first = boxes.get(sum.members[0]), last = boxes.get(sum.members.at(-1)), b = boxes.get(sum.id);
    if (!first || !last || !b) continue;
    const x = first.x + first.w + 14, r = 8, t = first.y, bt = last.y + last.h, y = midY(b);
    const d = `M ${x} ${t} Q ${x + r} ${t} ${x + r} ${t + r} V ${y - r} Q ${x + r} ${y} ${x + 2 * r} ${y} Q ${x + r} ${y} ${x + r} ${y + r} V ${bt - r} Q ${x + r} ${bt} ${x} ${bt} M ${x + 2 * r} ${y} H ${b.x}`;
    edges.push({d, shared: false, summary: sum.id, effectId: sum.members[0], linkIds: links.filter(l => l.causeId === sum.id).map(l => l.id)});
  }
  links = links.filter(l => !braced.has(l.causeId));
  // Tree links: each effect has a bracket in the gap to its right, joining all its causes.
  const groups = new Map();
  for (const l of links) {
    if (parent.get(l.causeId) !== l.effectId) continue;
    if (!groups.has(l.effectId)) groups.set(l.effectId, []);
    groups.get(l.effectId).push(l);
  }
  for (const [effectId, group] of groups) {
    const e = boxes.get(effectId), bx = e.x + e.w + COL_GAP / 2;
    // Alternatives (OR) meet on a second bracket nearer the causes, marked OR where they join the first.
    const alternatives = new Map();
    if (!treeStyle()) for (const l of group) if (l.orGroup) alternatives.set(l.orGroup, [...alternatives.get(l.orGroup) || [], l]);
    for (const [g, list] of alternatives) if (list.length < 2) alternatives.delete(g);
    const ox = bx + 27, ors = [], inOr = new Set([...alternatives.values()].flat());
    const ys = group.map(l => midY(boxes.get(l.causeId)));
    let d = `M ${e.x + e.w} ${midY(e)} H ${bx}`;
    const joins = [midY(e)];
    for (const l of group) {
      const c = boxes.get(l.causeId);
      d += ` M ${inOr.has(l) ? ox : bx} ${midY(c)} H ${c.x}`;
      if (!inOr.has(l)) joins.push(midY(c));
    }
    for (const list of alternatives.values()) {
      const lys = list.map(l => midY(boxes.get(l.causeId))), top = Math.min(...lys), bottom = Math.max(...lys), y = (top + bottom) / 2;
      d += ` M ${bx} ${y} H ${ox} M ${ox} ${top} V ${bottom}`;
      joins.push(y); ors.push({x: ox, y});
    }
    d += ` M ${bx} ${Math.min(...joins)} V ${Math.max(...joins)}`;
    // Two or more causes under one effect are joined by AND, marked where the bracket meets the effect;
    // a group of alternatives is one of them.
    const units = group.length - inOr.size + alternatives.size;
    edges.push({d, shared: false, effectId, linkIds: group.map(l => l.id), junction: units > 1 ? {x: bx, y: midY(e)} : null, ors,
      from: {x: e.x + e.w, y: midY(e)}, bx, branches: group.map(l => ({id: l.causeId, x: boxes.get(l.causeId).x, y: midY(boxes.get(l.causeId))}))});
  }

  // Further links of shared causes get their own lanes beside the brackets.
  const columns = new Map();
  for (const b of boxes.values()) {
    const r = Math.round(b.x / (NODE_W + COL_GAP));
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r).push(b);
  }
  const effectLanes = new Map(), causeLanes = new Map();
  const lane = (map, key) => { const i = map.get(key) || 0; map.set(key, i + 1); return i; };
  for (const l of links) {
    if (parent.get(l.causeId) === l.effectId) continue;
    const e = boxes.get(l.effectId), c = boxes.get(l.causeId), re = rank.get(l.effectId), rc = rank.get(l.causeId);
    const ey = midY(e), cy = midY(c);
    const lx = e.x + e.w + 14 + 7 * lane(effectLanes, re);
    let d = `M ${e.x + e.w} ${ey} H ${lx}`;
    if (rc === re + 1) d += ` V ${cy} H ${c.x}`;
    else {
      const rx = c.x - 14 - 7 * lane(causeLanes, rc);
      const crossed = [];
      for (let r = re + 1; r < rc; r++) crossed.push(...(columns.get(r) || []));
      const y = freeLane(crossed, ey, cy);
      d += ` V ${y} H ${rx} V ${cy} H ${c.x}`;
    }
    edges.push({d, shared: true, effectId: l.effectId, linkIds: [l.id]});
  }
  return edges;
}

// The y closest to both ends at which a horizontal run crosses none of the given boxes.
function freeLane(crossed, ey, cy) {
  const clear = 8;
  const free = y => crossed.every(b => y < b.y - clear || y > b.y + b.h + clear);
  const candidates = [ey, cy];
  const sorted = [...crossed].sort((a, b) => a.y - b.y);
  for (const b of sorted) candidates.push(b.y - clear * 2, b.y + b.h + clear * 2);
  return candidates.filter(free).sort((a, b) => Math.abs(a - ey) + Math.abs(a - cy) - Math.abs(b - ey) - Math.abs(b - cy))[0] ?? ey;
}

function chartBounds(boxes) {
  if (!boxes.size) return {l: 0, t: 0, r: 0, b: 0};
  const all = [...boxes.values()];
  return {
    l: Math.min(...all.map(b => b.x)), t: Math.min(...all.map(b => b.y)),
    r: Math.max(...all.map(b => b.x + b.w)), b: Math.max(...all.map(b => b.y + b.h)),
  };
}

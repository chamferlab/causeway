// Chart rendering. The chart is written as SVG markup with colours in attributes, so the same
// markup serves the canvas and the exported SVG.

let layout = null;

function setStatus(text) { $('status').textContent = text; }
const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
const issueTitle = i => i.nodeId ? byId(i.nodeId)?.title || 'Untitled' : i.title;

// A modal dialog. A button with data-choice closes it; a non-empty choice is passed to onChoice.
function openDialog(html, onChoice) {
  const d = $('dialog');
  d.innerHTML = html;
  d.onclick = e => {
    const b = e.target.closest('[data-choice]');
    if (!b) return;
    d.close();
    if (b.dataset.choice) onChoice(b.dataset.choice);
  };
  d.showModal();
  d.querySelector('[autofocus]')?.focus();
}

const attrs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(' ');

function nodeMarkup(b, opts) {
  const C = opts.colors || CHART_COLORS, n = b.node, c = C[nodeLook(n)], {w, h} = b;
  const isPrimary = n.id === state.problem.primaryEffectId;
  const issue = opts.issues?.get(n.id);
  let s = `<g class="node" data-id="${n.id}" transform="translate(${b.x} ${b.y})"${opts.dimmed?.has(n.id) || opts.highlight && !opts.highlight.has(n.id) || opts.dragging?.id === n.id ? ' opacity="0.35"' : ''}>`;
  if (opts.highlight?.has(n.id) && opts.selectedId !== n.id) s += `<rect x="-6" y="-6" width="${w + 12}" height="${h + 12}" rx="12" fill="none" stroke="${C.highlight}" stroke-width="4"/>`;
  if (opts.selectedId === n.id || opts.picked?.has(n.id)) s += `<rect x="-5" y="-5" width="${w + 10}" height="${h + 10}" rx="11" fill="none" stroke="${C.select}" stroke-width="3"/>`;
  else if (issue === 'error') s += `<rect x="-5" y="-5" width="${w + 10}" height="${h + 10}" rx="11" fill="none" stroke="${C.issue}" stroke-width="2" stroke-dasharray="5 4"/>`;
  s += `<rect width="${w}" height="${h}" rx="8" ${attrs({fill: c.fill, stroke: c.stroke, 'stroke-width': c.dash || n.kind === 'condition' ? 1.5 : isPrimary ? 2 : 1, 'stroke-dasharray': c.dash})}/>`;
  const type = CAUSE_TYPES[n.causeType]?.tag;
  const kind = isPrimary ? KINDS.effect.label : statusBadge(n) ? type : [n.kind === 'effect' ? 'EFFECT' : treeStyle() ? STATUSES[n.status].label
    : n.kind === 'cause' ? 'CAUSE · CHOOSE A TYPE' : KINDS[n.kind].label, type].filter(Boolean).join(' · ');
  const kl = kindLine(n);
  if (kl) s += `<text x="${NODE_PAD_X}" y="${NODE_PAD_Y + 9}" font-size="9.5" font-weight="700" letter-spacing="0.8" fill="${c.sub}">${kind}</text>`;
  s += `<text x="${NODE_PAD_X}" font-size="${TITLE_SIZE}" font-weight="600" fill="${c.text}">`;
  b.lines.forEach((line, i) => { s += `<tspan x="${NODE_PAD_X}" y="${NODE_PAD_Y + kl + TITLE_LINE * i + 12}">${escapeHtml(line)}</tspan>`; });
  s += '</text>';
  // A ruled-out cause in a cause tree is struck through.
  if (isRuledOut(n)) b.lines.forEach((line, i) => {
    const y = NODE_PAD_Y + kl + TITLE_LINE * i + 8;
    s += `<line x1="${NODE_PAD_X}" y1="${y}" x2="${NODE_PAD_X + textWidth(line, TITLE_SIZE, 600)}" y2="${y}" stroke="${c.text}" stroke-width="1.2"/>`;
  });

  const f = b.foot;
  if (hasFoot(f)) {
    const top = h - NODE_PAD_Y - 15, base = top + 11;
    // Tags from the right, then evidence codes from the left in the space that is left.
    let right = w - NODE_PAD_X;
    const pill = (label, fill, text, stroke) => {
      const pw = textWidth(label, 8.5, 700) + 12;
      right -= pw;
      s += `<rect x="${right}" y="${top}" width="${pw}" height="15" rx="7.5" ${attrs({fill, stroke})}/><text x="${right + pw / 2}" y="${base}" font-size="8.5" font-weight="700" letter-spacing="0.4" text-anchor="middle" fill="${text}">${label}</text>`;
      right -= 4;
    };
    if (f.hidden) pill(`+${f.hidden}`, C.panel, C.stop, C.wire);
    if (f.stop) pill('STOP', C.stop, C.stopText);
    if (f.controllable) pill('CONTROLLABLE', C.controllable.fill, C.controllable.text);
    let left = NODE_PAD_X;
    const codeWidth = code => textWidth(code, 10, 700, MONO_FONT) + 12;
    // Codes that do not fit are counted in a last "+N" pill.
    for (const [i, code] of f.codes.entries()) {
      const rest = f.codes.length - i, more = `+${rest}`;
      const fits = left + codeWidth(code) + (rest > 1 ? 4 + codeWidth(more) : 0) <= right;
      const label = fits ? code : more, cw = codeWidth(label);
      s += `<rect x="${left}" y="${top}" width="${cw}" height="15" rx="7.5" ${attrs({fill: c.code.fill, stroke: c.code.stroke})}/><text x="${left + cw / 2}" y="${base}" font-family="${escapeHtml(MONO_FONT)}" font-size="10" font-weight="700" text-anchor="middle" fill="${c.code.text}">${escapeHtml(label)}</text>`;
      if (!fits) break;
      left += cw + 4;
    }
  }
  // A stop point closes the branch with a double bar on the right.
  if (n.stopPoint) s += `<path d="M ${w + 7} ${h * .25} V ${h * .75} M ${w + 12} ${h * .25} V ${h * .75}" stroke="${C.stop}" stroke-width="3"/>`;
  // On the canvas only: the collapse toggle where the node's connector leaves it.
  if (opts.toggles && causeLinks(n.id).length && !b.inSummary) {
    const open = !collapsed.has(n.id);
    s += `<g class="toggle" transform="translate(${w} ${h / 2})"><title>${open ? 'Collapse' : 'Expand'} this branch (Space)</title><circle r="8" fill="${C.panel}" stroke="${C.wire}" stroke-width="1.5"/><path d="M -3.5 0 H 3.5${open ? '' : ' M 0 -3.5 V 3.5'}" stroke="${C.stop}" stroke-width="1.6"/></g>`;
  }
  // A cause tree's status badge: H for a hypothesis, a tick for confirmed, a cross for ruled out.
  // Orange while a hypothesis or a confirmed cause has no evidence.
  if (statusBadge(n)) {
    const bare = needsEvidence(n), mark = STATUSES[n.status].mark;
    const look = bare ? {fill: C.unverified.fill, stroke: C.unverified.fill, text: C.unverified.text}
      : n.status === 'confirmed' ? {fill: C.confirmedWire, stroke: C.confirmedWire, text: '#ffffff'}
      : n.status === 'ruled-out' ? {fill: C.effect.fill, stroke: C.effect.fill, text: '#ffffff'}
      : {fill: C.panel, stroke: C.possible.stroke, text: C.possible.text};
    s += `<g class="status-badge" transform="translate(${w - 3} 3)"><title>${STATUSES[n.status].name}${bare ? ': no evidence linked' : ''}</title><circle r="11" fill="${look.fill}" stroke="${C.panel}" stroke-width="2"/>`
      + `<circle r="9.5" fill="none" stroke="${look.stroke}" stroke-width="1.2"/><text y="${mark === 'H' ? 4.5 : 4.8}" font-size="${mark === 'H' ? 12.5 : 13}" font-weight="800" text-anchor="middle" fill="${look.text}">${mark}</text></g>`;
  } else if (isCause(n) && needsEvidence(n)) {
    s += `<g transform="translate(${w - 3} 3)"><title>${n.unverified && !treeStyle() ? 'Unverified' : 'No evidence linked'}</title><circle r="11" fill="${C.unverified.fill}" stroke="${C.panel}" stroke-width="2"/><text y="4.5" font-size="13" font-weight="800" text-anchor="middle" fill="${C.unverified.text}">?</text></g>`;
  }
  return s + '</g>';
}

// The chart's elements, without the outer <svg>.
function chartMarkup(l, opts = {}) {
  const C = opts.colors || CHART_COLORS;
  let s = `<g font-family="${escapeHtml(CHART_FONT)}">`;
  if (treeStyle()) s += treeEdges(l, C);
  else for (const e of l.edges) {
    s += `<path class="edge${e.summary ? ' brace' : ''}" data-effect="${e.effectId}" d="${e.d}" fill="none" stroke="${e.shared ? C.shared : C.wire}" stroke-width="1.6"${e.shared ? ' stroke-dasharray="6 4"' : ''}/>`;
  }
  // AND where an effect's causes meet; OR, dashed, where a group of alternatives joins them.
  for (const e of treeStyle() ? [] : l.edges) {
    for (const o of e.ors || []) s += `<g class="junction or"><rect x="${o.x - 11}" y="${o.y - 8}" width="22" height="16" rx="8" fill="${C.panel}" stroke="${C.wire}" stroke-width="1.5" stroke-dasharray="3 2"/><text x="${o.x}" y="${o.y + 3}" font-size="8.5" font-weight="800" letter-spacing="0.5" text-anchor="middle" fill="${C.junctionText}">OR</text></g>`;
    if (!e.junction) continue;
    const {x, y} = e.junction;
    s += `<g class="junction"><rect x="${x - 16}" y="${y - 8}" width="32" height="16" rx="8" fill="${C.panel}" stroke="${C.wire}" stroke-width="1.5"/><text x="${x}" y="${y + 3}" font-size="8.5" font-weight="800" letter-spacing="0.5" text-anchor="middle" fill="${C.junctionText}">AND</text></g>`;
  }
  for (const b of l.boxes.values()) s += nodeMarkup(b, opts);
  if (opts.dragging) s += dragMarkup(l, opts.dragging, C);
  return s + '</g>';
}

// A cause tree has no AND: each branch is drawn by its cause's status. The path from an effect to a
// confirmed cause is bold, and the branch to a ruled-out cause is dashed and faint.
function treeEdges(l, C) {
  let s = '', bold = '';
  for (const e of l.edges) {
    if (e.shared) { s += `<path class="edge" data-effect="${e.effectId}" d="${e.d}" fill="none" stroke="${C.shared}" stroke-width="1.6" stroke-dasharray="6 4"/>`; continue; }
    // A summary's brace, drawn by the summary's status.
    if (e.summary) {
      const status = byId(e.summary)?.status;
      if (status === 'confirmed') bold += `<path class="edge brace" data-effect="${e.effectId}" d="${e.d}" fill="none" stroke="${C.confirmedWire}" stroke-width="2.6" stroke-linejoin="round"/>`;
      else s += `<path class="edge brace" data-effect="${e.effectId}" d="${e.d}" fill="none" stroke="${status === 'ruled-out' ? C.ruledWire : C.wire}" stroke-width="1.6"${status === 'ruled-out' ? ' stroke-dasharray="5 4"' : ''}/>`;
      continue;
    }
    const ys = e.branches.map(b => b.y);
    s += `<path class="edge" data-effect="${e.effectId}" d="M ${e.from.x} ${e.from.y} H ${e.bx} M ${e.bx} ${Math.min(e.from.y, ...ys)} V ${Math.max(e.from.y, ...ys)}" fill="none" stroke="${C.wire}" stroke-width="1.6"/>`;
    for (const b of e.branches) {
      const status = byId(b.id)?.status;
      if (status === 'confirmed') bold += `<path d="M ${e.from.x} ${e.from.y} H ${e.bx} V ${b.y} H ${b.x}" fill="none" stroke="${C.confirmedWire}" stroke-width="2.6" stroke-linejoin="round"/>`;
      else s += `<path d="M ${e.bx} ${b.y} H ${b.x}" fill="none" stroke="${status === 'ruled-out' ? C.ruledWire : C.wire}" stroke-width="1.6"${status === 'ruled-out' ? ' stroke-dasharray="5 4"' : ''}/>`;
    }
  }
  return s + bold;
}

// While a node is dragged: the drop target, a copy of the node under the pointer, and what a drop does.
function dragMarkup(l, d, C) {
  let s = '', label = 'Drop on an effect to move, or between causes to reorder';
  const drop = d.drop;
  if (drop?.type === 'move') {
    const t = l.boxes.get(drop.target), ok = !drop.problem;
    s += `<rect x="${t.x - 6}" y="${t.y - 6}" width="${t.w + 12}" height="${t.h + 12}" rx="12" fill="none" stroke="${ok ? C.select : C.issue}" stroke-width="3"${ok ? '' : ' stroke-dasharray="6 4"'}/>`;
    label = ok ? `Move under “${shorten(t.node.title, 40)}”` : drop.problem;
  } else if (drop?.type === 'order') {
    const t = l.boxes.get(drop.sibling), y = drop.after ? t.y + t.h + SIBLING_GAP / 2 : t.y - SIBLING_GAP / 2;
    s += `<rect x="${t.x - 6}" y="${y - 2}" width="${t.w + 12}" height="4" rx="2" fill="${C.select}"/>`;
    label = `Place ${drop.after ? 'below' : 'above'} “${shorten(t.node.title, 40)}”`;
  }
  // The copy and the label keep one size on screen whatever the zoom, below and right of the pointer,
  // so the drop target stays in view. Inside the group, units are screen pixels.
  const b = l.boxes.get(d.id), k = .7, bad = drop?.type === 'move' && drop.problem;
  const lw = textWidth(label, 12, 600) + 18, ly = 14 + b.h * k + 6, wide = Math.max(lw, b.w * k);
  // Near the right edge of the canvas, both go to the left of the pointer instead.
  const ox = (d.at.x - view.x) * view.k + 14 + wide > svg.clientWidth ? -14 - wide : 14;
  s += `<g class="ghost" pointer-events="none" transform="translate(${d.at.x} ${d.at.y}) scale(${1 / view.k})">`;
  s += `<g opacity="0.85" transform="translate(${ox} 14) scale(${k})">${nodeMarkup({...b, x: 0, y: 0}, {colors: C}).replace(/class="node" data-id="[^"]*" /, '')}</g>`;
  s += `<rect x="${ox}" y="${ly}" width="${lw}" height="24" rx="6" fill="${bad ? C.issue : C.stop}"/><text x="${ox + 9}" y="${ly + 16}" font-size="12" font-weight="600" fill="${C.stopText}">${escapeHtml(label)}</text></g>`;
  return s;
}

function issueMap(issues) {
  const map = new Map(), weight = {error: 3, warning: 2, info: 1};
  for (const i of issues) if (i.nodeId && !map.has(i.nodeId) || weight[i.level] > weight[map.get(i.nodeId)]) map.set(i.nodeId, i.level);
  return map;
}

function renderCanvas() {
  const width = svg.clientWidth || 1, height = svg.clientHeight || 1;
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${width / view.k} ${height / view.k}`);
  const cannot = !linking ? null : linking.mode === 'move' ? n => n.id === linking.causeId || moveProblem(linking.causeId, linking.fromId, n.id) : n => linkProblem(linking.effectId, n.id);
  const dimmed = cannot ? new Set(state.nodes.filter(cannot).map(n => n.id)) : null;
  const lit = highlight && !linking ? new Set(citingNodes(highlight).map(n => n.id)) : null;
  svg.innerHTML = chartMarkup(layout, {colors: darkTheme() ? CHART_COLORS_DARK : CHART_COLORS, selectedId: linking ? linking.effectId ?? linking.causeId : drag?.hits ? null : selected, picked: linking ? null : drag?.hits ? new Set(drag.hits) : picked, issues: issueMap(ruleIssues()), dimmed, highlight: lit, toggles: true, dragging: nodeDrag?.moved ? nodeDrag : null});
  // The selection box being drawn.
  if (drag?.to) {
    const a = drag.from, b = drag.to, C = darkTheme() ? CHART_COLORS_DARK : CHART_COLORS;
    svg.insertAdjacentHTML('beforeend', `<rect class="marquee" x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(a.x - b.x)}" height="${Math.abs(a.y - b.y)}" fill="${C.select}" fill-opacity="0.08" stroke="${C.select}" stroke-width="${1.2 / view.k}" stroke-dasharray="${4 / view.k} ${3 / view.k}" pointer-events="none"/>`);
  }
  svg.classList.toggle('linking', !!linking);
  $('zoomReset').textContent = `${Math.round(view.k * 100)}%`;
}
function render() {
  layout = computeLayout();
  if (selected && !layout.boxes.has(selected)) selected = null;
  picked = new Set([...picked].filter(id => layout.boxes.has(id)));
  if (picked.size < 2 || !picked.has(selected)) picked.clear();
  if (highlight && !evidenceById(highlight)) highlight = null;
  const issues = ruleIssues(), causes = state.nodes.length - 1;
  $('count').textContent = `${causes} cause${causes === 1 ? '' : 's'} · ${state.evidence.length} evidence item${state.evidence.length === 1 ? '' : 's'}`;
  for (const [id, n] of [['railCauses', causes], ['railWhys', state.fiveWhys.length], ['railFish', state.fishbones.length], ['railSpec', specFacts().length], ['railCompare', compareDiffs().length], ['railTimeline', state.timelines.length], ['railEquipment', equipmentFilled()], ['railTeam', state.meta.team.length], ['railEvidence', state.evidence.length], ['railRuledOut', state.ruledOut.length + treeRuledOut().length],
    ['railSolutions', state.solutions.length], ['railActions', state.actions.length]]) $(id).textContent = n;
  renderIssues(issues);
  renderTitle();
  renderStyle();
  renderGuide();
  if (record !== 'chart') { renderRecord(); return; }
  renderCanvas();
  const n = byId(selected);
  $('addAction').disabled = $('addCondition').disabled = !n;
  $('deleteNode').disabled = !selection().some(id => id !== state.problem.primaryEffectId);
  $('linkCause').disabled = !n || picked.size > 1;
  $('summarise').disabled = !!summaryProblem(selection(), layout.parent.get(selected));
  $('linkBanner').hidden = !linking;
  if (linking) $('linkText').innerHTML = linking.mode === 'move'
    ? `Click the effect to move <b>${escapeHtml(byId(linking.causeId)?.title || '')}</b> under. Faded nodes would make a loop or already have it as a cause.`
    : `Click the node to link as a cause of <b>${escapeHtml(byId(linking.effectId)?.title || '')}</b>. Faded nodes would make a loop or are already linked.`;
  const ev = highlight && !linking ? evidenceById(highlight) : null;
  $('evidenceBanner').hidden = !ev;
  if (ev) {
    const count = citingNodes(ev.id).length;
    $('evidenceBannerText').innerHTML = `<b>${escapeHtml(ev.code)}</b> is cited by ${count} node${count === 1 ? '' : 's'}, outlined: ${escapeHtml(shorten(ev.description, 80))}`;
  }
  renderProperties();
}

// What the chart style changes around the chart: names, hint, edit bar, legend, and key hints.
function renderStyle() {
  const tree = treeStyle();
  if ($('app').dataset.style === state.meta.style) return;
  $('app').dataset.style = state.meta.style;
  $('railChartName').textContent = tree ? 'Cause tree' : 'Cause & effect';
  $('railChart').title = tree ? 'Cause tree' : 'Cause-and-effect chart';
  $('chartHint').textContent = tree ? 'Read left to right: each effect, then its hypotheses. Test each until a confirmed branch reaches a root cause.'
    : 'Read left to right: each effect, then the causes that were all needed for it (AND).';
  $('addActionName').textContent = tree ? '+ Cause' : '+ Action';
  $('addAction').title = tree ? 'Add a possible cause to the selected effect' : 'Add an action cause to the selected effect';
  $('keyHints').innerHTML = tree
    ? 'Type to rename · <kbd>Tab</kbd> cause · <kbd>Enter</kbd> sibling · <kbd>Alt+1</kbd> <kbd>2</kbd> <kbd>3</kbd> status · <kbd>Alt+L</kbd> link · <kbd>Alt+M</kbd> move · <kbd>Shift+↑↓</kbd> nudge · drag a box to select several · <kbd>Alt+G</kbd> summary · <kbd>Space</kbd> collapse · <kbd>←↑↓→</kbd> select · <kbd>Del</kbd> delete'
    : 'Type to rename · <kbd>Tab</kbd> action · <kbd>Shift+Tab</kbd> condition · <kbd>Enter</kbd> sibling · <kbd>Alt+L</kbd> link · <kbd>Alt+M</kbd> move · <kbd>Shift+↑↓</kbd> nudge · drag a box to select several · <kbd>Alt+G</kbd> summary · <kbd>Alt+O</kbd> alternatives (OR) · <kbd>Space</kbd> collapse · <kbd>←↑↓→</kbd> select · <kbd>Del</kbd> delete';
}

function renderTitle() {
  $('sheetTitle').textContent = primaryEffect()?.title.trim() || 'Untitled RCA';
  document.title = `${rcaName()} · Causeway`;
  $('sheetMeta').textContent = [state.meta.rcaNumber, state.meta.equipmentTag, RCA_STATUS[state.meta.status]].filter(s => s?.trim()).join(' · ');
}

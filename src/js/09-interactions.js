// Pointer and keyboard: selecting, dragging nodes, panning, zooming.

const MIN_ZOOM = .15, MAX_ZOOM = 3;

function point(e) {
  const r = svg.getBoundingClientRect();
  return {x: view.x + (e.clientX - r.left) / view.k, y: view.y + (e.clientY - r.top) / view.k};
}

function select(id) {
  selected = id; picked.clear();
  if (id && reveal(id)) autosave();
  render();
}

const capture = e => { try { svg.setPointerCapture(e.pointerId); } catch {} };

// On the empty canvas, a left drag draws a box that selects the nodes it touches; a right or middle
// drag, or a finger, pans. While linking, a left drag pans too.
svg.addEventListener('pointerdown', e => {
  if (e.button === 1 || e.button === 2) { e.preventDefault(); drag = {x: e.clientX, y: e.clientY, view: {...view}, moved: false, pan: true}; capture(e); return; }
  if (e.button !== 0) return;
  const node = e.target.closest('.node');
  if (node && linking) { pickNode(node.dataset.id); return; }
  if (node && e.target.closest('.toggle')) { select(node.dataset.id); toggleCollapse(); return; }
  // Ctrl+click (Cmd+click) adds the node to the selection or takes it out.
  if (node && (e.ctrlKey || e.metaKey)) { togglePicked(node.dataset.id); return; }
  if (node) {
    const id = node.dataset.id, b = layout.boxes.get(id), p = point(e);
    select(id);
    // With Shift, a cause moves up or down; without, it is dragged to another place in the structure.
    if (b && layout.parent.has(id) && e.shiftKey) { nodeShift = {id, start: e.clientY, kept: byId(id).offsetY, moved: false}; capture(e); return; }
    // A cause can be dragged once the pointer has moved a little; the primary effect stays put.
    if (b && layout.parent.has(id)) { nodeDrag = {id, from: layout.parent.get(id), start: {x: e.clientX, y: e.clientY}, moved: false}; capture(e); }
    return;
  }
  drag = {x: e.clientX, y: e.clientY, view: {...view}, moved: false, pan: !!linking || e.pointerType === 'touch', from: point(e)};
  capture(e);
});
svg.addEventListener('contextmenu', e => e.preventDefault());

// The nodes a selection box from chart point a to b touches, in drawing order.
function boxedNodes(a, b) {
  const l = Math.min(a.x, b.x), r = Math.max(a.x, b.x), t = Math.min(a.y, b.y), bt = Math.max(a.y, b.y);
  return [...layout.boxes.values()].filter(x => x.x <= r && x.x + x.w >= l && x.y <= bt && x.y + x.h >= t).map(x => x.id);
}
svg.addEventListener('pointermove', e => {
  if (nodeShift) { moveShift(e); return; }
  if (nodeDrag) {
    if (!nodeDrag.moved && Math.hypot(e.clientX - nodeDrag.start.x, e.clientY - nodeDrag.start.y) < 5) return;
    nodeDrag.moved = true;
    svg.classList.add('dragging');
    nodeDrag.at = point(e);
    nodeDrag.drop = dropTarget(nodeDrag, nodeDrag.at);
    renderCanvas();
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  if (!drag.pan) {
    drag.to = point(e);
    drag.hits = boxedNodes(drag.from, drag.to);
    renderCanvas();
    return;
  }
  svg.classList.add('panning');
  view.x = drag.view.x - dx / view.k; view.y = drag.view.y - dy / view.k;
  renderCanvas();
});
svg.addEventListener('pointerup', () => {
  if (nodeShift) { finishShift(); return; }
  if (nodeDrag) { finishNodeDrag(); return; }
  if (drag?.moved && !drag.pan) { const hits = drag.hits; drag = null; highlight = null; selectMany(hits); return; }
  if (drag && !drag.moved && linking) cancelLinking();
  else if (drag && !drag.moved && (selected || picked.size || highlight)) { highlight = null; select(null); }
  drag = null;
  svg.classList.remove('panning');
});
svg.addEventListener('pointercancel', () => { cancelNodeDrag(); cancelShift(); if (drag) { drag = null; svg.classList.remove('panning'); renderCanvas(); } });

// What dropping the dragged node at chart point p would do. On a sibling's top or bottom 30 %, or in
// the gap next to it, it is placed above or below that sibling (siblings of its group only);
// anywhere else on a node, it moves under that node.
function dropTarget(d, p) {
  const dragged = byId(d.id);
  const siblings = (layout.children.get(d.from) || []).filter(n => sameGroup(n, dragged) && n.id !== d.id).map(n => layout.boxes.get(n.id)).filter(Boolean);
  const hit = [...layout.boxes.values()].find(b => b.id !== d.id && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
  if (hit && siblings.includes(hit)) {
    const f = (p.y - hit.y) / hit.h;
    if (f < .3 || f > .7) return {type: 'order', sibling: hit.id, after: f > .7};
  }
  if (hit) return {type: 'move', target: hit.id, problem: moveProblem(d.id, d.from, hit.id)};
  const reach = SUBTREE_GAP * 1.5;
  for (const s of siblings) {
    if (p.x < s.x || p.x > s.x + s.w) continue;
    if (p.y < s.y && p.y >= s.y - reach) return {type: 'order', sibling: s.id, after: false};
    if (p.y > s.y + s.h && p.y <= s.y + s.h + reach) return {type: 'order', sibling: s.id, after: true};
  }
  return null;
}

function finishNodeDrag() {
  const d = nodeDrag;
  nodeDrag = null;
  svg.classList.remove('dragging');
  if (!d.moved || !d.drop) { renderCanvas(); return; }
  if (d.drop.type === 'move') { if (!moveTo(d.id, d.from, d.drop.target)) renderCanvas(); return; }
  placeCause(d.from, d.id, d.drop.sibling, d.drop.after);
  render(); persist();
  setStatus(`Placed "${byId(d.id).title}" ${d.drop.after ? 'below' : 'above'} "${byId(d.drop.sibling).title}"`);
}
function cancelNodeDrag() {
  if (!nodeDrag) return;
  nodeDrag = null;
  svg.classList.remove('dragging');
  renderCanvas();
}

// Shift+drag: the cause follows the pointer up and down, no higher than there is room for. It snaps
// back to its place, and level with its effect, so the connector runs straight.
function moveShift(e) {
  const s = nodeShift;
  if (!s.moved) {
    if (Math.abs(e.clientY - s.start) < 4) return;
    s.moved = true;
    s.min = highestShift(s.id);
    const b = layout.boxes.get(s.id), effect = layout.boxes.get(layout.parent.get(s.id));
    s.snaps = [{at: 0, text: 'back in its place'}, {at: s.kept + midY(effect) - midY(b), text: 'level with its effect'}];
    svg.classList.add('shifting');
  }
  let shift = Math.max(s.min, s.kept + (e.clientY - s.start) / view.k);
  const snap = s.snaps.find(x => x.at >= s.min && Math.abs(x.at - shift) < 8 / view.k);
  shift = Math.round(snap ? snap.at : shift);
  byId(s.id).offsetY = shift;
  layout = computeLayout();
  renderCanvas();
  setStatus(`Moving "${byId(s.id).title}": ${snap ? snap.text : shiftText(shift)}`);
}
function finishShift() {
  const s = nodeShift;
  nodeShift = null;
  svg.classList.remove('shifting');
  if (!s.moved) return;
  render(); persist();
  setStatus(`Moved "${byId(s.id).title}" ${shiftText(byId(s.id).offsetY)}`);
}
function cancelShift() {
  if (!nodeShift) return;
  byId(nodeShift.id).offsetY = nodeShift.kept;
  nodeShift = null;
  svg.classList.remove('shifting');
  render();
}

svg.addEventListener('dblclick', e => { if (e.target.closest('.node')) focusTitle(); });

function zoom(factor, at) {
  const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.k * factor));
  at ??= {x: view.x + svg.clientWidth / view.k / 2, y: view.y + svg.clientHeight / view.k / 2};
  view.x = at.x - (at.x - view.x) * view.k / k;
  view.y = at.y - (at.y - view.y) * view.k / k;
  view.k = k;
  renderCanvas();
}
function zoomToFit() {
  const b = layout?.bounds, width = svg.clientWidth, height = svg.clientHeight;
  if (!b || !width || !height) return;
  const margin = 40, w = b.r - b.l + 2 * margin, h = b.b - b.t + 2 * margin;
  view.k = Math.max(MIN_ZOOM, Math.min(1.25, width / w, height / h));
  view.x = (b.l + b.r) / 2 - width / view.k / 2;
  view.y = (b.t + b.b) / 2 - height / view.k / 2;
  renderCanvas();
}
// The wheel zooms; a sideways wheel or swipe (the thumb wheel of some mice) pans left and right.
svg.addEventListener('wheel', e => {
  e.preventDefault();
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    view.x += e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? svg.clientWidth : 1) / view.k;
    renderCanvas();
  } else if (e.deltaY) zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, point(e));
}, {passive: false});
$('zoomIn').onclick = () => zoom(1.25);
$('zoomOut').onclick = () => zoom(.8);
$('zoomReset').onclick = () => zoom(1 / view.k);
$('zoomFit').onclick = zoomToFit;
new ResizeObserver(() => { if (layout) renderCanvas(); }).observe(svg);

$('undo').onclick = () => restoreHistory();
$('redo').onclick = () => restoreHistory(true);

window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase(), command = (e.ctrlKey || e.metaKey) && !e.altKey;
  if ($('dialog').open) return;
  if (nodeDrag?.moved && key === 'escape') { e.preventDefault(); cancelNodeDrag(); setStatus('Drag cancelled'); return; }
  if (nodeShift?.moved && key === 'escape') { e.preventDefault(); cancelShift(); setStatus('Move cancelled'); return; }
  if (command && key === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  if (command && (key === 'z' || key === 'y')) {
    e.preventDefault();
    restoreHistory(key === 'y' || e.shiftKey);
    return;
  }
  if (command || record !== 'chart') return;
  if (e.altKey && (key === 'arrowup' || key === 'arrowdown') && byId(selected)) { e.preventDefault(); nudgeCause(key === 'arrowup' ? -1 : 1); return; }
  if (key === 'escape' && (linking || highlight || selected)) {
    e.preventDefault();
    if (linking) cancelLinking(); else if (highlight) clearHighlight(); else select(null);
    return;
  }
  if (!byId(selected)) return;
  // Commands that are letters or digits take Alt, so that typing goes to the title. Read from e.code,
  // since Option on a Mac changes e.key. AltGr (Ctrl+Alt) types characters.
  if (e.altKey && !e.ctrlKey) {
    const code = e.code.replace(/^(Key|Digit)/, '').toLowerCase();
    // Alt+A adds an action and Alt+C a condition; in a cause tree, Alt+A adds a cause.
    const kind = !e.shiftKey && (treeStyle() ? {a: 'cause'} : {a: 'action', c: 'condition'})[code];
    const status = treeStyle() && !e.shiftKey && {1: 'possible', 2: 'confirmed', 3: 'ruled-out'}[code];
    if (kind) { e.preventDefault(); addCauseToSelected(kind, false); }
    else if (status) { e.preventDefault(); setNodeStatus(status); }
    else if (code === 'l' && !e.shiftKey) { e.preventDefault(); startLinking(); }
    else if (code === 'm' && !e.shiftKey) { e.preventDefault(); startMoving(); }
    else if (code === 'g' && !e.shiftKey) { e.preventDefault(); summariseSelected(); }
    else if (code === 'o' && !e.shiftKey) { e.preventDefault(); alternativesSelected(); }
    return;
  }
  // Tab or Insert adds a cause of the selected node: an action, or with Shift a condition; in a cause
  // tree, a cause. Enter adds a sibling. Tab does this only with the focus on the page, so that it still
  // moves through the buttons and fields. F2 edits the title.
  const onPage = [document.body, svg, null].includes(document.activeElement);
  if (key === 'insert' || key === 'tab' && onPage) { e.preventDefault(); addCauseToSelected(e.shiftKey ? 'condition' : 'action', false); }
  else if (key === 'enter' && !e.shiftKey && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); addSiblingToSelected(); }
  else if (key === 'f2') { e.preventDefault(); focusTitle(); }
  else if (key === 'delete') { e.preventDefault(); deleteSelected(); }
  else if (key === ' ' && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); toggleCollapse(); }
  // Any other character starts a new title: the title is focused and selected, and the key replaces it.
  else if (e.key.length === 1) focusTitle();
});

// Copy, cut, and paste on the chart, through the clipboard events, so the system clipboard is used.
// In a field, or with text selected on the page, they act on the text as usual.
const chartClipboard = () => record === 'chart' && !$('dialog').open && !linking
  && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable
  && (getSelection()?.isCollapsed ?? true);
document.addEventListener('copy', e => { if (chartClipboard() && byId(selected)) { e.preventDefault(); copySelected(e.clipboardData); } });
document.addEventListener('cut', e => { if (chartClipboard() && byId(selected)) { e.preventDefault(); cutSelected(e.clipboardData); } });
document.addEventListener('paste', e => { if (chartClipboard()) { e.preventDefault(); pasteToSelected(e.clipboardData); } });

// Arrow keys move the selection: left to the effect, right to the first cause, up and down within the column.
// With Shift, up and down move the selected cause instead.
window.addEventListener('keydown', e => {
  if (!e.key.startsWith('Arrow') || e.ctrlKey || e.metaKey || e.altKey || record !== 'chart') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  e.preventDefault();
  const from = layout.boxes.get(selected);
  // Shift+Up and Shift+Down move a cause by hand.
  if (from && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { shiftSelected(e.key === 'ArrowUp' ? -1 : 1); return; }
  // Right on a collapsed node expands it.
  if (from && e.key === 'ArrowRight' && collapsed.has(from.id)) { toggleCollapse(from.id); return; }
  const next = from ? neighbour(from, e.key) : layout.boxes.get(state.problem.primaryEffectId);
  if (!next) return;
  select(next.id);
  scrollToNode(next.id);
});

function clearHighlight() {
  highlight = null;
  render();
}
$('clearHighlight').onclick = clearHighlight;

function neighbour(from, key) {
  const boxes = [...layout.boxes.values()], cy = midY(from);
  const near = list => list.sort((a, b) => Math.abs(midY(a) - cy) - Math.abs(midY(b) - cy))[0];
  if (key === 'ArrowLeft') return near(effectsOf(from.id).map(n => layout.boxes.get(n.id)).filter(Boolean));
  if (key === 'ArrowRight') return near(causesOf(from.id).map(n => layout.boxes.get(n.id)).filter(Boolean));
  const column = boxes.filter(b => b.x === from.x && (key === 'ArrowUp' ? b.y < from.y : b.y > from.y));
  return near(column);
}

// Pans just enough to bring a node fully into view.
function scrollToNode(id) {
  const b = layout.boxes.get(id);
  if (!b) return;
  const margin = 40 / view.k, w = svg.clientWidth / view.k, h = svg.clientHeight / view.k;
  if (b.x - margin < view.x) view.x = b.x - margin;
  else if (b.x + b.w + margin > view.x + w) view.x = b.x + b.w + margin - w;
  if (b.y - margin < view.y) view.y = b.y - margin;
  else if (b.y + b.h + margin * 2.5 > view.y + h) view.y = b.y + b.h + margin * 2.5 - h;   // clear of the edit bar
  renderCanvas();
}

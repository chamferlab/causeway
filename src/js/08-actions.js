// Edits on the chart.

function addCauseToSelected(kind) {
  if (!byId(selected)) return;
  const n = addCause(selected, kind);
  selected = n.id;
  render(); persist();
  focusTitle();
}

// After adding a cause the title is selected, so typing replaces the placeholder.
function focusTitle() {
  const input = $('nodeTitle');
  if (input) { input.focus(); input.select(); }
}

function deleteSelected() {
  if (picked.size > 1) { deleteSeveral(); return; }
  const n = byId(selected);
  if (!n || n.id === state.problem.primaryEffectId) return;
  const ids = deletionSet(n.id);
  const others = ids.length - 1;
  if (others && !confirm(`Delete "${n.title}" and ${others} cause${others > 1 ? 's' : ''} that only it supports?`)) return;
  const effect = effectsOf(n.id)[0];
  deleteNodes(ids);
  selected = effect?.id ?? null;
  render(); persist();
  setStatus(`Deleted ${ids.length} node${ids.length > 1 ? 's' : ''}`);
}

function deleteSeveral() {
  const ids = selection().filter(id => id !== state.problem.primaryEffectId);
  if (!ids.length) return;
  const all = deletionSet(...ids), others = all.length - ids.length;
  if (!confirm(`Delete ${plural(ids.length, 'selected node')}${others ? ` and ${plural(others, 'cause')} that only they support` : ''}?`)) return;
  const next = ids.map(id => layout.parent.get(id)).find(id => id && !all.includes(id));
  deleteNodes(all);
  picked.clear(); selected = next ?? null;
  render(); persist();
  setStatus(`Deleted ${plural(all.length, 'node')}`);
}

// ---- Selecting several nodes ----
// Dragging a box on the empty canvas selects the nodes it touches; Ctrl+click (Cmd+click on a Mac) adds
// a node or takes it out. With two or more selected, the properties panel acts on them all: give them
// a summary, set their status in a cause tree, or delete them. A click on a node selects it alone.

const selection = () => picked.size > 1 ? [...picked].filter(byId) : byId(selected) ? [selected] : [];
function selectMany(ids) {
  picked = new Set(ids.length > 1 ? ids : []);
  selected = ids.at(-1) ?? null;
  render();
  if (picked.size > 1) setStatus(`${plural(picked.size, 'node')} selected${summaryProblem(ids, layout.parent.get(selected)) ? '' : ': Alt+G gives them a summary'}${alternativesProblem(ids, layout.parent.get(selected)) ? '' : ', Alt+O makes them alternatives (OR)'}`);
}
function togglePicked(id) {
  const ids = selection();
  selectMany(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
}

// Alt+G: one new cause shared by the selected causes, drawn to their right with a brace. Its title is
// ready to type.
function summariseSelected() {
  const ids = selection(), problem = summaryProblem(ids, layout.parent.get(selected));
  if (problem) { setStatus(problem); return; }
  const effectId = summaryEffect(ids, layout.parent.get(selected)), n = summariseCauses(ids, effectId);
  picked.clear(); selected = n.id;
  render(); persist();
  scrollToNode(n.id);
  focusTitle();
  setStatus(`Added a summary of ${plural(ids.length, 'cause')}: type its title`);
}

// A candidate cause that the evidence rejects moves to the causes ruled out, with its evidence.
function ruleOutSelected() {
  const n = byId(selected);
  if (!n || n.id === state.problem.primaryEffectId) return;
  // In a cause tree a ruled-out cause stays on the tree.
  if (treeStyle()) { setNodeStatus('ruled-out'); return; }
  const ids = deletionSet(n.id), others = ids.length - 1;
  if (others && !confirm(`Rule out "${n.title}"? The ${others} cause${others > 1 ? 's' : ''} that only it supports will be deleted.`)) return;
  const effect = effectsOf(n.id)[0];
  toRuledOut(n);
  deleteNodes(ids);
  selected = effect?.id ?? null;
  render(); persist();
  setStatus(`Moved "${n.title}" to the causes ruled out`);
}
// The ruled-out record of a node about to be deleted.
function toRuledOut(n) {
  const r = {id: uuid(), cause: n.title, kind: ['action', 'condition'].includes(n.kind) ? n.kind : '', test: n.test, evidenceIds: [...n.evidenceIds], status: 'ruled-out'};
  state.ruledOut.push(r);
  // A fishbone cause that was this node is now this ruled-out cause.
  for (const c of fishCauses()) if (c.nodeId === n.id) Object.assign(c, {nodeId: null, ruledOutId: r.id});
}

// ---- Alternatives (OR) ----
// Alt+O: the selected causes become alternatives, one of which caused their effect; with one of them
// selected, Alt+O takes it out of its group. Keep this one rules out the others.
function alternativesSelected() {
  const ids = selection(), effectId = layout.parent.get(selected);
  if (ids.length === 1 && alternativesOf(effectId, selected).length) {
    leaveAlternatives(effectId, selected);
    render(); persist();
    setStatus(`"${byId(selected).title}" is no longer an alternative: it was needed, with the other causes (AND)`);
    return;
  }
  const problem = alternativesProblem(ids, effectId);
  if (problem) { setStatus(problem); return; }
  makeAlternatives(ids, effectId);
  render(); persist();
  setStatus(`${plural(ids.length, 'alternative')} (OR), marked unverified: test them, and rule out all but one`);
}
function keepAlternative() {
  const n = byId(selected), effectId = layout.parent.get(selected), others = alternativesOf(effectId, selected);
  if (!n || !others.length) return;
  const ids = deletionSet(...others.map(c => c.id)), more = ids.length - others.length;
  if (!confirm(`Keep "${n.title}" and move ${others.length === 1 ? `"${others[0].title}"` : plural(others.length, 'alternative')} to the causes ruled out?${more ? ` The ${plural(more, 'cause')} that only they support will be deleted.` : ''}`)) return;
  for (const c of others) toRuledOut(c);
  deleteNodes(ids);
  render(); persist();
  setStatus(`Kept "${n.title}": ${plural(others.length, 'alternative')} moved to the causes ruled out`);
}

// A cause tree: Alt+1, Alt+2, and Alt+3 set the status of the selected causes. A confirmed cause happened,
// so the effects it leads to did too: the possible ones on the way to the primary effect are confirmed
// with it. A ruled-out effect stops the way; the issues list flags it. When a confirmed cause becomes
// a hypothesis or is ruled out, the effects it confirmed go back to hypotheses: each one that has no
// other confirmed cause and no evidence of its own.
function setNodeStatus(status) {
  const nodes = selection().map(byId).filter(isCause);
  if (!nodes.length || !treeStyle()) return;
  let more = 0, fewer = 0;
  for (const n of nodes) {
    const was = n.status;
    n.status = status;
    if (was === 'confirmed' && status !== 'confirmed') {
      const todo = effectsOf(n.id);
      while (todo.length) {
        const e = todo.pop();
        if (!isCause(e) || e.status !== 'confirmed' || hasEvidence(e) || causesOf(e.id).some(c => c.status === 'confirmed')) continue;
        e.status = 'possible'; fewer++;
        todo.push(...effectsOf(e.id));
      }
    }
    if (status === 'confirmed') {
      const seen = new Set(), todo = effectsOf(n.id);
      while (todo.length) {
        const e = todo.pop();
        if (seen.has(e.id) || !isCause(e) || e.status === 'ruled-out') continue;
        seen.add(e.id);
        if (e.status === 'possible') { e.status = 'confirmed'; more++; }
        todo.push(...effectsOf(e.id));
      }
    }
  }
  render(); persist();
  setStatus(`${nodes.length > 1 ? plural(nodes.length, 'cause') : `"${nodes[0].title}"`}: ${STATUSES[status].name.toLowerCase()}${more ? `, with the ${more} effect${more > 1 ? 's' : ''} ${nodes.length > 1 ? 'they lead' : 'it leads'} to` : ''}`
    + (fewer ? `; ${plural(fewer, 'effect')} ${nodes.length > 1 ? 'they' : 'it'} confirmed ${fewer > 1 ? 'are hypotheses' : 'is a hypothesis'} again` : ''));
}

// Collapsing is a view setting: saved with the file, but not an undo step.
function toggleCollapse(id = selected) {
  if (!causeLinks(id).length) return;
  if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
  render(); autosave();
}
function expandAll() {
  collapsed.clear();
  render(); autosave();
}

// Linking an existing node as a further cause of the selected effect: the next node clicked is linked.
function startLinking() {
  const n = byId(selected);
  if (!n) return;
  linking = {mode: 'link', effectId: n.id};
  render();
}
// Moving: the next node clicked becomes the effect of the selected cause.
function startMoving() {
  const n = byId(selected), from = layout.parent.get(selected);
  if (!n || !from) return;
  linking = {mode: 'move', causeId: n.id, fromId: from};
  render();
}
function pickNode(id) {
  if (linking.mode === 'move') moveTo(linking.causeId, linking.fromId, id);
  else linkTo(id);
}
function moveTo(causeId, fromId, toId) {
  const problem = moveCause(causeId, fromId, toId);
  if (problem) { setStatus(problem); return false; }
  linking = null; selected = causeId;
  render(); persist();
  scrollToNode(causeId);
  setStatus(`Moved "${byId(causeId).title}" under "${byId(toId).title}"`);
  return true;
}
// Alt+Up and Alt+Down: swap with the neighbouring cause of its group under the same effect.
function nudgeCause(direction) {
  const effect = layout.parent.get(selected), n = byId(selected);
  if (!effect || !n) return;
  const group = (layout.children.get(effect) || []).filter(c => sameGroup(c, n));
  const i = group.findIndex(c => c.id === n.id), other = group[i + direction];
  if (!other) return;
  placeCause(effect, n.id, other.id, direction > 0);
  render(); persist();
  scrollToNode(n.id);
}

// ---- Copy, cut, and paste ----
// Ctrl+C copies the selected node with every cause under it; Ctrl+V adds the copy as a cause of the
// selected node. The system clipboard carries it between tabs and RCAs: as text, and as an HTML list of
// the titles whose data-causeway-branch attribute holds the branch. Custom clipboard types are not
// used, since not every browser keeps them.

function copySelected(clipboardData) {
  const n = byId(selected);
  if (!n) return false;
  clipboard = {data: copyBranchData(n.id), text: branchText(n.id)};
  if (clipboardData) {
    clipboardData.setData('text/plain', clipboard.text);
    clipboardData.setData('text/html', `<ul data-${BRANCH_TYPE}="${escapeHtml(JSON.stringify(clipboard.data))}">${branchHtml(n.id)}</ul>`);
  }
  render();
  const more = clipboard.data.nodes.length - 1;
  setStatus(`Copied "${n.title}"${more ? ` and ${plural(more, 'cause')} under it` : ''}`);
  return true;
}
function cutSelected(clipboardData) {
  const n = byId(selected);
  if (!n || n.id === state.problem.primaryEffectId || !copySelected(clipboardData)) return;
  deleteSelected();
  if (!byId(n.id)) setStatus(`Cut "${n.title}"; select an effect and paste it with Ctrl+V`);
}
// The branch from the system clipboard, or the one copied here when the clipboard has only its text.
function clipboardBranch(clipboardData) {
  if (!clipboardData) return clipboard?.data ?? null;
  try {
    const html = clipboardData.getData('text/html');
    const data = html && new DOMParser().parseFromString(html, 'text/html').querySelector(`[data-${BRANCH_TYPE}]`)?.getAttribute(`data-${BRANCH_TYPE}`);
    if (data) return JSON.parse(data);
  } catch {}
  return clipboard && clipboardData.getData('text/plain') === clipboard.text ? clipboard.data : null;
}
function pasteToSelected(clipboardData) {
  const effect = byId(selected);
  if (!effect) { setStatus('Select the node to paste under'); return; }
  const pasted = pasteBranchData(clipboardBranch(clipboardData), effect.id);
  if (!pasted) { setStatus('Nothing to paste: copy a node first'); return; }
  selected = pasted.root.id;
  render(); persist();
  scrollToNode(selected);
  setStatus(`Pasted "${pasted.root.title}"${pasted.count > 1 ? ` and ${plural(pasted.count - 1, 'cause')} under it` : ''} under "${effect.title}"`
    + (pasted.dropped ? `; ${plural(pasted.dropped, 'evidence citation')} left out, from another RCA` : ''));
}

// ---- Moving a cause up or down by hand ----
// Shift+drag, and Shift+Up and Shift+Down. The cause moves with its branch, and its effect stays.

const SHIFT_STEP = 10;
// How far up a cause can move by hand: into free space only, so that its effect stays where it is and
// the causes above it are not in the way. Never above where it already is.
function highestShift(id) {
  const effect = layout.parent.get(id), n = byId(id), kept = n.offsetY;
  const place = shift => { n.offsetY = shift; const l = computeLayout(); return {effect: l.boxes.get(effect).y, node: l.boxes.get(id).y}; };
  try {
    const now = place(kept), far = -Math.ceil(layout.bounds.b - layout.bounds.t) - 400;
    // The causes above it stop it where they are; measured from its effect, which may move meanwhile.
    const top = place(far), room = kept + (top.node - top.effect) - (now.node - now.effect);
    const stays = shift => Math.abs(place(shift).effect - now.effect) < .01;
    let ok = kept, bad = far;
    if (stays(bad)) return Math.min(kept, Math.max(room, bad));
    while (ok - bad > 1) { const m = Math.floor((ok + bad) / 2); if (stays(m)) ok = m; else bad = m; }
    return Math.min(kept, Math.max(room, ok));
  } finally { n.offsetY = kept; }
}
const shiftText = shift => shift ? `${Math.abs(shift)} ${shift > 0 ? 'down' : 'up'}` : 'back in its place';

function shiftSelected(direction) {
  const n = byId(selected);
  if (!n || !layout.parent.has(n.id)) return;
  const now = n.offsetY, next = Math.max(highestShift(n.id), now + direction * SHIFT_STEP);
  if (next === now) { setStatus(`"${n.title}" cannot move up: there is no room above it`); return; }
  n.offsetY = next;
  render(); persist('shift:' + n.id);
  scrollToNode(n.id);
  setStatus(`Moved "${n.title}" ${shiftText(next)}`);
}
function resetShifts(ids) {
  for (const id of ids) byId(id).offsetY = 0;
  render(); persist();
  setStatus(ids.length === 1 ? `Put "${byId(ids[0]).title}" back in its place` : `Put ${plural(ids.length, 'node')} back in their places`);
}
const shiftedNodes = () => state.nodes.filter(n => n.offsetY);

function cancelLinking() {
  linking = null;
  render();
}
function linkTo(causeId) {
  const effectId = linking.effectId, problem = linkProblem(effectId, causeId);
  if (problem) { setStatus(problem); return; }
  addLink(effectId, causeId);
  collapsed.delete(effectId);
  linking = null; selected = effectId;
  render(); persist();
  setStatus(`Linked "${byId(causeId).title}" as a cause of "${byId(effectId).title}"`);
}
// A cause keeps at least one effect; to take it off the chart, delete it.
function unlinkFrom(effectId, causeId) {
  if (effectLinks(causeId).length < 2) return;
  state.links = state.links.filter(l => !(l.effectId === effectId && l.causeId === causeId));
  render(); persist();
}

$('addAction').onclick = () => addCauseToSelected('action');
$('addCondition').onclick = () => addCauseToSelected('condition');
$('deleteNode').onclick = deleteSelected;
$('linkCause').onclick = startLinking;
$('summarise').onclick = summariseSelected;
$('cancelLink').onclick = cancelLinking;

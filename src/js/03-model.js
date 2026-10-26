// The cause-and-effect graph: links, cycle check, deletion, and the rule checks.
// Links run from an effect to one of its causes; together they form a DAG rooted at the
// primary effect.

const causeLinks = id => state.links.filter(l => l.effectId === id);
const effectLinks = id => state.links.filter(l => l.causeId === id);
const causesOf = id => causeLinks(id).map(l => byId(l.causeId)).filter(Boolean);
const effectsOf = id => effectLinks(id).map(l => byId(l.effectId)).filter(Boolean);

// True when `from` reaches `to` by following causes.
function reaches(from, to) {
  const seen = new Set(), stack = [from];
  while (stack.length) {
    const id = stack.pop();
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of causeLinks(id)) stack.push(l.causeId);
  }
  return false;
}

// Why `causeId` cannot become a cause of `effectId`, or null when it can.
function linkProblem(effectId, causeId) {
  if (effectId === causeId) return 'A cause cannot cause itself.';
  if (causeId === state.problem.primaryEffectId) return 'The primary effect cannot be a cause.';
  if (state.links.some(l => l.effectId === effectId && l.causeId === causeId)) return 'It is already a cause of this effect.';
  if (reaches(causeId, effectId)) return 'That would make a loop: the effect is already among its causes.';
  return null;
}
function addLink(effectId, causeId) {
  if (linkProblem(effectId, causeId)) return null;
  const link = {id: uuid(), effectId, causeId};
  state.links.push(link);
  return link;
}

// In a cause tree a new cause has no type; it is given one if the RCA moves to Apollo.
function addCause(effectId, kind, title) {
  if (treeStyle()) kind = 'cause';
  const n = blankNode(kind, title ?? `New ${KINDS[kind].name.toLowerCase()}`);
  state.nodes.push(n);
  addLink(effectId, n.id);
  collapsed.delete(effectId);
  return n;
}

// ---- Copying branches ----
// A branch is a node and every cause under it, with the links among them. On the clipboard it is
// {type: BRANCH_TYPE, rcaId, rootId, nodes, links}: nodes as in the file, links in their order.

const BRANCH_TYPE = 'causeway-branch';
function branchIds(id) {
  const ids = [], todo = [id];
  while (todo.length) {
    const next = todo.shift();
    if (ids.includes(next)) continue;
    ids.push(next);
    todo.push(...causeLinks(next).map(l => l.causeId));
  }
  return ids;
}
function copyBranchData(id) {
  const ids = new Set(branchIds(id));
  return {
    type: BRANCH_TYPE, rcaId: state.id, rootId: id,
    nodes: state.nodes.filter(n => ids.has(n.id)).map(n => JSON.parse(JSON.stringify(n))),
    links: state.links.filter(l => ids.has(l.effectId) && ids.has(l.causeId)).map(({effectId, causeId}) => ({effectId, causeId})),
  };
}
// The branch as an indented list of titles, for pasting into other programs, as text and as HTML.
function branchText(id, depth = 0, seen = new Set()) {
  if (seen.has(id)) return '';
  seen.add(id);
  return '  '.repeat(depth) + byId(id).title.replace(/\s*\n\s*/g, ' ') + '\n' + causesOf(id).map(c => branchText(c.id, depth + 1, seen)).join('');
}
function branchHtml(id, seen = new Set()) {
  if (seen.has(id)) return '';
  seen.add(id);
  const causes = causesOf(id).map(c => branchHtml(c.id, seen)).join('');
  return `<li>${escapeHtml(byId(id).title)}${causes ? `<ul>${causes}</ul>` : ''}</li>`;
}
// Adds a copied branch as a cause of `effectId`, with new ids. The clipboard may hold anything, so
// every field is checked as a file is. Evidence is kept only where this RCA has it. Returns the new
// root node and the number of citations left out, or null when there is no branch to paste.
function pasteBranchData(data, effectId) {
  if (data?.type !== BRANCH_TYPE || !Array.isArray(data.nodes) || !Array.isArray(data.links)) return null;
  const source = new Map(data.nodes.filter(n => typeof n?.id === 'string').map(n => [n.id, n]));
  if (!source.has(data.rootId)) return null;
  const ids = new Map([...source.keys()].map(id => [id, uuid()]));
  let dropped = 0;
  for (const [old, n] of source) {
    const kind = n.kind in KINDS && n.kind !== 'effect' ? n.kind : 'cause';
    const evidenceIds = (Array.isArray(n.evidenceIds) ? n.evidenceIds : []).filter(e => typeof e === 'string');
    const kept = data.rcaId === state.id ? evidenceIds.filter(evidenceById) : [];
    dropped += evidenceIds.length - kept.length;
    const text = key => typeof n[key] === 'string' ? n[key] : '';
    state.nodes.push({...blankNode(kind, text('title')), id: ids.get(old),
      description: text('description'), test: text('test'), notes: text('notes'), evidenceIds: kept,
      status: n.status in STATUSES ? n.status : 'possible', unverified: n.unverified === true, controllable: n.controllable === true, causeType: n.causeType in CAUSE_TYPES ? n.causeType : '', summary: n.summary === true,
      stopPoint: n.stopPoint && n.stopPoint.reason in STOP_REASONS ? {reason: n.stopPoint.reason, note: typeof n.stopPoint.note === 'string' ? n.stopPoint.note : ''} : null,
      offsetY: old !== data.rootId && Number.isFinite(n.offsetY) ? n.offsetY : 0});
  }
  addLink(effectId, ids.get(data.rootId));
  for (const l of data.links) if (ids.has(l?.effectId) && ids.has(l?.causeId)) addLink(ids.get(l.effectId), ids.get(l.causeId));
  // Nodes the links do not reach from the root are left out.
  const reached = new Set(branchIds(ids.get(data.rootId)));
  const stray = new Set([...ids.values()].filter(id => !reached.has(id)));
  state.nodes = state.nodes.filter(n => !stray.has(n.id));
  state.links = state.links.filter(l => !stray.has(l.effectId) && !stray.has(l.causeId));
  collapsed.delete(effectId);
  return {root: byId(ids.get(data.rootId)), count: reached.size, dropped};
}

// Evidence codes are E1, E2, … and are never reused: the counter remembers codes of deleted items.
const nextEvidenceNumber = () => Math.max(state.counters.evidence || 1, ...state.evidence.map(e => (+/^E(\d+)$/.exec(e.code)?.[1] || 0) + 1));
const nextEvidenceCode = () => 'E' + nextEvidenceNumber();
function addEvidence(description = '') {
  const number = nextEvidenceNumber();
  const e = {id: uuid(), code: 'E' + number, description, type: 'sensed', source: '', collectedBy: '', date: today()};
  state.evidence.push(e);
  state.counters.evidence = number + 1;
  return e;
}
// Where an evidence item is cited: chart nodes and ruled-out causes.
const citingNodes = id => state.nodes.filter(n => n.evidenceIds.includes(id));
const citingRuledOut = id => state.ruledOut.filter(r => r.evidenceIds.includes(id));
function deleteEvidence(id) {
  state.evidence = state.evidence.filter(e => e.id !== id);
  for (const x of [...state.nodes, ...state.ruledOut, ...state.fiveWhys.flatMap(c => c.steps), ...fishCauses(), ...timelineEvents(), ...state.comparison.rows]) x.evidenceIds = x.evidenceIds.filter(e => e !== id);
  if (highlight === id) highlight = null;
}
// ---- 5 Whys ----
// A chain starts from a chart node (effectId) and asks why, step after step; each answer is a cause
// of the one before. A step added to the chart is that node: its words, type, and evidence are the
// node's. Otherwise the step keeps its own.

const blankStep = () => ({id: uuid(), answer: '', kind: 'condition', evidenceIds: [], nodeId: null});
function addChain(effectId = state.problem.primaryEffectId) {
  const chain = {id: uuid(), effectId, steps: [blankStep()]};
  state.fiveWhys.push(chain);
  return chain;
}
const stepNode = step => step.nodeId ? byId(step.nodeId) : null;
const whyAnswer = step => stepNode(step)?.title ?? step.answer;
const stepSource = step => stepNode(step) ?? step;
const chainOf = stepId => state.fiveWhys.find(c => c.steps.some(s => s.id === stepId));
const stepById = id => chainOf(id)?.steps.find(s => s.id === id);

// The node a step's cause is added under: the previous step's node, or the chain's start for step 1.
function stepParent(chain, i) {
  return i === 0 ? byId(chain.effectId) : stepNode(chain.steps[i - 1]);
}
function stepToChart(chain, i) {
  const step = chain.steps[i];
  if (stepNode(step)) return null;
  const parent = stepParent(chain, i);
  if (!parent) return `Add why ${i} to the chart first.`;
  const n = addCause(parent.id, step.kind, step.answer.trim() || 'Untitled cause');
  n.evidenceIds = [...step.evidenceIds];
  step.nodeId = n.id;
  return null;
}
// Adds every step not yet on the chart, in order. Returns how many were added.
function chainToChart(chain) {
  let added = 0;
  for (let i = 0; i < chain.steps.length; i++) {
    if (stepNode(chain.steps[i])) continue;
    if (stepToChart(chain, i)) break;
    added++;
  }
  return added;
}

// ---- Fishbone ----
// A fishbone (Ishikawa) diagram sorts the possible causes of an effect into categories, so that no
// area is forgotten. Each possible cause is then tested: added to the chart, where it needs evidence,
// or ruled out. One on the chart is that node, and one ruled out is that record: its words, type, and
// evidence are kept there. A cause can have sub-causes (parentId), one level down.

const blankFishCause = (parentId = null) => ({id: uuid(), text: '', kind: 'condition', evidenceIds: [], nodeId: null, ruledOutId: null, parentId});
function addFishbone(preset = 'seal', effectId = state.problem.primaryEffectId) {
  const f = {id: uuid(), effectId, categories: FISHBONE_PRESETS[preset].categories.map(name => ({id: uuid(), name, causes: []}))};
  state.fishbones.push(f);
  return f;
}
const fishCauses = () => state.fishbones.flatMap(f => f.categories.flatMap(g => g.causes));
const fishNode = c => c.nodeId ? byId(c.nodeId) : null;
const fishRuled = c => c.ruledOutId ? state.ruledOut.find(r => r.id === c.ruledOutId) : null;
const fishSource = c => fishNode(c) ?? fishRuled(c) ?? c;
const fishText = c => fishNode(c)?.title ?? fishRuled(c)?.cause ?? c.text;
const fishKind = c => fishSource(c).kind || c.kind;
const fishStatus = c => fishNode(c) ? 'chart' : fishRuled(c) ? 'ruled' : 'open';
const fishCategory = id => state.fishbones.flatMap(f => f.categories).find(g => g.id === id);
function fishFind(id) {
  for (const fishbone of state.fishbones) for (const category of fishbone.categories) {
    const cause = category.causes.find(c => c.id === id);
    if (cause) return {fishbone, category, cause};
  }
  return null;
}
// Top-level causes in order, each followed by its sub-causes.
const fishRows = g => g.causes.filter(c => !c.parentId).flatMap(c => [c, ...g.causes.filter(x => x.parentId === c.id)]);

// A cause goes under the diagram's effect; a sub-cause under its cause, which must be on the chart.
function fishToChart(id) {
  const {fishbone, category, cause} = fishFind(id);
  if (fishStatus(cause) !== 'open') return null;
  const parent = cause.parentId ? fishNode(category.causes.find(c => c.id === cause.parentId) || {}) : byId(fishbone.effectId);
  if (!parent) return 'Add the cause above it to the chart first.';
  const n = addCause(parent.id, cause.kind, cause.text.trim() || 'Untitled cause');
  n.evidenceIds = [...cause.evidenceIds];
  cause.nodeId = n.id;
  return null;
}
function fishRuleOut(id) {
  const {cause} = fishFind(id);
  if (fishStatus(cause) !== 'open') return null;
  const r = {id: uuid(), cause: cause.text, kind: cause.kind, test: '', evidenceIds: [...cause.evidenceIds], status: 'ruled-out'};
  state.ruledOut.push(r);
  cause.ruledOutId = r.id;
  return r;
}
// ---- Sequence of events ----
// A timeline lays out what happened, in order, in phases such as a test run's pre-test work, testing,
// post-test work, and report. An event has a start, and an end when it lasted; times are local, as
// YYYY-MM-DDTHH:MM, and may be left out. A deviation is an event that departed from what should have
// happened: a candidate cause. An event added to the chart, under the timeline's effect, is that node,
// as a 5 Whys step is: its words, type, and evidence are the node's.

const blankEvent = (start = '') => ({id: uuid(), text: '', start, end: '', kind: 'action', deviation: false, evidenceIds: [], nodeId: null});
function addTimeline(preset = 'test', effectId = state.problem.primaryEffectId) {
  const t = {id: uuid(), effectId, phases: TIMELINE_PRESETS[preset].phases.map(name => ({id: uuid(), name, events: []}))};
  state.timelines.push(t);
  return t;
}
const timelineEvents = () => state.timelines.flatMap(t => t.phases.flatMap(p => p.events));
const eventNode = ev => ev.nodeId ? byId(ev.nodeId) : null;
const eventSource = ev => eventNode(ev) ?? ev;
const eventText = ev => eventNode(ev)?.title ?? ev.text;
const eventKind = ev => eventSource(ev).kind;
const timelinePhase = id => state.timelines.flatMap(t => t.phases).find(p => p.id === id);
function eventFind(id) {
  for (const timeline of state.timelines) for (const phase of timeline.phases) {
    const event = phase.events.find(ev => ev.id === id);
    if (event) return {timeline, phase, event};
  }
  return null;
}
// Minutes since 1970 of a time, read as written, without time zones; null when there is none.
function eventMinutes(when) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(when || '');
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
}
// A phase's events in time order; those without a time keep their order, after the others.
const eventsInOrder = phase => [...phase.events].sort((a, b) => (eventMinutes(a.start) ?? Infinity) - (eventMinutes(b.start) ?? Infinity));

function eventToChart(id) {
  const {timeline, event} = eventFind(id);
  if (eventNode(event)) return;
  const n = addCause(timeline.effectId, event.kind, event.text.trim() || 'Untitled cause');
  n.evidenceIds = [...event.evidenceIds];
  event.nodeId = n.id;
}
// Adds the deviations not on the chart yet, in time order. Returns how many were added.
function deviationsToChart(timeline) {
  const events = timeline.phases.flatMap(eventsInOrder).filter(ev => ev.deviation && !eventNode(ev));
  events.forEach(ev => eventToChart(ev.id));
  return events.length;
}

// A cause that leaves the chart or the causes ruled out takes its words, type, and evidence back.
function releaseFish(c) {
  const src = fishSource(c);
  Object.assign(c, {text: fishText(c), kind: ['action', 'condition'].includes(src.kind) ? src.kind : c.kind, evidenceIds: [...src.evidenceIds], nodeId: null, ruledOutId: null});
}
// Restoring a ruled-out cause takes it back from the causes ruled out.
function fishRestore(id) {
  const {cause} = fishFind(id), r = fishRuled(cause);
  if (!r) return;
  releaseFish(cause);
  state.ruledOut = state.ruledOut.filter(x => x !== r);
}
function deleteRuledOut(id) {
  for (const c of fishCauses()) if (c.ruledOutId === id) releaseFish(c);
  state.ruledOut = state.ruledOut.filter(r => r.id !== id);
}
// Deleting a cause deletes its sub-causes; on the chart and in the causes ruled out, they stay.
function deleteFishCause(id) {
  const {category} = fishFind(id);
  category.causes = category.causes.filter(c => c.id !== id && c.parentId !== id);
}

const solutionsOf = id => state.solutions.filter(s => s.causeIds.includes(id));
const actionsOf = id => state.actions.filter(a => a.solutionId === id);
const blankCriteria = () => Object.fromEntries(Object.keys(CRITERIA).map(k => [k, {v: '', c: ''}]));
function addSolution(causeIds = []) {
  const s = {id: uuid(), title: '', causeIds, criteria: blankCriteria(), decision: ''};
  state.solutions.push(s);
  return s;
}
function addAction(solutionId = '') {
  const a = {id: uuid(), action: '', solutionId, kind: 'corrective', strength: '', owner: '', due: '', verification: '', status: 'open', effectiveness: {date: '', result: ''}};
  state.actions.push(a);
  return a;
}
const isOverdue = a => a.due && a.due < today() && !ACTION_DONE.includes(a.status) && a.status !== 'cancelled';

// Nodes reachable from the primary effect.
function reachable(links = state.links) {
  const seen = new Set(), stack = [state.problem.primaryEffectId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of links) if (l.effectId === id) stack.push(l.causeId);
  }
  return seen;
}

// Deleting nodes also deletes the causes that only they supported. Returns their ids,
// the nodes themselves first, without changing anything.
function deletionSet(...ids) {
  ids = ids.filter(id => id !== state.problem.primaryEffectId);
  const gone = new Set(ids), remaining = state.links.filter(l => !gone.has(l.effectId) && !gone.has(l.causeId));
  const keep = reachable(remaining);
  return ids.length ? [...ids, ...state.nodes.filter(n => !gone.has(n.id) && !keep.has(n.id)).map(n => n.id)] : [];
}
function deleteNodes(ids) {
  const gone = new Set(ids);
  // A why-step on the chart keeps its words, type, and evidence when its node goes, and is no longer on the chart.
  for (const chain of state.fiveWhys) {
    if (gone.has(chain.effectId)) chain.effectId = state.problem.primaryEffectId;
    for (const step of chain.steps) {
      const n = gone.has(step.nodeId) && stepNode(step);
      if (n) Object.assign(step, {answer: n.title, kind: n.kind === 'effect' ? 'condition' : n.kind, evidenceIds: [...n.evidenceIds], nodeId: null});
    }
  }
  for (const f of state.fishbones) {
    if (gone.has(f.effectId)) f.effectId = state.problem.primaryEffectId;
    for (const c of f.categories.flatMap(g => g.causes)) if (gone.has(c.nodeId)) releaseFish(c);
  }
  // An event on the chart keeps its words, type, and evidence when its node goes.
  for (const t of state.timelines) {
    if (gone.has(t.effectId)) t.effectId = state.problem.primaryEffectId;
    for (const ev of t.phases.flatMap(p => p.events)) {
      const n = gone.has(ev.nodeId) && eventNode(ev);
      if (n) Object.assign(ev, {text: n.title, kind: ['action', 'condition'].includes(n.kind) ? n.kind : ev.kind, evidenceIds: [...n.evidenceIds], nodeId: null});
    }
  }
  state.specification.tests = state.specification.tests.filter(t => !gone.has(t.causeId));
  for (const r of state.comparison.rows) if (gone.has(r.nodeId)) r.nodeId = null;
  state.nodes = state.nodes.filter(n => !gone.has(n.id));
  state.links = state.links.filter(l => !gone.has(l.effectId) && !gone.has(l.causeId));
  for (const s of state.solutions) s.causeIds = s.causeIds.filter(id => !gone.has(id));
  for (const id of gone) collapsed.delete(id);
}
function removeLink(linkId) {
  state.links = state.links.filter(l => l.id !== linkId);
}

// Moving a cause to another effect moves the one link it is drawn along, from `fromId`; its other
// links (a shared cause) and its own causes stay as they are. The link goes last among the new
// effect's causes. Moving or reordering a cause puts it back where the layout places it.
function moveProblem(causeId, fromId, toId) {
  if (toId === fromId) return 'It is already a cause of that effect.';
  return linkProblem(toId, causeId);
}
function moveCause(causeId, fromId, toId) {
  const problem = moveProblem(causeId, fromId, toId);
  if (problem) return problem;
  const link = state.links.find(l => l.effectId === fromId && l.causeId === causeId);
  state.links.splice(state.links.indexOf(link), 1);
  link.effectId = toId;
  state.links.push(link);
  byId(causeId).offsetY = 0;
  collapsed.delete(toId);
  return null;
}
// The causes of an effect are drawn actions first, then conditions, each group in link order.
// Places the cause's link just before or after a sibling's link.
function placeCause(effectId, causeId, siblingId, after) {
  const link = state.links.find(l => l.effectId === effectId && l.causeId === causeId);
  const anchor = state.links.find(l => l.effectId === effectId && l.causeId === siblingId);
  if (!link || !anchor || link === anchor) return;
  state.links.splice(state.links.indexOf(link), 1);
  state.links.splice(state.links.indexOf(anchor) + (after ? 1 : 0), 0, link);
  byId(causeId).offsetY = 0;
}

// ---- Summaries ----
// Causes at the end of their branches, under one effect, can share one deeper cause: a summary. It is
// an ordinary cause, linked as a cause of each of them, drawn once to their right with a brace across
// them instead of a link from each. It stays drawn so while they are neighbours under one effect and
// it is their only cause; otherwise its links are drawn as a shared cause's.

// Why the causes cannot be summarised, or null when they can. Returns their effect with `effect`.
function summaryEffect(ids, prefer) {
  if (ids.length < 2 || ids.includes(state.problem.primaryEffectId)) return null;
  const common = ids.map(id => new Set(effectLinks(id).map(l => l.effectId))).reduce((a, b) => new Set([...a].filter(id => b.has(id))));
  return common.has(prefer) ? prefer : [...common][0] ?? null;
}
function summaryProblem(ids, prefer) {
  if (ids.length < 2) return 'Select two or more causes to summarise: drag a box around them.';
  if (ids.includes(state.problem.primaryEffectId)) return 'The primary effect cannot be summarised.';
  if (ids.some(id => causeLinks(id).length)) return 'Only causes at the end of a branch can be summarised: these have causes of their own.';
  return summaryEffect(ids, prefer) ? null : 'Only causes of the same effect can be summarised.';
}
// The new cause goes under each of them. Their links are put together, where the first of them is.
function summariseCauses(ids, effectId) {
  const members = new Set(ids), links = state.links.filter(l => l.effectId === effectId && members.has(l.causeId));
  const at = state.links.indexOf(links[0]);
  state.links = state.links.filter(l => !links.includes(l));
  state.links.splice(at, 0, ...links);
  const n = {...blankNode('cause', 'New cause'), summary: true};
  state.nodes.push(n);
  for (const l of links) { addLink(l.causeId, n.id); byId(l.causeId).offsetY = 0; collapsed.delete(l.causeId); }
  return n;
}

// Expands every collapsed branch that hides the node. Returns whether anything changed.
function reveal(id) {
  const hiding = [...collapsed].filter(c => c !== id && reaches(c, id));
  hiding.forEach(c => collapsed.delete(c));
  return hiding.length > 0;
}

// Causes reorder among the siblings of their group: in Apollo, the same kind; in a cause tree, all.
const sameGroup = (a, b) => treeStyle() || a.kind === b.kind;

// ---- Chart style ----
// Moving an RCA to the other style keeps everything. A cause's status and Apollo's unverified flag
// are carried across; what the new style still needs shows up as rule issues.
function convertStyle(style) {
  for (const n of state.nodes) {
    if (!isCause(n)) continue;
    if (style === 'tree') { if (n.status !== 'ruled-out') n.status = n.unverified || !hasEvidence(n) ? 'possible' : 'confirmed'; }
    else n.unverified = n.status === 'possible';
  }
  state.meta.style = style;
}
// The rule issues the RCA would have in the other style, without changing it.
function issuesAfterSwitch(style) {
  const current = state;
  state = JSON.parse(JSON.stringify(state));
  try { convertStyle(style); return chartIssues(); } finally { state = current; }
}

// ---- Is / Is Not ----
// The problem is specified on four dimensions, each fact on two sides: what the problem is, and what
// it could be but is not. Each candidate cause is then tested against every fact: does it explain why
// the problem is here and not there? A fact is a question with either side answered.

const specRow = id => state.specification.rows.find(r => r.id === id);
const specFacts = () => state.specification.rows.filter(r => r.is.trim() || r.isNot.trim());
const specLabel = r => `${SPEC_DIMS[r.dim]} ${state.specification.rows.filter(x => x.dim === r.dim).indexOf(r) + 1}`;
const specTest = id => state.specification.tests.find(t => t.causeId === id);
function specResult(test) {
  const facts = specFacts(), mark = r => test.marks[r.id] || '';
  return {facts, no: facts.filter(r => mark(r) === 'no'), only: facts.filter(r => mark(r) === 'if'), open: facts.filter(r => !mark(r))};
}
const specSummary = res => res.no.length ? `Fails ${plural(res.no.length, 'fact')}`
  : res.open.length ? `${plural(res.open.length, 'fact')} to judge` : res.only.length ? `Explains all, on ${plural(res.only.length, 'assumption')}` : 'Explains every fact';

// ---- Failed vs good ----
// The failed case beside two that did not fail: the same machine before, a twin on the same duty, or a
// similar one elsewhere. For each factor: does it differ, and could the difference explain the failure?
// What is the same in every case cannot explain why only this one failed. A row made from the equipment
// record shows and edits that field for the failed case, so the two always agree. A row can go to the
// chart as a cause, to the Is / Is Not as a distinction or a change, and to the sequence of events.
// Optional: an RCA with no comparable case leaves it empty, and nothing asks for it.

const blankCompareRow = (cat, factor = '', field = '') => ({id: uuid(), cat, factor, field, failed: '', good: ['', ''], differs: '', explains: '',
  evidenceIds: [], eventId: '', when: '', nodeId: null, specRowId: ''});
const compareRow = id => state.comparison.rows.find(r => r.id === id);
const compareFailed = r => r.field ? state.equipment[r.field] ?? '' : r.failed;
const compareExplains = r => r.explains === 'yes' || r.explains === 'partly';
const compareDiffs = () => state.comparison.rows.filter(r => r.differs === 'differs');
const compareNode = r => r.nodeId ? byId(r.nodeId) : null;
const compareEvent = r => r.eventId ? eventFind(r.eventId)?.event ?? null : null;
const compareCaseName = i => state.comparison.cases[i].name.trim() || ['Failed case', 'Good case 1', 'Good case 2'][i];
// The words a row takes to the chart, the timeline, and the Is / Is Not.
const compareText = r => [r.factor.trim(), compareFailed(r).trim()].filter(Boolean).join(': ') || 'Untitled factor';
// When the change happened: its event's time, or the words written.
const compareWhen = r => { const ev = compareEvent(r); return ev ? [ev.start, ev.end].filter(Boolean).map(v => v.replace('T', ' ')).join(' to ') : r.when; };

// A new row goes after the last of its category, or of the categories before it.
function compareInsert(r) {
  const rows = state.comparison.rows, rank = cat => COMPARE_CATEGORIES.indexOf(cat);
  rows.splice(rows.findLastIndex(x => rank(x.cat) <= rank(r.cat)) + 1, 0, r);
  return r;
}
// The filled equipment fields that have no row yet, under the category of their section.
const compareNewFields = () => EQUIPMENT_SECTIONS.filter(sec => COMPARE_CATEGORIES.includes(sec.title)).flatMap(sec => sec.fields
  .filter(([key]) => state.equipment[key]?.trim() && !state.comparison.rows.some(r => r.field === key)).map(([key, label]) => ({cat: sec.title, key, label})));
// Starting, or bringing in fields filled since, adds a row for each; the failed case is named after the equipment.
function compareFromEquipment() {
  const fields = compareNewFields(), c = state.comparison;
  for (const f of fields) compareInsert(blankCompareRow(f.cat, f.label, f.key));
  if (!c.rows.length) compareInsert(blankCompareRow(COMPARE_CATEGORIES[0]));
  if (!c.cases[0].name.trim() && state.meta.equipmentTag.trim()) c.cases[0].name = state.meta.equipmentTag.trim();
  return fields.length;
}
const addCompareRow = cat => compareInsert(blankCompareRow(cat));
// A difference goes on the chart under the primary effect, as a possible cause with the row's evidence.
function compareToChart(id) {
  const r = compareRow(id);
  if (compareNode(r)) return;
  const n = addCause(state.problem.primaryEffectId, 'condition', compareText(r));
  n.evidenceIds = [...r.evidenceIds];
  r.nodeId = n.id;
}
// Into a question of the Is / Is Not: what changed, when the row says when; otherwise what is distinctive.
function compareToSpec(id, specId) {
  const r = compareRow(id), row = specRow(specId), field = compareWhen(r).trim() ? 'change' : 'distinction';
  const good = r.good.map(g => g.trim()).filter(Boolean);
  const line = compareText(r) + (good.length ? ` (good cases: ${good.join('; ')})` : '');
  row[field] = row[field].trim() ? `${row[field].trim()}\n${line}` : line;
  r.specRowId = specId;
  return field;
}
// A change becomes a deviation on the timeline, at the time written when it reads as one.
function compareTime(when) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/.exec(when.trim());
  return m ? `${m[1]}T${m[2] || '00:00'}` : '';
}
function compareToTimeline(id, phaseId) {
  const r = compareRow(id), ev = {...blankEvent(compareTime(r.when)), text: compareText(r), deviation: true, evidenceIds: [...r.evidenceIds]};
  timelinePhase(phaseId).events.push(ev);
  r.eventId = ev.id;
  return ev;
}

// ---- Rule checks ----
// A node is an effect when something is charted as its cause. Each effect needs at least one
// action and one condition; each cause needs evidence; each branch ends in a stop point.

const isCause = n => n.kind !== 'effect';
const hasEvidence = n => n.evidenceIds.some(evidenceById);
// The "?" on a cause: in Apollo, unverified or without evidence; in a cause tree, not yet ruled out and without evidence.
const needsEvidence = n => treeStyle() ? n.status !== 'ruled-out' && !hasEvidence(n) : n.unverified || !hasEvidence(n);
const isRuledOut = n => treeStyle() && isCause(n) && n.status === 'ruled-out';
// In a cause tree, the ruled-out causes on the tree; they are listed with the causes ruled out.
const treeRuledOut = () => state.nodes.filter(isRuledOut);
// The palette entry a node is drawn with.
const nodeLook = n => n.id === state.problem.primaryEffectId || n.kind === 'effect' ? 'effect'
  : treeStyle() ? (n.status === 'ruled-out' ? 'ruled' : n.status) : n.kind;

// Every rule issue: the chart's, by its style, and the records'. A node's issue has a nodeId; a
// record's has the record page, the row's id, and a title.
function ruleIssues() {
  return [...chartIssues(), ...recordIssues()];
}
function chartIssues() {
  return [...(treeStyle() ? treeIssues() : apolloIssues()), ...causeIssues()];
}

// A cause that ends at a person's error says what happened, not why it could. Matched on the title.
const HUMAN_ERROR = /\b(human|operator|personnel|technician|mechanic|fitter|crew)\s+(error|mistake|fault|slip)|\bcareless|\bnegligen|\binattent|\b(did ?n[o']t|failed to|not) follow(ed|ing)?\b/i;
const solutionsFor = id => state.solutions.filter(s => s.causeIds.includes(id) && s.decision !== 'reject');

// In both styles: what good practice asks of a cause beyond its style's rules.
function causeIssues() {
  const issues = [], live = reachable(), tree = treeStyle();
  for (const n of state.nodes) {
    if (!live.has(n.id) || !isCause(n)) continue;
    const ruled = tree && n.status === 'ruled-out';
    if (!ruled && !causesOf(n.id).length && HUMAN_ERROR.test(n.title)) issues.push({nodeId: n.id, level: 'warning', code: 'human-error',
      text: 'Ends at a human error: ask why the error was possible (procedure, training, design, workload)'});
    if (ruled && !n.test.trim() && !hasEvidence(n)) issues.push({nodeId: n.id, level: 'warning', code: 'ruled-basis',
      text: 'Ruled out without a reason: write how it was ruled out, or cite the evidence'});
    if (tree && n.status === 'confirmed' && n.evidenceIds.filter(evidenceById).length === 1) issues.push({nodeId: n.id, level: 'info', code: 'one-evidence',
      text: 'Confirmed on one evidence item: a second, independent one makes it firm'});
    if (!ruled && !solutionsFor(n.id).length) {
      if (n.stopPoint?.reason === 'solution-found') issues.push({nodeId: n.id, level: 'warning', code: 'no-solution',
        text: 'Its stop point says a solution was found, but no solution attacks it'});
      else if (n.controllable) issues.push({nodeId: n.id, level: 'info', code: 'no-solution', text: 'Controllable, but no solution attacks it yet'});
    }
  }
  // A cause that fails a fact of the Is / Is Not cannot be the cause, or the fact is wrong.
  for (const t of state.specification.tests) {
    const n = byId(t.causeId), fails = n && live.has(n.id) && !(tree && n.status === 'ruled-out') ? specResult(t).no : [];
    if (fails.length) issues.push({nodeId: n.id, level: 'warning', code: 'spec-fails',
      text: `Does not explain ${fails.map(specLabel).join(', ')} of the Is / Is Not: rule it out, or check the fact`});
  }
  // Once root causes are typed, the 8D questions not yet answered.
  const typed = new Set(state.nodes.filter(n => live.has(n.id) && isCause(n) && !(tree && n.status === 'ruled-out')).map(n => n.causeType));
  if (typed.size > (typed.has('') ? 1 : 0)) for (const t of ['escape', 'systemic']) if (!typed.has(t))
    issues.push({nodeId: state.problem.primaryEffectId, level: 'info', code: 'cause-types', text: CAUSE_TYPES[t].missing});
  return issues;
}

// What stands in the way of closing the RCA: every corrective and preventive action validated by its
// effectiveness check, with the result recorded.
function closeBlockers() {
  const live = state.actions.filter(a => a.status !== 'cancelled' && a.kind !== 'containment');
  const open = live.filter(a => a.status !== 'validated').length, bare = live.filter(a => a.status === 'validated' && !a.effectiveness.result.trim()).length;
  return [!live.length && 'No corrective or preventive action in the plan', open && `${plural(open, 'action')} not validated by an effectiveness check`,
    bare && `${plural(bare, 'validated action')} without an effectiveness result`].filter(Boolean);
}

const WEAK_WORDS = /\b(re-?train(ing)?|training|brief(ing)?|remind(er)?|awareness|toolbox talk|be (more )?careful)\b/i;

// The records: a ruled-out cause needs its reason, a solution its causes and actions, and an action
// a planned effectiveness check, with its result once the date has passed.
function recordIssues() {
  const issues = [], add = (record, id, title, level, code, text) => issues.push({record, id, title, level, code, text});
  for (const r of state.ruledOut) if (!r.test.trim() && !r.evidenceIds.some(evidenceById)) add('ruledOut', r.id, r.cause || 'Untitled cause', 'warning', 'ruled-basis',
    'Ruled out without a reason: write the evidence or test that ruled it out');
  if (state.meta.status === 'closed') for (const b of closeBlockers()) add('team', 'status', 'RCA status', 'warning', 'closed-open', `Closed, but: ${b}`);
  // Thin IS NOT data is the most common weakness of a problem specification.
  const stated = state.specification.rows.filter(r => r.is.trim()), bare = stated.filter(r => !r.isNot.trim());
  if (stated.length >= 3 && bare.length * 2 > stated.length) add('spec', bare[0].id, 'Is / Is Not', 'info', 'spec-thin',
    `${plural(bare.length, 'fact')} without an IS NOT: for each, say where, when, or what the problem could be but is not`);
  for (const s of state.solutions) {
    const title = s.title || 'Untitled solution', actions = actionsOf(s.id).filter(a => a.status !== 'cancelled' && a.kind !== 'containment');
    if (s.decision !== 'reject' && !s.causeIds.some(byId)) add('solutions', s.id, title, 'warning', 'solution-cause', 'Attacks no cause: link the causes it removes');
    if (s.decision === 'implement' && !actionsOf(s.id).length) add('solutions', s.id, title, 'warning', 'solution-actions', 'To implement, but no action in the plan');
    if (s.decision !== 'reject' && actions.length && actions.every(a => a.strength === 'weak')) add('solutions', s.id, title, 'warning', 'weak-actions',
      'Only weak actions (training, procedures, warnings): add a stronger one that does not rely on people remembering');
  }
  for (const a of state.actions) {
    if (a.status === 'cancelled') continue;
    const title = a.action || 'Untitled action', check = a.effectiveness;
    if (!check.date) add('actions', a.id, title, ACTION_DONE.includes(a.status) ? 'warning' : 'info', 'effect-date', 'No effectiveness check planned: set a date to check that it worked');
    else if (check.date < today() && !check.result.trim()) add('actions', a.id, title, 'warning', 'effect-due', 'The effectiveness check is due: record the result');
    if (a.status === 'validated' && !check.result.trim()) add('actions', a.id, title, 'warning', 'validated', 'Validated, but no effectiveness result: record what showed that it worked');
    if (!a.strength && a.kind !== 'containment' && WEAK_WORDS.test(a.action)) add('actions', a.id, title, 'info', 'strength', 'Training or a reminder is a weak action: rate its strength, and look for a stronger one');
  }
  return issues;
}

// A cause tree: each confirmed cause needs evidence, each possible cause a test, and each confirmed
// branch a stop point. Ruled-out causes need nothing more, unless one of their causes is confirmed.
function treeIssues() {
  const issues = [], live = reachable();
  for (const n of state.nodes) {
    if (!live.has(n.id) || !isCause(n)) continue;
    if (n.status === 'confirmed' && !hasEvidence(n)) issues.push({nodeId: n.id, level: 'error', code: 'evidence', text: 'Confirmed without evidence'});
    // A confirmed cause happened, so its effects did too.
    const confirmedCause = causesOf(n.id).find(c => c.status === 'confirmed');
    if (n.status === 'possible') issues.push({nodeId: n.id, level: 'warning', code: 'untested', text: confirmedCause ? `Its cause "${confirmedCause.title}" is confirmed: confirm this too`
      : hasEvidence(n) ? 'Not confirmed or ruled out yet' : 'Not tested yet: no evidence'});
    if (n.status === 'ruled-out' && confirmedCause) issues.push({nodeId: n.id, level: 'error', code: 'contradiction',
      text: `Ruled out, but its cause "${confirmedCause.title}" is confirmed`});
    if (n.status === 'confirmed' && !causesOf(n.id).some(c => c.status !== 'ruled-out') && !n.stopPoint) issues.push({nodeId: n.id, level: 'info', code: 'open-branch',
      text: 'Confirmed branch ends without a stop point'});
  }
  return issues;
}

function apolloIssues() {
  const issues = [];
  const live = reachable();
  for (const n of state.nodes) {
    if (!live.has(n.id)) continue;
    if (n.kind === 'cause') issues.push({nodeId: n.id, level: 'error', code: 'type', text: 'Choose a type: action or condition'});
    if (isCause(n) && n.status === 'ruled-out') issues.push({nodeId: n.id, level: 'error', code: 'ruled',
      text: 'Ruled out in the cause tree: move it to the causes ruled out (Rule out)'});
    const causes = causesOf(n.id);
    const isEffect = causes.length > 0 || n.kind === 'effect';
    if (isEffect) {
      const missing = ['action', 'condition'].filter(kind => !causes.some(c => c.kind === kind));
      if (missing.length) issues.push({nodeId: n.id, level: 'error', code: 'causal-set',
        text: `Needs ${missing.length === 2 ? 'an action and a condition' : missing[0] === 'action' ? 'an action' : 'a condition'} cause`});
    }
    if (isCause(n) && needsEvidence(n)) issues.push({nodeId: n.id, level: 'warning', code: 'evidence',
      text: n.unverified ? 'Marked unverified' : 'No evidence linked'});
    if (isCause(n) && !causes.length && !n.stopPoint) issues.push({nodeId: n.id, level: 'info', code: 'open-branch',
      text: 'Branch ends without a stop point'});
  }
  return issues;
}

// DFMEA: a design FMEA, a module of its own beside the RCA. It shares the app's shell (top bar, files,
// themes, issues list, reports) and none of the RCA's data.
// The analysis is a tree of seven fixed levels, from the project down to the causes. Each path from
// the project to a node without children is a branch; one that ends at a cause has a branch ID and is
// scored by the DFMEA's method.

const DFMEA_TYPE = 'causeway-dfmea';
const DFMEA_SCHEMA = 1;
const DFMEA_STORAGE_KEY = 'causeway-dfmea-v1';
const MODULE_KEY = 'causeway-module';
const DFMEA_LEVELS = ['Project', 'Product / model', 'Component / feature', 'Function / requirement', 'Failure mode', 'Effect', 'Cause'];
const CAUSE_LEVEL = DFMEA_LEVELS.length - 1;
// Each method's ratings, 1 to 10: [key, name, column heading].
const DFMEA_METHODS = {
  rpn: {name: 'RPN with limit', short: 'RPN',
    about: 'RPN = Detection × max(Safety, Environment, Others) × POF, each 1 to 10. A branch above the limit needs action; equal to it is acceptable.',
    ratings: [['d', 'Detection', 'D'], ['saf', 'Safety', 'Saf.'], ['env', 'Environment', 'Env.'], ['oth', 'Others', 'Oth.'], ['pof', 'Probability of failure', 'POF']]},
  ap: {name: 'AIAG-VDA Action Priority', short: 'AP',
    about: 'Severity, Occurrence, and Detection, each 1 to 10, give an Action Priority from the AIAG-VDA DFMEA table: High, act to lower it; Medium, act or justify why not; Low, action optional.',
    ratings: [['s', 'Severity', 'S'], ['o', 'Occurrence', 'O'], ['d', 'Detection', 'D']]},
};
const AP_NAMES = {H: 'High', M: 'Medium', L: 'Low'};
const DFMEA_ACTION_STATUS = {open: 'Open', progress: 'In progress', done: 'Done', cancelled: 'Cancelled'};
const DFMEA_BRANCH_TYPE = 'causeway-dfmea-branch';

// ---- The document ----

const blankRatings = () => Object.fromEntries(Object.entries(DFMEA_METHODS).map(([m, x]) => [m, Object.fromEntries(x.ratings.map(([k]) => [k, null]))]));
// A node; a cause also carries its branch ID, its controls, and its ratings in both methods, so that
// changing the method loses nothing. justification: why a Medium priority has no action.
const dfmeaNode = (title, children = []) => ({id: uuid(), title, notes: '', children});
const dfmeaCause = (branch, title) => ({...dfmeaNode(title), branch, prevention: '', detection: '', ratings: blankRatings(), justification: ''});

function blankDfmea(method = 'rpn') {
  return {
    type: DFMEA_TYPE, schemaVersion: DFMEA_SCHEMA, id: uuid(),
    meta: {number: '', revision: '', date: today(), team: '', scope: '', method, limit: 100},
    root: dfmeaNode('Describe the project'), actions: [], counters: {branch: 1},
  };
}
const blankDfmeaAction = causeId => ({id: uuid(), causeId, title: '', owner: '', status: 'open', start: today(), target: '', after: blankRatings(), notes: []});

let dfmea = blankDfmea();

// ---- The tree ----

// Visits every node, with its depth and the nodes above it.
function dfmeaWalk(fn, n = dfmea.root, depth = 0, path = []) {
  fn(n, depth, path);
  for (const k of n.children) dfmeaWalk(fn, k, depth + 1, [...path, n]);
}
function dfmeaFind(id) {
  let found = null;
  dfmeaWalk((n, depth, path) => { if (n.id === id) found = {n, depth, path}; });
  return found;
}
const dfmeaCauses = () => { const list = []; dfmeaWalk((n, d) => { if (d === CAUSE_LEVEL) list.push(n); }); return list; };
const dfmeaCauseById = id => dfmeaCauses().find(c => c.id === id);
// Every branch: {leaf, depth, path (from the project to the leaf)}. A branch that stops above the
// causes is incomplete. A project with nothing under it has none.
function dfmeaBranches() {
  const list = [];
  dfmeaWalk((n, depth, path) => { if (!n.children.length && depth > 0) list.push({leaf: n, depth, path: [...path, n]}); });
  return list;
}
const nextBranchId = () => `B-${String(dfmea.counters.branch++).padStart(2, '0')}`;

// A new node one level below `parent`, at `index` among its children (last by default).
function dfmeaAdd(parent, depth, index = parent.children.length) {
  const n = depth === CAUSE_LEVEL ? dfmeaCause(nextBranchId(), 'New cause') : dfmeaNode(`New ${DFMEA_LEVELS[depth].toLowerCase()}`);
  parent.children.splice(index, 0, n);
  return n;
}
// Deleting a node deletes what is under it, and the actions of its causes.
function dfmeaDelete(id) {
  const f = dfmeaFind(id);
  if (!f?.path.length) return;
  const gone = new Set();
  dfmeaWalk(n => gone.add(n.id), f.n);
  const parent = f.path.at(-1);
  parent.children.splice(parent.children.indexOf(f.n), 1);
  dfmea.actions = dfmea.actions.filter(a => !gone.has(a.causeId));
}
const subtreeSize = n => { let count = 0; dfmeaWalk(() => count++, n); return count; };
const dfmeaActionsOf = causeId => dfmea.actions.filter(a => a.causeId === causeId);

// ---- Scoring ----
// RPN with limit: Detection × max(Safety, Environment, Others) × POF.
// AIAG-VDA (2019) DFMEA Action Priority: rows by severity band and occurrence (8–10, 6–7, 4–5, 2–3,
// 1); in each, the priority for detection 7–10, 5–6, 2–4, and 1.
const AP_TABLE = {
  9: ['HHHH', 'HHHH', 'HHHM', 'HMLL', 'LLLL'],
  7: ['HHHH', 'HHHM', 'HMMM', 'MMLL', 'LLLL'],
  4: ['HHMM', 'MMML', 'MLLL', 'LLLL', 'LLLL'],
  2: ['MMLL', 'LLLL', 'LLLL', 'LLLL', 'LLLL'],
};
function actionPriority({s, o, d}) {
  if (s <= 1) return 'L';
  const rows = AP_TABLE[s >= 9 ? 9 : s >= 7 ? 7 : s >= 4 ? 4 : 2];
  return rows[o >= 8 ? 0 : o >= 6 ? 1 : o >= 4 ? 2 : o >= 2 ? 3 : 4][d >= 7 ? 0 : d >= 5 ? 1 : d >= 2 ? 2 : 3];
}
const rated = r => Object.values(r).every(v => Number.isInteger(v));
// A branch's score: {value, level: 'high' | 'medium' | 'low', needs (asks for action)}, or null while
// a rating is missing.
function scoreRatings(r, method = dfmea.meta.method) {
  if (!rated(r)) return null;
  if (method === 'rpn') {
    const value = r.d * Math.max(r.saf, r.env, r.oth) * r.pof, over = value > dfmea.meta.limit;
    return {value, level: over ? 'high' : 'low', needs: over};
  }
  const value = actionPriority(r);
  return {value, level: {H: 'high', M: 'medium', L: 'low'}[value], needs: value !== 'L'};
}
const dfmeaScore = (c, method = dfmea.meta.method) => scoreRatings(c.ratings[method], method);
// The ratings each action is expected to reach lower the branch's; all its actions count, whatever
// their status, except cancelled ones.
function dfmeaAfterRatings(c, method = dfmea.meta.method) {
  const r = {...c.ratings[method]};
  for (const a of dfmeaActionsOf(c.id)) if (a.status !== 'cancelled')
    for (const [k, v] of Object.entries(a.after[method])) if (Number.isInteger(v) && Number.isInteger(r[k])) r[k] = Math.min(r[k], v);
  return r;
}
const dfmeaAfter = (c, method = dfmea.meta.method) => scoreRatings(dfmeaAfterRatings(c, method), method);
const liveActions = c => dfmeaActionsOf(c.id).filter(a => a.status !== 'cancelled');
// A Medium priority needs no action when the team writes why; anything else that asks for action needs it.
const justified = c => dfmea.meta.method === 'ap' && dfmeaScore(c)?.value === 'M' && c.justification.trim() !== '';
const dfmeaNeedsAction = c => !!dfmeaScore(c)?.needs && !justified(c);

// ---- ISO weeks, for the action tracker ----
// Monday to Sunday; week 1 holds the year's first Thursday.
function isoWeek(date) {
  const d = new Date(date + 'T00:00:00Z');
  if (isNaN(d)) return null;
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear(), first = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d - first) / 864e5 - 3 + (first.getUTCDay() + 6) % 7) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
// The weeks from the one holding `start` to the one holding `end`, inclusive, at most a year.
function isoWeeks(start, end) {
  const from = new Date(start + 'T00:00:00Z'), to = new Date(end + 'T00:00:00Z'), weeks = [];
  if (isNaN(from) || isNaN(to) || to < from) return weeks;
  from.setUTCDate(from.getUTCDate() - (from.getUTCDay() + 6) % 7);
  for (let d = from; d <= to && weeks.length < 54; d = new Date(d.getTime() + 7 * 864e5)) weeks.push(isoWeek(d.toISOString().slice(0, 10)));
  return weeks;
}

// ---- Rule checks ----
// What the DFMEA still needs. A node's issue has nodeId; an action's has actionId.
function dfmeaIssues() {
  const issues = [], method = dfmea.meta.method;
  for (const b of dfmeaBranches()) if (b.depth < CAUSE_LEVEL) issues.push({nodeId: b.leaf.id, level: 'info', code: 'incomplete',
    title: b.leaf.title, text: `Branch ends at a ${DFMEA_LEVELS[b.depth].toLowerCase()}: add its ${DFMEA_LEVELS[b.depth + 1].toLowerCase()} (Tab)`});
  for (const c of dfmeaCauses()) {
    const score = dfmeaScore(c), acts = liveActions(c);
    if (!score) { issues.push({nodeId: c.id, level: 'warning', code: 'unrated', title: `${c.branch} ${c.title}`, text: `Not rated yet: give it every ${DFMEA_METHODS[method].short} rating`}); continue; }
    if (dfmeaNeedsAction(c) && !acts.length) issues.push({nodeId: c.id, level: score.level === 'high' ? 'warning' : 'info', code: 'no-action',
      title: `${c.branch} ${c.title}`, text: method === 'rpn' ? `RPN ${score.value} is above the limit of ${dfmea.meta.limit}, and no action lowers it`
        : score.value === 'H' ? 'Action priority High, and no action lowers it' : 'Action priority Medium: add an action, or write why none is needed'});
    else if (score.needs && acts.length && dfmeaAfter(c)?.needs && dfmeaAfter(c).level === 'high') issues.push({nodeId: c.id, level: 'info', code: 'still-high',
      title: `${c.branch} ${c.title}`, text: `Still ${method === 'rpn' ? 'above the limit' : 'High'} after its actions: add a stronger one`});
  }
  for (const a of dfmea.actions) {
    if (a.status === 'done' || a.status === 'cancelled') continue;
    const c = dfmeaCauseById(a.causeId), title = a.title.trim() || 'Untitled action';
    if (a.target && a.target < today()) issues.push({actionId: a.id, level: 'warning', code: 'overdue', title, text: `Overdue: its target was ${a.target}`});
    else if (!a.owner.trim() || !a.target) issues.push({actionId: a.id, level: 'info', code: 'owner', title, text: `${c?.branch || ''} ${!a.owner.trim() ? 'No assignee' : 'No target date'} yet`.trim()});
  }
  return issues;
}

// ---- Files ----

const intRating = v => Number.isInteger(v) && v >= 1 && v <= 10 ? v : null;
const cleanRatings = r => Object.fromEntries(Object.entries(DFMEA_METHODS).map(([m, x]) => [m, Object.fromEntries(x.ratings.map(([k]) => [k, intRating(r?.[m]?.[k])]))]));
const dfText = v => typeof v === 'string' ? v : '';

// Checks a DFMEA file and fills in what it leaves out. Nodes deeper than the causes are dropped; a
// cause without a branch ID is given one; actions of missing causes are dropped.
function normalizeDfmea(p) {
  if (p?.type !== DFMEA_TYPE) throw Error('This is not a Causeway DFMEA file.');
  if (!Number.isInteger(p.schemaVersion) || p.schemaVersion > DFMEA_SCHEMA) throw Error(`File format version ${p.schemaVersion} is newer than this tool understands (${DFMEA_SCHEMA}).`);
  if (!p.root || typeof p.root !== 'object') throw Error('The file has no DFMEA tree.');
  const blank = blankDfmea(), seen = new Set(), branches = new Set();
  const d = {...blank, id: dfText(p.id) || uuid(), meta: {...blank.meta}, counters: {branch: Number.isInteger(p.counters?.branch) && p.counters.branch > 0 ? p.counters.branch : 1}};
  for (const k of ['number', 'revision', 'date', 'team', 'scope']) d.meta[k] = dfText(p.meta?.[k]);
  d.meta.method = p.meta?.method in DFMEA_METHODS ? p.meta.method : 'rpn';
  d.meta.limit = Number.isInteger(p.meta?.limit) && p.meta.limit >= 1 && p.meta.limit <= 1000 ? p.meta.limit : 100;
  const node = (x, depth) => {
    const id = dfText(x?.id) && !seen.has(x.id) ? x.id : uuid();
    seen.add(id);
    const n = {id, title: dfText(x?.title), notes: dfText(x?.notes), children: depth < CAUSE_LEVEL && Array.isArray(x?.children) ? x.children.filter(k => k && typeof k === 'object').map(k => node(k, depth + 1)) : []};
    if (depth === CAUSE_LEVEL) Object.assign(n, {branch: dfText(x.branch), prevention: dfText(x.prevention), detection: dfText(x.detection), ratings: cleanRatings(x.ratings), justification: dfText(x.justification)});
    return n;
  };
  d.root = node(p.root, 0);
  dfmeaWalk((n, depth) => {
    if (depth !== CAUSE_LEVEL) return;
    if (!/^B-\d+$/.test(n.branch) || branches.has(n.branch)) n.branch = '';
    branches.add(n.branch);
    d.counters.branch = Math.max(d.counters.branch, (+n.branch.slice(2) || 0) + 1);
  }, d.root);
  const previous = dfmea;
  dfmea = d;
  try {
    for (const c of dfmeaCauses()) if (!c.branch) c.branch = nextBranchId();
    const causes = new Set(dfmeaCauses().map(c => c.id));
    d.actions = (Array.isArray(p.actions) ? p.actions : []).filter(a => a?.id && causes.has(a.causeId)).map(a => ({
      id: a.id, causeId: a.causeId, title: dfText(a.title), owner: dfText(a.owner), status: a.status in DFMEA_ACTION_STATUS ? a.status : 'open',
      start: dfText(a.start), target: dfText(a.target), after: cleanRatings(a.after),
      notes: (Array.isArray(a.notes) ? a.notes : []).filter(x => /^\d{4}-W\d{2}$/.test(x?.week)).map(x => ({week: x.week, text: dfText(x.text)}))}));
  } finally { dfmea = previous; }
  return d;
}

// ---- Copying branches ----
// On the clipboard: {type: DFMEA_BRANCH_TYPE, depth, node}. A copy gets new ids and branch IDs; the
// actions stay behind with the causes they belong to.
function dfmeaCopyData(id) {
  const f = dfmeaFind(id);
  return f && {type: DFMEA_BRANCH_TYPE, depth: f.depth, node: JSON.parse(JSON.stringify(f.n))};
}
function dfmeaText(n, depth = 0) {
  return '  '.repeat(depth) + n.title.replace(/\s*\n\s*/g, ' ') + '\n' + n.children.map(k => dfmeaText(k, depth + 1)).join('');
}
// Pastes beside the selected node when the copy is of its level, under it when one level below. Plain
// text becomes the selected node's children, one per line. Returns the first node added, or a reason.
function dfmeaPaste(data, textData, selectedId) {
  const f = dfmeaFind(selectedId);
  if (!f) return 'Select where to paste.';
  const copy = (x, depth) => {
    const n = depth === CAUSE_LEVEL ? {...dfmeaCause(nextBranchId(), dfText(x.title)), prevention: dfText(x.prevention), detection: dfText(x.detection), ratings: cleanRatings(x.ratings), justification: dfText(x.justification)}
      : dfmeaNode(dfText(x.title));
    n.notes = dfText(x.notes);
    if (depth < CAUSE_LEVEL && Array.isArray(x.children)) n.children = x.children.filter(k => k && typeof k === 'object').map(k => copy(k, depth + 1));
    return n;
  };
  if (data?.type === DFMEA_BRANCH_TYPE && Number.isInteger(data.depth) && data.node) {
    if (data.depth === f.depth + 1) { const n = copy(data.node, data.depth); f.n.children.push(n); return n; }
    if (data.depth === f.depth && f.path.length) { const n = copy(data.node, data.depth), parent = f.path.at(-1); parent.children.splice(parent.children.indexOf(f.n) + 1, 0, n); return n; }
    return `A copied ${DFMEA_LEVELS[data.depth].toLowerCase()} pastes beside a ${DFMEA_LEVELS[data.depth].toLowerCase()}, or under a ${DFMEA_LEVELS[data.depth - 1]?.toLowerCase() ?? 'node'}.`;
  }
  const lines = (textData || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return 'Nothing to paste.';
  if (f.depth === CAUSE_LEVEL) return 'A cause has no level below it to paste into.';
  const added = lines.map(l => { const n = dfmeaAdd(f.n, f.depth + 1); n.title = l; return n; });
  return added[0];
}

// ---- Example ----
// A cartridge seal under design, with a branch above the limit in each method. People and dates are invented.
function exampleDfmea() {
  const d = blankDfmea('rpn');
  Object.assign(d.meta, {number: 'DFMEA-SEAL-03', revision: 'C', team: 'S. Varga (lead), L. Moreau, R. Haddad, K. Osei',
    scope: 'CS-50 single cartridge seal, 50 mm, for refinery hydrocarbon service up to 40 bar and 180 °C. Excludes the pump and the seal support system beyond the gland.'});
  const previous = dfmea;
  dfmea = d;
  try {
    const n = (title, ...children) => dfmeaNode(title, children);
    const c = (title, prevention, detection, rpn, ap) => {
      const x = dfmeaCause(nextBranchId(), title);
      Object.assign(x, {prevention, detection});
      x.ratings.rpn = {d: rpn[0], saf: rpn[1], env: rpn[2], oth: rpn[3], pof: rpn[4]};
      x.ratings.ap = {s: ap[0], o: ap[1], d: ap[2]};
      return x;
    };
    const vp = c('Low vapour-pressure margin at duty', 'Selection per supplier datasheet', 'None before failure', [6, 4, 6, 7, 4], [8, 6, 6]);
    const balance = c('Balance ratio too high for the duty', 'Balance ratio 0.75–0.85 design rule', 'Design review', [5, 4, 6, 7, 2], [8, 3, 5]);
    const seat = c('Seat too thin for 40 bar', 'FEA of the seat', 'Static pressure test', [4, 4, 5, 7, 2], [8, 2, 4]);
    const solids = c('Orifice blocked by solids in the product', 'Orifice sized to API 682', 'Local flow indicator', [3, 4, 6, 7, 5], [8, 5, 3]);
    const small = c('Orifice undersized for the heat load', 'Flush flow calculation', 'Seal chamber temperature', [6, 4, 6, 7, 2], [8, 3, 6]);
    const elastomer = c('Elastomer not compatible with the product', 'Compatibility chart', 'None before failure', [7, 6, 7, 6, 3], [9, 3, 7]);
    const springs = c('Springs in contact with product solids', 'Springs outside the product', 'Start-up leak check', [5, 4, 5, 6, 3], [7, 4, 5]);
    d.root = n('CS-50 cartridge seal redesign',
      n('CS-50 single cartridge seal, 50 mm',
        n('Seal faces (carbon / SiC)',
          n('Keep a stable liquid film between the faces', n('Film flashes to vapour', n('Faces run dry; leakage above 1 ml/min', vp, balance))),
          n('Seal against 40 bar process pressure', n('Faces distort under pressure', n('Leakage above 1 ml/min', seat)))),
        n('Plan 11 flush connection',
          n('Deliver flush flow to the seal chamber', n('Flush flow lost', n('Faces run hot and dry', solids, small)))),
        n('Secondary seals (O-rings)',
          n('Seal the sleeve to the shaft', n('O-ring swells', n('Sleeve hang-up; faces open', elastomer)))),
        n('Springs',
          n('Keep the faces closed at low pressure', n('Springs clog', n('Faces open; leakage at start-up', springs))))));
    small.justification = 'Medium on occurrence 3: the flush calculation is checked at every design review.';
    const act = (cause, title, owner, status, start, target, rpn, ap, notes = []) => {
      const a = {...blankDfmeaAction(cause.id), title, owner, status, start, target, notes};
      Object.assign(a.after.rpn, rpn); Object.assign(a.after.ap, ap);
      d.actions.push(a);
    };
    act(vp, 'Vapour-pressure margin check (at least 3.5 bar) in the selection procedure', 'S. Varga', 'progress', '2026-10-26', '2026-12-11', {pof: 2}, {o: 3},
      [{week: '2026-W44', text: 'Draft procedure step sent to engineering for review.'}]);
    act(vp, 'Seal chamber high-temperature alarm on hot services', 'R. Haddad', 'open', '2026-11-09', '2027-01-15', {d: 3}, {d: 3});
    act(solids, 'Cyclone separator (Plan 31) where the product carries solids', 'L. Moreau', 'progress', '2026-10-19', '2026-11-27', {pof: 2}, {o: 2},
      [{week: '2026-W43', text: 'Supplier quotes received for two cyclone sizes.'}, {week: '2026-W44', text: 'Sizing confirmed for 2 bar differential.'}]);
    act(elastomer, 'Elastomer check against the product list at design review', 'K. Osei', 'done', '2026-10-05', '2026-10-30', {pof: 1}, {o: 1},
      [{week: '2026-W42', text: 'Checklist item added to the design review form.'}]);
    act(springs, 'Move the springs out of the product (rotating bellows option)', 'L. Moreau', 'open', '2026-11-16', '2027-02-26', {}, {o: 2});
  } finally { dfmea = previous; }
  return d;
}

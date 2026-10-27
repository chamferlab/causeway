// DFMEA pages: the structure (the tree and its properties), the risk analysis, the optimisation, and
// the action tracker. Each page is drawn whole from `dfmea`; edits go through the handlers at the end.

let dfmeaPage = 'structure';
let dfmeaSelected = null;     // node id
let dfmeaFilter = 'action';   // risk analysis: 'action' (needing action) or 'all'
let dfmeaClipboard = null;    // the branch last copied here, for when the system clipboard loses it
// The tree's pan and zoom: it is drawn at (x, y) on the canvas, scaled by k. A DFMEA opened or started
// is fitted to the canvas when it is next shown.
let dfView = {x: 0, y: 0, k: 1}, dfFitPending = true, dfPan = null, dfPanned = false;
const DF_LANE = 224, DF_PAD = 20, DF_HEAD = 30;   // a level's lane width (box and connectors), the tree's padding, the lane headings' height

const DFMEA_PAGES = {
  structure: {name: 'Structure', step: '2–4', title: 'Structure, function, and failure analysis (AIAG-VDA steps 2 to 4)'},
  risk: {name: 'Risk analysis', step: '5', title: 'Every branch and its scores (step 5)'},
  optimise: {name: 'Optimisation', step: '6', title: 'Actions per branch, and the risk after them (step 6)'},
  tracker: {name: 'Action tracker', step: '', title: 'Every action: assignee, status, target, and weekly notes'},
};
const methodOf = () => DFMEA_METHODS[dfmea.meta.method];
const scoreTag = (s, big = '') => s ? `<span class="df-score ${s.level}${big}" title="${dfmea.meta.method === 'rpn' ? `RPN ${s.value}, limit ${dfmea.meta.limit}` : `Action priority ${AP_NAMES[s.value]}`}">${s.value}</span>`
  : `<span class="df-score none${big}" title="Not rated yet">—</span>`;
const levelName = depth => DFMEA_LEVELS[depth].toLowerCase();

function renderDfmea() {
  renderDfmeaRail();
  const box = $('dfmea'), focus = document.activeElement;
  // A rebuild keeps the focused field and its caret, so typing is not interrupted.
  const key = box.contains(focus) && focus.dataset?.df ? ['df', 'id', 'k', 'week'].map(k => focus.dataset[k] ?? '').join('|') : null;
  const caret = key && 'selectionStart' in focus ? [focus.selectionStart, focus.selectionEnd] : null;
  box.innerHTML = {structure: structurePage, risk: riskPage, optimise: optimisePage, tracker: trackerPage}[dfmeaPage]();
  if (dfmeaPage === 'structure') { if (dfFitPending && dfFit()) dfFitPending = false; applyDfView(); }
  if (key) {
    const el = [...box.querySelectorAll('[data-df]')].find(x => ['df', 'id', 'k', 'week'].map(k => x.dataset[k] ?? '').join('|') === key);
    if (el) { el.focus({preventScroll: true}); if (caret && 'setSelectionRange' in el) try { el.setSelectionRange(...caret); } catch {} }
  }
  box.querySelectorAll('textarea.df-grow').forEach(fitArea);
  renderDfmeaChrome();
}

function renderDfmeaRail() {
  const needs = dfmeaCauses().filter(dfmeaNeedsAction).length, open = dfmea.actions.filter(a => a.status === 'open' || a.status === 'progress').length;
  const counts = {structure: dfmeaBranches().length, risk: needs, optimise: dfmea.actions.filter(a => a.status !== 'cancelled').length, tracker: open};
  $('dfmeaRail').innerHTML = `<div class="panel-title group-title">DFMEA</div>
    ${Object.entries(DFMEA_PAGES).map(([k, p]) => `<button class="record${dfmeaPage === k ? ' active' : ''}" data-dfmea-page="${k}" ${dfmeaPage === k ? 'aria-current="page"' : ''} title="${p.title}">
      <b><span class="df-step">${p.step}</span>${p.name}</b><span>${counts[k]}</span></button>`).join('')}
    <div class="panel-title legend-title">Scoring</div>
    <p class="df-rail-note"><b>${methodOf().name}</b>${dfmea.meta.method === 'rpn' ? `, limit ${dfmea.meta.limit}` : ''}. Change it in the DFMEA's properties: click the empty canvas on the Structure page.</p>
    <div class="panel-title legend-title">Levels</div>
    <ul class="legend df-levels">${DFMEA_LEVELS.map((l, i) => `<li><span class="sw df-l${i}"></span>${l}</li>`).join('')}</ul>`;
  $('dfmeaRail').querySelectorAll('[data-dfmea-page]').forEach(b => b.onclick = () => showDfmeaPage(b.dataset.dfmeaPage));
}
function showDfmeaPage(name) {
  dfmeaPage = name;
  renderDfmea();
  $('dfmea').scrollTop = 0;
}

// The top bar, the status bar, and the issues button, for the DFMEA.
function renderDfmeaChrome() {
  const m = dfmea.meta, title = dfmea.root.title.trim() || 'Untitled DFMEA';
  $('sheetTitle').textContent = title;
  $('sheetMeta').textContent = ['DFMEA', m.number, m.revision && `Rev. ${m.revision}`].filter(s => s?.trim()).join(' · ');
  document.title = `${m.number.trim() || title} · Causeway`;
  const branches = dfmeaBranches().length;
  $('count').textContent = `${plural(branches, 'branch', 'branches')} · ${plural(dfmea.actions.length, 'action')}`;
  $('keyHints').innerHTML = dfmeaPage === 'structure'
    ? 'Wheel zoom · drag to pan · Type to rename · <kbd>Tab</kbd> child · <kbd>Enter</kbd> sibling · <kbd>F2</kbd> edit · <kbd>←↑↓→</kbd> select · <kbd>Ctrl+C</kbd> <kbd>Ctrl+V</kbd> copy, paste · <kbd>Del</kbd> delete'
    : '';
  renderIssues(dfmeaIssues());
}

// ---- Structure: the tree ----

function structurePage() {
  const box = (n, depth) => {
    const cause = depth === CAUSE_LEVEL, s = cause && dfmeaScore(n);
    return `<div class="df-box df-l${depth}${dfmeaSelected === n.id ? ' sel' : ''}" data-node="${n.id}">
      <small>${DFMEA_LEVELS[depth]}${cause ? ` · ${escapeHtml(n.branch)}` : ''}</small>${n.title.trim() ? escapeHtml(n.title) : `<i>Untitled ${levelName(depth)}</i>`}${cause ? scoreTag(s) : ''}</div>`;
  };
  const sub = (n, depth) => `<div class="df-sub">${box(n, depth)}${n.children.length ? `<div class="df-kids">${n.children.map(k => sub(k, depth + 1)).join('')}</div>` : ''}</div>`;
  return `<div class="df-structure">
    <div class="df-canvas" id="dfCanvas" tabindex="0" aria-label="DFMEA tree: select an item, then Tab adds a child and Enter a sibling">
      <div class="df-tree" id="dfTree">${sub(dfmea.root, 0)}</div>
      <div class="df-lanes" id="dfLanes">${DFMEA_LEVELS.map((l, i) => `<div><i>${i + 1}</i>${l}</div>`).join('')}</div>
      <div class="editbar df-zoombar" role="toolbar" aria-label="Zoom">
        <button data-dfa="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
        <button data-dfa="zoom-reset" id="dfZoomReset" title="Reset zoom to 100%">100%</button>
        <button data-dfa="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
        <button data-dfa="zoom-fit" title="Zoom to fit the tree">Fit</button>
      </div>
    </div>
    <aside class="inspector df-props" aria-label="Properties">${dfmeaSelected && dfmeaFind(dfmeaSelected) ? nodeProps() : dfmeaProps()}</aside>
  </div>`;
}

// The DFMEA's own properties: AIAG-VDA step 1, planning.
function dfmeaProps() {
  const m = dfmea.meta, causes = dfmeaCauses();
  const f = (label, k, attrs = '') => `<label class="field" for="dfm-${k}">${label}</label><input class="text" id="dfm-${k}" data-df="meta" data-k="${k}" value="${escapeHtml(m[k])}" ${attrs}>`;
  return `<div class="panel-title">DFMEA</div>
    ${f('DFMEA number', 'number', 'placeholder="e.g. DFMEA-SEAL-03"')}
    <div class="df-two"><div>${f('Revision', 'revision')}</div><div>${f('Date', 'date', 'type="date"')}</div></div>
    <label class="field" for="dfm-project">Project <span class="muted">the first level</span></label><input class="text" id="dfm-project" data-df="node" data-id="${dfmea.root.id}" data-k="title" value="${escapeHtml(dfmea.root.title)}">
    <label class="field" for="dfm-scope">Scope</label><textarea class="text df-grow" id="dfm-scope" data-df="meta" data-k="scope" rows="3" placeholder="What the DFMEA covers, and what it leaves out">${escapeHtml(m.scope)}</textarea>
    ${f('Team', 'team', 'placeholder="Names, the lead first"')}
    <div class="field">Scoring method</div>
    <div class="style-cards" role="radiogroup" aria-label="Scoring method">${Object.entries(DFMEA_METHODS).map(([k, x]) =>
      `<label class="style-card${m.method === k ? ' on' : ''}"><input type="radio" name="dfMethod" data-df="method" value="${k}" ${m.method === k ? 'checked' : ''}><span><b>${x.name}</b><small>${x.about}</small></span></label>`).join('')}</div>
    ${m.method === 'rpn' ? `<label class="field" for="dfm-limit">Maximum acceptable RPN</label><input class="text" id="dfm-limit" type="number" min="1" max="1000" data-df="limit" data-k="limit" value="${m.limit}">` : ''}
    <p class="note">Each cause keeps its ratings for both methods, so changing the method later loses nothing.</p>
    <p class="note">${plural(dfmeaBranches().length, 'branch', 'branches')} · ${plural(causes.filter(dfmeaNeedsAction).length, 'needing action', 'needing action')} · ${plural(causes.filter(c => !dfmeaScore(c)).length, 'not rated', 'not rated')}</p>
    <div class="section">
      <div class="panel-title">Keys</div>
      <dl class="keys">
        <dt><kbd>Tab</kbd></dt><dd>Add a child: one level to the right</dd>
        <dt><kbd>Enter</kbd></dt><dd>Add a sibling below the selected item</dd>
        <dt>Type</dt><dd>Replace the title; <kbd>Enter</kbd> finishes it</dd>
        <dt><kbd>F2</kbd> or double-click</dt><dd>Edit the title</dd>
        <dt><kbd>←↑↓→</kbd></dt><dd>Select the parent, a sibling, or the first child</dd>
        <dt><kbd>Ctrl+C</kbd> <kbd>Ctrl+V</kbd></dt><dd>Copy an item with everything under it; paste it beside an item of its level, or under its parent's level. Text pastes as children, one per line</dd>
        <dt><kbd>Del</kbd></dt><dd>Delete the item and everything under it</dd>
        <dt><kbd>Esc</kbd></dt><dd>Clear the selection</dd>
      </dl>
    </div>`;
}

function nodeProps() {
  const {n, depth, path} = dfmeaFind(dfmeaSelected), cause = depth === CAUSE_LEVEL, method = dfmea.meta.method;
  const area = (label, k, rows = 2, attrs = '') => `<label class="field" for="dfn-${k}">${label}</label><textarea class="text df-grow" id="dfn-${k}" data-df="node" data-id="${n.id}" data-k="${k}" rows="${rows}" ${attrs}>${escapeHtml(n[k])}</textarea>`;
  let html = `<div class="kind-row"><span class="kind-chip df-chip df-l${depth}">${DFMEA_LEVELS[depth].toUpperCase()}</span><span class="muted">${cause ? `Branch ${escapeHtml(n.branch)}` : `${plural(n.children.length, levelName(depth + 1) || 'item')} below`}</span></div>
    ${path.length > 1 ? `<p class="df-path">${path.slice(1).map(p => escapeHtml(p.title)).join(' › ')}</p>` : ''}
    ${area('Title <span class="muted">required</span>', 'title', 2)}`;
  if (cause) {
    const s = dfmeaScore(n), after = liveActions(n).length ? dfmeaAfter(n) : null;
    html += `${area('Prevention control <span class="muted">what keeps it from happening</span>', 'prevention')}
      ${area('Detection control <span class="muted">what finds it before release</span>', 'detection')}
      <div class="panel-title" style="margin-top:14px">Ratings · ${methodOf().name}</div>
      <div class="df-ratings">${methodOf().ratings.map(([k, name]) => `<label>${name}<input class="text" type="number" min="1" max="10" data-df="rating" data-id="${n.id}" data-k="${k}" value="${n.ratings[method][k] ?? ''}"></label>`).join('')}</div>
      <div class="df-result">${scoreTag(s, ' big')}<span>${!s ? 'Rate every field, 1 to 10, to score the branch.' : method === 'rpn'
        ? (s.needs ? `Above the limit of ${dfmea.meta.limit}: needs action.` : `Within the limit of ${dfmea.meta.limit}.`)
        : {H: 'High: act to lower it.', M: 'Medium: act, or write why not.', L: 'Low: action optional.'}[s.value]}${after ? `<br>After its actions: <b>${after.value}</b>` : ''}</span></div>
      ${s?.value === 'M' ? area('Why no action is needed <span class="muted">for a Medium priority</span>', 'justification') : ''}
      <button class="button block" data-dfa="optimise" data-id="${n.id}" style="margin-top:8px">${liveActions(n).length ? `${plural(liveActions(n).length, 'action')} on the Optimisation page` : '+ Action, on the Optimisation page'}</button>`;
  } else html += `<button class="button block" data-dfa="add-child" data-id="${n.id}" style="margin-top:10px">+ ${DFMEA_LEVELS[depth + 1]} <kbd>Tab</kbd></button>`;
  html += `${area('Notes', 'notes')}
    ${path.length ? `<button class="button danger block" data-dfa="delete" data-id="${n.id}" style="margin-top:16px">Delete${n.children.length ? ` with ${plural(subtreeSize(n) - 1, 'item')} under it` : ''} <kbd>Del</kbd></button>` : ''}`;
  return html;
}

// ---- Risk analysis: every branch, one row each ----

function riskPage() {
  const method = dfmea.meta.method, ratings = methodOf().ratings, all = dfmeaBranches();
  const shown = dfmeaFilter === 'all' ? all : all.filter(b => b.depth === CAUSE_LEVEL && dfmeaNeedsAction(b.leaf));
  const rows = shown.map(b => {
    const at = i => b.path[i] ? escapeHtml(b.path[i].title) : '<span class="muted">—</span>';
    if (b.depth < CAUSE_LEVEL) return `<tr class="df-incomplete"><td class="df-id">—</td><td>${at(2)}</td><td>${at(3)}</td><td>${at(4)}</td><td>${at(5)}</td>
      <td colspan="${ratings.length + 3}"><button class="link" data-dfa="goto" data-id="${b.leaf.id}">Incomplete: ends at a ${levelName(b.depth)}</button></td></tr>`;
    const c = b.leaf, s = dfmeaScore(c), after = liveActions(c).length ? dfmeaAfter(c) : null;
    return `<tr class="${s && !s.needs ? 'df-ok' : ''}"><td class="df-id">${escapeHtml(c.branch)}</td><td>${at(2)}</td><td>${at(3)}</td><td><b>${at(4)}</b></td><td>${at(5)}</td>
      <td><button class="link" data-dfa="goto" data-id="${c.id}">${escapeHtml(c.title) || '<i>Untitled cause</i>'}</button></td>
      <td class="df-controls"><small>P</small> ${escapeHtml(c.prevention) || '—'}<br><small>D</small> ${escapeHtml(c.detection) || '—'}</td>
      ${ratings.map(([k, name]) => `<td class="df-n"><input class="df-rate" type="number" min="1" max="10" aria-label="${name}, ${escapeHtml(c.branch)}" data-df="rating" data-id="${c.id}" data-k="${k}" value="${c.ratings[method][k] ?? ''}"></td>`).join('')}
      <td class="df-n">${scoreTag(s)}</td><td class="df-n">${after ? scoreTag(after) : justified(c) ? `<span class="muted" title="${escapeHtml(c.justification)}">Justified</span>` : s?.needs ? `<button class="link df-warn" data-dfa="optimise" data-id="${c.id}">No action</button>` : '—'}</td></tr>`;
  });
  return `<div class="page wide">
    <div class="page-head"><div><h1>Risk analysis</h1><p class="lede">Every branch, one row each, scored by <b>${methodOf().name}</b>${method === 'rpn' ? ` against a limit of ${dfmea.meta.limit}` : ''}. Rate here or in the cause's properties. ${method === 'rpn' ? 'A branch above the limit needs action; equal to it is acceptable.' : 'High needs action; Medium needs action or a written reason; Low may have action.'}</p></div></div>
    <div class="df-toolbar"><div class="segmented df-seg" role="group" aria-label="Show"><button data-dfa="filter" data-v="action" ${pressed(dfmeaFilter === 'action')}>Needing action</button><button data-dfa="filter" data-v="all" ${pressed(dfmeaFilter === 'all')}>All branches</button></div>
      <span class="muted">${shown.length} of ${plural(all.length, 'branch', 'branches')}</span></div>
    ${rows.length ? `<div class="df-table-wrap"><table class="df-table"><thead><tr><th>Branch</th><th>Component</th><th>Function</th><th>Failure mode</th><th>Effect</th><th>Cause</th><th>Controls</th>
      ${ratings.map(([, name, head]) => `<th class="df-n" title="${name}">${head}</th>`).join('')}<th class="df-n">${methodOf().short}</th><th class="df-n">After actions</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
      : `<p class="empty-card">${all.length ? 'No branch needs action.' : 'No branches yet: build the tree on the Structure page, down to the causes.'}</p>`}
  </div>`;
}

// ---- Optimisation: the actions per branch, with the risk before and after them ----

function optimisePage() {
  const method = dfmea.meta.method, ratings = methodOf().ratings;
  const list = dfmeaBranches().filter(b => b.depth === CAUSE_LEVEL && (dfmeaScore(b.leaf)?.needs || dfmeaActionsOf(b.leaf.id).length));
  const cards = list.map(({leaf: c, path}) => {
    const s = dfmeaScore(c), acts = dfmeaActionsOf(c.id), after = liveActions(c).length ? dfmeaAfter(c) : null;
    return `<article class="card df-card" data-cause="${c.id}">
      <div class="df-card-body">
        <p class="df-path"><span class="df-id">${escapeHtml(c.branch)}</span> · ${escapeHtml(path[2]?.title || '')} › ${escapeHtml(path[4]?.title || '')}</p>
        <h2><button class="link" data-dfa="goto" data-id="${c.id}">${escapeHtml(c.title) || '<i>Untitled cause</i>'}</button></h2>
        ${acts.map(a => `<div class="df-action${a.status === 'cancelled' ? ' cancelled' : ''}">
          <textarea class="text df-grow" rows="1" data-df="action" data-id="${a.id}" data-k="title" placeholder="What will be done" aria-label="Action">${escapeHtml(a.title)}</textarea>
          <div class="df-action-row">
            <label>Assignee<input class="text" data-df="action" data-id="${a.id}" data-k="owner" value="${escapeHtml(a.owner)}"></label>
            <label>Target<input class="text" type="date" data-df="action" data-id="${a.id}" data-k="target" value="${escapeHtml(a.target)}"></label>
            ${ratings.map(([k, name, head]) => `<label title="${name} expected after this action">${head} after<input class="text df-rate" type="number" min="1" max="10" data-df="after" data-id="${a.id}" data-k="${k}" value="${a.after[method][k] ?? ''}" placeholder="${c.ratings[method][k] ?? ''}"></label>`).join('')}
            <span class="df-status ${a.status}">${DFMEA_ACTION_STATUS[a.status]}</span>
            <button class="unlink" data-dfa="delete-action" data-id="${a.id}" title="Delete this action" aria-label="Delete this action">×</button>
          </div></div>`).join('')}
        ${!acts.length ? `<p class="df-warn">${method === 'rpn' ? `Above the limit, and no action yet.` : s?.value === 'H' ? 'High, and no action yet.' : 'Medium: add an action, or write why none is needed.'}</p>` : ''}
        ${s?.value === 'M' && !acts.length ? `<textarea class="text df-grow" rows="1" data-df="node" data-id="${c.id}" data-k="justification" placeholder="Why no action is needed" aria-label="Why no action is needed">${escapeHtml(c.justification)}</textarea>` : ''}
        <button class="button" data-dfa="add-action" data-id="${c.id}">+ Action</button>
      </div>
      <div class="df-before-after">${scoreTag(s, ' big')}<span class="muted">after its actions</span>${after ? scoreTag(after, ' big') : '<span class="df-score none big">—</span>'}</div>
    </article>`;
  });
  return `<div class="page wide">
    <div class="page-head"><div><h1>Optimisation</h1><p class="lede">For each branch that needs action, what will be done and the ratings each action should reach. Leave a rating blank when the action does not change it. The score on the right counts every action that is not cancelled, whatever its status; follow them on the Action tracker.</p></div></div>
    ${cards.length ? cards.join('') : `<p class="empty-card">No branch needs action${dfmeaCauses().some(c => !dfmeaScore(c)) ? ' among those rated' : ''}.</p>`}
  </div>`;
}

// ---- Action tracker: every action, with its weeks and notes ----

function trackerPage() {
  const now = isoWeek(today());
  const rows = dfmea.actions.map(a => {
    const c = dfmeaCauseById(a.causeId), weeks = a.start && a.target ? isoWeeks(a.start, a.target) : [], noted = new Set(a.notes.map(x => x.week));
    return `<tr data-action="${a.id}"><td class="df-id">${escapeHtml(c?.branch || '')}</td>
      <td><textarea class="text df-grow" rows="1" data-df="action" data-id="${a.id}" data-k="title" aria-label="Action">${escapeHtml(a.title)}</textarea><small class="muted">${escapeHtml(c?.title || '')}</small></td>
      <td><input class="text" data-df="action" data-id="${a.id}" data-k="owner" value="${escapeHtml(a.owner)}" aria-label="Assignee"></td>
      <td><select class="text" data-df="action" data-id="${a.id}" data-k="status" aria-label="Status">${Object.entries(DFMEA_ACTION_STATUS).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><input class="text" type="date" data-df="action" data-id="${a.id}" data-k="start" value="${escapeHtml(a.start)}" aria-label="Entry date"></td>
      <td><input class="text" type="date" data-df="action" data-id="${a.id}" data-k="target" value="${escapeHtml(a.target)}" aria-label="Target date">${a.target && a.target < today() && !['done', 'cancelled'].includes(a.status) ? '<small class="df-warn">Overdue</small>' : ''}</td>
      <td><div class="df-weeks">${weeks.length ? weeks.map(w => `<span class="${noted.has(w) ? 'noted' : ''}${w === now ? ' now' : ''}" title="${w}${noted.has(w) ? ': has a note' : ''}">${+w.slice(6)}</span>`).join('') : '<span class="muted">Set both dates</span>'}</div>
        ${[...a.notes].sort((x, y) => y.week.localeCompare(x.week)).map(x => `<div class="df-note"><b>${x.week.slice(5)}</b><textarea class="text df-grow" rows="1" data-df="note" data-id="${a.id}" data-week="${x.week}" aria-label="Note for ${x.week}">${escapeHtml(x.text)}</textarea></div>`).join('')}
        ${a.notes.some(x => x.week === now) ? '' : `<button class="link" data-dfa="add-note" data-id="${a.id}">+ Note for ${now.slice(5)}</button>`}</td></tr>`;
  });
  return `<div class="page wide">
    <div class="page-head"><div><h1>Action tracker</h1><p class="lede">Every action of this DFMEA, for the weekly follow-up. The squares are the ISO weeks, Monday to Sunday, from the entry date to the target; a filled one has a note, and this week (${now.slice(5)}) is outlined. Add actions on the Optimisation page.</p></div></div>
    ${rows.length ? `<div class="df-table-wrap"><table class="df-table df-tracker"><thead><tr><th>Branch</th><th>Action</th><th>Assignee</th><th>Status</th><th>Entry</th><th>Target</th><th>Weeks and notes</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
      : '<p class="empty-card">No actions yet. Add them on the Optimisation page, to the branches that need them.</p>'}
  </div>`;
}

// ---- The issues list, for the DFMEA ----

function fillDfmeaIssues(sorted) {
  $('issuesList').innerHTML = sorted.length
    ? sorted.map(i => `<button role="menuitem" ${i.nodeId ? `data-df-node="${i.nodeId}"` : `data-df-action="${i.actionId}"`}><b>${escapeHtml(shorten(i.title || 'Untitled', 90))}</b>${i.actionId ? '<span class="where">Action tracker</span>' : ''}<small class="${i.level}">${escapeHtml(i.text)}</small></button>`).join('')
    : '<div class="empty">No issues: every branch is complete and rated, and every one that needs action has it.</div>';
  $('issuesList').querySelectorAll('[data-df-node]').forEach(b => b.onclick = () => { showIssues(false); dfmeaGoto(b.dataset.dfNode); });
  $('issuesList').querySelectorAll('[data-df-action]').forEach(b => b.onclick = () => {
    showIssues(false);
    showDfmeaPage('tracker');
    const row = document.querySelector(`#dfmea tr[data-action="${b.dataset.dfAction}"]`);
    row?.scrollIntoView({block: 'center'}); row?.querySelector('textarea')?.focus();
  });
}

// ---- Selecting and editing the tree ----

function dfmeaGoto(id) {
  dfmeaSelected = id;
  showDfmeaPage('structure');
  revealDfmeaNode(id);
}
// Pans just enough to bring the item into view, below the lane headings.
function revealDfmeaNode(id) {
  const el = document.querySelector(`#dfmea .df-box[data-node="${id}"]`), canvas = $('dfCanvas');
  if (!el || !canvas) return;
  const r = el.getBoundingClientRect(), c = canvas.getBoundingClientRect(), m = 24;
  const left = c.left + m, right = c.right - m, top = c.top + DF_HEAD + m, bottom = c.bottom - 70;
  // Its far edge comes into view first, then its near edge, which wins when the item is larger than the view.
  let dx = Math.min(0, right - r.right), dy = Math.min(0, bottom - r.bottom);
  if (r.left + dx < left) dx = left - r.left;
  if (r.top + dy < top) dy = top - r.top;
  dfView.x += dx; dfView.y += dy;
  applyDfView();
}

// ---- Pan and zoom, as on the RCA chart ----

function applyDfView() {
  const tree = $('dfTree'), canvas = $('dfCanvas');
  if (!tree) return;
  const {x, y, k} = dfView;
  tree.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  [...$('dfLanes').children].forEach((l, i) => { l.style.left = `${x + (DF_PAD + i * DF_LANE) * k}px`; l.style.width = `${DF_LANE * k}px`; });
  canvas.style.backgroundPosition = `${x}px ${y}px`;
  canvas.style.backgroundSize = `${18 * k}px ${18 * k}px`;
  $('dfZoomReset').textContent = `${Math.round(k * 100)}%`;
}
// Zooms by `factor` about a point of the canvas, by default its centre.
function dfZoom(factor, at) {
  const canvas = $('dfCanvas'), k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, dfView.k * factor));
  at ??= {x: canvas.clientWidth / 2, y: canvas.clientHeight / 2};
  dfView.x = at.x - (at.x - dfView.x) * k / dfView.k;
  dfView.y = at.y - (at.y - dfView.y) * k / dfView.k;
  dfView.k = k;
  applyDfView();
}
// Fits the whole tree below the lane headings, at most at 100 %. False while the canvas is not shown.
function dfFit() {
  const tree = $('dfTree'), canvas = $('dfCanvas');
  const w = tree?.offsetWidth, h = tree?.offsetHeight, cw = canvas?.clientWidth, ch = canvas?.clientHeight - DF_HEAD - 56;
  if (!w || !cw || ch <= 0) return false;
  const k = Math.max(MIN_ZOOM, Math.min(1, cw / w, ch / h));
  dfView = {k, x: Math.max(0, (cw - w * k) / 2), y: DF_HEAD + Math.max(0, (ch - h * k) / 2)};
  applyDfView();
  return true;
}
const canvasPoint = e => { const c = $('dfCanvas').getBoundingClientRect(); return {x: e.clientX - c.left, y: e.clientY - c.top}; };
// The wheel zooms at the pointer; a sideways wheel or swipe pans left and right.
$('dfmea').addEventListener('wheel', e => {
  if (!e.target.closest('#dfCanvas')) return;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? $('dfCanvas').clientWidth : 1;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { dfView.x -= e.deltaX * unit; applyDfView(); }
  else if (e.deltaY) dfZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, canvasPoint(e));
}, {passive: false});
// Dragging the empty canvas pans, as does the right or middle button anywhere on it.
$('dfmea').addEventListener('pointerdown', e => {
  dfPanned = false;
  if (!e.target.closest('#dfCanvas') || e.target.closest('.df-zoombar')) return;
  if (e.button === 0 && e.target.closest('.df-box') || e.button > 2) return;
  if (e.button) e.preventDefault();
  dfPan = {x: e.clientX, y: e.clientY, view: {...dfView}, moved: false};
  e.target.setPointerCapture?.(e.pointerId);
});
$('dfmea').addEventListener('pointermove', e => {
  if (!dfPan) return;
  const dx = e.clientX - dfPan.x, dy = e.clientY - dfPan.y;
  if (!dfPan.moved && Math.hypot(dx, dy) < 4) return;
  dfPan.moved = true;
  $('dfCanvas')?.classList.add('panning');
  dfView.x = dfPan.view.x + dx; dfView.y = dfPan.view.y + dy;
  applyDfView();
});
const endDfPan = () => { if (!dfPan) return; dfPanned = dfPan.moved; dfPan = null; $('dfCanvas')?.classList.remove('panning'); };
$('dfmea').addEventListener('pointerup', endDfPan);
$('dfmea').addEventListener('pointercancel', endDfPan);
$('dfmea').addEventListener('contextmenu', e => { if (e.target.closest('#dfCanvas')) e.preventDefault(); });
function selectDfmea(id) {
  dfmeaSelected = id;
  renderDfmea();
  if (id) revealDfmeaNode(id);
  $('dfCanvas')?.focus({preventScroll: true});
}
function focusDfmeaTitle() {
  const t = $('dfn-title');
  if (t) { t.focus(); t.select(); }
}
// Tab: a child of the selected item; Enter: a sibling below it. The new item is selected, and typing names it.
function addDfmeaChild() {
  const f = dfmeaFind(dfmeaSelected);
  if (!f) return;
  if (f.depth === CAUSE_LEVEL) { setStatus('A cause is the last level: Enter adds another cause beside it'); return; }
  addedDfmea(dfmeaAdd(f.n, f.depth + 1), f.depth + 1);
}
function addDfmeaSibling() {
  const f = dfmeaFind(dfmeaSelected);
  if (!f) return;
  if (!f.path.length) { setStatus('The project has no siblings: Tab adds a product'); return; }
  const parent = f.path.at(-1);
  addedDfmea(dfmeaAdd(parent, f.depth, parent.children.indexOf(f.n) + 1), f.depth);
}
function addedDfmea(n, depth) {
  dfmeaPersist();
  selectDfmea(n.id);
  setStatus(`Added ${/^[aeiou]/.test(levelName(depth)) ? 'an' : 'a'} ${levelName(depth)}: type to name it`);
}
function deleteDfmeaSelected() {
  const f = dfmeaFind(dfmeaSelected);
  if (!f?.path.length) return;
  const under = subtreeSize(f.n) - 1, acts = (() => { let k = 0; dfmeaWalk(x => { k += dfmeaActionsOf(x.id).length; }, f.n); return k; })();
  if ((under || acts) && !confirm(`Delete "${f.n.title || 'Untitled'}"${under ? ` and the ${plural(under, 'item')} under it` : ''}${acts ? `, with ${plural(acts, 'action')}` : ''}?`)) return;
  const parent = f.path.at(-1), i = parent.children.indexOf(f.n);
  dfmeaDelete(f.n.id);
  dfmeaPersist();
  selectDfmea((parent.children[i] || parent.children[i - 1] || parent).id);
  setStatus(`Deleted ${plural(under + 1, 'item')}`);
}

// ---- Edits from the pages ----

$('dfmea').addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (!d.df || el.type === 'number' || el.type === 'radio' || el.tagName === 'SELECT' || el.type === 'date') return;
  if (d.df === 'meta') dfmea.meta[d.k] = el.value;
  else if (d.df === 'node') { const f = dfmeaFind(d.id); if (!f) return; f.n[d.k] = el.value; }
  else if (d.df === 'action') { const a = dfmea.actions.find(x => x.id === d.id); if (!a) return; a[d.k] = el.value; }
  else if (d.df === 'note') { const x = dfmea.actions.find(a => a.id === d.id)?.notes.find(n => n.week === d.week); if (!x) return; x.text = el.value; }
  else return;
  if (el.tagName === 'TEXTAREA') fitArea(el);
  dfmeaPersist(`${d.df}:${d.id || ''}:${d.k || d.week}`);
  // Titles show elsewhere on the page: in the tree, and in the top bar.
  if (d.df === 'node' && d.k === 'title') { renderDfmea(); return; }
  renderDfmeaChrome(); renderDfmeaRail();
});
$('dfmea').addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (!d.df) return;
  const number = () => { const v = Math.round(+el.value); return el.value === '' ? null : Math.max(1, Math.min(10, v || 1)); };
  if (d.df === 'rating') { const c = dfmeaCauseById(d.id); if (!c) return; c.ratings[dfmea.meta.method][d.k] = number(); }
  else if (d.df === 'after') { const a = dfmea.actions.find(x => x.id === d.id); if (!a) return; a.after[dfmea.meta.method][d.k] = number(); }
  else if (d.df === 'method') dfmea.meta.method = el.value;
  else if (d.df === 'limit') dfmea.meta.limit = Math.max(1, Math.min(1000, Math.round(+el.value) || 100));
  else if (d.df === 'action' && (el.tagName === 'SELECT' || el.type === 'date')) { const a = dfmea.actions.find(x => x.id === d.id); if (!a) return; a[d.k] = el.value; }
  else if (d.df === 'meta' && el.type === 'date') dfmea.meta[d.k] = el.value;
  else return;
  dfmeaPersist();
  renderDfmea();
});
$('dfmea').addEventListener('click', e => {
  if (dfPanned) { dfPanned = false; return; }   // the end of a pan, not a click
  const box = e.target.closest('.df-box'), b = e.target.closest('[data-dfa]');
  if (box) { selectDfmea(box.dataset.node); return; }
  if (!b && e.target.closest('#dfCanvas')) { selectDfmea(null); return; }
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.dfa) {
    case 'goto': dfmeaGoto(id); break;
    case 'add-child': dfmeaSelected = id; addDfmeaChild(); break;
    case 'delete': dfmeaSelected = id; deleteDfmeaSelected(); break;
    case 'filter': dfmeaFilter = b.dataset.v; renderDfmea(); break;
    case 'zoom-in': dfZoom(1.25); break;
    case 'zoom-out': dfZoom(.8); break;
    case 'zoom-reset': dfZoom(1 / dfView.k); break;
    case 'zoom-fit': dfFit(); break;
    case 'optimise': {
      if (!dfmeaActionsOf(id).length) { dfmea.actions.push(blankDfmeaAction(id)); dfmeaPersist(); }
      showDfmeaPage('optimise');
      const card = document.querySelector(`#dfmea [data-cause="${id}"]`);
      card?.scrollIntoView({block: 'center'}); card?.querySelector('textarea')?.focus();
      break;
    }
    case 'add-action': {
      const a = blankDfmeaAction(id);
      dfmea.actions.push(a); dfmeaPersist(); renderDfmea();
      document.querySelector(`#dfmea [data-df="action"][data-id="${a.id}"][data-k="title"]`)?.focus();
      break;
    }
    case 'delete-action': {
      const a = dfmea.actions.find(x => x.id === id);
      if (a && (a.title.trim() || a.notes.length) && !confirm(`Delete the action "${a.title.trim() || 'Untitled'}"${a.notes.length ? ` and its ${plural(a.notes.length, 'note')}` : ''}?`)) return;
      dfmea.actions = dfmea.actions.filter(x => x.id !== id); dfmeaPersist(); renderDfmea();
      break;
    }
    case 'add-note': {
      const a = dfmea.actions.find(x => x.id === id), week = isoWeek(today());
      if (!a) return;
      a.notes.push({week, text: ''}); dfmeaPersist(); renderDfmea();
      document.querySelector(`#dfmea [data-df="note"][data-id="${id}"][data-week="${week}"]`)?.focus();
      break;
    }
  }
});
$('dfmea').addEventListener('dblclick', e => { if (e.target.closest('.df-box')) focusDfmeaTitle(); });

// Keys on the tree, as on the RCA chart. In the title, Enter finishes it and Esc leaves it.
window.addEventListener('keydown', e => {
  if (appModule !== 'dfmea' || $('dialog').open) return;
  const key = e.key.toLowerCase(), command = (e.ctrlKey || e.metaKey) && !e.altKey;
  if (command && key === 's') { e.preventDefault(); saveDfmea(e.shiftKey); return; }
  const field = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (field) {
    if (document.activeElement.id === 'dfn-title' && (key === 'escape' || key === 'enter' && !e.shiftKey && !e.isComposing)) { e.preventDefault(); $('dfCanvas')?.focus({preventScroll: true}); }
    return;
  }
  if (command && (key === 'z' || key === 'y')) { e.preventDefault(); dfmeaRestore(key === 'y' || e.shiftKey); return; }
  if (command || e.altKey || dfmeaPage !== 'structure') return;
  const onPage = [document.body, $('dfCanvas'), null].includes(document.activeElement);
  if (key === 'escape' && dfmeaSelected) { e.preventDefault(); selectDfmea(null); return; }
  const f = dfmeaSelected && dfmeaFind(dfmeaSelected);
  if (!f) {
    if (key.startsWith('arrow') && onPage) { e.preventDefault(); selectDfmea(dfmea.root.id); }
    return;
  }
  if (key === 'tab' && onPage) { e.preventDefault(); if (!e.shiftKey) addDfmeaChild(); }
  else if (key === 'enter' && onPage) { e.preventDefault(); addDfmeaSibling(); }
  else if (key === 'f2') { e.preventDefault(); focusDfmeaTitle(); }
  else if (key === 'delete') { e.preventDefault(); deleteDfmeaSelected(); }
  else if (key.startsWith('arrow') && onPage) {
    e.preventDefault();
    const parent = f.path.at(-1), siblings = parent ? parent.children : [dfmea.root], i = siblings.indexOf(f.n);
    const next = {arrowleft: parent, arrowright: f.n.children[0], arrowup: siblings[i - 1], arrowdown: siblings[i + 1]}[key];
    if (next) selectDfmea(next.id);
  }
  // Any other character starts a new title: the title is focused and selected, and the key replaces it.
  else if (e.key.length === 1 && onPage) focusDfmeaTitle();
});

// Copy and paste on the tree, through the system clipboard; in a field they act on the text.
const dfmeaClipboardOn = () => appModule === 'dfmea' && dfmeaPage === 'structure' && !$('dialog').open
  && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && (getSelection()?.isCollapsed ?? true);
document.addEventListener('copy', e => {
  if (!dfmeaClipboardOn() || !dfmeaFind(dfmeaSelected)?.path.length) return;
  e.preventDefault();
  const data = dfmeaCopyData(dfmeaSelected), textData = dfmeaText(data.node);
  dfmeaClipboard = {data, text: textData};
  e.clipboardData.setData('text/plain', textData);
  // The branch rides in the HTML, as the RCA's does: browsers keep only text and HTML on the system clipboard.
  e.clipboardData.setData('text/html', `<pre data-${DFMEA_BRANCH_TYPE}="${escapeHtml(JSON.stringify(data))}">${escapeHtml(textData)}</pre>`);
  setStatus(`Copied ${plural(subtreeSize(data.node), 'item')}`);
});
document.addEventListener('paste', e => {
  if (!dfmeaClipboardOn() || !dfmeaSelected) return;
  e.preventDefault();
  const textData = e.clipboardData.getData('text/plain');
  let data = null;
  const html = e.clipboardData.getData('text/html');
  try { data = JSON.parse(html && new DOMParser().parseFromString(html, 'text/html').querySelector(`[data-${DFMEA_BRANCH_TYPE}]`)?.getAttribute(`data-${DFMEA_BRANCH_TYPE}`) || 'null'); } catch {}
  if (!data && dfmeaClipboard && dfmeaClipboard.text === textData) data = dfmeaClipboard.data;
  const result = dfmeaPaste(data, textData, dfmeaSelected);
  if (typeof result === 'string') { setStatus(result); return; }
  dfmeaPersist();
  selectDfmea(result.id);
  setStatus('Pasted');
});

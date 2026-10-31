// The pages beside the chart: the 5 Whys, the fishbone, the sequence of events, and the RCA records (problem definition, team and dates,
// evidence log, causes ruled out, solutions, and the action plan).
//
// Fields are bound by data attributes: data-list names the record (or "meta", "problem", "node"),
// data-id the row, and data-field the dotted path of the value. Typing updates the state in
// place without rebuilding the page, so the field keeps its focus; data-refresh rebuilds it.
// Buttons and pickers carry data-act and are handled by one listener each.

const optionList = (values, current, blank) =>
  (blank !== undefined ? `<option value="">${blank}</option>` : '') +
  Object.entries(values).map(([k, v]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${v}</option>`).join('');
const bind = (list, id, fieldPath) => `data-list="${list}"${id ? ` data-id="${id}"` : ''} data-field="${fieldPath}"`;
const cell = (list, id, fieldPath, value, label, attrs = '') =>
  `<input class="cell" ${bind(list, id, fieldPath)} value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}" ${attrs}>`;
const cellArea = (list, id, fieldPath, value, label, attrs = '') =>
  `<textarea class="cell" rows="2" ${bind(list, id, fieldPath)} aria-label="${escapeHtml(label)}" ${attrs}>${escapeHtml(value)}</textarea>`;
const formField = (label, list, id, fieldPath, value, attrs = '') =>
  `<label class="field">${label}<input class="text" ${bind(list, id, fieldPath)} value="${escapeHtml(value)}" ${attrs}></label>`;
const formArea = (label, list, id, fieldPath, value, attrs = '') =>
  `<label class="field">${label}<textarea class="text" ${bind(list, id, fieldPath)} ${attrs}>${escapeHtml(value)}</textarea></label>`;
const pageHead = (title, lede, button = '') =>
  `<div class="page-head"><div><h1>${title}</h1><p class="lede">${lede}</p></div>${button}</div>`;
const teamList = () => `<datalist id="teamNames">${state.meta.team.map(m => `<option value="${escapeHtml(m.name)}">`).join('')}</datalist>`;
const nodeName = n => isRoot(n.id) ? {kind: 'effect'} : n;
const causeChip = (n, removeAct, ownerId) => `<span class="cause-chip">${swatch(nodeName(n))}<button class="link" data-act="goto-node" data-node="${n.id}" title="Show on the chart">${escapeHtml(shorten(n.title, 60))}</button>${removeAct
  ? `<button class="unlink" data-act="${removeAct}" data-id="${ownerId}" data-node="${n.id}" aria-label="Remove ${escapeHtml(n.title)}">×</button>` : ''}</span>`;
const evidenceChip = (e, removeAct, ownerId) => `<span class="ev-chip" title="${escapeHtml(e.description)}"><span class="code">${escapeHtml(e.code)}</span>${removeAct
  ? `<button class="unlink" data-act="${removeAct}" data-id="${ownerId}" data-evidence="${e.id}" aria-label="Remove ${escapeHtml(e.code)}">×</button>` : ''}</span>`;
const empty = (cols, text) => `<tr><td colspan="${cols}" class="empty-row">${text}</td></tr>`;

// Moves to a page: 'chart' or one of the records.
function setRecord(name) {
  record = name; fishOn = null; eventOn = null;
  $('app').dataset.record = name;
  guideFollow();
  document.querySelectorAll('.rail [data-record]').forEach(b => {
    b.classList.toggle('active', b.dataset.record === name);
    if (b.dataset.record === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}
function showRecord(name, focusId) {
  linking = null; nodeDrag = null;
  // A question of the Is / Is Not opens on its problem's specification.
  if (name === 'spec' && focusId && specRootOfRow(focusId)) specRoot = specRootOfRow(focusId);
  setRecord(name);
  render();
  if (name === 'chart') { if (selected) scrollToNode(selected); return; }
  $('records').scrollTop = 0;
  if (focusId) {
    const target = document.querySelector(`#records [data-id="${focusId}"][data-field]`);
    target?.scrollIntoView({block: 'center'});
    target?.focus();
  }
}

// An answer grows with its words, so a long one is never cut off.
function fitArea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}

function renderRecord() {
  const page = {learn: learnPage, spec: specPage, compare: comparePage, equipment: equipmentPage, whys: whysPage, fishbone: fishbonePage, timeline: timelinePage, problem: problemPage, team: teamPage, evidence: evidencePage, ruledOut: ruledOutPage, solutions: solutionsPage, actions: actionsPage}[record];
  const box = $('records'), focus = document.activeElement, scroll = box.scrollTop;
  // A rebuild keeps the focused field, so a picker or a status change does not lose the place.
  const key = box.contains(focus) && focus.dataset ? ['list', 'id', 'field', 'act', 'node'].map(k => focus.dataset[k] ?? '').join('|') : null;
  box.innerHTML = `<div class="page${['evidence', 'ruledOut', 'actions', 'fishbone', 'timeline', 'compare'].includes(record) ? ' wide' : ''}">${page()}</div>${teamList()}`;
  box.querySelectorAll('textarea.answer, table.spec textarea, table.cmp textarea, .cmp-case textarea').forEach(fitArea);
  box.scrollTop = scroll;
  if (key) [...box.querySelectorAll('[data-list],[data-act]')].find(el => ['list', 'id', 'field', 'act', 'node'].map(k => el.dataset[k] ?? '').join('|') === key)?.focus();
}

// ---- Pages ----

function whysPage() {
  return `${pageHead('5 Whys', 'Ask why the problem happened, then why that happened, and so on, until you reach a cause you can act on. Five is a guide, not a rule. Add the steps to the cause-and-effect chart, where each one gains the other causes it needs.',
    '<button class="button primary" data-act="add-chain">+ New chain</button>')}
    ${state.fiveWhys.length ? state.fiveWhys.map(chainCard).join('') : '<p class="empty-card">No chains yet. <b>+ New chain</b> starts one from the primary effect.</p>'}
    <p class="note">In an answer, <kbd>Enter</kbd> goes to the next why, adding one after the last; <kbd>Shift+Enter</kbd> starts a new line.</p>`;
}

function chainCard(c) {
  const start = byId(c.effectId), off = c.steps.filter(s => !stepNode(s)).length;
  return `<article class="card chain">
    <div class="card-head">
      <h2>Why did “${escapeHtml(shorten(start?.title || '', 90))}” happen?</h2>
      <button class="unlink" data-act="delete-chain" data-id="${c.id}" aria-label="Delete this chain">×</button>
    </div>
    <label class="starts">Starts from <select class="picker" data-act="chain-effect" data-id="${c.id}" aria-label="The node this chain starts from">${state.nodes.map(n =>
      `<option value="${n.id}" ${n.id === c.effectId ? 'selected' : ''}>${escapeHtml(shorten(n.title, 70))}</option>`).join('')}</select></label>
    <ol class="whys">${c.steps.map((s, i) => stepRow(c, s, i)).join('')}</ol>
    <div class="decision-row">
      <button class="button" data-act="add-step" data-id="${c.id}">+ Why</button>
      <span class="spacer"></span>
      ${off ? `<span class="muted">${off} step${off > 1 ? 's' : ''} not on the chart</span><button class="button" data-act="chain-to-chart" data-id="${c.id}">Add all to chart</button>`
        : c.steps.length ? '<span class="muted">Every step is on the chart</span>' : ''}
    </div>
  </article>`;
}

function stepRow(c, s, i) {
  const n = stepNode(s), src = stepSource(s), last = i === c.steps.length - 1;
  const asked = i === 0 ? byId(c.effectId)?.title : whyAnswer(c.steps[i - 1]);
  const cited = src.evidenceIds.map(evidenceById).filter(Boolean), rest = state.evidence.filter(e => !src.evidenceIds.includes(e.id));
  const kind = n ? n.kind : s.kind, label = `Why ${i + 1}`;
  return `<li class="why${n ? ' on-chart' : ''}">
    <div class="why-num">${label}${last && c.steps.length > 1 ? '<small>root cause so far</small>' : ''}</div>
    <div class="why-body">
      <div class="why-q">Why did “${escapeHtml(shorten(asked?.trim() || '…', 90))}” happen?</div>
      ${n ? `<textarea class="cell answer" rows="1" ${bind('node', n.id, 'title')} data-step="${s.id}" aria-label="${label}">${escapeHtml(n.title)}</textarea>`
        : `<textarea class="cell answer" rows="1" ${bind('whySteps', s.id, 'answer')} data-step="${s.id}" aria-label="${label}" placeholder="Because…">${escapeHtml(s.answer)}</textarea>`}
      <div class="why-meta">
        ${treeStyle() ? '' : `<div class="seg" role="group" aria-label="${label} type">${['action', 'condition'].map(k =>
          `<button class="kind" data-act="step-kind" data-id="${s.id}" data-v="${k}" ${pressed(kind === k)}>${KINDS[k].name}</button>`).join('')}</div>`}
        <div class="chips">${cited.map(e => evidenceChip(e, 'step-remove-evidence', s.id)).join('')}
          ${rest.length ? `<select class="picker" data-act="step-add-evidence" data-id="${s.id}" aria-label="Cite evidence for ${label}"><option value="">+ Evidence…</option>${rest.map(e =>
            `<option value="${e.id}">${escapeHtml(e.code)} · ${escapeHtml(shorten(e.description, 50))}</option>`).join('')}</select>` : ''}</div>
        <span class="spacer"></span>
        ${n ? `<button class="link" data-act="goto-node" data-node="${n.id}" title="Show it on the chart">On the chart</button>`
          : `<button class="button" data-act="step-to-chart" data-id="${s.id}" ${stepParent(c, i) ? '' : 'disabled title="Add the step before it to the chart first"'}>Add to chart</button>`}
      </div>
    </div>
    <button class="unlink" data-act="delete-step" data-id="${s.id}" aria-label="Remove ${label}${n ? '; it stays on the chart' : ''}">×</button>
  </li>`;
}

// The categories a new diagram starts with: the last ones chosen.
let fishPreset = 'seal';
let fishOn = null;           // the possible cause being edited, lit in its diagram
const pageColors = () => darkTheme() ? CHART_COLORS_DARK : CHART_COLORS;

function fishbonePage() {
  return `${pageHead('Fishbone', 'Sort the possible causes of an effect into categories, so that no area is forgotten. Then test each one: add it to the cause-and-effect chart, where it needs evidence, or rule it out.',
    `<div class="head-actions"><label class="starts">Categories <select class="picker" id="fishPreset">${Object.entries(FISHBONE_PRESETS).map(([k, p]) =>
      `<option value="${k}" ${k === fishPreset ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label><button class="button primary" data-act="add-fishbone">+ New diagram</button></div>`)}
    ${state.fishbones.length ? state.fishbones.map(fishCard).join('') : '<p class="empty-card">No diagrams yet. Choose the categories, then <b>+ New diagram</b>.</p>'}
    <p class="note">Click a cause or a category in the diagram to edit it. In a cause, <kbd>Enter</kbd> adds the next one; <kbd>Shift+Enter</kbd> starts a new line.</p>`;
}

function fishCard(f) {
  const causes = f.categories.flatMap(g => g.causes), count = k => causes.filter(c => fishStatus(c) === k).length;
  return `<article class="card fishbone">
    <div class="card-head">
      <h2>Possible causes of “${escapeHtml(shorten(byId(f.effectId)?.title || '', 90))}”</h2>
      <button class="button small" data-act="fish-export" data-id="${f.id}" data-v="svg" title="Save the diagram as an SVG image">SVG</button>
      <button class="button small" data-act="fish-export" data-id="${f.id}" data-v="png" title="Save the diagram as a PNG image">PNG</button>
      <button class="unlink" data-act="delete-fishbone" data-id="${f.id}" aria-label="Delete this diagram">×</button>
    </div>
    <label class="starts">Effect <select class="picker" data-act="fish-effect" data-id="${f.id}" aria-label="The effect at the head of the diagram">${state.nodes.map(n =>
      `<option value="${n.id}" ${n.id === f.effectId ? 'selected' : ''}>${escapeHtml(shorten(n.title, 70))}</option>`).join('')}</select></label>
    <div class="fish-figure" data-fishbone="${f.id}">${fishboneSvg(f, {colors: pageColors(), on: fishOn})}</div>
    <p class="fish-tally">${causes.length ? `${causes.length} possible cause${causes.length > 1 ? 's' : ''}:
      <span class="tally chart"><i></i>${count('chart')} on the chart</span><span class="tally ruled">${count('ruled')} ruled out</span><span class="tally open">${count('open')} to test</span>`
      : 'No possible causes yet: add them under the categories below.'}</p>
    <div class="fish-cats">${f.categories.map(g => fishCategoryCard(g)).join('')}
      <button class="fish-add-cat" data-act="add-fish-category" data-id="${f.id}">+ Category</button></div>
  </article>`;
}

function fishCategoryCard(g) {
  const name = g.name.trim() || 'category';
  return `<section class="fish-cat">
    <div class="fish-cat-head">
      <input class="cell title" ${bind('fishCats', g.id, 'name')} value="${escapeHtml(g.name)}" aria-label="Category" placeholder="Category">
      <button class="unlink" data-act="delete-fish-category" data-id="${g.id}" aria-label="Remove the ${escapeHtml(name)} category">×</button>
    </div>
    <ul class="fish-causes">${fishRows(g).map(c => fishCauseRow(g, c)).join('')}</ul>
    <button class="button small" data-act="add-fish-cause" data-id="${g.id}">+ Cause</button>
  </section>`;
}

function fishCauseRow(g, c) {
  const status = fishStatus(c), src = fishSource(c), n = fishNode(c), r = fishRuled(c), kind = fishKind(c);
  const label = c.parentId ? 'Sub-cause' : 'Possible cause';
  const field = n ? bind('node', n.id, 'title') : r ? bind('ruledOut', r.id, 'cause') : bind('fishCauses', c.id, 'text');
  const cited = src.evidenceIds.map(evidenceById).filter(Boolean), rest = state.evidence.filter(e => !src.evidenceIds.includes(e.id));
  const parent = c.parentId && g.causes.find(x => x.id === c.parentId), waits = parent && !fishNode(parent);
  return `<li class="fish-cause ${status}${c.parentId ? ' child' : ''}">
    <div class="fish-line">
      <textarea class="cell answer" rows="1" ${field} data-fish="${c.id}" aria-label="${label}" placeholder="${c.parentId ? 'A cause of the cause above' : 'A possible cause'}">${escapeHtml(fishText(c))}</textarea>
      <button class="unlink" data-act="delete-fish-cause" data-id="${c.id}" aria-label="Remove this ${label.toLowerCase()}${status === 'open' ? '' : status === 'chart' ? '; it stays on the chart' : '; it stays in the causes ruled out'}">×</button>
    </div>
    <div class="why-meta">
      ${treeStyle() ? '' : `<div class="seg" role="group" aria-label="${label} type">${['action', 'condition'].map(k =>
        `<button class="kind" data-act="fish-kind" data-id="${c.id}" data-v="${k}" ${pressed(kind === k)}>${KINDS[k].name}</button>`).join('')}</div>`}
      <div class="chips">${cited.map(e => evidenceChip(e, 'fish-remove-evidence', c.id)).join('')}
        ${rest.length ? `<select class="picker" data-act="fish-add-evidence" data-id="${c.id}" aria-label="Cite evidence"><option value="">+ Evidence…</option>${rest.map(e =>
          `<option value="${e.id}">${escapeHtml(e.code)} · ${escapeHtml(shorten(e.description, 50))}</option>`).join('')}</select>` : ''}</div>
    </div>
    <div class="why-meta fish-foot">
      ${status === 'chart' ? `<button class="link" data-act="goto-node" data-node="${n.id}" title="Show it on the chart">On the chart</button>`
        : status === 'ruled' ? `<button class="link" data-act="show-ruled" data-id="${r.id}" title="Show it in the causes ruled out">Ruled out</button><button class="button small" data-act="fish-restore" data-id="${c.id}" title="Take it back from the causes ruled out, to test again">Restore</button>`
        : `<button class="button small" data-act="fish-to-chart" data-id="${c.id}" ${waits ? 'disabled title="Add the cause above it to the chart first"' : ''}>Add to chart</button><button class="button small" data-act="fish-rule-out" data-id="${c.id}" title="Move it to the causes ruled out">Rule out</button>`}
      <span class="spacer"></span>
      ${c.parentId ? '' : `<button class="link" data-act="add-fish-sub" data-id="${c.id}">+ Sub-cause</button>`}
    </div>
  </li>`;
}

// Redraws the diagrams alone, so typing keeps its place.
function refreshFishFigures() {
  for (const el of document.querySelectorAll('#records .fish-figure')) {
    const f = state.fishbones.find(x => x.id === el.dataset.fishbone);
    if (f) el.innerHTML = fishboneSvg(f, {colors: pageColors(), on: fishOn});
  }
}

// The phases a new timeline starts with: the last ones chosen.
let timelinePreset = 'test';
let eventOn = null;          // the event being edited, lit in its figure

// ---- Is / Is Not ----

// The causes that can still be tested: in the problem's tree, not its primary effect, not ruled out, not yet in the matrix.
const specCandidates = () => {
  const inTree = reachable(state.links, [specOn()]);
  return state.nodes.filter(n => !isRoot(n.id) && !specTest(n.id) && !isRuledOut(n) && inTree.has(n.id));
};

// With more than one problem, each has its own Is / Is Not: the tabs pick one.
const problemTabs = (act, on) => rootIds().length < 2 ? '' : `<div class="segmented problem-tabs" role="group" aria-label="Problem">${rootIds().map(id =>
  `<button data-act="${act}" data-id="${id}" ${pressed(id === on)} title="${escapeHtml(byId(id).title)}">${problemName(id)}: ${escapeHtml(shorten(byId(id).title, 40))}</button>`).join('')}</div>`;

function specPage() {
  const sp = curSpec(), facts = specFacts(), candidates = specCandidates();
  const tests = sp.tests.filter(t => byId(t.causeId));
  return `${pageHead('Is / Is Not', 'Specify the problem precisely before explaining it, after Kepner-Tregoe: for each question, what the problem <b>is</b>, and what it could be but <b>is not</b>. Then test each possible cause against those facts: the true cause explains why the problem is here and not there.')}
    ${rootIds().length > 1 ? `<section class="card">${problemTabs('spec-problem', specOn())}
      <p class="note">Each problem has its own specification and its own causes to test. This one: <b>${escapeHtml(byId(specOn()).title)}</b>.</p></section>` : ''}
    <section class="card">
      <h2>Specification</h2>
      <p class="note">For IS NOT, give the closest thing that could have the problem but does not: the other seal on the same pump, the spare pump, the same seal before the upset. Then note what is distinctive about the IS side, and what changed in or around it.
        To go through it factor by factor against cases that did not fail: <button class="link" data-act="goto-record" data-v="compare">Failed vs good</button>.</p>
      <div class="table-wrap"><table class="log spec">
        <colgroup><col style="width:20%"><col style="width:19%"><col style="width:19%"><col style="width:19%"><col style="width:19%"><col style="width:44px"></colgroup>
        <thead><tr><th>Question</th><th>Is</th><th>Is not</th><th>Distinctive about the IS</th><th>Changed in or around it</th><th><span class="sr">Remove</span></th></tr></thead>
        ${Object.entries(SPEC_DIMS).map(([dim, name]) => `<tbody>
          <tr class="spec-dim"><th colspan="6">${name}<button class="link" data-act="spec-add-row" data-dim="${dim}">+ Question</button></th></tr>
          ${sp.rows.filter(r => r.dim === dim).map(r => `<tr>
            <td>${cellArea('specRows', r.id, 'question', r.question, 'Question', 'placeholder="A question"')}<small class="spec-code">${specLabel(r)}</small></td>
            <td>${cellArea('specRows', r.id, 'is', r.is, `${specLabel(r)}: is`, 'placeholder="Is"')}</td>
            <td>${cellArea('specRows', r.id, 'isNot', r.isNot, `${specLabel(r)}: is not`, 'placeholder="Is not"')}</td>
            <td>${cellArea('specRows', r.id, 'distinction', r.distinction, `${specLabel(r)}: distinctive`, '')}</td>
            <td>${cellArea('specRows', r.id, 'change', r.change, `${specLabel(r)}: changes`, '')}</td>
            <td class="row-actions"><button class="unlink" data-act="spec-delete-row" data-id="${r.id}" aria-label="Remove this question">×</button></td>
          </tr>`).join('')}</tbody>`).join('')}
      </table></div>
    </section>
    <section class="card">
      <h2>Test the possible causes</h2>
      <p class="note">For each cause and each fact: does the cause explain why the problem IS here and IS NOT there? Click a cell to go round
        <b>✓</b> explains it, <b>?</b> only if an assumption holds, and <b>✕</b> does not explain it. A cause that fails a fact is flagged on the chart. The most likely cause explains every fact on the fewest assumptions.</p>
      ${!facts.length ? '<p class="empty-card">Answer the IS or IS NOT side of a question first: each answered question is a fact to test against.</p>'
      : tests.length ? `<div class="table-wrap"><table class="log spec-test">
        <thead><tr><th>Cause</th><th>Result</th>${facts.map(f => `<th class="spec-fact" title="${escapeHtml(`${f.question}\nIs: ${f.is}\nIs not: ${f.isNot}`)}">${specLabel(f).replace(' ', '<br>')}</th>`).join('')}<th><span class="sr">Remove</span></th></tr></thead>
        <tbody>${tests.map(t => {
          const n = byId(t.causeId), res = specResult(t);
          return `<tr><td>${causeChip(n)}</td><td class="spec-result ${res.no.length ? 'fails' : res.open.length || res.only.length ? '' : 'passes'}">${specSummary(res)}</td>${facts.map(f => {
            const v = t.marks[f.id] || '';
            return `<td class="spec-cell"><button class="spec-mark m-${v || 'none'}" data-act="spec-mark" data-id="${n.id}" data-row="${f.id}" title="${escapeHtml(specLabel(f))}: ${v ? SPEC_MARKS[v].name : 'not judged'}" aria-label="${escapeHtml(`${n.title}, ${specLabel(f)}: ${v ? SPEC_MARKS[v].name : 'not judged'}`)}">${v ? SPEC_MARKS[v].mark : '·'}</button></td>`;
          }).join('')}
          <td class="row-actions"><button class="unlink" data-act="spec-remove-test" data-id="${n.id}" aria-label="Remove ${escapeHtml(n.title)} from the test">×</button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty-card">No causes in the test yet.</p>'}
      ${facts.length && candidates.length ? `<div class="decision-row">
        <select class="picker" data-act="spec-add-test" aria-label="Test a cause"><option value="">+ Test a cause…</option>${candidates.map(n => `<option value="${n.id}">${escapeHtml(shorten(n.title, 80))}</option>`).join('')}</select>
        ${candidates.length <= 30 ? `<button class="button" data-act="spec-add-all">Test all ${candidates.length}</button>` : ''}
      </div>` : ''}
    </section>`;
}

// ---- Failed vs good ----

let compareOnly = false;     // show the factors that differ, and those not yet judged, only

function comparePage() {
  const c = state.comparison, fresh = compareNewFields().length;
  const head = pageHead('Failed vs good', 'Optional: when there is a case that did <b>not</b> fail to compare with. Put the failed case beside two that did not: the same machine before, a twin on the same duty, or a similar one elsewhere. Mark where each factor <b>differs</b>, and whether the difference could <b>explain</b> the failure. What is the same in every case cannot explain why only this one failed.');
  if (!c.rows.length) return `${head}<div class="empty-card"><p>No comparison yet. It starts with the factors the equipment and duty record already holds${equipmentFilled() ? '' : ' (none filled in yet: it starts with one empty factor)'}; the failed case is filled in, and you add the two good cases.</p>
    <button class="button primary" data-act="compare-start">${equipmentFilled() ? 'Start from the equipment record' : 'Start the comparison'}</button></div>`;
  const cases = c.cases.map((x, i) => `<div class="cmp-case${i ? '' : ' failed'}">
    <div class="cmp-role">${i ? `Good case ${i}` : 'Failed'}</div>
    <input class="cell title" ${bind('cmpCases', String(i), 'name')} value="${escapeHtml(x.name)}" aria-label="${i ? `Good case ${i}` : 'Failed case'}" placeholder="${i ? 'e.g. The twin pump on the same duty' : 'The failed item'}">
    <textarea class="cell" rows="2" ${bind('cmpCases', String(i), 'why')} aria-label="${i ? `Why good case ${i} is comparable` : 'The failure'}" placeholder="${i ? 'Why it is comparable, and how long it has run' : 'What failed, when, after how long'}">${escapeHtml(x.why)}</textarea></div>`).join('');
  const shown = r => !compareOnly || r.differs !== 'same';
  const goes = r => {
    if (!compareExplains(r)) return '';
    const n = compareNode(r), sr = r.specRowId && specRow(r.specRowId);
    return `${n ? `<button class="link" data-act="goto-node" data-node="${n.id}" title="Show it on the chart">On the chart</button>` : `<button class="button small" data-act="compare-to-chart" data-id="${r.id}" title="Add it to the chart as a possible cause, with its evidence">Add to chart</button>`}
      ${sr ? `<button class="link" data-act="goto-spec" data-id="${sr.id}" title="${escapeHtml(sr.question)}">In Is / Is Not, ${rootIds().length > 1 ? problemName(specRootOfRow(sr.id)) + ', ' : ''}${specLabel(sr)}</button>`
        : `<select class="picker" data-act="compare-to-spec" data-id="${r.id}" aria-label="Send to a question of the Is / Is Not"><option value="">Send to Is / Is Not…</option>${rootIds().map(root => {
          const options = specOf(root).rows.map(q => `<option value="${q.id}">${specLabel(q)}: ${escapeHtml(shorten(q.question, 50))}</option>`).join('');
          return rootIds().length > 1 ? `<optgroup label="${escapeHtml(`${problemName(root)}: ${shorten(byId(root).title, 40)}`)}">${options}</optgroup>` : options;
        }).join('')}</select>`}`;
  };
  const when = r => {
    const ev = compareEvent(r);
    if (ev) return `<div class="cmp-event"><small>${escapeHtml(compareWhen(r) || 'No time given')}</small>
      <button class="link" data-act="goto-record" data-v="timeline" title="Show the sequence of events">${escapeHtml(shorten(eventText(ev), 60))}</button>
      <button class="unlink" data-act="compare-unlink-event" data-id="${r.id}" aria-label="Unlink the event; it stays on the timeline">×</button></div>`;
    const events = state.timelines.flatMap(t => t.phases.flatMap(p => eventsInOrder(p))), phases = state.timelines.flatMap(t => t.phases);
    return `${cell('cmpRows', r.id, 'when', r.when, 'When it changed', 'placeholder="Date, or an event"')}
      ${events.length ? `<select class="picker" data-act="compare-link-event" data-id="${r.id}" aria-label="Link an event of the sequence of events"><option value="">Link an event…</option>${events.map(ev =>
        `<option value="${ev.id}">${escapeHtml(ev.start.replace('T', ' ') || '—')} · ${escapeHtml(shorten(eventText(ev), 50))}</option>`).join('')}</select>` : ''}
      ${phases.length ? `<select class="picker" data-act="compare-to-timeline" data-id="${r.id}" aria-label="Add it to the sequence of events as a deviation"><option value="">Add to timeline…</option>${phases.map(p =>
        `<option value="${p.id}">${escapeHtml(p.name.trim() || 'Unnamed phase')}</option>`).join('')}</select>` : ''}`;
  };
  const row = r => {
    const cited = r.evidenceIds.map(evidenceById).filter(Boolean), rest = state.evidence.filter(e => !r.evidenceIds.includes(e.id));
    return `<tr class="${r.differs === 'differs' ? 'cmp-diff' : ''}${compareExplains(r) ? ' cmp-explains' : ''}">
      <td>${cellArea('cmpRows', r.id, 'factor', r.factor, 'Factor', 'placeholder="Factor"')}${r.field ? '<small class="cmp-from">From the equipment record</small>' : ''}</td>
      <td class="cmp-failed">${r.field ? cellArea('equipment', '', r.field, compareFailed(r), `${r.factor}: failed case`) : cellArea('cmpRows', r.id, 'failed', r.failed, `${r.factor}: failed case`)}</td>
      ${[0, 1].map(i => `<td>${cellArea('cmpRows', r.id, `good.${i}`, r.good[i], `${r.factor}: good case ${i + 1}`)}</td>`).join('')}
      <td><select class="cell cmp-differs ${r.differs}" ${bind('cmpRows', r.id, 'differs')} aria-label="${escapeHtml(r.factor)}: differs?">${optionList(COMPARE_DIFFERS, r.differs, '')}</select></td>
      <td><select class="cell cmp-judge ${r.explains}" ${bind('cmpRows', r.id, 'explains')} aria-label="${escapeHtml(r.factor)}: explains it?">${optionList(COMPARE_EXPLAINS, r.explains, '')}</select></td>
      <td><div class="chips">${cited.map(e => evidenceChip(e, 'compare-remove-evidence', r.id)).join('')}
        ${rest.length ? `<select class="picker" data-act="compare-add-evidence" data-id="${r.id}" aria-label="Cite evidence"><option value="">+ Evidence…</option>${rest.map(e =>
          `<option value="${e.id}">${escapeHtml(e.code)} · ${escapeHtml(shorten(e.description, 50))}</option>`).join('')}</select>` : ''}</div></td>
      <td class="cmp-when">${when(r)}</td>
      <td><div class="cmp-goes">${goes(r)}</div></td>
      <td class="row-actions"><button class="unlink" data-act="compare-delete-row" data-id="${r.id}" aria-label="Remove this factor${compareNode(r) ? '; it stays on the chart' : ''}">×</button></td>
    </tr>`;
  };
  const all = c.rows, explains = all.filter(compareExplains), same = all.filter(r => r.differs === 'same' && !compareExplains(r));
  const open = all.filter(r => r.differs === 'unknown' || r.explains === 'unknown' || !r.differs || r.differs === 'differs' && !r.explains || !compareFailed(r).trim() || r.good.some(g => !g.trim()));
  const missing = r => [!compareFailed(r).trim() && 'failed case', ...r.good.map((g, i) => !g.trim() && `good case ${i + 1}`)].filter(Boolean);
  const list = (rows, fmt, none) => rows.length ? `<ul class="cmp-list">${rows.map(fmt).join('')}</ul>` : `<p class="muted">${none}</p>`;
  return `${head}
    <section class="card"><div class="cmp-cases">${cases}</div></section>
    <section class="card">
      <div class="decision-row">
        <label class="starts"><input type="checkbox" id="compareOnly" ${compareOnly ? 'checked' : ''}> Differences only</label>
        <span class="spacer"></span>
        ${fresh ? `<button class="button" data-act="compare-start" title="Add a factor for each field filled in since">+ ${plural(fresh, 'factor')} from the equipment record</button>` : ''}
      </div>
      <div class="table-wrap"><table class="log cmp">
        <colgroup><col style="width:14%"><col style="width:15%"><col style="width:13%"><col style="width:13%"><col style="width:86px"><col style="width:86px"><col style="width:11%"><col style="width:14%"><col style="width:12%"><col style="width:44px"></colgroup>
        <thead><tr><th>Factor</th><th class="cmp-failed">${escapeHtml(compareCaseName(0))}</th><th>${escapeHtml(compareCaseName(1))}</th><th>${escapeHtml(compareCaseName(2))}</th>
          <th>Differs?</th><th>Explains it?</th><th>Evidence</th><th>When it changed</th><th>Goes to</th><th><span class="sr">Remove</span></th></tr></thead>
        ${COMPARE_CATEGORIES.map(cat => {
          const rows = all.filter(r => r.cat === cat);
          return `<tbody><tr class="spec-dim"><th colspan="10">${cat}<button class="link" data-act="compare-add-row" data-v="${cat}">+ Factor</button></th></tr>
            ${rows.filter(shown).map(row).join('')}${compareOnly && rows.some(r => !shown(r)) ? `<tr><td colspan="10" class="cmp-hidden">${plural(rows.filter(r => !shown(r)).length, 'factor')} the same, hidden</td></tr>` : ''}</tbody>`;
        }).join('')}
      </table></div>
    </section>
    <div class="cmp-outcome">
      <section class="card"><h2 class="cmp-h explains">Differences that could explain it</h2>
        <p class="note">Candidates for the chart, as possible causes with their evidence; and for the Is / Is Not.</p>
        ${list(explains, r => `<li><b>${escapeHtml(r.factor || 'Untitled factor')}</b>${r.explains === 'partly' ? ' <span class="muted">(partly)</span>' : ''}${compareNode(r) ? ' <span class="badge small implement">On the chart</span>' : ''}
          <small>${escapeHtml(compareFailed(r))}${compareWhen(r) ? ` · changed ${escapeHtml(compareWhen(r))}` : ''}</small></li>`, 'None marked yet.')}</section>
      <section class="card"><h2 class="cmp-h">The same in every case</h2>
        <p class="note">These cannot explain why only this one failed. They may still be a condition, or a systemic cause that let it happen.</p>
        ${list(same, r => `<li>${escapeHtml(r.factor || 'Untitled factor')}${compareNode(r) ? ' <span class="badge small implement">On the chart</span>' : ''}<small>${escapeHtml(compareFailed(r))}</small></li>`, 'None marked yet.')}</section>
      <section class="card"><h2 class="cmp-h open">Still to find out</h2>
        <p class="note">Cases not known, and differences not judged: what to collect or decide next.</p>
        ${list(open, r => `<li>${escapeHtml(r.factor || 'Untitled factor')}<small>${missing(r).length ? missing(r).join(', ') + ' not known' : r.differs === 'differs' || r.differs === 'same' ? 'whether it explains the failure' : 'whether it differs'}</small></li>`, 'Nothing open.')}</section>
    </div>`;
}

function timelinePage() {
  return `${pageHead('Sequence of events', 'Lay out what happened, in order, phase by phase: what was done, what was seen, and when. Mark the deviations, the events that departed from what should have happened. They are candidate causes: add them to the cause-and-effect chart.',
    `<div class="head-actions"><label class="starts">Phases <select class="picker" id="timelinePreset">${Object.entries(TIMELINE_PRESETS).map(([k, p]) =>
      `<option value="${k}" ${k === timelinePreset ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label><button class="button primary" data-act="add-timeline">+ New timeline</button></div>`)}
    ${state.timelines.length ? state.timelines.map(timelineCard).join('') : '<p class="empty-card">No timelines yet. Choose the phases, then <b>+ New timeline</b>.</p>'}
    <p class="note">Give an event an end to draw it as a bar; without one it is a moment. Within a phase, events are in time order. Click an event in the figure to edit it. In an event, <kbd>Enter</kbd> adds the next one; <kbd>Shift+Enter</kbd> starts a new line.</p>`;
}

function timelineCard(t) {
  const events = t.phases.flatMap(p => p.events), deviations = events.filter(ev => ev.deviation), off = deviations.filter(ev => !eventNode(ev)).length;
  return `<article class="card timeline">
    <div class="card-head">
      <h2>Events leading to “${escapeHtml(shorten(byId(t.effectId)?.title || '', 90))}”</h2>
      <button class="button small" data-act="timeline-export" data-id="${t.id}" data-v="svg" title="Save the figure as an SVG image">SVG</button>
      <button class="button small" data-act="timeline-export" data-id="${t.id}" data-v="png" title="Save the figure as a PNG image">PNG</button>
      <button class="unlink" data-act="delete-timeline" data-id="${t.id}" aria-label="Delete this timeline">×</button>
    </div>
    <label class="starts">Leads to <select class="picker" data-act="timeline-effect" data-id="${t.id}" aria-label="The effect the events lead to; deviations are added to the chart as its causes">${state.nodes.map(n =>
      `<option value="${n.id}" ${n.id === t.effectId ? 'selected' : ''}>${escapeHtml(shorten(n.title, 70))}</option>`).join('')}</select></label>
    <div class="fish-figure tl-figure" data-timeline="${t.id}">${timelineSvg(t, {colors: pageColors(), on: eventOn})}</div>
    <div class="decision-row tl-tally">
      <span class="muted">${events.length ? `${plural(events.length, 'event')}, ${plural(deviations.length, 'deviation')}${deviations.length ? `: ${deviations.length - off} on the chart` : ''}` : 'No events yet: add them under the phases below.'}</span>
      <span class="spacer"></span>
      ${off ? `<button class="button" data-act="deviations-to-chart" data-id="${t.id}">Add ${plural(off, 'deviation')} to chart</button>` : ''}
    </div>
    <div class="tl-phases">${t.phases.map(phaseCard).join('')}
      <button class="fish-add-cat" data-act="add-phase" data-id="${t.id}">+ Phase</button></div>
  </article>`;
}

function phaseCard(p) {
  return `<section class="fish-cat tl-phase-card">
    <div class="fish-cat-head">
      <input class="cell title" ${bind('phases', p.id, 'name')} value="${escapeHtml(p.name)}" aria-label="Phase" placeholder="Phase">
      <button class="unlink" data-act="delete-phase" data-id="${p.id}" aria-label="Remove the ${escapeHtml(p.name.trim() || 'unnamed')} phase">×</button>
    </div>
    <ul class="fish-causes">${eventsInOrder(p).map(eventRow).join('')}</ul>
    <button class="button small" data-act="add-event" data-id="${p.id}">+ Event</button>
  </section>`;
}

function eventRow(ev) {
  const n = eventNode(ev), src = eventSource(ev), kind = eventKind(ev);
  const cited = src.evidenceIds.map(evidenceById).filter(Boolean), rest = state.evidence.filter(e => !src.evidenceIds.includes(e.id));
  const backwards = ev.end && eventMinutes(ev.end) <= eventMinutes(ev.start);
  return `<li class="fish-cause tl-event${n ? ' chart' : ''}${ev.deviation ? ' deviation' : ''}">
    <div class="tl-when">
      <input class="cell" type="datetime-local" ${bind('events', ev.id, 'start')} value="${escapeHtml(ev.start)}" aria-label="Start">
      <span class="muted">to</span>
      <input class="cell" type="datetime-local" ${bind('events', ev.id, 'end')} value="${escapeHtml(ev.end)}" aria-label="End, if it lasted">
      ${backwards ? '<span class="tl-warn">ends before it starts</span>' : ''}
    </div>
    <div class="fish-line">
      <textarea class="cell answer" rows="1" ${n ? bind('node', n.id, 'title') : bind('events', ev.id, 'text')} data-event="${ev.id}" aria-label="Event" placeholder="What happened, or was done or seen">${escapeHtml(eventText(ev))}</textarea>
      <button class="unlink" data-act="delete-event" data-id="${ev.id}" aria-label="Remove this event${n ? '; it stays on the chart' : ''}">×</button>
    </div>
    <div class="why-meta">
      <button class="button small tl-deviation" data-act="event-deviation" data-id="${ev.id}" ${pressed(ev.deviation)} title="It departed from what should have happened: a candidate cause">Deviation</button>
      ${treeStyle() ? '' : `<div class="seg" role="group" aria-label="Event type">${['action', 'condition'].map(k =>
        `<button class="kind" data-act="event-kind" data-id="${ev.id}" data-v="${k}" ${pressed(kind === k)}>${KINDS[k].name}</button>`).join('')}</div>`}
      <div class="chips">${cited.map(e => evidenceChip(e, 'event-remove-evidence', ev.id)).join('')}
        ${rest.length ? `<select class="picker" data-act="event-add-evidence" data-id="${ev.id}" aria-label="Cite evidence"><option value="">+ Evidence…</option>${rest.map(e =>
          `<option value="${e.id}">${escapeHtml(e.code)} · ${escapeHtml(shorten(e.description, 50))}</option>`).join('')}</select>` : ''}</div>
      <span class="spacer"></span>
      ${n ? `<button class="link" data-act="goto-node" data-node="${n.id}" title="Show it on the chart">On the chart</button>`
        : `<button class="button small" data-act="event-to-chart" data-id="${ev.id}">Add to chart</button>`}
    </div>
  </li>`;
}

// Redraws the figures alone, so typing keeps its place.
function refreshTimelineFigures() {
  for (const el of document.querySelectorAll('#records .tl-figure')) {
    const t = state.timelines.find(x => x.id === el.dataset.timeline);
    if (t) el.innerHTML = timelineSvg(t, {colors: pageColors(), on: eventOn});
  }
}

function problemPage() {
  const p = state.problem, s = p.significance, several = rootIds().length > 1;
  // One card per problem: its primary effect, the first box of its tree, and its own when and where.
  const statement = root => {
    const effect = byId(root), first = root === p.primaryEffectId, list = first ? 'problem' : 'moreProblems', at = problemOf(root);
    return `<section class="card">
      ${several ? `<div class="section-head"><h2>${problemName(root)}</h2>${first ? '' : `<button class="button small danger" data-act="remove-problem" data-id="${root}">Remove this problem</button>`}</div>` : ''}
      ${formArea('What <span class="muted">the primary effect</span>', 'node', effect.id, 'title', effect.title, 'rows="2"')}
      <div class="form-grid">
        ${formArea('When', list, first ? '' : root, 'when', at.when, 'rows="2" placeholder="Date, time, and the circumstances"')}
        ${formArea('Where', list, first ? '' : root, 'where', at.where, 'rows="2" placeholder="Unit, equipment, and position"')}
      </div>
    </section>`;
  };
  return `${pageHead('Problem definition', 'What happened, when, where, and why it matters. The “what” is the primary effect: the first box of the chart.',
    '<button class="button" data-act="add-problem" title="A second problem in this investigation, for example another failure in the same sequence of events: its own statement, tree, and Is / Is Not">+ Add another problem</button>')}
    ${several ? '<p class="note">Each problem has its own tree on the chart and its own Is / Is Not. The sequence of events, evidence, team, solutions, and actions are shared.</p>' : ''}
    ${rootIds().map(statement).join('')}
    <section class="card">
      <h2>Significance</h2>
      <p class="note">Why this RCA is worth the effort: the consequences, in each area.</p>
      <div class="form-grid">
        ${formArea('Safety', 'problem', '', 'significance.safety', s.safety, 'rows="3"')}
        ${formArea('Environment', 'problem', '', 'significance.environment', s.environment, 'rows="3"')}
        ${formArea('Production / cost', 'problem', '', 'significance.productionCost', s.productionCost, 'rows="3"')}
        ${formArea('Reliability', 'problem', '', 'significance.reliability', s.reliability, 'rows="3"')}
      </div>
    </section>`;
}

// How long the seal ran, from its installed and failed dates.
function runTime(e = state.equipment) {
  const from = Date.parse(e.installed), to = Date.parse(e.failed);
  if (!e.installed || !e.failed || !(to >= from)) return '';
  const days = Math.round((to - from) / 864e5);
  return `Ran ${plural(days, 'day')}${days >= 60 ? `, about ${(days / 30.44).toFixed(1)} months` : ''}`;
}
const equipmentFilled = () => EQUIPMENT_KEYS.filter(k => state.equipment[k]?.trim()).length;

function equipmentPage() {
  const e = state.equipment;
  return `${pageHead('Equipment and duty', 'What a seal or pump maker asks for when a failed part comes back: the machine and seal, the duty, the support system, the mechanical condition, the history, and the failed parts. Fill in what you know; every field is optional.')}
    ${EQUIPMENT_SECTIONS.map(s => `<section class="card">
      <h2>${s.title}</h2>
      <div class="form-grid">${s.fields.map(([key, label, hint, type]) => type === 'area'
        ? `<div class="wide">${formArea(label, 'equipment', '', key, e[key] || '', `rows="3" placeholder="${escapeHtml(hint)}"`)}</div>`
        : formField(label, 'equipment', '', key, e[key] || '', `${type === 'date' ? 'type="date" data-refresh' : ''} placeholder="${escapeHtml(hint)}"`)).join('')}</div>
      ${s.title === 'History' && runTime() ? `<p class="note run-time">${runTime()}</p>` : ''}
    </section>`).join('')}`;
}

// Closing waits for the actions to be validated; the date closed is filled in if it is empty.
function setRcaStatus(status) {
  const blockers = status === 'closed' ? closeBlockers() : [];
  if (blockers.length) {
    render();
    openDialog(`<h2>Not ready to close</h2><p>An RCA is closed once its actions have worked. Still open:</p>
      <ul class="needs">${blockers.map(b => `<li class="need-warning">${escapeHtml(b)}</li>`).join('')}</ul>
      <div class="dialog-foot"><button class="button primary" data-choice="" autofocus>OK</button></div>`, () => {});
    return;
  }
  state.meta.status = status;
  if (status === 'closed' && !state.meta.dates.closed) state.meta.dates.closed = today();
  render(); persist();
  setStatus(`RCA status: ${RCA_STATUS[status]}`);
}

function teamPage() {
  const m = state.meta, d = m.dates;
  return `${pageHead('Team and sign-off', 'Who carries out the RCA, its dates, where it stands, and who signs it off.')}
    <section class="card">
      <h2>RCA</h2>
      <div class="form-grid">
        <label class="field">Status<select class="text" data-act="rca-status" data-id="status" data-field="status" aria-label="RCA status">${optionList(RCA_STATUS, m.status)}</select></label>
        ${formField('Customer reference <span class="muted">e.g. their 8D or complaint number</span>', 'meta', '', 'customerRef', m.customerRef, '')}
        ${formField('Revision', 'meta', '', 'revision', m.revision, 'placeholder="e.g. A, or 1"')}
        ${formField('RCA number', 'meta', '', 'rcaNumber', m.rcaNumber, 'placeholder="e.g. RCA-2026-014"')}
        ${formField('Equipment / tag', 'meta', '', 'equipmentTag', m.equipmentTag, 'placeholder="e.g. P-101A"')}
        ${formField('Seal type', 'meta', '', 'sealType', m.sealType, 'placeholder="e.g. Single cartridge seal, API Plan 11"')}
      </div>
    </section>
    <section class="card">
      <h2>Dates</h2>
      <div class="form-grid dates">
        ${formField('Event', 'meta', '', 'dates.eventDate', d.eventDate, 'type="date"')}
        ${formField('RCA opened', 'meta', '', 'dates.opened', d.opened, 'type="date"')}
        ${formField('RCA closed', 'meta', '', 'dates.closed', d.closed, 'type="date"')}
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Team</h2><button class="button" data-act="add-member">+ Add member</button></div>
      <table class="log compact">
        <thead><tr><th>Name</th><th>Role</th><th class="center">Lead</th><th><span class="sr">Remove</span></th></tr></thead>
        <tbody>${m.team.length ? m.team.map(t => `<tr>
          <td>${cell('team', t.id, 'name', t.name, 'Name', 'placeholder="Name"')}</td>
          <td>${cell('team', t.id, 'role', t.role, 'Role', 'placeholder="Role or department"')}</td>
          <td class="center"><input type="radio" name="lead" data-act="lead" data-id="${t.id}" ${m.leadId === t.id ? 'checked' : ''} aria-label="${escapeHtml(t.name || 'Member')} leads the RCA"></td>
          <td class="row-actions"><button class="unlink" data-act="delete-member" data-id="${t.id}" aria-label="Remove ${escapeHtml(t.name || 'member')}">×</button></td>
        </tr>`).join('') : empty(4, 'No team members yet.')}</tbody>
      </table>
      <p class="note">Names entered here are offered for “collected by” and “owner” in the other records.</p>
    </section>
    <section class="card">
      <h2>Sign-off</h2>
      <table class="log compact">
        <thead><tr><th>Role</th><th>Name</th><th>Date</th></tr></thead>
        <tbody>${Object.entries(SIGNOFF_ROLES).map(([k, label]) => `<tr><td>${label}</td>
          <td>${cell('meta', '', `signoff.${k}.name`, m.signoff[k].name, `${label}: name`, 'list="teamNames" placeholder="Name"')}</td>
          <td>${cell('meta', '', `signoff.${k}.date`, m.signoff[k].date, `${label}: date`, 'type="date"')}</td></tr>`).join('')}</tbody>
      </table>
      <p class="note">Printed at the end of every report, with space to sign. The RCA can be closed once every corrective and preventive action is validated by its effectiveness check.</p>
    </section>`;
}

function evidencePage() {
  return `${pageHead('Evidence log', 'What was seen, measured, or inferred. Every cause on the chart needs evidence. Codes are never reused.',
    '<button class="button primary" data-act="add-evidence">+ Add evidence</button>')}
    <div class="table-wrap"><table class="log">
      <colgroup><col style="width:58px"><col style="width:30%"><col style="width:104px"><col style="width:18%"><col style="width:130px"><col style="width:136px"><col style="width:20%"><col style="width:76px"></colgroup>
      <thead><tr><th>Code</th><th>Description</th><th>Type</th><th>Source / location</th><th>Collected by</th><th>Date</th><th>Cited by</th><th><span class="sr">Actions</span></th></tr></thead>
      <tbody>${state.evidence.length ? state.evidence.map(e => {
        const nodes = citingNodes(e.id), ruled = citingRuledOut(e.id);
        return `<tr class="${highlight === e.id ? 'current' : ''}">
          <td><span class="code">${escapeHtml(e.code)}</span></td>
          <td>${cellArea('evidence', e.id, 'description', e.description, `Description of ${e.code}`, 'placeholder="What was seen or measured"')}</td>
          <td><select class="cell" ${bind('evidence', e.id, 'type')} aria-label="Type of ${e.code}">${optionList(EVIDENCE_TYPES, e.type)}</select></td>
          <td>${cellArea('evidence', e.id, 'source', e.source, `Source of ${e.code}`)}</td>
          <td>${cell('evidence', e.id, 'collectedBy', e.collectedBy, `Collected by, ${e.code}`, 'list="teamNames"')}</td>
          <td>${cell('evidence', e.id, 'date', e.date, `Date of ${e.code}`, 'type="date"')}</td>
          <td><div class="cited">${nodes.map(n => causeChip(n)).join('')}${ruled.length ? `<span class="muted">${ruled.length} ruled-out cause${ruled.length > 1 ? 's' : ''}</span>` : ''}${nodes.length || ruled.length ? '' : '<span class="muted">Not cited</span>'}</div></td>
          <td class="row-actions">${nodes.length ? `<button class="link" data-act="show-evidence" data-id="${e.id}" title="Highlight the nodes that cite ${e.code}">Show</button>` : ''}<button class="unlink" data-act="delete-evidence" data-id="${e.id}" aria-label="Delete ${e.code}">×</button></td>
        </tr>`;
      }).join('') : empty(8, 'No evidence yet. Add it here, or from a cause on the chart.')}</tbody>
    </table></div>`;
}

function ruledOutPage() {
  return `${pageHead('Causes ruled out', 'Possible causes that the evidence or a test ruled out, kept with the evidence that did it. On the chart, <b>Rule out</b> moves a candidate cause here.',
    '<button class="button primary" data-act="add-ruled">+ Add possible cause</button>')}
    <div class="table-wrap"><table class="log">
      <colgroup><col style="width:24%"><col style="width:118px"><col style="width:30%"><col style="width:20%"><col style="width:130px"><col style="width:44px"></colgroup>
      <thead><tr><th>Possible cause</th><th>Type</th><th>Evidence or test</th><th>Evidence</th><th>Status</th><th><span class="sr">Remove</span></th></tr></thead>
      <tbody>${state.ruledOut.length ? state.ruledOut.map(r => {
        const cited = r.evidenceIds.map(evidenceById).filter(Boolean), rest = state.evidence.filter(e => !r.evidenceIds.includes(e.id));
        return `<tr>
          <td>${cellArea('ruledOut', r.id, 'cause', r.cause, 'Possible cause', 'placeholder="The possible cause"')}</td>
          <td><select class="cell" ${bind('ruledOut', r.id, 'kind')} aria-label="Type">${optionList({action: 'Action', condition: 'Condition'}, r.kind, '—')}</select></td>
          <td>${cellArea('ruledOut', r.id, 'test', r.test, 'Evidence or test', 'placeholder="How it was ruled out"')}</td>
          <td><div class="chips">${cited.map(e => evidenceChip(e, 'ruled-remove-evidence', r.id)).join('')}
            ${rest.length ? `<select class="picker" data-act="ruled-add-evidence" data-id="${r.id}" aria-label="Cite evidence"><option value="">+ Cite…</option>${rest.map(e => `<option value="${e.id}">${escapeHtml(e.code)} · ${escapeHtml(shorten(e.description, 50))}</option>`).join('')}</select>` : ''}</div></td>
          <td><select class="cell" ${bind('ruledOut', r.id, 'status')} aria-label="Status">${optionList(RULED_OUT_STATUS, r.status)}</select></td>
          <td class="row-actions"><button class="unlink" data-act="delete-ruled" data-id="${r.id}" aria-label="Remove">×</button></td>
        </tr>`;
      }).join('') : empty(6, 'No causes ruled out yet.')}</tbody>
    </table></div>
    ${treeStyle() ? `<h2 class="page-sub">Ruled out on the cause tree</h2>
    <p class="note">These stay on the tree, greyed and marked ruled out. Write how each was ruled out here or in its properties.</p>
    <div class="table-wrap"><table class="log">
      <colgroup><col style="width:30%"><col style="width:40%"><col style="width:20%"><col style="width:80px"></colgroup>
      <thead><tr><th>Cause</th><th>Evidence or test</th><th>Evidence</th><th><span class="sr">Show</span></th></tr></thead>
      <tbody>${treeRuledOut().length ? treeRuledOut().map(n => `<tr>
        <td>${cellArea('node', n.id, 'title', n.title, 'Cause')}</td>
        <td>${cellArea('node', n.id, 'test', n.test, 'Evidence or test', 'placeholder="How it was ruled out"')}</td>
        <td><div class="chips">${n.evidenceIds.map(evidenceById).filter(Boolean).map(e => evidenceChip(e)).join('') || '<span class="muted">None</span>'}</div></td>
        <td class="row-actions"><button class="link" data-act="goto-node" data-node="${n.id}">Show</button></td>
      </tr>`).join('') : empty(4, 'No causes on the tree are ruled out.')}</tbody>
    </table></div>` : ''}`;
}

function solutionsPage() {
  const causes = state.nodes.filter(n => !isRoot(n.id))
    .sort((a, b) => (b.controllable - a.controllable) || a.title.localeCompare(b.title));
  return `${pageHead('Solutions', 'Each solution attacks one or more causes, and is weighed against the four solution criteria. Controllable causes are the candidates.',
    '<button class="button primary" data-act="add-solution">+ Add solution</button>')}
    ${state.solutions.length ? state.solutions.map(s => {
      const linked = s.causeIds.map(byId).filter(Boolean), actions = actionsOf(s.id);
      const rest = causes.filter(n => !s.causeIds.includes(n.id));
      return `<article class="card solution" id="solution-${s.id}">
        <div class="card-head">
          <input class="cell title" ${bind('solutions', s.id, 'title')} value="${escapeHtml(s.title)}" aria-label="Solution" placeholder="Describe the solution">
          <span class="badge ${s.decision || 'none'}">${DECISIONS[s.decision] || 'Not decided'}</span>
          <button class="unlink" data-act="delete-solution" data-id="${s.id}" aria-label="Delete solution">×</button>
        </div>
        <div class="sub">Attacks</div>
        <div class="chips">${linked.map(n => causeChip(n, 'solution-remove-cause', s.id)).join('') || '<span class="muted">No cause linked yet</span>'}
          ${rest.length ? `<select class="picker" data-act="solution-add-cause" data-id="${s.id}" aria-label="Link a cause"><option value="">+ Link a cause…</option>${rest.map(n => `<option value="${n.id}">${n.controllable ? '● ' : ''}${escapeHtml(shorten(n.title, 70))}</option>`).join('')}</select>` : ''}</div>
        <table class="criteria"><tbody>${Object.entries(CRITERIA).map(([k, label]) => `<tr>
          <th scope="row">${label}</th>
          <td><div class="seg" role="group" aria-label="${label}">${Object.entries(CRITERION_VALUES).map(([v, text]) =>
            `<button class="${v}" data-act="criterion" data-id="${s.id}" data-key="${k}" data-v="${v}" ${pressed(s.criteria[k].v === v)}>${text}</button>`).join('')}</div></td>
          <td>${cell('solutions', s.id, `criteria.${k}.c`, s.criteria[k].c, `${label} comment`, 'placeholder="Comment"')}</td>
        </tr>`).join('')}</tbody></table>
        <div class="decision-row">
          <span class="sub">Decision</span>
          <div class="seg decision" role="group" aria-label="Decision">${Object.entries(DECISIONS).map(([v, text]) =>
            `<button class="${v}" data-act="decision" data-id="${s.id}" data-v="${v}" ${pressed(s.decision === v)}>${text}</button>`).join('')}</div>
          <span class="spacer"></span>
          <span class="muted">${actions.length ? `${actions.length} action${actions.length > 1 ? 's' : ''} in the plan` : 'No actions yet'}</span>
          <button class="button" data-act="add-action-for" data-id="${s.id}">+ Action</button>
        </div>
      </article>`;
    }).join('') : '<p class="empty-card">No solutions yet. Add one here, or from a cause on the chart.</p>'}`;
}

const STRENGTH_HELP = 'Strength: strong actions remove the cause by design (eliminate, redesign, a physical barrier, automation); medium ones make the right result likely (a checklist, an alarm or monitoring, redundancy); weak ones rely on people remembering (training, a procedure, a warning, a reminder).';

function actionsPage() {
  const solutions = Object.fromEntries(state.solutions.map(s => [s.id, shorten(s.title || 'Untitled solution', 60)]));
  const overdue = state.actions.filter(isOverdue).length;
  return `${pageHead('Action plan', `Who does what, by when, how it is verified, and whether it worked: containment until the fix is in, corrective actions that remove the causes, and preventive ones that stop it elsewhere.${overdue ? ` <b class="overdue">${overdue} overdue.</b>` : ''}`,
    '<button class="button primary" data-act="add-action">+ Add action</button>')}
    <div class="table-wrap"><table class="log">
      <colgroup><col style="width:24%"><col style="width:16%"><col style="width:120px"><col style="width:136px"><col style="width:18%"><col style="width:132px"><col style="width:20%"><col style="width:44px"></colgroup>
      <thead><tr><th>Action</th><th>Solution</th><th>Owner</th><th>Due</th><th>Verification</th><th>Status</th><th>Effectiveness check</th><th><span class="sr">Remove</span></th></tr></thead>
      <tbody>${state.actions.length ? state.actions.map(a => `<tr class="${ACTION_DONE.includes(a.status) ? 'done' : ''}">
        <td>${cellArea('actions', a.id, 'action', a.action, 'Action', 'placeholder="What will be done"')}
          <div class="row-tags"><select class="cell tag" ${bind('actions', a.id, 'kind')} aria-label="Kind">${optionList(ACTION_KINDS, a.kind)}</select>
          ${a.kind === 'containment' ? '<span class="tag-note">until the fix is in</span>' : `<select class="cell tag strength-${a.strength || 'none'}" ${bind('actions', a.id, 'strength')} aria-label="Strength" title="${STRENGTH_HELP}">${optionList(ACTION_STRENGTH, a.strength, 'Strength…')}</select>`}</div></td>
        <td><select class="cell" ${bind('actions', a.id, 'solutionId')} aria-label="Solution">${optionList(solutions, a.solutionId, '—')}</select></td>
        <td>${cell('actions', a.id, 'owner', a.owner, 'Owner', 'list="teamNames"')}</td>
        <td class="${isOverdue(a) ? 'overdue' : ''}">${cell('actions', a.id, 'due', a.due, 'Due', 'type="date" data-refresh')}${isOverdue(a) ? '<small>Overdue</small>' : ''}</td>
        <td>${cellArea('actions', a.id, 'verification', a.verification, 'Verification', 'placeholder="How it is checked"')}</td>
        <td><select class="cell" ${bind('actions', a.id, 'status')} data-refresh aria-label="Status">${optionList(ACTION_STATUS, a.status)}</select></td>
        <td>${cell('actions', a.id, 'effectiveness.date', a.effectiveness.date, 'Effectiveness check date', 'type="date"')}
          ${cellArea('actions', a.id, 'effectiveness.result', a.effectiveness.result, 'Effectiveness check result', 'placeholder="Result: did it stop recurrence?"')}</td>
        <td class="row-actions"><button class="unlink" data-act="delete-action" data-id="${a.id}" aria-label="Delete action">×</button></td>
      </tr>`).join('') : empty(8, 'No actions yet. Add one here, or from a solution.')}</tbody>
    </table></div>
    <p class="note">${STRENGTH_HELP} Status: <b>implemented</b> is done, <b>verified</b> is checked to be done as intended, and <b>validated</b> is shown by the effectiveness check to have worked.</p>
    <section class="card">
      ${formArea('Read-across <span class="muted">where else could this happen, and what was checked</span>', 'problem', '', 'readAcross', state.problem.readAcross,
        'rows="3" placeholder="Similar equipment, sites, or designs, and what was found on them"')}
    </section>`;
}

// ---- Editing ----

function boundObject(el) {
  const {list, id} = el.dataset;
  if (list === 'meta') return state.meta;
  if (list === 'problem') return state.problem;
  if (list === 'moreProblems') return state.moreProblems.find(p => p.effectId === id);
  if (list === 'equipment') return state.equipment;
  if (list === 'specRows') return specRow(id);
  if (list === 'cmpCases') return state.comparison.cases[+id];
  if (list === 'cmpRows') return compareRow(id);
  if (list === 'node') return byId(id);
  if (list === 'whySteps') return stepById(id);
  if (list === 'fishCauses') return fishFind(id)?.cause;
  if (list === 'fishCats') return fishCategory(id);
  if (list === 'events') return eventFind(id)?.event;
  if (list === 'phases') return timelinePhase(id);
  return (list === 'team' ? state.meta.team : state[list]).find(r => r.id === id);
}
function setPath(obj, path, value) {
  const keys = path.split('.'), last = keys.pop();
  for (const k of keys) obj = obj[k];
  obj[last] = value;
}

$('records').addEventListener('input', e => {
  const el = e.target.closest('[data-field]');
  if (!el || el.dataset.act === 'rca-status') return;
  const obj = boundObject(el);
  if (!obj) return;
  setPath(obj, el.dataset.field, el.value);
  if (el.matches('textarea.answer, table.spec textarea, table.cmp textarea, .cmp-case textarea')) fitArea(el);
  if (el.dataset.list === 'cmpCases' && el.dataset.field === 'name') $('records').querySelectorAll('table.cmp thead th')[+el.dataset.id + 1].textContent = compareCaseName(+el.dataset.id);
  renderTitle();
  if (record === 'fishbone') refreshFishFigures();
  if (record === 'timeline') refreshTimelineFigures();
  if (el.hasAttribute('data-refresh') || el.tagName === 'SELECT') { render(); persist(); }
  else persist(`${el.dataset.list}:${el.dataset.id}:${el.dataset.field}`);
});

// Pickers: choosing an item adds it.
$('records').addEventListener('change', e => {
  if (e.target.dataset.act === 'rca-status') { setRcaStatus(e.target.value); return; }
  const el = e.target.closest('select[data-act]');
  if (el && el.value) {
    const value = el.value;
    if (el.dataset.act === 'ruled-add-evidence') state.ruledOut.find(r => r.id === el.dataset.id).evidenceIds.push(value);
    if (el.dataset.act === 'solution-add-cause') state.solutions.find(s => s.id === el.dataset.id).causeIds.push(value);
    if (el.dataset.act === 'step-add-evidence') stepSource(stepById(el.dataset.id)).evidenceIds.push(value);
    if (el.dataset.act === 'chain-effect') state.fiveWhys.find(c => c.id === el.dataset.id).effectId = value;
    if (el.dataset.act === 'fish-add-evidence') fishSource(fishFind(el.dataset.id).cause).evidenceIds.push(value);
    if (el.dataset.act === 'fish-effect') state.fishbones.find(f => f.id === el.dataset.id).effectId = value;
    if (el.dataset.act === 'event-add-evidence') eventSource(eventFind(el.dataset.id).event).evidenceIds.push(value);
    if (el.dataset.act === 'spec-add-test') curSpec().tests.push({causeId: value, marks: {}});
    if (el.dataset.act === 'timeline-effect') state.timelines.find(t => t.id === el.dataset.id).effectId = value;
    if (el.dataset.act === 'compare-add-evidence') compareRow(el.dataset.id).evidenceIds.push(value);
    if (el.dataset.act === 'compare-link-event') compareRow(el.dataset.id).eventId = value;
    if (el.dataset.act === 'compare-to-spec') {
      const field = compareToSpec(el.dataset.id, value);
      setStatus(`Added to ${specLabel(specRow(value))} of the Is / Is Not, under ${field === 'change' ? 'Changed' : 'Distinctive'}`);
    }
    if (el.dataset.act === 'compare-to-timeline') {
      compareToTimeline(el.dataset.id, value);
      setStatus(`Added to the sequence of events, under ${timelinePhase(value).name.trim() || 'an unnamed phase'}, as a deviation`);
    }
    render(); persist();
  }
  if (e.target.id === 'fishPreset') fishPreset = e.target.value;
  if (e.target.id === 'timelinePreset') timelinePreset = e.target.value;
  if (e.target.id === 'compareOnly') { compareOnly = e.target.checked; render(); }
  // A changed time puts the event in its place; after the focus has moved, so it stays where it went.
  if (e.target.type === 'datetime-local') setTimeout(render);
  const radio = e.target.closest('input[data-act="lead"]');
  if (radio) { state.meta.leadId = radio.dataset.id; persist(); }
});

$('records').addEventListener('click', e => {
  const el = e.target.closest('button[data-act]');
  if (!el) return;
  const {act, id} = el.dataset;
  const row = list => state[list].find(r => r.id === id);
  let focusId = null;
  switch (act) {
    case 'goto-node':
      selected = el.dataset.node; highlight = null;
      reveal(selected);
      showRecord('chart');
      return;
    case 'goto-record': showRecord(el.dataset.v); return;
    case 'goto-spec': showRecord('spec', id); return;
    case 'spec-problem': specRoot = id; render(); return;
    case 'add-problem': {
      const n = addTree();
      render(); persist();
      const input = document.querySelector(`#records [data-list="node"][data-id="${n.id}"]`);
      input?.scrollIntoView({block: 'center'}); input?.focus(); input?.select();
      setStatus(`Added ${problemName(n.id)}: state it, then build its tree on the chart`);
      return;
    }
    case 'remove-problem': {
      const ids = deletionSet(id), others = ids.length - 1;
      if (!confirm(`Remove ${problemName(id)}, “${byId(id).title}”, with its Is / Is Not${others ? ` and the ${plural(others, 'cause')} only it has` : ''}?`)) return;
      deleteNodes(ids);
      setStatus('Problem removed');
      break;
    }
    case 'compare-start': {
      const added = compareFromEquipment();
      setStatus(added ? `Added ${plural(added, 'factor')} from the equipment record` : 'Started with one empty factor');
      break;
    }
    case 'compare-add-row': focusId = addCompareRow(el.dataset.v).id; break;
    case 'compare-delete-row': state.comparison.rows = state.comparison.rows.filter(r => r.id !== id); break;
    case 'compare-to-chart':
      compareToChart(id);
      setStatus(`Added "${compareText(compareRow(id))}" to the chart`);
      break;
    case 'compare-remove-evidence': compareRow(id).evidenceIds = compareRow(id).evidenceIds.filter(x => x !== el.dataset.evidence); break;
    case 'compare-unlink-event': compareRow(id).eventId = ''; break;
    case 'show-evidence':
      highlight = id; selected = null;
      citingNodes(id).forEach(n => reveal(n.id));
      showRecord('chart');
      return;
    case 'spec-add-row': {
      const rows = curSpec().rows, row = blankSpecRow(el.dataset.dim);
      const last = rows.findLastIndex(r => r.dim === row.dim);
      rows.splice(last < 0 ? rows.length : last + 1, 0, row); focusId = row.id;
      break;
    }
    case 'spec-delete-row':
      curSpec().rows = curSpec().rows.filter(r => r.id !== id);
      for (const t of curSpec().tests) delete t.marks[id];
      break;
    case 'spec-mark': {
      const marks = specTest(id).marks, order = ['', ...Object.keys(SPEC_MARKS)], row = el.dataset.row;
      const next = order[(order.indexOf(marks[row] || '') + 1) % order.length];
      if (next) marks[row] = next; else delete marks[row];
      render(); persist();
      document.querySelector(`#records [data-act="spec-mark"][data-id="${id}"][data-row="${row}"]`)?.focus();
      return;
    }
    case 'spec-remove-test': curSpec().tests = curSpec().tests.filter(t => t.causeId !== id); break;
    case 'spec-add-all': for (const n of specCandidates()) curSpec().tests.push({causeId: n.id, marks: {}}); break;
    case 'add-chain': focusId = addChain().steps[0].id; break;
    case 'delete-chain': {
      const chain = state.fiveWhys.find(c => c.id === id);
      if (chain.steps.some(s => whyAnswer(s).trim()) && !confirm(`Delete this chain of ${chain.steps.length} why${chain.steps.length > 1 ? 's' : ''}? Steps added to the chart stay on the chart.`)) return;
      state.fiveWhys = state.fiveWhys.filter(c => c !== chain);
      break;
    }
    case 'add-step': {
      const step = blankStep();
      state.fiveWhys.find(c => c.id === id).steps.push(step); focusId = step.id;
      break;
    }
    case 'delete-step': {
      const chain = chainOf(id);
      chain.steps = chain.steps.filter(s => s.id !== id);
      break;
    }
    case 'step-kind': {
      const step = stepById(id);
      stepSource(step).kind = el.dataset.v;
      if (!stepNode(step)) step.kind = el.dataset.v;
      break;
    }
    case 'step-remove-evidence': {
      const src = stepSource(stepById(id));
      src.evidenceIds = src.evidenceIds.filter(x => x !== el.dataset.evidence);
      break;
    }
    case 'step-to-chart': {
      const chain = chainOf(id), problem = stepToChart(chain, chain.steps.findIndex(s => s.id === id));
      if (problem) { setStatus(problem); return; }
      setStatus(`Added "${whyAnswer(stepById(id))}" to the chart`);
      break;
    }
    case 'chain-to-chart': {
      const added = chainToChart(state.fiveWhys.find(c => c.id === id));
      setStatus(`Added ${added} step${added === 1 ? '' : 's'} to the chart`);
      break;
    }
    case 'add-fishbone': focusId = addFishbone(fishPreset, state.problem.primaryEffectId).categories[0]?.id; break;
    case 'delete-fishbone': {
      const f = state.fishbones.find(x => x.id === id), n = f.categories.flatMap(g => g.causes).length;
      if (n && !confirm(`Delete this diagram and its ${n} possible cause${n > 1 ? 's' : ''}? Causes on the chart or ruled out stay there.`)) return;
      state.fishbones = state.fishbones.filter(x => x !== f);
      break;
    }
    case 'fish-export': exportFishbone(state.fishbones.find(f => f.id === id), el.dataset.v); return;
    case 'add-fish-category': {
      const g = {id: uuid(), name: '', causes: []};
      state.fishbones.find(f => f.id === id).categories.push(g); focusId = g.id;
      break;
    }
    case 'delete-fish-category': {
      const g = fishCategory(id), f = state.fishbones.find(x => x.categories.includes(g));
      if (g.causes.length && !confirm(`Remove the ${g.name.trim() || 'unnamed'} category and its ${g.causes.length} possible cause${g.causes.length > 1 ? 's' : ''}? Causes on the chart or ruled out stay there.`)) return;
      f.categories = f.categories.filter(x => x !== g);
      break;
    }
    case 'add-fish-cause': {
      const c = blankFishCause();
      fishCategory(id).causes.push(c); focusId = c.id;
      break;
    }
    case 'add-fish-sub': {
      const c = blankFishCause(id);
      fishFind(id).category.causes.push(c); focusId = c.id;
      break;
    }
    case 'delete-fish-cause': {
      const subs = fishFind(id).category.causes.filter(c => c.parentId === id).length;
      if (subs && !confirm(`Remove this possible cause and its ${subs} sub-cause${subs > 1 ? 's' : ''}?`)) return;
      deleteFishCause(id);
      break;
    }
    case 'fish-kind': {
      const c = fishFind(id).cause;
      fishSource(c).kind = el.dataset.v;
      c.kind = el.dataset.v;
      break;
    }
    case 'fish-remove-evidence': {
      const src = fishSource(fishFind(id).cause);
      src.evidenceIds = src.evidenceIds.filter(x => x !== el.dataset.evidence);
      break;
    }
    case 'fish-to-chart': {
      const problem = fishToChart(id);
      if (problem) { setStatus(problem); return; }
      setStatus(`Added "${fishText(fishFind(id).cause)}" to the chart`);
      break;
    }
    case 'fish-rule-out':
      fishRuleOut(id);
      setStatus(`Moved "${fishText(fishFind(id).cause)}" to the causes ruled out`);
      break;
    case 'fish-restore': {
      const r = fishRuled(fishFind(id).cause);
      if (r?.test.trim() && !confirm('Restore this cause to test again? It leaves the causes ruled out, with the test written there.')) return;
      fishRestore(id);
      break;
    }
    case 'add-timeline': focusId = addTimeline(timelinePreset, state.problem.primaryEffectId).phases[0]?.id; break;
    case 'delete-timeline': {
      const t = state.timelines.find(x => x.id === id), n = t.phases.flatMap(p => p.events).length;
      if (n && !confirm(`Delete this timeline and its ${plural(n, 'event')}? Events on the chart stay there.`)) return;
      state.timelines = state.timelines.filter(x => x !== t);
      break;
    }
    case 'timeline-export': exportTimeline(state.timelines.find(t => t.id === id), el.dataset.v); return;
    case 'add-phase': {
      const p = {id: uuid(), name: '', events: []};
      state.timelines.find(t => t.id === id).phases.push(p); focusId = p.id;
      break;
    }
    case 'delete-phase': {
      const p = timelinePhase(id), t = state.timelines.find(x => x.phases.includes(p));
      if (p.events.length && !confirm(`Remove the ${p.name.trim() || 'unnamed'} phase and its ${plural(p.events.length, 'event')}? Events on the chart stay there.`)) return;
      t.phases = t.phases.filter(x => x !== p);
      break;
    }
    case 'add-event': {
      const p = timelinePhase(id), ev = blankEvent(eventsInOrder(p).filter(x => x.start).at(-1)?.start ?? '');
      p.events.push(ev); focusId = ev.id;
      break;
    }
    case 'delete-event': {
      const {phase} = eventFind(id);
      phase.events = phase.events.filter(ev => ev.id !== id);
      break;
    }
    case 'event-kind': {
      const ev = eventFind(id).event;
      eventSource(ev).kind = el.dataset.v;
      ev.kind = el.dataset.v;
      break;
    }
    case 'event-deviation': eventFind(id).event.deviation = !eventFind(id).event.deviation; break;
    case 'event-remove-evidence': {
      const src = eventSource(eventFind(id).event);
      src.evidenceIds = src.evidenceIds.filter(x => x !== el.dataset.evidence);
      break;
    }
    case 'event-to-chart':
      eventToChart(id);
      setStatus(`Added "${eventText(eventFind(id).event)}" to the chart`);
      break;
    case 'deviations-to-chart': {
      const added = deviationsToChart(state.timelines.find(t => t.id === id));
      setStatus(`Added ${plural(added, 'deviation')} to the chart`);
      break;
    }
    case 'show-ruled': showRecord('ruledOut', id); return;
    case 'add-member': {
      const m = {id: uuid(), name: '', role: ''};
      state.meta.team.push(m); focusId = m.id;
      break;
    }
    case 'delete-member':
      state.meta.team = state.meta.team.filter(m => m.id !== id);
      if (state.meta.leadId === id) state.meta.leadId = '';
      break;
    case 'add-evidence': focusId = addEvidence().id; break;
    case 'delete-evidence': {
      const ev = evidenceById(id), uses = citingNodes(id).length + citingRuledOut(id).length;
      if (uses && !confirm(`${ev.code} is cited ${uses} time${uses > 1 ? 's' : ''}. Delete it and remove those citations? The code ${ev.code} will not be reused.`)) return;
      deleteEvidence(id);
      break;
    }
    case 'add-ruled': {
      const r = {id: uuid(), cause: '', kind: '', test: '', evidenceIds: [], status: 'ruled-out'};
      state.ruledOut.push(r); focusId = r.id;
      break;
    }
    case 'delete-ruled': deleteRuledOut(id); break;
    case 'ruled-remove-evidence': row('ruledOut').evidenceIds = row('ruledOut').evidenceIds.filter(x => x !== el.dataset.evidence); break;
    case 'add-solution': focusId = addSolution().id; break;
    case 'delete-solution': {
      const linked = actionsOf(id).length;
      if (linked && !confirm(`${linked} action${linked > 1 ? 's are' : ' is'} linked to this solution. Delete the solution? The actions stay, without a solution.`)) return;
      state.solutions = state.solutions.filter(s => s.id !== id);
      for (const a of state.actions) if (a.solutionId === id) a.solutionId = '';
      break;
    }
    case 'solution-remove-cause': row('solutions').causeIds = row('solutions').causeIds.filter(x => x !== el.dataset.node); break;
    case 'criterion': {
      const c = row('solutions').criteria[el.dataset.key];
      c.v = c.v === el.dataset.v ? '' : el.dataset.v;
      break;
    }
    case 'decision': row('solutions').decision = row('solutions').decision === el.dataset.v ? '' : el.dataset.v; break;
    case 'add-action-for': {
      const a = addAction(id);
      render(); persist();
      showRecord('actions', a.id);
      return;
    }
    case 'add-action': focusId = addAction().id; break;
    case 'delete-action': state.actions = state.actions.filter(a => a.id !== id); break;
    default: return;
  }
  render(); persist();
  if (focusId) {
    // A new event is named first; its time is filled in from the event before it.
    const target = document.querySelector(`#records textarea[data-event="${focusId}"]`) ?? document.querySelector(`#records [data-id="${focusId}"][data-field]`);
    target?.scrollIntoView({block: 'center'});
    target?.focus();
  }
});

// Enter in a why's answer goes to the next why, adding one after the last. In a fishbone, it adds
// the next possible cause beside this one; in a timeline, the next event, at this one's end or start.
$('records').addEventListener('keydown', e => {
  const field = e.target.closest('textarea.answer');
  if (!field || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  if (field.dataset.event) {
    const {phase, event} = eventFind(field.dataset.event), next = blankEvent(event.end || event.start);
    phase.events.push(next);
    render(); persist();
    document.querySelector(`#records textarea[data-event="${next.id}"]`)?.focus();
    return;
  }
  if (field.dataset.fish) {
    const {category, cause} = fishFind(field.dataset.fish), next = blankFishCause(cause.parentId);
    category.causes.splice(category.causes.indexOf(cause) + 1, 0, next);
    render(); persist();
    document.querySelector(`#records textarea[data-fish="${next.id}"]`)?.focus();
    return;
  }
  const chain = chainOf(field.dataset.step), i = chain.steps.findIndex(s => s.id === field.dataset.step);
  let next = chain.steps[i + 1];
  if (!next) { next = blankStep(); chain.steps.push(next); render(); persist(); }
  document.querySelector(`#records [data-step="${next.id}"]`)?.focus();
});

// The figures: clicking a cause, a category, an event, or a phase goes to its field; the one being edited is lit.
$('records').addEventListener('click', e => {
  const row = e.target.closest('.fish-row'), cat = e.target.closest('.fish-cat[data-fish-cat]');
  const event = e.target.closest('.tl-row'), phase = e.target.closest('.tl-phase');
  const target = row ? `textarea[data-fish="${row.dataset.fish}"]` : cat ? `[data-list="fishCats"][data-id="${cat.dataset.fishCat}"]`
    : event ? `textarea[data-event="${event.dataset.event}"]` : phase ? `[data-list="phases"][data-id="${phase.dataset.phase}"]` : null;
  const field = target && document.querySelector(`#records ${target}`);
  if (!field) return;
  field.scrollIntoView({block: 'nearest'});
  field.focus();
});
// An event is lit while any of its fields has the focus.
const eventOf = el => el?.closest?.('.tl-event')?.querySelector('[data-event]')?.dataset.event ?? null;
$('records').addEventListener('focusin', e => {
  const id = e.target.dataset?.fish ?? null;
  if (id !== fishOn) { fishOn = id; refreshFishFigures(); }
  const ev = eventOf(e.target);
  if (ev !== eventOn) { eventOn = ev; refreshTimelineFigures(); }
});
$('records').addEventListener('focusout', e => {
  if (fishOn && !e.relatedTarget?.dataset?.fish) { fishOn = null; refreshFishFigures(); }
  if (eventOn && eventOf(e.relatedTarget) !== eventOn) { eventOn = null; refreshTimelineFigures(); }
});

document.querySelectorAll('.rail [data-record]').forEach(b => b.onclick = () => showRecord(b.dataset.record));

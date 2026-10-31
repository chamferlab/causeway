// Output: chart, fishbone, and timeline export as SVG and PNG, the printed report, and the light and dark themes.

// ---- Chart images ----
// Exports and print show the whole chart, with every branch expanded, in the light palette.

function fullLayout() {
  const shown = collapsed;
  collapsed = new Set();
  try { return computeLayout(); } finally { collapsed = shown; }
}
const CHART_PAD = 28;      // room around the boxes for stop bars, "?" badges, and outlines

// A self-contained SVG of the chart, or of the part of it inside `area` (chart units).
function chartSvg(l, {area, heading = true, scale = 1} = {}) {
  const b = l.bounds;
  const full = {x: b.l - CHART_PAD, y: b.t - CHART_PAD, w: b.r - b.l + 2 * CHART_PAD, h: b.b - b.t + 2 * CHART_PAD};
  const v = area || full, top = heading ? 44 : 0;
  const w = v.w * scale, h = (v.h + top) * scale;
  let s = `<svg xmlns="${NS}" width="${w}" height="${h}" viewBox="${v.x} ${v.y - top} ${v.w} ${v.h + top}" font-family="${escapeHtml(CHART_FONT)}">`;
  s += `<title>${escapeHtml(rcaName())}</title>`;
  s += `<rect x="${v.x}" y="${v.y - top}" width="${v.w}" height="${v.h + top}" fill="${CHART_COLORS.panel}"/>`;
  if (heading) {
    const meta = [state.meta.rcaNumber, state.meta.equipmentTag, today()].filter(x => x?.trim()).join(' · ');
    s += `<text x="${v.x + CHART_PAD}" y="${v.y - top + 22}" font-size="15" font-weight="700" fill="${CHART_COLORS.stop}">${escapeHtml(primaryEffect()?.title || 'Untitled RCA')}</text>`;
    s += `<text x="${v.x + CHART_PAD}" y="${v.y - top + 38}" font-size="10.5" fill="#5b6b7a">${escapeHtml(meta)}</text>`;
  }
  s += chartMarkup(l, {issues: issueMap(ruleIssues())});
  return s + '</svg>';
}

const rcaName = () => [state.meta.rcaNumber, primaryEffect()?.title].filter(x => x?.trim()).join(' · ') || 'Untitled RCA';

function exportSvg() {
  showMenu(false);
  download(baseName() + '-chart.svg', new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + chartSvg(fullLayout())], {type: 'image/svg+xml'}));
  setStatus(`Exported ${baseName()}-chart.svg`);
}

async function exportPng() {
  showMenu(false);
  await savePng(chartSvg(fullLayout()), baseName() + '-chart.png');
}

// The SVG is drawn into a canvas at twice its size, or less where browsers limit canvas size.
async function svgPng(svgText) {
  const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svgText).map(Number);
  const scale = Math.min(2, 16000 / Math.max(w, h), Math.sqrt(120e6 / (w * h)));
  const url = URL.createObjectURL(new Blob([svgText], {type: 'image/svg+xml'}));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(done => canvas.toBlob(done, 'image/png'));
    if (!blob) throw Error('the browser could not encode the image');
    return {blob, w, h};
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function savePng(svgText, name) {
  try {
    download(name, (await svgPng(svgText)).blob);
    setStatus(`Exported ${name}`);
  } catch (err) {
    alert('Could not export the PNG: ' + err.message);
  }
}

// Each fishbone is exported on its own; a second one is numbered.
function exportTimeline(t, format) {
  const i = state.timelines.indexOf(t), name = `${baseName()}-timeline${i ? '-' + (i + 1) : ''}.${format}`;
  if (format === 'png') { savePng(timelineSvg(t), name); return; }
  download(name, new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + timelineSvg(t)], {type: 'image/svg+xml'}));
}
function exportFishbone(f, format) {
  const i = state.fishbones.indexOf(f), name = `${baseName()}-fishbone${i ? '-' + (i + 1) : ''}.${format}`;
  if (format === 'png') { savePng(fishboneSvg(f), name); return; }
  download(name, new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + fishboneSvg(f)], {type: 'image/svg+xml'}));
  setStatus(`Exported ${name}`);
}

// The Export and Print menus: one open at a time, closed by a click elsewhere or Esc.
const MENUS = {exportMenu: 'exportButton', printMenu: 'printReport'};
function showMenu(open, menu = 'exportMenu') {
  for (const [id, button] of Object.entries(MENUS)) {
    const show = open && id === menu;
    $(id).hidden = !show;
    $(button).setAttribute('aria-expanded', show);
  }
  if (open) menuItems(menu)[0]?.focus();
}
// The items shown: each module hides the other's.
const menuItems = menu => [...$(menu).querySelectorAll('button')].filter(b => b.offsetParent !== null);
for (const [menu, button] of Object.entries(MENUS)) {
  $(button).onclick = () => showMenu($(menu).hidden, menu);
  $(menu).addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { showMenu(false); $(button).focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = menuItems(menu), i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  });
}
$('exportSvg').onclick = exportSvg;
$('exportPng').onclick = exportPng;
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu-wrap')) showMenu(false); });

// ---- Printed report ----
// Built just before printing, so Ctrl+P prints the current RCA as well.

// The printable area of a landscape A4 or Letter page, less the chart heading, in CSS pixels.
const PRINT_W = 1000, PRINT_H = 600, PRINT_MIN_SCALE = 0.55;

// The chart as one or more page-sized figures. When it cannot fit one page at a readable size, it is
// split into tiles; horizontal cuts fall between columns, so no box is cut across.
function chartFigures() {
  const l = fullLayout(), b = l.bounds;
  const cw = b.r - b.l + 2 * CHART_PAD, ch = b.b - b.t + 2 * CHART_PAD;
  const fit = Math.min(1, PRINT_W / cw, PRINT_H / ch);
  if (fit >= PRINT_MIN_SCALE) return [`<figure>${chartSvg(l, {heading: false, scale: fit})}</figure>`];
  const s = PRINT_MIN_SCALE, column = NODE_W + COL_GAP;
  const perTile = Math.max(1, Math.floor((PRINT_W / s - 2 * CHART_PAD) / column));
  const tileW = perTile * column, tileH = PRINT_H / s;
  const cols = Math.ceil((b.r - b.l + COL_GAP) / tileW), rows = Math.ceil(ch / tileH);
  const figures = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const area = {x: b.l - CHART_PAD + c * tileW, y: b.t - CHART_PAD + r * tileH, w: tileW + (c === cols - 1 ? 2 * CHART_PAD : CHART_PAD), h: Math.min(tileH, ch - r * tileH)};
    figures.push(`<figure>${chartSvg(l, {area, heading: false, scale: s})}<figcaption>Chart, part ${figures.length + 1} of ${rows * cols}: row ${r + 1}, column ${c + 1}. Read left to right.</figcaption></figure>`);
  }
  return figures;
}

// The pieces every layout shares.
const rText = v => v?.trim() ? escapeHtml(v) : '<span class="r-none">—</span>';
const rItem = (label, value) => `<div><dt>${label}</dt><dd>${rText(value)}</dd></div>`;
const rTable = (heads, rows, none) => rows.length
  ? `<table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
  : `<p class="r-none">${none}</p>`;
const rCodes = ids => ids.map(evidenceById).filter(Boolean).map(e => `<span class="r-code">${escapeHtml(e.code)}</span>`).join(' ') || '—';
const rLead = () => { const m = state.meta, lead = m.team.find(t => t.id === m.leadId); return lead && `${lead.name}${lead.role ? ', ' + lead.role : ''}`; };

// The cover: what, which equipment, where the RCA stands, and its references.
function reportCover(kind) {
  const m = state.meta;
  return `<header class="r-cover">
      <div class="r-kicker">${kind}${m.rcaNumber ? ' · ' + escapeHtml(m.rcaNumber) : ''}${m.revision ? ' · Revision ' + escapeHtml(m.revision) : ''}</div>
      <h1>${escapeHtml(primaryEffect()?.title || 'Untitled RCA')}</h1>
      <dl class="r-grid">
        ${rItem('Equipment / tag', m.equipmentTag)}${rItem('Seal type', m.sealType)}${rItem('Status', RCA_STATUS[m.status])}${rItem('Customer reference', m.customerRef)}
        ${rItem('Event', m.dates.eventDate)}${rItem('RCA opened', m.dates.opened)}${rItem('RCA closed', m.dates.closed)}${rItem('Report date', today())}
      </dl>
    </header>`;
}

// Sign-off, with room to sign by hand.
const reportSignoff = () => `<section class="r-signoff">
    <h2>Sign-off</h2>
    <table class="r-sign"><thead><tr><th>Role</th><th>Name</th><th>Date</th><th>Signature</th></tr></thead><tbody>${Object.entries(SIGNOFF_ROLES).map(([k, label]) =>
      `<tr><td>${label}</td><td>${rText(state.meta.signoff[k].name)}</td><td class="r-crit">${rText(state.meta.signoff[k].date)}</td><td class="r-signature"></td></tr>`).join('')}</tbody></table>
  </section>`;

// The root causes, by type: typed causes, and those whose branch stops at a solution.
function rootCauses() {
  const live = reachable();
  return state.nodes.filter(n => live.has(n.id) && isCause(n) && !isRuledOut(n) && (n.causeType || n.stopPoint?.reason === 'solution-found'));
}
// A root cause that is one of alternatives not yet settled says so, with the others.
function orNote(n) {
  const effect = effectsOf(n.id).find(e => alternativesOf(e.id, n.id).length);
  return effect ? `One of: ${[n, ...alternativesOf(effect.id, n.id)].map(c => c.title).join(' / ')} (being tested)` : '';
}
// A cause's chain up to the primary effect, along its first effect.
function causeChain(n) {
  const chain = [n], seen = new Set([n.id]);
  for (let e = effectsOf(n.id)[0]; e && !seen.has(e.id); e = effectsOf(e.id)[0]) { chain.push(e); seen.add(e.id); }
  return chain;
}
const actionsOfKind = (...kinds) => state.actions.filter(a => kinds.includes(a.kind));
const actionRows = actions => actions.map(a => `<tr><td>${rText(a.action)}${ACTION_STRENGTH[a.strength] ? `<small class="r-tags">${ACTION_STRENGTH[a.strength]} action</small>` : ''}</td><td>${rText(a.owner)}</td>
  <td class="r-crit">${rText(a.due)}${isOverdue(a) ? '\n<b class="r-issue-error">Overdue</b>' : ''}</td><td>${rText(a.verification)}</td><td>${ACTION_STATUS[a.status] || ''}</td>
  <td>${[a.effectiveness.date, a.effectiveness.result].filter(x => x?.trim()).map(escapeHtml).join('\n') || '—'}</td></tr>`);
const ACTION_HEADS = ['Action', 'Owner', 'Due', 'Verification', 'Status', 'Effectiveness check'];

// Failed vs good in a report: the cases, then the factors that differ only, with a note saying so.
function compareReport(heading) {
  const rows = compareDiffs();
  if (!rows.length) return '';
  const c = state.comparison;
  return `${heading}
    <dl class="r-grid">${c.cases.map((x, i) => rItem(i ? `Good case ${i}` : 'Failed case', [x.name, x.why].filter(v => v.trim()).join('\n'))).join('')}</dl>
    <p class="r-legend">${COMPARE_NOTE}</p>
    ${rTable(['Factor', ...[0, 1, 2].map(i => escapeHtml(compareCaseName(i))), 'Explains it?', 'Evidence', 'When it changed'], rows.map(r => `<tr><td><b>${rText(r.factor)}</b></td>
      <td>${rText(compareFailed(r))}</td><td>${rText(r.good[0])}</td><td>${rText(r.good[1])}</td>
      <td>${compareExplains(r) ? `<b>${COMPARE_EXPLAINS[r.explains]}</b>` : COMPARE_EXPLAINS[r.explains] || '—'}${compareNode(r) ? '\nOn the chart' : ''}</td>
      <td>${rCodes(r.evidenceIds)}</td><td>${rText(compareWhen(r))}</td></tr>`), '')}`;
}

function fullReport() {
  const m = state.meta, p = state.problem, sig = p.significance;
  const text = rText, item = rItem, table = rTable, codes = rCodes, lead = m.team.find(t => t.id === m.leadId);
  const issues = ruleIssues().filter(i => i.level !== 'info');

  return `
    ${reportCover('Root cause analysis')}
    <dl class="r-grid r-team">${item('Lead', rLead())}${item('Team', m.team.filter(t => t.id !== m.leadId).map(t => `${t.name}${t.role ? ' (' + t.role + ')' : ''}`).join('\n'))}</dl>
    <section>
      <h2>Problem definition</h2>
      ${problemStatements(item)}
      <h3>Significance</h3>
      <dl class="r-grid">${item('Safety', sig.safety)}${item('Environment', sig.environment)}${item('Production / cost', sig.productionCost)}${item('Reliability', sig.reliability)}</dl>
      ${equipmentFilled() ? `<h3>Equipment and duty</h3>${EQUIPMENT_SECTIONS.filter(s => s.fields.some(f => state.equipment[f[0]]?.trim())).map(s => `<h4>${s.title}</h4>
        <dl class="r-grid">${s.fields.filter(f => state.equipment[f[0]]?.trim()).map(([key, label]) => item(label, state.equipment[key])).join('')}${s.title === 'History' && runTime() ? item('Run time', runTime()) : ''}</dl>`).join('')}` : ''}
    </section>
    <section class="r-page">
      <h2>${treeStyle() ? 'Cause tree' : 'Cause-and-effect chart'}</h2>
      <p class="r-legend">${treeStyle()
        ? 'Read left to right: each effect, then its possible causes. Red: primary effect. Solid teal, with a bold link: confirmed. White, dashed, H: hypothesis, still to test. Grey, RULED OUT, ✕: ruled out. E-codes: evidence. Orange badge: no evidence. Double bar and STOP: stop point. OCCURRENCE, ESCAPE, SYSTEMIC on the top line: root cause type. Dashed purple: a further link of a shared cause.'
        : 'Read left to right: each effect, then the causes that were all needed for it (AND). OR, dashed: alternatives, one of which was needed, still to settle. Red: primary effect. Dark: action. Light: condition. E-codes: evidence. ?: no evidence or unverified. Double bar and STOP: stop point. OCCURRENCE, ESCAPE, SYSTEMIC on the top line: root cause type. Dashed purple: a further link of a shared cause.'}</p>
      ${chartFigures().join('')}
      ${issues.length ? `<h3>Open rule issues</h3><ul>${issues.map(i => `<li class="${i.level === 'error' ? 'r-issue-error' : ''}">${escapeHtml(issueTitle(i))}: ${escapeHtml(i.text)}</li>`).join('')}</ul>` : ''}
    </section>
    ${state.fiveWhys.length ? `<section class="r-page">
      <h2>5 Whys</h2>
      ${state.fiveWhys.map(c => `<h3>Why did “${escapeHtml(byId(c.effectId)?.title || '')}” happen?</h3>
        <ol class="r-whys">${c.steps.map(s => `<li>${text(whyAnswer(s))} <span class="r-none">${[KINDS[stepNode(s)?.kind ?? s.kind]?.name, codes(stepSource(s).evidenceIds).replace(/^—$/, ''), stepNode(s) ? 'on the chart' : ''].filter(Boolean).join(' · ')}</span></li>`).join('')}</ol>`).join('')}
    </section>` : ''}
    ${state.fishbones.length ? `<section class="r-page">
      <h2>Fishbone</h2>
      ${state.fishbones.map(f => {
        const svg = fishboneSvg(f), [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg).map(Number);
        const rows = f.categories.flatMap(g => fishRows(g).map(c => `<tr><td>${escapeHtml(g.name)}</td><td>${c.parentId ? '↳ ' : ''}${text(fishText(c))}</td>
          <td>${KINDS[fishKind(c)]?.name || ''}</td><td>${codes(fishSource(c).evidenceIds)}</td><td>${{chart: 'On the chart', ruled: 'Ruled out', open: '<b>To test</b>'}[fishStatus(c)]}</td></tr>`));
        return `<h3>Possible causes of “${escapeHtml(byId(f.effectId)?.title || '')}”</h3>
          <figure class="r-fish">${fishboneSvg(f, {scale: Math.min(1, PRINT_W / w, PRINT_H / h)})}</figure>
          ${table(['Category', 'Possible cause', 'Type', 'Evidence', 'Status'], rows, 'No possible causes recorded.')}`;
      }).join('')}
    </section>` : ''}
    ${allSpecs().some(sp => specFacts(sp).length) ? `<section class="r-page">
      <h2>Is / Is Not</h2>
      ${rootIds().filter(root => specFacts(specOf(root)).length).map(root => {
        const sp = specOf(root), facts = specFacts(sp), tests = sp.tests.filter(t => byId(t.causeId));
        return `${rootIds().length > 1 ? `<h3>${problemName(root)}: ${escapeHtml(byId(root).title)}</h3>` : ''}
      ${table(['Question', 'Is', 'Is not', 'Distinctive about the IS', 'Changed'], facts.map(r => `<tr><td><b>${specLabel(r)}</b> ${text(r.question)}</td>
        <td>${text(r.is)}</td><td>${text(r.isNot)}</td><td>${text(r.distinction)}</td><td>${text(r.change)}</td></tr>`), '')}
      ${tests.length ? `<h4>Possible causes tested against the facts</h4>
        ${table(['Cause', ...facts.map(specLabel), 'Result'], tests.map(t => `<tr><td>${text(byId(t.causeId).title)}</td>
          ${facts.map(f => `<td class="r-mark">${SPEC_MARKS[t.marks[f.id]]?.mark || '·'}</td>`).join('')}<td>${specSummary(specResult(t, sp))}</td></tr>`), '')}
        <p class="r-legend">✓ explains why the problem is here and not there; ? only if an assumption holds; ✕ does not explain it.</p>` : ''}`;
      }).join('')}
    </section>` : ''}
    ${compareDiffs().length ? `<section class="r-page">${compareReport('<h2>Failed vs good</h2>')}</section>` : ''}
    ${state.timelines.length ? `<section class="r-page">
      <h2>Sequence of events</h2>
      ${state.timelines.map(t => {
        const svg = timelineSvg(t), [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg).map(Number);
        const when = ev => [ev.start, ev.end].filter(Boolean).map(v => v.replace('T', ' ')).join(' to ');
        const rows = t.phases.flatMap(p => eventsInOrder(p).map(ev => `<tr><td>${escapeHtml(p.name)}</td><td class="r-crit">${text(when(ev))}</td>
          <td>${ev.deviation ? '<b>' + text(eventText(ev)) + '</b>' : text(eventText(ev))}</td><td>${ev.deviation ? '<b>Deviation</b>' : ''}</td>
          <td>${codes(eventSource(ev).evidenceIds)}</td><td>${eventNode(ev) ? 'On the chart' : ''}</td></tr>`));
        return `<h3>Events leading to “${escapeHtml(byId(t.effectId)?.title || '')}”</h3>
          <figure class="r-timeline">${timelineSvg(t, {scale: Math.min(1, PRINT_W / w, PRINT_H / h)})}</figure>
          ${table(['Phase', 'When', 'Event', 'Deviation', 'Evidence', 'Chart'], rows, 'No events recorded.')}`;
      }).join('')}
    </section>` : ''}
    <section class="r-page">
      <h2>Evidence log</h2>
      ${table(['Code', 'Description', 'Type', 'Source / location', 'Collected by', 'Date', 'Cited by'], state.evidence.map(e => `<tr>
        <td class="r-code">${escapeHtml(e.code)}</td><td>${text(e.description)}</td><td>${EVIDENCE_TYPES[e.type] || ''}</td><td>${text(e.source)}</td>
        <td>${text(e.collectedBy)}</td><td class="r-crit">${text(e.date)}</td><td>${citingNodes(e.id).map(n => escapeHtml(n.title)).join('\n') || '—'}</td></tr>`), 'No evidence recorded.')}
    </section>
    <section>
      <h2>Causes ruled out</h2>
      ${table(['Possible cause', 'Type', 'Evidence or test', 'Evidence', 'Status'], [...state.ruledOut.map(r => `<tr>
        <td>${text(r.cause)}</td><td>${{action: 'Action', condition: 'Condition'}[r.kind] || '—'}</td><td>${text(r.test)}</td><td>${codes(r.evidenceIds)}</td><td>${RULED_OUT_STATUS[r.status] || ''}</td></tr>`),
        ...treeRuledOut().map(n => `<tr><td>${text(n.title)}</td><td>—</td><td>${text(n.test)}</td><td>${codes(n.evidenceIds)}</td><td>Ruled out, on the tree</td></tr>`)], 'No causes ruled out.')}
    </section>
    <section class="r-page">
      <h2>Solutions</h2>
      ${table(['Solution', 'Attacks', ...Object.values(CRITERIA), 'Decision'], state.solutions.map(s => `<tr>
        <td>${text(s.title)}</td><td>${s.causeIds.map(byId).filter(Boolean).map(n => escapeHtml(n.title)).join('\n') || '—'}</td>
        ${Object.keys(CRITERIA).map(k => `<td><b>${CRITERION_VALUES[s.criteria[k].v] || '—'}</b>${s.criteria[k].c ? '\n' + escapeHtml(s.criteria[k].c) : ''}</td>`).join('')}
        <td><b>${DECISIONS[s.decision] || 'Not decided'}</b></td></tr>`), 'No solutions recorded.')}
    </section>
    <section>
      <h2>Action plan</h2>
      ${table(['Action', 'Solution', 'Owner', 'Due', 'Verification', 'Status', 'Effectiveness check'], state.actions.map(a => `<tr>
        <td>${text(a.action)}<small class="r-tags">${[ACTION_KINDS[a.kind], ACTION_STRENGTH[a.strength] && `${ACTION_STRENGTH[a.strength]} action`].filter(Boolean).join(' · ')}</small></td><td>${text(state.solutions.find(s => s.id === a.solutionId)?.title)}</td><td>${text(a.owner)}</td>
        <td class="r-crit">${text(a.due)}${isOverdue(a) ? '\n<b class="r-issue-error">Overdue</b>' : ''}</td><td>${text(a.verification)}</td><td>${ACTION_STATUS[a.status] || ''}</td>
        <td>${[a.effectiveness.date, a.effectiveness.result].filter(x => x?.trim()).map(escapeHtml).join('\n') || '—'}</td></tr>`), 'No actions recorded.')}
      ${state.problem.readAcross.trim() ? `<h3>Read-across</h3><p class="r-read">${escapeHtml(state.problem.readAcross)}</p>` : ''}
    </section>
    ${reportSignoff()}
    <p class="r-foot">Causeway · ${escapeHtml(rcaName())} · printed ${today()}</p>`;
}

// What, when, and where of each problem; headed by its name when there are several.
const problemStatements = item => rootIds().map(root => {
  const at = problemOf(root);
  return `${rootIds().length > 1 ? `<h3>${problemName(root)}</h3>` : ''}<dl class="r-grid two">${item('What', byId(root).title)}${item('When', at.when)}${item('Where', at.where)}</dl>`;
}).join('');

// 8D: the same RCA in the eight disciplines a customer's 8D request asks for.
function report8D() {
  const m = state.meta, p = state.problem, e = state.equipment;
  // The short disciplines stay whole on a page; D2 and D4 may run over.
  const d = (n, title, body) => `<section class="r-d${[2, 4].includes(n) ? '' : ' r-keep'}"><h2><span class="r-dnum">D${n}</span>${title}</h2>${body}</section>`;
  const roots = rootCauses(), groups = [...Object.entries(CAUSE_TYPES), ['', {name: 'Root causes, type not set'}]]
    .map(([k, t]) => [t, roots.filter(n => n.causeType === k)]).filter(([, list]) => list.length);
  const chosen = state.solutions.filter(s => s.decision === 'implement');
  const ruled = [...state.ruledOut.map(r => [r.cause, r.test]), ...treeRuledOut().map(n => [n.title, n.test])];
  const keyData = [['Machine', e.machine], ['Seal', [e.sealModel, e.arrangement].filter(Boolean).join(', ')], ['Seal piping plans', e.sealPlans], ['Product', e.product],
    ['Run time', runTime()], ['How it was found', e.detectedBy], ['Earlier failures', e.previous]].filter(([, v]) => v?.trim());
  return `
    ${reportCover('8D report')}
    ${d(1, 'Team', rTable(['Name', 'Role', ''], m.team.map(t => `<tr><td>${rText(t.name)}</td><td>${rText(t.role)}</td><td>${t.id === m.leadId ? '<b>Lead</b>' : ''}</td></tr>`), 'No team recorded.'))}
    ${d(2, 'Problem description', `${problemStatements(rItem)}<dl class="r-grid two">${rItem('Significance',
      Object.entries({Safety: p.significance.safety, Environment: p.significance.environment, 'Production / cost': p.significance.productionCost, Reliability: p.significance.reliability})
        .filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`).join('\n'))}</dl>
      ${keyData.length ? `<dl class="r-grid">${keyData.map(([k, v]) => rItem(k, v)).join('')}</dl>` : ''}
      ${rootIds().filter(root => specFacts(specOf(root)).length).map(root => `<h3>Is / Is Not${rootIds().length > 1 ? `, ${problemName(root).toLowerCase()}` : ''}</h3>${rTable(['Question', 'Is', 'Is not', 'Distinctive', 'Changed'],
        specFacts(specOf(root)).map(r => `<tr><td><b>${specLabel(r)}</b> ${rText(r.question)}</td>
        <td>${rText(r.is)}</td><td>${rText(r.isNot)}</td><td>${rText(r.distinction)}</td><td>${rText(r.change)}</td></tr>`), '')}`).join('')}`)}
    ${d(3, 'Containment actions', rTable(ACTION_HEADS, actionRows(actionsOfKind('containment')), 'No containment actions recorded.'))}
    ${d(4, 'Root causes', `${groups.length ? groups.map(([t, list]) => `<h3>${t.name}${t.about ? ` <span class="r-sub">${t.about.toLowerCase()}</span>` : ''}</h3>
        ${rTable(['Root cause', 'How it was verified', 'Evidence', 'Chain to the problem'], list.map(n => `<tr><td><b>${escapeHtml(n.title)}</b>${orNote(n) ? `<small class="r-tags">${escapeHtml(orNote(n))}</small>` : ''}</td><td>${rText(n.test)}</td>
          <td>${n.evidenceIds.map(evidenceById).filter(Boolean).map(ev => `<span class="r-code">${escapeHtml(ev.code)}</span> ${escapeHtml(ev.description)}`).join('\n') || '—'}</td>
          <td class="r-chain">${causeChain(n).slice(1).map(x => escapeHtml(shorten(x.title, 60))).join(' → ')}</td></tr>`), '')}`).join('')
      : '<p class="r-none">No root cause identified yet: give the causes a root cause type, or a stop point “Effective solution found”.</p>'}
      ${compareReport('<h3>Failed vs good</h3>')}
      ${ruled.length ? `<h3>Possible causes ruled out</h3>${rTable(['Cause', 'How it was ruled out'], ruled.map(([c, t]) => `<tr><td>${rText(c)}</td><td>${rText(t)}</td></tr>`), '')}` : ''}
      <div class="r-chart-pages"><h3>Cause-and-effect chart</h3>${chartFigures().join('')}</div>`)}
    ${d(5, 'Permanent corrective actions chosen', rTable(['Solution', 'Attacks', 'Prevents recurrence', 'Within our control', 'No new problems'], chosen.map(s => `<tr><td><b>${rText(s.title)}</b></td>
      <td>${s.causeIds.map(byId).filter(Boolean).map(n => escapeHtml(n.title)).join('\n') || '—'}</td>
      ${['preventsRecurrence', 'withinControl', 'noNewProblems'].map(k => `<td>${CRITERION_VALUES[s.criteria[k].v] || '—'}${s.criteria[k].c ? '\n' + escapeHtml(s.criteria[k].c) : ''}</td>`).join('')}</tr>`), 'No solution chosen yet.'))}
    ${d(6, 'Corrective actions implemented and validated', rTable(ACTION_HEADS, actionRows(actionsOfKind('corrective')), 'No corrective actions recorded.'))}
    ${d(7, 'Preventing recurrence', `${rTable(ACTION_HEADS, actionRows(actionsOfKind('preventive')), 'No preventive actions recorded.')}
      <h3>Read-across</h3><p class="r-read">${rText(p.readAcross)}</p>`)}
    ${d(8, 'Closure', `<dl class="r-grid">${rItem('Status', RCA_STATUS[m.status])}${rItem('RCA closed', m.dates.closed)}${rItem('Lead', rLead())}</dl>
      ${closeBlockers().length ? `<p class="r-issue-error">Not ready to close: ${closeBlockers().map(escapeHtml).join('; ')}.</p>` : ''}`)}
    ${reportSignoff()}
    <p class="r-foot">Causeway · ${escapeHtml(rcaName())} · 8D report · printed ${today()}</p>`;
}

// One page for management: the problem, its root causes and how they led to it, the actions, and
// where it stands. The two columns flow, so a long RCA runs on rather than being cut.
function reportSummary() {
  const m = state.meta, p = state.problem, e = state.equipment, roots = rootCauses();
  const key = [['Where', p.where], ['When', p.when], ['Machine', e.machine], ['Seal', [m.sealType || e.sealModel, e.sealPlans && !m.sealType && 'Plan ' + e.sealPlans].filter(Boolean).join(', ')], ['Run time', runTime()]].filter(([, v]) => v?.trim());
  const impact = Object.entries({Safety: p.significance.safety, Environment: p.significance.environment, Cost: p.significance.productionCost, Reliability: p.significance.reliability}).filter(([, v]) => v.trim());
  const live = state.actions.filter(a => a.status !== 'cancelled');
  // The chain from a root cause, shortened: its first steps and the primary effect's own words are on the page already.
  const chain = n => { const c = causeChain(n).slice(1, -1).map(x => escapeHtml(shorten(x.title, 44))); return c.length > 3 ? [...c.slice(0, 2), '…', c.at(-1)] : c; };
  return `
    <header class="r-cover r-cover-short">
      <div class="r-kicker">RCA summary${m.rcaNumber ? ' · ' + escapeHtml(m.rcaNumber) : ''}${m.equipmentTag ? ' · ' + escapeHtml(m.equipmentTag) : ''} · ${RCA_STATUS[m.status]}</div>
      <h1>${escapeHtml(primaryEffect()?.title || 'Untitled RCA')}</h1>
    </header>
    <div class="r-summary">
      <div class="r-block"><h3>The problem</h3>
      <dl class="r-list">${key.map(([k, v]) => rItem(k, v)).join('')}${rootIds().slice(1).map(root => rItem(problemName(root),
        [byId(root).title, problemOf(root).when, problemOf(root).where].map(x => x.trim()).filter(Boolean).join('\n'))).join('')}${impact.map(([k, v]) => rItem(k, v)).join('')}</dl></div>
      <div class="r-block"><h3>Root causes</h3>
      ${roots.length ? `<ul class="r-roots">${roots.map(n => `<li><b>${escapeHtml(n.title)}</b>${n.causeType ? ` <span class="r-tagline">${CAUSE_TYPES[n.causeType].name}</span>` : ''}${orNote(n) ? `<div class="r-chain">${escapeHtml(orNote(n))}</div>` : ''}
        ${chain(n).length ? `<div class="r-chain">→ ${chain(n).join(' → ')}</div>` : ''}</li>`).join('')}</ul>` : '<p class="r-none">Not identified yet.</p>'}</div>
      <div class="r-block"><h3>Actions</h3>
      ${rTable(['Action', 'Kind', 'Owner', 'Due', 'Status', 'Did it work?'], live.map(a => `<tr><td>${rText(a.action)}</td><td>${ACTION_KINDS[a.kind]}${ACTION_STRENGTH[a.strength] ? '\n' + ACTION_STRENGTH[a.strength] : ''}</td>
        <td>${rText(a.owner)}</td><td class="r-crit">${rText(a.due)}${isOverdue(a) ? '\n<b class="r-issue-error">Overdue</b>' : ''}</td><td>${ACTION_STATUS[a.status]}</td>
        <td>${[a.effectiveness.result.trim(), a.effectiveness.date && !a.effectiveness.result.trim() && `Check ${a.effectiveness.date}`].filter(Boolean).map(escapeHtml).join('') || '—'}</td></tr>`), 'No actions yet.')}</div>
      ${p.readAcross.trim() ? `<div class="r-block"><h3>Read-across</h3><p class="r-read">${escapeHtml(p.readAcross)}</p></div>` : ''}
      <div class="r-block"><h3>Sign-off</h3>
      <dl class="r-list">${Object.entries(SIGNOFF_ROLES).map(([k, label]) => rItem(label, [m.signoff[k].name, m.signoff[k].date].filter(Boolean).join(', '))).join('')}</dl>
      <p class="r-foot">Causeway · ${escapeHtml(rcaName())} · summary · printed ${today()}</p></div>
    </div>`;
}

const REPORTS = {full: fullReport, '8d': report8D, summary: reportSummary};
let reportLayout = 'full';   // the layout last chosen; Ctrl+P prints it too
function buildReport() {
  $('report').dataset.layout = reportLayout;
  $('report').innerHTML = REPORTS[reportLayout]();
}
function printReport(layout = reportLayout) {
  reportLayout = layout;
  showMenu(false);
  buildReport();
  window.print();
}
$('printFull').onclick = () => printReport('full');
$('print8d').onclick = () => printReport('8d');
$('printSummary').onclick = () => printReport('summary');
window.addEventListener('beforeprint', buildReport);

// ---- Theme ----
// System follows the operating system; the choice is kept in this browser only.

const THEME_KEY = 'causeway-theme', LEGACY_THEME_KEY = 'apollo-rca-theme';
const THEMES = {system: 'System', light: 'Light', dark: 'Dark'};
let theme = 'system';
try {
  const stored = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
  theme = THEMES[stored] ? stored : 'system';
  if (localStorage.getItem(LEGACY_THEME_KEY)) { localStorage.setItem(THEME_KEY, theme); localStorage.removeItem(LEGACY_THEME_KEY); }
} catch {}
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const darkTheme = () => theme === 'dark' || theme === 'system' && systemDark.matches;

function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  const next = {system: 'light', light: 'dark', dark: 'system'}[theme];
  $('themeButton').title = `Theme: ${THEMES[theme]}. Click for ${THEMES[next]}.`;
  $('themeButton').setAttribute('aria-label', `Theme: ${THEMES[theme]}`);
  if (layout && record === 'chart') renderCanvas();
  if (record === 'fishbone') refreshFishFigures();
  if (record === 'timeline') refreshTimelineFigures();
}
$('themeButton').onclick = () => {
  theme = {system: 'light', light: 'dark', dark: 'system'}[theme];
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  applyTheme();
  setStatus(`Theme: ${THEMES[theme]}`);
};
systemDark.addEventListener('change', () => { if (theme === 'system') applyTheme(); });
applyTheme();

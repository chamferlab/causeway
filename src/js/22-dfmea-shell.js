// The DFMEA in the app's shell: its own undo history, autosave, and file; switching between the RCA
// and the DFMEA; and the top bar's buttons, which act on the module shown.

// ---- Undo history and autosave, as the RCA's (see 02-state.js) ----

let dfmeaUndo = [], dfmeaRedo = [], dfmeaCurrent = null, dfmeaGroup = null, dfmeaSaved = null, dfmeaHandle = null;

function updateDfmeaHistoryButtons() {
  if (appModule !== 'dfmea') return;
  $('undo').disabled = !dfmeaUndo.length;
  $('redo').disabled = !dfmeaRedo.length;
}
const dfmeaDirty = () => dfmeaSaved !== null && JSON.stringify(dfmea) !== dfmeaSaved;
function autosaveDfmea() {
  try { localStorage.setItem(DFMEA_STORAGE_KEY, JSON.stringify({savedAt: new Date().toISOString(), dirty: dfmeaDirty(), dfmea})); }
  catch { setStatus('Autosave unavailable; use Save'); }
}
function dfmeaPersist(group = null) {
  const data = JSON.stringify(dfmea);
  if (dfmeaCurrent !== null && data !== dfmeaCurrent) {
    if (!group || dfmeaGroup !== group) {
      dfmeaUndo.push(dfmeaCurrent);
      if (dfmeaUndo.length > HISTORY_LIMIT) dfmeaUndo.shift();
    }
    dfmeaRedo = []; dfmeaCurrent = data; dfmeaGroup = group;
  }
  updateDfmeaHistoryButtons();
  autosaveDfmea();
}
function dfmeaRestore(isRedo = false) {
  if (JSON.stringify(dfmea) !== dfmeaCurrent) dfmeaPersist();
  const source = isRedo ? dfmeaRedo : dfmeaUndo, destination = isRedo ? dfmeaUndo : dfmeaRedo;
  if (!source.length) return;
  destination.push(dfmeaCurrent);
  dfmea = JSON.parse(source.pop());
  dfmeaCurrent = JSON.stringify(dfmea); dfmeaGroup = null;
  if (!dfmeaFind(dfmeaSelected)) dfmeaSelected = null;
  renderDfmea(); dfmeaPersist();
}
// Replaces the whole DFMEA: new, open, example, and startup.
function replaceDfmea(next, {saved = true} = {}) {
  dfmea = next;
  dfmeaSelected = null;
  dfmeaSaved = saved ? JSON.stringify(dfmea) : '';
  dfmeaUndo = []; dfmeaRedo = []; dfmeaCurrent = JSON.stringify(dfmea); dfmeaGroup = null;
  dfmeaPage = 'structure';
  dfFitPending = true;
  autosaveDfmea();
  if (appModule === 'dfmea') { renderDfmea(); updateDfmeaHistoryButtons(); }
}
const confirmDiscardDfmea = what => !dfmeaDirty() || confirm(`${what} The current DFMEA has unsaved changes, which will be lost. Continue?`);
// Before an RCA replaces the RCA from the DFMEA module: the RCA's own unsaved changes, then the switch.
function leaveDfmeaFor(what) {
  if (appModule !== 'dfmea') return true;
  if (!confirmDiscard(what)) return false;
  setModule('rca');
  return true;
}

// ---- The module shown ----
// The RCA and the DFMEA keep their own pages, history, autosave, and file; only the shell is shared.

function setModule(name) {
  appModule = name;
  try { localStorage.setItem(MODULE_KEY, name); } catch {}
  $('app').dataset.module = name;
  $('moduleRca').setAttribute('aria-pressed', name === 'rca');
  $('moduleDfmea').setAttribute('aria-pressed', name === 'dfmea');
  showMenu(false); showIssues(false);
  if (name === 'dfmea') {
    if (reportLayout !== 'dfmea') { rcaReportLayout = reportLayout; reportLayout = 'dfmea'; }
    renderDfmea(); updateDfmeaHistoryButtons();
  } else {
    reportLayout = rcaReportLayout;
    render(); updateHistoryButtons();
  }
  for (const [id, title] of Object.entries(name === 'dfmea' ? DFMEA_BUTTON_TITLES : RCA_BUTTON_TITLES)) $(id).title = title;
}
let rcaReportLayout = 'full';
const RCA_BUTTON_TITLES = Object.fromEntries(['newProject', 'openProject', 'loadExample', 'saveProject', 'saveProjectAs'].map(id => [id, $(id).title]));
const DFMEA_BUTTON_TITLES = {
  newProject: 'Start a new, empty DFMEA', openProject: 'Open a saved DFMEA or RCA (JSON)',
  loadExample: 'Replace the current DFMEA with the built-in CS-50 cartridge seal example',
  saveProject: 'Save the DFMEA as a JSON file (Ctrl/Cmd+S)', saveProjectAs: 'Save the DFMEA under a new file name (Ctrl/Cmd+Shift+S)',
};
$('moduleRca').onclick = () => setModule('rca');
$('moduleDfmea').onclick = () => setModule('dfmea');

// ---- Files ----

const DFMEA_FILE_TYPES = [{description: 'Causeway DFMEA', accept: {'application/json': ['.json']}}];
const dfmeaBaseName = () => (dfmea.meta.number.trim() || dfmea.root.title.trim() || 'dfmea')
  .replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dfmea';
async function saveDfmea(saveAs = false) {
  const blob = new Blob([JSON.stringify(dfmea, null, 2)], {type: 'application/json'});
  try {
    if (canPickFiles) {
      if (saveAs || !dfmeaHandle) dfmeaHandle = await window.showSaveFilePicker({suggestedName: dfmeaBaseName() + '.json', types: DFMEA_FILE_TYPES});
      const writable = await dfmeaHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else download(dfmeaBaseName() + '.json', blob);
    dfmeaSaved = JSON.stringify(dfmea); autosaveDfmea();
    setStatus(`Saved ${dfmeaHandle?.name || dfmeaBaseName() + '.json'}`);
  } catch (err) {
    if (err.name !== 'AbortError') alert('Could not save: ' + err.message);
  }
}
// A DFMEA file opens in the DFMEA module, from either module.
function loadDfmea(data, handle = null) {
  const next = normalizeDfmea(data);
  if (appModule !== 'dfmea' && !confirmDiscardDfmea('Open this DFMEA?')) return;
  replaceDfmea(next);
  dfmeaHandle = handle;
  if (appModule !== 'dfmea') setModule('dfmea');
  setStatus('Opened ' + (handle?.name || 'DFMEA'));
}
function newDfmea(method) {
  const d = blankDfmea(method);
  dfmeaHandle = null;
  replaceDfmea(d);
  selectDfmea(d.root.id);
  focusDfmeaTitle();
  setStatus(`New DFMEA: ${DFMEA_METHODS[method].name}`);
}

// The top bar's buttons act on the module shown.
const byModule = (id, dfmeaAction) => { const rca = $(id).onclick; $(id).onclick = e => appModule === 'dfmea' ? dfmeaAction(e) : rca(e); };
byModule('undo', () => dfmeaRestore());
byModule('redo', () => dfmeaRestore(true));
byModule('saveProject', () => saveDfmea());
byModule('saveProjectAs', () => saveDfmea(true));
byModule('newProject', () => {
  if (!confirmDiscardDfmea('Start a new DFMEA?')) return;
  openDialog(`<h2>New DFMEA</h2>
    <p>Choose how the branches are scored. You can switch later in the DFMEA's properties: each cause keeps its ratings for both methods.</p>
    <div class="style-choices">${Object.entries(DFMEA_METHODS).map(([k, x], i) =>
      `<button class="style-choice" data-choice="${k}" ${i ? '' : 'autofocus'}><b>${x.name}</b><span>${x.about}</span></button>`).join('')}</div>
    <div class="dialog-foot"><button class="button" data-choice="">Cancel</button></div>`, newDfmea);
});
byModule('loadExample', () => {
  if (!confirmDiscardDfmea('Load the example?')) return;
  dfmeaHandle = null;
  replaceDfmea(exampleDfmea());
  setStatus('Loaded the CS-50 cartridge seal example');
});

// ---- The report: printed, and as Word ----

function dfmeaReport() {
  const m = dfmea.meta, method = m.method, ratings = methodOf().ratings, all = dfmeaBranches();
  const complete = all.filter(b => b.depth === CAUSE_LEVEL), incomplete = all.length - complete.length;
  const needs = complete.filter(b => dfmeaNeedsAction(b.leaf)), stillNeeds = needs.filter(b => !liveActions(b.leaf).length || dfmeaAfter(b.leaf)?.needs);
  const at = (b, i) => rText(b.path[i]?.title);
  const score = s => s ? `<b>${s.value}</b>` : '—';
  const products = dfmea.root.children.map(p => p.title).filter(t => t.trim()).join('\n');
  return `<header class="r-cover">
      <div class="r-kicker">DFMEA${m.number ? ' · ' + escapeHtml(m.number) : ''}${m.revision ? ' · Revision ' + escapeHtml(m.revision) : ''}</div>
      <h1>${escapeHtml(dfmea.root.title || 'Untitled DFMEA')}</h1>
      <dl class="r-grid">${rItem('Product / model', products)}${rItem('Scoring', method === 'rpn' ? `RPN, acceptable up to ${m.limit}` : methodOf().name)}${rItem('Date', m.date)}${rItem('Team', m.team)}</dl>
    </header>
    <section>
      <h2>Scope</h2>
      <p>${rText(m.scope)}</p>
      <p>${plural(complete.length, 'branch', 'branches')}${incomplete ? ` and ${plural(incomplete, 'incomplete branch', 'incomplete branches')}, not scored` : ''}. ${plural(needs.length, 'branch needs', 'branches need')} action${needs.length ? `; ${stillNeeds.length ? `${plural(stillNeeds.length, 'still does', 'still do')} after the actions planned` : 'all are brought within the acceptance criteria by the actions planned'}` : ''}.</p>
      <p class="r-legend">${escapeHtml(methodOf().about)}</p>
    </section>
    <section class="r-page">
      <h2>Risk analysis</h2>
      ${rTable(['Branch', 'Component', 'Function', 'Failure mode', 'Effect', 'Cause', 'Prevention control', 'Detection control', ...ratings.map(([, , head]) => head), methodOf().short, 'After actions'],
        complete.map(b => { const c = b.leaf, s = dfmeaScore(c); return `<tr><td>${escapeHtml(c.branch)}</td><td>${at(b, 2)}</td><td>${at(b, 3)}</td><td>${at(b, 4)}</td><td>${at(b, 5)}</td><td>${rText(c.title)}</td>
          <td>${rText(c.prevention)}</td><td>${rText(c.detection)}</td>${ratings.map(([k]) => `<td>${c.ratings[method][k] ?? '—'}</td>`).join('')}<td>${score(s)}</td><td>${liveActions(c).length ? score(dfmeaAfter(c)) : s?.value === 'M' && c.justification.trim() ? rText(c.justification) : '—'}</td></tr>`; }),
        'No branch reaches the causes yet.')}
    </section>
    <section>
      <h2>Actions</h2>
      ${rTable(['Branch', 'Action', 'Assignee', 'Status', 'Target', 'Expected ratings', 'Latest note'], dfmea.actions.map(a => {
        const c = dfmeaCauseById(a.causeId), expected = ratings.filter(([k]) => Number.isInteger(a.after[method][k])).map(([k, , head]) => `${head} ${a.after[method][k]}`).join(', ');
        const note = [...a.notes].sort((x, y) => y.week.localeCompare(x.week)).find(x => x.text.trim());
        return `<tr><td>${escapeHtml(c?.branch || '')}</td><td>${rText(a.title)}</td><td>${rText(a.owner)}</td><td>${DFMEA_ACTION_STATUS[a.status]}</td><td>${rText(a.target)}</td><td>${rText(expected)}</td><td>${note ? `${note.week.slice(5)}: ${escapeHtml(note.text)}` : '—'}</td></tr>`;
      }), 'No actions.')}
      <p class="r-foot">Causeway · ${escapeHtml(m.number || dfmea.root.title || 'DFMEA')} · printed ${today()}</p>
    </section>`;
}
REPORTS.dfmea = dfmeaReport;
DOCX_REPORTS.dfmea = {kind: 'DFMEA', file: 'DFMEA', title: () => `DFMEA: ${dfmea.root.title || 'Untitled DFMEA'}`, subject: () => dfmea.meta.number, base: dfmeaBaseName};
$('printDfmea').onclick = () => printReport('dfmea');
$('exportDocxDfmea').onclick = () => exportDocx('dfmea');

// Startup, after the RCA's: restore the autosaved DFMEA, and the module last shown.
function startDfmea() {
  let saved = null, shown = 'rca';
  try { saved = JSON.parse(localStorage.getItem(DFMEA_STORAGE_KEY)); shown = localStorage.getItem(MODULE_KEY) === 'dfmea' ? 'dfmea' : 'rca'; } catch {}
  let recovered = false;
  try { if (saved?.dfmea) { replaceDfmea(normalizeDfmea(saved.dfmea), {saved: !saved.dirty}); recovered = saved.dirty; } } catch {}
  if (!saved?.dfmea || dfmeaCurrent === null) replaceDfmea(blankDfmea());
  if (shown === 'dfmea') {
    setModule('dfmea');
    if (recovered) setStatus('Recovered unsaved DFMEA changes from ' + new Date(saved.savedAt).toLocaleString());
  }
}

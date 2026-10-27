// The guide: for each method and record, what it is, when to use it, how to fill it in, what to avoid,
// and an excerpt of the P-101A example. A panel beside the page follows the page shown; the Learn page
// lists every method in the order an investigation uses them.
//
// The excerpts are drawn from exampleRca(), so they always match what Load example opens.

const GUIDE_KEY = 'causeway-guide';
let guideOpen = false;
let guideTopic = 'problem';    // the topic shown; follows the page, except on the Learn page
let guideShown = '';           // what the panel last drew, so that a render that changes nothing skips it
try { guideOpen = localStorage.getItem(GUIDE_KEY) === 'open'; } catch {}

let guideExampleCache = null;
const guideExample = () => guideExampleCache ??= exampleRca();

// ---- Excerpts of the example ----

const gx = {
  node: (ex, id) => ex.nodes.find(n => n.id === id),
  codes: (ex, ids) => ids.map(id => ex.evidence.find(e => e.id === id)?.code).filter(Boolean),
  pills: codes => codes.map(c => `<span class="code">${escapeHtml(c)}</span>`).join(' '),
  kind: k => k === 'action' || k === 'condition' ? `<span class="g-kind ${k}">${KINDS[k].name}</span>` : '',
  table: (head, rows) => `<table class="g-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
  item: (head, body, foot = '') => `<div class="g-item"><div class="g-item-head">${head}</div><div>${body}</div>${foot ? `<small>${foot}</small>` : ''}</div>`,
  pairs: pairs => `<dl class="g-pairs">${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`,
};
// The title of a 5 Whys step, fishbone cause, or event: its own words, or its node's on the chart.
const gxText = (ex, item, own) => item.nodeId ? gx.node(ex, item.nodeId)?.title || '' : item.ruledOutId ? ex.ruledOut.find(r => r.id === item.ruledOutId)?.cause || '' : own;

// An event's time: month, day, and clock time; an end on the same day shows the clock time only.
const gxWhen = ev => {
  const at = t => t.replace('T', ' ').slice(5);
  return escapeHtml(at(ev.start) + (ev.end ? ' → ' + (ev.end.slice(0, 10) === ev.start.slice(0, 10) ? ev.end.slice(11) : at(ev.end)) : ''));
};

const GUIDE_EXAMPLES = {
  problem: ex => {
    const p = ex.problem;
    return gx.pairs([['What', gx.node(ex, p.primaryEffectId).title], ['When', p.when], ['Where', p.where],
      ['Safety', p.significance.safety], ['Reliability', p.significance.reliability]]);
  },
  team: ex => {
    const m = ex.meta;
    return gx.table(['Name', 'Role'], m.team.map(t => [escapeHtml(t.name) + (t.id === m.leadId ? ' <b>(lead)</b>' : ''), escapeHtml(t.role)]))
      + gx.pairs([['Status', RCA_STATUS[m.status]], ['Customer ref.', m.customerRef], ['Prepared by', `${m.signoff.prepared.name}, ${m.signoff.prepared.date}`],
        ['Reviewed by', `${m.signoff.reviewed.name}, ${m.signoff.reviewed.date}`], ['Approved by', 'Not yet: actions still open']]);
  },
  equipment: ex => {
    const e = ex.equipment;
    return gx.pairs([['Machine', e.machine], ['Seal', `${e.sealModel}, ${e.arrangement}, Plan ${e.sealPlans}`], ['Faces', e.faces],
      ['Product', e.product], ['Vapour pressure', e.vapourPressure], ['Seal chamber', e.chamber], ['Flush flow', e.flushFlow],
      ['Run time', runTime(e)], ['Changes before', e.changes], ['As found', e.asFound]]);
  },
  evidence: ex => ['E1', 'E3', 'E6'].map(code => {
    const e = ex.evidence.find(x => x.code === code);
    return gx.item(`${gx.pills([code])} <span class="g-flag ok">${EVIDENCE_TYPES[e.type]}</span>`, escapeHtml(e.description), escapeHtml(e.source));
  }).join(''),
  timeline: ex => ex.timelines[0].phases.slice(0, 3).map(p => `<div class="g-sub">${escapeHtml(p.name)}</div>
    <ul class="g-list">${p.events.map(ev => `<li><span class="g-time">${gxWhen(ev)}</span>
      ${escapeHtml(gxText(ex, ev, ev.text))}${ev.deviation ? ' <span class="g-flag">deviation</span>' : ''}</li>`).join('')}</ul>`).join(''),
  spec: ex => {
    const rows = ex.specification.rows, at = i => rows[i];
    const label = r => `${SPEC_DIMS[r.dim]} ${rows.filter(x => x.dim === r.dim).indexOf(r) + 1}`;
    const tested = ex.specification.tests.map(t => {
      const marks = Object.values(t.marks), yes = marks.filter(m => m === 'yes').length, ifs = marks.filter(m => m === 'if').length;
      return `<li>${escapeHtml(gx.node(ex, t.causeId).title)}: <b>${yes} ✓</b>${ifs ? `, ${ifs} ? (only on an assumption)` : ', explains every fact'}</li>`;
    });
    return [0, 2, 4].map(i => gx.item(`<b>${label(at(i))}</b> ${escapeHtml(at(i).question)}`,
      gx.pairs([['Is', at(i).is], ['Is not', at(i).isNot], ['Distinctive', at(i).distinction], ['Changed', at(i).change]].filter(([, v]) => v)))).join('')
      + `<div class="g-sub">Causes tested against the facts</div><ul class="g-list">${tested.join('')}</ul>`;
  },
  compare: ex => {
    const c = ex.comparison, failed = r => r.field ? ex.equipment[r.field] : r.failed;
    const diffs = c.rows.filter(r => r.explains === 'yes' || r.explains === 'partly'), same = c.rows.filter(r => r.differs === 'same');
    return gx.pairs(c.cases.map((x, i) => [i ? `Good case ${i}` : 'Failed', `${x.name}: ${x.why}`]))
      + `<div class="g-sub">Differences that could explain it</div>` + diffs.slice(0, 4).map(r => gx.item(`<b>${escapeHtml(r.factor)}</b> ${gx.pills(gx.codes(ex, r.evidenceIds))}${r.nodeId ? ' <span class="g-flag ok">on the chart</span>' : ''}`,
        gx.pairs([[escapeHtml(c.cases[0].name), failed(r)], ...r.good.map((g, i) => [escapeHtml(c.cases[i + 1].name), g]).filter(([, g]) => g)]))).join('')
      + `<div class="g-sub">The same in every case</div><ul class="g-list">${same.slice(0, 4).map(r => `<li>${escapeHtml(r.factor)}: ${escapeHtml(failed(r))}</li>`).join('')}</ul>`;
  },
  fishbone: ex => {
    const f = ex.fishbones[0];
    const mark = c => c.nodeId ? '<span class="g-flag ok">on the chart</span>' : c.ruledOutId ? '<span class="g-flag no">ruled out</span>' : '<span class="g-flag">to test</span>';
    return f.categories.map(g => `<div class="g-sub">${escapeHtml(g.name)}</div>
      <ul class="g-list">${g.causes.map(c => `<li${c.parentId ? ' class="g-indent"' : ''}>${escapeHtml(gxText(ex, c, c.text))} ${mark(c)}</li>`).join('')}</ul>`).join('');
  },
  whys: ex => {
    const c = ex.fiveWhys[0];
    let asked = gx.node(ex, c.effectId).title;
    return `<ol class="g-whys">${c.steps.map((s, i) => {
      const answer = gxText(ex, s, s.answer), q = asked;
      asked = answer;
      return `<li><small>Why did “${escapeHtml(q)}” happen?</small>${escapeHtml(answer)}${i === c.steps.length - 1 ? ' <span class="g-flag">next: why?</span>' : ''}</li>`;
    }).join('')}</ol>`;
  },
  chart: ex => {
    if (treeStyle()) {
      const f = ex.fishbones[0].categories.flatMap(g => g.causes);
      const pick = (test, n) => f.filter(test).slice(0, n);
      const row = (title, status, codes) => `<li><span class="g-badge ${status}">${STATUSES[status].mark}</span>${escapeHtml(title)} ${gx.pills(codes)}</li>`;
      return `<div class="g-sub">${escapeHtml(gx.node(ex, ex.problem.primaryEffectId).title)}: some of its possible causes</div><ul class="g-list g-tree">
        ${pick(c => c.nodeId && gx.node(ex, c.nodeId).evidenceIds.length, 3).map(c => { const n = gx.node(ex, c.nodeId); return row(n.title, 'confirmed', gx.codes(ex, n.evidenceIds)); }).join('')}
        ${pick(c => c.ruledOutId, 2).map(c => { const r = ex.ruledOut.find(x => x.id === c.ruledOutId); return row(r.cause, 'ruled-out', gx.codes(ex, r.evidenceIds)); }).join('')}
        ${pick(c => !c.nodeId && !c.ruledOutId && !c.parentId && !c.evidenceIds.length, 2).map(c => row(c.text, 'possible', [])).join('')}</ul>`;
    }
    // The first three levels of the Apollo chart: each effect with the causes that were all needed for it.
    const causesOf = id => ex.links.filter(l => l.effectId === id).map(l => gx.node(ex, l.causeId));
    const box = n => `${gx.kind(n.kind)} ${escapeHtml(n.title)} ${gx.pills(gx.codes(ex, n.evidenceIds))}${n.stopPoint ? ' <span class="g-stop">STOP</span>' : ''}`;
    const level = (n, depth) => {
      const cs = causesOf(n.id);
      return cs.length && depth ? `<div class="g-and">AND</div><ul class="g-chart">${cs.map(c => `<li>${box(c)}${level(c, depth - 1)}</li>`).join('')}</ul>` : '';
    };
    const top = gx.node(ex, ex.problem.primaryEffectId);
    return `<div class="g-chart-top"><span class="g-kind effect">Primary effect</span> ${escapeHtml(top.title)}</div>${level(top, 3)}`;
  },
  ruledOut: ex => ex.ruledOut.slice(0, 4).map(r => gx.item(`<b>${escapeHtml(r.cause)}</b> ${gx.pills(gx.codes(ex, r.evidenceIds))}`, escapeHtml(r.test))).join(''),
  solutions: ex => [0, 3, 6].map(i => {
    const s = ex.solutions[i];
    return `<div class="g-solution"><b>${escapeHtml(s.title)}</b> <span class="badge ${s.decision}">${DECISIONS[s.decision]}</span>
      <div class="g-attacks">Attacks: ${s.causeIds.map(id => escapeHtml(gx.node(ex, id).title)).join('; ')}</div>
      <ul class="g-criteria">${Object.entries(CRITERIA).map(([k, label]) => `<li><span class="g-crit ${s.criteria[k].v}">${CRITERION_VALUES[s.criteria[k].v]}</span>${label}${s.criteria[k].c ? ` <small>${escapeHtml(s.criteria[k].c)}</small>` : ''}</li>`).join('')}</ul></div>`;
  }).join(''),
  actions: ex => ex.actions.slice(0, 4).map(a => gx.item(`<b>${escapeHtml(a.action)}</b>`,
    [ACTION_KINDS[a.kind] + (a.strength ? `, ${ACTION_STRENGTH[a.strength].toLowerCase()}` : ''), escapeHtml(a.owner), `due ${a.due}`, `<span class="g-flag ok">${ACTION_STATUS[a.status]}</span>`].join(' · '),
    `Verified by: ${escapeHtml(a.verification)}`)).join('')
    + gx.pairs([['Read-across', ex.problem.readAcross]]),
  reports: ex => {
    const m = ex.meta, open = ex.actions.filter(a => a.kind !== 'containment' && a.status !== 'validated').length;
    return gx.pairs([['Status', RCA_STATUS[m.status]], ['Revision', m.revision], ['Customer ref.', m.customerRef],
      ['Signed off', `Prepared by ${m.signoff.prepared.name}, reviewed by ${m.signoff.reviewed.name}; approval to come`]])
      + `<p>The example cannot be closed yet: ${plural(open, 'corrective or preventive action')} still ${open === 1 ? 'needs' : 'need'} a validated effectiveness check.</p>`;
  },
};

// ---- The guides ----
// Each: name, the page it explains (null for one without a page), a one-line summary for the Learn page,
// what it is, when to use it, how to fill it in, and what to avoid.

const GUIDE_STAGES = [
  {name: 'Define the problem', topics: ['problem', 'team', 'equipment']},
  {name: 'Collect the facts', topics: ['evidence', 'timeline', 'spec', 'compare']},
  {name: 'Find the causes', topics: ['fishbone', 'whys', 'chart', 'ruledOut']},
  {name: 'Fix it and close', topics: ['solutions', 'actions', 'reports']},
];

const GUIDES = {
  problem: {
    name: 'Problem definition', page: 'problem',
    summary: 'What happened, when, where, and why it matters.',
    what: 'A short, factual statement of the problem, written before anyone looks for causes. Its “what” is the primary effect: the first box of the chart, and the one every cause leads back to.',
    when: 'First, on the day the RCA is opened. Come back to it when the facts sharpen the picture.',
    steps: [
      '<b>What</b>: the effect as an observation, with a number where there is one: “High seal leakage, 15 ml/min (limit under 1 ml/min)”, not “seal failed” or “bad seal”.',
      '<b>When</b>: the date and time it was found, and the circumstances: on a round, at start-up, after an upset.',
      '<b>Where</b>: unit, equipment tag, and position, e.g. inboard or outboard seal.',
      '<b>Significance</b>: the consequences in each area that applies. This is what justifies the effort of the RCA, and what the actions will be judged against.',
    ],
    tips: [
      'Do not put a cause in the problem: “leak due to dry running” decides the answer before the investigation.',
      'One primary effect per RCA. If there are two problems, open two RCAs or pick the one that matters most.',
      'Keep it to facts that can be checked; opinions belong in the hypotheses.',
    ],
  },
  team: {
    name: 'Team and sign-off', page: 'team',
    summary: 'Who carries out the RCA, its dates, its status, and who signs it off.',
    what: 'The record of who investigates, from which disciplines, and who reviews and approves the result. It also holds the RCA number, the customer reference, the revision, and where the RCA stands.',
    when: 'At the start, then at each status change, and at sign-off.',
    steps: [
      'Fill in the <b>RCA number</b>, the <b>equipment tag</b>, and, for a customer complaint or 8D request, the <b>customer reference</b>.',
      'Add the <b>team</b>: the people who know the equipment, the process, operations, and maintenance. Mark one as the <b>lead</b>. Their names are then offered for “collected by” and “owner” elsewhere.',
      'Set the <b>dates</b>: the event, and when the RCA was opened.',
      'Move the <b>status</b> on as the work goes: open, root cause found, actions in progress, closed.',
      'At the end, enter who <b>prepared</b>, <b>reviewed</b>, and <b>approved</b> it. Printed reports leave space to sign.',
    ],
    tips: [
      'A team of one misses what other disciplines would see. Include someone who operates the equipment.',
      'The RCA cannot be closed until every corrective and preventive action is validated by its effectiveness check.',
      'Raise the revision when a report has been sent and the RCA changes after it.',
    ],
  },
  equipment: {
    name: 'Equipment and duty', page: 'equipment',
    summary: 'The machine, the seal, its duty at the failure, and the failed parts.',
    what: 'The data a seal or pump maker asks for when a failed part comes back: the machine and seal, the duty at the time of the failure, the seal support system, the mechanical condition, the history, and how the parts were found.',
    when: 'Early, while the parts and the people who saw them are still at hand. Before cleaning or reassembling anything.',
    steps: [
      '<b>Machine and seal</b>: type, model, arrangement, seal plan, face and elastomer materials.',
      '<b>Duty</b>: the product, its vapour pressure at the seal chamber temperature, pressures, speed, flow, and how it was running.',
      '<b>Support system</b>: flush flow, temperature, and pressure, as measured, not as designed.',
      '<b>Mechanical condition</b>: runout, end float, alignment, vibration, bearings.',
      '<b>History</b>: installed and failed dates (the run time is worked out), how it was found, earlier failures, and what changed before.',
      '<b>Failed parts</b>: where they are kept, whether they were cleaned, and how they looked as found.',
    ],
    tips: [
      'Write measured values, with units. “Normal” is not a value.',
      'Record “what changed” even when it seems unrelated: it is where the Is / Is Not looks first.',
      'Do not clean the faces before they are photographed and examined: deposits are evidence.',
      'Every field is optional. Fill in what applies; a pump that is not sealed leaves the seal fields blank.',
    ],
  },
  evidence: {
    name: 'Evidence log', page: 'evidence',
    summary: 'What was seen, measured, or inferred, each with a code to cite.',
    what: 'The list of facts the analysis rests on. Each item gets a code, E1, E2, and so on, that causes, ruled-out causes, and steps cite. A code is never reused, so a citation always points to the same fact.',
    when: 'From the first hour, and all the way through. Collect perishable evidence first: data that is overwritten, parts that are cleaned, memories that fade.',
    steps: [
      '<b>+ Add evidence</b>, or add it from a cause on the chart, where it is cited at once.',
      '<b>Description</b>: what was seen or measured, specific and with numbers.',
      '<b>Type</b>: <b>sensed</b> if someone saw, measured, or recorded it; <b>inferred</b> if it was worked out from other facts, like a calculation.',
      '<b>Source</b>, <b>collected by</b>, and <b>date</b>, so anyone can go back to it.',
      'Cite it: on a cause in the chart, a step in the 5 Whys, an event, or a ruled-out cause. <b>Show</b> highlights the causes that cite it.',
    ],
    tips: [
      'A cause with no evidence is an opinion. The chart flags it with an orange <b>?</b>.',
      'A cause confirmed on a single item is weak: a second, independent item makes it firm.',
      'Opinions and statements of what “always” happens are not evidence; logs, measurements, photos, and parts are.',
    ],
  },
  timeline: {
    name: 'Sequence of events', page: 'timeline',
    summary: 'What happened, in order, phase by phase; deviations become causes.',
    what: 'A timeline of what was done and seen before, during, and after the failure, grouped into phases. Events that departed from what should have happened are marked as <b>deviations</b>: they are candidate causes.',
    when: 'Early, once logs, trends, and interviews are in. It is the best way to find what changed.',
    steps: [
      'Choose the <b>phases</b> (field failure, test run, or your own), then <b>+ New timeline</b>.',
      'Add each <b>event</b> with its start, and its end if it lasted. <kbd>Enter</kbd> adds the next one, starting where this one ended. Events sort themselves by time.',
      'Mark an event as an <b>action</b> (something done or that happened) or a <b>condition</b> (a state that held).',
      'Cite the <b>evidence</b> that dates the event: a log, a trend, an interview.',
      'Tick <b>deviation</b> where the event departed from what should have happened, then <b>add it to the chart</b>.',
    ],
    tips: [
      'Go further back than feels necessary: the cause often starts days before the failure.',
      'Use clock times from logs over remembered ones, and say which is which.',
      'An event without a time is a gap to fill, not one to guess.',
    ],
  },
  spec: {
    name: 'Is / Is Not', page: 'spec',
    summary: 'Specify the problem precisely, then test each cause against it.',
    what: 'The Kepner-Tregoe problem specification. For What, Where, When, and Extent, it sets what the problem <b>is</b> against the closest thing that could have the problem but <b>is not</b>. What is distinctive about the IS side, and what changed there, point to the cause. Each cause is then tested: the true cause explains why the problem is here and not there.',
    when: 'When it is not obvious why this item failed and a similar one did not. Before the fishbone, to focus it; and again when several causes are still possible.',
    steps: [
      'For each question, write the <b>Is</b>: the fact as observed.',
      'Write the <b>Is not</b>: the nearest thing that could have the problem but does not. The spare pump, the other seal, the same seal before the upset.',
      'Note what is <b>distinctive</b> about the IS side, and what <b>changed</b> in or around it.',
      'Under <b>Test the possible causes</b>, add causes from the chart. For each fact, click <b>✓</b> if the cause explains it, <b>?</b> if only on an assumption, <b>✕</b> if it does not.',
      'Rule out the causes with a <b>✕</b>, or check the fact. The most likely cause explains every fact on the fewest assumptions.',
    ],
    tips: [
      'A weak IS NOT (“everything else”) gives nothing to compare. Name a specific item.',
      'Keep it to facts. Possible causes belong in the test, not in the table.',
      'Each <b>?</b> is an assumption to verify: it shows where the next piece of evidence is needed.',
    ],
  },
  compare: {
    name: 'Failed vs good', page: 'compare',
    summary: 'Optional: compare the failed case with two that did not fail.',
    what: 'A comparative and change analysis. The failed case sits beside two comparable cases that did <b>not</b> fail, factor by factor. A factor that differs, and could explain the failure, is a candidate cause; one that is the same in every case cannot explain why only this one failed, though it may still be a condition that let it happen.',
    when: 'Optional. Use it when there is a fair comparison: a twin on the same duty, the same machine before it failed, or a similar machine elsewhere. Skip it for a one-off machine or a first failure with nothing to compare with; nothing in Causeway asks for it.',
    steps: [
      '<b>Start from the equipment record</b>: each field filled there becomes a factor, with the failed case already filled in. Editing it here edits the record.',
      'Name the two <b>good cases</b>, and say why each is comparable and how long it has run.',
      'Fill in each factor for the good cases. Add factors the record does not hold, such as the filter upstream of the flush, or what changed before the failure.',
      'Mark whether each factor <b>differs</b>, and whether the difference could <b>explain</b> the failure: yes, partly, or no.',
      'For a difference that explains it: <b>add it to the chart</b> as a possible cause, <b>send it to the Is / Is Not</b> as a distinction or a change, and give <b>when it changed</b>, linked to an event of the sequence of events or added to it.',
    ],
    tips: [
      'Pick good cases close to the failed one. A pump on another site with another fluid differs in too much to tell you anything.',
      'A difference is a lead, not a cause: it still needs evidence on the chart.',
      'The reports show the differences only, and say that matching factors are hidden.',
    ],
  },
  fishbone: {
    name: 'Fishbone', page: 'fishbone',
    summary: 'Brainstorm possible causes by category, then test each one.',
    what: 'An Ishikawa diagram: the possible causes of an effect, sorted into categories so that no area is forgotten. It lists ideas; it does not prove any of them.',
    when: 'Once the problem is defined, to make sure the team has thought of every area before narrowing down. Useful in a team session.',
    steps: [
      'Choose the <b>categories</b>: the seal failure set, the 6M, or your own, then <b>+ New diagram</b>.',
      'Under each category, add the possible causes. A cause can have sub-causes: why it might have happened.',
      'Cite <b>evidence</b> where it exists already.',
      'Test each cause: <b>add it to the chart</b>, where it needs evidence, or <b>rule it out</b> with the test that did it.',
      'Leave a cause marked <b>to test</b> until one or the other is done.',
    ],
    tips: [
      'Quantity first, judgment later: an idea left off the diagram is never tested.',
      'Do not stop at a category name (“Operation”): write a cause that can be checked.',
      'A fishbone with nothing ruled out and nothing on the chart has not been used yet.',
    ],
  },
  whys: {
    name: '5 Whys', page: 'whys',
    summary: 'Ask why, and why again, until you reach a cause you can act on.',
    what: 'A chain of questions: why did the problem happen, then why did that happen, and so on. It follows one line of causes down to one that can be changed. Five is a guide, not a rule.',
    when: 'For a quick look at a simple problem, or to push one branch of the chart deeper. For a complex failure, use it with the chart, not in place of it.',
    steps: [
      '<b>+ New chain</b> starts from the primary effect; <b>Starts from</b> can pick any cause on the chart.',
      'Answer each why with a fact, not a guess: “Plan 11 flush flow dropped to near zero”, not “maybe the flush”.',
      'Mark each step an <b>action</b> or a <b>condition</b>, and cite the <b>evidence</b>. <kbd>Enter</kbd> goes to the next why.',
      'Stop at a cause you can change, or one outside your control.',
      '<b>Add to chart</b> puts the steps on the cause-and-effect chart, where each gains the other causes it needs.',
    ],
    tips: [
      'One chain shows one cause per effect. Real failures have several: that is what the chart is for.',
      'Do not stop at a person: “the operator opened the bypass” leads to why the bypass could be opened without a check.',
      'If two answers fit a why, start a second chain for the other one.',
    ],
  },
  chart: {
    name: 'Cause and effect', page: 'chart',
    summary: 'The chart of causes, each backed by evidence, down to the root causes.',
    what: 'The core of the RCA. In the <b>Apollo</b> style, every effect has the causes that were all needed for it, joined by AND: at least one <b>action</b> (momentary, at a point in time) and one <b>condition</b> (it existed over time). Every cause is backed by evidence, and each branch ends at a <b>stop point</b>.',
    when: 'Throughout. Start it as soon as the primary effect is known, and add to it from the 5 Whys, the fishbone, and the timeline.',
    steps: [
      'Select the primary effect and ask: what action, and what condition, were both needed for it? <b>+ Action</b> (<kbd>Ins</kbd>) and <b>+ Condition</b> (<kbd>Shift+Ins</kbd>) add them.',
      'Do the same for each cause, working left to right.',
      'Cite <b>evidence</b> on each cause from its properties. Without it, the cause shows an orange <b>?</b>.',
      'Where one cause supports several effects, <b>Link cause</b> (<kbd>Alt+L</kbd>) draws the second link.',
      'End each branch with a <b>stop point</b> and its reason. Tick <b>Controllable</b> on causes you can change, and give root causes their <b>type</b>: occurrence, escape point, or systemic.',
      'Rule out what the evidence disproves with <b>Rule out</b>; it moves to the causes ruled out.',
      'When the evidence cannot yet tell which of some causes it was, select them and press <kbd>Alt+O</kbd>: they become <b>alternatives</b>, joined by a dashed <b>OR</b>. Test them, then choose <b>Keep this one</b> on the cause the evidence confirms; the others are ruled out.',
    ],
    tips: [
      'An effect with only an action, or only a condition, is incomplete: the chart outlines it.',
      'A branch that ends at a human error is not done: ask why the error was possible.',
      'Look for all three root cause types: why it happened, why it was not caught, and what in the system allowed it.',
      'The issues button lists everything the chart still needs.',
    ],
  },
  ruledOut: {
    name: 'Causes ruled out', page: 'ruledOut',
    summary: 'Possible causes the evidence disproved, and how.',
    what: 'The list of possible causes that were tested and found not to apply, each with the test or evidence that ruled it out. It shows the reader, and the customer, that the obvious suspects were checked.',
    when: 'Whenever a hypothesis is disproved: on the chart, in the fishbone, or in the Is / Is Not.',
    steps: [
      'On the chart, select a cause and choose <b>Rule out</b>, or add one here with <b>+ Add possible cause</b>.',
      'Write <b>how it was ruled out</b>: the check, test, or measurement.',
      '<b>Cite</b> the evidence that shows it.',
      'Keep the status <b>being tested</b> until the result is in.',
    ],
    tips: [
      'A cause ruled out with no reason is flagged: someone will ask, and the answer should be here.',
      '“Unlikely” is not ruled out. If it has not been tested, it is still a hypothesis.',
      'In a cause tree, ruled-out causes stay on the tree, struck through, and are listed here too.',
    ],
  },
  solutions: {
    name: 'Solutions', page: 'solutions',
    summary: 'Options that attack the causes, weighed on four criteria.',
    what: 'The options for removing the causes. Each solution attacks one or more causes, and is weighed against four criteria: does it prevent recurrence, is it within our control, does it meet our goals, and does it avoid new problems? Then it is implemented, studied further, or rejected.',
    when: 'Once the causes are found and backed by evidence. Look at every <b>controllable</b> cause, not only the last one in each branch.',
    steps: [
      '<b>+ Add solution</b>, or add one from a cause on the chart.',
      'Link the <b>causes</b> it attacks. Controllable causes are listed first, marked ●.',
      'Answer the four <b>criteria</b>: yes, partly, or no, with a comment where it helps.',
      'Choose the <b>decision</b>. Then add the <b>actions</b> that carry it out.',
    ],
    tips: [
      'Write several solutions for each key cause before choosing. The first idea is rarely the best.',
      'Training alone does not change the conditions that allowed the error. It is weak on its own.',
      'Keep the rejected ones and say why: it answers “did you consider…?”',
    ],
  },
  actions: {
    name: 'Action plan', page: 'actions',
    summary: 'Who does what, by when, how it is verified, and whether it worked.',
    what: 'The actions that carry out the chosen solutions, each with an owner, a due date, a way to verify it, and an effectiveness check that shows whether the problem stayed away. It also holds the <b>read-across</b>: where else the same problem could happen.',
    when: 'Once solutions are chosen; a containment action, earlier, as soon as the problem is found.',
    steps: [
      'Add each action: from a solution, or with <b>+ Add action</b>.',
      'Set its <b>kind</b>: <b>containment</b> protects until the fix is in, <b>corrective</b> removes a cause, <b>preventive</b> stops it elsewhere or in the system.',
      'Set its <b>strength</b>: <b>strong</b> removes the cause by design, <b>medium</b> makes the right result likely, <b>weak</b> relies on people remembering.',
      'Give it an <b>owner</b>, a <b>due</b> date, and a <b>verification</b>: how you will check it was done as intended.',
      'Move the <b>status</b> along: identified, in progress, implemented, verified, validated.',
      'Set an <b>effectiveness check</b> date, and record its result. Then fill in the <b>read-across</b>.',
    ],
    tips: [
      'Every action needs one named owner, not a department.',
      '<b>Implemented</b> means done; <b>validated</b> means it worked. Only validated actions close the RCA.',
      'A solution whose actions are all weak is flagged: add a stronger one.',
    ],
  },
  reports: {
    name: 'Reports', page: null,
    summary: 'The full RCA, an 8D, or a one-page summary, printed or saved as PDF.',
    what: 'Three layouts of the same RCA, under <b>Print ▾</b> in the top bar. The <b>full report</b> has every record and the chart. The <b>8D report</b> lays it out as D1 to D8, for a customer’s 8D request. The <b>one-page summary</b> gives the problem, root causes, actions, and status, for management.',
    when: 'At each milestone: an interim report once containment is in, and the final one at sign-off.',
    steps: [
      'Check the <b>issues</b> list first: everything it flags would show in the report.',
      'Fill in the <b>team and sign-off</b> record: status, customer reference, and revision are printed in the header.',
      'Choose the layout under <b>Print ▾</b>, then print, or save as PDF from the print dialog.',
      'For a customer, use the 8D: it groups the root causes by occurrence, escape point, and systemic, as 8D asks.',
    ],
    tips: [
      'Raise the revision each time a report goes out and the RCA changes after it.',
      'The report shows what the RCA holds. If a section is empty, fill the record rather than adding text after printing.',
    ],
  },
};

// In a cause tree, the chart is explained differently.
const GUIDE_TREE = {
  name: 'Cause tree',
  what: 'In the <b>cause tree</b> style, each effect has its possible causes, any of which may explain it. Each is a <b>hypothesis</b>, tested until it is <b>confirmed</b> or <b>ruled out</b>. A confirmed branch, drawn bold, leads to the root cause.',
  steps: [
    'Select the primary effect and add its possible causes with <b>+ Cause</b> (<kbd>Ins</kbd>). Each starts as a hypothesis, <b>H</b>.',
    'Write in <b>How it is tested</b> the check that will confirm or rule it out.',
    'Run the test, add the result to the <b>evidence log</b>, and cite it on the cause.',
    'Set the status: <b>confirmed</b> (<kbd>Alt+2</kbd>) or <b>ruled out</b> (<kbd>Alt+3</kbd>). Confirming a cause also confirms the effects between it and the primary effect.',
    'Go deeper under each confirmed cause until you reach one you can change, and end the branch with a <b>stop point</b>.',
    'When several causes at the end of their branches may come from one deeper cause, drag a box around them and choose <b>Summary</b> (<kbd>Alt+G</kbd>): a new cause, shared by all of them, is drawn to their right with a brace. Name it, and test it like any other.',
  ],
  tips: [
    'A cause confirmed without evidence is an error: it is still a hypothesis.',
    'Keep ruled-out causes on the tree: they show what was eliminated.',
    'Switch to Apollo when the causes are found, to check that each effect had all it needed.',
  ],
};

const guideFor = topic => topic === 'chart' && treeStyle() ? {...GUIDES.chart, ...GUIDE_TREE} : GUIDES[topic];

// ---- The panel ----

function guideMarkup(topic) {
  const g = guideFor(topic), ex = guideExample();
  return `<div class="guide-head">
      <select class="picker" id="guideTopic" aria-label="Guide topic">${GUIDE_STAGES.map(st => `<optgroup label="${st.name}">${st.topics.map(t =>
        `<option value="${t}" ${t === topic ? 'selected' : ''}>${guideFor(t).name}</option>`).join('')}</optgroup>`).join('')}</select>
      <button class="unlink" id="closeGuide" aria-label="Close the guide" title="Close the guide">×</button>
    </div>
    <h2>${g.name}</h2>
    <p class="guide-what">${g.what}</p>
    <h3>When to use it</h3><p>${g.when}</p>
    <h3>How to fill it in</h3><ol class="guide-steps">${g.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <h3>Good practice</h3><ul class="guide-tips">${g.tips.map(s => `<li>${s}</li>`).join('')}</ul>
    <h3>Example <span class="muted">P-101A seal leakage</span></h3>
    <div class="guide-example">${GUIDE_EXAMPLES[topic](ex)}</div>
    <div class="guide-foot">
      ${g.page && record !== g.page ? `<button class="button" data-guide-go="${g.page}">Go to ${escapeHtml(g.name)}</button>` : ''}
      <button class="button" id="guideExample" title="Replace the current RCA with the P-101A example">Open the full example</button>
    </div>`;
}

function renderGuide() {
  $('app').classList.toggle('guide-open', guideOpen);
  $('guideButton').setAttribute('aria-pressed', guideOpen);
  const key = guideOpen ? `${guideTopic}|${state.meta.style}|${record}` : '';
  if (key === guideShown) return;
  guideShown = key;
  $('guide').hidden = !guideOpen;
  if (!guideOpen) return;
  const scroll = $('guide').scrollTop, same = $('guide').dataset.topic === guideTopic;
  $('guide').innerHTML = guideMarkup(guideTopic);
  $('guide').dataset.topic = guideTopic;
  $('guide').scrollTop = same ? scroll : 0;
}

// The panel follows the page shown, except the Learn page, which keeps the topic last chosen there.
function guideFollow() {
  if (GUIDES[record] || record === 'chart') guideTopic = record;
}

function showGuide(open, topic) {
  guideOpen = open;
  if (topic) guideTopic = topic; else if (open) guideFollow();
  try { localStorage.setItem(GUIDE_KEY, open ? 'open' : 'closed'); } catch {}
  renderGuide();
  if (layout && record === 'chart') renderCanvas();
}

$('guideButton').onclick = () => showGuide(!guideOpen);
$('guide').addEventListener('click', e => {
  if (e.target.closest('#closeGuide')) { showGuide(false); return; }
  if (e.target.closest('#guideExample')) { $('loadExample').click(); return; }
  const go = e.target.closest('[data-guide-go]');
  if (go) showRecord(go.dataset.guideGo);
});
$('guide').addEventListener('change', e => {
  if (e.target.id !== 'guideTopic') return;
  guideTopic = e.target.value;
  renderGuide();
});

// ---- The Learn page ----

function learnPage() {
  let n = 0;
  return `${pageHead('Learn the methods', 'An RCA moves from the problem, through the facts and the causes, to the actions that stop it happening again. Each method below has a guide: what it is, when to use it, how to fill it in, and what to avoid, with an excerpt of the same worked example, a leaking seal on pump P-101A.',
    '<button class="button primary" data-act="learn-example">Open the full example</button>')}
    ${GUIDE_STAGES.map(st => `<section class="card learn-stage">
      <h2>${st.name}</h2>
      <ol class="learn-list">${st.topics.map(t => {
        const g = guideFor(t); n++;
        return `<li><span class="learn-num">${n}</span><div><b>${g.name}</b><span class="muted">${g.summary}</span></div>
          <button class="button" data-act="learn-guide" data-v="${t}">Guide</button>
          ${g.page ? `<button class="button" data-act="learn-go" data-v="${g.page}">Open</button>` : '<span class="learn-where">Print ▾</span>'}</li>`;
      }).join('')}</ol>
    </section>`).join('')}
    <p class="note">The guide opens beside any page with <b>Guide</b> in the top bar, and follows you from page to page. Not every RCA needs every method: a simple failure may need only the problem, the evidence, the chart, and the actions.</p>`;
}

$('records').addEventListener('click', e => {
  const b = e.target.closest('[data-act^="learn-"]');
  if (!b) return;
  if (b.dataset.act === 'learn-guide') showGuide(true, b.dataset.v);
  else if (b.dataset.act === 'learn-go') showRecord(b.dataset.v);
  else $('loadExample').click();
});

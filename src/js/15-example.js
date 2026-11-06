// The built-in worked example: high leakage on the single cartridge seal of pump P-101A.
// People and dates are invented. Fresh ids are made on every load, as for any new RCA.

function exampleRca() {
  const s = blankState();
  const ids = {};
  const ev = {};

  const evidence = [
    ['Leakage measured at the gland drain: 15 ml/min against an acceptance limit under 1 ml/min.', 'sensed', 'Field measurement, graduated cylinder, P-101A gland drain', 'K. Osei', '2026-09-14'],
    ['Teardown: heat checking across the SiC seat, chipped OD edge on the carbon face, continuous wear track.', 'sensed', 'Seal workshop teardown report and photos', 'L. Moreau', '2026-09-17'],
    ['DCS trend TI-104: seal chamber temperature up 18 °C over the 6 h before the leak was reported.', 'sensed', 'DCS historian, tag TI-104', 'R. Haddad', '2026-09-15'],
    ['Plan 11 orifice (3 mm) about 90 % blocked with catalyst fines; flush line has no strainer or cyclone.', 'sensed', 'Orifice removed at teardown; P&ID and line walk', 'L. Moreau', '2026-09-17'],
    ['Process upset on 12 Sep; filter F-101 bypass valve opened for 40 min.', 'sensed', 'Operations upset report and DCS valve position log', 'R. Haddad', '2026-09-15'],
    ['Vapour-pressure margin in the seal chamber about 0.3 bar at 92 °C; flashes with a further 10–15 °C.', 'inferred', 'Calculation from product vapour-pressure curve and chamber pressure', 'S. Varga', '2026-09-18'],
    ['Seal selection datasheet records no vapour-pressure margin check.', 'sensed', 'Seal selection file, datasheet rev. B', 'S. Varga', '2026-09-18'],
    ['No seal-system walkdown after the upset or the bypass; none is required by the procedure.', 'sensed', 'Shift log and operator interview', 'K. Osei', '2026-09-16'],
    ['Vibration 2.1 mm/s overall; laser alignment within 0.05 mm; set screws and setting clips correctly removed.', 'sensed', 'Condition monitoring report and teardown', 'R. Haddad', '2026-09-16'],
    ['Lab dynamic test on a spare seal from the same batch: 0.2 ml/min at duty pressure and temperature, faces as new.', 'sensed', 'In-house dynamic test rig, test report LT-2026-118', 'L. Moreau', '2026-09-24'],
  ];
  evidence.forEach(([description, type, source, collectedBy, date], i) => {
    const e = {id: uuid(), code: `E${i + 1}`, description, type, source, collectedBy, date};
    s.evidence.push(e); ev[e.code] = e.id;
  });

  const node = (key, kind, title, opts = {}) => {
    const n = {...blankNode(kind, title), ...opts, evidenceIds: (opts.evidence || []).map(code => ev[code])};
    delete n.evidence;
    s.nodes.push(n); ids[key] = n.id;
  };
  const causes = (effect, ...keys) => { for (const key of keys) s.links.push({id: uuid(), effectId: ids[effect], causeId: ids[key]}); };
  const stop = reason => ({reason, note: ''});

  s.nodes = [];
  node('leak', 'effect', 'High seal leakage, 15 ml/min (limit under 1 ml/min)', {evidence: ['E1']});
  s.problem.primaryEffectId = ids.leak;

  node('path', 'action', 'Leak path opened across primary faces', {evidence: ['E1', 'E2']});
  node('pressurised', 'condition', 'Seal chamber pressurised with process fluid', {evidence: ['E7'], stopPoint: stop('no-value')});
  node('damaged', 'action', 'Faces damaged (heat checking on SiC, chipping on carbon)', {evidence: ['E2']});
  node('film', 'condition', 'Seal relies on a stable liquid film', {stopPoint: stop('no-value')});
  node('flashed', 'action', 'Fluid film flashed to vapour (intermittent dry running)', {evidence: ['E2', 'E6']});
  node('dryrun', 'condition', 'Carbon/SiC pair has limited dry-run tolerance', {evidence: ['E2'], stopPoint: stop('no-value')});
  node('temp', 'action', 'Seal chamber temperature rose 18 °C', {evidence: ['E3']});
  node('vapour', 'condition', 'Product close to its vapour pressure', {evidence: ['E6']});
  node('selection', 'condition', 'Seal selected without checking vapour-pressure margin', {evidence: ['E7'], controllable: true, causeType: 'systemic', stopPoint: stop('solution-found')});
  node('flow', 'action', 'Plan 11 flush flow dropped to near zero', {evidence: ['E3', 'E4']});
  node('heat', 'condition', 'Heat input from face friction and pump', {stopPoint: stop('no-value')});
  node('solids', 'action', 'Solids entered the flush line', {evidence: ['E4']});
  node('orifice', 'condition', '3 mm orifice, no strainer or cyclone', {evidence: ['E4'], controllable: true, causeType: 'occurrence', stopPoint: stop('solution-found')});
  node('bypass', 'action', 'Filter bypass opened during process upset', {evidence: ['E5'], controllable: true, causeType: 'occurrence', stopPoint: stop('solution-found')});
  node('nocheck', 'condition', 'No seal-system check after upset or bypass', {evidence: ['E8'], controllable: true, causeType: 'escape', stopPoint: stop('solution-found')});

  causes('leak', 'path', 'pressurised');
  causes('path', 'damaged', 'film');
  causes('damaged', 'flashed', 'dryrun');
  causes('flashed', 'temp', 'vapour');
  causes('vapour', 'selection');
  causes('temp', 'flow', 'heat');
  causes('flow', 'solids', 'orifice');
  causes('solids', 'bypass', 'nocheck');

  s.meta = {
    rcaNumber: 'RCA-2026-014', equipmentTag: 'P-101A', sealType: 'Single cartridge seal, API Plan 11, OH2 pump', style: 'apollo',
    leadId: '', team: [], dates: {opened: '2026-09-15', eventDate: '2026-09-14', closed: ''},
    status: 'actions', customerRef: 'Plant incident report IR-2026-0917', revision: 'A',
    signoff: {prepared: {name: 'L. Moreau', date: '2026-10-02'}, reviewed: {name: 'R. Haddad', date: '2026-10-05'}, approved: {name: '', date: ''}},
  };
  const team = [['L. Moreau', 'Seal specialist, test lab'], ['R. Haddad', 'Reliability engineer'], ['K. Osei', 'Operations supervisor'], ['S. Varga', 'Process engineer']];
  s.meta.team = team.map(([name, role]) => ({id: uuid(), name, role}));
  s.meta.leadId = s.meta.team[0].id;
  s.problem = {
    primaryEffectId: ids.leak,
    when: '14 Sep 2026, 06:30, found on morning round; two days after a process upset',
    where: 'Unit 2, pump P-101A, inboard single cartridge seal',
    significance: {
      safety: 'Flammable hydrocarbon leaking at the gland; area barriered off.',
      environment: 'Hydrocarbon release to the drain system; VOC emissions above permit for the seal.',
      productionCost: 'Switched to spare P-101B; seal replacement and repair about €12k.',
      reliability: 'Second seal failure on P-101A in 14 months; no spare pump while P-101A is down.',
    },
  };

  s.ruledOut = [
    ['Shaft misalignment', 'Laser alignment check after the failure', ['E9']],
    ['Excessive vibration', 'Condition monitoring trend before and after the event', ['E9']],
    ['Installation error', 'Teardown: setting clips removed, set screws tight, correct compression', ['E2', 'E9']],
    ['Elastomer chemical attack', 'Teardown: O-rings intact, no swelling or hardening', ['E2']],
    ['Face manufacturing defect', 'Lab dynamic test on a spare seal from the same batch', ['E10']],
  ].map(([cause, test, codes]) => ({id: uuid(), cause, kind: '', test, evidenceIds: codes.map(c => ev[c]), status: 'ruled-out'}));

  const crit = (a, b, c, d) => Object.fromEntries(['preventsRecurrence', 'withinControl', 'meetsGoals', 'noNewProblems'].map((k, i) => [k, {v: [a, b, c, d][i][0], c: [a, b, c, d][i][1] || ''}]));
  const solution = (title, keys, criteria, decision) => ({id: uuid(), title, causeIds: keys.map(k => ids[k]), criteria, decision});
  s.solutions = [
    solution('Add a cyclone separator to the flush (Plan 11 + 31)', ['orifice'], crit(['yes'], ['yes'], ['yes'], ['yes']), 'implement'),
    solution('Seal-system check in the upset and filter-bypass procedure', ['nocheck', 'bypass'], crit(['yes'], ['yes'], ['yes'], ['yes']), 'implement'),
    solution('Vapour-pressure margin step in seal selection', ['selection'], crit(['yes', 'Prevents recurrence on future selections'], ['yes'], ['yes'], ['yes']), 'implement'),
    solution('Seal chamber high-temperature alarm on TI-104', ['temp'], crit(['partly', 'Secondary barrier: detects, does not prevent'], ['yes'], ['yes'], ['yes']), 'implement'),
    solution('Change to SiC/SiC faces', ['dryrun'], crit(['no', 'SiC/SiC tolerates dry running worse'], ['yes'], ['no'], ['no', 'Brittle pair, worse dry-run behaviour']), 'reject'),
    solution('Larger flush orifice', ['orifice'], crit(['partly', 'Less prone to blocking'], ['yes'], ['partly'], ['partly', 'More flush flow, more heat and erosion; needs a study']), 'study'),
    solution('Train operators', ['bypass'], crit(['no', 'Does not change the conditions'], ['yes'], ['no'], ['yes']), 'reject'),
  ];
  const action = (text, sol, kind, strength, owner, due, verification, check, status = 'open') =>
    ({id: uuid(), action: text, solutionId: sol === null ? '' : s.solutions[sol].id, kind, strength, owner, due, verification, status, effectiveness: {date: check, result: ''}});
  // Dates still to come are counted from today, so the example never turns overdue.
  const inDays = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  s.actions = [
    action('Run on P-101B, with its flush strainer cleaned and checked every shift until the cyclone is in', null, 'containment', '', 'R. Haddad', '2026-09-15', 'Shift log of strainer checks', inDays(60), 'verified'),
    action('Engineer and install cyclone separator on P-101A/B flush', 0, 'corrective', 'strong', 'S. Varga', inDays(40), 'Installation check and flush flow test', inDays(220)),
    action('Add a seal-system walkdown checklist to upset procedure OP-212', 1, 'corrective', 'medium', 'K. Osei', inDays(10), 'Procedure review and a field audit after the next upset', inDays(190)),
    action('Add vapour-pressure margin step to the seal selection checklist', 2, 'preventive', 'medium', 'L. Moreau', inDays(14), 'Checklist audit on the next three selections', inDays(194), 'in-progress'),
    action('Configure TI-104 high alarm at 85 °C', 3, 'corrective', 'medium', 'R. Haddad', '2026-10-31', 'Alarm test from the DCS', inDays(180), 'implemented'),
  ];
  s.equipment = {
    machine: 'Centrifugal pump, overhung, API 610 OH2', machineModel: 'P-101A, 3x4-10, 37 kW',
    sealModel: 'Single cartridge pusher seal', arrangement: 'Single (Arrangement 1)', sealPlans: '11',
    faces: 'Carbon against silicon carbide', elastomers: 'FKM O-rings',
    product: 'Light naphtha with fine catalyst fines after upsets', specificGravity: '0.68', viscosity: '0.4 cP',
    vapourPressure: '6.1 bar a at 85 °C', temperature: '62 °C', suction: '4.5 bar g', discharge: '14 bar g', chamber: '5.2 bar g',
    speed: '2960 rpm', flowRate: '85 m³/h, 90 % of BEP', operation: 'Continuous; process upset and filter bypass two days before',
    flushFlow: 'Normally 6 l/min; near zero when found', flushTemp: '62 °C', flushPressure: 'Discharge, through a 3 mm orifice',
    runout: '0.03 mm TIR', endFloat: '0.05 mm', alignment: 'Within 0.05 mm, checked after the failure', vibration: '2.1 mm/s, steady',
    bearings: 'Good; oil clean',
    installed: '2025-07-02', failed: '2026-09-14', firstLeak: '14 Sep 2026, 06:30, morning round', leakRate: '15 ml/min at the gland drain',
    detectedBy: 'Operator round', previous: 'One, July 2025: faces heat-checked, cause not found',
    changes: 'Process upset on 12 Sep with the flush filter bypassed for about 6 hours. No maintenance on the pump since the last seal change.',
    preserved: 'Workshop quarantine shelf, bagged and labelled', decontaminated: 'Steam-cleaned outside only; faces untouched',
    photos: 'RCA folder, teardown 16 Sep', asFound: 'Stationary SiC face heat-checked with radial cracks; carbon face chipped at the OD; O-rings intact; springs free; orifice blocked with black fines.',
  };
  // Is / Is Not: the problem specified, and three causes tested against it.
  s.specification = blankSpecification();
  const facts = [
    ['P-101A inboard seal', 'P-101B: same service, same seal, on standby', 'P-101A was running through the upset; P-101B was not', 'Flush filter bypassed on 12 Sep'],
    ['Heat checking on the SiC face, chipped carbon', 'Worn springs, damaged O-rings, corrosion', 'Thermal damage only', ''],
    ['Unit 2, P-101A', 'P-103A/B, the other Plan 11 pumps on the unit', 'Only P-101A takes its flush from the bypassed filter header', ''],
    ['The faces; the carbon at its OD', 'Sleeve, gland, O-ring grooves', 'Where the film is thinnest and hottest', ''],
    ['14 Sep 2026, two days after the upset', 'Before the upset: no leak on any round', '', 'Process upset and filter bypass, 12 Sep'],
    ['Once; the last failure was July 2025', 'Repeated or intermittent leaks', '', ''],
    ['Steady running, 14 months after installation', 'At start-up or shutdown', '', ''],
    ['One seal', 'Any other seal on the unit', '', ''],
    ['15 ml/min', 'A sudden large release', '', ''],
    ['Steady since found', 'Rising', '', ''],
  ];
  s.specification.rows.forEach((row, i) => Object.assign(row, {is: facts[i][0], isNot: facts[i][1], distinction: facts[i][2], change: facts[i][3]}));
  const marks = pattern => Object.fromEntries(s.specification.rows.map((row, i) => [row.id, pattern[i]]).filter(([, v]) => v));
  s.specification.tests = [
    {causeId: ids.flow, marks: marks(['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes'])},
    {causeId: ids.vapour, marks: marks(['if', 'yes', 'if', 'yes', 'if', 'yes', 'if', 'if', 'yes', 'yes'])},
    {causeId: ids.dryrun, marks: marks(['if', 'yes', 'if', 'yes', 'if', 'yes', 'if', 'if', 'yes', 'yes'])},
  ];
  s.problem.readAcross = 'P-101B and the two other Plan 11 pumps on the unit (P-103A/B) have the same 3 mm flush orifice without a strainer. Inspected on 2026-09-20: orifices clean. The cyclones are on the same work order.';
  // Two 5 Whys chains: one that led to the chart, and one not yet added to it.
  const step = (answer, kind, codes = [], key = null) => ({id: uuid(), answer: key ? '' : answer, kind, evidenceIds: key ? [] : codes.map(c => ev[c]), nodeId: key ? ids[key] : null});
  s.fiveWhys = [
    {id: uuid(), effectId: ids.leak, steps: [
      step('', 'action', [], 'path'), step('', 'action', [], 'damaged'), step('', 'action', [], 'flashed'),
      step('', 'action', [], 'temp'), step('', 'action', [], 'flow'), step('', 'action', [], 'solids'),
    ]},
    {id: uuid(), effectId: ids.nocheck, steps: [
      step('Upset procedure OP-212 does not mention the seal system', 'condition', ['E8']),
      step('OP-212 was last revised before the Plan 11 seals were fitted', 'condition'),
    ]},
  ];
  // A fishbone of the possible causes, each on the chart, ruled out, or still to test.
  const ruled = s.ruledOut;
  const fish = (parentId, text, kind, {key, ruledOut, codes = []} = {}) =>
    ({id: uuid(), text: key || ruledOut ? '' : text, kind, evidenceIds: key || ruledOut ? [] : codes.map(c => ev[c]),
      nodeId: key ? ids[key] : null, ruledOutId: ruledOut?.id ?? null, parentId});
  const category = (name, ...causes) => ({id: uuid(), name, causes});
  const flush = fish(null, '', 'action', {key: 'flow'}), solids = fish(null, '', 'action', {key: 'solids'});
  s.fishbones = [{id: uuid(), effectId: ids.leak, categories: [
    category('Seal and materials', fish(null, '', 'condition', {key: 'dryrun'}), fish(null, '', 'condition', {ruledOut: ruled[4]}),
      fish(null, '', 'condition', {ruledOut: ruled[3]}), fish(null, '', 'condition', {key: 'selection'})),
    category('Installation', fish(null, '', 'action', {ruledOut: ruled[2]}), fish(null, '', 'condition', {ruledOut: ruled[0]})),
    category('Operation', fish(null, '', 'action', {key: 'bypass'}), fish(null, 'Pump run away from its best efficiency point', 'action')),
    category('Process fluid', fish(null, '', 'condition', {key: 'vapour'}), solids,
      fish(solids.id, 'Catalyst fines carried over from the reactor during the upset', 'action', {codes: ['E5']})),
    category('Support system', flush, fish(flush.id, '', 'condition', {key: 'orifice'}), fish(flush.id, 'Flush line not checked after the upset', 'condition', {codes: ['E8']})),
    category('Pump and equipment', fish(null, '', 'condition', {ruledOut: ruled[1]}), fish(null, 'Worn bearings letting the shaft move', 'condition')),
  ]}];
  // The sequence of events, from the upset to the teardown; its deviations are on the chart, but one.
  const event = (start, end, text, kind, {key, deviation = false, codes = []} = {}) =>
    ({id: uuid(), text: key ? '' : text, start, end, kind, deviation, evidenceIds: key ? [] : codes.map(c => ev[c]), nodeId: key ? ids[key] : null});
  const phase = (name, ...events) => ({id: uuid(), name, events});
  s.timelines = [{id: uuid(), effectId: ids.leak, phases: [
    phase('Before the event',
      event('2026-09-12T13:50', '', 'Process upset in the reactor section', 'action', {codes: ['E5']}),
      event('2026-09-12T14:05', '2026-09-12T14:45', '', 'action', {key: 'bypass', deviation: true}),
      event('2026-09-12T15:30', '', 'Upset over; no seal-system walkdown', 'condition', {deviation: true, codes: ['E8']})),
    phase('Lead-up',
      event('2026-09-12T15:00', '2026-09-13T22:00', '', 'action', {key: 'solids', deviation: true}),
      event('2026-09-13T22:00', '2026-09-14T00:30', '', 'action', {key: 'flow', deviation: true}),
      event('2026-09-14T00:30', '2026-09-14T06:30', '', 'action', {key: 'temp', deviation: true})),
    phase('Failure',
      event('2026-09-14T06:30', '', 'Leakage of 15 ml/min found on the morning round', 'action', {deviation: true, codes: ['E1']}),
      event('2026-09-14T07:10', '', 'Switched to the spare pump P-101B', 'action')),
    phase('Response',
      event('2026-09-15T09:00', '', 'DCS trends and the upset report reviewed', 'action', {codes: ['E3', 'E5']}),
      event('2026-09-17T08:00', '2026-09-17T16:00', 'Seal teardown in the workshop', 'action', {codes: ['E2', 'E4']})),
  ]}];
  // Failed vs good: P-101A beside its twin and a pump with the same seal on another service. The
  // differences that explain it are on the chart; the same 3 mm orifice in all three cannot explain it alone.
  const eventOf = key => s.timelines[0].phases.flatMap(p => p.events).find(x => x.nodeId === ids[key]).id;
  const whenRow = s.specification.rows.find(r => r.dim === 'when');
  s.comparison = {
    cases: [
      {name: 'P-101A', why: 'Leaked 15 ml/min on 14 Sep 2026, 439 days after the seal was fitted.'},
      {name: 'P-101B', why: 'The twin pump on the same duty, with the same seal; ran as duty pump until 2025 with no seal failure.'},
      {name: 'P-103A', why: 'Same unit, same seal and Plan 11, on a heavier naphtha service; three years with no seal failure.'},
    ],
    rows: [],
  };
  const row = (cat, factor, field, failed, good, differs, explains, {codes = [], key = null, event = null, when = '', spec = ''} = {}) =>
    s.comparison.rows.push({...blankCompareRow(cat, factor, field), failed: field ? '' : failed, good, differs, explains,
      evidenceIds: codes.map(c => ev[c]), nodeId: key ? ids[key] : null, eventId: event ? eventOf(event) : '', when, specRowId: spec});
  const [machine, duty, support, mech, install, operation] = COMPARE_CATEGORIES;
  row(machine, 'Machine', 'machine', '', ['Same', 'Same type, smaller (2x3-8)'], 'differs', 'no');
  row(machine, 'Seal make, model, and drawing', 'sealModel', '', ['Same', 'Same'], 'same', 'no', {codes: ['E7']});
  row(machine, 'Face materials', 'faces', '', ['Same', 'Same'], 'same', 'no');
  row(machine, 'Secondary seals', 'elastomers', '', ['Same', 'Same'], 'same', 'no');
  row(duty, 'Product', 'product', '', ['Same', 'Heavier naphtha, no fines'], 'differs', 'partly');
  row(duty, 'Vapour pressure', 'vapourPressure', '', ['Same', 'Well below the seal chamber pressure'], 'differs', 'partly', {codes: ['E6'], key: 'vapour'});
  row(duty, 'Flow', 'flowRate', '', ['Same', '70 % of BEP'], 'differs', 'no');
  row(duty, 'Operation before the failure', 'operation', '', ['Standby since 2025', 'Continuous; upsets, never a filter bypass'], 'differs', 'partly');
  row(duty, 'Seal chamber temperature', '', 'Rose 18 °C in the 6 h before the leak', ['Steady when it was the duty pump', 'Steady'], 'differs', 'yes',
    {codes: ['E3'], key: 'temp', event: 'temp'});
  row(support, 'Flush or buffer flow', 'flushFlow', '', ['Steady, about 6 l/min', 'Steady'], 'differs', 'yes', {codes: ['E3', 'E4'], key: 'flow', event: 'flow'});
  row(support, 'Flush pressure', 'flushPressure', '', ['Same', 'Same'], 'same', 'no', {codes: ['E4'], key: 'orifice'});
  row(support, 'Filter upstream of the flush', '', 'F-101, bypassed for 40 min on 12 Sep', ['F-102, never bypassed', 'F-103, never bypassed'], 'differs', 'yes',
    {codes: ['E5'], key: 'bypass', event: 'bypass', spec: whenRow.id});
  row(support, 'Solids reaching the seal', '', 'Catalyst fines blocking the orifice', ['None found', 'None found at the read-across check'], 'differs', 'yes',
    {codes: ['E4'], key: 'solids', event: 'solids'});
  row(mech, 'Shaft runout', 'runout', '', ['0.04 mm TIR', '0.03 mm TIR'], 'same', 'no', {codes: ['E9']});
  row(mech, 'Vibration before the failure', 'vibration', '', ['1.9 mm/s', '2.4 mm/s'], 'same', 'no', {codes: ['E9']});
  row(install, 'Fitted by', '', 'Site workshop, to the seal maker’s instructions', ['Same', 'Same'], 'same', 'no', {codes: ['E9']});
  row(operation, 'Seal-system check after an upset', '', 'None; OP-212 does not ask for one', ['None', 'None'], 'same', 'no', {codes: ['E8'], key: 'nocheck'});
  row(operation, 'Upsets during the run', '', 'One, 12 Sep 2026, with the filter bypassed', ['Several while it was the duty pump; filter in service', ''], 'unknown', 'unknown');
  return {...s, view: {collapsed: []}};
}

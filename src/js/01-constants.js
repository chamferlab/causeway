// Constants: file format, node kinds, chart geometry and colours.

const NS = 'http://www.w3.org/2000/svg';
const FILE_TYPE = 'causeway';
const LEGACY_FILE_TYPE = 'apollo-rca';   // files saved before the tool was named Causeway
const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'causeway-v1';
const LEGACY_STORAGE_KEY = 'apollo-rca-v1';
const HISTORY_LIMIT = 100;

const KINDS = {
  effect: {name: 'Primary effect', label: 'PRIMARY EFFECT'},
  action: {name: 'Action', label: 'ACTION'},
  condition: {name: 'Condition', label: 'CONDITION'},
  cause: {name: 'Cause', label: 'CAUSE'},          // a cause without a type: made in a cause tree
};
// The two chart styles an RCA can have. Apollo: each effect has its actions and conditions, all
// needed (AND). Cause tree: each effect has its possible causes, any of which may explain it.
const CHART_STYLES = {
  apollo: {name: 'Apollo', about: 'Each effect has at least one action and one condition, all needed (AND).'},
  tree: {name: 'Cause tree', about: 'Each effect has its possible causes, any of which may explain it. Test each hypothesis until it is confirmed or ruled out.'},
};
// A cause's status in a cause tree.
const STATUSES = {
  possible: {name: 'Hypothesis', label: 'HYPOTHESIS', mark: 'H'},
  confirmed: {name: 'Confirmed', label: '✓ CONFIRMED', mark: '✓'},
  'ruled-out': {name: 'Ruled out', label: '✕ RULED OUT', mark: '✕'},
};
// A root cause's type, as 8D asks for it: why the failure happened, why it was not caught, and why
// the system allowed it.
const CAUSE_TYPES = {
  occurrence: {name: 'Occurrence', tag: 'OCCURRENCE', about: 'Why the failure happened'},
  escape: {name: 'Escape point', tag: 'ESCAPE', about: 'Why it was not detected or caught earlier', missing: 'No cause is marked as escape point: why was the failure not detected or caught earlier?'},
  systemic: {name: 'Systemic', tag: 'SYSTEMIC', about: 'Why the system (design, planning, procedures, management) allowed it', missing: 'No cause is marked systemic: what in design, planning, procedures, or management allowed it?'},
};
const STOP_REASONS = {
  'outside-control': 'Outside our control',
  'solution-found': 'Effective solution found',
  'no-evidence': 'No further evidence',
  'no-value': 'Going further adds nothing',
};

// Is / Is Not (Kepner-Tregoe problem specification): the questions each dimension starts with.
const SPEC_DIMS = {what: 'What', where: 'Where', when: 'When', extent: 'Extent'};
const SPEC_QUESTIONS = {
  what: ['What object or equipment has the problem?', 'What is wrong with it: the defect?'],
  where: ['Where is the object: unit, site, position?', 'Where on the object is the defect?'],
  when: ['When was it first seen?', 'When since then: pattern, frequency?', 'When in its life or operating cycle?'],
  extent: ['How many objects have it?', 'How big is each defect?', 'What is the trend?'],
};
// How a cause answers one fact: it explains why the problem is here and not there, only if an
// assumption holds, or not at all. Clicking a cell goes round them in this order.
const SPEC_MARKS = {yes: {mark: '✓', name: 'Explains it'}, if: {mark: '?', name: 'Only if an assumption holds'}, no: {mark: '✕', name: 'Does not explain it'}};

// The equipment and duty record: what a seal or pump maker asks for when a failed part comes back.
// Each field is [key, label, placeholder, type]; the type is 'date', 'area', or a one-line text.
const EQUIPMENT_SECTIONS = [
  {title: 'Machine and seal', fields: [
    ['machine', 'Machine', 'e.g. Centrifugal pump, overhung, API 610 OH2'],
    ['machineModel', 'Make, model, and size', ''],
    ['sealModel', 'Seal make, model, and drawing', ''],
    ['arrangement', 'Seal arrangement', 'e.g. Single, dual unpressurised, dual pressurised'],
    ['sealPlans', 'Seal piping plans', 'e.g. 11, or 11 + 52, or 53B'],
    ['faces', 'Face materials', 'e.g. Carbon against silicon carbide'],
    ['elastomers', 'Secondary seals', 'e.g. FKM O-rings'],
  ]},
  {title: 'Duty at the failure', fields: [
    ['product', 'Product', 'Fluid, and any solids, crystals, or dissolved gas'],
    ['specificGravity', 'Specific gravity', ''],
    ['viscosity', 'Viscosity', 'At pumping temperature'],
    ['vapourPressure', 'Vapour pressure', 'At seal chamber temperature'],
    ['temperature', 'Pumping temperature', ''],
    ['suction', 'Suction pressure', ''],
    ['discharge', 'Discharge pressure', ''],
    ['chamber', 'Seal chamber pressure', ''],
    ['speed', 'Speed', 'rpm'],
    ['flowRate', 'Flow', 'And its share of the best efficiency point'],
    ['operation', 'Operation before the failure', 'e.g. Continuous, standby, start-up, upset'],
  ]},
  {title: 'Seal support system', fields: [
    ['flushFlow', 'Flush or buffer flow', ''],
    ['flushTemp', 'Flush temperature', ''],
    ['flushPressure', 'Flush pressure', ''],
    ['barrierFluid', 'Barrier or buffer fluid', ''],
    ['barrierPressure', 'Barrier pressure, and what holds it', 'e.g. 12 bar g, nitrogen on the reservoir'],
    ['reservoir', 'Reservoir level and top-ups', ''],
    ['cooling', 'Cooling', 'Cooler, cooling water flow and temperatures'],
  ]},
  {title: 'Mechanical condition', fields: [
    ['runout', 'Shaft runout', ''],
    ['endFloat', 'Axial end float', ''],
    ['alignment', 'Alignment', ''],
    ['vibration', 'Vibration before the failure', ''],
    ['bearings', 'Bearings and lubrication', ''],
  ]},
  {title: 'History', fields: [
    ['installed', 'Seal installed', '', 'date'],
    ['failed', 'Failed or removed', '', 'date'],
    ['firstLeak', 'First leak noticed', 'When, and by whom'],
    ['leakRate', 'Leak rate', ''],
    ['detectedBy', 'How it was found', 'e.g. Round, alarm, condition monitoring, trip'],
    ['previous', 'Earlier failures in this position', 'How many, when, and what failed'],
    ['changes', 'Changes since the last good run', 'Process, operation, maintenance, parts, or design', 'area'],
  ]},
  {title: 'Failed parts', fields: [
    ['preserved', 'Where the parts are kept', 'Bagged and labelled, not cleaned'],
    ['decontaminated', 'Decontamination', 'Done, and the declaration for the seal maker'],
    ['photos', 'Photos', 'Where they are filed'],
    ['asFound', 'As-found condition', 'Each part as it came apart: faces, wear track, secondary seals, springs, drive, sleeve', 'area'],
  ]},
];
const EQUIPMENT_KEYS = EQUIPMENT_SECTIONS.flatMap(s => s.fields.map(f => f[0]));

// Failed vs good: the failed case beside two comparable ones that did not fail. Factor rows are sorted
// into these categories; the first four are the equipment record's, so its fields start the rows.
const COMPARE_CATEGORIES = ['Machine and seal', 'Duty at the failure', 'Seal support system', 'Mechanical condition', 'Installation and maintenance', 'Operation and changes'];
const COMPARE_DIFFERS = {same: 'Same', differs: 'Differs', unknown: '?'};
const COMPARE_EXPLAINS = {yes: 'Yes', partly: 'Partly', no: 'No', unknown: '?'};
const COMPARE_NOTE = 'This table shows only the factors that differ between the failed case and the good cases; factors that match are hidden.';

// Where the RCA stands. It can only be closed once its actions are validated.
const RCA_STATUS = {open: 'Open', 'root-cause': 'Root cause found', actions: 'Actions in progress', closed: 'Closed'};
const SIGNOFF_ROLES = {prepared: 'Prepared by', reviewed: 'Reviewed by', approved: 'Approved by'};

// Record values. Keys are what the file stores; values are what the page shows.
const EVIDENCE_TYPES = {sensed: 'Sensed', inferred: 'Inferred'};
const RULED_OUT_STATUS = {'testing': 'Being tested', 'ruled-out': 'Ruled out'};
const CRITERIA = {
  preventsRecurrence: 'Prevents recurrence?', withinControl: 'Within our control?',
  meetsGoals: 'Meets our goals?', noNewProblems: 'No new problems?',
};
const CRITERION_VALUES = {yes: 'Yes', partly: 'Partly', no: 'No'};
const DECISIONS = {implement: 'Implement', study: 'Study further', reject: 'Reject'};
// An action's status, as 8D tracks it: implemented (done), verified (done as intended), and validated
// (its effectiveness check shows the problem is gone). Files from before keep 'done' as implemented.
const ACTION_STATUS = {open: 'Identified', 'in-progress': 'In progress', implemented: 'Implemented', verified: 'Verified', validated: 'Validated', cancelled: 'Cancelled'};
const ACTION_DONE = ['implemented', 'verified', 'validated'];
// What an action is for: containment protects until the fix is in (8D D3), a corrective action removes
// a cause (D5–D6), and a preventive one stops it elsewhere or in the system (D7).
const ACTION_KINDS = {containment: 'Containment', corrective: 'Corrective', preventive: 'Preventive'};
// How much an action relies on people remembering, after the action hierarchy of RCA².
const ACTION_STRENGTH = {strong: 'Strong', medium: 'Medium', weak: 'Weak'};
// Starting categories for a fishbone diagram; each can be renamed, added, or removed.
const FISHBONE_PRESETS = {
  seal: {name: 'Seal failure', categories: ['Seal and materials', 'Installation', 'Operation', 'Process fluid', 'Support system', 'Pump and equipment']},
  '6m': {name: '6M', categories: ['People', 'Method', 'Machine', 'Material', 'Measurement', 'Environment']},
  blank: {name: 'Four blank categories', categories: ['Category 1', 'Category 2', 'Category 3', 'Category 4']},
};
// Starting phases for a sequence of events; each can be renamed, added, or removed.
const TIMELINE_PRESETS = {
  test: {name: 'Test run', phases: ['Pre-test work', 'Testing', 'Post-test work', 'Report']},
  field: {name: 'Field failure', phases: ['Before the event', 'Lead-up', 'Failure', 'Response']},
  blank: {name: 'Three blank phases', phases: ['Phase 1', 'Phase 2', 'Phase 3']},
};

// Chart geometry, in chart units (one unit is one CSS pixel at 100 %).
const NODE_W = 200;
const NODE_PAD_X = 12;
const NODE_PAD_Y = 9;
const KIND_LINE = 15;        // the small kind label above the title
const BADGE_ROOM = 14;       // in a cause tree, what the title leaves free for the status badge
const TITLE_LINE = 16;
const TITLE_SIZE = 12.5;
const FOOT_LINE = 20;        // evidence codes and tags under the title
const COL_GAP = 84;          // horizontal space between columns, where the connectors run
const SCENARIO_GAP = 48;     // more of it when an alternative (OR) of several causes has its own AND
const SIBLING_GAP = 16;      // vertical space between neighbouring causes
const SUBTREE_GAP = 30;      // and between neighbouring branches
const CHART_FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';

// Colours are written into the SVG as attributes, so an exported chart needs no stylesheet.
// Exports and print use the light palette; the canvas uses the dark one in the dark theme.
const CHART_COLORS = {
  panel: '#ffffff',
  effect: {fill: '#b3261e', stroke: '#8f1c16', text: '#ffffff', sub: '#ffd9d6', code: {fill: 'rgba(255,255,255,.18)', text: '#ffffff'}},
  action: {fill: '#0b5f66', stroke: '#084a50', text: '#ffffff', sub: '#bfe6e8', code: {fill: 'rgba(255,255,255,.16)', text: '#ffffff'}},
  condition: {fill: '#eef7f7', stroke: '#0d858f', text: '#16232f', sub: '#0b6e75', code: {fill: '#ffffff', stroke: '#b9dfe2', text: '#084f54'}},
  cause: {fill: '#ffffff', stroke: '#5b6b7a', text: '#16232f', sub: '#5b6b7a', dash: '5 3', code: {fill: '#e3f2f3', text: '#084f54'}},
  // Cause tree: a cause is drawn by its status.
  possible: {fill: '#ffffff', stroke: '#5b6b7a', text: '#16232f', sub: '#8a3f00', dash: '5 3', code: {fill: '#e3f2f3', text: '#084f54'}},
  confirmed: {fill: '#0b5f66', stroke: '#084a50', text: '#ffffff', sub: '#bfe6e8', code: {fill: 'rgba(255,255,255,.16)', text: '#ffffff'}},
  ruled: {fill: '#eef1f4', stroke: '#cbd5de', text: '#6a7884', sub: '#6a7884', code: {fill: '#ffffff', stroke: '#dde3e8', text: '#6a7884'}},
  confirmedWire: '#0b5f66',
  ruledWire: '#a9b5c0',
  wire: '#8796a4',
  junctionText: '#3d4f60',
  shared: '#7b5ab7',
  select: '#2563eb',
  highlight: '#e0a100',
  issue: '#c2570c',
  unverified: {fill: '#c2570c', text: '#ffffff'},
  controllable: {fill: '#2f7a3a', text: '#ffffff'},
  stop: '#16232f',
  stopText: '#ffffff',
};
const CHART_COLORS_DARK = {
  panel: '#161f28',
  effect: {fill: '#b8312a', stroke: '#e0574f', text: '#ffffff', sub: '#ffd9d6', code: {fill: 'rgba(255,255,255,.2)', text: '#ffffff'}},
  action: {fill: '#0d6e76', stroke: '#2a9aa2', text: '#ffffff', sub: '#c5ecee', code: {fill: 'rgba(255,255,255,.18)', text: '#ffffff'}},
  condition: {fill: '#13272c', stroke: '#3fb5bd', text: '#e3eef0', sub: '#7fd0d6', code: {fill: '#0e1c20', stroke: '#2f6e74', text: '#9fe2e6'}},
  cause: {fill: '#161f28', stroke: '#93a3b2', text: '#e3eaf0', sub: '#93a3b2', dash: '5 3', code: {fill: '#123238', text: '#8fdde2'}},
  possible: {fill: '#161f28', stroke: '#93a3b2', text: '#e3eaf0', sub: '#f3b27a', dash: '5 3', code: {fill: '#123238', text: '#8fdde2'}},
  confirmed: {fill: '#0d6e76', stroke: '#2a9aa2', text: '#ffffff', sub: '#c5ecee', code: {fill: 'rgba(255,255,255,.18)', text: '#ffffff'}},
  ruled: {fill: '#1b252f', stroke: '#2b3844', text: '#7d8b97', sub: '#7d8b97', code: {fill: '#161f28', stroke: '#2b3844', text: '#7d8b97'}},
  confirmedWire: '#3fb5bd',
  ruledWire: '#3a4955',
  wire: '#6f8294',
  junctionText: '#c9d5df',
  shared: '#a58be0',
  select: '#6b97ff',
  highlight: '#f2b632',
  issue: '#f08a3c',
  unverified: {fill: '#e0782f', text: '#ffffff'},
  controllable: {fill: '#3f9a4c', text: '#ffffff'},
  stop: '#e3eaf0',
  stopText: '#0e151c',
};
const MONO_FONT = 'ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace';

# Changelog

## v1.22 — 2026-10-28

Host it for colleagues.

- `scripts/run_app.sh` (Linux) and `scripts/run_app.bat` (Windows) serve Causeway from one computer: `--lan` makes it reachable from the network, `--port` picks the port (8080 by default). Python 3.8 or later and nothing else; a rebuilt `index.html` is served without a restart.
- The README explains preparing the host, the firewall, starting at boot, and what people should know about saving.
- On Windows, `scripts/install_service.bat` installs it as an NSSM service that starts with Windows, logs to `logs\causeway.log`, and opens the firewall port; `scripts/update.bat` stops the service, pulls, and starts it again.

## v1.21 — 2026-10-27

DFMEA, a module of its own beside the RCA.

- **RCA | DFMEA** in the top bar switches module. The two share the app and nothing else: each has its own pages, undo history, autosave, and file, and the top bar's buttons act on the module shown. A DFMEA file opens in the DFMEA from either module.
- A DFMEA is a tree of seven levels, project to cause, panned and zoomed as the RCA chart, and edited as a mind map: **Tab** child, **Enter** sibling, typing names, **F2** edits, **Ctrl+C**/**Ctrl+V** copy branches, and text pastes one child per line. Each branch to a cause has an ID.
- Pages: **Structure** (the tree and its properties), **Risk analysis** (every branch, rated in the table), **Optimisation** (actions and the ratings they should reach), and **Action tracker** (assignee, status, target, ISO weeks, and weekly notes).
- Scoring by **RPN with a limit** (D × max(Safety, Environment, Others) × POF) or by **AIAG-VDA Action Priority**, switchable at any time: each cause keeps both sets of ratings.
- Issues, a printed **DFMEA report**, and the same as Word. A CS-50 cartridge seal example.

## v1.20 — 2026-10-27

Editing from the keyboard, as in a mind map, in both chart styles.

- **Tab** adds a cause of the selected node (**Shift+Tab** a condition, in Apollo), and **Enter** a sibling: another cause of the same effect, of the same kind, just below. The new cause is selected, and the keys stay on the chart: **Tab, Tab** nests, and editing starts only when you type. Enter while typing finishes the title; Enter again adds the next sibling.
- **F2** edits the title (Enter no longer does). Insert, Alt+A, and Alt+C add without editing too; the **+ Action**, **+ Condition**, and **+ Cause** buttons still put the new title ready to type.

## v1.19 — 2026-10-27

Alternatives (OR) in Apollo, and Tab to add causes.

- **Alternatives (OR)**: in Apollo, select causes of one effect and press **Alt+O** (or **Make them alternatives**) when the evidence cannot yet tell which of them it was. They are drawn on their own bracket with a dashed **OR**, joined to the other causes by AND, and marked unverified.
- A group counts as the action, or the condition, an effect needs only when each of its causes is one. Each alternative carries an issue until all but one are ruled out.
- **Keep this one** settles a group: the other alternatives move to the causes ruled out. **Rule out** on one works as usual, and a group with one cause left is no group. **Alt+O** on one alternative takes it out.
- An RCA with a group not settled cannot be closed. Reports list a root cause in an open group with its alternatives. Groups are saved in the file and copied with a branch.
- **Tab** adds an action, and **Shift+Tab** a condition, as **Insert** and **Shift+Insert** do; in a cause tree, Tab adds a cause. Tab does this only with the focus on the chart, so it still moves through buttons and fields.

## v1.18 — 2026-10-26

Box selection, and summaries.

- **Drag a box** on the empty canvas to select several nodes; **Ctrl+click** adds or takes out one. Panning moves to the **right** or **middle** mouse button.
- **Summary** (edit bar, or **Alt+G**): causes at the end of their branches, under one effect, get one new cause that they share, drawn to their right with a brace across them, as in a mind map. Confirming it confirms them.
- With several selected, **Alt+1**, **Alt+2**, **Alt+3** set the status of them all, and **Del** deletes them all.
- XMind summaries are imported as summaries.
- A sideways wheel (such as a mouse's thumb wheel) or a sideways swipe pans left and right instead of zooming out.

## v1.17 — 2026-10-24

Failed vs good: the failed case beside two that did not fail.

- A new, **optional** Analysis page, beside the Is / Is Not. Nothing asks for it: no issue when it is empty, and the reports leave it out.
- It **starts from the equipment and duty record**: each filled field becomes a factor with the failed case filled in, and editing it there edits the record. Add your own factors under six categories.
- For each factor: the two good cases, whether it **differs**, whether it could **explain** the failure, the evidence, and **when it changed**, typed or linked to an event of the sequence of events.
- A difference that explains it goes **to the chart** as a possible cause, **to the Is / Is Not** (as a change or a distinction), and **to the sequence of events** as a deviation.
- The **full report**, and the **8D under D4**, show the differences only, with a note that matching factors are hidden; so do the Word and PowerPoint exports.
- The guide and Learn page explain it, with the P-101A example compared with its twin P-101B and with P-103A.

## v1.16 — 2026-10-24

Reports as PowerPoint decks.

- **Export ▾ → PowerPoint** offers the **full report**, the **8D report**, and the **one-page summary** as 16:9 `.pptx` decks, written in the browser with no library and no network. A cover slide carries the RCA's references and team; each section starts its own slide, and one that does not fit runs on to the next, marked *continued*, with a table's header repeated. The chart is one picture of the whole chart. The summary is one slide in two columns.
- Slides are plain text boxes, tables, and pictures, to edit or paste into a company template. They open in PowerPoint, LibreOffice Impress, Keynote, and Google Slides.
- The Export menu is grouped under Word, PowerPoint, and Chart.

## v1.15 — 2026-10-24

Reports as Word documents, and the chart as a PDF.

- **Export ▾** offers the **full report** and the **8D report** as `.docx` files, written in the browser with no library and no network. They hold what the printed reports hold, in a clean landscape layout: a cover with the RCA's references, headings that show in Word's navigation pane, tables with repeating header rows, the chart, fishbones, and timelines as pictures, and page numbers. They open in Word, LibreOffice, and Google Docs.
- **Export ▾ → Chart as PDF** puts the whole cause-and-effect chart or cause tree on one landscape sheet of A4, A3, or A1. The dialog shows the text size each paper gives. The PDF is vector, written in the browser in the PDF base fonts: sharp at any zoom, searchable, and small (a few kB for the example).

## v1.14 — 2026-10-24

A guide and a worked example for every method.

- **Learn the methods**, at the top of the rail, lists the thirteen methods and records in the order an investigation uses them, in four stages: define the problem, collect the facts, find the causes, fix it and close.
- **Guide** in the top bar opens a panel beside the page: what the method is, when to use it, how to fill it in, good practice, and an excerpt of the P-101A example filled in. It follows the page shown; the list at its top picks any other. The chart's guide changes with the chart style. The panel stays open or closed across sessions.
- The excerpts are drawn from the built-in example, so they always match what **Load example** opens.

## v1.13 — 2026-10-23

Three report layouts from one RCA, and its status and sign-off.

- **Print ▾** offers the **Full RCA report**, an **8D report** (D1 to D8, for a customer's 8D request: containment, root causes by occurrence, escape point, and systemic, chosen solutions, corrective and preventive actions, read-across, closure), and a **One-page summary** for management. Ctrl/Cmd+P prints the layout last chosen.
- **Team and sign-off** (formerly Team and dates) adds the RCA status, the customer reference, the revision, and the sign-off: prepared, reviewed, and approved by, printed with room to sign. An RCA closes only once its corrective and preventive actions are validated with results; closing fills in the date.
- The status shows in the title bar. The example is in progress, prepared and reviewed.

## v1.12 — 2026-10-23

Is / Is Not, after Kepner-Tregoe.

- A new analysis page specifies the problem on What, Where, When, and Extent: what it is, what it could be but is not, what is distinctive, and what changed. The starting questions can be edited and added to.
- Causes from the chart are tested against each fact: explains it, only on an assumption, or does not. A cause that fails a fact is flagged on the chart; thin IS NOT data is noted.
- The printed report shows the facts and the test; files keep them as `specification`. The example has a full specification with three causes tested.

## v1.11 — 2026-10-23

The equipment and duty record.

- A new record page, **Equipment and duty**, holds what a seal or pump maker asks for when a failed part comes back: machine and seal, duty at the failure, seal support system, mechanical condition, history (with the run time worked out from the installed and failed dates), and the failed parts. Every field is optional.
- The printed report shows the filled-in fields under the problem definition. Files keep them under `equipment`.
- The example's P-101A record is filled in.

## v1.10 — 2026-10-23

Actions as 8D and the action hierarchy track them.

- Each action has a **kind**: containment (until the fix is in), corrective, or preventive; and a **strength**: strong (removes the cause by design), medium (a checklist, an alarm, redundancy), or weak (training, a procedure, a warning).
- Action status follows 8D: identified, in progress, implemented, verified, validated, or cancelled. Files with `done` open as implemented.
- **Read-across** below the action plan records where else the problem could happen and what was checked; the report prints it, with each action's kind and strength.
- New checks: a solution with only weak actions (warning), an action that sounds like training with no strength set (note), and an action validated without an effectiveness result (warning).
- The example has a containment action, rated actions, and its read-across.

## v1.9 — 2026-10-23

Root cause types, as 8D asks for them.

- Each cause can be typed as **Occurrence** (why it happened), **Escape point** (why it was not caught), or **Systemic** (why the system allowed it), in its properties. The type shows on the cause's top line; in a cause tree the line appears only on typed causes.
- Once causes are typed, the issues list notes a missing escape point or systemic cause. Files keep the type as `causeType` on each node.
- The example's four root causes are typed.

## v1.8 — 2026-10-23

Good-practice checks, drawn from industry RCA guidance (US DOE, Apollo, TapRooT, OEM 8D requirements).

- The issues list now also flags: a cause that ends at a human error; a cause ruled out without a reason (no test, no evidence), on the tree or in the causes ruled out; a confirmed cause on a single evidence item (note); a stop point that says a solution was found while no solution attacks the cause, and a controllable cause with no solution yet (note); a solution that attacks no cause, or one to implement without actions; an action without an effectiveness check date, and a check that is due without a result.
- Issues about records are listed with their page; clicking one opens the record at its row.
- The example's actions have their effectiveness check dates.

## v1.7 — 2026-10-23

Hypotheses, and status badges in the cause tree.

- A cause still to test is a **Hypothesis**. In a cause tree the status line above each cause's title is gone; a badge in its corner shows the status instead: **H** for a hypothesis, **✓** confirmed, and a red **✕** ruled out. The badge turns orange while a hypothesis or a confirmed cause has no evidence, in place of the **?**. Files keep `"status": "possible"`.
- Making a confirmed cause a hypothesis again, or ruling it out, now takes back the confirmations it made: the effects on the way go back to hypotheses, unless another of their causes is confirmed or they have evidence of their own.

## v1.6 — 2026-10-23

Import mind maps.

- **Open** imports an XMind mind map (`.xmind`, XMind 8 or XMind 2020 and later) as a new cause tree, from its first sheet. The central topic becomes the primary effect, attached topics become possible causes, topic notes become notes, and an "Evidence: …" topic becomes an evidence item cited by its parent. The import is unsaved, and **Save** writes a new Causeway file.

## v1.5 — 2026-10-23

A new method: the sequence of events, drawn as a Gantt-style timeline.

- **Sequence of events** in the Analysis column lays out what happened, phase by phase. A new timeline starts with **Test run** phases (Pre-test work, Testing, Post-test work, Report), **Field failure** phases, or blank ones; phases can be renamed, added, and removed.
- Each event has a text, a start time, and an end time if it lasted, a type (action or condition), cited evidence, and a **Deviation** switch for what departed from what should have happened. Events are shown in time order within their phase; **Enter** adds the next event, starting where this one ended.
- The figure draws each phase as a summary bar, an event that lasted as a bar, and a moment as a diamond, with deviations in orange and evidence codes beside the marks. Click a row to edit it; the figure exports as SVG or PNG.
- **Add to chart** makes an event a cause of the timeline's effect, and **Add N deviations to chart** adds every deviation not yet on it. An event on the chart is that node, as with 5 Whys steps.
- The printed report draws each timeline with a table of its events, and the file saves them under `timelines`. The example RCA has a timeline.

## v1.4 — 2026-10-23

Tidy the chart by hand, and copy branches.

- **Shift+drag** a cause up or down, or press **Shift+↑** and **Shift+↓**, to tidy the chart, for printing for example. It moves with its own causes and its effect stays. It moves up only into free space, and moving down it pushes the causes below it. While dragging, it snaps back to its place and level with its effect; **Esc** cancels. The Properties panel shows how far it was moved, with **Put it back**, or puts back every moved node at once. Hand moves are undo steps, saved in the file (`offsetY` on each node), and used by exports and the printed report.
- **Ctrl+C** copies the selected node with every cause under it, **Ctrl+V** pastes the copy as a cause of the selected node, and **Ctrl+X** cuts. The copy pastes into another tab or RCA, without its evidence citations there, and into other programs as an indented list of titles. The Properties panel has **Copy branch** and **Paste as cause** too.

## v1.3 — 2026-10-22

Faster keyboard editing, and confirmed causes that confirm what they lead to.

- Typing on a selected node replaces its title, as in a spreadsheet cell. **Enter** finishes the title and goes back to the chart's keys, **Shift+Enter** starts a new line, and **Esc** takes back what was typed. Each time a title is edited is one undo step.
- The commands that were letters or digits now take Alt, so that typing always goes to the title: **Alt+A** and **Alt+C** add an action and a condition (in a cause tree, Alt+A adds a cause), **Alt+L** links, **Alt+M** moves, and **Alt+1**, **Alt+2**, **Alt+3** set a cause's status. On a Mac, Alt is Option. Insert, Shift+Insert, F2, Enter, Space, Delete, and the arrows are unchanged.
- In a cause tree, confirming a cause also confirms the possible effects between it and the primary effect, in the same undo step. A ruled-out effect on the way is left as it is and flagged in the issues list; a possible effect whose cause is confirmed is flagged too, for RCAs made before this change.
- The chart layout centres each effect on its causes; effects whose causes had causes of their own sat too high.

## v1.2 — 2026-10-21

Two chart styles per RCA, Apollo or cause tree, with guided switching between them.

- Two chart styles, chosen with **New**: **Apollo** (actions and conditions, AND) or **Cause tree** (possible causes, each possible, confirmed, or ruled out, like an organisation chart lying on its side). In a cause tree the confirmed path is drawn bold and ruled-out causes stay on the tree, struck through; keys 1, 2, and 3 set the status.
- Switching an RCA to the other style first lists what that style still needs (causes without a type, effects missing an action or a condition, ruled-out causes to move, untested causes), then flags each in the issues list. Nothing is lost; the switch is one undo step.
- Every cause has **How it is tested**: the test planned for it, or the one that confirmed or ruled it out. Rule out takes it to the causes ruled out.

## v1.1 — 2026-10-21

New methods beside the chart: the 5 Whys and the fishbone diagram, both able to add their causes to the chart; and causes can be moved and reordered.

- Fishbone (Ishikawa) diagrams: the possible causes of an effect, sorted into categories, with sub-causes. Start from seal-failure categories, 6M, or blank ones. Add each cause to the chart or rule it out; one on the chart is that node, and one ruled out is that record. The diagram follows as you type, and clicking it edits a cause. Export as SVG or PNG; the printed report draws each diagram with a table of its causes. The example has a seal-failure diagram.
- Answers in the 5 Whys and the fishbone grow with their text.
- 5 Whys: chains of why-steps from any node of the chart, each step with its type and evidence; Enter goes to the next why. Add a step, or the whole chain, to the chart as causes one under another; a step on the chart is that node. The example has one chain on the chart and one not yet. The printed report lists the chains.
- The left column groups the chart, the 5 Whys, and the fishbone under Analysis, and the RCA records under Records.
- Drag a cause onto another node to move it there, with its own causes; refused, with the reason, when it would make a loop or the node already has it. M, or Move to another effect in the Properties panel, does the same from the keyboard.
- Drag a cause to a sibling's top or bottom edge, or the gap beside it, to reorder; Alt+↑ and Alt+↓ do the same. Actions stay above conditions.
- While dragging, a copy of the node, the drop target, and a label show what a drop does; Esc cancels.

## v1.0 — 2026-10-21

First release as Causeway: milestones M1–M4 below, then the rename.

### Renamed to Causeway

- The tool is now **Causeway**, a root cause analysis workbench, ready for further methods such as 5 Whys and fishbone diagrams. It was the Apollo RCA Builder.
- The page is `index.html` (was `apollo-rca.html`), so GitHub Pages serves it at the repository's address.
- Files have `"type": "causeway"`. Files with the old type `apollo-rca` still open, and are saved with the new type.
- The autosave and the theme choice move to new browser-storage keys; the old ones are taken over once, then removed.
- On screen, solutions are weighed against "the four solution criteria".

## M4 — 2026-10-21

- Export the chart as a self-contained SVG, or as a PNG at twice screen resolution. Exports show the whole chart, expanded, in the light colours, with a heading.
- Print report (also Ctrl/Cmd+P; Save as PDF for a PDF): cover, problem definition, chart and open issues, evidence log, causes ruled out, solutions, action plan, on landscape pages. A chart too large for one page at a readable size is split into numbered parts, cut between columns.
- Light and dark themes, or the system setting, from the button in the top bar; the chart has its own dark palette.
- The browser tab shows the RCA number and primary effect.

## M3 — 2026-10-21

- RCA record pages, opened from the left column: problem definition, team and dates, evidence log, causes ruled out, solutions, action plan. Fields save as you type; every change is an undo step.
- Problem definition: "what" is the primary effect's title, kept in sync.
- Evidence log: full editing; cited-by list; Show outlines the citing nodes on the chart; delete asks when cited and removes citations. Codes are never reused (new `counters.evidence` in the file).
- Causes ruled out: Rule out on the chart moves a cause here with its evidence; cite and uncite evidence; status.
- Solutions: linked causes, the four Apollo criteria with comments, decision; started from a cause on the chart; actions added from a solution.
- Action plan: solution, owner, due, verification, status, effectiveness check; overdue actions marked.
- Properties panel: a cause's solutions, + Solution, Rule out, and evidence codes that highlight on the chart.
- Files are filled in on opening where a record lacks fields.

## M2 — 2026-10-21

- Shared causes: Link cause (L) links a node already on the chart as a further cause of the selected effect. Nodes that would make a loop or are already linked are faded; Esc cancels. The Properties panel lists the effects a cause supports and unlinks all but the last.
- Collapse and expand branches: the circle on a node's connector, Space, → on a collapsed node, or the Properties panel; Expand all. Saved with the file, not an undo step. Choosing a hidden issue expands its branch.

- New layout: light top bar with the issues button, records list and legend on the left, floating edit bar on the chart showing each key, status bar.
- AND junction marked where an effect's connector splits to its causes; evidence codes drawn as pills, `+N` when they do not fit; dot-grid canvas.
- Evidence on a cause: search the evidence log by code, description, or source; link with Enter or a click; type new evidence to log it with the next code; × unlinks. Each cited item shows its description, type, collector, and date.
- Issues list: click the issues button, then an issue to select its node and bring it into view.
- Keys on the selected node: Insert or A adds an action, Shift+Insert or C a condition, F2 or Enter edits the title, Delete deletes, arrow keys move the selection.
- Properties panel: equipment tag on the RCA; causes of the selected effect listed, click one to select it.

## M1 — 2026-10-21

- Data model with `schemaVersion` 1 and UUIDs for every entity: nodes, links, evidence, ruled-out causes, solutions, actions, team members.
- Chart with automatic left-to-right layout. Columns follow the longest path from the primary effect, branches pack by subtree contours, and connectors are orthogonal. A shared cause's further links are dashed and routed through gaps between nodes.
- Add action and condition causes, edit titles and fields in the Properties panel, delete a cause together with the causes that only it supported (asks first).
- Rule markers on the chart: dashed outline on an effect without an action or a condition, "?" on causes without evidence or marked unverified, bars and a STOP tag on stop points, CONTROLLABLE tag.
- Save and Save as (File System Access API, or a download where the browser lacks it), Open, New, with a warning before unsaved changes are lost.
- Files are checked on opening: wrong type, newer format, missing primary effect, and links that would close a loop are refused or dropped.
- Undo and redo (100 steps; typing in one field is one step).
- Autosave to browser storage as crash recovery; the app works without storage.
- Built-in P-101A seal leakage example.
- Content Security Policy that blocks every network request; Firefox regression tests.

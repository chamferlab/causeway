# Causeway

A root cause analysis workbench in one offline HTML file. Build the cause-and-effect chart, back each cause with evidence, and keep the RCA records alongside it: problem definition, equipment and duty, team and sign-off, evidence log, causes ruled out, solutions, and the action plan. A guide explains every method, with a worked example. Reports print, or export as Word documents and PowerPoint decks, and the chart as a vector PDF. No installation, server, account, or network connection is needed.

A second module, **DFMEA**, holds design FMEAs in the same app: switch with **RCA | DFMEA** in the top bar. The two share the app and nothing else (see **DFMEA** below).

Each RCA picks one of two chart styles. **Apollo** follows the cause-and-effect principles of the Apollo method (Dean Gano): every effect has at least one action and one condition, joined by AND, and every cause is backed by evidence. A **cause tree** charts the possible causes of each effect, any of which may explain it, and each is a hypothesis, tested until it is confirmed or ruled out. Alongside the chart, the 5 Whys, the fishbone diagram, and the sequence of events help find the causes, and add what they find to the chart.

Causeway is independent. Apollo Root Cause Analysis is a trademark of its owner; Causeway is not affiliated with or endorsed by it.

## Run it

Open **https://chamferlab.github.io/causeway/** in Chrome, Edge, or Firefox, or download [`index.html`](index.html) and open it from disk; it works the same offline. Choose **Load example** to see a finished RCA: high leakage on the single cartridge seal of pump P-101A. New to RCA? Start with **Learn the methods**, at the top of the left rail.

RCAs are saved as files on your computer (see **Files** below). Nothing is sent anywhere, including from the hosted page. To serve it to colleagues from one computer, see [Host it for colleagues](#host-it-for-colleagues).

## Learn the methods

New to RCA, or to one of its methods? **Learn the methods**, at the top of the left rail, lists every method in the order an investigation uses them: define the problem (problem definition, team and sign-off, equipment and duty), collect the facts (evidence log, sequence of events, Is / Is Not, and, optionally, failed vs good), find the causes (fishbone, 5 Whys, the cause-and-effect chart, causes ruled out), and fix it and close (solutions, action plan, reports).

Each has a guide: what the method is, when to use it, how to fill it in step by step, good practice and the usual mistakes, and an excerpt of the P-101A example showing it filled in. **Guide** in the top bar opens it beside any page and follows you from page to page; the list at its top picks another method. In a cause tree, the chart's guide explains hypotheses, confirmed, and ruled out. **Open the full example** loads the whole P-101A case.

## Build a chart

1. **New** asks for the chart style: **Apollo** or **Cause tree** (see [Chart styles](#chart-styles)). The steps below are for Apollo. A new RCA starts with the **primary effect**. Click it and type what happened in **Title**.
2. With the effect selected, choose **+ Action** or **+ Condition**. The new cause is selected with its title ready to type over.
3. Select any cause and add its own causes the same way. The chart lays itself out from left to right: the primary effect on the left, causes to the right of their effects.
4. Tick **Stop point** where a branch ends and pick the reason. Tick **Controllable** on causes the organisation can change; they are the candidates for solutions.

| Element | Meaning |
|---|---|
| Red box | The primary effect |
| Dark teal box | **Action**: a momentary cause, at a point in time |
| Light box with a teal border | **Condition**: a cause that existed over time |
| **AND** on a connector | The causes joined there were all needed |
| Dashed **OR** on a connector | Alternatives: one of the causes joined there was needed, and the evidence must still settle which |
| Orange **?** | A cause with no evidence linked, or marked as an unverified candidate |
| Dashed orange outline | An effect that lacks an action or a condition cause |
| Double bar and **STOP** | A stop point |
| **CONTROLLABLE** | A cause the organisation can change |
| Dashed purple connector | A further link of a shared cause (one cause supporting several effects) |
| `E1` `E4` pills | Evidence items the cause cites |

## Chart styles

Choose the style when you start an RCA with **New**; the RCA properties (click the empty canvas) show it under **Chart style**, where you can switch.

**Cause tree.** Each effect has its possible causes, drawn like an organisation chart lying on its side; there is no AND, because the branches are alternatives.

- **+ Cause** (**Insert** or **Alt+A**) adds a possible cause. A cause has no action or condition type.
- Each cause has a **status**, set in its properties or with **Alt+1**, **Alt+2**, **Alt+3**, and shown by the badge in its corner: **Hypothesis**, **H** (white, dashed outline: still to test), **Confirmed**, **✓** (solid teal; the path to it from the effect is drawn bold), or **Ruled out**, a red **✕** (grey and struck through, with a dashed link). The badge is orange while a hypothesis or a confirmed cause has no evidence. A ruled-out cause stays on the tree, so the chart shows what was eliminated; **Rule out** sets the status. The ruled-out causes are listed under **Causes ruled out** and in the report.
- A confirmed cause happened, so the effects it leads to did too: confirming a cause also confirms the possible effects between it and the primary effect, in the same undo step. A ruled-out effect on the way is left as it is. Making a confirmed cause a hypothesis again, or ruling it out, takes back what it confirmed: each effect on the way goes back to a hypothesis, unless another of its causes is confirmed or it has evidence of its own.
- **How it is tested**, in each cause's properties (in both styles): the check or test that will confirm it or rule it out, or that did.
- Issues: a confirmed cause without evidence (error), a ruled-out effect of a confirmed cause (error), a hypothesis not tested yet or whose cause is confirmed (warning), and a confirmed branch that ends without a stop point (note).

**Switching.** Choosing the other style shows what that style will still need, before anything changes, for example *4 causes without a type*, *3 effects missing an action or a condition*, *1 ruled-out cause to move to the causes ruled out*. Switch, and each shows in the issues list, which opens, and is outlined on the chart, so you can work through them. Nothing is lost, and the switch is one undo step:

- To a cause tree: a cause backed by evidence, and not unverified, becomes confirmed; the others become hypotheses. Actions and conditions keep their type for a move back.
- To Apollo: hypotheses become unverified (?). Causes made in the tree ask for a type (choose **Action** or **Condition** in their properties), each effect needs an action and a condition, and each ruled-out cause asks to be moved to the causes ruled out with **Rule out**, which takes its evidence and test along.

In a cause tree, the 5 Whys, the fishbone, and the sequence of events add causes without a type.

## Screen

- **Top bar**: the RCA number, tag, status, and primary effect; undo and redo; the **issues** button; the guide, theme, export, and print buttons; the file commands.
- **Left rail**: **Learn the methods**; under **Analysis**, the cause-and-effect chart, the 5 Whys, the fishbone, the Is / Is Not, failed vs good, and the sequence of events; under **Records**, the seven RCA records; each with its count. Below them, the legend.
- **Chart** in the middle, with the edit bar at the bottom: **+ Action**, **+ Condition**, **Delete**, and zoom. Each button shows its key.
- **Properties** on the right, for the selected node, or for the RCA when nothing is selected.
- **Guide** on the far right, when open: how to use the page shown.
- **Status bar** at the bottom: the last file action, the counts, and the keys.

## Shared causes

One cause can support more than one effect. To chart that:

1. Select the second effect.
2. Choose **Link cause** (or press **Alt+L**). A banner asks for the cause; nodes that cannot be linked are faded, because the link would make a loop or already exists.
3. Click the cause. The new link is drawn dashed in purple.

**Esc**, **Cancel**, or a click on the empty canvas stops linking. The selected cause's **Supports** section lists every effect it supports; **×** removes one link. A cause keeps at least one effect; to take it off the chart, delete it.

## Select several, and summaries

**Drag a box** on the empty canvas to select the nodes it touches; each is outlined. **Ctrl+click** (**Cmd+click** on a Mac) adds one node or takes it out. A click on a node selects it alone. To pan, drag with the **right** or **middle** mouse button; the wheel zooms. With two or more selected, the properties panel lists them and acts on them all:

- **Summary** (in the edit bar, or **Alt+G**): when several causes at the end of their branches may come from one deeper cause, a new cause shared by all of them goes to their right, drawn with a brace across them. Its title is ready to type, and it is tested like any other cause: confirming it confirms the causes it summarises. The causes must share an effect and have no causes of their own; they are put next to each other.
- In Apollo, **Make them alternatives** (**Alt+O**): see below.
- In a cause tree, set the **status** of them all (**Alt+1**, **Alt+2**, **Alt+3**).
- **Delete** them all (**Del**), with the causes that only they support.

A summary stays drawn with its brace while it is the only cause of its causes and they are neighbours under one effect. Once one of them gets another cause, it is drawn as a shared cause, with dashed links. To remove a summary, delete it. Summaries in XMind maps come in as summaries.

## Alternatives (OR) in Apollo

In Apollo, each cause of an effect was needed (AND). When the evidence cannot yet tell which of some causes it was, say dry running or faces installed out of square, make them **alternatives**: select them (drag a box, or Ctrl+click) and press **Alt+O**, or **Make them alternatives** in the properties. They are causes of the same effect.

- They are drawn together on their own bracket, marked with a dashed **OR**, and joined to the effect's other causes by AND. Each is marked unverified (**?**).
- For the rule that an effect needs an action and a condition, a group counts as an action only when each of its causes is an action, and as a condition only when each is a condition.
- Each alternative shows the issue *One of N alternatives (OR): test them, and rule out all but one*. When one is verified (evidence, and not unverified), the others ask to be ruled out.
- To settle the group, select the cause the evidence confirms and choose **Keep this one** in its properties: the others move to the causes ruled out, with their evidence and test. **Rule out** on one alternative works as usual; a group with one cause left is no longer a group.
- **Alt+O** on one alternative, or **Not an alternative**, takes it out of its group: it was needed, with the others.
- An RCA cannot be **closed** while a group is not settled, and the 8D report says so under *Not ready to close*. A root cause in an open group is listed with its alternatives, *One of: … (being tested)*.
- Groups are saved in the file, on the links (`orGroup`), and copied with a branch. A cause tree has no groups: its branches are alternatives already, and switching to it and back keeps them.

## Move and reorder causes

The chart lays itself out. Dragging a cause changes the structure:

- **Drop it on another node** to make it a cause of that node. Its own causes move with it. A blue outline and a label show what a drop will do; a drop that would make a loop, or onto an effect that already has the cause, is refused and says why.
- **Drop it on the top or bottom edge of a sibling, or in the gap next to it,** to place it above or below that sibling. A blue bar shows where it will go. Actions stay above conditions, so a cause is reordered among causes of its own kind.

**Esc** cancels a drag. The primary effect cannot be dragged.

Without the mouse: **Alt+M** (or **Move to another effect** in the Properties panel) asks for the new effect, the way **Link cause** does; **Alt+↑** and **Alt+↓** move a cause above or below its neighbour.

For a shared cause, moving changes only the link it is drawn along (the solid one); its dashed links stay.

### Move up or down by hand

To tidy the chart, for printing for example, **Shift+drag** a cause up or down, or press **Shift+↑** and **Shift+↓** (10 units a press). It moves with its own causes; its effect stays where it is.

- It moves up only into free space, as far as its effect can stay put; a cause right below another has no room above it.
- Moving down, it pushes the causes below it down too.
- While dragging, it snaps back to its place, and level with its effect, so the connector runs straight. **Esc** cancels.

The Properties panel shows how far a cause was moved, with **Put it back**; with nothing selected, **Put back N nodes moved by hand** resets them all. Moving a cause to another effect, or reordering it, puts it back too. A hand move is an edit: an undo step, saved in the file, and used by exports and the printed report.

## Copy and paste branches

**Ctrl+C** (on a Mac, **Cmd+C**) copies the selected node with every cause under it: titles, types, statuses, evidence, tests, stop points, notes, and the links among them. **Ctrl+V** adds the copy as a cause of the selected node, with new ids, in one undo step; the pasted node is then selected. **Ctrl+X** copies and then deletes, as **Delete** does. The Properties panel has **Copy branch** and **Paste as cause** too.

- The copy goes to the system clipboard, so it pastes into another tab or another RCA. There, the evidence it cited is left out, since that RCA has its own evidence log; the status line says how many citations were left out.
- Pasted into another program, it is a list of the titles, indented by level.
- Copying the primary effect copies the whole chart. Pasted, its top node becomes a cause without a type, for you to choose.
- In a text field, the keys copy and paste text as usual.

## Root cause types

8D reports, and the supplier requirements of OEMs such as Baker Hughes, Caterpillar, and the aero-engine makers (AS13000), ask for three kinds of root cause. Set a cause's **Root cause type** in its properties:

| Type | Question |
|---|---|
| **Occurrence** | Why did the failure happen? |
| **Escape point** | Why was it not detected or caught earlier (monitoring, alarm, inspection, test)? |
| **Systemic** | Why did the system (design, planning, procedures, management) allow it? |

The type shows on the cause's top line, for example CONDITION · ESCAPE; in a cause tree the line appears only on typed causes. Click the pressed type again to clear it. Once any cause is typed, the issues list notes it when no cause is an escape point or systemic yet.

## Collapse branches

Click the **−** circle where a node's connector leaves it, press **Space**, or choose **Collapse branch** in the Properties panel. The node then shows **+N** for the causes it hides, and its circle turns to **+**. **Space**, the **+** circle, or **→** expands it again. With nothing selected, the Properties panel offers **Expand all branches**.

Collapsing is part of the view, not an edit: it is not an undo step and does not count as an unsaved change, but it is saved with the file. Choosing a hidden node from the issues list expands the branches that hide it.

## Link evidence

Select a cause. Its **Evidence** section lists the items it cites, each with its code, description, type, collector, and date.

- Type in **Link or add evidence**: a code (`E3`), or a word from the description or source. Matching items from the evidence log are listed; choose one with the arrow keys and **Enter**, or click it.
- To log something new, type what was seen or measured and choose **+ New**. It goes into the evidence log with the next free code and is cited by the cause. It is recorded as sensed, collected today; change its type, source, collector, and date in the evidence log.
- **×** unlinks an item. It stays in the evidence log.

The "?" marker goes away once a cause cites at least one item and is not marked unverified. Codes are never reused: after E11 is deleted, the next item is still E12. (Undoing the addition of E11 does free the code.) On the chart, codes show as pills under the title; when they do not fit, the last pill counts the rest (`+3`).

## 5 Whys

**5 Whys** in the left column. A chain starts from a node of the chart (the primary effect, unless you choose another under **Starts from**) and asks why it happened; each answer is asked why in turn, until you reach a cause you can act on. Five is a guide, not a rule.

- **+ New chain** starts a chain; **+ Why** adds a step. In an answer, **Enter** goes to the next why (adding one after the last) and **Shift+Enter** starts a new line.
- Each step has its type (action or condition) and the evidence it cites, as on the chart. The last step is marked "root cause so far".
- **Add to chart** makes the step a cause of the step before it, or of the chain's starting node for the first step; **Add all to chart** adds every step not yet on it, in order. A step on the chart is that node: editing its words, type, or evidence in either place changes both. On the chart it then gains the other causes it needs, such as the condition beside an action.
- **×** removes a step from the chain; its node stays on the chart. Deleting the node keeps the step, with its words, off the chart.

The printed report lists every chain after the chart.

## Fishbone

**Fishbone** in the left column: an Ishikawa diagram of the possible causes of an effect, sorted into categories so that no area is forgotten. The effect is the head, on the right; each category is a bone; each possible cause is a line on its bone, and its sub-causes hang from it. Then each possible cause is tested: added to the chart, where it needs evidence, or ruled out.

- **+ New diagram** starts one from the primary effect (choose another under **Effect**), with the categories chosen beside it: **Seal failure** (seal and materials, installation, operation, process fluid, support system, pump and equipment), **6M** (people, method, machine, material, measurement, environment), or four blank ones. Rename, add, and remove categories as you need.
- **+ Cause** adds a possible cause to a category, and **+ Sub-cause** a cause of that cause. In a cause, **Enter** adds the next one. Each has its type (action or condition) and the evidence it cites.
- **Add to chart** makes a cause a cause of the diagram's effect, and a sub-cause a cause of its cause, once that is on the chart. **Rule out** moves it to the causes ruled out, where you write the test that ruled it out; **Restore** takes it back to test again. A cause on the chart is that node, and one ruled out is that record: editing it in either place changes both. Deleting the node or the record keeps the cause, with its words, to test again.
- The diagram follows as you type. Click a cause or a category in it to edit it; the cause being edited is lit. Under the diagram, the counts: on the chart (marked with a small box in the colour of its type), ruled out (struck through), and to test.
- **SVG** and **PNG** save the diagram as an image, in the light colours.

The printed report draws every diagram, with a table of its causes and their status.

## Is / Is Not

**Is / Is Not** in the left column specifies the problem before explaining it, after Kepner-Tregoe's problem analysis, which the VDA 8D volume recommends for D2 and D4.

- **Specification.** Under **What**, **Where**, **When**, and **Extent**, each question is answered on two sides: what the problem **is**, and what it could be but **is not**, the closest thing that is not affected (the spare pump, the other seal, the same seal before the upset). Then what is distinctive about the IS side, and what changed in or around it. The starting questions can be reworded, removed, or added to with **+ Question**. Each question with either side answered is a fact, numbered by its dimension: What 1, Where 2, and so on.
- **Test the possible causes.** Add causes from the chart with **+ Test a cause** (or **Test all**, when there are 30 or fewer). For each cause and fact, click the cell to go round **✓** (explains why the problem is here and not there), **?** (only if an assumption holds), and **✕** (does not explain it). The result says whether the cause explains every fact, on how many assumptions, or how many facts it fails.
- A cause that fails a fact is flagged on the chart (a warning), until it is ruled out or the fact is corrected. Thin IS NOT data, the most common weakness of a specification, is noted when more than half of three or more stated facts have no IS NOT.

The count beside it is the number of facts. The printed report shows the facts and the test.

## Failed vs good

**Failed vs good** puts the failed case beside two comparable cases that did **not** fail: a twin on the same duty, the same machine before it failed, or a similar machine elsewhere. It is a comparative and change analysis. It is **optional**: nothing in Causeway asks for it, no issue is raised when it is empty, and the reports leave it out. Use it when there is a fair comparison; skip it for a one-off machine or a first failure.

- **Start from the equipment record.** Each field filled in under Machine and seal, Duty at the failure, Seal support system, and Mechanical condition becomes a factor, with the failed case filled in. The failed case's cell *is* that field: editing it edits the equipment record. Fields filled in later are offered with **+ N factors from the equipment record**. Add your own factors with **+ Factor** under any category, including Installation and maintenance, and Operation and changes.
- **The cases.** Name the failed case and the two good cases, and say why each is comparable.
- **Judge each factor.** **Differs?** Same, Differs, or ?; and **Explains it?** Yes, Partly, No, or ?. Cite evidence. **Differences only** hides the factors that are the same.
- **When it changed.** Type a date, or **link an event** of the sequence of events. **Add to timeline** puts the change on the sequence of events as a deviation, at the date typed when it reads as one (`2026-09-12` or `2026-09-12 14:05`).
- **Where a difference goes.** One that explains it can be **added to the chart** as a possible cause under the primary effect, with its evidence, and **sent to the Is / Is Not**: to the question chosen, under *Changed* when the row says when it changed, otherwise under *Distinctive*.
- Below the table: the **differences that could explain it**, the factors **the same in every case** (they cannot explain why only this one failed, though they may still be a condition or a systemic cause), and what is **still to find out**.

The count beside it is the number of factors that differ. The full report, and the 8D under D4, show the factors that differ only, under the note: *This table shows only the factors that differ between the failed case and the good cases; factors that match are hidden.*

## Sequence of events

**Sequence of events** in the left column: what happened, in order, phase by phase, drawn as a Gantt chart. Each phase is a summary bar over its events; an event that lasted is a bar from its start to its end, and a moment is a diamond. **Deviations**, the events that departed from what should have happened, are drawn in orange: they are the candidate causes.

- **+ New timeline** starts one with the phases chosen beside it: **Test run** (pre-test work, testing, post-test work, report), **Field failure** (before the event, lead-up, failure, response), or three blank ones. Rename, add, and remove phases as you need. **Leads to** is the effect the events lead to, the primary effect unless you choose another.
- **+ Event** adds an event to a phase, starting at the time of the last one. Give it a start, and an end if it lasted; within a phase, events are in time order. In an event, **Enter** adds the next one, starting where this one ended. An event without a time is listed, without a mark.
- Each event has its type (action or condition) and the evidence it cites, as on the chart. **Deviation** marks it.
- **Add to chart** makes an event a cause of the effect it leads to; **Add N deviations to chart** adds every deviation not on it yet. An event on the chart is that node: editing its words, type, or evidence in either place changes both. Deleting the node keeps the event, with its words. On the chart, move it under the right effect by dragging it or with **Alt+M**.
- Click an event or a phase in the figure to edit it. **SVG** and **PNG** save the figure as an image, in the light colours.

Times are as written, without time zones. The printed report draws every timeline, with a table of its events.

## RCA records

Choose a record in the left column; **Chart** returns to the chart. Every field saves as you type, and every change is an undo step, as on the chart. The chart keys do nothing on a record page.

| Record | Content |
|---|---|
| **Problem definition** | What (the primary effect's title: editing either changes both), when, where, and the significance for safety, environment, production/cost, and reliability. |
| **Equipment and duty** | What a seal or pump maker asks for when a failed part comes back, all optional: the machine and seal (arrangement, piping plans, materials), the duty at the failure (product, vapour pressure, pressures, speed, flow, operation), the seal support system, the mechanical condition (runout, end float, alignment, vibration, bearings), the history (installed and failed dates, with the run time worked out, first leak, how it was found, earlier failures, changes since the last good run), and the failed parts (where they are kept, decontamination, photos, as-found condition). The count beside it is the number of fields filled in. |
| **Team and sign-off** | Status (open, root cause found, actions in progress, closed), customer reference (their 8D or complaint number), revision, RCA number, equipment/tag, seal type; event, opened, and closed dates; team members with their roles, and the lead; and the sign-off: prepared, reviewed, and approved by, with dates. The RCA can be closed only once every corrective and preventive action is validated with an effectiveness result; closing fills in the closed date. Team names are offered for "collected by", "owner", and the sign-off. |
| **Evidence log** | One row per item: code, description, type (sensed or inferred), source, collected by, date, and the nodes and ruled-out causes that cite it. **Show** goes to the chart with those nodes outlined and the rest faded; **Esc** or **Clear** ends it. Deleting a cited item asks first and removes its citations. |
| **Causes ruled out** | Possible cause, its type, the evidence or test that ruled it out, the evidence items it cites, and the status (being tested, ruled out). |
| **Solutions** | The causes each solution attacks, the four solution criteria (prevents recurrence, within our control, meets our goals, no new problems) as Yes / Partly / No with a comment, and the decision (implement, study further, reject). Clicking a chosen value again clears it. Controllable causes are marked ● in the cause picker. |
| **Action plan** | Action, its kind and strength, solution, owner, due date, verification, status, and the effectiveness check: its date and result. **Kind**: containment (protects until the fix is in, 8D D3), corrective (removes a cause), or preventive (stops it elsewhere or in the system). **Strength**, after the RCA² action hierarchy: strong actions remove the cause by design, medium ones make the right result likely (a checklist, an alarm, redundancy), weak ones rely on people remembering (training, a procedure, a warning). **Status**, as 8D tracks it: identified, in progress, implemented, verified (done as intended), validated (the effectiveness check shows it worked), or cancelled. An action past its due date that is not implemented or cancelled is marked overdue. Below the plan, **Read-across** records where else the problem could happen and what was checked. |

From the chart, with a cause selected:

- **Rule out** moves the cause to the causes ruled out, with its evidence, and takes it off the chart. Causes that only it supported go with it; you are asked first. A fishbone cause that was that node is then ruled out as well.
- **+ Solution for this cause** starts a solution that attacks it. The cause's solutions are listed with their decisions; click one to open it.
- Click an evidence code to outline every node that cites it.

From a solution, **+ Action** adds an action for it to the action plan.

## Issues

The **issues** button in the top bar counts rule errors and warnings. Click it for the list, errors first, then warnings, then notes; click an issue to select its node and bring it into view, or to open the record it is about.

Besides each chart style's rules, Causeway checks what good RCA practice asks for, in both styles:

| Check | Level |
|---|---|
| A cause that ends at a human error ("operator error", "did not follow the procedure"): ask why the error was possible | Warning |
| A cause ruled out without a reason: no test written and no evidence cited, on the tree or in **Causes ruled out** | Warning |
| A confirmed cause backed by only one evidence item (cause tree) | Note |
| A stop point that says a solution was found, while no solution attacks the cause | Warning |
| A controllable cause that no solution attacks yet | Note |
| A solution that attacks no cause, or one to implement with no action in the plan | Warning |
| An action with no effectiveness check date (a warning once the action is done) | Note |
| An effectiveness check whose date has passed without a result | Warning |
| Root causes are typed, but none is an escape point, or none is systemic (on the primary effect) | Note |
| A solution whose actions are all weak | Warning |
| An action that sounds like training or a reminder, with no strength set | Note |
| An action validated without an effectiveness result | Warning |
| A cause that fails a fact of the Is / Is Not | Warning |
| Thin IS NOT data in the Is / Is Not | Note |
| An RCA marked closed while actions are not validated (from a file) | Warning |

Rejected solutions and cancelled actions are not checked, and containment actions are not rated for strength. Notes are listed but not counted.

## Keyboard

With a node selected and no field focused:

| Key | Result |
|---|---|
| Type | Replace the title: the first key starts the new one. **Enter** finishes it, back to the chart's keys; **Shift+Enter** starts a new line |
| **Tab**, **Insert**, or **Alt+A** | Add an action cause of the selected node; in a cause tree, a cause. The new cause is selected: type to name it, or press Tab again to add its own cause |
| **Shift+Tab**, **Shift+Insert**, or **Alt+C** | Add a condition cause (Apollo) |
| **Enter** | Add a sibling: another cause of the same effect, of the same kind, just below the selected one |
| **Alt+1** **Alt+2** **Alt+3** | Cause tree: set the status to hypothesis, confirmed, or ruled out |
| **F2** | Edit the title, keeping it |
| **←** | Select the effect |
| **→** | Select a cause; on a collapsed node, expand it |
| **↑ ↓** | Select the node above or below in the same column |
| **Alt+O** | Make the selected causes alternatives (OR); on one alternative, take it out of its group (Apollo) |
| **Alt+M** | Move the cause under another effect |
| **Alt+↑ Alt+↓** | Move the cause above or below its neighbour |
| **Shift+↑ Shift+↓** | Move the cause up or down by hand, with its branch |
| **Ctrl+C** **Ctrl+X** **Ctrl+V** | Copy or cut the node with its causes; paste the copy as a cause of the selected node |
| **Alt+L** | Link an existing node as a further cause |
| **Space** | Collapse or expand the branch |
| **Esc** | Cancel linking, moving, or a drag; or clear the selection. In the title: undo what was typed since it was focused |
| **Delete** | Delete the selected cause |

With nothing selected, an arrow key selects the primary effect. Adding a cause from a key keeps the keys on the chart, so **Tab**, type, **Enter**, **Enter**, type… builds a branch without the mouse: Enter first finishes the title, then adds a sibling. Editing starts only when you type. The **+ Action**, **+ Condition**, and **+ Cause** buttons put the new title ready to type. Tab adds a cause only when no button or field has the focus, so it still moves through them. The commands that are letters or digits take Alt so that typing always goes to the title; on a Mac, Alt is Option.

All causes under one effect are joined by AND: each was needed. Every effect needs at least one action and at least one condition.

**Delete** removes the selected cause. Causes that supported only that cause go with it; you are asked first. A cause that also supports another effect stays. The primary effect cannot be deleted.

Drag the empty canvas with the right or middle mouse button to pan (a left drag selects), use the wheel to zoom (a sideways wheel or swipe pans left and right), and **Fit** to see the whole chart.

## Reports and exports

| Control | Result |
|---|---|
| **Export ▾ → Word → Full report** | The full RCA report as a `.docx`, with the same content as the printed one: headings, tables whose header row repeats on each page, the chart, fishbone, and timeline as pictures, page numbers in the footer. It opens in Word, LibreOffice, and Google Docs, to edit before sending. |
| **Export ▾ → Word → 8D report** | The 8D report as a `.docx`, D1 to D8 as in print. |
| **Export ▾ → PowerPoint → Full report** | The full RCA report as a 16:9 `.pptx`: a cover slide, then each section on its own slides, long tables running on with their header repeated, the whole chart as one picture. |
| **Export ▾ → PowerPoint → 8D report** | The 8D report as slides, D1 to D8. |
| **Export ▾ → PowerPoint → One-page summary** | The one-page summary on one slide, for a management review: the text is set smaller until it fits. |
| **Export ▾ → Chart → PDF** | The whole chart, with its heading, on one landscape sheet of A4, A3, or A1, scaled to fit. Each paper shows the text size it gives; at 70 % or more it reads well when printed. The PDF is vector: sharp at any zoom, with text that can be searched and copied, in the PDF base fonts, so it embeds no font. |
| **Export ▾ → Chart → SVG** | The chart as one self-contained SVG file: colours are attributes, with no stylesheet, font, or image to fetch. It opens in browsers, Inkscape, and Office, and can be edited further. |
| **Export ▾ → Chart → PNG** | The chart as an image at twice screen resolution (less for very large charts, which browsers limit). |
| **Print ▾ → Full RCA report** | Every record, on landscape pages: cover (RCA number, revision, equipment, seal type, status, customer reference, dates), lead and team, problem definition with the equipment and duty, chart and open rule issues, 5 Whys, fishbone diagrams, Is / Is Not, failed vs good (differences only), sequences of events, evidence log, causes ruled out, solutions with the four criteria, the action plan with read-across, and the sign-off. |
| **Print ▾ → 8D report** | The same RCA in the eight disciplines of a customer's 8D request: D1 team; D2 problem description, key equipment data, and the Is / Is Not; D3 containment actions; D4 root causes grouped as occurrence, escape point, and systemic (with how each was verified, its evidence, and its chain to the problem), failed vs good (differences only), the causes ruled out, and the chart; D5 the solutions chosen; D6 corrective actions; D7 preventive actions and read-across; D8 closure, with what still stands in the way; and the sign-off. |
| **Print ▾ → One-page summary** | For management: the problem and its impact, the root causes with how they led to the problem, the actions with their status and whether they worked, read-across, and the sign-off. |
| **Ctrl/Cmd+P** | Prints the layout last chosen, the full report at first. Choose **Save as PDF** as the printer for a PDF. |

Exports and the reports always show the **whole chart**, with every branch expanded, in the light colours, whatever the screen shows. In the printed and Word reports, a chart that fits one page at 55 % or more is scaled to fit; a larger one is split into page-sized parts, numbered by row and column, with the cuts between columns so no box is split across. For a large chart, **Export ▾ → Chart → PDF** on A3 or A1 shows it whole, to send with the report.

The Word reports are made from the same content as the printed ones, so they always agree. They are landscape A4: a cover with the RCA's references, headings that show in Word's navigation pane (and can make a table of contents), tables with repeating header rows, and the sign-off with space to sign. Edit them freely before sending; Causeway does not read them back.

The PowerPoint decks are made the same way, from the same content. Every slide is plain text boxes, tables, and pictures, so it can be edited, restyled, or copied into a company template. The text is in Calibri; on a computer without it, a similar font takes its place.

## DFMEA

**RCA | DFMEA** in the top bar switches module. The DFMEA has its own pages, undo history, autosave, and file; the RCA is left as it was, and the buttons in the top bar (New, Open, Save, Load example, Undo, Print, Export) act on the module shown. Choose **Load example** in the DFMEA for a CS-50 cartridge seal.

A DFMEA is a tree of seven fixed levels: **project**, **product / model**, **component / feature**, **function / requirement**, **failure mode**, **effect**, and **cause**. Each path from the project down to a cause is a **branch**, with an ID (`B-01`, `B-02`, …) that is never reused.

| Page | Content |
|---|---|
| **Structure** | The tree, left to right, one lane per level. Select an item to edit it on the right; click the empty canvas for the DFMEA's own properties: number, revision, date, scope, team, and the scoring method. A cause has its prevention and detection controls and its ratings. |
| **Risk analysis** | Every branch, one row each, with its ratings (edit them in the table), its score, and its score after actions. Shows the branches needing action, or all of them. |
| **Optimisation** | Each branch needing action, its actions, and the ratings each action is expected to reach; leave a rating blank when an action does not change it. The score after actions counts every action not cancelled, taking the lowest expected rating of each. |
| **Action tracker** | Every action: assignee, status (open, in progress, done, cancelled), entry date, and target. The ISO weeks from entry to target are shown as squares; add a note for the current week. |

Each DFMEA is scored by one of two methods, chosen when it is started and switchable later; each cause keeps its ratings for both, so switching loses nothing.

- **RPN with limit**: Detection × max(Safety, Environment, Others) × Probability of failure, each 1 to 10. A branch above the maximum acceptable RPN (100 by default) needs action; equal to it is acceptable.
- **AIAG-VDA Action Priority**: Severity, Occurrence, and Detection, each 1 to 10, give High, Medium, or Low from the AIAG-VDA (2019) DFMEA table. High needs action; Medium needs action or a written reason why none is needed; Low may have action.

On the Structure page, the wheel zooms at the pointer and a sideways wheel pans; drag the empty canvas, or drag with the right or middle button, to pan; **−**, **100%**, **+**, and **Fit** are at the bottom. A DFMEA opens fitted to the view, and the view follows the selected item. **Tab** adds a child, **Enter** a sibling, and typing names the selected item; **F2** or a double-click edits it; arrows select; **Del** deletes an item with everything under it. **Ctrl+C** copies an item and everything under it, and **Ctrl+V** pastes it beside an item of the same level or under one a level up; copies get new branch IDs. Text pastes as children of the selected item, one per line.

The issues list shows branches that stop above the causes, causes not rated, branches needing action without it, actions overdue, and actions without an assignee or target. **Print → DFMEA report** and **Export → DFMEA report** (Word) give the scope, the risk analysis, and the actions.

## Theme

The theme button in the top bar switches between **System** (follows the operating system), **Light**, and **Dark**. The choice is kept in this browser; it is not part of the RCA file.

## Files

| Control | Result |
|---|---|
| **Save** | Saves the RCA as JSON. In Chrome and Edge you pick a file once, and later saves write to it; Firefox downloads a copy each time. **Ctrl/Cmd+S** |
| **Save as** | Saves under a new name. **Ctrl/Cmd+Shift+S** |
| **Open** | Opens a saved RCA or DFMEA, in its own module, or imports an XMind mind map (`.xmind`) as an RCA |
| **New** | Starts an empty RCA, in the chart style you choose |
| **Load example** | Replaces the current RCA with the P-101A example |

You are asked before unsaved changes are lost, and the browser warns when you close the tab with unsaved changes.

An XMind mind map (XMind 8, or XMind 2020 and later) opens as a new cause tree, from its first sheet. The central topic becomes the primary effect, every attached topic a possible cause under its parent topic, and topic notes the cause's notes. A topic "Evidence: …" without subtopics becomes an evidence item, cited by its parent. Floating topics, relationships, markers, and colours are left out. The import is unsaved: **Save** writes a new Causeway file and leaves the map as it was.

The RCA is also kept in browser storage after every edit, as crash recovery. Reopening the page brings it back, and the status line says so when it had unsaved changes. Browser storage belongs to one browser and can be cleared; the saved JSON file is the record.

## Undo and redo

**Undo** and **Redo** in the toolbar, **Ctrl/Cmd+Z**, and **Ctrl+Y** or **Ctrl/Cmd+Shift+Z**. The last 100 edits are kept for the session; consecutive typing in one field is one step. Pan, zoom, and selection are not edits.

## File format

The file is JSON with `"type": "causeway"` and `"schemaVersion": 1`. Files saved before the tool was named Causeway (`"type": "apollo-rca"`) open as well, and are saved with the new type. Every entity has a UUID that never changes, so the files can be imported into another system without renumbering.

| Key | Content |
|---|---|
| `id` | The RCA's UUID |
| `meta` | `rcaNumber`, `equipmentTag`, `sealType`, `style`: `apollo` \| `tree` (files without it are Apollo), `leadId` (a team member's id), `team` [{`id`, `name`, `role`}], `dates` {`opened`, `eventDate`, `closed`}, `status`: `open` \| `root-cause` \| `actions` \| `closed`, `customerRef`, `revision`, `signoff` {`prepared`, `reviewed`, `approved`: {`name`, `date`}} |
| `equipment` | The equipment and duty record: an object of text fields, each optional: `machine`, `machineModel`, `sealModel`, `arrangement`, `sealPlans`, `faces`, `elastomers`, `product`, `specificGravity`, `viscosity`, `vapourPressure`, `temperature`, `suction`, `discharge`, `chamber`, `speed`, `flowRate`, `operation`, `flushFlow`, `flushTemp`, `flushPressure`, `barrierFluid`, `barrierPressure`, `reservoir`, `cooling`, `runout`, `endFloat`, `alignment`, `vibration`, `bearings`, `installed`, `failed` (`YYYY-MM-DD`), `firstLeak`, `leakRate`, `detectedBy`, `previous`, `changes`, `preserved`, `decontaminated`, `photos`, `asFound`. Other keys are dropped. |
| `problem` | `primaryEffectId`, `when`, `where`, `readAcross`, `significance` {`safety`, `environment`, `productionCost`, `reliability`}. The "what" is the primary effect node's title. |
| `nodes` | {`id`, `kind`: `effect` \| `action` \| `condition` \| `cause` (no type yet: made in a cause tree), `title`, `description`, `evidenceIds`, `status`: `possible` (a hypothesis) \| `confirmed` \| `ruled-out` (used in a cause tree), `test` (how it is tested), `unverified`, `controllable`, `causeType`: `occurrence` \| `escape` \| `systemic` \| `""` (the root cause type), `stopPoint`: null or {`reason`, `note`}, `notes`, `offsetY`: how far it is moved down by hand (negative: up) from where the layout places it, in chart units (pixels at 100 %)} |
| `links` | {`id`, `effectId`, `causeId`}: the cause supports the effect. Links form a directed acyclic graph rooted at the primary effect. |
| `evidence` | {`id`, `code` (`E1`, `E2`, …, never renumbered), `description`, `type`: `sensed` \| `inferred`, `source`, `collectedBy`, `date`} |
| `ruledOut` | {`id`, `cause`, `kind`: `action` \| `condition` \| `""`, `test`, `evidenceIds`, `status`: `testing` \| `ruled-out`} |
| `solutions` | {`id`, `title`, `causeIds`, `criteria` {`preventsRecurrence`, `withinControl`, `meetsGoals`, `noNewProblems`: {`v`: `yes` \| `no` \| `partly`, `c`: comment}}, `decision`: `implement` \| `reject` \| `study` \| `""` (not decided)}; criterion `v` may be `""` too |
| `fiveWhys` | {`id`, `effectId` (the node the chain starts from), `steps` [{`id`, `answer`, `kind`: `action` \| `condition`, `evidenceIds`, `nodeId`: the node on the chart, or null}]}. While a step is on the chart, its node's title, kind, and evidence are its own. |
| `fishbones` | {`id`, `effectId` (the head), `categories` [{`id`, `name`, `causes` [{`id`, `text`, `kind`: `action` \| `condition`, `evidenceIds`, `nodeId`: the node on the chart, or null, `ruledOutId`: the ruled-out record, or null, `parentId`: the cause it is a sub-cause of, or null}]}]}. While a cause is on the chart or ruled out, the node's or the record's words, kind, and evidence are its own. |
| `specification` | The Is / Is Not: `rows` [{`id`, `dim`: `what` \| `where` \| `when` \| `extent`, `question`, `is`, `isNot`, `distinction`, `change`}], and `tests` [{`causeId`: a node, `marks`: {row id: `yes` \| `if` \| `no`}}]. Files without it start with the blank questions. |
| `comparison` | Failed vs good: `cases` [three of {`name`, `why`}: the failed case, then the two good cases], and `rows` [{`id`, `cat` (one of the six categories), `factor`, `field`: an equipment record key or `""`, `failed` (used when `field` is `""`; otherwise the equipment field is the failed case), `good` [two strings], `differs`: `same` \| `differs` \| `unknown` \| `""`, `explains`: `yes` \| `partly` \| `no` \| `unknown` \| `""`, `evidenceIds`, `eventId`: a timeline event or `""`, `when`, `nodeId`: the node on the chart, or null, `specRowId`: the Is / Is Not question it was sent to, or `""`}]. Files without it start empty. |
| `timelines` | {`id`, `effectId` (the effect the events lead to), `phases` [{`id`, `name`, `events` [{`id`, `text`, `start`, `end`: `YYYY-MM-DDTHH:MM` or `""`, `kind`: `action` \| `condition`, `deviation`, `evidenceIds`, `nodeId`: the node on the chart, or null}]}]}. While an event is on the chart, its node's title, kind, and evidence are its own. |
| `actions` | {`id`, `action`, `solutionId`, `kind`: `containment` \| `corrective` \| `preventive`, `strength`: `strong` \| `medium` \| `weak` \| `""`, `owner`, `due`, `verification`, `status`: `open` (identified) \| `in-progress` \| `implemented` \| `verified` \| `validated` \| `cancelled`, `effectiveness` {`date`, `result`}}. Files with `done` open as `implemented`. |
| `counters` | `evidence`: the number of the next evidence code, so deleted codes are not reused. Files without it start after the highest code. |
| `view` | `collapsed`: ids of nodes whose causes are hidden |

A DFMEA file has `"type": "causeway-dfmea"` and `"schemaVersion": 1`: `meta` {`number`, `revision`, `date`, `team`, `scope`, `method`: `rpn` \| `ap`, `limit`}, `root`: the project node, each node {`id`, `title`, `notes`, `children`} and a cause also {`branch`, `prevention`, `detection`, `ratings` {`rpn` {`d`, `saf`, `env`, `oth`, `pof`}, `ap` {`s`, `o`, `d`}: 1 to 10 or null}, `justification`}; `actions` [{`id`, `causeId`, `title`, `owner`, `status`: `open` \| `progress` \| `done` \| `cancelled`, `start`, `target`, `after`: expected ratings as in `ratings`, `notes` [{`week`: `YYYY-Www`, `text`}]}]; `counters` {`branch`: the next branch number}.

Stop point reasons are `outside-control`, `solution-found`, `no-evidence`, and `no-value`. Dates are `YYYY-MM-DD`. Opening a file drops links to missing nodes and links that would close a loop.

## Offline

The page has no external references and uses the system fonts, and its Content Security Policy (`default-src 'none'`) makes the browser refuse any network request. It contains no third-party code: the Word documents and PowerPoint decks, the zip files they are, and the PDF are written by Causeway itself, in the browser.

## Host it for colleagues

The application is one page with no server side, so hosting it means handing out `index.html` from a computer that stays on. `scripts/serve.py` does that with Python alone. Everyone who opens the address gets the same Causeway; each person's RCAs and DFMEAs are saved as files on their own computer, and nothing they enter is sent to the host.

### 1. Prepare the host computer

1. Pick a computer that stays on during working hours and is on the same network as the people who will use it. Note its name (`hostname` in a terminal) or ask IT for a fixed address for it.
2. Install Python 3.8 or later if it is missing: from [python.org](https://www.python.org/downloads/) on Windows (tick **Add python.exe to PATH**), or with the package manager on Linux. Nothing else is needed.
3. Put the project on it: `git clone https://github.com/chamferlab/causeway.git`, or download the ZIP from GitHub and unpack it. A stable place such as `C:\causeway` or `/opt/causeway` is best. Only `index.html` and the `scripts/` folder are used, in those places relative to each other.

### 2. Start it and try it

```sh
./scripts/run_app.sh --lan          # Windows: scripts\run_app.bat --lan, or double-click it
```

It prints the addresses, for example `http://pc-0123:8080/`. Open the `localhost` one on the host first, then the network one from another computer. Add `--port 9000` to use another port. Without `--lan` Causeway is served to the host only, which is handy for a quick check.

### 3. Open the firewall

If the page opens on the host but not from another computer, the host's firewall is blocking the port.

- **Windows:** choose **Allow** for private networks when the prompt appears on first start, or run once in an administrator PowerShell: `New-NetFirewallRule -DisplayName "Causeway" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Domain,Private`
- **Linux (ufw):** `sudo ufw allow 8080/tcp`

On a managed work computer this step, and running a server at all, usually needs IT's agreement; ask before you start.

### 4. Start it automatically

- **Windows:** Task Scheduler → **Create Task** → trigger **At startup** → action **Start a program**: program `C:\causeway\scripts\run_app.bat`, arguments `--lan`, start in `C:\causeway`. Tick **Run whether user is logged on or not**.
- **Linux:** save this as `/etc/systemd/system/causeway.service`, with your own user name, then run `sudo systemctl enable --now causeway`:

  ```ini
  [Unit]
  Description=Causeway
  After=network-online.target

  [Service]
  User=YOUR_USER
  WorkingDirectory=/opt/causeway
  ExecStart=/usr/bin/python3 scripts/serve.py --lan
  Restart=on-failure

  [Install]
  WantedBy=multi-user.target
  ```

### 5. Tell people the address

Give them `http://HOST:8080/` to bookmark. A current Chrome, Edge, or Firefox on a desktop is needed. Tell them three things:

- **Save** writes the RCA as a JSON file on their computer, and that file is the record. Over plain HTTP from another computer, browsers do not let a page pick and rewrite a file, so each save downloads a copy, as in Firefox; on the host's `localhost` address, Chrome and Edge save to the same file again.
- The crash recovery copy in browser storage belongs to that address in that browser. If the host's name, address, or port changes, Causeway opens empty, so keep the address fixed and save to a file.
- To hand an RCA to someone else, send them the file.

### 6. Update it

Run `git pull` in the folder, or replace `index.html` with the new one. The server does not need a restart, and people get the new version when they reload the page. Their browser storage is kept.

### What this is and is not

- It is plain HTTP for a trusted office network. Do not expose the port to the internet.
- There are no accounts and no shared storage: people cannot see or edit each other's RCAs except through the files they share, and the host holds no RCAs to back up.
- The page still makes no network request of its own once loaded (see **Offline**).
- Any other web server works as well: publish `index.html` on IIS, nginx, or a SharePoint or intranet file area that serves HTML.

## Project files and development

`index.html` is generated. Edit the sources and rebuild; do not edit the HTML by hand.

- `src/index.html` — the page; `src/styles.css` — the styles.
- `src/js/` — the application, concatenated in filename order into one script: `01-constants`, `02-state` (state, undo, autosave), `03-model` (links, loop check, deletion, rule checks), `04-layout` (automatic layout and connector routing), `05-render`, `06-inspector` (Properties panel, evidence search), `07-issues` (issues list), `08-actions` (edits), `09-interactions` (pointer, pan, zoom, keys, arrow navigation), `10-io` (open, save, file checks), `11-records` (the 5 Whys, fishbone, Is / Is Not, failed vs good, sequence of events, and record pages), `12-fishbone` (fishbone layout and drawing), `13-timeline` (the sequence of events figure), `14-output` (SVG and PNG export, the printed report, themes), `15-example`, `16-guide` (the guide panel, its examples, and the Learn page), `17-documents` (zip writer, Word reports, and the chart as PDF), `18-slides` (PowerPoint decks), `20-dfmea-model` (the DFMEA: its tree, scoring, rule checks, file checks, and example), `21-dfmea-pages` (its pages, tree editing, and copy and paste), `22-dfmea-shell` (switching module, its undo, autosave, files, and report), `99-main` (startup).
- `media/favicon.svg` — the tab icon.
- `scripts/build.py` — builds `index.html`; standard library only. It refuses to build if the page references a remote resource.
- `scripts/test-app.py` — Firefox regression tests; standard library only.
- `scripts/serve.py` — serves `index.html` on this computer or the network; standard library only. `scripts/run_app.sh` and `scripts/run_app.bat` start it on Linux and Windows (see **Host it for colleagues**).

```
python3 scripts/build.py      # after editing src/ or media/
python3 scripts/test-app.py   # needs Firefox
```

The tests start a separate headless Firefox with a temporary profile. They check the script's syntax, then cover the example and its rule warnings, the layout (no overlaps, causes right of effects), adding, naming, and deleting causes, the Insert, A, C, and Delete keys, searching, linking, and adding evidence, arrow keys, the issues list and its good-practice checks, root cause types, action kinds, strength, and statuses, the equipment and duty record, the Is / Is Not (specification, cause testing, flags, and file checks), failed vs good (optional and silent when empty, starting from the equipment record and editing it, differences to the chart, the timeline, and the Is / Is Not, the reports showing differences only, and file checks), status and sign-off with the closing rule, the 8D report and the one-page summary, AND junctions, linking shared causes with loop refusal, moving and reordering by drag and by keys, moving up and down by hand, copying, cutting, and pasting branches (also into another RCA, and refusing bad clipboard data), unlinking, collapsing and expanding, the 5 Whys and adding its steps to the chart, the cause tree (statuses, ruling out on the tree, switching to Apollo and back with what each style still needs), the fishbone (editing from the diagram, sub-causes, adding to the chart, ruling out and restoring, and what happens when the node or record goes) and its SVG export, the sequence of events (phases, events in time order, deviations to the chart, what happens when the node or evidence goes, export, report, and file checks), each record page and its links to the chart (evidence numbering and highlighting, rule out, solutions and actions from causes), undo of record edits, SVG and PNG export, the printed report (also printed to PDF through Firefox), the full and 8D reports as Word documents (a valid zip of well-formed XML, its headings, pictures, page breaks, and repeating table headers), the PowerPoint decks (slide count, section titles, run-on slides, page numbers, every shape on the slide, the summary on one slide), the chart as a PDF (paper choice, cross-reference table, content, and fonts), the guide (following the page, every topic with its example, the cause tree's own guide, staying closed after a reload) and the Learn page, themes, undo and redo, the save and open round trip, importing XMind maps, shared causes and loop protection in opened files, refused files, cleared fishbone references, files and browser storage from the earlier name, autosave recovery, unavailable storage, the DFMEA (switching module without touching the RCA, tree editing by keys, pan and zoom, copy and paste, both scoring methods, actions and the tracker's weeks and notes, its report in print and Word, saving, and opening from either module), and that no network request is made.

#!/usr/bin/env python3
"""Browser regression tests, run through Firefox using Marionette; no Python dependencies.

Checks the script's syntax, then loads index.html and covers the example, the layout,
editing the chart with the mouse and keyboard, rule checks, shared causes, collapsing, the RCA
record pages, undo and redo, opening and saving files, export, the printed report, themes,
autosave, and that the page makes no network requests.

Run directly to start a temporary headless Firefox, or pass --port to use an
existing Firefox started with --headless --marionette and a temporary profile.
"""
import argparse
import base64
import io
import json
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
STORAGE = 'causeway-v1'


class Browser:
    def __init__(self, port):
        self.socket = socket.create_connection(('127.0.0.1', port), timeout=10)
        self.sequence = 0
        self.read()

    def read(self):
        prefix = b''
        while not prefix.endswith(b':'):
            chunk = self.socket.recv(1)
            if not chunk:
                raise RuntimeError('Browser connection closed')
            prefix += chunk
        length = int(prefix[:-1])
        data = b''
        while len(data) < length:
            chunk = self.socket.recv(length - len(data))
            if not chunk:
                raise RuntimeError('Browser connection closed')
            data += chunk
        return json.loads(data)

    def call(self, name, args=None):
        self.sequence += 1
        data = json.dumps([0, self.sequence, name, args or {}]).encode()
        self.socket.sendall(str(len(data)).encode() + b':' + data)
        result = self.read()
        if result[2]:
            raise RuntimeError(result[2])
        return result[3]

    def js(self, script, args=None):
        return self.call('WebDriver:ExecuteScript', {
            'script': script, 'args': args or [], 'newSandbox': False,
        })['value']

    def async_js(self, script, args=None):
        return self.call('WebDriver:ExecuteAsyncScript', {
            'script': script, 'args': args or [],
        })['value']


def check_syntax(b):
    """Parses the built script without running it. Done on a blank page, outside the app's CSP."""
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    source = re.search(r'<script>\n(.*)</script>', html, re.S).group(1)
    b.call('WebDriver:Navigate', {'url': 'about:blank'})
    error = b.js('try{new Function(arguments[0]);return null}catch(e){return e.name+": "+e.message+" (line "+e.lineNumber+")"}', [source])
    assert error is None, 'Syntax error in the built script: ' + error
    print('PASS: script syntax', flush=True)


def run_tests(b):
    url = (ROOT / 'index.html').as_uri()

    def open_app(clear=False):
        b.call('WebDriver:Navigate', {'url': url})
        if clear:
            b.js('localStorage.clear();return true')
            b.call('WebDriver:Navigate', {'url': url})
        # Dialogs answer yes and are recorded; violations of the page's CSP are recorded too.
        b.js('''window.__dialogs=[];window.confirm=m=>{__dialogs.push(m);return true};window.alert=m=>{__dialogs.push(m)};
            window.__violations=[];document.addEventListener('securitypolicyviolation',e=>__violations.push(e.blockedURI));
            window.__downloads=[];const create=URL.createObjectURL;URL.createObjectURL=blob=>{__downloads.push(blob);return create(blob)};
            HTMLAnchorElement.prototype.click=function(){};return true''')

    def saved():
        return b.js(f"return JSON.parse(localStorage.getItem('{STORAGE}'))")

    def rca():
        return saved()['rca']

    def click(element_id):
        b.js('document.getElementById(arguments[0]).click();return true', [element_id])

    def node_id(title):
        found = [n['id'] for n in rca()['nodes'] if n['title'] == title]
        assert found, 'no node titled ' + title
        return found[0]

    def select(title):
        b.js('''const n=document.querySelector(`#chart .node[data-id="${arguments[0]}"] rect:not([fill=none])`),r=n.getBoundingClientRect();
            n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.x+5,clientY:r.y+5}));
            document.getElementById('chart').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:r.x+5,clientY:r.y+5}));return true''', [node_id(title)])

    def type_into(field, value):
        b.js('const i=document.getElementById(arguments[0]);i.focus();i.value=arguments[1];i.dispatchEvent(new Event("input",{bubbles:true}));return true', [field, value])

    def load(project):
        b.async_js('''const done=arguments[arguments.length-1],input=document.getElementById('projectFile'),dt=new DataTransfer();
            dt.items.add(new File([JSON.stringify(arguments[0])],'test.json',{type:'application/json'}));input.files=dt.files;
            input.onchange({target:input}).then(()=>done(true));''', [project])

    def boxes():
        return b.js('''return [...document.querySelectorAll('#chart .node')].map(g=>{const t=g.transform.baseVal[0].matrix,r=g.querySelector('rect:not([fill=none])');
            return {id:g.dataset.id,x:t.e,y:t.f,w:+r.getAttribute('width'),h:+r.getAttribute('height')}})''')

    def issue_outlines():
        return b.js("return document.querySelectorAll('#chart rect[stroke-dasharray]').length")

    def question_marks():
        return b.js("return [...document.querySelectorAll('#chart text')].filter(t=>t.textContent==='?').length")

    open_app(clear=True)
    assert b.js("return document.querySelectorAll('#chart .node').length") == 1, 'a new RCA shows the primary effect'
    assert b.js("return document.getElementById('undo').disabled&&document.getElementById('redo').disabled")
    print('PASS: starts with an empty RCA', flush=True)

    # ---- Example ----
    click('loadExample')
    data = rca()
    assert len(data['nodes']) == 16 and len(data['links']) == 15 and len(data['evidence']) == 10
    assert [e['code'] for e in data['evidence']] == [f'E{i}' for i in range(1, 11)]
    assert len(data['ruledOut']) == 5 and len(data['solutions']) == 7 and len(data['actions']) == 5 and len(data['fiveWhys']) == 2
    assert data['schemaVersion'] == 1 and data['type'] == 'causeway'
    uuid = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    every_id = [x['id'] for key in ('nodes', 'links', 'evidence', 'ruledOut', 'solutions', 'actions') for x in data[key]] + [data['id']]
    assert all(uuid.match(i) for i in every_id) and len(set(every_id)) == len(every_id), 'every entity has its own UUID'
    assert len(boxes()) == 16
    # "Product close to its vapour pressure" has a condition but no action.
    assert issue_outlines() == 1, 'one effect lacks an action'
    assert question_marks() == 2, 'two causes without evidence'
    print('PASS: example loads with its rule warnings', flush=True)

    # ---- Layout ----
    def check_layout():
        placed = {x['id']: x for x in boxes()}
        for one in placed.values():
            for other in placed.values():
                if one['id'] < other['id']:
                    apart = (one['x'] + one['w'] <= other['x'] or other['x'] + other['w'] <= one['x']
                             or one['y'] + one['h'] <= other['y'] or other['y'] + other['h'] <= one['y'])
                    assert apart, 'nodes overlap'
        for link in rca()['links']:
            if link['effectId'] in placed and link['causeId'] in placed:
                assert placed[link['effectId']]['x'] + placed[link['effectId']]['w'] < placed[link['causeId']]['x'], 'causes are right of their effects'
        return placed
    placed = check_layout()
    primary = rca()['problem']['primaryEffectId']
    assert min(x['x'] for x in placed.values()) == placed[primary]['x'], 'the primary effect is leftmost'
    # Each effect is centred on the causes in the next column that it is drawn with.
    mid = lambda box: box['y'] + box['h'] / 2
    columns = sorted({x['x'] for x in placed.values()})
    drawn_under, causes = set(), {}
    for link in rca()['links']:
        effect, cause = placed[link['effectId']], placed[link['causeId']]
        if cause['id'] in drawn_under or cause['x'] - effect['x'] != columns[1] - columns[0]:
            continue
        drawn_under.add(cause['id'])
        causes.setdefault(effect['id'], []).append(mid(cause))
    for effect, ys in causes.items():
        assert abs(mid(placed[effect]) - (min(ys) + max(ys)) / 2) < 0.5, 'effects are centred on their causes'
    print('PASS: layout reads left to right without overlaps', flush=True)

    # ---- Adding and editing causes ----
    select('Heat input from face friction and pump')
    assert b.js("return document.getElementById('nodeTitle').value") == 'Heat input from face friction and pump'
    click('addAction')
    assert len(rca()['nodes']) == 17
    assert b.js("return document.activeElement.id") == 'nodeTitle', 'the new cause is ready to be named'
    type_into('nodeTitle', 'Pump ran at minimum flow')
    type_into('nodeTitle', 'Pump ran at minimum flow for 3 h')
    new = node_id('Pump ran at minimum flow for 3 h')
    heat = node_id('Heat input from face friction and pump')
    assert {'effectId': heat, 'causeId': new} == {k: v for k, v in next(l for l in rca()['links'] if l['causeId'] == new).items() if k != 'id'}
    assert issue_outlines() == 2, 'heat input now needs a condition as well'
    check_layout()
    print('PASS: add an action cause and name it', flush=True)

    before = rca()
    click('undo')
    assert len(rca()['nodes']) == 17 and rca()['nodes'][-1]['title'] == 'New action', 'typing in one field is one undo step'
    click('undo')
    assert len(rca()['nodes']) == 16
    click('redo'); click('redo')
    assert rca() == before
    print('PASS: undo and redo', flush=True)

    # ---- Keyboard ----
    def key(name, shift=False, alt=False):
        code = 'Key' + name.upper() if name.isalpha() and len(name) == 1 else 'Digit' + name if name.isdigit() else name
        b.js('document.activeElement.blur();window.dispatchEvent(new KeyboardEvent("keydown",{key:arguments[0],code:arguments[1],shiftKey:arguments[2],altKey:arguments[3],bubbles:true}));return true',
             [name, code, shift, alt])

    def type_keys(text, on_page=True):
        """Real key presses, through the browser's input; by default with the focus on the page."""
        if on_page:
            b.js('document.activeElement.blur();return true')
        keys = {'Escape': '\ue00c'}
        actions = [a for k in text for a in ({'type': 'keyDown', 'value': keys.get(k, k)}, {'type': 'keyUp', 'value': keys.get(k, k)})]
        b.call('WebDriver:PerformActions', {'actions': [{'type': 'key', 'id': 'keyboard', 'actions': actions}]})
        b.call('WebDriver:ReleaseActions')

    select('Heat input from face friction and pump')
    key('Insert')
    assert rca()['nodes'][-1]['kind'] == 'action' and b.js("return document.activeElement.id") != 'nodeTitle', 'Insert adds an action, without editing it'
    select('Heat input from face friction and pump')
    key('Insert', shift=True)
    assert rca()['nodes'][-1]['kind'] == 'condition', 'Shift+Insert adds a condition'
    select('Heat input from face friction and pump')
    key('c', alt=True)
    assert rca()['nodes'][-1]['kind'] == 'condition' and len(rca()['nodes']) == 20
    key('Delete')
    assert len(rca()['nodes']) == 19, 'Delete removes the selected cause'
    select('Heat input from face friction and pump')
    key('Tab')
    assert rca()['nodes'][-1]['kind'] == 'action' and len(rca()['nodes']) == 20, 'Tab adds an action'
    select('Heat input from face friction and pump')
    key('Tab', shift=True)
    assert rca()['nodes'][-1]['kind'] == 'condition' and len(rca()['nodes']) == 21, 'Shift+Tab adds a condition'
    count = len(rca()['nodes'])
    select('Heat input from face friction and pump')
    b.js("document.getElementById('undo').focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));return true")
    assert len(rca()['nodes']) == count, 'Tab on a button moves the focus and adds nothing'
    click('undo'); click('undo'); click('undo'); click('undo'); click('undo'); click('undo')
    assert rca() == before

    # Tab again adds a cause of the new cause, Enter a sibling of the same kind; typing names the selected one.
    def node(title):
        return next(n for n in rca()['nodes'] if n['title'] == title)

    def selected_id():
        return b.js("return document.querySelector('#chart .node > rect[stroke-width=\"3\"][fill=none]')?.parentNode.dataset.id")
    select('Heat input from face friction and pump')
    key('Tab'); child = rca()['nodes'][-1]['id']
    key('Tab'); grandchild = rca()['nodes'][-1]['id']
    assert selected_id() == grandchild and b.js("return document.activeElement.id") != 'nodeTitle', 'Tab, Tab nests, and does not start editing'
    assert any(l['effectId'] == child and l['causeId'] == grandchild for l in rca()['links'])
    type_keys('Dry')
    assert b.js("return document.activeElement.id") == 'nodeTitle' and node('Dry')['id'] == grandchild, 'typing starts the title'
    type_keys(['\ue007'], on_page=False)
    assert b.js("return document.activeElement.id") != 'nodeTitle', 'Enter finishes the title'
    key('Enter')
    sibling = rca()['nodes'][-1]
    assert sibling['kind'] == 'action' and any(l['effectId'] == child and l['causeId'] == sibling['id'] for l in rca()['links']) and selected_id() == sibling['id'], 'Enter adds a sibling'
    links = [l['causeId'] for l in rca()['links'] if l['effectId'] == child]
    assert links.index(sibling['id']) == links.index(grandchild) + 1, 'just after the selected cause'
    select('Heat input from face friction and pump'); key('Tab', shift=True); key('Enter')
    assert rca()['nodes'][-1]['kind'] == 'condition', 'a sibling of a condition is a condition'
    count = len(rca()['nodes'])
    b.js('document.querySelector(`#chart .node[data-id="${arguments[0]}"] rect:not([fill=none])`).dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0}));document.getElementById("chart").dispatchEvent(new PointerEvent("pointerup",{bubbles:true,button:0}));return true', [rca()['problem']['primaryEffectId']])
    key('Enter')
    assert len(rca()['nodes']) == count, 'the primary effect has no sibling'
    key('F2')
    assert b.js("return document.activeElement.id") == 'nodeTitle', 'F2 edits the title'
    b.js('document.activeElement.blur();return true')
    check_layout()
    for _ in range(6): click('undo')
    assert rca() == before, 'each key is one undo step'
    print('PASS: Insert, Shift+Insert, Tab, Shift+Tab, Enter, F2, Alt+C and Delete keys', flush=True)

    # Typing on a selected node replaces its title, even with letters that are commands with Alt.
    select('Heat input from face friction and pump')
    type_keys('Lam')
    assert b.js("return document.activeElement.id") == 'nodeTitle' and b.js("return document.getElementById('linkBanner').hidden"), 'L types, and does not link'
    assert any(n['title'] == 'Lam' for n in rca()['nodes']), 'the first key replaces the title'
    type_keys(['Escape'], on_page=False)
    assert rca() == before and b.js("return document.activeElement.id") != 'nodeTitle', 'Esc takes back what was typed'
    select('Heat input from face friction and pump')
    type_keys('Pump')
    shift, enter = '\ue008', '\ue007'
    actions = [{'type': 'keyDown', 'value': shift}, {'type': 'keyDown', 'value': enter}, {'type': 'keyUp', 'value': enter}, {'type': 'keyUp', 'value': shift}]
    b.call('WebDriver:PerformActions', {'actions': [{'type': 'key', 'id': 'keyboard', 'actions': actions}]})
    b.call('WebDriver:ReleaseActions')
    type_keys(['h', 'e', 'a', 't', enter], on_page=False)
    assert any(n['title'] == 'Pump\nheat' for n in rca()['nodes']), 'Shift+Enter starts a new line'
    assert b.js("return document.activeElement.id") != 'nodeTitle', 'Enter finishes the title'
    assert b.js("return document.getElementById('nodeTitle').value") == 'Pump\nheat'
    click('undo')
    assert rca() == before, 'what was typed is one undo step'
    print('PASS: typing renames the selected node; Enter finishes it and Esc takes it back', flush=True)

    # ---- Evidence ----
    def search(text):
        type_into('evidenceSearch', text)
        return b.js("return [...document.querySelectorAll('#evidenceOptions li')].map(li=>li.textContent)")

    def search_key(name):
        b.js('document.getElementById("evidenceSearch").dispatchEvent(new KeyboardEvent("keydown",{key:arguments[0],bubbles:true}));return true', [name])

    def cited(title):
        return next(n for n in rca()['nodes'] if n['title'] == title)['evidenceIds']

    heat_title = 'Heat input from face friction and pump'
    select(heat_title)
    before_ev = rca()
    e3 = next(e['id'] for e in rca()['evidence'] if e['code'] == 'E3')
    options = search('e3')
    assert options[0].startswith('E3') and not any('New' in o for o in options), 'a code finds its item, without offering a new one'
    search_key('Enter')
    assert e3 in cited(heat_title), 'Enter links the item'
    assert b.js("return document.activeElement.id") == 'evidenceSearch', 'the search box keeps the focus for the next item'
    assert not any(o.startswith('E3') for o in search('DCS')), 'linked items are not offered again'
    options = search('Motor current 8 % above the curve')
    assert options[-1].startswith('+ New') and 'E11' in options[-1]
    b.js("const li=[...document.querySelectorAll('#evidenceOptions li')].at(-1);li.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));return true")
    added = rca()['evidence'][-1]
    assert added['code'] == 'E11' and added['description'] == 'Motor current 8 % above the curve'
    assert added['id'] in cited(heat_title), 'new evidence is logged and linked'
    assert b.js("return [...document.querySelectorAll('#chart text')].some(t=>t.textContent==='E11')"), 'the chart shows the new code'
    b.js('document.querySelector(`[data-unlink="${arguments[0]}"]`).click();return true', [e3])
    assert e3 not in cited(heat_title), 'evidence unlinks'
    click('undo'); click('undo'); click('undo')
    assert rca() == before_ev
    print('PASS: search, link, add, and unlink evidence', flush=True)

    # ---- Arrow keys and the issues list ----
    def selected_title():
        return b.js("return document.getElementById('nodeTitle')?.value ?? null")

    select('Seal chamber temperature rose 18 °C')
    key('ArrowLeft')
    assert selected_title() == 'Fluid film flashed to vapour (intermittent dry running)', 'left goes to the effect'
    key('ArrowRight')
    assert selected_title() == 'Seal chamber temperature rose 18 °C', 'right goes to a cause'
    key('ArrowDown')
    assert selected_title() == 'Product close to its vapour pressure', 'down goes to the next node in the column'
    key('ArrowUp')
    assert selected_title() == 'Seal chamber temperature rose 18 °C'

    # Two effects lack a cause type (errors), three causes lack evidence (warnings).
    assert b.js("return document.getElementById('issuesCount').textContent") == '5 issues'
    click('issuesButton')
    items = b.js("return [...document.querySelectorAll('#issuesList [data-node]')].map(x=>x.textContent)")
    assert all('Needs' in i for i in items[:2]) and not any('Needs' in i for i in items[2:]), 'errors come first'
    b.js("[...document.querySelectorAll('#issuesList [data-node]')].find(x=>x.textContent.startsWith('Product close')).click();return true")
    assert selected_title() == 'Product close to its vapour pressure' and b.js("return document.getElementById('issuesList').hidden")
    assert b.js("return document.querySelectorAll('#chart .junction').length") > 0, 'AND junctions are drawn'
    print('PASS: arrow keys, issues list, AND junctions', flush=True)

    # ---- Shared causes: linking an existing node ----
    def banner_shown():
        return not b.js("return document.getElementById('linkBanner').hidden")

    def has_link(effect, cause):
        return any(l['effectId'] == node_id(effect) and l['causeId'] == node_id(cause) for l in rca()['links'])

    film, orifice = 'Fluid film flashed to vapour (intermittent dry running)', '3 mm orifice, no strainer or cyclone'
    before_link = rca()
    select(film)
    key('l', alt=True)
    assert banner_shown(), 'Alt+L starts linking'
    assert b.js("return document.querySelectorAll('#chart .node[opacity]').length") > 0, 'nodes that cannot be linked are faded'
    select('Leak path opened across primary faces')
    assert 'loop' in b.js("return document.getElementById('status').textContent") and banner_shown(), 'a loop is refused'
    assert rca()['links'] == before_link['links']
    select(orifice)
    assert has_link(film, orifice) and not banner_shown(), 'clicking a node links it'
    assert b.js("return document.querySelectorAll('#chart path[stroke-dasharray]').length") == 1, 'the further link is dashed'
    check_layout()
    select(orifice)
    assert b.js("return document.querySelectorAll('[data-unlink-effect]').length") == 2, 'a shared cause lists both effects'
    b.js('document.querySelector(`[data-unlink-effect="${arguments[0]}"]`).click();return true', [node_id(film)])
    assert not has_link(film, orifice) and b.js("return document.querySelectorAll('[data-unlink-effect]').length") == 0, 'unlinking keeps the last effect'
    click('undo')
    assert has_link(film, orifice)
    click('undo')
    assert rca() == before_link
    select(film)
    click('linkCause')
    key('Escape')
    assert not banner_shown() and rca() == before_link, 'Escape cancels linking'
    print('PASS: link an existing node as a shared cause, unlink, cancel', flush=True)

    # ---- Collapse and expand ----
    plan = 'Plan 11 flush flow dropped to near zero'
    shown = len(boxes())
    select(plan)
    key(' ')
    assert len(boxes()) == shown - 4, 'Space collapses the branch'
    assert b.js("return [...document.querySelectorAll('#chart text')].some(t=>t.textContent==='+4')"), 'the collapsed node counts its hidden causes'
    assert rca()['view']['collapsed'] == [node_id(plan)], 'collapsing is saved with the RCA'
    assert b.js('return document.getElementById("undo").disabled') is False and rca()['nodes'] == before_link['nodes']
    key('ArrowRight')
    assert len(boxes()) == shown, 'right expands a collapsed node'
    b.js('''const t=document.querySelector(`#chart .node[data-id="${arguments[0]}"] .toggle circle`);
        t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));return true''', [node_id(plan)])
    assert len(boxes()) == shown - 4, 'the toggle on the chart collapses'
    select(film)
    key(' ')
    click('issuesButton')
    b.js("[...document.querySelectorAll('#issuesList [data-node]')].find(x=>x.textContent.startsWith('Product close')).click();return true")
    assert selected_title() == 'Product close to its vapour pressure', 'choosing a hidden issue expands its branch'
    b.js("document.getElementById('chart').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:5,clientY:5}));document.getElementById('chart').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:5,clientY:5}));return true")
    click('expandAll')
    assert len(boxes()) == len(rca()['nodes']) and rca() == before_link
    print('PASS: collapse and expand branches', flush=True)

    # ---- Moving and reordering causes ----
    def drag(title, to_title, frac=0.5, hold=False):
        # Drags a node by its middle to a point on another node: frac 0 is its top edge, 1 its bottom.
        return b.js('''const chart=document.getElementById('chart'),box=id=>document.querySelector(`#chart .node[data-id="${id}"] rect:not([fill=none])`);
            const a=box(arguments[0]).getBoundingClientRect(),sx=a.x+a.width/2,sy=a.y+a.height/2;
            box(arguments[0]).dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:sx,clientY:sy}));
            const t=box(arguments[1]).getBoundingClientRect(),tx=t.x+t.width/2,ty=t.y+t.height*arguments[2];
            chart.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:(sx+tx)/2,clientY:(sy+ty)/2}));
            chart.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:tx,clientY:ty}));
            const label=[...chart.querySelectorAll('.ghost text')].map(x=>x.textContent).at(-1)??null;
            if(!arguments[3]) chart.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:tx,clientY:ty}));
            return label''', [node_id(title), node_id(to_title), frac, hold])

    def alt_key(name):
        b.js('document.activeElement.blur();window.dispatchEvent(new KeyboardEvent("keydown",{key:arguments[0],altKey:true,bubbles:true}));return true', [name])

    def drawn_under(effect):
        data = rca(); titles = {n['id']: n['title'] for n in data['nodes']}
        return [titles[l['causeId']] for l in data['links'] if l['effectId'] == node_id(effect)]

    before_move = rca()
    heat, temp, film = 'Heat input from face friction and pump', 'Seal chamber temperature rose 18 °C', 'Fluid film flashed to vapour (intermittent dry running)'
    label = drag(heat, film)
    assert label.startswith('Move under “Fluid film flashed'), label
    assert heat in drawn_under(film) and heat not in drawn_under(temp), 'dropping on an effect moves the cause'
    assert b.js("return document.querySelectorAll('#chart .ghost').length") == 0
    check_layout()
    click('undo')
    assert rca() == before_move

    label = drag('Plan 11 flush flow dropped to near zero', 'Solids entered the flush line')
    assert 'loop' in label and rca() == before_move, 'a drop that would make a loop is refused'
    assert 'loop' in b.js("return document.getElementById('status').textContent")

    drag(heat, film, hold=True)
    key('Escape')
    assert rca() == before_move and b.js("return document.querySelectorAll('#chart .ghost').length") == 0, 'Escape cancels a drag'
    b.js("document.getElementById('chart').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return true")

    primary_title = next(n['title'] for n in rca()['nodes'] if n['id'] == rca()['problem']['primaryEffectId'])
    assert drag(primary_title, film) is None and rca() == before_move, 'the primary effect cannot be dragged'

    select(heat)
    key('m', alt=True)
    assert banner_shown() and 'move' in b.js("return document.getElementById('linkText').textContent")
    select(film)
    assert heat in drawn_under(film) and not banner_shown(), 'M, then a click, moves the cause'
    click('undo')
    assert rca() == before_move

    # Reordering: two actions under one effect.
    plan, solids = 'Plan 11 flush flow dropped to near zero', 'Solids entered the flush line'
    select(plan)
    key('Insert')
    type_into('nodeTitle', 'Strainer basket removed')
    actions = lambda: [t for t in drawn_under(plan) if next(n for n in rca()['nodes'] if n['title'] == t)['kind'] == 'action']
    assert actions() == [solids, 'Strainer basket removed']
    label = drag('Strainer basket removed', solids, frac=0.1)
    assert label.startswith('Place above “Solids'), label
    assert actions() == ['Strainer basket removed', solids], 'dropping on the top edge of a sibling places it above'
    placed = {x['id']: x for x in boxes()}
    assert placed[node_id('Strainer basket removed')]['y'] < placed[node_id(solids)]['y']
    check_layout()
    alt_key('ArrowDown')
    assert actions() == [solids, 'Strainer basket removed'], 'Alt+Down moves it below its sibling'
    alt_key('ArrowUp')
    assert actions() == ['Strainer basket removed', solids], 'Alt+Up moves it back'
    label = drag('3 mm orifice, no strainer or cyclone', solids, frac=0.1)
    assert label.startswith('Move under'), 'a condition does not reorder among actions'
    for _ in range(6):
        if rca() == before_move:
            break
        click('undo')
    assert rca() == before_move
    print('PASS: drag to move and reorder, M, Alt+arrows, refused and cancelled drags', flush=True)

    # ---- Moving causes up and down by hand ----
    def shift_drag(title, dy, hold=False):
        """Shift+drags a node by dy screen pixels."""
        b.js('''const chart=document.getElementById('chart'),n=document.querySelector(`#chart .node[data-id="${arguments[0]}"] rect:not([fill=none])`);
            const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,o={bubbles:true,button:0,shiftKey:true,clientX:x};
            n.dispatchEvent(new PointerEvent('pointerdown',{...o,clientY:y}));
            chart.dispatchEvent(new PointerEvent('pointermove',{...o,clientY:y+arguments[1]/2}));
            chart.dispatchEvent(new PointerEvent('pointermove',{...o,clientY:y+arguments[1]}));
            if(!arguments[2]) chart.dispatchEvent(new PointerEvent('pointerup',{...o,clientY:y+arguments[1]}));return true''', [node_id(title), dy, hold])

    def layout_tree():
        """The effect each drawn cause is drawn under, and each effect's causes from the top down."""
        placed = {x['id']: x for x in boxes()}
        step = min({x['x'] for x in placed.values()} - {0}, default=0)
        under = {}
        for link in rca()['links']:
            e, c = placed.get(link['effectId']), placed.get(link['causeId'])
            if e and c and c['id'] not in under and c['x'] - e['x'] == step:
                under[c['id']] = e['id']
        kids = {}
        for c, e in under.items():
            kids.setdefault(e, []).append(c)
        for e in kids:
            kids[e].sort(key=lambda i: placed[i]['y'])
        return kids

    def branch(title):
        kids, todo, seen = layout_tree(), [node_id(title)], set()
        while todo:
            i = todo.pop()
            if i not in seen:
                seen.add(i); todo += kids.get(i, [])
        return seen

    def offset(title):
        return next(n['offsetY'] for n in rca()['nodes'] if n['title'] == title)

    zoom_k = b.js("const s=document.getElementById('chart');return s.clientWidth/s.viewBox.baseVal.width")
    film = 'Fluid film flashed to vapour (intermittent dry running)'
    # A cause after the first of its effect, with causes of its own.
    later = next([e, ks[i], ks[0]] for e, ks in layout_tree().items() for i in range(1, len(ks)) if ks[i] in layout_tree())
    title_of = lambda i: next(n['title'] for n in rca()['nodes'] if n['id'] == i)
    effect_title, later_title, first_title = map(title_of, later)
    before_shift, start = rca(), {x['id']: x for x in boxes()}
    moved = branch(later_title)
    shift_drag(later_title, 90 * zoom_k)
    placed = check_layout()
    assert offset(later_title) == 90, offset(later_title)
    for i in moved:
        assert abs(placed[i]['y'] - start[i]['y'] - 90) < .5, 'the cause moves down with its branch'
    for i, x in start.items():
        if i not in moved and x['y'] < start[later[1]]['y']:
            assert placed[i]['y'] == x['y'], 'nothing above it moves'
    assert placed[later[0]]['y'] == start[later[0]]['y'], 'its effect stays'
    assert 'Moved' in b.js("return document.getElementById('properties').textContent"), 'the Properties panel says it was moved by hand'
    click('undo')
    assert rca() == before_shift and boxes() == list(start.values()), 'a hand move is one undo step'

    shift_drag(later_title, -60 * zoom_k)
    assert offset(later_title) == 0 and {x['id']: x for x in boxes()} == start, 'a cause below another cannot move up into it'

    # A cause moves up into free space, and no further than its effect allows: here the first cause of
    # the primary effect, which has the space above the chart.
    root = rca()['problem']['primaryEffectId']
    top_title = title_of(layout_tree()[root][0])
    shift_drag(top_title, -2000 * zoom_k)
    placed = check_layout()
    up = offset(top_title)
    assert up < 0 and placed[root] == start[root], 'the first cause moves up, and its effect stays'
    for i, x in start.items():
        if i not in branch(top_title):
            assert placed[i] == x, 'nothing else moves'
    click('undo')
    # Where the causes above leave no room, it cannot move up; moved down, it pushes the causes below.
    select(later_title)
    key('ArrowUp', shift=True)
    assert offset(later_title) == 0 and 'no room' in b.js("return document.getElementById('status').textContent")
    shift_drag(first_title, 40 * zoom_k)
    placed = check_layout()
    assert placed[later[1]]['y'] > start[later[1]]['y'] and offset(later_title) == 0, 'the cause below is pushed down'
    click('undo')
    assert rca() == before_shift

    # Keys: Shift+Down twice is one undo step; Esc cancels a drag; a drag snaps level with the effect.
    select(later_title)
    key('ArrowDown', shift=True); key('ArrowDown', shift=True)
    assert offset(later_title) == 20 and selected_title() == later_title
    click('undo')
    assert rca() == before_shift, 'consecutive Shift+arrows are one undo step'
    shift_drag(later_title, 50 * zoom_k, hold=True)
    key('Escape')
    b.js("document.getElementById('chart').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return true")
    assert rca() == before_shift and {x['id']: x for x in boxes()} == start, 'Escape cancels a hand move'
    level = start[later[0]]['y'] + start[later[0]]['h'] / 2 - start[later[1]]['y'] - start[later[1]]['h'] / 2
    if level > 0:
        shift_drag(later_title, (level + 5) * zoom_k)
        placed = {x['id']: x for x in boxes()}
        assert placed[later[1]]['y'] + placed[later[1]]['h'] / 2 == placed[later[0]]['y'] + placed[later[0]]['h'] / 2, 'it snaps level with its effect'
        click('undo')

    # Put back, one or all; moving or reordering a cause puts it back too; files keep it.
    shift_drag(later_title, 70 * zoom_k)
    b.js("document.getElementById('inspResetShift').click();return true")
    assert offset(later_title) == 0 and {x['id']: x for x in boxes()} == start
    shift_drag(later_title, 70 * zoom_k); shift_drag(first_title, 30 * zoom_k)
    b.js("document.getElementById('chart').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:5,clientY:5}));document.getElementById('chart').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:5,clientY:5}));return true")
    assert 'Put back 2 nodes' in b.js("return document.getElementById('resetShifts').textContent")
    click('resetShifts')
    assert offset(later_title) == offset(first_title) == 0 and {x['id']: x for x in boxes()} == start
    shift_drag(later_title, 70 * zoom_k)
    drag(later_title, first_title)
    assert offset(later_title) == 0, 'moving a cause to another effect puts it back'
    click('undo')
    assert offset(later_title) == 70
    for name in ('Hand A', 'Hand B'):
        select(later_title); key('Insert'); type_into('nodeTitle', name)
    select('Hand B')
    key('ArrowDown', shift=True)
    assert offset('Hand B') == 10
    alt_key('ArrowUp')
    assert offset('Hand B') == 0, 'reordering puts it back'
    for _ in range(12):
        if rca() == before_shift:
            break
        click('undo')
    assert rca() == before_shift
    print('PASS: move causes up and down by hand, with Shift+drag and Shift+arrows', flush=True)

    # ---- Copy, cut, and paste ----
    def ctrl(letter, on_page=True):
        """A real Ctrl+letter key press, by default with the focus on the page, through the system clipboard."""
        if on_page:
            b.js('document.activeElement.blur();getSelection().removeAllRanges();return true')
        b.call('WebDriver:PerformActions', {'actions': [{'type': 'key', 'id': 'keyboard', 'actions': [
            {'type': 'keyDown', 'value': ''}, {'type': 'keyDown', 'value': letter},
            {'type': 'keyUp', 'value': letter}, {'type': 'keyUp', 'value': ''}]}]})
        b.call('WebDriver:ReleaseActions')

    def status():
        return b.js("return document.getElementById('status').textContent")

    def subtree_titles(root_id, data):
        kids, seen, todo = {}, [], [root_id]
        for l in data['links']:
            kids.setdefault(l['effectId'], []).append(l['causeId'])
        while todo:
            i = todo.pop(0)
            if i not in seen:
                seen.append(i); todo += kids.get(i, [])
        titles = {n['id']: n['title'] for n in data['nodes']}
        return sorted(titles[i] for i in seen)

    before_copy = rca()
    copied, target = film, 'Seal relies on a stable liquid film'
    branch_size = len(subtree_titles(node_id(copied), before_copy))
    assert branch_size > 3
    select(copied)
    ctrl('c')
    assert status().startswith(f'Copied "{copied}" and {branch_size - 1} causes'), status()
    select(target)
    ctrl('v')
    after = rca()
    assert len(after['nodes']) == len(before_copy['nodes']) + branch_size, 'the node and every cause under it are pasted'
    pasted = [n for n in after['nodes'] if n['title'] == copied and n['id'] != node_id(copied)]
    assert len(pasted) == 1 and selected_title() == copied, 'the pasted branch is selected'
    root = pasted[0]['id']
    assert any(l['effectId'] == node_id(target) and l['causeId'] == root for l in after['links']), 'it is pasted as a cause of the selected node'
    assert subtree_titles(root, after) == subtree_titles(node_id(copied), before_copy), 'the branch keeps its shape'
    original = next(n for n in before_copy['nodes'] if n['title'] == copied)
    assert {k: v for k, v in pasted[0].items() if k != 'id'} == {k: v for k, v in original.items() if k != 'id'}, 'fields, evidence included, are kept'
    assert len({n['id'] for n in after['nodes']}) == len(after['nodes']) and all(uuid.match(n['id']) for n in after['nodes']), 'new ids'
    check_layout()
    click('undo')
    assert rca() == before_copy, 'a paste is one undo step'
    # In a text field, the copy pastes as the titles, indented.
    select(target)
    b.js("const i=document.getElementById('nodeNotes');i.focus();return true")
    ctrl('v', on_page=False)
    notes = b.js("return document.getElementById('nodeNotes').value")
    assert notes.startswith(copied + '\n  ') and len(notes.strip().split('\n')) == branch_size, notes
    click('undo')
    assert rca() == before_copy
    select(target)
    ctrl('v')
    # The Paste as cause button pastes the same branch again.
    select(target)
    b.js("document.getElementById('inspPaste').click();return true")
    assert sum(n['title'] == copied for n in rca()['nodes']) == 3
    click('undo'); click('undo')
    assert rca() == before_copy

    # Cut: copies, then deletes as Delete does.
    leaf = 'Seal relies on a stable liquid film'
    select(leaf)
    ctrl('x')
    assert leaf not in [n['title'] for n in rca()['nodes']] and status().startswith('Cut')
    select(copied)
    ctrl('v')
    assert leaf in drawn_under(copied), 'a cut node pastes elsewhere'
    click('undo'); click('undo')
    assert rca() == before_copy

    # In a field, the keys copy text as usual.
    select(copied)
    b.js("const i=document.getElementById('nodeTitle');i.focus();i.select();return true")
    copy_default = b.js("const e=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});document.getElementById('nodeTitle').dispatchEvent(e);return e.defaultPrevented")
    assert copy_default is False, 'copying in a field is left to the browser'

    # Copying the primary effect copies the chart; pasted, its top node is a cause without a type.
    select(primary_title)
    ctrl('c')
    select(leaf)
    ctrl('v')
    top = next(n for n in rca()['nodes'] if n['title'] == primary_title and n['id'] != rca()['problem']['primaryEffectId'])
    assert top['kind'] == 'cause' and len(rca()['nodes']) == 2 * len(before_copy['nodes'])
    check_layout()
    click('undo')
    assert rca() == before_copy

    # Into another RCA: the evidence it cited there is left out.
    select(copied)
    ctrl('c')
    click('newProject')
    b.js("document.querySelector('#dialog [data-choice=apollo]').click();return true")
    select(rca()['nodes'][0]['title'])
    ctrl('v')
    other = rca()
    assert len(other['nodes']) == 1 + branch_size and all(n['evidenceIds'] == [] for n in other['nodes'])
    assert 'left out' in status(), status()

    # The clipboard can hold anything: unknown fields, loops, and links to nodes not in it are dropped.
    bad = {'type': 'causeway-branch', 'rcaId': 'x', 'rootId': 'a', 'nodes': [
        {'id': 'a', 'kind': 'action', 'title': 'Pasted A', 'stopPoint': {'reason': 'nonsense'}, 'offsetY': 'far', 'evil': 1},
        {'id': 'b', 'kind': 'weird', 'title': 7, 'status': 'gone'}, {'id': 'c', 'kind': 'condition', 'title': 'Unreached'}],
        'links': [{'effectId': 'a', 'causeId': 'b'}, {'effectId': 'b', 'causeId': 'a'}, {'effectId': 'a', 'causeId': 'zz'}]}
    select(rca()['nodes'][0]['title'])
    # Put on the real clipboard by a copy the page does not see; a paste event made by a script has no data.
    b.js("""window.addEventListener('copy',e=>{e.stopImmediatePropagation();e.preventDefault();
        const u=document.createElement('ul');u.dataset.causewayBranch=arguments[0];u.innerHTML='<li>Pasted A</li>';
        e.clipboardData.setData('text/html',u.outerHTML);e.clipboardData.setData('text/plain','other text')},{capture:true,once:true});return true""", [json.dumps(bad)])
    ctrl('c')
    ctrl('v')
    added = [n for n in rca()['nodes'] if n['id'] not in {x['id'] for x in other['nodes']}]
    assert sorted(n['title'] for n in added) == ['', 'Pasted A'], added
    a = next(n for n in added if n['title'] == 'Pasted A')
    assert a['stopPoint'] is None and a['offsetY'] == 0 and 'evil' not in a
    assert next(n for n in added if n['title'] == '')['kind'] == 'cause'
    check_layout()
    load(before_copy)
    print('PASS: copy, cut, and paste branches, within an RCA and into another', flush=True)

    # ---- Deleting ----
    solutions_before = sum(len(s['causeIds']) for s in rca()['solutions'])
    select('Plan 11 flush flow dropped to near zero')
    b.js('__dialogs.length=0;return true')
    click('deleteNode')
    assert len(b.js('return __dialogs')) == 1 and '4 causes' in b.js('return __dialogs[0]'), 'asks before deleting a branch'
    assert len(rca()['nodes']) == 12
    titles = {n['title'] for n in rca()['nodes']}
    assert not titles & {'Solids entered the flush line', '3 mm orifice, no strainer or cyclone', 'Filter bypass opened during process upset'}
    assert sum(len(s['causeIds']) for s in rca()['solutions']) == solutions_before - 5, 'solutions lose the deleted causes'
    click('undo')
    assert rca() == before
    select('Pump ran at minimum flow for 3 h')
    b.js('__dialogs.length=0;return true')
    click('deleteNode')
    assert b.js('return __dialogs.length') == 0, 'a cause without causes is deleted without asking'
    assert len(rca()['nodes']) == 16
    select('High seal leakage, 15 ml/min (limit under 1 ml/min)')
    assert b.js("return document.getElementById('deleteNode').disabled"), 'the primary effect cannot be deleted'
    print('PASS: delete a cause and its branch, with confirmation', flush=True)

    # ---- RCA records ----
    def page(name):
        b.js('document.querySelector(`.rail [data-record="${arguments[0]}"]`).click();return true', [name])

    def set_field(lst, row, path, value):
        b.js('''const el=document.querySelector(`#records [data-list="${arguments[0]}"]${arguments[1]?`[data-id="${arguments[1]}"]`:''}[data-field="${arguments[2]}"]`);
            el.focus();el.value=arguments[3];el.dispatchEvent(new Event("input",{bubbles:true}));return true''', [lst, row, path, value])

    def act(name, row=None, **data):
        sel = f'#records button[data-act="{name}"]' + (f'[data-id="{row}"]' if row else '') + ''.join(f'[data-{k}="{v}"]' for k, v in data.items())
        b.js('document.querySelector(arguments[0]).click();return true', [sel])

    def pick(name, row, value):
        b.js('''const el=document.querySelector(`#records select[data-act="${arguments[0]}"][data-id="${arguments[1]}"]`);
            el.value=arguments[2];el.dispatchEvent(new Event("change",{bubbles:true}));return true''', [name, row, value])

    def focused():
        return b.js("const a=document.activeElement;return a?[a.dataset.list,a.dataset.id,a.dataset.field]:null")

    before_records = rca()
    primary = rca()['problem']['primaryEffectId']

    # Problem definition: the "what" is the primary effect's title.
    page('problem')
    assert b.js("return getComputedStyle(document.getElementById('chart')).display") == 'none' or b.js("return getComputedStyle(document.querySelector('main')).display") == 'none'
    set_field('node', primary, 'title', 'High seal leakage, 16 ml/min')
    assert next(n for n in rca()['nodes'] if n['id'] == primary)['title'] == 'High seal leakage, 16 ml/min'
    assert b.js("return document.getElementById('sheetTitle').textContent") == 'High seal leakage, 16 ml/min'
    set_field('problem', None, 'significance.safety', 'Flammable leak')
    assert rca()['problem']['significance']['safety'] == 'Flammable leak'
    click('undo'); click('undo')
    assert rca() == before_records, 'record edits undo'
    print('PASS: problem definition, synced with the primary effect', flush=True)

    # Team and dates.
    page('team')
    act('add-member')
    member = rca()['meta']['team'][-1]['id']
    assert focused() == ['team', member, 'name'], 'a new member is ready to be named'
    set_field('team', member, 'name', 'A. Tester')
    b.js('document.querySelector(`#records input[data-act="lead"][data-id="${arguments[0]}"]`).click();return true', [member])
    assert rca()['meta']['leadId'] == member
    set_field('meta', None, 'dates.closed', '2026-10-30')
    assert rca()['meta']['dates']['closed'] == '2026-10-30'
    act('delete-member', member)
    assert rca()['meta']['leadId'] == '' and len(rca()['meta']['team']) == 4, 'removing the lead clears the lead'
    page('evidence')
    assert b.js("return [...document.querySelectorAll('#teamNames option')].map(o=>o.value).length") == 4, 'team names are offered'
    print('PASS: team and dates', flush=True)

    # Evidence log: codes are never reused; deleting removes citations; Show highlights on the chart.
    act('add-evidence')
    e11 = rca()['evidence'][-1]
    assert e11['code'] == 'E11' and focused() == ['evidence', e11['id'], 'description']
    set_field('evidence', e11['id'], 'type', 'inferred')
    assert rca()['evidence'][-1]['type'] == 'inferred'
    b.js('__dialogs.length=0;return true')
    act('delete-evidence', e11['id'])
    assert b.js('return __dialogs.length') == 0, 'an uncited item is deleted without asking'
    act('add-evidence')
    assert rca()['evidence'][-1]['code'] == 'E12', 'a deleted code is not reused'
    e3 = next(e['id'] for e in rca()['evidence'] if e['code'] == 'E3')
    act('delete-evidence', e3)
    assert 'cited 2 times' in b.js('return __dialogs[0]')
    assert not any(e3 in n['evidenceIds'] for n in rca()['nodes']) and not any(e['id'] == e3 for e in rca()['evidence'])
    click('undo')
    assert any(e3 in n['evidenceIds'] for n in rca()['nodes']), 'undo restores the evidence and its citations'
    e4 = next(e['id'] for e in rca()['evidence'] if e['code'] == 'E4')
    act('show-evidence', e4)
    assert b.js("return getComputedStyle(document.querySelector('main')).display") != 'none', 'Show goes to the chart'
    assert not b.js("return document.getElementById('evidenceBanner').hidden")
    lit = b.js("return document.querySelectorAll('#chart rect[stroke=\"#e0a100\"]').length")
    assert lit == 3, f'the three nodes citing E4 are outlined, got {lit}'
    assert b.js("return document.querySelectorAll('#chart .node[opacity]').length") == len(boxes()) - 3, 'the others are faded'
    key('Escape')
    assert b.js("return document.getElementById('evidenceBanner').hidden") and b.js("return document.querySelectorAll('#chart .node[opacity]').length") == 0
    select('Seal chamber temperature rose 18 °C')
    b.js("document.querySelector('#properties [data-highlight]').click();return true")
    assert not b.js("return document.getElementById('evidenceBanner').hidden"), 'a code in the Properties panel highlights too'
    key('Escape')
    print('PASS: evidence log, code numbering, deleting, and highlighting on the chart', flush=True)

    # Causes ruled out: from the chart, and edited in the list.
    heat = 'Heat input from face friction and pump'
    ruled_before = len(rca()['ruledOut'])
    select('Seal relies on a stable liquid film')
    click('inspRuleOut')
    moved = rca()['ruledOut'][-1]
    assert len(rca()['ruledOut']) == ruled_before + 1 and moved['cause'] == 'Seal relies on a stable liquid film' and moved['kind'] == 'condition'
    assert not any(n['title'] == 'Seal relies on a stable liquid film' for n in rca()['nodes']), 'the cause leaves the chart'
    click('undo')
    assert any(n['title'] == 'Seal relies on a stable liquid film' for n in rca()['nodes'])
    page('ruledOut')
    act('add-ruled')
    r = rca()['ruledOut'][-1]['id']
    set_field('ruledOut', r, 'cause', 'Wrong spring compression')
    pick('ruled-add-evidence', r, e4)
    assert rca()['ruledOut'][-1]['evidenceIds'] == [e4]
    act('ruled-remove-evidence', r, evidence=e4)
    assert rca()['ruledOut'][-1]['evidenceIds'] == []
    print('PASS: causes ruled out', flush=True)

    # Solutions: started from a cause, the four criteria, the decision, and an action from the solution.
    page('chart')
    select('Seal relies on a stable liquid film')
    click('inspAddSolution')
    sol = rca()['solutions'][-1]
    assert sol['causeIds'] == [node_id('Seal relies on a stable liquid film')] and focused() == ['solutions', sol['id'], 'title']
    set_field('solutions', sol['id'], 'title', 'Monitor film with a temperature probe')
    act('criterion', sol['id'], key='preventsRecurrence', v='partly')
    assert rca()['solutions'][-1]['criteria']['preventsRecurrence']['v'] == 'partly'
    act('criterion', sol['id'], key='preventsRecurrence', v='partly')
    assert rca()['solutions'][-1]['criteria']['preventsRecurrence']['v'] == '', 'clicking the chosen value clears it'
    set_field('solutions', sol['id'], 'criteria.meetsGoals.c', 'Cheap')
    act('decision', sol['id'], v='study')
    assert rca()['solutions'][-1]['decision'] == 'study'
    pick('solution-add-cause', sol['id'], node_id(heat))
    assert len(rca()['solutions'][-1]['causeIds']) == 2
    act('add-action-for', sol['id'])
    action = rca()['actions'][-1]
    assert action['solutionId'] == sol['id'] and focused() == ['actions', action['id'], 'action'], 'the action plan opens on the new action'
    print('PASS: solutions and their criteria', flush=True)

    # Action plan: overdue actions are marked until done.
    set_field('actions', action['id'], 'due', '2020-01-01')
    assert b.js("return document.querySelectorAll('#records td.overdue').length") == 1
    set_field('actions', action['id'], 'status', 'implemented')
    assert b.js("return document.querySelectorAll('#records td.overdue').length") == 0
    key('Insert')
    assert len(rca()['nodes']) == len(before_records['nodes']), 'chart keys do nothing on a record page'
    page('solutions')
    b.js('__dialogs.length=0;return true')
    act('delete-solution', sol['id'])
    assert len(b.js('return __dialogs')) == 1 and rca()['actions'][-1]['solutionId'] == '', 'deleting a solution keeps its actions'
    page('chart')
    print('PASS: action plan', flush=True)

    # 5 Whys: chains of why-steps, each of which can be added to the chart.
    page('whys')
    chains = rca()['fiveWhys']
    assert len(chains) == 2 and len(chains[0]['steps']) == 6 and all(x['nodeId'] for x in chains[0]['steps']), 'the example has a chain on the chart'
    assert b.js("return document.querySelectorAll('#records .why').length") == 8
    first = chains[0]['steps'][0]
    set_field('node', first['nodeId'], 'title', 'Leak path opened across the primary faces')
    assert next(n for n in rca()['nodes'] if n['id'] == first['nodeId'])['title'] == 'Leak path opened across the primary faces', 'a step on the chart is its node'
    act('add-chain')
    chain = rca()['fiveWhys'][-1]
    assert chain['effectId'] == primary and focused() == ['whySteps', chain['steps'][0]['id'], 'answer'], 'a new chain starts from the primary effect, ready to type'
    set_field('whySteps', chain['steps'][0]['id'], 'answer', 'Seal faces opened')
    b.js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));return true')
    chain = rca()['fiveWhys'][-1]
    assert len(chain['steps']) == 2 and focused() == ['whySteps', chain['steps'][1]['id'], 'answer'], 'Enter adds the next why'
    second = chain['steps'][1]['id']
    set_field('whySteps', second, 'answer', 'Spring force too low')
    act('step-kind', second, v='action')
    pick('step-add-evidence', second, e4)
    assert b.js('return document.querySelector(`#records button[data-act="step-to-chart"][data-id="${arguments[0]}"]`).disabled', [second]), 'a step waits for the one before it'
    nodes_before = len(rca()['nodes'])
    act('chain-to-chart', chain['id'])
    chain = rca()['fiveWhys'][-1]
    one, two = (next(n for n in rca()['nodes'] if n['id'] == x['nodeId']) for x in chain['steps'])
    assert len(rca()['nodes']) == nodes_before + 2 and one['title'] == 'Seal faces opened' and two['title'] == 'Spring force too low'
    assert two['kind'] == 'action' and two['evidenceIds'] == [e4], 'type and evidence go to the chart'
    links = {(l['effectId'], l['causeId']) for l in rca()['links']}
    assert (primary, one['id']) in links and (one['id'], two['id']) in links, 'each step is a cause of the one before'
    page('chart')
    select('Spring force too low')
    b.js('__dialogs.length=0;return true')
    click('deleteNode')
    page('whys')
    kept = rca()['fiveWhys'][-1]['steps'][1]
    assert kept['nodeId'] is None and kept['answer'] == 'Spring force too low' and kept['kind'] == 'action' and kept['evidenceIds'] == [e4], 'a step keeps its words when its node is deleted'
    act('step-to-chart', kept['id'])
    assert rca()['fiveWhys'][-1]['steps'][1]['nodeId'], 'a step can be added again'
    b.js('__dialogs.length=0;return true')
    act('delete-chain', chain['id'])
    assert len(b.js('return __dialogs')) == 1 and len(rca()['fiveWhys']) == 2 and len(rca()['nodes']) == nodes_before + 2, 'deleting a chain keeps its nodes on the chart'
    print('PASS: 5 Whys, and adding the steps to the chart', flush=True)

    # Fishbone: possible causes sorted into categories, each added to the chart or ruled out.
    def fish_causes(f=-1):
        return [c for g in rca()['fishbones'][f]['categories'] for c in g['causes']]

    def fish_cause(cid):
        return next(c for f in rca()['fishbones'] for g in f['categories'] for c in g['causes'] if c['id'] == cid)

    page('fishbone')
    fb = rca()['fishbones']
    assert len(fb) == 1 and [g['name'] for g in fb[0]['categories']][:2] == ['Seal and materials', 'Installation']
    example = fish_causes(0)
    assert len(example) == 16 and sum(bool(c['nodeId']) for c in example) == 7 and sum(bool(c['ruledOutId']) for c in example) == 5, 'the example has causes on the chart, ruled out, and to test'
    assert b.js("return document.querySelectorAll('#records .fish-figure .fish-row').length") == 16
    assert b.js("return document.querySelectorAll('#records .fish-figure .fish-cat').length") == 6
    to_test = next(c for c in example if not c['nodeId'] and not c['ruledOutId'])
    b.js('document.querySelector(`#records .fish-row[data-fish="${arguments[0]}"] rect`).dispatchEvent(new MouseEvent("click",{bubbles:true}));return true', [to_test['id']])
    assert focused() == ['fishCauses', to_test['id'], 'text'], 'clicking a cause in the diagram edits it'
    assert b.js('return document.querySelector(`#records .fish-row[data-fish="${arguments[0]}"] rect`).getAttribute("fill-opacity")', [to_test['id']]) == '0.28', 'the cause being edited is lit'

    b.js('__downloads.length=0;return true')
    act('fish-export', fb[0]['id'], v='svg')
    fish_svg = b.async_js('const done=arguments[arguments.length-1];__downloads.at(-1).text().then(done)')
    assert b.js('return new DOMParser().parseFromString(arguments[0],"image/svg+xml").querySelectorAll(".fish-row").length', [fish_svg]) == 16
    assert not re.search(r'href|url\(|<style|https?:', fish_svg.replace('xmlns="http://www.w3.org/2000/svg"', '')), 'the fishbone SVG references nothing outside itself'
    b.js('const s=document.getElementById("fishPreset");s.value="6m";s.dispatchEvent(new Event("change",{bubbles:true}));return true')
    act('add-fishbone')
    f = rca()['fishbones'][-1]
    assert f['effectId'] == primary and [g['name'] for g in f['categories']] == ['People', 'Method', 'Machine', 'Material', 'Measurement', 'Environment']
    people = f['categories'][0]['id']
    act('add-fish-cause', people)
    first = fish_causes()[0]['id']
    assert focused() == ['fishCauses', first, 'text'], 'a new cause is ready to type'
    set_field('fishCauses', first, 'text', 'Operator not trained on Plan 11')
    assert 'Operator not trained' in b.js('return document.querySelectorAll("#records .fish-figure")[1].textContent'), 'the diagram follows the typing'
    b.js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));return true')
    second = fish_causes()[1]['id']
    assert focused() == ['fishCauses', second, 'text'], 'Enter adds the next cause'
    set_field('fishCauses', second, 'text', 'Shift handover missed the upset')
    act('add-fish-sub', first)
    sub = next(c for c in fish_causes() if c['parentId'] == first)['id']
    set_field('fishCauses', sub, 'text', 'No training plan for new seal types')
    assert b.js('return document.querySelector(`#records button[data-act="fish-to-chart"][data-id="${arguments[0]}"]`).disabled', [sub]), 'a sub-cause waits for its cause'
    act('fish-kind', first, v='action')
    pick('fish-add-evidence', first, e4)
    nodes_before = len(rca()['nodes'])
    act('fish-to-chart', first)
    act('fish-to-chart', sub)
    one, two = (next(n for n in rca()['nodes'] if n['id'] == fish_cause(x)['nodeId']) for x in (first, sub))
    assert len(rca()['nodes']) == nodes_before + 2 and one['title'] == 'Operator not trained on Plan 11' and one['kind'] == 'action' and one['evidenceIds'] == [e4]
    links = {(l['effectId'], l['causeId']) for l in rca()['links']}
    assert (primary, one['id']) in links and (one['id'], two['id']) in links, 'a cause goes under the effect, a sub-cause under its cause'
    set_field('node', one['id'], 'title', 'Operator not trained on API Plan 11')
    assert next(n for n in rca()['nodes'] if n['id'] == one['id'])['title'] == 'Operator not trained on API Plan 11', 'a cause on the chart is its node'

    ruled_before = len(rca()['ruledOut'])
    act('fish-rule-out', second)
    r = rca()['ruledOut'][-1]
    assert len(rca()['ruledOut']) == ruled_before + 1 and r['cause'] == 'Shift handover missed the upset' and fish_cause(second)['ruledOutId'] == r['id']
    assert 'ruled out' in b.js('return document.querySelectorAll("#records .fish-tally")[1].textContent')
    act('fish-restore', second)
    assert len(rca()['ruledOut']) == ruled_before and fish_cause(second)['ruledOutId'] is None and fish_cause(second)['text'] == 'Shift handover missed the upset', 'restore takes it back'
    act('fish-rule-out', second)
    r = rca()['ruledOut'][-1]
    page('ruledOut')
    act('delete-ruled', r['id'])
    assert fish_cause(second)['ruledOutId'] is None and fish_cause(second)['text'] == 'Shift handover missed the upset', 'deleting the ruled-out record keeps the cause'

    page('chart')
    select('Operator not trained on API Plan 11')
    b.js('__dialogs.length=0;return true')
    click('deleteNode')
    assert fish_cause(first)['nodeId'] is None and fish_cause(first)['text'] == 'Operator not trained on API Plan 11' and fish_cause(first)['evidenceIds'] == [e4]
    assert fish_cause(sub)['nodeId'] is None and fish_cause(sub)['text'] == 'No training plan for new seal types', 'causes keep their words when their nodes are deleted'
    bypass = next(c for c in example if c['nodeId'] == node_id('Filter bypass opened during process upset'))['id']
    select('Filter bypass opened during process upset')
    click('inspRuleOut')
    assert fish_cause(bypass)['nodeId'] is None and fish_cause(bypass)['ruledOutId'] == rca()['ruledOut'][-1]['id'], 'ruling out on the chart rules out the fishbone cause'

    page('fishbone')
    b.js('__dialogs.length=0;return true')
    act('delete-fishbone', rca()['fishbones'][-1]['id'])
    assert len(b.js('return __dialogs')) == 1 and len(rca()['fishbones']) == 1
    print('PASS: fishbone, and testing its causes', flush=True)

    # Every record edit is in the undo history.
    for _ in range(100):
        if b.js('return document.getElementById("undo").disabled'):
            break
        click('undo')
        if rca() == before_records:
            break
    assert rca() == before_records, 'undo returns to the RCA before the record edits'
    print('PASS: record edits undo', flush=True)

    # ---- Sequence of events ----
    before_timeline = rca()
    page('timeline')
    assert b.js("return document.getElementById('railTimeline').textContent") == '1'
    example_events = [ev for ph in rca()['timelines'][0]['phases'] for ev in ph['events']]
    assert len(example_events) == 10 and b.js("return document.querySelectorAll('#records .tl-row').length") == 10
    assert b.js("return document.querySelectorAll('#records .tl-phase').length") == 4
    assert 'Add 2 deviations to chart' in b.js("return document.querySelector('#records .tl-tally').textContent")

    b.js("const s=document.getElementById('timelinePreset');s.value='test';s.dispatchEvent(new Event('change',{bubbles:true}));return true")
    act('add-timeline')
    t = rca()['timelines'][-1]
    assert [ph['name'] for ph in t['phases']] == ['Pre-test work', 'Testing', 'Post-test work', 'Report'], 'the test-run phases'
    assert t['effectId'] == rca()['problem']['primaryEffectId']
    testing = t['phases'][1]['id']

    def timeline():
        return next(x for x in rca()['timelines'] if x['id'] == t['id'])

    def events(phase=testing):
        return next(ph for ph in timeline()['phases'] if ph['id'] == phase)['events']

    def figure_rows():
        """The events of the new timeline's figure, from the top, with the kind of mark each has."""
        return b.js("""return [...document.querySelectorAll(`#records .tl-figure[data-timeline="${arguments[0]}"] .tl-row`)].map(g=>
            [g.dataset.event, g.querySelector('rect:not(:first-child)')?'bar':g.querySelector('path')?'moment':'none'])""", [t['id']])

    act('add-event', testing)
    first = events()[0]['id']
    assert b.js("return document.activeElement.dataset.event") == first, 'a new event is ready to name'
    set_field('events', first, 'text', 'Ramped to duty pressure, 40 bar')
    set_field('events', first, 'start', '2026-10-20T10:00')
    set_field('events', first, 'end', '2026-10-20T10:30')
    # Enter adds the next event, starting where this one ended.
    b.js("const f=document.querySelector(`#records textarea[data-event='${arguments[0]}']`);f.focus();f.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return true", [first])
    second = events()[1]['id']
    assert events()[1]['start'] == '2026-10-20T10:30' and b.js("return document.activeElement.dataset.event") == second
    set_field('events', second, 'text', 'Leakage rose to 12 ml/min')
    # An event earlier in time is drawn above, whatever order it was added in.
    act('add-event', testing)
    third = events()[2]['id']
    set_field('events', third, 'text', 'Seal chamber filled and vented')
    set_field('events', third, 'start', '2026-10-20T09:40')
    page('timeline')
    assert figure_rows() == [[third, 'moment'], [first, 'bar'], [second, 'moment']], figure_rows()
    # An end before the start is flagged, and drawn as a moment.
    set_field('events', third, 'end', '2026-10-20T09:00')
    page('timeline')
    assert 'ends before it starts' in b.js("return document.querySelector('#records .tl-warn').textContent") and figure_rows()[0][1] == 'moment'
    set_field('events', third, 'end', '')

    # Deviations go to the chart under the timeline's effect; on the chart, an event is its node.
    act('event-deviation', second)
    act('event-kind', second, v='condition')
    e3 = rca()['evidence'][2]['id']
    pick('event-add-evidence', second, e3)
    nodes_before = len(rca()['nodes'])
    act('deviations-to-chart', t['id'])
    node = next(n for n in rca()['nodes'] if n['id'] == events()[1]['nodeId'])
    assert len(rca()['nodes']) == nodes_before + 1 and node['title'] == 'Leakage rose to 12 ml/min' and node['kind'] == 'condition' and node['evidenceIds'] == [e3]
    assert {'effectId': t['effectId'], 'causeId': node['id']} in [{k: v for k, v in l.items() if k != 'id'} for l in rca()['links']]
    set_field('node', node['id'], 'title', 'Leakage rose to 12 ml/min at 10:40')
    assert next(n for n in rca()['nodes'] if n['id'] == node['id'])['title'] == 'Leakage rose to 12 ml/min at 10:40', 'an event on the chart is its node'
    act('event-to-chart', first)
    assert events()[0]['nodeId'] and len(rca()['nodes']) == nodes_before + 2

    # Deleting the node keeps the event, with its words; deleting evidence removes its citation.
    page('chart')
    select('Leakage rose to 12 ml/min at 10:40')
    click('deleteNode')
    assert events()[1]['nodeId'] is None and events()[1]['text'] == 'Leakage rose to 12 ml/min at 10:40' and events()[1]['evidenceIds'] == [e3]
    page('evidence')
    b.js('__dialogs.length=0;return true')
    act('delete-evidence', e3)
    assert events()[1]['evidenceIds'] == [], 'deleting evidence removes it from events'
    click('undo')

    # Phases: add, rename, remove.
    page('timeline')
    act('add-phase', t['id'])
    new_phase = timeline()['phases'][-1]['id']
    set_field('phases', new_phase, 'name', 'Teardown')
    assert timeline()['phases'][-1]['name'] == 'Teardown'
    act('delete-phase', new_phase)
    assert len(timeline()['phases']) == 4

    # Export, the report, and the file.
    b.js('__downloads.length=0;return true')
    act('timeline-export', t['id'], v='svg')
    exported = b.async_js('const done=arguments[arguments.length-1];__downloads.at(-1).text().then(done)')
    assert exported.startswith('<?xml') and '<title>Sequence of events: ' in exported and 'Ramped to duty pressure' in exported
    b.js("window.print=()=>{};return true")
    click('printReport'); click('printFull')
    report = b.js("return document.getElementById('report').textContent")
    assert 'Sequence of events' in report and 'Ramped to duty pressure, 40 bar' in report and '2026-10-20 10:00 to 2026-10-20 10:30' in report
    data = rca()
    broken = json.loads(json.dumps(data))
    ev = broken['timelines'][-1]['phases'][1]['events'][0]
    ev.update(start='yesterday', end=5, kind='other', deviation='yes', nodeId='missing')
    broken['timelines'][-1]['effectId'] = 'missing'
    load(broken)
    ev = rca()['timelines'][-1]['phases'][1]['events'][0]
    assert ev['start'] == '' and ev['end'] == '' and ev['kind'] == 'action' and ev['deviation'] is False and ev['nodeId'] is None
    assert rca()['timelines'][-1]['effectId'] == rca()['problem']['primaryEffectId'], 'odd values in a file are checked'

    page('timeline')
    b.js('__dialogs.length=0;return true')
    act('delete-timeline', rca()['timelines'][-1]['id'])
    assert len(b.js('return __dialogs')) == 1 and len(rca()['timelines']) == 1
    load(before_timeline)
    page('chart')
    print('PASS: sequence of events: phases, events in time order, deviations to the chart, export, report, and files', flush=True)

    # ---- Failed vs good ----
    before_compare = rca()
    page('compare')
    c = rca()['comparison']
    assert [x['name'] for x in c['cases']] == ['P-101A', 'P-101B', 'P-103A'] and len(c['rows']) == 18
    assert b.js("return document.getElementById('railCompare').textContent") == '9', 'the rail counts the differences'
    assert b.js("return document.querySelectorAll('#records table.cmp tbody tr:not(.spec-dim)').length") == 18
    b.js("document.getElementById('compareOnly').click();return true")
    assert b.js("return document.querySelectorAll('#records table.cmp tr.cmp-diff').length") == 9
    assert '3 factors the same, hidden' in b.js("return document.querySelector('#records table.cmp').textContent")
    b.js("document.getElementById('compareOnly').click();return true")
    outcome = b.js("return [...document.querySelectorAll('#records .cmp-outcome section')].map(s=>s.querySelectorAll('li').length)")
    assert outcome == [7, 8, 1], outcome
    # A row from the equipment record shows and edits that field.
    set_field('equipment', '', 'flushFlow', 'Near zero when found')
    assert rca()['equipment']['flushFlow'] == 'Near zero when found'
    # It is optional: an empty comparison raises no issue and leaves no section in the reports.
    empty = rca()
    empty['comparison'] = {'cases': [], 'rows': []}
    empty['equipment'] = {'machine': 'Centrifugal pump', 'faces': 'Carbon against SiC', 'runout': '0.03 mm', 'installed': '2025-07-02'}
    load(empty)
    page('compare')
    assert b.js("return document.getElementById('railCompare').textContent") == '0'
    click('issuesButton')
    assert not b.js("return [...document.querySelectorAll('#issuesList button')].some(x=>x.dataset.record==='compare'||/failed vs good|good case/i.test(x.textContent))"), 'nothing asks for it'
    click('issuesButton')
    b.js("window.dispatchEvent(new Event('beforeprint'));return true")
    assert 'Failed vs good' not in b.js("return document.getElementById('report').textContent")
    # Starting takes the filled fields of the first four sections, and names the failed case.
    act('compare-start')
    c = rca()['comparison']
    assert [(r['cat'], r['factor'], r['field']) for r in c['rows']] == [('Machine and seal', 'Machine', 'machine'), ('Machine and seal', 'Face materials', 'faces'),
        ('Mechanical condition', 'Shaft runout', 'runout')], c['rows']
    assert c['cases'][0]['name'] == 'P-101A' and len(c['cases']) == 3
    assert not b.js("return document.querySelector('#records [data-act=compare-start]')"), 'no fields left to bring in'
    page('equipment'); set_field('equipment', '', 'product', 'Light naphtha'); page('compare')
    act('compare-start')
    assert [r['field'] for r in rca()['comparison']['rows']] == ['machine', 'faces', 'product', 'runout'], 'a field filled since goes under its section'
    # A factor of our own: it differs, explains it, and goes to the chart, the timeline, and the Is / Is Not.
    act('compare-add-row', v='Seal support system')
    row = rca()['comparison']['rows'][-2]
    assert row['cat'] == 'Seal support system' and focused() == ['cmpRows', row['id'], 'factor']
    rid = row['id']
    for path, value in [('factor', 'Filter upstream of the flush'), ('failed', 'Bypassed for 40 min'), ('good.0', 'Never bypassed'), ('good.1', 'Never bypassed')]:
        set_field('cmpRows', rid, path, value)
    set_field('cmpRows', rid, 'differs', 'differs')
    set_field('cmpRows', rid, 'explains', 'yes')
    row = next(r for r in rca()['comparison']['rows'] if r['id'] == rid)
    assert row['good'] == ['Never bypassed', 'Never bypassed'] and row['differs'] == 'differs' and row['explains'] == 'yes'
    assert b.js("return document.getElementById('railCompare').textContent") == '1'
    e5 = next(e['id'] for e in rca()['evidence'] if e['code'] == 'E5')
    pick('compare-add-evidence', rid, e5)
    act('compare-to-chart', rid)
    row = next(r for r in rca()['comparison']['rows'] if r['id'] == rid)
    node = next(n for n in rca()['nodes'] if n['id'] == row['nodeId'])
    assert node['title'] == 'Filter upstream of the flush: Bypassed for 40 min' and node['evidenceIds'] == [e5]
    assert any(l['causeId'] == node['id'] and l['effectId'] == rca()['problem']['primaryEffectId'] for l in rca()['links'])
    set_field('cmpRows', rid, 'when', '2026-09-12 14:05')
    phase = rca()['timelines'][0]['phases'][0]
    pick('compare-to-timeline', rid, phase['id'])
    row = next(r for r in rca()['comparison']['rows'] if r['id'] == rid)
    ev = next(x for x in rca()['timelines'][0]['phases'][0]['events'] if x['id'] == row['eventId'])
    assert ev['start'] == '2026-09-12T14:05' and ev['deviation'] is True and ev['text'] == 'Filter upstream of the flush: Bypassed for 40 min' and ev['evidenceIds'] == [e5]
    assert '2026-09-12 14:05' in b.js("return document.querySelector('#records .cmp-event').textContent")
    act('compare-unlink-event', rid)
    assert next(r for r in rca()['comparison']['rows'] if r['id'] == rid)['eventId'] == '' and any(x['id'] == ev['id'] for x in rca()['timelines'][0]['phases'][0]['events']), 'unlinking keeps the event'
    pick('compare-link-event', rid, ev['id'])
    spec_row = rca()['specification']['rows'][0]
    pick('compare-to-spec', rid, spec_row['id'])
    spec_row = rca()['specification']['rows'][0]
    assert spec_row['change'].endswith('Filter upstream of the flush: Bypassed for 40 min (good cases: Never bypassed; Never bypassed)'), 'with a time, it is a change'
    assert 'In Is / Is Not, What 1' in b.js("return [...document.querySelectorAll('#records .cmp-goes')].map(x=>x.textContent).join()")
    # The reports show the differences only, with the note; the full report and the 8D's D4.
    set_field('cmpRows', rca()['comparison']['rows'][0]['id'], 'differs', 'same')
    b.js("document.getElementById('printFull').click();return true")
    section = b.js('''const s=[...document.querySelectorAll('#report section')].find(x=>x.querySelector('h2')?.textContent==='Failed vs good');
        return s&&{rows:[...s.querySelectorAll('tbody tr')].map(r=>r.cells[0].textContent),note:s.querySelector('.r-legend').textContent,text:s.textContent}''')
    assert section['rows'] == ['Filter upstream of the flush'] and 'factors that match are hidden' in section['note'] and 'Machine' not in section['rows']
    b.js("document.getElementById('print8d').click();return true")
    d4 = b.js("return [...document.querySelectorAll('#report section')].find(x=>x.querySelector('.r-dnum')?.textContent==='D4').textContent")
    assert 'Failed vs good' in d4 and 'Filter upstream of the flush' in d4 and 'factors that match are hidden' in d4
    b.js("document.getElementById('printFull').click();return true")
    # Deleting its node, evidence, or event leaves the row; a file with odd values is checked.
    node_id_cmp = row['nodeId']
    saved_cmp = rca()
    broken = json.loads(json.dumps(saved_cmp))
    broken['comparison']['cases'] = [{'name': 5}, 'x']
    broken['comparison']['rows'].append({'id': 'r1', 'cat': 'Elsewhere', 'field': 'nonsense', 'good': 'x', 'differs': 'maybe', 'explains': 2,
        'eventId': 'missing', 'nodeId': 'missing', 'specRowId': 'missing', 'evidenceIds': 'E1'})
    load(broken)
    c = rca()['comparison']
    assert [x['name'] for x in c['cases']] == ['', '', ''] and len(c['cases']) == 3
    r1 = c['rows'][-1]
    assert r1 == {'id': 'r1', 'cat': 'Operation and changes', 'factor': '', 'field': '', 'failed': '', 'good': ['', ''], 'differs': '', 'explains': '',
        'evidenceIds': [], 'eventId': '', 'when': '', 'nodeId': None, 'specRowId': ''}, r1
    load(saved_cmp)
    page('chart'); select('Filter upstream of the flush: Bypassed for 40 min'); b.js("document.getElementById('deleteNode').click();return true")
    row = next(r for r in rca()['comparison']['rows'] if r['id'] == rid)
    assert row['nodeId'] is None and row['factor'] == 'Filter upstream of the flush', 'the row stays when its node goes'
    load(before_compare)
    page('chart')
    print('PASS: failed vs good: optional, starts from the equipment record, differences to the chart, timeline, and Is / Is Not, reports, and files', flush=True)

    # ---- Files ----
    b.js('__downloads.length=0;return true')
    click('saveProject')
    text = b.async_js('const done=arguments[arguments.length-1];__downloads.at(-1).text().then(done)')
    saved_file = json.loads(text)
    assert saved_file['type'] == 'causeway' and saved_file['schemaVersion'] == 1
    assert saved()['dirty'] is False, 'saving clears the unsaved-changes flag'

    click('newProject')
    assert b.js('return document.getElementById("dialog").open'), 'New asks for the chart style'
    b.js('document.querySelector("#dialog [data-choice=apollo]").click();return true')
    assert len(rca()['nodes']) == 1 and rca()['meta']['style'] == 'apollo'
    load(saved_file)
    reopened = rca()
    reopened.pop('view', None)
    expected = dict(saved_file)
    expected.pop('view', None)
    assert reopened == expected, 'a saved file opens unchanged'
    print('PASS: save and open round trip', flush=True)

    # A hand-edited file with a shared cause and a loop: the loop link is dropped, the shared cause drawn once.
    shared = json.loads(text)
    ids = {n['title']: n['id'] for n in shared['nodes']}
    shared['links'].append({'id': 'x1', 'effectId': ids['Fluid film flashed to vapour (intermittent dry running)'], 'causeId': ids['3 mm orifice, no strainer or cyclone']})
    shared['links'].append({'id': 'x2', 'effectId': ids['Solids entered the flush line'], 'causeId': ids['Plan 11 flush flow dropped to near zero']})
    load(shared)
    links = {l['id'] for l in rca()['links']}
    assert 'x1' in links and 'x2' not in links, 'the shared link is kept, the loop is dropped'
    assert len(boxes()) == 16 and b.js("return document.querySelectorAll('#chart path[stroke-dasharray]').length") == 1
    check_layout()
    print('PASS: shared causes and loop protection when opening a file', flush=True)

    b.js('__dialogs.length=0;return true')
    load({'type': 'something-else', 'nodes': []})
    assert 'not a Causeway RCA file' in b.js('return __dialogs[0]')
    load({**saved_file, 'schemaVersion': 99})
    assert 'newer' in b.js('return __dialogs[1]')
    assert len(rca()['nodes']) == 16, 'a rejected file leaves the RCA as it was'
    print('PASS: invalid files are refused', flush=True)

    # XMind mind maps open as new cause trees: XMind 8 (content.xml) and XMind 2020 and later (content.json).
    import io, zipfile, base64 as b64
    def xmind(files, method=zipfile.ZIP_DEFLATED):
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w', method) as z:
            for name, text in files.items(): z.writestr(name, text)
        return b64.b64encode(out.getvalue()).decode()
    def open_bytes(name, data):
        b.async_js('''const done=arguments[arguments.length-1],input=document.getElementById('projectFile'),dt=new DataTransfer();
            dt.items.add(new File([Uint8Array.from(atob(arguments[1]),c=>c.charCodeAt(0))],arguments[0]));input.files=dt.files;
            input.onchange({target:input}).then(()=>done(true));''', [name, data])
    xml = ('<?xml version="1.0" encoding="UTF-8"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0"><sheet id="s1">'
        '<topic id="r"><title>Seal leakage </title><children><topics type="attached">'
        '<topic id="a" branch="folded"><title>Leakage between faces\r\nPos. 14/15</title><notes><plain>Seen at the drain</plain></notes><children><topics type="attached">'
        '<topic id="a1"><title>Faces  out of flat</title><children><topics type="attached"><topic id="e"><title>Evidence: Light band reading 4 bands</title></topic></topics></children></topic>'
        '<topic id="a2"><title>Spring broken</title></topic></topics></children></topic>'
        '<topic id="b"><title>Gasket leak</title></topic></topics>'
        '<topics type="detached"><topic id="legend"><title>Terminated</title></topic></topics></children></topic></sheet></xmap-content>')
    b.js('__dialogs.length=0;return true')
    open_bytes('map.xmind', xmind({'content.xml': xml, 'meta.xml': '<meta/>'}))
    r = rca(); titles = [n['title'] for n in r['nodes']]
    assert titles == ['Seal leakage', 'Leakage between faces\nPos. 14/15', 'Faces out of flat', 'Spring broken', 'Gasket leak'], titles
    assert r['meta']['style'] == 'tree' and r['nodes'][0]['id'] == r['problem']['primaryEffectId'] and r['nodes'][0]['kind'] == 'effect'
    assert all(n['kind'] == 'cause' and n['status'] == 'possible' for n in r['nodes'][1:])
    by = {n['title']: n for n in r['nodes']}
    parent = {l['causeId']: l['effectId'] for l in r['links']}
    assert parent[by['Spring broken']['id']] == by['Leakage between faces\nPos. 14/15']['id'] and len(r['links']) == 4
    assert by['Leakage between faces\nPos. 14/15']['notes'] == 'Seen at the drain'
    assert [(e['code'], e['description']) for e in r['evidence']] == [('E1', 'Light band reading 4 bands')]
    assert by['Faces out of flat']['evidenceIds'] == [r['evidence'][0]['id']] and r['counters']['evidence'] == 2
    assert saved()['dirty'] is True, 'an imported map is not saved yet'
    assert 'Imported map.xmind' in b.js("return document.getElementById('status').textContent")
    assert len(boxes()) == 5 and not b.js('return __dialogs')
    check_layout()

    zen = json.dumps([{'id': 's1', 'title': 'Sheet 1', 'rootTopic': {'id': 'r', 'title': 'Pump trip', 'children': {'attached': [
        {'id': 'a', 'title': 'Overload', 'notes': {'plain': {'content': 'Motor current 120 %'}}, 'children': {'attached': [{'id': 'a1', 'title': 'Tight bearing'}]}},
        {'id': 'b', 'title': 'Low suction'}], 'detached': [{'id': 'd', 'title': 'Floating'}]}}},
        {'id': 's2', 'title': 'Sheet 2', 'rootTopic': {'id': 'r2', 'title': 'Other'}}])
    open_bytes('trip.xmind', xmind({'content.json': zen, 'content.xml': '<old/>'}, zipfile.ZIP_STORED))
    r = rca()
    assert [n['title'] for n in r['nodes']] == ['Pump trip', 'Overload', 'Tight bearing', 'Low suction']
    assert r['nodes'][1]['notes'] == 'Motor current 120 %'
    assert 'first of its 2 sheets' in b.js("return document.getElementById('status').textContent")

    open_bytes('broken.xmind', b64.b64encode(b'not a zip').decode())
    open_bytes('empty.xmind', xmind({'meta.xml': '<meta/>'}))
    assert ['not a zip' in d for d in b.js('return __dialogs')] == [True, False] and 'no mind map' in b.js('return __dialogs[1]')
    assert [n['title'] for n in rca()['nodes']][0] == 'Pump trip', 'a refused map leaves the RCA as it was'
    load(saved_file)
    print('PASS: XMind mind maps open as cause trees', flush=True)

    # Good-practice checks on causes and records, in both styles.
    def all_issues():
        click('issuesButton')
        items = b.js('''return [...document.querySelectorAll("#issuesList button")].map(x=>({title:x.querySelector("b").textContent,
            text:x.querySelector("small").textContent,level:x.querySelector("small").className,record:x.dataset.record||null}))''')
        click('issuesButton')
        return items
    checked = json.loads(json.dumps(saved_file))
    has_cause = {l['effectId'] for l in checked['links']}
    leaves = [n for n in checked['nodes'] if n['id'] not in has_cause and n['id'] != checked['problem']['primaryEffectId']]
    linked = {c for x in checked['solutions'] for c in x['causeIds']}
    free = [n for n in leaves if n['id'] not in linked]
    free[0]['title'] = 'Operator error during start-up'
    free[1]['stopPoint'] = {'reason': 'solution-found', 'note': ''}
    free[2]['controllable'] = True
    checked['ruledOut'][0].update(test='', evidenceIds=[])
    checked['solutions'].append({'id': 'sol-x', 'title': 'Orphan solution', 'causeIds': [], 'criteria': checked['solutions'][0]['criteria'], 'decision': 'implement'})
    checked['actions'][1]['effectiveness'] = {'date': '2020-01-01', 'result': ''}
    checked['actions'][2]['effectiveness'] = {'date': '', 'result': ''}; checked['actions'][2]['status'] = 'implemented'
    checked['actions'][3]['effectiveness'] = {'date': '', 'result': ''}
    load(checked)
    got = {(i['title'], i['text'].split(':')[0], i['level'], i['record']) for i in all_issues()}
    expected = {
        ('Operator error during start-up', 'Ends at a human error', 'warning', None),
        (free[1]['title'], 'Its stop point says a solution was found, but no solution attacks it', 'warning', None),
        (free[2]['title'], 'Controllable, but no solution attacks it yet', 'info', None),
        (checked['ruledOut'][0]['cause'], 'Ruled out without a reason', 'warning', 'ruledOut'),
        ('Orphan solution', 'Attacks no cause', 'warning', 'solutions'),
        ('Orphan solution', 'To implement, but no action in the plan', 'warning', 'solutions'),
        (checked['actions'][1]['action'], 'The effectiveness check is due', 'warning', 'actions'),
        (checked['actions'][2]['action'], 'No effectiveness check planned', 'warning', 'actions'),
        (checked['actions'][3]['action'], 'No effectiveness check planned', 'info', 'actions'),
    }
    assert expected <= got, expected - got
    assert b.js("return document.getElementById('issuesCount').textContent") == f'{sum(1 for i in all_issues() if i["level"] != "info")} issues'
    # A record's issue opens its page at the row.
    click('issuesButton')
    b.js('''[...document.querySelectorAll("#issuesList [data-record=actions]")].find(x=>x.textContent.includes("is due")).click();return true''')
    assert b.js("return document.getElementById('app').dataset.record") == 'actions'
    assert b.js("return document.activeElement.dataset.id") == checked['actions'][1]['id']
    click('issuesButton')
    b.js('''document.querySelector("#issuesList [data-record=solutions]").click();return true''')
    assert b.js("return document.getElementById('app').dataset.record") == 'solutions' and b.js("return document.activeElement.value") == 'Orphan solution'
    page('chart')
    # In a cause tree: a ruled-out cause needs its reason, and a confirmed cause on one item is noted.
    tree = json.loads(json.dumps(checked))
    tree['meta']['style'] = 'tree'
    one = next(n for n in tree['nodes'] if len(n['evidenceIds']) == 1 and n['id'] != tree['problem']['primaryEffectId'])
    one['status'] = 'confirmed'
    used = {one['id'], *(n['id'] for n in free[:3])}
    other = next(n for n in tree['nodes'] if n['id'] in {x['id'] for x in leaves} and n['id'] not in used)
    other.update(status='ruled-out', test='', evidenceIds=[])
    load(tree)
    got = {(i['title'], i['text'].split(':')[0]) for i in all_issues()}
    assert (other['title'], 'Ruled out without a reason') in got and (one['title'], 'Confirmed on one evidence item') in got, got
    load(saved_file)
    print('PASS: good-practice checks on causes, ruled-out causes, solutions, and actions', flush=True)

    # Root cause types: set in the properties, drawn as a tag, kept in the file, and checked for 8D.
    by_title = lambda title: next(n for n in rca()['nodes'] if n['title'] == title)
    rca_primary_title = lambda: next(n['title'] for n in rca()['nodes'] if n['id'] == rca()['problem']['primaryEffectId'])
    example_types = {n['title']: n['causeType'] for n in rca()['nodes'] if n['causeType']}
    assert sorted(example_types.values()) == ['escape', 'occurrence', 'occurrence', 'systemic'], example_types
    node_text = lambda title: b.js("return document.querySelector(`#chart .node[data-id='${arguments[0]}']`)?.textContent", [by_title(title)['id']])
    assert 'ESCAPE' in node_text('No seal-system check after upset or bypass')
    select('Seal chamber temperature rose 18 °C')
    b.js('document.querySelector("#properties [data-cause-type=escape]").click();return true')
    assert by_title('Seal chamber temperature rose 18 °C')['causeType'] == 'escape' and 'ESCAPE' in node_text('Seal chamber temperature rose 18 °C')
    b.js('document.querySelector("#properties [data-cause-type=escape]").click();return true')
    assert by_title('Seal chamber temperature rose 18 °C')['causeType'] == '', 'clicking the pressed type clears it'
    click('undo')
    assert by_title('Seal chamber temperature rose 18 °C')['causeType'] == 'escape', 'each change is an undo step'
    click('undo')
    no_systemic = json.loads(json.dumps(saved_file))
    for n in no_systemic['nodes']:
        if n['causeType'] == 'systemic': n['causeType'] = 'nonsense'
    load(no_systemic)
    assert by_title('Seal selected without checking vapour-pressure margin')['causeType'] == '', 'an unknown type opens as none'
    notes = [i['text'] for i in all_issues() if i['title'] == rca_primary_title()]
    assert any(t.startswith('No cause is marked systemic') for t in notes) and not any('escape point' in t for t in notes), notes
    load(saved_file)
    print('PASS: root cause types', flush=True)

    # Actions: kind, strength, the 8D status sequence, read-across, and their checks.
    old = json.loads(json.dumps(saved_file))
    old['actions'][4]['status'] = 'done'
    for field in ('kind', 'strength'): old['actions'][4].pop(field)
    old['actions'][3]['strength'] = 'bogus'
    old['problem'].pop('readAcross')
    load(old)
    acts = rca()['actions']
    assert acts[4]['status'] == 'implemented' and acts[4]['kind'] == 'corrective' and acts[4]['strength'] == '', 'an older file: done is implemented'
    assert acts[3]['strength'] == '' and rca()['problem']['readAcross'] == ''
    load(saved_file)
    page('actions')
    a2 = rca()['actions'][2]
    assert b.js("return document.querySelector(`#records [data-list=actions][data-id='${arguments[0]}'][data-field=strength]`).value", [a2['id']]) == 'medium'
    set_field('actions', a2['id'], 'strength', 'weak')
    weak = {(i['title'], i['text'].split(':')[0]) for i in all_issues()}
    sol_title = next(x['title'] for x in rca()['solutions'] if x['id'] == a2['solutionId'])
    assert (sol_title, 'Only weak actions (training, procedures, warnings)') in weak, weak
    set_field('actions', a2['id'], 'strength', '')
    set_field('actions', a2['id'], 'action', 'Retrain the operators on OP-212')
    assert ('Retrain the operators on OP-212', 'Training or a reminder is a weak action') in {(i['title'], i['text'].split(':')[0]) for i in all_issues()}
    set_field('actions', a2['id'], 'kind', 'containment')
    assert not any(i['text'].startswith('Training') for i in all_issues()), 'containment is not rated'
    set_field('actions', a2['id'], 'status', 'validated')
    assert ('Retrain the operators on OP-212', 'Validated, but no effectiveness result') in {(i['title'], i['text'].split(':')[0]) for i in all_issues()}
    assert b.js("return document.querySelector(`#records tr:has([data-id='${arguments[0]}'])`).classList.contains('done')", [a2['id']])
    set_field('problem', '', 'readAcross', 'P-103A/B checked')
    assert rca()['problem']['readAcross'] == 'P-103A/B checked'
    load(saved_file)
    page('chart')
    print('PASS: action kinds, strength, status sequence, and read-across', flush=True)

    # Equipment and duty: the failure record a seal or pump maker asks for.
    page('equipment')
    assert b.js("return document.getElementById('railEquipment').textContent") == str(len(rca()['equipment']))
    assert 'Ran 439 days' in b.js("return document.querySelector('#records .run-time').textContent")
    set_field('equipment', '', 'sealPlans', '11 + 31')
    set_field('equipment', '', 'failed', '2025-07-01')
    assert rca()['equipment']['sealPlans'] == '11 + 31' and not b.js("return document.querySelector('#records .run-time')"), 'no run time when the dates are reversed'
    odd = json.loads(json.dumps(saved_file))
    odd['equipment'] = {'sealPlans': '53B', 'speed': 2960, 'unknown': 'x'}
    load(odd)
    assert rca()['equipment'] == {'sealPlans': '53B'}, 'unknown keys and non-text values are dropped'
    load({**saved_file, 'equipment': None})
    assert rca()['equipment'] == {}
    load(saved_file)
    b.js('window.dispatchEvent(new Event("beforeprint"));return true')
    assert 'Seal piping plans' in b.js("return document.getElementById('report').textContent")
    page('chart')
    print('PASS: equipment and duty record', flush=True)

    # Is / Is Not: the problem specification, and causes tested against its facts.
    page('spec')
    spec = rca()['specification']
    assert b.js("return document.getElementById('railSpec').textContent") == '10' and len(spec['rows']) == 10 and len(spec['tests']) == 3
    results = b.js("return [...document.querySelectorAll('#records td.spec-result')].map(td=>td.textContent)")
    assert results == ['Explains every fact', 'Explains all, on 5 assumptions', 'Explains all, on 5 assumptions'], results
    vapour = by_title('Product close to its vapour pressure')['id']
    what1 = spec['rows'][0]['id']
    mark = lambda: b.js("document.querySelector(`#records [data-act=spec-mark][data-id='${arguments[0]}'][data-row='${arguments[1]}']`).click();return true", [vapour, what1])
    mark()
    assert next(t for t in rca()['specification']['tests'] if t['causeId'] == vapour)['marks'][what1] == 'no'
    assert b.js("return document.activeElement.dataset.row") == what1, 'the cell keeps the focus'
    assert ('Product close to its vapour pressure', 'Does not explain What 1 of the Is / Is Not') in {(i['title'], i['text'].split(':')[0]) for i in all_issues()}
    mark()
    assert what1 not in next(t for t in rca()['specification']['tests'] if t['causeId'] == vapour)['marks'], 'round to not judged'
    click('undo'); click('undo')
    assert next(t for t in rca()['specification']['tests'] if t['causeId'] == vapour)['marks'][what1] == 'if', 'each click is an undo step'
    act('spec-add-row', dim='when')
    rows = rca()['specification']['rows']
    assert [r['dim'] for r in rows].index('extent') == 8 and rows[7]['dim'] == 'when' and focused() == ['specRows', rows[7]['id'], 'question']
    assert 'When 4' in b.js("return document.querySelector('#records table.spec').textContent")
    act('spec-delete-row', what1)
    assert all(what1 not in t['marks'] for t in rca()['specification']['tests']) and len(rca()['specification']['rows']) == 10
    b.js('''const el=document.querySelector('#records select[data-act=spec-add-test]');el.value=arguments[0];el.dispatchEvent(new Event("change",{bubbles:true}));return true''',
         [by_title('Solids entered the flush line')['id']])
    assert rca()['specification']['tests'][-1] == {'causeId': by_title('Solids entered the flush line')['id'], 'marks': {}}
    assert '9 facts to judge' in b.js("return document.querySelector('#records tbody tr:last-child td.spec-result').textContent")
    act('spec-remove-test', by_title('Solids entered the flush line')['id'])
    assert len(rca()['specification']['tests']) == 3
    # Thin IS NOT data is noted, and opens the page at the first bare fact.
    thin = json.loads(json.dumps(saved_file))
    for r in thin['specification']['rows'][:6]: r['isNot'] = ''
    thin['specification']['tests'][0]['marks'] = {thin['specification']['rows'][0]['id']: 'maybe', 'nope': 'yes'}
    thin['specification']['tests'].append({'causeId': 'missing', 'marks': {}})
    load(thin)
    assert rca()['specification']['tests'][0]['marks'] == {} and len(rca()['specification']['tests']) == 3, 'odd marks and missing causes are dropped'
    page('chart')
    click('issuesButton')
    b.js("document.querySelector('#issuesList [data-record=spec]').click();return true")
    assert b.js("return document.getElementById('app').dataset.record") == 'spec' and focused()[1] == thin['specification']['rows'][0]['id']
    load({**saved_file, 'specification': None})
    assert len(rca()['specification']['rows']) == 10 and not any(r['is'] for r in rca()['specification']['rows']), 'a file without one starts blank'
    load(saved_file)
    # Deleting a cause takes it out of the test.
    page('chart')
    select('Product close to its vapour pressure'); key('Delete')
    b.js("document.querySelector('#dialog [data-choice]:not([data-choice=\"\"])')?.click();return true")
    assert all(t['causeId'] != vapour for t in rca()['specification']['tests'])
    load(saved_file)
    print('PASS: Is / Is Not specification and cause testing', flush=True)

    # Status, sign-off, and closing only once the actions have worked.
    page('team')
    status_select = lambda v: b.js("const el=document.querySelector('#records [data-act=rca-status]');el.value=arguments[0];el.dispatchEvent(new Event('change',{bubbles:true}));return true", [v])
    assert rca()['meta']['status'] == 'actions' and 'Actions in progress' in b.js("return document.getElementById('sheetMeta').textContent")
    b.js('__dialogs.length=0;return true')
    status_select('closed')
    assert rca()['meta']['status'] == 'actions' and b.js("return document.getElementById('dialog').open"), 'closing waits for the actions'
    assert '4 actions not validated' in b.js("return document.getElementById('dialog').textContent")
    b.js("document.querySelector('#dialog [data-choice]').click();return true")
    assert b.js("return document.querySelector('#records [data-act=rca-status]').value") == 'actions', 'the select shows the status kept'
    status_select('root-cause')
    assert rca()['meta']['status'] == 'root-cause'
    click('undo')
    assert rca()['meta']['status'] == 'actions'
    set_field('meta', '', 'signoff.approved.name', 'P. Lindqvist')
    set_field('meta', '', 'customerRef', '8D-77')
    assert rca()['meta']['signoff']['approved']['name'] == 'P. Lindqvist' and rca()['meta']['customerRef'] == '8D-77'
    done = json.loads(json.dumps(saved_file))
    for a in done['actions']:
        if a['kind'] != 'containment': a.update(status='validated', effectiveness={'date': '2026-10-01', 'result': 'No leak since'})
    load(done)
    page('team')
    status_select('closed')
    assert rca()['meta']['status'] == 'closed' and rca()['meta']['dates']['closed'] == b.js("return new Date().toISOString().slice(0,10)"), 'closed, dated today'
    early = json.loads(json.dumps(saved_file))
    early['meta'].update(status='closed', signoff='nonsense', revision=3)
    load(early)
    assert rca()['meta']['signoff']['prepared'] == {'name': '', 'date': ''} and rca()['meta']['revision'] == ''
    assert any(i['text'].startswith('Closed, but') and i['record'] == 'team' for i in all_issues()), 'a closed file with open actions is flagged'
    load({**saved_file, 'meta': {**saved_file['meta'], 'status': 'weird'}})
    assert rca()['meta']['status'] == 'open'
    load(saved_file)
    # The three report layouts, from the Print menu.
    page('chart')
    b.js("window.print=()=>{};return true")
    for layout, button, expect in [('8d', 'print8d', ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']), ('summary', 'printSummary', ['The problem', 'Root causes', 'Actions']), ('full', 'printFull', [])]:
        click('printReport')
        assert not b.js("return document.getElementById('printMenu').hidden")
        click(button)
        assert b.js("return document.getElementById('report').dataset.layout") == layout and b.js("return document.getElementById('printMenu').hidden")
        text = b.js("return document.getElementById('report').textContent")
        assert all(x in text for x in expect) and 'Sign-off' in text, (layout, text[:300])
    b.js("document.getElementById('print8d').click();return true")
    r8 = b.js("return document.getElementById('report').textContent")
    assert 'Escape point' in r8 and 'No seal-system check after upset or bypass' in r8 and 'Run on P-101B' in r8 and 'P-103A/B' in r8 and 'Not ready to close' in r8
    assert b.js("return [...document.querySelectorAll('#report .r-dnum')].map(x=>x.textContent).join()") == 'D1,D2,D3,D4,D5,D6,D7,D8'
    b.js("window.dispatchEvent(new Event('beforeprint'));return true")
    assert b.js("return document.getElementById('report').dataset.layout") == '8d', 'Ctrl+P prints the layout last chosen'
    b.js("document.getElementById('printFull').click();return true")
    print('PASS: status, sign-off, closing, and the full, 8D, and summary reports', flush=True)

    # Files and browser storage from before the tool was named Causeway.
    load({**saved_file, 'type': 'apollo-rca'})
    assert rca()['type'] == 'causeway' and len(rca()['nodes']) == len(saved_file['nodes']), 'an Apollo RCA Builder file opens'
    legacy = {'savedAt': '2026-10-21T10:00:00Z', 'dirty': True, 'rca': {**saved_file, 'type': 'apollo-rca', 'meta': {**saved_file['meta'], 'rcaNumber': 'RCA-OLD-1'}}}
    b.js(f"localStorage.removeItem('{STORAGE}');localStorage.setItem('apollo-rca-v1',JSON.stringify(arguments[0]));localStorage.setItem('apollo-rca-theme','light');return true", [legacy])
    b.call('WebDriver:Navigate', {'url': url})
    assert rca()['meta']['rcaNumber'] == 'RCA-OLD-1' and 'Recovered' in b.js("return document.getElementById('status').textContent"), 'the old autosave is recovered'
    assert b.js("return [localStorage.getItem('apollo-rca-v1'), localStorage.getItem('apollo-rca-theme'), localStorage.getItem('causeway-theme'), document.documentElement.dataset.theme]") == [None, None, 'light', 'light']
    b.js("localStorage.removeItem('causeway-theme');return true")
    open_app()
    # A fishbone that points at missing nodes, records, or causes opens with those references cleared.
    broken = json.loads(json.dumps(saved_file))
    first_causes = broken['fishbones'][0]['categories'][0]['causes']
    broken['fishbones'][0]['effectId'] = 'missing'
    first_causes[0]['nodeId'] = 'missing'; first_causes[1]['ruledOutId'] = 'missing'; first_causes[2]['parentId'] = 'missing'
    load(broken)
    fixed = rca()['fishbones'][0]['categories'][0]['causes']
    assert rca()['fishbones'][0]['effectId'] == rca()['problem']['primaryEffectId']
    assert fixed[0]['nodeId'] is None and fixed[1]['ruledOutId'] is None and fixed[2]['parentId'] is None
    load(saved_file)
    print('PASS: files and storage from the earlier name', flush=True)

    # ---- Export, print, theme ----
    import base64
    nodes_total = len(rca()['nodes'])
    select('Plan 11 flush flow dropped to near zero')
    key(' ')
    assert len(boxes()) < nodes_total
    b.js('__downloads.length=0;return true')
    click('exportButton'); click('exportSvg')
    svg_text = b.async_js('const done=arguments[arguments.length-1];__downloads.at(-1).text().then(done)')
    parsed = b.js('''const d=new DOMParser().parseFromString(arguments[0],"image/svg+xml");
        return {error:!!d.querySelector("parsererror"),nodes:d.querySelectorAll(".node").length,root:d.documentElement.tagName,toggles:d.querySelectorAll(".toggle").length}''', [svg_text])
    assert parsed == {'error': False, 'nodes': nodes_total, 'root': 'svg', 'toggles': 0}, parsed
    assert not re.search(r'href|url\(|<style|https?:', svg_text.replace('xmlns="http://www.w3.org/2000/svg"', '')), 'the SVG references nothing outside itself'
    assert 'fill="#0b5f66"' in svg_text, 'colours are attributes'
    assert b.js('return document.getElementById("exportMenu").hidden')
    print('PASS: SVG export: whole chart, self-contained', flush=True)

    b.js('__downloads.length=0;return true')
    click('exportButton'); click('exportPng')
    png = b.async_js('''const done=arguments[arguments.length-1];const t0=Date.now();
        (function wait(){ const png=__downloads.find(d=>d.type==='image/png'); if(png) done({type:png.type,size:png.size}); else if(Date.now()-t0>8000) done(null); else setTimeout(wait,50); })()''')
    assert png and png['type'] == 'image/png' and png['size'] > 20000, png
    print('PASS: PNG export', flush=True)

    b.js('window.dispatchEvent(new Event("beforeprint"));return true')
    report = b.js('''const r=document.getElementById("report");return {h2:[...r.querySelectorAll("h2")].map(h=>h.textContent),
        figures:r.querySelectorAll("figure:not(.r-fish):not(.r-timeline)").length,nodes:[...r.querySelectorAll("figure:not(.r-fish):not(.r-timeline) svg")].map(s=>s.querySelectorAll(".node").length),
        fish:[...r.querySelectorAll("figure.r-fish svg")].map(s=>s.querySelectorAll(".fish-row").length),
        evidence:[...r.querySelectorAll("section")].find(x=>x.querySelector("h2")?.textContent==="Evidence log").querySelectorAll("tbody tr").length,
        events:[...r.querySelectorAll("figure.r-timeline svg")].map(s=>s.querySelectorAll(".tl-row").length),
        whys:r.querySelectorAll(".r-whys li").length,text:r.textContent}''')
    assert report['h2'] == ['Problem definition', 'Cause-and-effect chart', '5 Whys', 'Fishbone', 'Is / Is Not', 'Failed vs good', 'Sequence of events', 'Evidence log', 'Causes ruled out', 'Solutions', 'Action plan', 'Sign-off'], report['h2']
    assert report['figures'] == 2 and all(n > 0 for n in report['nodes']), 'the wide chart is split across two pages'
    assert report['evidence'] == len(rca()['evidence'])
    assert report['whys'] == sum(len(c['steps']) for c in rca()['fiveWhys']), 'the report lists every why'
    assert report['fish'] == [len(fish_causes(i)) for i in range(len(rca()['fishbones']))], 'the report draws every fishbone'
    assert report['events'] == [sum(len(ph['events']) for ph in t['phases']) for t in rca()['timelines']], 'the report draws every timeline'
    assert 'RCA-2026-014' in report['text'] and 'Add a cyclone separator' in report['text'] and 'Add a seal-system walkdown checklist to upset procedure OP-212' in report['text'] and 'Containment' in report['text'] and 'Strong action' in report['text'] and 'P-103A/B' in report['text']
    pdf = base64.b64decode(b.call('WebDriver:Print', {'orientation': 'landscape', 'background': True})['value'])
    assert pdf.startswith(b'%PDF') and pdf.count(b'/Type /Page') - pdf.count(b'/Type /Pages') >= 5, 'the report prints over several pages'
    print('PASS: printed report', flush=True)

    def node_fill(title):
        return b.js('return document.querySelector(`#chart .node[data-id="${arguments[0]}"] rect:not([fill=none])`).getAttribute("fill")', [node_id(title)])
    assert b.js('return document.documentElement.dataset.theme ?? null') is None, 'the theme follows the system at first'
    click('themeButton')
    assert b.js('return document.documentElement.dataset.theme') == 'light'
    click('themeButton')
    assert b.js('return document.documentElement.dataset.theme') == 'dark'
    assert b.js("return localStorage.getItem('causeway-theme')") == 'dark'
    assert node_fill('Plan 11 flush flow dropped to near zero') == '#0d6e76', 'the canvas uses the dark palette'
    assert b.js("return getComputedStyle(document.body).backgroundColor") == 'rgb(22, 31, 40)'
    b.js('__downloads.length=0;return true')
    click('exportButton'); click('exportSvg')
    assert 'fill="#0b5f66"' in b.async_js('const done=arguments[arguments.length-1];__downloads.at(-1).text().then(done)'), 'exports stay light'
    click('themeButton')
    assert b.js('return document.documentElement.dataset.theme ?? null') is None and node_fill('Plan 11 flush flow dropped to near zero') == '#0b5f66'
    key(' ')
    print('PASS: light, dark, and system themes', flush=True)

    # ---- Cause tree ----
    def set_title(title):
        type_into('nodeTitle', title)

    def node(title):
        return next(n for n in rca()['nodes'] if n['title'] == title)

    click('newProject')
    b.js('document.querySelector("#dialog [data-choice=tree]").click();return true')
    assert rca()['meta']['style'] == 'tree' and b.js('return document.getElementById("railChartName").textContent') == 'Cause tree'
    assert b.js('return getComputedStyle(document.getElementById("addCondition")).display') == 'none', 'a cause tree has one kind of cause'
    set_title('Seal leaks')
    key('Insert'); set_title('Faces damaged')
    assert node('Faces damaged')['kind'] == 'cause' and node('Faces damaged')['status'] == 'possible', 'a new cause has no type and is possible'
    select('Seal leaks'); key('a', alt=True); set_title('O-ring attacked')
    select('Seal leaks'); key('Insert', shift=True); set_title('Shaft moves')
    assert all(n['kind'] == 'cause' for n in rca()['nodes'][1:]), 'Shift+Insert and A add causes too'
    assert b.js("return document.querySelectorAll('#chart .junction').length") == 0, 'no AND in a cause tree'
    assert b.js('return document.querySelectorAll("#chart .node").length') == 4
    select('Faces damaged'); key('2', alt=True)
    assert node('Faces damaged')['status'] == 'confirmed'
    assert b.js(f"return document.querySelectorAll('#chart path[stroke=\"{'#0b5f66'}\"][stroke-width=\"2.6\"]').length") == 1, 'the confirmed branch is bold'
    click('issuesButton')
    texts = b.js('return [...document.querySelectorAll("#issuesList small")].map(s=>s.textContent)')
    assert 'Confirmed without evidence' in texts and texts.count('Not tested yet: no evidence') == 2, texts
    click('issuesButton')
    select('O-ring attacked'); click('inspRuleOut')
    assert node('O-ring attacked')['status'] == 'ruled-out' and len(rca()['ruledOut']) == 0, 'ruled out in a tree stays on the tree'
    assert b.js("return document.getElementById('railRuledOut').textContent") == '1'
    type_into('nodeTest', 'Teardown: O-rings intact')
    page('ruledOut')
    assert b.js('return document.querySelector("#records [data-list=node][data-field=test]").value') == 'Teardown: O-rings intact', 'the tree\'s ruled-out causes are listed'
    page('chart')
    b.js('window.dispatchEvent(new Event("beforeprint"));return true')
    assert 'Ruled out, on the tree' in b.js('return document.getElementById("report").textContent')
    assert b.js('return [...document.querySelectorAll("#report h2")].map(h=>h.textContent)')[1] == 'Cause tree'

    # Moving to Apollo shows what is still needed, then flags it.
    key('Escape')
    b.js('document.querySelector("input[name=chartStyle][value=apollo]").click();return true')
    needs = b.js('return [...document.querySelectorAll("#dialog .needs li")].map(l=>l.textContent)')
    assert any('3 causes without a type' in t for t in needs) and any('1 ruled-out cause to move' in t for t in needs), needs
    assert rca()['meta']['style'] == 'tree', 'nothing changes before the switch is confirmed'
    b.js('document.querySelector("#dialog [data-choice=apollo]").click();return true')
    assert rca()['meta']['style'] == 'apollo' and not b.js('return document.getElementById("issuesList").hidden'), 'the issues to correct are listed'
    assert node('Shaft moves')['unverified'] is True and node('Faces damaged')['unverified'] is False, 'possible causes become unverified'
    select('Shaft moves')
    b.js('document.querySelector("#properties [data-kind=condition]").click();return true')
    assert node('Shaft moves')['kind'] == 'condition'
    select('O-ring attacked'); click('inspRuleOut')
    assert rca()['ruledOut'][-1]['cause'] == 'O-ring attacked' and rca()['ruledOut'][-1]['test'] == 'Teardown: O-rings intact', 'Rule out takes the test along'
    click('undo'); click('undo'); click('undo')
    assert rca()['meta']['style'] == 'tree', 'the switch is one undo step'

    # The example as a cause tree: causes with evidence are confirmed.
    click('loadExample')
    b.js('document.querySelector("input[name=chartStyle][value=tree]").click();document.querySelector("#dialog [data-choice=tree]").click();return true')
    causes = [n for n in rca()['nodes'] if n['kind'] != 'effect']
    assert all(n['status'] == ('confirmed' if n['evidenceIds'] and not n['unverified'] else 'possible') for n in causes)
    assert sum(n['status'] == 'possible' for n in causes) == 2

    # Confirming a cause confirms the possible effects it leads to; a ruled-out one stops the way.
    def issue_texts():
        click('issuesButton')
        texts = b.js('return [...document.querySelectorAll("#issuesList small")].map(s=>s.textContent)')
        click('issuesButton')
        return texts
    possible = next(n['title'] for n in causes if n['status'] == 'possible')
    select(possible); key('a', alt=True); set_title('Root of it')
    assert 'Not tested yet: no evidence' in issue_texts()
    select(possible); key('3', alt=True)
    select('Root of it'); key('2', alt=True)
    assert node(possible)['status'] == 'ruled-out', 'a ruled-out effect is left as it is'
    assert 'Ruled out, but its cause "Root of it" is confirmed' in issue_texts()
    click('undo'); click('undo')
    select('Root of it'); key('2', alt=True)
    assert node(possible)['status'] == 'confirmed' and node('Root of it')['status'] == 'confirmed', 'the effect is confirmed with its cause'
    assert 'with the 1 effect it leads to' in b.js("return document.getElementById('status').textContent")
    click('undo')
    assert node(possible)['status'] == 'possible' and node('Root of it')['status'] == 'possible', 'one undo step'
    select('Root of it'); b.js('document.querySelector("#properties [data-status=confirmed]").click();return true')
    assert node(possible)['status'] == 'confirmed', 'the status buttons confirm the effects too'
    # Taking a confirmation back puts the effects it confirmed back to hypotheses: not one that has another
    # confirmed cause, nor one with evidence of its own.
    for title in ('Deeper', 'Deeper too'):
        select('Root of it'); key('a', alt=True); set_title(title)
        select(title); key('2', alt=True)
    select('Deeper'); key('1', alt=True)
    assert node('Root of it')['status'] == 'confirmed', 'another confirmed cause keeps the effect confirmed'
    select('Deeper too'); key('3', alt=True)
    own = bool(node(possible)['evidenceIds'])
    assert node('Root of it')['status'] == 'possible' and node(possible)['status'] == ('confirmed' if own else 'possible'), 'unconfirming reverts its effects'
    assert ('1 effect it confirmed is a hypothesis again' if own else '2 effects it confirmed are hypotheses again') in b.js("return document.getElementById('status').textContent")
    for _ in range(8): click('undo')
    assert node('Root of it')['status'] == 'confirmed' and 'Deeper' not in [n['title'] for n in rca()['nodes']]
    click('undo'); click('undo'); click('undo')
    tree_file = rca()
    tree_file['meta']['style'] = 'nonsense'
    load(tree_file)
    assert rca()['meta']['style'] == 'apollo', 'an unknown style opens as Apollo'
    print('PASS: cause tree, statuses, and switching between the chart styles', flush=True)

    # ---- Selecting several causes, and summaries ----
    def ctrl_click(title):
        b.js("""const n=document.querySelector(`#chart .node[data-id="${arguments[0]}"] rect:not([fill=none])`),r=n.getBoundingClientRect();
            n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,ctrlKey:true,clientX:r.x+5,clientY:r.y+5}));
            document.getElementById('chart').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:r.x+5,clientY:r.y+5}));return true""", [node_id(title)])

    def box_select(*titles, button=0):
        """A left drag (or another button) on the empty canvas, from above left of the nodes to below right of them."""
        b.js("""const rs=arguments[0].map(id=>document.querySelector(`#chart .node[data-id="${id}"] rect:not([fill=none])`).getBoundingClientRect()),
            c=document.getElementById('chart'),x0=Math.min(...rs.map(r=>r.x))-12,y0=Math.min(...rs.map(r=>r.y))-6,
            x1=Math.max(...rs.map(r=>r.right))-20,y1=Math.max(...rs.map(r=>r.bottom))-4,o={bubbles:true,button:arguments[1]};
            c.dispatchEvent(new PointerEvent('pointerdown',{...o,clientX:x0,clientY:y0}));
            c.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:(x0+x1)/2,clientY:(y0+y1)/2}));
            c.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:x1,clientY:y1}));
            c.dispatchEvent(new PointerEvent('pointerup',{...o,clientX:x1,clientY:y1}));return true""", [[node_id(t) for t in titles], button])

    def causes_of(title):
        return [next(n['title'] for n in rca()['nodes'] if n['id'] == l['causeId']) for l in rca()['links'] if l['effectId'] == node_id(title)]

    def outlined():
        return b.js("return document.querySelectorAll('#chart .node > rect[stroke-width=\"3\"][fill=none]').length")

    def braces():
        return b.js("return document.querySelectorAll('#chart path.brace').length")

    def box_of(title):
        return next(x for x in boxes() if x['id'] == node_id(title))

    open_before = rca()
    click('newProject')
    b.js('document.querySelector("#dialog [data-choice=tree]").click();return true')
    set_title('Seal leaks')
    for title in ('Worn faces', 'Hot faces', 'Dry running', 'Wrong spring'):
        select('Seal leaks'); key('Insert'); set_title(title)
    select('Worn faces'); key('Insert'); set_title('Abrasive solids')
    before_summary = rca()

    box_select('Hot faces', 'Dry running')
    assert outlined() == 2 and '2 SELECTED' in b.js("return document.getElementById('properties').textContent"), 'a box on the canvas selects the nodes it touches'
    assert not b.js("return document.getElementById('summarise').disabled") and not b.js("return !!document.querySelector('#chart .marquee')")
    ctrl_click('Wrong spring')
    assert outlined() == 3, 'Ctrl+click adds one'
    ctrl_click('Wrong spring')
    assert outlined() == 2, 'and takes it out again'
    key('g', alt=True)
    assert b.js("return document.activeElement.id") == 'nodeTitle', 'the summary is ready to name'
    set_title('Heat at the faces')
    assert node('Heat at the faces')['summary'] is True and node('Heat at the faces')['status'] == 'possible'
    assert causes_of('Hot faces') == causes_of('Dry running') == ['Heat at the faces'] and causes_of('Seal leaks') == ['Worn faces', 'Hot faces', 'Dry running', 'Wrong spring']
    assert braces() == 1, 'a summary is drawn with a brace'
    hot, dry, summary = box_of('Hot faces'), box_of('Dry running'), box_of('Heat at the faces')
    assert summary['x'] > hot['x'] and abs((summary['y'] + summary['h'] / 2) - (hot['y'] + dry['y'] + dry['h']) / 2) < 1, 'to the right of its causes, centred on them'
    assert 'summary of 2 causes' in b.js("return document.getElementById('properties').textContent")
    check_layout()
    # Confirming the summary confirms the causes it summarises.
    key('2', alt=True)
    assert node('Hot faces')['status'] == node('Dry running')['status'] == 'confirmed'
    key('1', alt=True)
    for _ in range(4): click('undo')
    assert rca() == before_summary, 'adding a summary is one undo step'

    # Causes that are not neighbours are put together; causes with their own causes, or of other effects, cannot be summarised.
    box_select('Worn faces', 'Hot faces')
    assert b.js("return document.getElementById('summarise').disabled")
    key('g', alt=True)
    assert 'end of a branch' in b.js("return document.getElementById('status').textContent") and rca() == before_summary
    box_select('Abrasive solids', 'Dry running')
    key('g', alt=True)
    assert rca() == before_summary
    select('Hot faces'); ctrl_click('Wrong spring'); click('summarise'); set_title('Heat at the faces')
    assert causes_of('Seal leaks') == ['Worn faces', 'Hot faces', 'Wrong spring', 'Dry running'] and braces() == 1
    # Once one of them has another cause, the summary is drawn as a shared cause.
    select('Hot faces'); key('Insert'); set_title('Cooling lost')
    assert braces() == 0 and b.js("return document.querySelectorAll('#chart path[stroke-dasharray=\"6 4\"]').length") == 1
    click('undo'); click('undo')
    assert braces() == 1

    # Status and delete act on every selected cause; a right drag pans, and keeps the selection.
    box_select('Wrong spring', 'Dry running'); key('3', alt=True)
    assert node('Dry running')['status'] == node('Wrong spring')['status'] == 'ruled-out' and '2 causes: ruled out' in b.js("return document.getElementById('status').textContent")
    view_before = b.js("return document.getElementById('chart').getAttribute('viewBox')")
    box_select('Worn faces', button=2)
    assert b.js("return document.getElementById('chart').getAttribute('viewBox')") != view_before and outlined() == 2, 'a right drag pans'
    wheel = lambda dx, dy: b.js("const c=document.getElementById('chart');c.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:arguments[0],deltaY:arguments[1],clientX:600,clientY:400}));return c.getAttribute('viewBox').split(' ').map(Number)", [dx, dy])
    v0 = b.js("return document.getElementById('chart').getAttribute('viewBox').split(' ').map(Number)")
    v1 = wheel(120, 0)
    assert v1[0] > v0[0] and v1[1:] == v0[1:], 'a sideways wheel pans right, without zooming'
    assert wheel(-120, 0) == v0, 'and back left'
    assert wheel(0, 100)[2] > v0[2], 'the wheel still zooms'
    select('Worn faces'); ctrl_click('Wrong spring'); key('Delete')
    assert {'Worn faces', 'Abrasive solids', 'Wrong spring'}.isdisjoint(n['title'] for n in rca()['nodes']), 'deleting several takes the causes only they support'
    select('Hot faces')
    assert outlined() == 1, 'a click selects one node'

    # XMind summaries come in as summaries.
    zen = json.dumps([{'id': 's1', 'title': 'Sheet 1', 'rootTopic': {'id': 'r', 'title': 'Pressure low', 'children': {'attached': [
        {'id': 'a', 'title': 'Gas temperature', 'children': {'attached': [{'id': 'a1', 'title': 'Ambient cooler'}, {'id': 'a2', 'title': 'Sun to shadow'}],
         'summary': [{'id': 'sum', 'title': 'Temperature swing'}]}, 'summaries': [{'id': 'x', 'range': '(0,1)', 'topicId': 'sum'}]}]}}}])
    open_bytes('sum.xmind', xmind({'content.json': zen}))
    assert node('Temperature swing')['summary'] is True and causes_of('Ambient cooler') == causes_of('Sun to shadow') == ['Temperature swing'] and braces() == 1
    xml = ('<?xml version="1.0" encoding="UTF-8"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0"><sheet id="s1">'
        '<topic id="r"><title>Pressure low</title><children><topics type="attached"><topic id="a1"><title>Ambient cooler</title></topic>'
        '<topic id="a2"><title>Sun to shadow</title></topic></topics><topics type="summary"><topic id="sum"><title>Temperature swing</title></topic></topics></children>'
        '<summaries><summary id="x" range="(0,1)" topic-id="sum"/></summaries></topic></sheet></xmap-content>')
    open_bytes('sum8.xmind', xmind({'content.xml': xml}))
    assert node('Temperature swing')['summary'] is True and braces() == 1, 'and from XMind 8'
    load(rca())
    assert braces() == 1, 'a summary is kept in the file'
    load(open_before)
    print('PASS: box selection, summaries, and acting on several causes', flush=True)

    # ---- Alternatives (OR) in Apollo ----
    def or_pills():
        return b.js("return document.querySelectorAll('#chart .junction.or').length")

    def issue_texts():
        click('issuesButton')
        texts = b.js('return [...document.querySelectorAll("#issuesList small")].map(s=>s.textContent)')
        click('issuesButton')
        return texts

    def report_text(button):
        b.js("window.print=()=>{};document.getElementById(arguments[0]).click();return true", [button])
        return b.js("return document.getElementById('report').textContent")

    click('newProject')
    b.js('document.querySelector("#dialog [data-choice=apollo]").click();return true')
    set_title('Seal leaks')
    select('Seal leaks'); key('Insert'); set_title('Dry running')
    select('Seal leaks'); key('Insert'); set_title('Wrong installation')
    select('Seal leaks'); key('Insert', shift=True); set_title('Hot product')
    before_or = rca()
    box_select('Dry running', 'Wrong installation')
    assert 'Make them alternatives' in b.js("return document.getElementById('properties').textContent")
    key('o', alt=True)
    groups = {l.get('orGroup') for l in rca()['links'] if l['effectId'] == node_id('Seal leaks') and l['causeId'] != node_id('Hot product')}
    assert len(groups) == 1 and None not in groups, 'the two causes share one group'
    assert node('Dry running')['unverified'] and node('Wrong installation')['unverified'], 'alternatives are unverified'
    assert or_pills() == 1 and b.js("return document.querySelectorAll('#chart .junction:not(.or)').length") == 1, 'one OR, and the AND with the condition'
    check_layout()
    assert not any('Needs' in t for t in issue_texts()), 'a group of actions counts as the action'
    assert issue_texts().count('One of 2 alternatives (OR): test them, and rule out all but one') == 2
    assert '1 group of alternatives (OR) not settled' in report_text('print8d'), 'an open group stops the RCA closing'
    assert 'One of 2 alternatives' in report_text('printFull'), 'the report lists the open group'
    # A mixed group is neither an action nor a condition.
    select('Wrong installation'); b.js('document.querySelector("#properties [data-kind=condition]").click();return true')
    assert 'Needs an action cause' in issue_texts()
    click('undo')
    # The group is kept in the file, and a lone member is no group.
    grouped = rca()
    load(grouped)
    assert or_pills() == 1, 'a group is kept in the file'
    broken = rca()
    for l in broken['links']:
        if l['causeId'] == node_id('Wrong installation'): l.pop('orGroup', None)
    load(broken)
    assert or_pills() == 0 and not any(l.get('orGroup') for l in rca()['links']), 'a group of one is dropped on opening'
    load(grouped)
    # Alt+O on one member takes it out; Keep this one rules out the others.
    select('Wrong installation'); key('o', alt=True)
    assert or_pills() == 0 and not any(l.get('orGroup') for l in rca()['links'])
    click('undo')
    assert or_pills() == 1
    select('Dry running')
    assert 'Alternatives (OR) · one of 2' in b.js("return document.getElementById('properties').textContent")
    click('inspKeep')
    assert [r['cause'] for r in rca()['ruledOut']] == ['Wrong installation'] and or_pills() == 0, 'keeping one rules out the others'
    assert not any(l.get('orGroup') for l in rca()['links']) and 'alternatives (OR) not settled' not in report_text('print8d')
    click('undo')
    assert or_pills() == 1 and not rca()['ruledOut']
    # Ruling out one of two dissolves the group; no OR in a cause tree.
    select('Wrong installation'); click('inspRuleOut')
    assert or_pills() == 0 and not any(l.get('orGroup') for l in rca()['links'])
    click('undo')
    box_select('Dry running', 'Hot product')
    key('o', alt=True)
    assert len({l.get('orGroup') for l in rca()['links']} - {None}) == 1 and or_pills() == 1, 'regrouping takes the causes out of their old group'
    click('undo')
    assert rca()['links'] == grouped['links'], 'regrouping is one undo step'
    load(before_or)
    assert or_pills() == 0 and node('Dry running')['unverified'] is False
    load(open_before)
    print('PASS: alternatives (OR) in Apollo: grouping, drawing, rules, settling, and files', flush=True)

    # ---- Layout of other chart shapes ----
    SIBLING_GAP = 16  # as in 01-constants.js

    def chart(links, style='apollo', collapsed=(), roots=()):
        """An RCA from (effect, cause) title pairs; the first effect is the primary one. Titles of
        different lengths give nodes of different heights. `roots` are nodes no effect links to."""
        project = json.loads(json.dumps(example_file))
        for key in ('evidence', 'ruledOut', 'solutions', 'actions', 'fiveWhys', 'fishbones'):
            project[key] = []
        titles = list(dict.fromkeys([t for pair in links for t in pair] + list(roots)))
        ids = {t: f'00000000-0000-4000-8000-{i:012d}' for i, t in enumerate(titles)}
        causes = {c for _, c in links} | set(roots[1:])
        project['nodes'] = [{'id': ids[t], 'kind': ('condition' if i % 2 else 'action') if t in causes else 'effect', 'title': t,
                             'description': '', 'evidenceIds': [], 'status': 'possible', 'test': '', 'unverified': False,
                             'controllable': False, 'stopPoint': None, 'notes': ''} for i, t in enumerate(titles)]
        project['links'] = [{'id': f'00000000-0000-4000-9000-{i:012d}', 'effectId': ids[e], 'causeId': ids[c]} for i, (e, c) in enumerate(links)]
        project['problem']['primaryEffectId'] = ids[titles[0]]
        project['meta']['style'] = style
        project['view'] = {'collapsed': [ids[t] for t in collapsed]}
        return project

    def edges():
        return b.js("return [...document.querySelectorAll('#chart path.edge')].map(p=>p.getAttribute('d'))")

    def segments(d):
        """The straight runs of a connector path made of M, H, and V commands."""
        tokens, runs, x, y = re.findall(r'[MHV]|-?[\d.]+', d), [], 0, 0
        i = 0
        while i < len(tokens):
            command = tokens[i]
            if command == 'M':
                x, y = float(tokens[i + 1]), float(tokens[i + 2]); i += 3
            elif command == 'H':
                runs.append((x, y, float(tokens[i + 1]), y)); x = float(tokens[i + 1]); i += 2
            else:
                runs.append((x, y, x, float(tokens[i + 1]))); y = float(tokens[i + 1]); i += 2
        return runs

    def check_shape(name, project, kept_order=False):
        load(project)
        placed = check_layout()
        assert len(placed) == len(b.js("return document.querySelectorAll('#chart .node')")), name
        mid = lambda box: box['y'] + box['h'] / 2
        columns = sorted({x['x'] for x in placed.values()})
        step = columns[1] - columns[0] if len(columns) > 1 else 0
        # The effect each cause is drawn under: its first-linked effect in the column just to the left.
        under = {}
        for link in rca()['links']:
            e, c = placed.get(link['effectId']), placed.get(link['causeId'])
            if e and c and c['id'] not in under and c['x'] - e['x'] == step:
                under[c['id']] = e['id']
        drawn = {}
        for c, e in under.items():
            drawn.setdefault(e, []).append(placed[c])
        for e, kids in drawn.items():
            kids.sort(key=lambda k: k['y'])
            # Each effect is centred on its causes.
            assert abs(mid(placed[e]) - (mid(kids[0]) + mid(kids[-1])) / 2) < 0.5, f'{name}: an effect is centred on its causes'
            # Causes with nothing drawn under them sit one sibling gap apart.
            for one, other in zip(kids, kids[1:]):
                gap = other['y'] - one['y'] - one['h']
                if one['id'] not in drawn and other['id'] not in drawn:
                    assert abs(gap - SIBLING_GAP) < 0.5, f'{name}: leaf causes are evenly spaced ({gap})'
            if kept_order:
                order = [l['causeId'] for l in rca()['links'] if l['effectId'] == e and under.get(l['causeId']) == e]
                assert [k['id'] for k in kids] == order, f'{name}: causes keep their order'
        # No two nodes in a column are closer than the sibling gap.
        for x in columns:
            stack = sorted((b_ for b_ in placed.values() if b_['x'] == x), key=lambda b_: b_['y'])
            for one, other in zip(stack, stack[1:]):
                assert other['y'] - one['y'] - one['h'] >= SIBLING_GAP - 0.5, f'{name}: nodes in a column keep their distance'
        # No connector runs through a node.
        for d in edges():
            for x1, y1, x2, y2 in segments(d):
                for box in placed.values():
                    inside_x = min(x1, x2) < box['x'] + box['w'] and max(x1, x2) > box['x'] if y1 == y2 else box['x'] < x1 < box['x'] + box['w']
                    inside_y = box['y'] < y1 < box['y'] + box['h'] if y1 == y2 else min(y1, y2) < box['y'] + box['h'] and max(y1, y2) > box['y']
                    assert not (inside_x and inside_y), f'{name}: a connector crosses a node ({d})'
        # The same file gives the same chart, again and after a re-render.
        first, lines = boxes(), edges()
        load(project)
        assert boxes() == first and edges() == lines, f'{name}: the layout is the same every time'
        b.js('window.dispatchEvent(new Event("resize"));return true')
        assert boxes() == first, f'{name}: the layout is the same every time'
        return placed

    example_file = rca()
    long_title = 'A cause with a long title that wraps onto three lines of the node, or more'
    mid_title = 'A cause with a title over two lines'

    check_shape('the example', example_file)

    chain = [('Seal leaks', 'Step 1')] + [(f'Step {i}' if i % 3 else long_title + f' {i}', f'Step {i + 1}' if (i + 1) % 3 else long_title + f' {i + 1}') for i in range(1, 8)]
    chain += [('Step 2', 'Short side branch'), ('Step 5', mid_title)]
    check_shape('a long chain', chart(chain))

    # Causes of different heights, several levels deep: the case the centring missed.
    deep = [('Seal leaks', long_title), ('Seal leaks', 'Short'), ('Seal leaks', mid_title),
            (long_title, 'A'), (long_title, mid_title + ' A'), (long_title, long_title + ' A'),
            ('Short', 'B'), (mid_title + ' A', 'C'), (mid_title + ' A', long_title + ' C'), (mid_title + ' A', 'D'),
            (mid_title, 'E'), ('E', long_title + ' E'), ('E', 'F')]
    check_shape('mixed heights', chart(deep))
    check_shape('mixed heights, collapsed', chart(deep, collapsed=[mid_title + ' A', 'E']))
    collapsed_shape = boxes()
    assert len(collapsed_shape) == len({t for pair in deep for t in pair}) - 5, 'collapsed causes are hidden'
    check_shape('mixed heights, as a cause tree', chart(deep, style='tree'), kept_order=True)

    # Shared causes, to the next column and across several, with more than one per effect.
    shared = deep + [('Seal leaks', 'C'), ('Short', 'E'), (long_title, 'F'), ('B', 'D'), ('Short', long_title + ' C'),
                     ('Seal leaks', 'F')]
    check_shape('shared causes', chart(shared))
    check_shape('shared causes, as a cause tree', chart(shared, style='tree'), kept_order=True)

    # Hand moves, up and down, including ones the layout cannot honour, never make nodes overlap.
    def with_shifts(project, shifts):
        for n in project['nodes']:
            n['offsetY'] = shifts.get(n['title'], 0)
        return project
    hand = with_shifts(chart(deep), {long_title: -120, 'Short': 200, mid_title: -300, 'A': 40, long_title + ' C': -80, 'F': 'up', 'E': 25})
    load(hand)
    placed = check_layout()
    assert [n['offsetY'] for n in rca()['nodes'] if n['title'] == 'F'] == [0], 'an offset that is not a number opens as none'
    plain_placed = check_shape('mixed heights', chart(deep))
    load(hand)
    placed = check_layout()
    assert placed[node_id('Seal leaks')]['y'] == plain_placed[node_id('Seal leaks')]['y'], 'the primary effect stays put'
    load(with_shifts(chart(shared, style='tree'), {long_title: -100, 'Short': 90, 'C': 60}))
    check_layout()
    load(with_shifts(chart(deep + [('Loose node', 'Its cause')], roots=['Loose node', 'Alone']), {'Its cause': -400, long_title: 300}))
    check_layout()

    # A hand-edited file: nodes no effect links to are drawn as further trees below.
    placed = check_shape('several starting nodes', chart(deep + [('Loose node', 'Its cause'), ('Its cause', long_title + ' L')],
                                                           roots=['Loose node', 'Alone']))
    primary = rca()['problem']['primaryEffectId']
    assert all(x['x'] >= placed[primary]['x'] for x in placed.values())
    load(example_file)
    print('PASS: layout of chains, mixed heights, shared and collapsed causes, cause trees, and several roots', flush=True)

    # ---- Guide and the Learn page ----
    def guide():
        return b.js('''const g=document.getElementById('guide');return {open:!g.hidden,topic:g.dataset.topic,title:g.querySelector('h2')?.textContent,
            example:g.querySelector('.guide-example')?.textContent.trim()||'',cols:getComputedStyle(document.getElementById('app')).gridTemplateColumns.split(' ').length}''')
    b.js("document.querySelector('.rail [data-record=chart]').click();return true")
    assert not guide()['open']
    click('guideButton')
    g = guide()
    assert g['open'] and g['topic'] == 'chart' and g['title'] == 'Cause and effect' and g['cols'] == 4
    assert 'High seal leakage' in g['example'] and 'AND' in g['example']
    assert b.js("return localStorage.getItem('causeway-guide')") == 'open'
    # It follows the page shown, and its button goes to the page of a topic chosen from the list.
    b.js("document.querySelector('.rail [data-record=whys]').click();return true")
    assert guide()['topic'] == 'whys' and 'Leak path opened across primary faces' in guide()['example']
    b.js("const s=document.getElementById('guideTopic');s.value='actions';s.dispatchEvent(new Event('change',{bubbles:true}));return true")
    assert guide()['topic'] == 'actions' and 'cyclone' in guide()['example']
    b.js("document.querySelector('#guide [data-guide-go]').click();return true")
    assert b.js("return document.getElementById('app').dataset.record") == 'actions' and guide()['topic'] == 'actions'
    # Every topic has its parts and an excerpt of the example.
    topics = b.js("return [...document.querySelectorAll('#guideTopic option')].map(o=>o.value)")
    assert len(topics) == 14
    for t in topics:
        b.js("const s=document.getElementById('guideTopic');s.value=arguments[0];s.dispatchEvent(new Event('change',{bubbles:true}));return true", [t])
        parts = b.js("return [...document.querySelectorAll('#guide h3')].map(h=>h.firstChild.textContent.trim())")
        assert parts == ['When to use it', 'How to fill it in', 'Good practice', 'Example'], (t, parts)
        assert len(guide()['example']) > 80 and 'undefined' not in guide()['example'], t
    # The Learn page lists the methods in order; its buttons open a guide or a page, and keep the topic chosen.
    b.js("document.querySelector('.rail [data-record=learn]').click();return true")
    assert b.js("return document.querySelectorAll('.learn-list li').length") == 14
    assert b.js("return [...document.querySelectorAll('.learn-stage h2')].map(h=>h.textContent)") == ['Define the problem', 'Collect the facts', 'Find the causes', 'Fix it and close']
    b.js("document.querySelector('[data-act=learn-guide][data-v=spec]').click();return true")
    assert guide()['topic'] == 'spec' and 'P-101B' in guide()['example']
    b.js("document.querySelector('[data-act=learn-go][data-v=evidence]').click();return true")
    assert b.js("return document.getElementById('app').dataset.record") == 'evidence' and guide()['topic'] == 'evidence'
    # In a cause tree, the chart's guide explains hypotheses, confirmed, and ruled out.
    tree = rca()
    tree['meta']['style'] = 'tree'
    load(tree)
    b.js("document.querySelector('.rail [data-record=chart]').click();return true")
    g = guide()
    assert g['title'] == 'Cause tree' and all(x in g['example'] for x in ['✓', '✕', 'Face manufacturing defect', 'Pump run away']), g
    load(example_file)
    # Closed, it stays closed after a reload; the chart takes the room back.
    b.js("document.getElementById('closeGuide').click();return true")
    assert not guide()['open'] and guide()['cols'] == 3
    b.call('WebDriver:Navigate', {'url': url})
    assert not guide()['open']
    print('PASS: guide beside each page, the Learn page, and examples for every method', flush=True)

    # ---- Word reports ----
    open_app()

    def docx(button, kind='wordprocessingml'):
        data = b.async_js('''const done=arguments[arguments.length-1],seen=__downloads.length;document.getElementById(arguments[0]).click();
            const wait=()=>{const f=__downloads.slice(seen).find(x=>x.type.includes(arguments[1]));if(!f)return setTimeout(wait,50);
              const r=new FileReader();r.onload=()=>done(r.result);r.readAsDataURL(f)};wait()''', [button, kind])
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(data.split(',')[1])))
        assert z.testzip() is None
        for name in z.namelist():
            if name.endswith(('.xml', '.rels')):
                ET.fromstring(z.read(name))
        return z
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    z = docx('exportDocxFull')
    doc = ET.fromstring(z.read('word/document.xml'))
    text = ''.join(t.text or '' for t in doc.iter(W + 't'))
    styles = [s.get(W + 'val') for s in doc.iter(W + 'pStyle')]
    heads = [''.join(t.text or '' for t in p.iter(W + 't')) for p in doc.iter(W + 'p') if any(s.get(W + 'val') == 'Heading1' for s in p.iter(W + 'pStyle'))]
    assert heads == ['Problem definition', 'Cause-and-effect chart', '5 Whys', 'Fishbone', 'Is / Is Not', 'Failed vs good', 'Sequence of events', 'Evidence log', 'Causes ruled out', 'Solutions', 'Action plan', 'Sign-off'], heads
    assert 'Title' in styles and 'High seal leakage, 15 ml/min (limit under 1 ml/min)' in text and 'Add a cyclone separator to the flush (Plan 11 + 31)' in text
    assert len([n for n in z.namelist() if n.startswith('word/media/')]) >= 3, 'the chart, fishbone, and timeline are pictures'
    assert len(list(doc.iter(W + 'pageBreakBefore'))) >= 5, 'sections start on a new page as in print'
    assert len(list(doc.iter(W + 'tblHeader'))) >= 8, 'table headers repeat on each page'
    rels = z.read('word/_rels/document.xml.rels').decode()
    assert all(f'media/{n.split("/")[-1]}' in rels for n in z.namelist() if n.startswith('word/media/'))
    z = docx('exportDocx8d')
    text = ''.join(t.text or '' for t in ET.fromstring(z.read('word/document.xml')).iter(W + 't'))
    assert all(f'D{i}' in text for i in range(1, 9)) and 'Escape point' in text and 'Not ready to close' in text
    assert 'RCA-2026-014' in z.read('word/footer1.xml').decode()
    print('PASS: full and 8D reports as Word documents', flush=True)

    # ---- PowerPoint decks ----
    A, PN = '{http://schemas.openxmlformats.org/drawingml/2006/main}', '{http://schemas.openxmlformats.org/presentationml/2006/main}'

    def deck(button):
        z = docx(button, 'presentationml')
        pres = ET.fromstring(z.read('ppt/presentation.xml'))
        n = len(list(pres.iter(PN + 'sldId')))
        assert n == len([x for x in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', x)])
        size = pres.find(PN + 'sldSz')
        slides = []
        for i in range(1, n + 1):
            xml = ET.fromstring(z.read(f'ppt/slides/slide{i}.xml'))
            for off, ext in zip(xml.iter(A + 'off'), xml.iter(A + 'ext')):
                assert int(off.get('x')) + int(ext.get('cx')) <= int(size.get('cx')) + 1 and int(off.get('y')) + int(ext.get('cy')) <= int(size.get('cy')) + 1, f'slide {i}: a shape runs off the slide'
            rels = z.read(f'ppt/slides/_rels/slide{i}.xml.rels').decode()
            for target in re.findall(r'Target="\.\./media/([^"]+)"', rels):
                assert f'ppt/media/{target}' in z.namelist()
            slides.append([''.join(t.text or '' for t in para.iter(A + 't')) for para in xml.iter(A + 'p')])
        return z, slides
    z, slides = deck('exportPptxFull')
    titles = [s[0] for s in slides[1:]]
    assert slides[0][1] == 'High seal leakage, 15 ml/min (limit under 1 ml/min)', slides[0][:3]
    assert [t for i, t in enumerate(titles) if 'continued' not in t] == ['Problem definition', 'Cause-and-effect chart', '5 Whys', 'Fishbone', 'Is / Is Not', 'Failed vs good', 'Sequence of events', 'Evidence log', 'Causes ruled out', 'Solutions', 'Action plan', 'Sign-off'], titles
    assert any('continued' in t for t in titles), 'a long section runs on to another slide'
    assert all(s[-1] == f'{i + 1} / {len(slides)}' for i, s in enumerate(slides)), 'every slide is numbered'
    assert any('Add a cyclone separator to the flush (Plan 11 + 31)' in t for s in slides for t in s)
    assert len([x for x in z.namelist() if x.startswith('ppt/media/')]) >= 3, 'the chart, fishbone, and timeline are pictures'
    z, slides = deck('exportPptx8d')
    text = ' '.join(t for s in slides for t in s)
    assert all(f'D{i}' in text for i in range(1, 9)) and 'Escape point' in text and 'Not ready to close' in text
    z, slides = deck('exportPptxSummary')
    assert len(slides) == 1 and 'Root causes' in slides[0] and 'Actions' in slides[0], slides
    print('PASS: full, 8D, and summary reports as PowerPoint decks', flush=True)

    # ---- Chart as PDF ----
    click('exportPdf')
    papers = b.js("return [...document.querySelectorAll('#dialog [data-choice]')].map(x=>x.dataset.choice+'|'+x.textContent.replace(/\\s+/g,' ').trim())")
    assert [p.split('|')[0] for p in papers] == ['a4', 'a3', 'a1', ''] and all('Text at' in p for p in papers[:3]), papers
    data = b.async_js('''const done=arguments[arguments.length-1],seen=__downloads.length;document.querySelector('#dialog [data-choice=a3]').click();
        const wait=()=>{const f=__downloads.slice(seen).find(x=>x.type==='application/pdf');if(!f)return setTimeout(wait,50);
          const r=new FileReader();r.onload=()=>done(r.result);r.readAsDataURL(f)};wait()''')
    pdf = base64.b64decode(data.split(',')[1])
    assert pdf.startswith(b'%PDF-1.4') and pdf.rstrip().endswith(b'%%EOF') and b'/MediaBox [0 0 1190.55 841.89]' in pdf
    # Every object is where the cross-reference table says.
    xref = int(re.search(rb'startxref\n(\d+)', pdf).group(1))
    rows = pdf[xref:].split(b'\n')
    count = int(rows[1].split()[1])
    for n, row in enumerate(rows[3:3 + count - 1], start=1):
        assert pdf[int(row[:10]):].startswith(f'{n} 0 obj'.encode()), n
    content = zlib.decompress(re.search(rb'stream\n(.*?)\nendstream', pdf, re.S).group(1)).decode('latin-1')
    assert '(High seal leakage, 15 ml/min \\(limit under 1 ml/min\\)) Tj' in content
    assert content.count(' Tj') > 60 and content.count(' re ') + content.count(' c ') > 50
    assert all(f'/BaseFont /{f}' in pdf.decode('latin-1') for f in ['Helvetica', 'Helvetica-Bold', 'Courier-Bold', 'ZapfDingbats'])
    print('PASS: chart as a vector PDF on a chosen paper size', flush=True)

    # ---- Autosave recovery ----
    select('Seal relies on a stable liquid film')
    type_into('nodeNotes', 'Check with the seal vendor')
    assert saved()['dirty'] is True
    b.call('WebDriver:Navigate', {'url': url})
    assert any(n['notes'] == 'Check with the seal vendor' for n in rca()['nodes'])
    assert 'Recovered' in b.js("return document.getElementById('status').textContent")
    assert len(b.js("return document.querySelectorAll('#chart .node')")) == 16
    print('PASS: autosave recovers unsaved changes after a reload', flush=True)

    # Storage that throws must not stop the app.
    open_app()
    b.js("Storage.prototype.setItem=()=>{throw new Error('quota')};return true")
    click('loadExample')
    assert len(b.js("return document.querySelectorAll('#chart .node')")) == 16
    print('PASS: works when storage is unavailable', flush=True)

    # ---- DFMEA: a module of its own ----
    open_app(clear=True)
    click('loadExample')
    rca_before = rca()

    def dfmea_saved():
        return b.js("return JSON.parse(localStorage.getItem('causeway-dfmea-v1'))")

    def dfmea():
        return dfmea_saved()['dfmea']

    def df_titles(n, depth=0, out=None):
        out = [] if out is None else out
        out.append((depth, n['title']))
        for k in n['children']:
            df_titles(k, depth + 1, out)
        return out

    def df_select(title):
        b.js("[...document.querySelectorAll('#dfmea .df-box')].find(x=>x.textContent.includes(arguments[0])).click();return true", [title])

    def df_page(name):
        b.js("document.querySelector(`[data-dfmea-page=${arguments[0]}]`).click();return true", [name])

    def module():
        return b.js("return document.getElementById('app').dataset.module")

    click('moduleDfmea')
    assert module() == 'dfmea' and b.js("return getComputedStyle(document.querySelector('main')).display") == 'none'
    assert b.js("return getComputedStyle(document.getElementById('dfmea')).display") != 'none'
    assert [t for _, t in df_titles(dfmea()['root'])] == ['Describe the project'], 'a blank DFMEA to start'
    click('loadExample')
    d = dfmea()
    causes = [t for depth, t in df_titles(d['root']) if depth == 6]
    assert len(causes) == 7 and len(d['actions']) == 5 and d['meta']['method'] == 'rpn'
    assert b.js("return document.querySelectorAll('#dfmea .df-box').length") == len(df_titles(d['root']))
    assert rca() == rca_before, 'the DFMEA leaves the RCA alone'
    print('PASS: DFMEA module beside the RCA, with its own example', flush=True)

    # Tab adds a child, Enter a sibling, typing names it; arrows select; Delete removes with what is under it.
    df_select('Springs clog')
    key('Tab')
    assert status() == 'Added an effect: type to name it', status()
    type_keys('Spring force lost')
    b.js("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true")
    found = [(depth, t) for depth, t in df_titles(dfmea()['root']) if t.startswith('Spring force') or t == 'S']
    assert (5, 'Spring force lost') in found, found
    key('Enter')
    type_keys('Faces open')
    b.js("document.activeElement.blur();return true")
    effects = [k['title'] for k in next(fm for fm in [n for p in dfmea()['root']['children'] for c in p['children'] for f in c['children'] for n in f['children']] if fm['title'] == 'Springs clog')['children']]
    assert effects == ['Faces open; leakage at start-up', 'Spring force lost', 'Faces open'], effects
    key('Tab')
    assert 'New cause' in [t for depth, t in df_titles(dfmea()['root']) if depth == 6]
    key('Delete')
    assert 'New cause' not in [t for depth, t in df_titles(dfmea()['root']) if depth == 6]
    selected = lambda: b.js("return document.querySelector('#dfmea .df-box.sel').textContent")
    assert selected().endswith('Faces open'), 'the parent of the cause deleted is selected'
    key('ArrowLeft')
    assert 'Springs clog' in selected()
    click('undo')
    assert 'New cause' in [t for depth, t in df_titles(dfmea()['root']) if depth == 6], 'undo brings the cause back'
    click('redo')
    assert 'New cause' not in [t for depth, t in df_titles(dfmea()['root']) if depth == 6]
    assert rca() == rca_before, "the DFMEA's undo leaves the RCA alone"
    print('PASS: DFMEA tree: Tab child, Enter sibling, typing names, Delete, and its own undo', flush=True)

    # Pan and zoom: an example opens fitted; the wheel zooms at the pointer; dragging the canvas pans and keeps the selection.
    click('loadExample')
    def view():
        t = b.js("return document.getElementById('dfTree').style.transform")
        x, y, k = map(float, re.findall(r'-?[\d.]+', t))
        return x, y, k, b.js("return document.getElementById('dfZoomReset').textContent")
    fitted = view()
    assert fitted[2] < 1 and fitted[3] == f'{round(fitted[2] * 100)}%'
    assert b.js('''const c=document.getElementById('dfCanvas').getBoundingClientRect(),t=document.getElementById('dfTree').getBoundingClientRect();
        return t.left>=c.left-1&&t.right<=c.right+1&&t.bottom<=c.bottom+1'''), 'the whole tree is in view'
    b.js("const c=document.getElementById('dfCanvas'),r=c.getBoundingClientRect();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:r.x+300,clientY:r.y+200,bubbles:true,cancelable:true}));return true")
    zoomed = view()
    assert zoomed[2] > fitted[2] and abs((300 - zoomed[0]) / zoomed[2] - (300 - fitted[0]) / fitted[2]) < .5, 'the point under the pointer stays put'
    df_select('Springs clog')
    ex, ey = b.js('''const c=document.getElementById('dfCanvas'),r=c.getBoundingClientRect();
        for(let y=r.top+150;y<r.bottom-100;y+=10)for(let x=r.left+150;x<r.right-50;x+=10){const e=document.elementFromPoint(x,y);if(e===c||e.id==='dfTree'||e.classList.contains('df-sub')||e.classList.contains('df-kids'))return [Math.round(x),Math.round(y)]}''')
    b.call('WebDriver:PerformActions', {'actions': [{'type': 'pointer', 'id': 'mouse', 'parameters': {'pointerType': 'mouse'}, 'actions': [
        {'type': 'pointerMove', 'x': ex, 'y': ey}, {'type': 'pointerDown', 'button': 0}, {'type': 'pointerMove', 'x': ex - 100, 'y': ey - 100, 'duration': 100}, {'type': 'pointerUp', 'button': 0}]}]})
    b.call('WebDriver:ReleaseActions')
    panned = view()
    assert (round(panned[0] - zoomed[0]), round(panned[1] - zoomed[1]), panned[2]) == (-100, -100, zoomed[2]), (panned, zoomed)
    assert b.js("return document.querySelector('#dfmea .df-box.sel')?.textContent.includes('Springs clog')"), 'a pan is not a click on the canvas'
    b.js("document.querySelector('[data-dfa=zoom-reset]').click();return true")
    assert view()[3] == '100%'
    b.js("document.querySelector('[data-dfa=zoom-fit]').click();return true")
    assert view() == fitted
    print('PASS: DFMEA tree pan and zoom', flush=True)

    # Copy a cause with Ctrl+C and paste it beside another; plain text pastes as children, one per line.
    click('loadExample')
    df_select('Seat too thin')
    ctrl('c')
    open_app()  # a reload: the branch comes from the system clipboard, not the page's memory
    df_select('Balance ratio too high')
    ctrl('v')
    d = dfmea()
    copies = [t for depth, t in df_titles(d['root']) if t == 'Seat too thin for 40 bar']
    assert len(copies) == 2, copies
    ids = []
    def collect(n, depth=0):
        if depth == 6: ids.append(n['branch'])
        for k in n['children']: collect(k, depth + 1)
    collect(d['root'])
    assert len(set(ids)) == len(ids) == 8 and 'B-08' in ids, ids
    df_select('Flush flow lost')
    b.js("""window.addEventListener('copy',e=>{e.stopImmediatePropagation();e.preventDefault();
        e.clipboardData.setData('text/plain','Faces run hot\\n\\n  Seal chamber boils\\n')},{capture:true,once:true});return true""")
    ctrl('c')
    ctrl('v')
    effects = [t for depth, t in df_titles(dfmea()['root']) if depth == 5]
    assert 'Faces run hot' in effects and 'Seal chamber boils' in effects, status()
    print('PASS: DFMEA copy and paste of branches, and text as children', flush=True)

    # Both scoring methods: RPN against the limit, and AIAG-VDA Action Priority.
    click('loadExample')
    df_page('risk')
    rows = lambda: b.js("return [...document.querySelectorAll('#dfmea .df-table tbody tr')].map(r=>r.querySelector('.df-id').textContent)")
    assert rows() == ['B-01', 'B-04', 'B-06'], rows()
    b.js("document.querySelector('[data-dfa=filter][data-v=all]').click();return true")
    assert len(rows()) == 7
    # B-03: D4 × max(4,5,7) × POF2 = 56; POF 4 makes 112, above 100.
    b.js("const i=document.querySelector('#dfmea [data-df=rating][data-k=pof][aria-label$=\"B-03\"]');i.value='4';i.dispatchEvent(new Event('change',{bubbles:true}));return true")
    def cause_of(branch, n=None, depth=0):
        n = n or dfmea()['root']
        if depth == 6 and n['branch'] == branch: return n
        for k in n['children']:
            f = cause_of(branch, k, depth + 1)
            if f: return f
    assert cause_of('B-03')['ratings']['rpn']['pof'] == 4
    assert '112' in b.js("return [...document.querySelectorAll('#dfmea .df-table tbody tr')].find(r=>r.textContent.includes('B-03')).textContent")
    # 7 × 4 × 4 = 112 > 100 needs action; at a limit of 112 it is acceptable.
    df_page('structure')
    b.js("document.getElementById('dfCanvas').click();return true")
    b.js("const i=document.getElementById('dfm-limit');i.value='112';i.dispatchEvent(new Event('change',{bubbles:true}));return true")
    assert dfmea()['meta']['limit'] == 112
    b.js("document.querySelector('#dfmea input[data-df=method][value=ap]').click();return true")
    assert dfmea()['meta']['method'] == 'ap'
    df_page('risk')
    b.js("document.querySelector('[data-dfa=filter][data-v=all]').click();return true")
    scores = b.js("return Object.fromEntries([...document.querySelectorAll('#dfmea .df-table tbody tr')].map(r=>[r.querySelector('.df-id').textContent,r.querySelectorAll('.df-score')[0].textContent]))")
    # S8 O6 D6 → H; S8 O3 D5 → M; S8 O2 D4 → L; S9 O3 D7 → H (AIAG-VDA DFMEA table).
    assert scores['B-01'] == 'H' and scores['B-02'] == 'M' and scores['B-03'] == 'L' and scores['B-06'] == 'H', scores
    assert cause_of('B-03')['ratings']['rpn']['pof'] == 4, 'switching the method keeps the other ratings'
    b.js("document.querySelector('[data-dfa=filter][data-v=action]').click();return true")
    assert 'B-05' not in rows(), 'a Medium with a written reason needs no action'
    print('PASS: DFMEA scoring by RPN with a limit, or by Action Priority, switched without losing ratings', flush=True)

    # Actions lower the score; the tracker shows ISO weeks and takes a note for this week.
    click('loadExample')
    df_page('optimise')
    b.js("document.querySelector('#dfmea [data-cause] [data-dfa=add-action]').click();return true")
    assert len(dfmea()['actions']) == 6
    b.js("document.activeElement.value='Thicker seat';document.activeElement.dispatchEvent(new Event('input',{bubbles:true}));return true")
    assert any(a['title'] == 'Thicker seat' for a in dfmea()['actions'])
    df_page('tracker')
    assert b.js("return document.querySelectorAll('#dfmea .df-tracker tbody tr').length") == 6
    weeks = b.js("return [...document.querySelectorAll('#dfmea tr')[3].querySelectorAll('.df-weeks span')].map(s=>s.textContent)")
    assert weeks == ['43', '44', '45', '46', '47', '48'], weeks
    first = dfmea()['actions'][1]['id']
    b.js("document.querySelector(`#dfmea [data-dfa=add-note][data-id=\"${arguments[0]}\"]`).click();document.activeElement.value='Spec agreed';document.activeElement.dispatchEvent(new Event('input',{bubbles:true}));return true", [first])
    notes = dfmea()['actions'][1]['notes']
    assert len(notes) == 1 and notes[0]['text'] == 'Spec agreed' and re.fullmatch(r'\d{4}-W\d{2}', notes[0]['week'])
    b.js("const s=document.querySelector(`#dfmea select[data-id=\"${arguments[0]}\"]`);s.value='cancelled';s.dispatchEvent(new Event('change',{bubbles:true}));return true", [dfmea()['actions'][0]['id']])
    assert dfmea()['actions'][0]['status'] == 'cancelled'
    print('PASS: DFMEA actions, and the tracker with ISO weeks and weekly notes', flush=True)

    # Print and Word, and saving: a DFMEA file opens in the DFMEA module from the RCA.
    click('loadExample')
    b.js("window.print=()=>{};return true")
    assert b.js("return getComputedStyle(document.getElementById('printDfmea')).display") != 'none'
    click('printDfmea')
    report = b.js("return document.getElementById('report').textContent")
    assert 'DFMEA-SEAL-03' in report and 'B-07' in report and 'Cyclone separator' in report, report[:300]
    z = docx('exportDocxDfmea')
    text = ''.join(t.text or '' for t in ET.fromstring(z.read('word/document.xml')).iter(W + 't'))
    assert 'CS-50 cartridge seal redesign' in text and 'Vapour-pressure margin check' in text and 'B-07' in text
    assert '<dc:title>DFMEA: CS-50 cartridge seal redesign</dc:title>' in z.read('docProps/core.xml').decode()
    b.js('__downloads.length=0;return true')
    click('saveProject')
    file = json.loads(b.async_js('const done=arguments[arguments.length-1];const wait=()=>__downloads.length?__downloads.at(-1).text().then(done):setTimeout(wait,50);wait()'))
    assert file['type'] == 'causeway-dfmea' and len(file['actions']) == 5
    click('moduleRca')
    assert module() == 'rca' and rca() == rca_before
    assert b.js("return getComputedStyle(document.getElementById('printDfmea')).display") == 'none'
    file['root']['title'] = 'Opened from the RCA'
    load(file)
    assert module() == 'dfmea' and dfmea()['root']['title'] == 'Opened from the RCA'
    assert rca() == rca_before
    open_app()
    assert module() == 'dfmea' and dfmea()['root']['title'] == 'Opened from the RCA', 'the module and the DFMEA come back after a reload'
    click('moduleRca')
    print('PASS: DFMEA print, Word, save, and open from either module', flush=True)

    # ---- Two problems in one investigation, each with its own tree, statement, and Is / Is Not ----
    tree = json.loads(json.dumps(rca()))
    tree['meta']['style'] = 'tree'
    load(tree)
    first_ids = {n['id'] for n in rca()['nodes']}
    first_spec = rca()['specification']
    click('addTree')
    r = rca(); root = r['nodes'][-1]
    assert [x['effectId'] for x in r['moreProblems']] == [root['id']] and root['kind'] == 'effect'
    assert r['moreProblems'][0]['when'] == '' and len(r['moreProblems'][0]['specification']['rows']) == len(first_spec['rows'])
    assert b.js("return document.getElementById('addTree').textContent") == '+ Problem'
    assert b.js("return document.activeElement.id") == 'nodeTitle', 'the new primary effect is ready to name'
    type_into('nodeTitle', 'Bearing overheated')
    b.js("document.activeElement.blur();return true")
    select('Bearing overheated')
    key('Tab')
    cause = rca()['nodes'][-1]
    assert cause['kind'] == 'cause' and next(l for l in rca()['links'] if l['causeId'] == cause['id'])['effectId'] == root['id']
    ys = b.js("""return [...document.querySelectorAll('#chart .node')].map(g=>[g.dataset.id,+g.getAttribute('transform').split(' ')[1].replace(')','')])""")
    top_of_second = dict(ys)[root['id']]
    assert all(y < top_of_second for i, y in ys if i in first_ids), 'the second tree is drawn below the first'
    key('Escape')
    assert b.js("return document.querySelector('#properties [data-root]').value") == 'Bearing overheated'
    # Problem definition: a statement per problem, with its own when and where.
    page('problem')
    assert b.js("return document.querySelectorAll('#records [data-act=remove-problem]').length") == 1, 'only a further problem can be removed'
    set_field('moreProblems', root['id'], 'when', '15 Sep 2026, after the restart')
    set_field('moreProblems', root['id'], 'where', 'P-101A, inboard bearing')
    assert rca()['moreProblems'][0]['when'] == '15 Sep 2026, after the restart' and rca()['problem']['when'] == tree['problem']['when']
    # Is / Is Not: tabs pick the problem; each has its own rows and its own causes to test.
    page('spec')
    tabs = b.js("return [...document.querySelectorAll('#records [data-act=spec-problem]')].map(t=>t.dataset.id)")
    assert tabs == [r['problem']['primaryEffectId'], root['id']], tabs
    act('spec-problem', root['id'])
    row = rca()['moreProblems'][0]['specification']['rows'][0]['id']
    set_field('specRows', row, 'is', 'Inboard bearing, 95 °C')
    set_field('specRows', row, 'isNot', 'Outboard bearing, 60 °C')
    act('spec-problem', root['id'])
    options = b.js("return [...document.querySelectorAll('#records select[data-act=spec-add-test] option')].map(o=>o.value).filter(Boolean)")
    assert options == [cause['id']], 'only the causes in this problem\'s tree can be tested'
    b.js("const el=document.querySelector('#records select[data-act=spec-add-test]');el.value=arguments[0];el.dispatchEvent(new Event('change',{bubbles:true}));return true", [cause['id']])
    mark = lambda: b.js('document.querySelector(`#records [data-act=spec-mark][data-id="${arguments[0]}"][data-row="${arguments[1]}"]`).click();return true', [cause['id'], row])
    mark(); mark(); mark()
    sp2 = rca()['moreProblems'][0]['specification']
    assert sp2['rows'][0]['is'] == 'Inboard bearing, 95 °C' and sp2['tests'] == [{'causeId': cause['id'], 'marks': {row: 'no'}}]
    assert rca()['specification'] == first_spec, 'the first problem\'s Is / Is Not is untouched'
    assert any('of the Is / Is Not of Problem 2' in i['text'] for i in all_issues()), 'a failed fact names its problem'
    # The reports give each problem its statement and its Is / Is Not.
    b.js("window.print=()=>{};return true")
    click('printReport'); click('printFull')
    report = b.js("return document.getElementById('report').textContent")
    assert 'Problem 2' in report and 'P-101A, inboard bearing' in report and 'Outboard bearing, 60 °C' in report
    click('printReport'); click('print8d')
    report = b.js("return document.getElementById('report').textContent")
    assert 'Is / Is Not, problem 2' in report and '15 Sep 2026, after the restart' in report
    page('chart')
    # A ruled-out cause has no strike line over its title, and says RULED OUT on its top line.
    select(cause['title'])
    key('3', alt=True)
    assert next(n for n in rca()['nodes'] if n['id'] == cause['id'])['status'] == 'ruled-out'
    node = f"#chart .node[data-id='{cause['id']}']"
    assert b.js(f'return document.querySelectorAll("{node} line").length') == 0, 'no strikethrough'
    assert 'RULED OUT' in b.js(f'return document.querySelector("{node}").textContent')
    # Kept in the file, and deleting the second primary effect takes its problem with it.
    open_app()
    assert rca()['moreProblems'][0]['specification']['tests'][0]['causeId'] == cause['id']
    select('Bearing overheated')
    key('Delete')
    r = rca()
    assert r['moreProblems'] == [] and not {root['id'], cause['id']} & {n['id'] for n in r['nodes']}
    assert {n['id'] for n in r['nodes']} == first_ids, 'the first tree is untouched'
    click('undo')
    page('problem')
    act('remove-problem', root['id'])
    assert rca()['moreProblems'] == [], 'removed from the problem definition too'
    bad = json.loads(json.dumps(r))
    bad['moreProblems'] = [{'effectId': 'missing'}, {'effectId': r['problem']['primaryEffectId']}, {'effectId': next(iter(first_ids - {r['problem']['primaryEffectId']}))}]
    load(bad)
    assert rca()['moreProblems'] == [], 'unknown, duplicate, or cause problems are dropped on open'
    page('chart')
    print('PASS: two problems in one investigation, each with its own tree, statement, and Is / Is Not; ruled-out causes not struck through', flush=True)

    # ---- No network ----
    assert b.js("return performance.getEntriesByType('resource').filter(r=>!r.name.startsWith('blob:')&&!r.name.startsWith('data:')).length") == 0, 'no resources were fetched'
    assert b.js('return __violations') == []
    assert b.js("return document.querySelector('meta[http-equiv=Content-Security-Policy]').content").startswith("default-src 'none'")
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    assert not re.search(r'''(?:src|href)\s*=\s*["']?(?:https?:)?//''', html), 'no remote references in the page'
    print('PASS: no network requests', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, help='Connect to an existing temporary Firefox')
    args = parser.parse_args()
    process = None
    b = None
    with tempfile.TemporaryDirectory(prefix='causeway-test-') as profile:
        try:
            port = args.port
            if port is None:
                firefox = shutil.which('firefox')
                if not firefox:
                    raise RuntimeError('Firefox is required to run this test')
                with socket.socket() as sock:
                    sock.bind(('127.0.0.1', 0))
                    port = sock.getsockname()[1]
                Path(profile, 'user.js').write_text(f'user_pref("marionette.port", {port});\n')
                process = subprocess.Popen([firefox, '--headless', '--marionette', '--no-remote', '--profile', profile],
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + 20
            while True:
                try:
                    b = Browser(port)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(.2)
            b.call('WebDriver:NewSession')
            b.call('WebDriver:SetWindowRect', {'width': 1440, 'height': 1000})
            check_syntax(b)
            run_tests(b)
        finally:
            if b:
                try:
                    b.call('WebDriver:DeleteSession')
                finally:
                    b.socket.close()
            if process:
                process.terminate()
                process.wait(timeout=10)


if __name__ == '__main__':
    main()

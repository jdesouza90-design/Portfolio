#!/usr/bin/env python3
"""Measure the two .Button sheets and write assets/btn-sheet-rebuild.json, the
wires the rebuild draws on the Agentic design system audit page (main.js
initRebuild).

Every wire is the rect of one element, found in the pixels of
assets/btn-sheet-before.webp (1600 x 1000) and assets/btn-sheet-after.webp
(1800 x 866). A wire holds four rects, one per state the page passes through:
the old sheet, the old sheet with its left- and right-icon rows gone (step 1),
the three new sheets with Danger, Brand and Action still carrying a disabled
cell (step 2), and the new sheets as they shipped (step 3). A missing rect means
the element is not there in that state: it collapses in place, or grows in.

The grid positions below are measured from the two images once. Re-run this
after replacing either image (it needs Pillow, numpy and scipy), then
`python3 stamp.py`.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage as nd

BEFORE, AFTER, OUT = 'assets/btn-sheet-before.webp', 'assets/btn-sheet-after.webp', 'assets/btn-sheet-rebuild.json'
b = np.asarray(Image.open(BEFORE).convert('RGB')).astype(int)
a = np.asarray(Image.open(AFTER).convert('RGB')).astype(int)


def bbox_in(fg, x0, y0, x1, y1):
    sub = fg[y0:y1, x0:x1]
    if sub.sum() < 3:
        return None
    yy, xx = np.where(sub)
    return [int(x0 + xx.min()), int(y0 + yy.min()), int(xx.max() - xx.min() + 1), int(yy.max() - yy.min() + 1)]


# ---- The old sheet: 8 column groups (Solid, Ghost, Borderless, Link, then the
# same four in the dark theme) x 3 sizes; 9 blocks (Primary and Neutral in
# default, hover, active and disabled, then Danger default) x 4 rows (label,
# left icon, right icon, icon only). The dark theme sits on a navy panel.
PANEL = (837, 56, 1505, 1000)
bg = np.zeros_like(b); bg[:] = [241, 243, 244]; bg[PANEL[1]:PANEL[3], PANEL[0]:PANEL[2]] = [2, 25, 53]
mask = np.zeros(b.shape[:2], bool)
mask[50:58, 150:] = True; mask[50:, 154:162] = True           # the dashed frame
mask[:, 834:840] = True; mask[:, 1502:1508] = True            # the panel's edges
fg_hi = (np.abs(b - bg).sum(2) > 40) & ~mask
fg_lo = (np.abs(b - bg).sum(2) > 16) & ~mask                  # dark-theme disabled cells are faint
SX = [[165, 210, 261], [336, 378, 430], [506, 550, 602], [674, 717, 768],
      [868, 911, 961], [1038, 1080, 1132], [1207, 1250, 1301], [1376, 1419, 1470]]
BY = [70, 175, 281, 386, 491, 597, 702, 807, 912]
flat = sorted(x for g in SX for x in g) + [1505]
before = []
for g in range(8):
    for s in range(3):
        x0 = SX[g][s] - 5
        x1 = 830 if (g, s) == (3, 2) else 1500 if (g, s) == (7, 2) else flat[flat.index(SX[g][s]) + 1] - 5
        for k in range(9):
            for r in range(4):
                yc = BY[k] + 24 * r
                rect = bbox_in(fg_hi, x0, yc - 10, x1, min(yc + 10, 1000)) or bbox_in(fg_lo, x0, yc - 10, x1, min(yc + 10, 1000))
                if rect:
                    before.append(dict(g=g, s=s, k=k, r=r, rect=rect))

# its labels: the column heads along the top, the colors and states down the left
fg = (np.abs(b - bg).sum(2) > 40)
HEADS = {167: 'Solid', 336: 'Ghost', 505: 'Borderless', 672: 'Link', 869: 'Solid, Dark',
         1038: 'Ghost, Dark', 1208: 'Borderless, Dark', 1377: 'Link, Dark'}
STATES = ['Default', 'Hover', 'Active', 'Disabled'] * 2 + ['Default']
labels = []
lab, _ = nd.label(nd.binary_dilation(fg[0:40, :], iterations=3))
for sl in nd.find_objects(lab):
    rect = bbox_in(fg, sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
    if rect:
        labels.append(dict(kind='head', text=HEADS[min(HEADS, key=lambda x: abs(x - rect[0]))], rect=rect))
side = fg[58:1000, 0:150]
lab, _ = nd.label(nd.binary_dilation(side, iterations=3))
for sl in nd.find_objects(lab):
    rect = bbox_in(side, sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
    if not rect:
        continue
    rect[1] += 58
    if rect[0] < 60:
        labels.append(dict(kind='group', text='Primary' if rect[1] < 400 else 'Neutral', rect=rect))
    else:
        k = min(range(9), key=lambda k: abs(BY[k] + 36 - (rect[1] + rect[3] / 2)))
        labels.append(dict(kind='state', text=STATES[k], k=k, rect=rect))

# ---- The new sheets: Button (10 columns), Icon Button (8) and Link (4), each
# in five states (default, hover, active, focus, disabled) at three sizes.
fg_a = np.abs(a - 255).sum(2) > 14
BTN_X = [74.5, 164, 254, 343.5, 433.5, 523, 613, 702.5, 792.5, 882]
BTN_Y = [[52, 102, 152, 202, 252], [338, 388, 438, 488, 538], [610, 660, 710, 760, 810]]
SHEETS = {
    'button': (BTN_X, BTN_Y, 44, [48, 48, 48]),
    'icon': ([1047, 1096.5, 1146.5, 1196.5, 1246.5, 1296, 1346, 1396],
             [[52, 102, 152, 202, 252], [328, 373, 418, 463, 508], [573, 623, 673, 723, 773]], 24, [48, 44, 48]),
    'link': ([1515, 1590, 1665, 1740],
             [[42, 73, 104.5, 135.5, 166.5], [230, 268, 305, 343, 380], [443, 480, 517.5, 555, 592.5]], 36, [30, 36, 36]),
}
after = {}
for comp, (xs, ys, hx, pitch) in SHEETS.items():
    for z in range(3):
        for row, yc in enumerate(ys[z]):
            for col, xc in enumerate(xs):
                after[(comp, z, row, col)] = bbox_in(fg_a, max(int(xc - hx), 0), int(yc - pitch[z] / 2), min(int(xc + hx), 1800), int(yc + pitch[z] / 2))

# ---- Wires
specs, spec_ix, wires, used = [], {}, [], set()
GROUP = {'button': 0, 'icon': 1, 'link': 2}


def sp(text, kind, ic):
    key = (text, kind, ic)
    if key not in spec_ix:
        spec_ix[key] = len(specs); specs.append(list(key))
    return spec_ix[key]


def wire(r, s, win, act=0, hs=0, c=-1):
    wires.append(dict(r=r, s=s, w=win, a=act, h=hs, c=c))


def after_spec(comp, row, col):
    kind = 'icon' if comp == 'icon' else 'text' if comp == 'link' or (comp == 'button' and col == 6 and row == 0) else 'box'
    return sp('' if comp == 'icon' else 'Click me', kind, 3 if comp == 'icon' else 0)


# the old cells. Which new cell each one lands in is chosen by look (Solid
# Primary to the blue column, and so on); cells with no match collapse in place.
BTN_COL = {(0, 'P'): 0, (0, 'N'): 1, (1, 'P'): 2, (1, 'N'): 3, (2, 'N'): 6, (0, 'D'): 7}
ICO_COL = {(0, 'P'): 0, (0, 'N'): 1, (1, 'P'): 2, (1, 'N'): 3, (2, 'P'): 6, (2, 'N'): 5}
for e in before:
    g, s, k, r = e['g'], e['s'], e['k'], e['r']
    x, y, w, h = e['rect']
    s0 = [x, y, w, h]
    s1 = None if r in (1, 2) else [x, y - 48 * k - (48 if r == 3 else 0), w, h]
    color = 'P' if k < 4 else 'N' if k < 8 else 'D'
    row, z = [0, 1, 2, 4][k % 4 if k < 8 else 0], 2 - s
    tgt = comp = None
    if s1 and g < 4:
        if g == 3:
            if r == 0 and color in 'PN':
                comp, col = 'link', 'PN'.index(color)
        elif r == 0 and (g, color) in BTN_COL:
            comp, col = 'button', BTN_COL[(g, color)]
        elif r == 3 and (g, color) in ICO_COL:
            comp, col = 'icon', ICO_COL[(g, color)]
        if comp and after.get((comp, z, row, col)):
            tgt = after[(comp, z, row, col)]; used.add((comp, z, row, col))
    s_before = sp('' if r == 3 else 'Button', 'box' if g in (0, 1, 4, 5) else 'text', r)
    s_after = after_spec(comp, row, col) if tgt else s_before
    w1 = [0.3, 0.65] if r in (1, 2) else [0.55, 1.0]            # step 1: the icon rows collapse, then the rest closes up
    if tgt is None:
        w2 = [0.04, 0.3]                                           # step 2: what has nowhere to go folds away first
    elif comp == 'link':
        w2 = [0.2 + 0.012 * row, 0.48 + 0.012 * row]              # then Link, then Icon Button, then Button, size by size
    elif comp == 'icon':
        o = 0.04 * z + 0.01 * row; w2 = [0.32 + o, 0.6 + o]
    else:
        o = 0.05 * z + 0.01 * row; w2 = [0.44 + o, 0.72 + o]
    act, hs = 1 | 2, 0
    if (g, s, k) == (0, 2, 0) and r in (1, 2):
        hs |= 1                                                    # step 1 selects the large Solid Primary icon rows
    if tgt and comp == 'button' and col == 0 and row == 4:
        act |= 4; hs |= 4                                          # step 3 selects Primary's disabled cells
    wire([s0, s1, tgt, tgt], [s_before, s_before, s_after, s_after], [w1, w2, [0, 1]], act, hs, GROUP[comp] if tgt else -1)

for L in labels:
    x, y, w, h = L['rect']
    dy = 0 if L['kind'] == 'head' else -24 - 48 * L['k'] if L['kind'] == 'state' else -96 if L['text'] == 'Primary' else -288
    s = sp(L['text'], 'lbl', 0)
    wire([[x, y, w, h], [x, y + dy, w, h], None, None], [s] * 4, [[0.55, 1.0], [0.0, 0.2], [0, 1]], (0 if L['kind'] == 'head' else 1) | 2)
wire([[836, 56, 670, 944]] * 2 + [None, None], [sp('', 'panel', 0)] * 4, [[0, 1], [0.04, 0.3], [0, 1]], 2)
wire([[157.5, 53, 1442.5, 947]] * 2 + [None, None], [sp('', 'frame', 0)] * 4, [[0, 1], [0.0, 0.2], [0, 1]], 2)

# the new cells nothing lands in (the focus row, Brand, Action) grow in place
for (comp, z, row, col), rect in after.items():
    if rect and (comp, z, row, col) not in used:
        wire([None, None, rect, rect], [after_spec(comp, row, col)] * 4, [[0, 1], [0.8, 1.0], [0, 1]], 2, 0, GROUP[comp])

# Neither export shows Danger, Brand and Action with a disabled cell of their
# own, so step 2 ends on Primary's disabled cell copied into their columns
# ("the same disabled look defined again and again") and step 3 removes them.
copies = []
for z in range(3):
    src = after[('button', z, 4, 0)]
    for col in (7, 8, 9):
        dx = BTN_X[col] - BTN_X[0]
        wire([None, None, [round(src[0] + dx, 1), src[1], src[2], src[3]], None], [sp('Click me', 'box', 0)] * 4,
             [[0, 1], [0.8, 1.0], [0.2, 0.6]], 2 | 4, 0, 0)
        copies.append(dict(sx=int(BTN_X[0] - 44), sy=int(BTN_Y[z][4] - 24), dx=int(BTN_X[col] - 44), w=88, h=48))


def union(rs, pad):
    x0 = min(r[0] for r in rs) - pad; y0 = min(r[1] for r in rs) - pad
    return [x0, y0, max(r[0] + r[2] for r in rs) + pad - x0, max(r[1] + r[3] for r in rs) + pad - y0]


grp = {c: union([v for key, v in after.items() if key[0] == c and v], 10) for c in SHEETS}
row_r = {e['r']: e['rect'] for e in before if (e['g'], e['s'], e['k']) == (0, 2, 0)}
k0_top = min(e['rect'][1] for e in before if e['k'] == 0)
k0_bot = max(e['rect'][1] + e['rect'][3] for e in before if e['k'] == 0 and e['r'] == 3)
marks = dict(
    s1=dict(guides=[row_r[1][1] + row_r[1][3] / 2, row_r[2][1] + row_r[2][3] / 2], gx=[162, 1505],
            dim=dict(x=1545, top=k0_top, bot0=k0_bot, bot1=k0_bot - 48), label=dict(x=1520, y=40, text='Icon property · ×4')),
    s2=dict(groups=[dict(r=grp['button'], text='Button · 141', c=0), dict(r=grp['icon'], text='Icon Button · 120', c=1),
                    dict(r=grp['link'], text='Link · 60', c=2)],
            dim=dict(x0=grp['button'][0], x1=grp['link'][0] + grp['link'][2], y=945, text='2,304 → 321 variants')),
    s3=dict(src=after[('button', 0, 4, 0)], slots=[w['r'][2] for w in wires if w['a'] & 4 and w['r'][3] is None][:3],
            label1='Danger · Brand · Action', label2='Reuses Primary disabled'),
)
# the compacted old sheet (after step 1) is cut from the old image: the rows
# that stay, moved up, and the labels down the left, moved to their blocks
strips = [[BY[k] + 24 * r - 12, 24, BY[k] + 24 * r - 12 - 48 * k - (48 if r == 3 else 0)] for k in range(9) for r in (0, 3)]
labs = []
for L in labels:
    if L['kind'] != 'head':
        x, y, w, h = L['rect']
        dy = -24 - 48 * L['k'] if L['kind'] == 'state' else -96 if L['text'] == 'Primary' else -288
        labs.append([x - 3, y - 3, w + 6, h + 6, y - 3 + dy])

data = dict(frame=[1800, 1000], specs=specs, wires=wires, marks=marks,
            focus=[[158, 56, 1349, 944], [8, 8, 1784, 984], grp['button']],
            strips=strips, labs=labs, copies=copies, clean_row=791)
with open(OUT, 'w') as f:
    json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
print('%s: %d wires, %d before cells, %d after cells' % (OUT, len(wires), len(before), sum(1 for v in after.values() if v)))

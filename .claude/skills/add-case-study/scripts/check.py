#!/usr/bin/env python3
"""Check that every case study is wired into the site correctly.

Run from the repo root after adding or editing a case study:

    python3 .claude/skills/add-case-study/scripts/check.py [--no-validate]

It reads work/*.html, work.html, index.html, styles.css, README.md and the skill's own
template, and reports the things that break silently: a next-link ring with a gap, a prev
arrow that doesn't point back, a page with no ground, an image with no size, an asset that
isn't there, nav drift between pages, a stale count in the README, a placeholder left in.
Then it runs html-validate on every page unless --no-validate is given. Exit status is 1 if
anything is an error.
"""
import glob
import os
import re
import subprocess
import sys

ROOT = os.getcwd()
SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors, warnings = [], []


def err(msg): errors.append(msg)
def warn(msg): warnings.append(msg)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def strip_stamps(s):
    return re.sub(r"\?v=[a-f0-9]{8}", "", s)


def block(html, start, end):
    i = html.find(start)
    j = html.find(end, i)
    return html[i:j + len(end)] if i >= 0 and j >= 0 else None


pages = sorted(glob.glob("work/*.html"))
if not pages:
    print("no work/*.html found; run from the repo root")
    sys.exit(2)
slugs = [os.path.splitext(os.path.basename(p))[0] for p in pages]
html = {p: read(p) for p in pages}
work_html = read("work.html")
index_html = read("index.html")
css = read("styles.css")
readme = read("README.md") if os.path.exists("README.md") else ""
template = read(os.path.join(SKILL, "assets", "case-study.template.html"))

# ---- Conflict markers and leftover placeholders -------------------------------------
for p, s in list(html.items()) + [("work.html", work_html), ("index.html", index_html), ("styles.css", css)]:
    if re.search(r"^(<<<<<<<|=======|>>>>>>>) ", s, re.M):
        err(f"{p}: git conflict markers present")
    for m in sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", s))):
        err(f"{p}: placeholder {m} left in")

# ---- Each page: class, ground, images, assets, next and prev links ----------------------
next_of, prev_of = {}, {}
for p, s in html.items():
    slug = os.path.splitext(os.path.basename(p))[0]
    m = re.search(r'<body class="(case-[a-z0-9-]+)"', s)
    if not m:
        err(f"{p}: <body> has no case-* class")
        cls = None
    else:
        cls = m.group(1)
        if not re.search(r"^\." + re.escape(cls) + r"\s*\{", css, re.M):
            err(f"{p}: no .{cls} ground rule in styles.css")
        if f'class="case-row {cls}"' not in work_html:
            err(f"{p}: work.html has no .case-row.{cls}")

    # Next link: the plain <a> in p.cs-next-title, after the .cs-prev-link one (which is "previous")
    nm = re.search(r'<p class="t-title cs-next-title">(?:<a class="cs-prev-link"[^>]*>.*?</a>)?\s*'
                   r'<a href="([a-z0-9-]+)\.html">', s, re.S)
    if not nm:
        err(f"{p}: no next-case-study link")
    else:
        next_of[slug] = nm.group(1)
        if nm.group(1) not in slugs:
            err(f"{p}: next link points to missing page {nm.group(1)}.html")
        if nm.group(1) == slug:
            err(f"{p}: next link points to itself")

    # Prev link: the bare-arrow <a class="cs-prev-link"> that opens the same <p>
    pm = re.search(r'<p class="t-title cs-next-title">\s*<a class="cs-prev-link" href="([a-z0-9-]+)\.html"', s)
    if not pm:
        err(f"{p}: no previous-case-study link")
    else:
        prev_of[slug] = pm.group(1)
        if pm.group(1) not in slugs:
            err(f"{p}: prev link points to missing page {pm.group(1)}.html")

    # Images
    hero_end = s.find("</section>", s.find('class="cs-hero"'))
    for im in re.finditer(r"<img\b[^>]*>", s):
        tag = im.group(0)
        where = f"{p}:{s[:im.start()].count(chr(10)) + 1}"
        if ' alt="' not in tag and " alt=" not in tag:
            err(f"{where}: <img> without alt")
        if ' width="' not in tag or ' height="' not in tag:
            err(f"{where}: <img> without width/height")
        if 'decoding="async"' not in tag:
            warn(f"{where}: <img> without decoding=\"async\"")
        in_hero = im.start() < hero_end
        if in_hero and 'loading="lazy"' in tag:
            warn(f"{where}: hero image is lazy-loaded (the others are not)")
        if not in_hero and 'loading="lazy"' not in tag:
            warn(f"{where}: image below the hero without loading=\"lazy\"")
        src = re.search(r'src="([^"]+)"', tag)
        if src:
            path = src.group(1)
            if path.startswith("../assets/"):
                if "?v=" not in path:
                    warn(f"{where}: {path} has no ?v= stamp (run python3 stamp.py)")
                if not os.path.exists(strip_stamps(path)[3:]):
                    err(f"{where}: asset not found: {strip_stamps(path)}")
            elif not path.startswith(("http", "data:")):
                warn(f"{where}: image path outside assets/: {path}")
        anim = re.search(r'data-anim="([^"]+)"', tag)
        if anim and not os.path.exists(strip_stamps(anim.group(1))[3:]):
            err(f"{where}: walkthrough animation not found: {anim.group(1)}")

    # Meta
    if f"https://john-desouza.com/work/{slug}.html" not in s:
        err(f"{p}: og:url does not match the file name")
    if re.search(r'<meta name="description" content="">', s):
        err(f"{p}: empty meta description")
    if "data-rise" in s and s.count("data-rise") != 3:
        warn(f"{p}: expected three data-rise elements in the hero, found {s.count('data-rise')}")

    # Inline styles (html-validate also enforces this, but the message here is clearer)
    for st in re.findall(r'style="([^"]*)"', s):
        if not re.fullmatch(r"\s*--(i|crop-pos)\s*:[^;]*;?\s*", st):
            err(f"{p}: inline style not allowed: style=\"{st}\"")

# ---- The ring ---------------------------------------------------------------------------
if next_of and len(next_of) == len(slugs):
    start = slugs[0]
    seen, cur = [], start
    while cur not in seen and cur in next_of:
        seen.append(cur)
        cur = next_of[cur]
    if cur != start or len(seen) != len(slugs):
        missing = sorted(set(slugs) - set(seen))
        err("next-case-study links do not form one ring over every page; "
            f"followed {' → '.join(seen)} → {cur}; not reached: {missing or 'none'}")
for slug, prev in prev_of.items():
    if prev in next_of and next_of[prev] != slug:
        err(f"work/{slug}.html: prev link points to {prev}.html, whose next link is "
            f"{next_of[prev]}.html, not this page")

# ---- Index rows -------------------------------------------------------------------------
for name, s, root_rel in (("work.html", work_html, ""), ("index.html", index_html, "")):
    for m in re.finditer(r'<a class="case-row (case-[a-z0-9-]+)" href="([^"]+)"', s):
        cls, href = m.groups()
        if not os.path.exists(href):
            err(f"{name}: row {cls} links to missing {href}")
        if not re.search(r"^\." + re.escape(cls) + r"\s*\{", css, re.M):
            err(f"{name}: row {cls} has no ground rule in styles.css")
    for im in re.finditer(r'<img\b[^>]*src="(assets/[^"?]+)[^"]*"[^>]*>', s):
        if not os.path.exists(im.group(1)):
            err(f"{name}: asset not found: {im.group(1)}")
for slug in slugs:
    if f'href="work/{slug}.html"' not in work_html:
        err(f"work.html: no row for work/{slug}.html")
order_index = [m.group(1) for m in re.finditer(r'href="work/([a-z0-9-]+)\.html"', work_html)]
if order_index and next_of:
    ring = [order_index[0]]
    while len(ring) < len(order_index) and next_of.get(ring[-1]) not in ring:
        ring.append(next_of[ring[-1]])
    if ring != order_index:
        warn("the next-link ring runs in a different order from work.html: "
             f"ring {' → '.join(ring)}; index {' → '.join(order_index)}")

# ---- Nav and head drift ---------------------------------------------------------------
ref = pages[0]
ref_nav = strip_stamps(block(html[ref], '<header class="nav">', "</header>"))
ref_head = [strip_stamps(l) for l in html[ref].split("\n") if l.startswith(("<link", "<script defer", '<meta name="twitter'))]
for p, s in html.items():
    if strip_stamps(block(s, '<header class="nav">', "</header>")) != ref_nav:
        err(f"{p}: nav differs from {ref}")
    head = [strip_stamps(l) for l in s.split("\n") if l.startswith(("<link", "<script defer", '<meta name="twitter'))]
    if head != ref_head:
        err(f"{p}: head boilerplate (icons, fonts, stylesheet, insights) differs from {ref}")
t_nav = strip_stamps(block(template, '<header class="nav">', "</header>"))
if t_nav != ref_nav:
    warn("the skill's template nav differs from the live pages; update assets/case-study.template.html")
t_head = [strip_stamps(l) for l in template.split("\n") if l.startswith(("<link", "<script defer", '<meta name="twitter'))]
if t_head != ref_head:
    warn("the skill's template head boilerplate differs from the live pages; update assets/case-study.template.html")

# ---- README count -----------------------------------------------------------------------
words = {3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"}
n = len(slugs)
for m in re.finditer(r"all (\w+) case studies", readme):
    if m.group(1) not in (words.get(n), str(n)):
        err(f"README.md says 'all {m.group(1)} case studies' but there are {n}")
for slug in slugs:
    if f"work/{slug}.html" not in readme:
        warn(f"README.md structure block does not list work/{slug}.html")

# ---- Stamp freshness --------------------------------------------------------------------
import hashlib
def h(path): return hashlib.md5(open(path, "rb").read()).hexdigest()[:8]
css_h, js_h = h("styles.css"), h("main.js")
for p, s in list(html.items()) + [("work.html", work_html), ("index.html", index_html)]:
    m = re.search(r'styles\.css\?v=([a-f0-9]+)', s)
    if m and m.group(1) != css_h:
        warn(f"{p}: styles.css stamp is stale (run python3 stamp.py)")
    m = re.search(r'main\.js\?v=([a-f0-9]+)', s)
    if m and m.group(1) != js_h:
        warn(f"{p}: main.js stamp is stale (run python3 stamp.py)")

# ---- Report -----------------------------------------------------------------------------
for e in errors: print("ERROR   " + e)
for w in warnings: print("warning " + w)
print(f"{len(slugs)} case studies, {len(errors)} errors, {len(warnings)} warnings")

if "--no-validate" not in sys.argv:
    print("\nhtml-validate:")
    r = subprocess.run(["npx", "html-validate", "index.html", "work.html", *pages])
    if r.returncode != 0:
        errors.append("html-validate failed")
    else:
        print("clean")

sys.exit(1 if errors else 0)

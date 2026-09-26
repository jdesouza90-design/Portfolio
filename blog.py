#!/usr/bin/env python3
"""Build the blog from blog/posts/*.html.

A post is one content file: a JSON front-matter comment, then the body as an
HTML fragment. This script renders each one into blog/<slug>.html on the shared
chrome, rebuilds the blog index, the sitemap and the RSS feed, and wires the
next-post ring. It is a dev-time generator like stamp.py, not a build step: the
output is committed and the deployed site stays static.

    python3 blog.py            build everything
    python3 blog.py --check    fail if anything is out of date (no writes)

The chrome (head, nav, closing band, footer) lives here, once. If the nav or the
footer changes on the rest of the site, change it here and re-run, or the blog
drifts away from the pages around it.
"""
import json, re, sys, glob, os, html, datetime, hashlib, math

SITE = "https://john-desouza.com"
AUTHOR = "John DeSouza"
WPM = 225

# label (the nav and the group heading), chip class, and a short form for a card.
PILLARS = {
    "leadership": ("Design leadership",             "pillar",              "Leadership"),
    "craft":      ("Where product design is going", "pillar pillar-craft", "The craft"),
    "fintech":    ("Fintech, web3 and trust",       "pillar pillar-fintech", "Fintech"),
}

# Who the author is, for search engines and language models. Kept in step with
# the Person node in index.html, which shares the @id.
PERSON_DESC = ("Director of Product Design with 13 years across consumer lending (Best Egg), "
               "blockchain infrastructure (Chainlink Labs) and enterprise identity (Auth0).")
KNOWS_ABOUT = ["Product design", "Design leadership", "Design systems", "Fintech",
               "Consumer lending", "Web3", "Stablecoins", "Open banking",
               "Digital identity", "AI in product design"]

# Pages outside the blog that belong in the sitemap, with their change weight.
STATIC_PAGES = [("/", "1.0"), ("/work.html", "0.9"), ("/blog.html", "0.9")]
# The same pages described for llms.txt. /work/ stays out: it is gated.
LLM_PAGES = [
    ("/", "Home", "Who John is, the case studies at a glance, how he leads and how to reach him."),
    ("/work.html", "Work", "The case studies from Best Egg, Chainlink Labs and Auth0, each with the business result. The pages themselves are password gated."),
    ("/blog.html", "Blog", "Positions on design leadership, where product design is heading, and trust in fintech and web3."),
]


def stamp(path):
    """Content hash for a cache-busting ?v=, matching stamp.py."""
    return hashlib.md5(open(path, "rb").read()).hexdigest()[:8]


def read_posts():
    posts = []
    for path in sorted(glob.glob("blog/posts/*.html")):
        raw = open(path).read()
        m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*(.*)", raw, re.S)
        if not m:
            sys.exit("%s: no JSON front-matter comment at the top" % path)
        try:
            meta = json.loads(m.group(1))
        except json.JSONDecodeError as e:
            sys.exit("%s: front matter is not valid JSON (%s)" % (path, e))
        body = m.group(2).strip()
        slug = os.path.splitext(os.path.basename(path))[0]

        for key in ("title", "description", "pillar", "date", "lede", "claim"):
            if not meta.get(key):
                sys.exit("%s: front matter is missing %s" % (path, key))
        if meta["pillar"] not in PILLARS:
            sys.exit("%s: pillar must be one of %s" % (path, ", ".join(PILLARS)))
        try:
            datetime.datetime.fromisoformat(meta["date"])
        except ValueError:
            sys.exit("%s: date must be ISO 8601 with an offset, e.g. "
                     "2026-09-22T09:00:00-04:00" % path)

        words = len(re.findall(r"\w+", re.sub(r"<[^>]+>", " ", body)))
        for key in ("title", "description", "lede", "claim"):
            meta[key] = smarten(meta[key])
        meta.update(slug=slug, body=smarten_html(body), src=path, words=words,
                    minutes=max(1, round(words / WPM)))
        posts.append(meta)

    posts.sort(key=lambda p: p["date"], reverse=True)
    return posts


def pretty_date(iso):
    d = datetime.datetime.fromisoformat(iso)
    return "%d %s %d" % (d.day, d.strftime("%B"), d.year)


# The serif shows the difference between a straight quote and a typographic
# one, so a post is set in the latter whatever the source file typed. smarten
# works on plain text; smarten_html leaves tags, attributes and anything
# inside code, pre, kbd, script, style and svg alone.
def smarten(text):
    text = re.sub(r"(?<=\w)'(?=\w)", "’", text)                # don't
    text = re.sub(r"'(?=\d\d(?:s|\b))", "’", text)             # '90s
    text = re.sub(r"(?<![\w’])'(?=\S)", "‘", text)        # opening single
    text = text.replace("'", "’")                              # every other single closes
    text = re.sub(r'(?<![\w”,.!?;:)])"(?=\S)', "“", text)  # opening double
    return text.replace('"', "”")


SMARTEN_SKIP = ("script", "style", "code", "pre", "kbd", "textarea", "svg")
SMARTEN_TOKEN = re.compile(r"(<!--.*?-->|<[^>]+>)", re.S)
SMARTEN_OPEN = re.compile(r"^\s*<(%s)\b" % "|".join(SMARTEN_SKIP), re.I)
SMARTEN_CLOSE = re.compile(r"^\s*</(%s)\b" % "|".join(SMARTEN_SKIP), re.I)


def smarten_html(fragment):
    depth, out = 0, []
    for part in SMARTEN_TOKEN.split(fragment):
        if part.startswith("<"):
            if SMARTEN_OPEN.match(part) and not part.endswith("/>"):
                depth += 1
            elif SMARTEN_CLOSE.match(part):
                depth = max(0, depth - 1)
            out.append(part)
        else:
            out.append(smarten(part) if depth == 0 else part)
    return "".join(out)


# ------------------------------------------------------------ cover art ----
# The site already speaks in hairlines, dot fields, rings and small repeating
# marks: the AI strands, the hero dots, the contact rings, every per-project
# ground. None of that survives being shrunk to a card. So a cover is the one
# place the site uses solid form -- a few large shapes on the pillar's ground,
# overlapping and multiplying into deeper tones, cropped by the frame.
#
# Seeded from the slug, so a post's cover never changes once it is written.
# Two renders share that seed: the card's plate at 3:2 and the post hero's
# band at 5:2, which is three times as wide on screen and so spends the room
# on more, smaller forms instead of blowing the same five up into a slab.

import math

CW, CH = 1200, 800

# ground a, ground b, three shape tints, the accent.
TONES = {
    "leadership": ("#F0F1EB", "#E7E9E0", ["#DCE2D2", "#C8D2BC", "#B4C2A4"], "#3B6B44"),
    "craft":      ("#F7F1E5", "#F1E8D6", ["#EFE0C2", "#E6CE9E", "#DBBB7E"], "#C98F3E"),
    "fintech":    ("#F1F0ED", "#E7E4DE", ["#DAD6CD", "#C3BEB2", "#A9A396"], "#2B2621"),
}

# Where a composition puts its weight. Each pillar reads differently at a glance
# without needing a different shape vocabulary.
ANCHORS = {
    # one point on the left, opening to the right
    "leadership": [(.13, .50), (.38, .30), (.42, .70), (.68, .24), (.72, .64), (.94, .44)],
    # a strict grid, and one that leaves it
    "craft":      [(.22, .32), (.50, .30), (.78, .32), (.24, .68), (.52, .70), (.86, .76)],
    # bands stacked across a division
    "fintech":    [(.26, .28), (.70, .26), (.32, .52), (.66, .54), (.28, .76), (.74, .74)],
}


def _rng(seed):
    s = seed & 0xFFFFFFFF
    def rnd():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = (s ^ (s >> 15)) * (1 | s) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rnd


def _disc(cx, cy, r, fill, rot):
    return '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s"/>' % (cx, cy, r, fill)


def _half(cx, cy, r, fill, rot):
    return ('<path d="M%.0f %.0f a%.0f %.0f 0 0 1 %.0f 0z" fill="%s" '
            'transform="rotate(%.0f %.0f %.0f)"/>') % (cx - r, cy, r, r, 2 * r, fill, rot, cx, cy)


def _rect(cx, cy, r, fill, rot):
    w, h = r * 1.9, r * 1.25
    return ('<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="%s" '
            'transform="rotate(%.0f %.0f %.0f)"/>') % (cx - w / 2, cy - h / 2, w, h, fill, rot, cx, cy)


def _ring(cx, cy, r, fill, rot):
    return ('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="none" stroke="%s" '
            'stroke-width="%.0f"/>') % (cx, cy, r * .82, fill, max(10, r * .3))


SHAPES = [_disc, _half, _rect, _ring, _disc, _half]


def cover(slug, pillar, wide=False):
    """The card's plate at 3:2, or the post hero's band at 5:2.

    The hero is three times the card's width on screen, so the same five shapes
    blown up read as a slab rather than a composition. The wide版 keeps the seed
    and the palette and spends the extra room on more, smaller forms."""
    seed = 0
    for ch in slug:
        seed = (seed * 131 + ord(ch)) & 0xFFFFFFFF
    rnd = _rng(seed or 1)
    g0, g1, tints, accent = TONES[pillar]
    w, h = (1500, 600) if wide else (CW, CH)
    anchors = ANCHORS[pillar][:]
    if wide:
        # The same anchor family, shifted along and doubled, so the band reads
        # as the card's composition continuing rather than a different picture.
        anchors = [(x * .54 + dx, y) for dx in (.02, .48) for (x, y) in anchors]

    # Take four or five of the pillar's anchors, in a seeded order.
    for i in range(len(anchors) - 1, 0, -1):
        j = int(rnd() * (i + 1))
        anchors[i], anchors[j] = anchors[j], anchors[i]
    n = (10 + int(rnd() * 3)) if wide else (5 + int(rnd() * 2))
    picked = anchors[:n]

    # The accent goes on whichever of them sits furthest from the frame's edge,
    # so the one saturated shape is never half cropped away.
    def inset(a):
        return min(a[0], 1 - a[0], a[1], 1 - a[1])
    accent_at = max(picked, key=inset)
    accents = {accent_at} if not wide else set(sorted(picked, key=inset, reverse=True)[:2])

    body = []
    for k, (ax, ay) in enumerate(picked):
        cx, cy = ax * w + (rnd() - .5) * 80, ay * h + (rnd() - .5) * 46
        r = ((.13 + rnd() * .14) if wide else (.19 + rnd() * .20)) * h
        is_accent = (ax, ay) in accents
        fill = accent if is_accent else tints[int(rnd() * len(tints))]
        if is_accent:
            r *= .58            # the accent is the smallest thing on the canvas
        draw = _disc if is_accent else SHAPES[int(rnd() * len(SHAPES))]
        rot = int(rnd() * 360)
        body.append('<g style="mix-blend-mode:multiply">%s</g>' % draw(cx, cy, r, fill, rot))

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-hidden="true">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient></defs>'
        '<rect width="%d" height="%d" fill="url(#g)"/>'
        '%s'
        '</svg>\n'
    ) % (w, h, w, h, g0, g1, w, h, "".join(body))


# ---------------------------------------------------------------- chrome ----

def head(*, title, desc, url, css, extra="", og_type="website", ld="", italic=False):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="{og_type}">
<meta property="og:image" content="{SITE}/og-image.png?v={stamp('og-image.png')}">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="{AUTHOR}">
<meta property="og:locale" content="en_US">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}">
<link rel="alternate" type="text/plain" title="{AUTHOR} for language models" href="{SITE}/llms.txt">{extra}
<link rel="icon" href="/favicon.ico?v={stamp('favicon.ico')}" sizes="32x32">
<link rel="icon" href="/favicon.svg?v={stamp('favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v={stamp('apple-touch-icon.png')}">
<link rel="alternate" type="application/rss+xml" title="{AUTHOR} — Blog" href="{SITE}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:{"ital,wght@0,400;1,400" if italic else "wght@400"}&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{css}styles.css?v={stamp('styles.css')}">
<script defer src="/_vercel/insights/script.js"></script>
<script>window.si = window.si || function () {{ (window.siq = window.siq || []).push(arguments); }};</script>
<script defer src="/_vercel/speed-insights/script.js"></script>
{ld}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
"""


LINKEDIN_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>'
EXTLINK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>'
MAIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
DOWN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg>'
CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>'
PILLAR_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
RSS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>'
ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'


def nav(current):
    def mark(href):
        return ' aria-current="page"' if href == current else ''
    return f"""
<header class="nav">
  <div class="wrap">
    <a class="brand" href="/" aria-label="John DeSouza, home"><span>John DeSouza</span></a>
    <button class="icon-btn nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
    <nav class="nav-links" id="site-nav" aria-label="Primary">
      <ul>
        <li><a href="/work.html"{mark('/work.html')}>Work</a></li>
        <li><a href="/#leadership">Leadership</a></li>
        <li><a href="/#about">About</a></li>
        <li><a href="/blog.html"{mark('/blog.html')}>Blog</a></li>
        <li><a class="nav-icon" data-link="linkedin" href="#" aria-label="LinkedIn profile" title="LinkedIn">{LINKEDIN_SVG}<span>LinkedIn</span></a></li>
        <li class="nav-resume"><a class="nav-download" data-link="resume" href="#"><span>Resume</span>{DOWN_SVG}</a></li>
      </ul>
      <div class="nav-foot">
        <a class="btn btn-primary" data-link="email" href="#"><span class="icon-swap">{MAIL_SVG}{SEND_SVG}</span>Contact me</a>
        <a class="btn btn-ghost" data-link="resume" href="#"><span class="icon-swap">{DOWN_SVG}{CHECK_SVG}</span>Resume</a>
      </div>
    </nav>
    <div class="nav-actions">
      <a class="btn btn-primary btn-sm" data-link="email" href="#"><span class="icon-swap">{MAIL_SVG}{SEND_SVG}</span>Contact me</a>
    </div>
  </div>
</header>

<main id="main" tabindex="-1">
"""


def contact_band(heading, lede, note, css=""):
    return f"""
<section class="section">
  <div class="wrap">
    <div class="contact" data-reveal data-field="rings">
      <canvas class="field" aria-hidden="true"></canvas>
      <div>
        <p class="eyebrow">Get in touch</p>
        <h2 class="t-title">{heading}</h2>
        <p class="t-lede">{lede}</p>
      </div>
      <div class="contact-actions">
        <a class="btn btn-primary" data-link="linkedin" href="#"><span class="icon-swap">{LINKEDIN_SVG}{EXTLINK_SVG}</span>Message me on LinkedIn</a>
        <a class="btn btn-ghost" data-link="email" href="#"><span class="icon-swap">{MAIL_SVG}{SEND_SVG}</span>Email me</a>
        <a class="btn btn-ghost" data-link="resume" href="#"><span class="icon-swap">{DOWN_SVG}{CHECK_SVG}</span>Download resume</a>
      </div>
    </div>
    <footer>
      <span>© <span data-year></span> {AUTHOR}</span>
      <span>{note}</span>
    </footer>
  </div>
</section>

</main>
<script src="{css}main.js?v={stamp('main.js')}"></script>
</body>
</html>
"""


# ------------------------------------------------------------ the pages ----

def person_ld():
    return {
        "@type": "Person",
        "@id": SITE + "/#john",
        "name": AUTHOR,
        "url": SITE + "/",
        "jobTitle": "Director of Product Design",
        "description": PERSON_DESC,
        "knowsAbout": KNOWS_ABOUT,
        "sameAs": ["https://www.linkedin.com/in/johndesouza-/"],
    }


def render_post(p, nxt):
    url = "%s/blog/%s.html" % (SITE, p["slug"])
    pillar_label, pillar_class, _short = PILLARS[p["pillar"]]
    d = datetime.datetime.fromisoformat(p["date"])

    ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": p["title"],
        "description": p["description"],
        "datePublished": p["date"],
        "dateModified": p.get("updated", p["date"]),
        "author": person_ld(),
        "publisher": person_ld(),
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "url": url,
        "inLanguage": "en",
        "isPartOf": {"@type": "Blog", "@id": SITE + "/blog.html", "name": "Blog"},
        "articleSection": pillar_label,
        "wordCount": p["words"],
        "abstract": strip_tags(p["claim"]),
        "about": {"@type": "Thing", "name": pillar_label},
        "image": {"@type": "ImageObject", "url": SITE + "/og-image.png",
                  "width": 1200, "height": 630},
    }
    cites = source_links(p)
    if cites:
        ld["citation"] = [{"@type": "CreativeWork", "name": n, "url": u} for u, n in cites]
    if p.get("keywords"):
        ld["keywords"] = ", ".join(p["keywords"])
    crumbs_ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Blog", "item": SITE + "/blog.html"},
            {"@type": "ListItem", "position": 3, "name": p["title"], "item": url},
        ],
    }
    ld_block = '<script type="application/ld+json">%s</script>\n<script type="application/ld+json">%s</script>\n' % (
        json.dumps(ld, separators=(",", ":")), json.dumps(crumbs_ld, separators=(",", ":")))

    extra = ('\n<meta property="article:published_time" content="%s">'
             '\n<meta property="article:author" content="%s">' % (p["date"], AUTHOR))
    for kw in p.get("keywords", []):
        extra += '\n<meta property="article:tag" content="%s">' % html.escape(kw)

    out = head(title="%s — %s" % (p["title"], AUTHOR), desc=p["description"],
               url=url, css="../", extra=extra, og_type="article", ld=ld_block, italic=True)
    out += nav(None)

    sources = ""
    if p.get("sources"):
        items = "\n".join(
            '        <li>%s</li>' % s for s in p["sources"])
        sources = f"""
    <div class="sources" data-reveal>
      <p class="eyebrow">Sources</p>
      <ol>
{items}
      </ol>
    </div>
"""

    out += f"""
<section class="post-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        <li><span class="crumb-sep" aria-hidden="true">/</span><a href="/blog.html">Blog</a></li>
        <li aria-current="page"><span class="crumb-sep" aria-hidden="true">/</span>{html.escape(p["title"])}</li>
      </ol>
    </nav>
    <p class="eyebrow" data-rise style="--i:0">{pillar_label}</p>
    <h1 class="t-display" data-rise style="--i:1">{html.escape(p["title"])}</h1>
    <p class="t-lede" data-rise style="--i:2">{p["lede"]}</p>
    <p class="byline t-small"><span class="byline-mark" aria-hidden="true">JD</span>Written by {AUTHOR}</p>
    <p class="post-meta t-small">
      <span>Published on <time datetime="{p["date"]}">{pretty_date(p["date"])}</time></span>
      <span class="dot" aria-hidden="true">·</span>
      <span>in {pillar_label}</span>
      <span class="dot" aria-hidden="true">·</span>
      <span>{p["minutes"]} min read</span>
    </p>
  </div>
</section>

<section class="section tight">
  <div class="wrap">
    <figure class="post-art" data-reveal style="--vt: post-{p["slug"]}">
      <img src="../assets/blog/{p["slug"]}-wide.svg?v={stamp('assets/blog/%s-wide.svg' % p["slug"])}" width="1500" height="600" alt="" decoding="async">
    </figure>
    <div class="claim" data-reveal>
      <p class="t-quote">{p["claim"]}</p>
    </div>
    <div class="prose" data-reveal>
{p["body"]}
    </div>
{sources}  </div>
</section>
"""

    if nxt:
        out += f"""
<section class="section tight">
  <div class="wrap">
    <div class="post-next" data-reveal>
      <p class="eyebrow">Next</p>
      <h2 class="t-title"><a href="/blog/{nxt["slug"]}.html">{html.escape(nxt["title"])}</a></h2>
      <div class="actions">
        <a class="btn btn-ghost" href="/blog.html">All posts{ARROW_SVG}</a>
      </div>
    </div>
  </div>
</section>
"""
    out += contact_band(
        "Disagree with any of this?",
        "I'd rather hear it than not. The arguments get better when somebody pushes back.",
        "Posts are my own views. Case studies reflect my role and my teams' work at each company.",
        css="../")
    return out


def render_index(posts):
    url = SITE + "/blog.html"
    desc = ("John DeSouza, Director of Product Design, on design leadership, where the "
            "job is heading, and trust in fintech and web3. One position per post, every "
            "number sourced.")
    ld = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": url,
        "name": "%s — Blog" % AUTHOR,
        "description": desc,
        "url": url,
        "inLanguage": "en",
        "author": person_ld(),
        "blogPost": [
            {"@type": "BlogPosting", "headline": p["title"],
             "url": "%s/blog/%s.html" % (SITE, p["slug"]),
             "datePublished": p["date"], "description": p["description"]}
            for p in posts
        ],
    }
    ld_block = '<script type="application/ld+json">%s</script>\n' % json.dumps(ld, separators=(",", ":"))

    out = head(title="Blog — %s" % AUTHOR, desc=desc, url=url, css="", ld=ld_block, italic=True)
    out += nav("/blog.html")

    # 1. The three arguments, as the way in: the blog is organised by what it
    #    argues, not by what happened to go up this morning.
    links = ""
    for key, (label, _, _short) in PILLARS.items():
        n = sum(1 for p in posts if p["pillar"] == key)
        links += f"""        <li><a href="#{key}"><span class="pillar-label">{label}{PILLAR_ARROW}</span><span class="pillar-count t-small">{n} post{"" if n == 1 else "s"}</span></a></li>\n"""

    out += f"""
<section class="cs-hero solo">
  <div class="wrap">
    <div class="cs-hero-copy">
      <p class="eyebrow" data-rise style="--i:0">Blog<a class="feed-link" href="/feed.xml" aria-label="RSS feed">{RSS_SVG}</a></p>
      <h1 class="t-display" data-rise style="--i:1">Notes from the field.</h1>
      <p class="t-lede" data-rise style="--i:2">Where product design is heading, how I lead through it, and what thirteen years in lending, crypto and identity says about what comes next. One position per post. Every number links to its source.</p>
    </div>
  </div>
</section>

<section class="section tight">
  <div class="wrap">
    <nav class="pillar-nav" aria-label="Topics" data-reveal>
      <ul>
{links}      </ul>
    </nav>
  </div>
</section>
"""

    # 2. The recent run, as a strip of titles and dates.
    if len(posts) > 1:
        strip = ""
        for p in posts[:6]:
            strip += f"""        <a class="ticker-item" href="/blog/{p["slug"]}.html">
          <span class="t-small">{html.escape(p["title"])}</span>
          <time class="t-small" datetime="{p["date"]}">{pretty_date(p["date"])}</time>
        </a>\n"""
        out += f"""
<section class="section tight">
  <div class="wrap">
    <div class="ticker" data-strip-label="Recent posts, scroll sideways">
{strip}    </div>
  </div>
</section>
"""

    # 3. The latest three, on their own ground, with their covers.
    if posts:
        cards = "".join(card(p) for p in posts[:3])
        out += f"""
<section class="section tight">
  <div class="wrap">
    <div class="featured" data-reveal>
      <div class="featured-head">
        <h2 class="t-title featured-title">Latest</h2>
        <a class="post-cta" href="#all">All posts{ARROW_SVG}</a>
      </div>
      <div class="cards">{cards}
      </div>
    </div>
  </div>
</section>
"""

    # 4. Everything, filterable, grouped under the pillar it argues.
    out += """
<section class="section tight" id="all">
  <div class="wrap">
    <div class="posts-head" data-reveal>
      <h2 class="t-title">All posts</h2>
      <div class="posts-controls">
        <div class="post-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="post-search" placeholder="Search posts" autocomplete="off">
          <label class="sr-only" for="post-search">Search posts</label>
        </div>
        <div class="view-toggle" role="group" aria-label="Layout">
          <button type="button" data-view="grid" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>Grid</button>
          <button type="button" data-view="list" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16"/></svg>List</button>
        </div>
      </div>
    </div>
"""
    for key, (label, _, _short) in PILLARS.items():
        group = [p for p in posts if p["pillar"] == key]
        body = "".join(card(p) for p in group) or '\n        <p class="t-body pillar-empty">Nothing here yet.</p>'
        out += f"""
    <section class="pillar-group" data-pillar="{key}" data-reveal>
      <h3 class="t-heading pillar-head" id="{key}">{label}</h3>
      <div class="cards" data-view="grid">{body}
      </div>
    </section>
"""
    out += """
    <p class="posts-empty t-body" hidden>Nothing matches that search.</p>
  </div>
</section>
"""
    out += contact_band(
        "Want to argue about one of these?",
        "I'm looking for a Director of Product Design role. I'm also happy to just talk shop.",
        "Posts are my own views. Case studies reflect my role and my teams' work at each company.")
    return out


def card(p):
    """One post as a card: its cover, the month, the title and the blurb."""
    d = datetime.datetime.fromisoformat(p["date"])
    label, chip_class, short = PILLARS[p["pillar"]]
    return f"""
        <a class="post-card" href="/blog/{p["slug"]}.html" data-title="{html.escape(p["title"].lower())}" data-desc="{html.escape(p["description"].lower())}" data-pillar="{p["pillar"]}">
          <span class="card-art" style="--vt: post-{p["slug"]}"><img src="assets/blog/{p["slug"]}.svg?v={stamp('assets/blog/%s.svg' % p["slug"])}" width="{CW}" height="{CH}" alt="" loading="lazy" decoding="async"></span>
          <span class="card-body">
            <span class="eyebrow">{d.strftime("%B %Y")}</span>
            <span class="t-heading card-title">{html.escape(p["title"])}</span>
            <span class="t-small card-desc">{p["description"]}</span>
            <span class="post-meta t-small"><span class="chip {chip_class}">{short}</span><span>{p["minutes"]} min</span></span>
          </span>
        </a>"""


def render_sitemap(posts):
    rows = []
    newest = posts[0]["date"] if posts else datetime.date.today().isoformat()
    for loc, pri in STATIC_PAGES:
        lastmod = newest[:10] if loc == "/blog.html" else datetime.date.today().isoformat()
        rows.append((SITE + loc, lastmod, pri))
    for p in posts:
        rows.append(("%s/blog/%s.html" % (SITE, p["slug"]),
                     p.get("updated", p["date"])[:10], "0.7"))
    body = "\n".join(
        "  <url><loc>%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>" % r
        for r in rows)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            '%s\n</urlset>\n' % body)


def rfc822(iso):
    d = datetime.datetime.fromisoformat(iso)
    return d.strftime("%a, %d %b %Y %H:%M:%S %z")


def render_feed(posts):
    items = []
    for p in posts:
        url = "%s/blog/%s.html" % (SITE, p["slug"])
        items.append(f"""    <item>
      <title>{html.escape(p["title"])}</title>
      <link>{url}</link>
      <guid isPermaLink="true">{url}</guid>
      <pubDate>{rfc822(p["date"])}</pubDate>
      <category>{html.escape(PILLARS[p["pillar"]][0])}</category>
      <dc:creator>{AUTHOR}</dc:creator>
      <description>{html.escape(p["description"])}</description>
      <content:encoded><![CDATA[<p><strong>{p["claim"]}</strong></p>
{p["body"]}]]></content:encoded>
    </item>""")
    built = rfc822(posts[0]["date"]) if posts else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>{AUTHOR} — Blog</title>
    <link>{SITE}/blog.html</link>
    <atom:link href="{SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Design leadership, where product design is heading, and trust in fintech and web3.</description>
    <language>en</language>
    <lastBuildDate>{built}</lastBuildDate>
{chr(10).join(items)}
  </channel>
</rss>
"""


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def source_links(p):
    """(url, name) for each front-matter source, first link in each."""
    out = []
    for s in p.get("sources", []):
        m = re.search(r'<a href="([^"]+)">(.*?)</a>', s)
        if m:
            out.append((html.unescape(m.group(1)), strip_tags(m.group(2))))
    return out


def to_markdown(fragment):
    """The post body as plain Markdown: enough structure for a model to read."""
    t = fragment
    t = re.sub(r'<a href="([^"]+)">(.*?)</a>',
               lambda m: "[%s](%s)" % (m.group(2), m.group(1) if m.group(1).startswith("http") else SITE + m.group(1)), t, flags=re.S)
    t = re.sub(r"<h2>(.*?)</h2>", r"\n## \1\n", t, flags=re.S)
    t = re.sub(r"<h3>(.*?)</h3>", r"\n### \1\n", t, flags=re.S)
    t = re.sub(r"<li>(.*?)</li>", r"- \1", t, flags=re.S)
    t = re.sub(r"</?(strong|b)>", "**", t)
    t = re.sub(r"</?(em|i)>", "*", t)
    t = re.sub(r"</p>", "\n", t)
    t = strip_tags(t)
    t = "\n".join(line.strip() for line in t.splitlines())
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def render_llms(posts):
    lines = ["# %s" % AUTHOR, "",
             "> %s This site holds his case "
             "studies and a blog where each post defends one position with sourced numbers." % PERSON_DESC,
             "",
             "Posts are John's own views. Every number in a post links to the primary source "
             "that produced it. Quote the claim, not the lede, when summarizing a post.",
             "", "## Site", ""]
    for loc, name, note in LLM_PAGES:
        lines.append("- [%s](%s%s): %s" % (name, SITE, loc, note))
    for key, (label, _c, _s) in PILLARS.items():
        group = [p for p in posts if p["pillar"] == key]
        if not group:
            continue
        lines += ["", "## Blog: %s" % label, ""]
        for p in group:
            lines.append("- [%s](%s/blog/%s.html): %s" % (
                p["title"], SITE, p["slug"], strip_tags(p["claim"])))
    lines += ["", "## Optional", "",
              "- [Full text of every post](%s/llms-full.txt): each post as Markdown with its claim and sources." % SITE,
              "- [RSS feed](%s/feed.xml): the same posts with full text." % SITE,
              "- [LinkedIn](https://www.linkedin.com/in/johndesouza-/)", ""]
    return "\n".join(lines)


def render_llms_full(posts):
    parts = ["# %s: blog, full text" % AUTHOR, "",
             "> %s Every post below is one position, with the sources it rests on." % PERSON_DESC, ""]
    for p in posts:
        url = "%s/blog/%s.html" % (SITE, p["slug"])
        parts += ["---", "", "## %s" % p["title"], "",
                  "- URL: %s" % url,
                  "- Author: %s" % AUTHOR,
                  "- Published: %s" % p["date"][:10],
                  "- Topic: %s" % PILLARS[p["pillar"]][0],
                  "- Claim: %s" % strip_tags(p["claim"]), "",
                  strip_tags(p["lede"]), "",
                  to_markdown(p["body"]), ""]
        cites = source_links(p)
        if cites:
            parts += ["Sources:", ""] + ["- [%s](%s)" % (n, u) for u, n in cites] + [""]
    return "\n".join(parts)


def main():
    check = "--check" in sys.argv
    if not os.path.exists("styles.css"):
        sys.exit("run this from the repo root")
    posts = read_posts()

    # Draw any cover that is missing. A cover is seeded from the slug, so it is
    # stable once written; delete the file to redraw one.
    os.makedirs("assets/blog", exist_ok=True)
    drawn = []
    for p in posts:
        for path, wide in (("assets/blog/%s.svg" % p["slug"], False),
                           ("assets/blog/%s-wide.svg" % p["slug"], True)):
            if not os.path.exists(path):
                if not check:
                    open(path, "w").write(cover(p["slug"], p["pillar"], wide=wide))
                drawn.append(path)

    wanted = {}
    for i, p in enumerate(posts):
        # Next is the post below this one, and the oldest wraps to the newest,
        # so the ring never dead-ends. One post on its own gets no band.
        nxt = posts[i + 1] if i + 1 < len(posts) else (posts[0] if len(posts) > 1 else None)
        wanted["blog/%s.html" % p["slug"]] = render_post(p, nxt)
    wanted["blog.html"] = render_index(posts)
    wanted["sitemap.xml"] = render_sitemap(posts)
    wanted["feed.xml"] = render_feed(posts)
    wanted["llms.txt"] = render_llms(posts)
    wanted["llms-full.txt"] = render_llms_full(posts)

    stale = []
    for path, text in wanted.items():
        current = open(path).read() if os.path.exists(path) else None
        if current != text:
            stale.append(path)
            if not check:
                open(path, "w").write(text)

    # A post file whose page no longer has a source is a leftover.
    slugs = {p["slug"] for p in posts}
    orphans = [f for f in glob.glob("blog/*.html")
               if os.path.splitext(os.path.basename(f))[0] not in slugs]

    if check:
        if drawn:
            for f in drawn:
                print("missing cover: %s" % f)
        if stale or orphans or drawn:
            for f in stale:
                print("out of date: %s" % f)
            for f in orphans:
                print("orphan (no post source): %s" % f)
            sys.exit(1)
        print("blog up to date (%d posts)" % len(posts))
        return

    for f in orphans:
        print("orphan, delete it yourself if that is right: %s" % f)
    if drawn:
        print("drew %d cover%s" % (len(drawn), "" if len(drawn) == 1 else "s"))
    print("%d posts · wrote %d file%s%s" % (
        len(posts), len(stale), "" if len(stale) == 1 else "s",
        (": " + ", ".join(sorted(stale))) if stale else " (all current)"))


if __name__ == "__main__":
    main()

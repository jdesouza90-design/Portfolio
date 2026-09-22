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

# Pages outside the blog that belong in the sitemap, with their change weight.
STATIC_PAGES = [("/", "1.0"), ("/work.html", "0.9"), ("/blog.html", "0.9")]


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
        meta.update(slug=slug, body=body, src=path, words=words,
                    minutes=max(1, round(words / WPM)))
        posts.append(meta)

    posts.sort(key=lambda p: p["date"], reverse=True)
    return posts


def pretty_date(iso):
    d = datetime.datetime.fromisoformat(iso)
    return "%d %s %d" % (d.day, d.strftime("%B"), d.year)


# ------------------------------------------------------------ cover art ----
# A seeded bundle of strands on the pillar's ground: one motif, three
# behaviours, so the pillars read as a family and a card is still tellable
# apart at a glance. Seeded from the slug, so a cover never changes once the
# post is written. Same idea as ai-process-art.mjs, in this pipeline's language.

CW, CH = 1200, 800

# Ground and accent per pillar. The accent matches the pillar dot on the index.
TONES = {
    "leadership": ("#F1F0EA", "#E0E3D8", "#3B6B44"),
    "craft":      ("#F6F1E6", "#EFE2CC", "#C98F3E"),
    "fintech":    ("#F1F0EE", "#DEDBD4", "#5C564E"),
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


def _smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def _path(pts):
    """Catmull-Rom through the points, as cubic beziers."""
    d = "M%.0f %.0f" % (pts[0][0], pts[0][1])
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += "C%.0f %.0f %.0f %.0f %.0f %.0f" % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    return d


def _strand(pillar, t, rnd):
    """One curve across the canvas. t is 0..1, its place in the bundle."""
    amp = 10 + rnd() * 34
    lam = 150 + rnd() * 200
    phi = rnd() * math.tau
    jitter = (rnd() - .5) * 26
    pts = []
    x = -20
    while x <= CW + 20:
        u = (x + 20) / (CW + 40)
        s = _smooth(u)
        if pillar == "leadership":
            # One voice at the left, spreading into many across the canvas.
            y = CH / 2 + (t - .5) * (CH - 90) * s + jitter * s
        elif pillar == "craft":
            # The mirror of leadership: many at the left, consolidating right.
            y = CH / 2 + (t - .5) * (CH - 90) * (1 - s) + jitter * (1 - s)
        else:
            # Two bundles meeting at a line, leaving as fewer, steadier runs.
            m = _smooth(abs(u - .5) * 2)
            y = CH / 2 + (t - .5) * (CH - 90) * m + jitter * (1 - m)
        wob = amp * math.sin(x / lam + phi) * ((1 - s) ** .6 + .25)
        pts.append((x, y + wob))
        x += 34
    return pts


def cover(slug, pillar):
    seed = 0
    for ch in slug:
        seed = (seed * 131 + ord(ch)) & 0xFFFFFFFF
    rnd = _rng(seed or 1)
    g0, g1, accent = TONES[pillar]

    n = 46
    ink = []
    for i in range(n):
        t = i / (n - 1)
        pts = _strand(pillar, t, rnd)
        ink.append('<path d="%s" stroke-width="%.2f"/>' % (_path(pts), .7 + rnd() * .7))

    # The one strand that carries the accent, picked off-centre so it reads.
    at = .28 + rnd() * .44
    lead = _path(_strand(pillar, at, rnd))

    gate = ''
    if pillar == "fintech":
        gate = '<path d="M%d 60V%d" stroke="%s" stroke-width="1.5" stroke-opacity=".5"/>' % (CW // 2, CH - 60, accent)

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-hidden="true">'
        '<defs>'
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>'
        '<linearGradient id="f" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="%d" y2="0">'
        '<stop offset="0" stop-color="#14100C" stop-opacity=".07"/>'
        '<stop offset=".55" stop-color="#14100C" stop-opacity=".22"/>'
        '<stop offset="1" stop-color="#14100C" stop-opacity=".07"/></linearGradient>'
        '</defs>'
        '<rect width="%d" height="%d" fill="url(#g)"/>'
        '<g fill="none" stroke="url(#f)" stroke-linecap="round">%s</g>'
        '%s'
        '<path d="%s" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/>'
        '</svg>\n'
    ) % (CW, CH, CW, CH, g0, g1, CW, CW, CH, "".join(ink), gate, lead, accent)


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
<meta name="twitter:card" content="summary_large_image">{extra}
<link rel="icon" href="/favicon.ico?v={stamp('favicon.ico')}" sizes="32x32">
<link rel="icon" href="/favicon.svg?v={stamp('favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v={stamp('apple-touch-icon.png')}">
<link rel="alternate" type="application/rss+xml" title="{AUTHOR} — Blog" href="{SITE}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:{"ital,wght@0,400;1,400" if italic else "wght@400"}&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
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


def contact_band(heading, lede, note):
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
<script src="main.js?v={stamp('main.js')}"></script>
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
        "image": SITE + "/og-image.png",
    }
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
    <figure class="post-art" data-reveal>
      <img src="../assets/blog/{p["slug"]}.svg?v={stamp('assets/blog/%s.svg' % p["slug"])}" width="{CW}" height="{CH}" alt="" decoding="async">
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
        "Posts are my own views. Case studies reflect my role and my teams' work at each company.")
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
      <h1 class="t-display" data-rise style="--i:1">Arguments the industry is having.</h1>
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
        <a class="card" href="/blog/{p["slug"]}.html" data-title="{html.escape(p["title"].lower())}" data-desc="{html.escape(p["description"].lower())}" data-pillar="{p["pillar"]}">
          <span class="card-art"><img src="assets/blog/{p["slug"]}.svg?v={stamp('assets/blog/%s.svg' % p["slug"])}" width="{CW}" height="{CH}" alt="" loading="lazy" decoding="async"></span>
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
    for path in sorted(glob.glob("work/*.html")):
        rows.append((SITE + "/" + path, datetime.date.today().isoformat(), "0.8"))
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
      <description>{html.escape(p["description"])}</description>
    </item>""")
    built = rfc822(posts[0]["date"]) if posts else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
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
        path = "assets/blog/%s.svg" % p["slug"]
        if not os.path.exists(path):
            if not check:
                open(path, "w").write(cover(p["slug"], p["pillar"]))
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

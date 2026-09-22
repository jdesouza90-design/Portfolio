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
import json, re, sys, glob, os, html, datetime, hashlib

SITE = "https://john-desouza.com"
AUTHOR = "John DeSouza"
WPM = 225

PILLARS = {
    "leadership": ("Design leadership",            "pillar"),
    "craft":      ("Where product design is going", "pillar pillar-craft"),
    "fintech":    ("Fintech, web3 and trust",      "pillar pillar-fintech"),
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


# ---------------------------------------------------------------- chrome ----

def head(*, title, desc, url, css, extra="", og_type="website", ld=""):
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
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
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
    pillar_label, pillar_class = PILLARS[p["pillar"]]
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
               url=url, css="../", extra=extra, og_type="article", ld=ld_block)
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
    <p class="post-meta t-small">
      <time datetime="{p["date"]}">{pretty_date(p["date"])}</time>
      <span class="dot" aria-hidden="true">·</span>
      <span>{p["minutes"]} min read</span>
    </p>
  </div>
</section>

<section class="section tight">
  <div class="wrap">
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

    out = head(title="Blog — %s" % AUTHOR, desc=desc, url=url, css="", ld=ld_block)
    out += nav("/blog.html")

    # The three arguments, as the way in. Each one names a pillar and jumps to
    # its posts, so the index leads with what the blog is for rather than with
    # whatever happened to go up this morning.
    links = ""
    for key, (label, _) in PILLARS.items():
        n = sum(1 for p in posts if p["pillar"] == key)
        links += f"""        <li><a href="#{key}"><span>{label}</span>{PILLAR_ARROW}<span class="pillar-count t-small">{n} post{"" if n == 1 else "s"}</span></a></li>\n"""

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

    for key, (label, chip_class) in PILLARS.items():
        group = [p for p in posts if p["pillar"] == key]
        out += f"""
<section class="section tight">
  <div class="wrap">
    <h2 class="t-title pillar-head" id="{key}" data-reveal>{label}</h2>
    <div class="posts" data-reveal>
"""
        if not group:
            out += '      <p class="t-body pillar-empty">Nothing here yet.</p>\n'
        for p in group:
            out += f"""      <a class="post-row" href="/blog/{p["slug"]}.html">
        <div>
          <h3 class="t-heading">{html.escape(p["title"])}</h3>
          <p class="t-body">{p["description"]}</p>
        </div>
        <div class="post-aside">
          <p class="post-meta t-small">
            <time datetime="{p["date"]}">{pretty_date(p["date"])}</time>
            <span class="dot" aria-hidden="true">·</span>
            <span>{p["minutes"]} min</span>
          </p>
          <span class="post-cta">Read{ARROW_SVG}</span>
        </div>
      </a>
"""
        out += """    </div>
  </div>
</section>
"""

    out += contact_band(
        "Want to argue about one of these?",
        "I'm looking for a Director of Product Design role. I'm also happy to just talk shop.",
        "Posts are my own views. Case studies reflect my role and my teams' work at each company.")
    return out


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
        if stale or orphans:
            for f in stale:
                print("out of date: %s" % f)
            for f in orphans:
                print("orphan (no post source): %s" % f)
            sys.exit(1)
        print("blog up to date (%d posts)" % len(posts))
        return

    for f in orphans:
        print("orphan, delete it yourself if that is right: %s" % f)
    print("%d posts · wrote %d file%s%s" % (
        len(posts), len(stale), "" if len(stale) == 1 else "s",
        (": " + ", ".join(sorted(stale))) if stale else " (all current)"))


if __name__ == "__main__":
    main()

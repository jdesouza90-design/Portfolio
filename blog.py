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

        check_cover(path, meta.get("cover_line"))
        meta["cover_line"] = smarten(meta["cover_line"])

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
    """A quote against an inline tag reads across it: "<strong>Yes</strong>,"
    opens before the tag and closes after it, so the text on either side is
    smartened with a stand-in letter for what the tag holds."""
    parts = SMARTEN_TOKEN.split(fragment)
    depth, out = 0, []
    for i, part in enumerate(parts):
        if part.startswith("<"):
            if SMARTEN_OPEN.match(part) and not part.endswith("/>"):
                depth += 1
            elif SMARTEN_CLOSE.match(part):
                depth = max(0, depth - 1)
            out.append(part)
        elif depth == 0:
            before = parts[i - 1] if i > 0 else ""
            after = parts[i + 1] if i + 1 < len(parts) else ""
            lead = "x" if before.startswith("</") else ""
            tail = "x" if after.startswith("<") and not after.startswith(("</", "<!--")) else ""
            text = smarten(lead + part + tail)
            out.append(text[len(lead):len(text) - len(tail) if tail else None])
        else:
            out.append(part)
    return "".join(out)


# ------------------------------------------------------------ cover art ----
# A cover is the post's argument in one line: the claim cut to six to ten
# words, set in the serif's italic over a double rule, on the pillar's ground
# (after Harvey's title plates). It is written per post as `cover_line` in the
# front matter and drawn here as markup, so it sets in the site's faces and
# stays sharp at any size. It lives on the index only: on the post page the
# full claim sits under the title, and the line would say it twice.


def check_cover(path, line):
    if not isinstance(line, str) or not line.strip():
        sys.exit("%s: front matter is missing cover_line (the claim in six to ten words)" % path)
    n = len(line.split())
    if not 4 <= n <= 11:
        sys.exit("%s: cover_line runs %d words, keep it to six to ten" % (path, n))


def cover(p):
    """The cover's markup. Spans throughout: on the index it sits inside a link."""
    _label, _chip, short = PILLARS[p["pillar"]]
    return ('<span class="cov-in"><span class="cov-disc"></span><span class="cov-eye">%s</span>'
            '<span class="cov-line">%s</span><span class="cov-rule"></span></span>'
            % (html.escape(short), html.escape(p["cover_line"])))


def head(*, title, desc, url, css, extra="", og_type="website", ld="", italic=False):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>try{{var d=document.documentElement;d.classList.add("js");setTimeout(function(){{if(!d.classList.contains("js-ok"))d.classList.remove("js")}},4000);if(/Mac|iPhone|iPad/.test(navigator.platform||""))d.classList.add("mac");var t=localStorage.getItem("theme");if(t==="dark"||t==="light")d.dataset.theme=t}}catch(e){{}}</script>
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


LINKEDIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 10V17"/><path d="M11 13V17M11 13C11 11.3431 12.3431 10 14 10C15.6569 10 17 11.3431 17 13V17M11 13V10"/><path d="M7.125 6.75H7M7.25 6.75C7.25 6.88807 7.13807 7 7 7C6.86193 7 6.75 6.88807 6.75 6.75C6.75 6.61193 6.86193 6.5 7 6.5C7.13807 6.5 7.25 6.61193 7.25 6.75Z"/><path d="M3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3C16.2426 3 18.364 3 19.682 4.31802C21 5.63604 21 7.75736 21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12Z"/></svg>'
EXTLINK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11.0991 3.00012C7.45013 3.00669 5.53932 3.09629 4.31817 4.31764C3.00034 5.63568 3.00034 7.75704 3.00034 11.9997C3.00034 16.2424 3.00034 18.3638 4.31817 19.6818C5.63599 20.9999 7.75701 20.9999 11.9991 20.9999C16.241 20.9999 18.3621 20.9999 19.6799 19.6818C20.901 18.4605 20.9906 16.5493 20.9972 12.8998"/><path d="M20.556 3.49612L11.0487 13.0586M20.556 3.49612C20.062 3.00151 16.7343 3.04761 16.0308 3.05762M20.556 3.49612C21.05 3.99074 21.0039 7.32273 20.9939 8.02714"/></svg>'
MAIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 6L8.91302 9.91697C11.4616 11.361 12.5384 11.361 15.087 9.91697L22 6"/><path d="M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37608 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z"/></svg>'
SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18.5 12L4.99997 12"/><path d="M13 18C13 18 19 13.5811 19 12C19 10.4188 13 6 13 6"/></svg>'
DOWN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.99969 17.0002C2.99969 17.9302 2.99969 18.3952 3.10192 18.7767C3.37932 19.8119 4.18796 20.6206 5.22324 20.898C5.60474 21.0002 6.06972 21.0002 6.99969 21.0002L16.9997 21.0002C17.9297 21.0002 18.3947 21.0002 18.7762 20.898C19.8114 20.6206 20.6201 19.8119 20.8975 18.7767C20.9997 18.3952 20.9997 17.9302 20.9997 17.0002"/><path d="M16.4998 11.5002C16.4998 11.5002 13.1856 16.0002 11.9997 16.0002C10.8139 16.0002 7.49976 11.5002 7.49976 11.5002M11.9997 15.0002V3.00016"/></svg>'
CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 14L8.5 17.5L19 6.5"/></svg>'
RSS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19.5 19.5C19.5 11.2157 12.7843 4.5 4.5 4.5"/><path d="M12.5 19.5C12.5 15.0817 8.91828 11.5 4.5 11.5"/><path d="M5.25 19H5M5.5 19C5.5 19.2761 5.27614 19.5 5 19.5C4.72386 19.5 4.5 19.2761 4.5 19C4.5 18.7239 4.72386 18.5 5 18.5C5.27614 18.5 5.5 18.7239 5.5 19Z"/></svg>'


def nav(current, section=None):
    def mark(href):   # the page itself, or the section a page sits in (a post in the blog)
        return ' aria-current="page"' if href == current else ' aria-current="true"' if href == section else ''
    return f"""
<header class="nav">
  <div class="wrap">
    <a class="brand" href="/" aria-label="John DeSouza, home"><svg class="brand-mark" viewBox="-14 0 586 716" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M1 587L0 555L37 542Q38 537 38 520Q38 504 39 474L39 112Q38 82 38 66Q38 49 37 45L0 32L1 0L116 0L117 32L80 45Q79 48 78 62Q78 76 77 106L77 480Q78 511 78 524Q79 538 80 542L117 555L116 587ZM39 357L77 339L77 424L39 442ZM148 587L146 555L184 542Q184 537 185 520Q185 504 186 474L186 112Q185 82 185 66Q184 49 184 45L146 32L148 0L262 0L264 32L226 45Q226 48 225 62Q224 76 223 106L223 480Q224 511 225 524Q226 538 226 542L264 555L262 587ZM186 286L223 267L223 352L186 371ZM294 587L293 555L330 542Q331 537 331 520Q332 504 332 474L332 112Q332 82 331 66Q331 49 330 45L293 32L294 0L409 0L410 32L373 45Q372 48 372 62Q371 76 370 106L370 480Q371 511 372 524Q372 538 373 542L410 555L409 587ZM332 214L370 196L370 281L332 299ZM441 587L440 555L477 542Q477 537 478 520Q478 504 479 474L479 112Q478 82 478 66Q477 49 477 45L440 32L441 0L556 0L557 32L520 45Q519 48 518 62Q517 76 516 106L516 480Q517 511 518 524Q519 538 520 542L557 555L556 587ZM479 143L516 124L516 209L479 228ZM0 637H557V663H0ZM0 690H557V716H0Z"/><path d="M-14 406L556 128L571 160L1 438Z"/></svg><span>John DeSouza</span></a>
    <button class="icon-btn nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 8.5L20 8.5"/><path d="M4 15.5L20 15.5"/></svg>
    </button>
    <nav class="nav-links" id="site-nav" aria-label="Primary">
      <ul>
        <li><a href="/work.html"{mark('/work.html')}>Work</a></li>
        <li><a href="/#leadership">Leadership</a></li>
        <li><a href="/#about">About</a></li>
        <li><a href="/blog.html"{mark('/blog.html')}>Blog</a></li>
        <li class="nav-search"><button class="nav-kbd" type="button"><span>Search</span><kbd aria-hidden="true"></kbd></button></li>
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


def foot(note, *, contact=False, css=""):
    """The end of a page: the contact band when asked for, then the footer
    and the script. Posts leave it out and just end."""
    band = f"""
    <div class="contact" data-reveal data-field="rings">
      <canvas class="field" aria-hidden="true"></canvas>
      <div>
        <h2 class="t-title">Get in touch</h2>
      </div>
      <div class="contact-actions">
        <a class="btn btn-primary talk" data-link="linkedin" href="#"><span class="talk-label"><span class="icon-swap">{LINKEDIN_SVG}{EXTLINK_SVG}</span>Message me on LinkedIn</span><span class="talk-meet" aria-hidden="true"><span class="talk-pair"><span class="talk-face talk-me"><img decoding="async" width="687" height="1024" src="{css}assets/john.webp?v={stamp('assets/john.webp')}" alt="" loading="lazy"></span><span class="talk-plus">+</span><span class="talk-face talk-you">You</span></span><span class="talk-words">Let’s talk</span></span></a>
        <a class="btn btn-ghost" data-link="email" href="#"><span class="icon-swap">{MAIL_SVG}{SEND_SVG}</span>Email me</a>
        <a class="btn btn-ghost" data-link="resume" href="#"><span class="icon-swap">{DOWN_SVG}{CHECK_SVG}</span>Download resume</a>
      </div>
    </div>""" if contact else ""
    return f"""
<section class="section tight">
  <div class="wrap">{band}
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
    out += nav(None, "/blog.html")

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
      <span>Published on <time datetime="{p["date"]}">{pretty_date(p["date"])}</time></span>
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
        <a class="btn btn-ghost" href="/blog.html">All posts</a>
      </div>
    </div>
  </div>
</section>
"""
    out += foot("Posts are my own views.", css="../")
    return out


def render_index(posts):
    url = SITE + "/blog.html"
    desc = ("John DeSouza, Director of Product Design, on design leadership, where the "
            "job is heading, and trust in fintech and web3.")
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
        links += f"""        <li><a href="#{key}"><span class="pillar-label">{label}</span><span class="pillar-count t-small">{n} post{"" if n == 1 else "s"}</span></a></li>\n"""

    out += f"""
<section class="cs-hero solo">
  <div class="wrap">
    <div class="cs-hero-copy">
      <p class="eyebrow" data-rise style="--i:0">Blog<a class="feed-link" href="/feed.xml" aria-label="RSS feed">{RSS_SVG}</a></p>
      <h1 class="t-display" data-rise style="--i:1">Notes from the field.</h1>
      <p class="t-lede" data-rise style="--i:2">Where product design is heading, how I lead through it, and what thirteen years in lending, crypto and identity says about what comes next.</p>
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

    # 3. The latest three, on their own ground, with their covers.
    if posts:
        cards = "".join(card(p) for p in posts[:3])
        out += f"""
<section class="section tight">
  <div class="wrap">
    <div class="featured" data-reveal>
      <div class="featured-head">
        <h2 class="t-title featured-title">Latest</h2>
        <a class="post-cta" href="#all">All posts</a>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M17 17L21 21"/><path d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z"/></svg>
          <input type="search" id="post-search" placeholder="Search posts" autocomplete="off">
          <label class="sr-only" for="post-search">Search posts</label>
        </div>
        <div class="view-toggle" role="group" aria-label="Layout">
          <button type="button" data-view="grid" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.88884 9.66294C4.39329 10 5.09552 10 6.49998 10C7.90445 10 8.60668 10 9.11113 9.66294C9.32951 9.51702 9.51701 9.32952 9.66292 9.11114C9.99998 8.60669 9.99998 7.90446 9.99998 6.5C9.99998 5.09554 9.99998 4.39331 9.66292 3.88886C9.51701 3.67048 9.32951 3.48298 9.11113 3.33706C8.60668 3 7.90445 3 6.49998 3C5.09552 3 4.39329 3 3.88884 3.33706C3.67046 3.48298 3.48296 3.67048 3.33705 3.88886C2.99998 4.39331 2.99998 5.09554 2.99998 6.5C2.99998 7.90446 2.99998 8.60669 3.33705 9.11114C3.48296 9.32952 3.67046 9.51702 3.88884 9.66294Z"/><path d="M14.8888 9.66294C15.3933 10 16.0955 10 17.5 10C18.9044 10 19.6067 10 20.1111 9.66294C20.3295 9.51702 20.517 9.32952 20.6629 9.11114C21 8.60669 21 7.90446 21 6.5C21 5.09554 21 4.39331 20.6629 3.88886C20.517 3.67048 20.3295 3.48298 20.1111 3.33706C19.6067 3 18.9044 3 17.5 3C16.0955 3 15.3933 3 14.8888 3.33706C14.6705 3.48298 14.483 3.67048 14.337 3.88886C14 4.39331 14 5.09554 14 6.5C14 7.90446 14 8.60669 14.337 9.11114C14.483 9.32952 14.6705 9.51702 14.8888 9.66294Z"/><path d="M3.88884 20.6629C4.39329 21 5.09552 21 6.49998 21C7.90445 21 8.60668 21 9.11113 20.6629C9.32951 20.517 9.51701 20.3295 9.66292 20.1111C9.99998 19.6067 9.99998 18.9045 9.99998 17.5C9.99998 16.0955 9.99998 15.3933 9.66292 14.8889C9.51701 14.6705 9.32951 14.483 9.11113 14.3371C8.60668 14 7.90445 14 6.49998 14C5.09552 14 4.39329 14 3.88884 14.3371C3.67046 14.483 3.48296 14.6705 3.33705 14.8889C2.99998 15.3933 2.99998 16.0955 2.99998 17.5C2.99998 18.9045 2.99998 19.6067 3.33705 20.1111C3.48296 20.3295 3.67046 20.517 3.88884 20.6629Z"/><path d="M14.8888 20.6629C15.3933 21 16.0955 21 17.5 21C18.9044 21 19.6067 21 20.1111 20.6629C20.3295 20.517 20.517 20.3295 20.6629 20.1111C21 19.6067 21 18.9045 21 17.5C21 16.0955 21 15.3933 20.6629 14.8889C20.517 14.6705 20.3295 14.483 20.1111 14.3371C19.6067 14 18.9044 14 17.5 14C16.0955 14 15.3933 14 14.8888 14.3371C14.6705 14.483 14.483 14.6705 14.337 14.8889C14 15.3933 14 16.0955 14 17.5C14 18.9045 14 19.6067 14.337 20.1111C14.483 20.3295 14.6705 20.517 14.8888 20.6629Z"/></svg>Grid</button>
          <button type="button" data-view="list" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M8 5.5L20 5.5"/><path d="M8 12.5L20 12.5"/><path d="M8 19.5L20 19.5"/><path d="M4.375 5.5H4.25M4.5 5.5C4.5 5.63807 4.38807 5.75 4.25 5.75C4.11193 5.75 4 5.63807 4 5.5C4 5.36193 4.11193 5.25 4.25 5.25C4.38807 5.25 4.5 5.36193 4.5 5.5Z" stroke-linejoin="round"/><path d="M4.375 12.5H4.25M4.5 12.5C4.5 12.6381 4.38807 12.75 4.25 12.75C4.11193 12.75 4 12.6381 4 12.5C4 12.3619 4.11193 12.25 4.25 12.25C4.38807 12.25 4.5 12.3619 4.5 12.5Z" stroke-linejoin="round"/><path d="M4.375 19.5H4.25M4.5 19.5C4.5 19.6381 4.38807 19.75 4.25 19.75C4.11193 19.75 4 19.6381 4 19.5C4 19.3619 4.11193 19.25 4.25 19.25C4.38807 19.25 4.5 19.3619 4.5 19.5Z" stroke-linejoin="round"/></svg>List</button>
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
    out += foot("Posts are my own views.", contact=True)
    return out


def card(p):
    """One post as a card: its cover, the month, the title and the blurb."""
    d = datetime.datetime.fromisoformat(p["date"])
    label, chip_class, short = PILLARS[p["pillar"]]
    return f"""
        <a class="post-card" href="/blog/{p["slug"]}.html" data-title="{html.escape(p["title"].lower())}" data-desc="{html.escape(p["description"].lower())}" data-pillar="{p["pillar"]}">
          <span class="card-art cover p-{p["pillar"]}" aria-hidden="true">{cover(p)}</span>
          <span class="card-body">
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


def render_search(posts):
    """The palette's index (main.js initPalette): every page, the home page's
    sections, the case studies as the work index names them, and every post.
    A case study's own text stays out: the pages are gated."""
    entries = [{"t": "Home", "d": "Who John is, the case studies at a glance, how he leads and how to reach him.", "u": "/", "k": "Page"},
               {"t": "Work", "d": "The case studies from Best Egg, Chainlink Labs and Auth0, each with the business result.", "u": "/work.html", "k": "Page"},
               {"t": "Blog", "d": "Positions on design leadership, where product design is heading, and trust in fintech and web3.", "u": "/blog.html", "k": "Page"}]
    home = open("index.html", encoding="utf-8").read()
    for m in re.finditer(r'<section[^>]*\sid="([a-z-]+)"[^>]*>(.*?)</section>', home, re.S):
        sid, body = m.group(1), m.group(2)
        h = re.search(r'<h2 class="t-title[^"]*">(.*?)</h2>', body, re.S)
        lede = re.search(r'<p class="t-lede">(.*?)</p>', body, re.S) or re.search(r'<p class="t-body">(.*?)</p>', body, re.S)   # About has no lede: its first paragraph, John's current title, stands in
        if not h or sid in ("top", "work"):
            continue
        entries.append({"t": strip_tags(h.group(1)), "d": strip_tags(lede.group(1)) if lede else "", "u": "/#" + sid, "k": "Section"})
    work = open("work.html", encoding="utf-8").read()
    work = re.sub(r"<!--.*?-->", "", work, flags=re.S)
    for m in re.finditer(r'<a class="case-row[^"]*" href="(work/[a-z-]+\.html)"[^>]*>(.*?)</a>\s*\n', work, re.S):
        href, body = m.group(1), m.group(2)
        h = re.search(r'<h[23] class="t-heading">(.*?)</h[23]>', body, re.S)
        p = re.search(r'<p class="t-body">(.*?)</p>', body, re.S)
        logo = re.search(r'alt="([^"]+)"', body)
        if not h:
            continue
        entries.append({"t": strip_tags(h.group(1)), "d": strip_tags(p.group(1)) if p else "", "u": "/" + href,
                        "k": "Case study" + (" · " + logo.group(1) if logo else "")})
    for p in posts:
        entries.append({"t": p["title"], "d": strip_tags(p["description"]), "u": "/blog/%s.html" % p["slug"], "k": "Post · " + PILLARS[p["pillar"]][2]})
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + "\n"


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
    wanted["search-index.json"] = render_search(posts)

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

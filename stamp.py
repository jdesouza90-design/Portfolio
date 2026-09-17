#!/usr/bin/env python3
"""Re-stamp styles.css / main.js / asset / icon / social-image / resume URLs with
their content hash. Run after editing any of them so browsers and the CDN fetch the
new file. The pages are stamped, and so is the password gate in middleware.js,
which links the same stylesheet and favicon."""
import re, glob, hashlib, os

def h(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()[:8]

# The resume is downloaded from CONFIG in main.js rather than linked from a page, and
# /assets/ is cached for a week: stamp it first, so main.js's own hash carries the change.
s = open('main.js').read()
s = re.sub(r'(resume: "/(assets/[^"?]+))(?:\?v=[a-f0-9]+)?"',
           lambda m: '%s?v=%s"' % (m.group(1), h(m.group(2))) if os.path.exists(m.group(2)) else m.group(0), s)
open('main.js', 'w').write(s)

css_h, js_h = h('styles.css'), h('main.js')
pages = ['index.html', 'work.html', 'admin/index.html', 'admin/deck.html'] + sorted(glob.glob('work/*.html'))
for f in pages + ['middleware.js']:
    s = open(f).read()
    here = os.path.dirname(f)
    s = re.sub(r'href="((?:\.\./|/)?styles\.css)(?:\?v=[a-f0-9]+)?"', lambda m: 'href="%s?v=%s"' % (m.group(1), css_h), s)
    # The site's own scripts: main.js from every page, dash.js from the dashboard. Never a CDN or /_vercel URL.
    def script(m):
        src = m.group(1)
        p = os.path.normpath(os.path.join(here, src))
        return 'src="%s?v=%s"' % (src, h(p)) if os.path.exists(p) else m.group(0)
    s = re.sub(r'src="((?:\.\./)?[\w-]+(?:/[\w-]+)*\.js)(?:\?v=[a-f0-9]+)?"', script, s)
    def asset(m):
        src = m.group(1)
        p = src.replace('../', '')
        return 'src="%s?v=%s"' % (src, h(p)) if os.path.exists(p) else m.group(0)
    s = re.sub(r'src="((?:\.\./)?assets/[^"?]+)(?:\?v=[a-f0-9]+)?"', asset, s)
    # Walkthrough animations load from data-anim on Play; /assets/ is cached for a week, so stamp them too.
    s = re.sub(r'data-anim="((?:\.\./)?assets/[^"?]+)(?:\?v=[a-f0-9]+)?"',
               lambda m: asset(m).replace('src=', 'data-anim=', 1), s)
    # Icons are root-absolute on every page; browsers cache favicons hard, so stamp them too.
    s = re.sub(r'href="/(favicon\.svg|favicon\.ico|apple-touch-icon\.png)(?:\?v=[a-f0-9]+)?"',
               lambda m: 'href="/%s?v=%s"' % (m.group(1), h(m.group(1))), s)
    # The social preview image is an absolute URL in the og:image meta; link unfurlers cache it hardest of all.
    s = re.sub(r'(content="https://john-desouza\.com/)og-image\.png(?:\?v=[a-f0-9]+)?"',
               lambda m: '%sog-image.png?v=%s"' % (m.group(1), h('og-image.png')), s)
    open(f, 'w').write(s)
print("styles.css=%s  main.js=%s  admin/dash.js=%s  admin/deck.js=%s  (%d pages + middleware.js stamped)" % (css_h, js_h, h('admin/dash.js'), h('admin/deck.js'), len(pages)))

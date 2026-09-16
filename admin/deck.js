/* The deck (admin/deck.html): reads the site's own pages, turns them into a
   model, and draws the slides deck-plan.js asks for. Nothing on a slide is
   copied from the site; it is read from the page each time the deck opens,
   so a change on the site is a change here. Speaker notes, framing lines and
   the per-company fills live in deck-plan.js.

   Stage mode (a screen 720px and wider): one 16:9 slide at a time, arrow
   keys, notes beside it, the overview, fullscreen. Under that, and in print,
   the slides stack as a document with their notes under them. Type inside a
   slide is sized in container units (styles.css, section 13), so the same
   markup is a slide, a thumbnail or a page. */
(() => {
  const $ = (id) => document.getElementById(id);
  const PLAN = window.DECK_PLAN;
  const PAGES = { home: '/index.html', work: '/work.html' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stageMQ = matchMedia('screen and (min-width: 720px)');
  const store = {
    get: (k) => { try { return localStorage.getItem('deck.' + k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem('deck.' + k, v); } catch (_) {} },
  };


  // ---- Reading a page ----------------------------------------------------------

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const q = (root, sel) => (root ? root.querySelector(sel) : null);
  const qa = (root, sel) => (root ? [...root.querySelectorAll(sel)] : []);

  async function fetchPage(path) {
    const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (q(doc, '.gate-form')) throw new Error(`${path} is behind the case-study gate`);
    return { doc, base: new URL(path, location.href) };
  }

  // An image as the page holds it, its src made absolute against the page.
  function img(el, base) {
    if (!el) return null;
    const src = el.getAttribute('src');
    if (!src) return null;
    return { src: new URL(src, base).href, alt: el.getAttribute('alt') || '', w: +el.getAttribute('width') || 0, h: +el.getAttribute('height') || 0 };
  }
  const slugOf = (href) => (href || '').replace(/^.*\//, '').replace(/\.html(\?.*)?$/, '');

  // A case-study card, from the homepage or the work index.
  function readCard(a, base) {
    return {
      href: new URL(a.getAttribute('href') || '', base).href,
      slug: slugOf(a.getAttribute('href')),
      title: text(q(a, ':is(h2, h3)')),
      blurb: text(q(a, '.t-body')),
      chips: qa(a, '.chip').map(text),
      logo: img(q(a, '.case-logo'), base),
      image: img(q(a, '.case-media img'), base),
    };
  }

  function readHome({ doc, base }) {
    const lead = q(doc, '#leadership');
    const points = qa(lead, '.lead-points h4').map((h) => ({ title: text(h), body: text(h.nextElementSibling) }));
    const ai = q(lead, '.lead-art');
    const about = q(doc, '#about');
    return {
      name: text(q(about, '.about-who .t-subhead')) || 'John DeSouza',
      role: text(q(about, '.about-who .t-body')),
      portrait: img(q(about, '.portrait img'), base),
      hero: { title: text(q(doc, '#top h1')), lede: text(q(doc, '#top .t-lede')) },
      lead: { eyebrow: text(q(lead, '.section-intro .eyebrow')), heading: text(q(lead, '.section-intro .t-title')), lede: text(q(lead, '.section-intro .t-lede')), points },
      ai: {
        eyebrow: text(q(ai, '.eyebrow')), heading: text(q(ai, '.t-heading')),
        body: qa(ai, '.lead-solo-copy > .t-body').map(text),
        tools: qa(ai, '.tools li').map((li) => ({ name: text(li), logo: img(q(li, 'img'), base) })),
      },
      layers: qa(lead, '.layer-tabs .layer-tab').map((b, i) => ({ name: text(b), body: text(q(qa(lead, '.layer-stage .layer')[i], '.t-body')) })),
      layersNote: text(q(lead, '.lead-fig .t-heading')),
      about: { heading: text(q(about, '.about-text .t-title')) },
      experience: qa(about, '.exp-item').map((li) => ({
        logo: img(q(li, '.exp-label img'), base),
        company: (q(li, '.exp-label img') || {}).alt || text(q(li, '.exp-label')),
        role: text(q(li, '.t-subhead')),
        team: text(q(li, '.t-body strong')),
        place: text(q(li, '.t-body')).replace(text(q(li, '.t-body strong')), '').trim(),
        dates: text(q(li, '.exp-dates')),
      })),
      kudos: qa(doc, '.kudos .testimonial').map((t) => ({ text: text(q(t, '.t-quote')), cite: text(q(t, 'cite')) })),
      contact: { heading: text(q(doc, '#contact .t-title')), lede: text(q(doc, '#contact .t-lede')) },
      cases: qa(doc, '#work .case-row').map((a) => readCard(a, base)),
    };
  }

  function readWork({ doc, base }) {
    return { cases: qa(doc, '.cases .case-row').map((a) => readCard(a, base)) };
  }

  // A case study, section by section (README: Case study skeleton).
  function readCase({ doc, base }, slug) {
    const hero = q(doc, '.cs-hero');
    const facts = {};
    const factList = qa(hero, '.facts > div').map((d) => { const k = text(q(d, 'dt')), v = text(q(d, 'dd')); facts[k] = v; return { k, v }; });
    const intro = (id) => { const s = q(doc, '#' + id); return { el: s, eyebrow: text(q(s, '.section-intro .eyebrow')), heading: text(q(s, '.section-intro .t-title')), lede: text(q(s, '.section-intro .t-lede')) }; };
    const results = intro('results');
    const tableEl = q(results.el, 'table');
    const table = tableEl ? {
      head: qa(tableEl, 'thead th').map(text),
      rows: qa(tableEl, 'tbody tr').map((tr) => qa(tr, 'th, td').map(text)),
    } : null;
    const role = intro('role');
    const roleRows = qa(role.el, '.ledger-row').map((r) => ({ title: text(q(r, '.t-heading')), body: text(q(r, '.t-body')) }));
    const story = intro('story');
    const row = (id) => q(doc, '#' + id);
    const cols = (root) => qa(root, '.col').map((c) => ({ title: text(q(c, '.t-subhead')), body: text(q(c, '.t-body')), image: img(q(c, 'img'), base) }));
    const problem = row('problem'), design = row('design'), decisions = row('decisions') || design, research = row('research');
    const library = intro('library');
    const retro = intro('retro');
    const notes = qa(retro.el, '.note .t-body').map((p) => {
      const s = text(p), m = s.match(/^(.{2,60}?\.)\s+(.*)$/);   // the lead ("Research timing.") and what follows it
      return m ? { lead: m[1].replace(/\.$/, ''), body: m[2] } : { lead: '', body: s };
    });
    const find = (list, key, title) => { const t = (title || '').toLowerCase(); return list.find((x) => (x[key] || '').toLowerCase().startsWith(t)) || null; };
    return {
      slug,
      className: (doc.body.className.match(/\bcase-[\w-]+/) || [''])[0],
      title: text(q(hero, 'h1')),
      lede: text(q(hero, '.t-lede')),
      outcome: { stat: text(q(hero, '.outcome-stat .t-stat')), label: text(q(hero, '.outcome-stat .t-small')) },
      facts, factList,
      liveDates: (facts.Live || facts.Launched || '').split(/\s+and\s+/).filter(Boolean),
      hero: qa(hero, '.hero-panel img').map((i) => img(i, base)),
      results: { ...results, stat: text(q(results.el, '.proof .t-stat')), label: text(q(results.el, '.proof-head small')), table },
      role: { ...role, rows: roleRows, row: (title) => (find(roleRows, 'title', title) || {}).body || '' },
      story: {
        heading: story.heading,
        problem: { eyebrow: text(q(problem, '.eyebrow')), heading: text(q(problem, '.t-heading, .t-title')), body: text(q(problem, '.row-copy > .t-body')),
          tensions: qa(problem, '.tensions li').map((li) => ({ label: text(q(li, 'strong')), text: text(q(li, 'span')) })),
          image: img(q(problem, '.panel img'), base) },
        design: { eyebrow: text(q(design, '.eyebrow')), heading: text(q(design, '.t-title, .t-heading')), lede: text(q(design, '.row-copy > .t-lede, .row-copy > .t-body')),
          gallery: qa(design, '.gallery figure').map((f) => ({ img: img(q(f, 'img'), base), caption: text(q(f, 'figcaption')) })),
          wide: img(q(design, ':scope > .panel img, :scope > figure.panel img'), base),
          cols: cols(design) },
        decisions: { heading: text(q(decisions, '.t-title, .t-heading')), cols: cols(decisions), col: (title) => (find(cols(decisions), 'title', title) || {}).body || '' },
        research: { heading: text(q(research, '.t-title, .t-heading')), lede: text(q(research, '.t-lede')),
          quotes: qa(research, '.testimonial').map((t) => ({ text: text(q(t, '.t-quote')), tag: text(q(t, 'cite b')), source: text(q(t, 'cite')).replace(text(q(t, 'cite b')), '').trim(), mark: text(q(t, '.testimonial-mark')) })) },
        library: { ...library, poster: img(q(library.el, '.walk img'), base) },
      },
      retro: { ...retro, notes, note: (lead) => (find(notes, 'lead', lead) || {}).body || '' },
    };
  }

  // Reads every page the plan needs. A page that fails leaves its slides
  // saying so rather than taking the deck down.
  async function readSite() {
    const slugs = [PLAN.studies.one, PLAN.studies.two];
    const wanted = [['home', PAGES.home], ['work', PAGES.work], ...slugs.map((s) => [s, `/work/${s}.html`])];
    const got = await Promise.allSettled(wanted.map(([, path]) => fetchPage(path)));
    const failed = [];
    const m = { cs: {}, failed };
    got.forEach((r, i) => {
      const [key, path] = wanted[i];
      if (r.status === 'rejected') { failed.push({ key, path, why: r.reason.message }); return; }
      try {
        if (key === 'home') m.home = readHome(r.value);
        else if (key === 'work') m.work = readWork(r.value);
        else m.cs[key] = readCase(r.value, key);
      } catch (err) { failed.push({ key, path, why: err.message }); }
    });
    m.caseCard = (slug) => ((m.work && m.work.cases) || []).concat((m.home && m.home.cases) || []).find((c) => c.slug === slug) || { slug, title: slug, blurb: '', chips: [] };
    return m;
  }


  // ---- Drawing ---------------------------------------------------------------

  const imgTag = (i, cls = '') => i ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(i.src)}" alt="${esc(i.alt)}"${i.w ? ` width="${i.w}" height="${i.h}"` : ''} loading="lazy" decoding="async">` : '';
  // A wide image fills its panel (cover, from the top left); a tall one, a phone screen, sits inside it (contain).
  const wideness = (i) => (i && i.w && i.h && i.w / i.h > 1.2 ? ' is-wide' : '');
  const shape = (i) => (i && i.w && i.h ? (i.w / i.h > 1.2 ? 'is-wide' : i.w / i.h < .8 ? 'is-tall' : '') : '');
  // The panel is the ground; the fit box inside it is positioned, so the image always has a definite box to fit.
  const panel = (i, cls = '', caption = '') => i ? `<figure class="sl-panel${wideness(i)}${cls ? ' ' + cls : ''}"><span class="sl-fit">${imgTag(i)}</span>${caption}</figure>` : '';
  // A line in [square brackets] is a gap, drawn as one.
  const isGap = (s) => /^\s*\[.*\]\s*$/.test(s || '');
  const gapTag = (s, role = 't-small') => s ? `<p class="deck-gap ${role}">${esc(s)}</p>` : '';
  const line = (s, role, cls = '') => s ? (isGap(s) ? gapTag(s, role) : `<p class="${role}${cls ? ' ' + cls : ''}">${esc(s)}</p>`) : '';
  const head = (c, role = 't-title') => `${c.eyebrow ? `<p class="eyebrow">${esc(c.eyebrow)}</p>` : ''}${c.heading ? `<h2 class="${role}">${esc(c.heading)}</h2>` : ''}`;
  const tensions = (list) => list && list.length ? `<ul class="sl-tensions">${list.map((t) => `<li class="t-small"><b>${esc(t.label)}</b><span>${esc(t.text)}</span></li>`).join('')}</ul>` : '';
  const colsTag = (cols, shots = false) => cols && cols.length ? `<div class="sl-cols" style="--n:${cols.length}">${cols.map((c) => `<div><h3 class="t-subhead">${esc(c.title)}</h3>${line(c.body, 't-small')}${shots && c.image ? `<span class="sl-shot">${imgTag(c.image)}</span>` : ''}</div>`).join('')}</div>` : '';
  const chips = (list) => list && list.length ? `<div class="sl-chips">${list.map((c) => `<span class="t-small">${esc(c)}</span>`).join('')}</div>` : '';

  // Numbers as the site's tables write them ($4,906,705; 2,304; 86%).
  const num = (s) => { const m = String(s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
  function tableTag(t) {
    if (!t || !t.rows.length) return '';
    const numeric = t.rows.length >= 3 && t.rows.every((r) => !Number.isNaN(num(r[1])));
    if (numeric) {   // a bar per row, drawn to the largest
      const max = Math.max(...t.rows.map((r) => num(r[1])));
      return `<div class="sl-bars" role="img" aria-label="${esc(t.head.join(', '))}">${t.rows.map((r) => `<div class="sl-bar"><span class="t-small">${esc(r[0])}</span><i style="--w:${(100 * num(r[1]) / max).toFixed(1)}%"></i><b class="t-small">${esc(r[1])}</b>${r[2] ? `<em class="t-micro">${esc(r[2])}</em>` : ''}</div>`).join('')}</div>`;
    }
    return `<div class="sl-table-wrap"><table class="sl-table"><thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  const LAYOUTS = {
    title: (c) => `<div class="sl sl-title">
      <div class="sl-copy">
        ${c.eyebrow ? `<p class="eyebrow">${esc(c.eyebrow)}</p>` : ''}
        <h2 class="t-display">${esc(c.name)}</h2>
        ${line(c.role, 't-lede')}
        ${c.forLine ? `<p class="t-subhead sl-for">${esc(c.forLine)}</p>` : gapTag(c.gap)}
      </div>
      ${c.portrait ? `<figure class="sl-portrait">${imgTag(c.portrait)}</figure>` : ''}
    </div>`,

    statement: (c) => `<div class="sl sl-statement">
      ${head(c)}
      ${line(c.lede, 't-lede')}
      ${line(c.body, 't-body')}
      ${c.points && c.points.length ? `<div class="sl-cols" style="--n:${c.points.length}">${c.points.map((p) => `<div><h3 class="t-subhead">${esc(p.title)}</h3><p class="t-small">${esc(p.body)}</p></div>`).join('')}</div>` : ''}
      ${c.chain && c.chain.length ? `<div class="sl-chain-row"><ol class="sl-chain">${c.chain.map((n) => `<li class="t-subhead">${esc(n)}</li>`).join('')}</ol>${c.chainNote ? `<p class="t-small">${esc(c.chainNote)}</p>` : ''}</div>` : ''}
      ${c.tools && c.tools.length ? `<ul class="sl-tools">${c.tools.map((t) => `<li class="t-small">${imgTag(t.logo)}<span>${esc(t.name)}</span></li>`).join('')}</ul>` : ''}
    </div>`,

    roadmap: (c) => `<div class="sl sl-roadmap">
      ${head(c)}
      <div class="sl-two">${c.items.map((it) => `<article class="sl-card">
        ${it.image ? `<div class="sl-thumb">${imgTag(it.image, shape(it.image))}</div>` : ''}
        <p class="eyebrow">${esc(it.label)}</p>
        <h3 class="t-heading">${esc(it.title)}</h3>
        ${line(it.blurb, 't-small')}
        ${chips(it.chips)}
        ${it.takeaway ? `<p class="eyebrow sl-take">Takeaway</p><p class="t-small">${esc(it.takeaway)}</p>` : ''}
      </article>`).join('')}</div>
    </div>`,

    'case-title': (c) => `<div class="sl sl-case">
      <div class="sl-copy">
        ${c.eyebrow ? `<p class="eyebrow">${esc(c.eyebrow)}</p>` : ''}
        <h2 class="t-title">${esc(c.title)}</h2>
        ${line(c.frame, 't-lede')}
        <dl class="sl-facts">
          ${c.outcome && c.outcome.stat ? `<div class="is-outcome"><dt class="eyebrow">Outcome</dt><dd class="t-stat">${esc(c.outcome.stat)}</dd><dd class="t-small">${esc(c.outcome.label)}</dd></div>` : ''}
          ${(c.facts || []).map((f) => `<div><dt class="eyebrow">${esc(f.k)}</dt><dd class="t-subhead">${esc(f.v)}</dd></div>`).join('')}
        </dl>
      </div>
      ${panel(c.image, 'sl-hero')}
    </div>`,

    lanes: (c) => `<div class="sl sl-lanes">
      ${head(c)}
      ${line(c.body, 't-body')}
      <div class="sl-lanes-grid">
        <div class="sl-diagram">
          ${c.lanes.map((l) => `<div class="sl-lane"><h3 class="t-subhead">${esc(l.name)}</h3><ul>${l.items.map((i) => `<li class="t-small">${esc(i)}</li>`).join('')}</ul></div>`).join('')}
          ${c.across ? `<div class="sl-across"><h3 class="t-subhead">${esc(c.across.name)}</h3><p class="t-small">${esc(c.across.body)}</p></div>` : ''}
        </div>
        ${tensions(c.constraints)}
      </div>
    </div>`,

    problem: (c) => `<div class="sl sl-problem">
      <div class="sl-copy">
        ${head(c)}
        ${line(c.body, 't-body')}
        ${tensions(c.tensions)}
        ${gapTag(c.gap)}
      </div>
      <div class="sl-side">
        ${c.quotes && c.quotes.length ? `<p class="eyebrow">${esc(c.quotesHead || 'What they told us')}</p>${c.quotes.map((qu) => `<blockquote class="sl-quote"><p class="t-quote">${esc(qu.text)}</p><cite class="t-small">${qu.tag ? `<b>${esc(qu.tag)}</b> · ` : ''}${esc(qu.source)}</cite></blockquote>`).join('')}`
          : panel(c.image, '', c.imageCaption ? `<figcaption class="t-small">${esc(c.imageCaption)}</figcaption>` : '')}
      </div>
    </div>`,

    direction: (c) => `<div class="sl sl-direction">
      ${c.eyebrow ? `<p class="eyebrow">${esc(c.eyebrow)}</p>` : ''}
      <h2 class="t-title">${esc(c.call)}</h2>
      ${line(c.body, 't-lede')}
      ${c.rulesHead ? `<p class="eyebrow sl-rules-head">${esc(c.rulesHead)}</p>` : ''}
      ${colsTag(c.rules, true)}
      ${gapTag(c.gap)}
    </div>`,

    timeline: (c) => `<div class="sl sl-timeline">
      ${head(c)}
      <ol class="sl-steps">${c.steps.map((s) => `<li>
        <span class="sl-dot" aria-hidden="true"></span>
        <p class="eyebrow">${esc(s.when)}</p>
        ${s.logo ? `<span class="sl-logo">${imgTag(s.logo)}</span>` : ''}
        <p class="t-subhead">${esc(s.what)}</p>
        ${s.detail ? `<p class="t-small">${esc(s.detail)}</p>` : ''}
      </li>`).join('')}</ol>
      ${line(c.note, 't-small', 'sl-note')}
      ${gapTag(c.gap)}
    </div>`,

    'before-after': (c) => `<div class="sl sl-ba">
      <div class="sl-copy">${head(c)}${line(c.line, 't-lede')}</div>
      <div class="sl-pair">${[c.before, c.after].map((s) => s && s.image ? panel(s.image, '', `<figcaption><b class="eyebrow">${esc(s.label)}</b><span class="t-small">${esc(s.caption)}</span></figcaption>`) : '').join('')}</div>
    </div>`,

    gallery: (c) => `<div class="sl sl-gallery">
      <div class="sl-head${c.side ? ' has-side' : ''}">
        <div>${head(c)}${line(c.lede, 't-lede')}</div>
        ${panel(c.side, 'sl-side-panel')}
      </div>
      ${colsTag(c.cols)}
      ${c.figures && c.figures.length ? `<div class="sl-figures">${c.figures.map((f) => panel(f.img, '', f.caption ? `<figcaption class="t-small">${esc(f.caption)}</figcaption>` : '')).join('')}</div>` : ''}
      ${c.wide ? `<div class="sl-figures">${panel(c.wide)}</div>` : ''}
      ${line(c.credit, 't-small', 'sl-credit')}
    </div>`,

    metrics: (c) => `<div class="sl sl-metrics">
      <div class="sl-copy">
        ${head(c)}
        ${c.stat ? `<div class="sl-stat"><div class="t-stat">${esc(c.stat)}</div>${line(c.label, 't-small')}</div>` : ''}
        ${tableTag(c.table)}
      </div>
      <div class="sl-tiers">${(c.tiers || []).map((t) => `<div><p class="eyebrow">${esc(t.name)}</p>${(t.items || []).filter(Boolean).map((i) => line(i, 't-small')).join('')}</div>`).join('')}</div>
    </div>`,

    retro: (c) => `<div class="sl sl-retro">
      ${head(c)}
      ${c.notes && c.notes.length ? `<div class="sl-cols" style="--n:${c.notes.length}">${c.notes.map((n) => `<div>${n.lead ? `<h3 class="t-subhead">${esc(n.lead)}</h3>` : ''}<p class="t-small">${esc(n.body)}</p></div>`).join('')}</div>` : ''}
      ${gapTag(c.gap, 't-body')}
    </div>`,

    ledger: (c) => `<div class="sl sl-ledger">
      ${head(c)}
      <div class="sl-rows">${(c.rows || []).map((r) => `<div class="sl-row"><h3 class="t-heading">${esc(r.title)}</h3><p class="t-small">${esc(r.body)}</p></div>`).join('')}</div>
      ${line(c.foot, 't-small', 'sl-credit')}
    </div>`,

    grid: (c) => `<div class="sl sl-sampler">
      ${head(c)}
      <div class="sl-four">${(c.items || []).map((it) => `<article class="sl-card">
        ${it.image ? `<div class="sl-thumb">${imgTag(it.image, shape(it.image))}</div>` : ''}
        ${it.logo ? `<span class="sl-logo">${imgTag(it.logo)}</span>` : ''}
        <h3 class="t-subhead">${esc(it.title)}</h3>
        ${line(it.blurb, 't-small')}
        ${chips(it.chips)}
      </article>`).join('')}</div>
    </div>`,

    list: (c) => `<div class="sl sl-list">
      ${head(c)}
      <ol class="sl-reasons">${(c.items || []).map((i) => `<li class="t-lede">${esc(i)}</li>`).join('')}</ol>
      ${gapTag(c.gap)}
      ${line(c.close, 't-small', 'sl-close')}
    </div>`,

    divider: (c) => `<div class="sl sl-divider">${c.eyebrow ? `<p class="eyebrow">${esc(c.eyebrow)}</p>` : ''}<h2 class="t-display">${esc(c.heading)}</h2>${line(c.body, 't-lede')}</div>`,

    error: (c) => `<div class="sl sl-divider"><p class="eyebrow">${esc(c.eyebrow)}</p><h2 class="t-title">${esc(c.heading)}</h2><p class="t-body">${esc(c.body)}</p></div>`,
  };

  // Speaker notes: paragraphs; a line in [brackets] is a gap; *an aside* is the compressed-path cue.
  function notesHTML(s) {
    return String(s || '').split(/\n\s*\n/).map((p) => {
      p = p.trim();
      if (!p) return '';
      if (isGap(p)) return `<p class="deck-gap t-small">${esc(p)}</p>`;
      const html = esc(p).replace(/\[([^\]]+)\]/g, '<mark class="deck-gap-inline">[$1]</mark>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return `<p class="t-body">${html}</p>`;
    }).join('');
  }

  function build(m) {
    const stage = $('stage');
    stage.innerHTML = '';
    const slides = [];
    PLAN.slides.forEach((spec) => {
      let c, layout = spec.layout;
      try {
        c = spec.content(m, PLAN);
        if (!LAYOUTS[layout]) throw new Error(`no layout called ${layout}`);
      } catch (err) {
        layout = 'error';
        c = { eyebrow: spec.section, heading: 'This slide couldn’t be read from the site.', body: err.message };
      }
      const el = document.createElement('section');
      el.className = `slide${c.className ? ' ' + c.className : ''}`;
      el.id = 'slide-' + spec.id;
      el.dataset.id = spec.id;
      el.dataset.section = spec.section;
      if (spec.skip) el.dataset.skip = spec.skip;
      el.setAttribute('aria-roledescription', 'slide');
      el.innerHTML = LAYOUTS[layout](c) + `<span class="deck-num t-micro" aria-hidden="true"></span>` + `<div class="slide-notes" role="note"><p class="eyebrow">Notes</p>${notesHTML(spec.notes)}</div>`;
      el.setAttribute('aria-label', text(q(el, 'h2')) || spec.id);
      stage.appendChild(el);
      slides.push({ spec, el, notes: notesHTML(spec.notes) });
    });
    return slides;
  }


  // ---- Moving through it ----------------------------------------------------------

  let slides = [], at = 0;
  const path = () => document.body.classList.contains('path-compressed') ? 'compressed' : 'full';
  const shown = () => slides.filter((s) => path() === 'full' || !s.spec.skip);
  const stageMode = () => stageMQ.matches && !printing;
  let printing = false;

  function sync() {
    const list = shown();
    if (!list.length) return;
    at = Math.min(Math.max(at, 0), list.length - 1);
    const cur = list[at];
    slides.forEach((s) => {
      const inPath = list.includes(s);
      s.el.hidden = stageMode() ? s !== cur : !inPath;
      s.el.classList.toggle('is-current', s === cur);
    });
    list.forEach((s, i) => { q(s.el, '.deck-num').textContent = `${i + 1} / ${list.length}`; });
    $('count').textContent = `${at + 1} / ${list.length}`;
    $('where').textContent = whereText(cur);
    $('where').classList.remove('is-over');
    $('prev').disabled = at === 0;
    $('next').disabled = at === list.length - 1;
    $('notes-head').textContent = `Notes · ${at + 1} of ${list.length}`;
    $('notes-body').innerHTML = cur.notes || '<p class="t-small">No notes on this one.</p>';
    if (location.hash !== '#' + cur.spec.id) history.replaceState(null, '', '#' + cur.spec.id);
    if (stageMode()) requestAnimationFrame(() => checkFit(cur));
    markGrid();
  }

  function go(i, animate = true) {
    const list = shown();
    i = Math.min(Math.max(i, 0), list.length - 1);
    if (stageMode() && i === at && list[i] && !list[i].el.hidden) return;
    at = i;
    startClock();
    sync();
    const cur = list[at];
    if (animate && stageMode() && !reduced) {   // the site's rise, on the slide's content
      const sl = q(cur.el, '.sl');
      sl.classList.remove('is-in'); void sl.offsetWidth; sl.classList.add('is-in');
    }
    if (!stageMode()) cur.el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }
  const step = (d) => go(at + d);
  const goTo = (id) => { const i = shown().findIndex((s) => s.spec.id === id); if (i >= 0) go(i, false); };

  // A slide whose content no longer fits its 16:9 (the site's copy grew) is
  // flagged, here and in the overview, so it gets seen before a panel does.
  const overflows = (el) => {
    const sl = q(el, '.sl');
    if (!sl) return false;
    const box = sl.getBoundingClientRect(), floor = box.bottom - parseFloat(getComputedStyle(sl).paddingBottom);
    if (!box.height) return false;   // not laid out (the overview is open)
    let low = 0;
    for (const d of sl.querySelectorAll('*')) { if (getComputedStyle(d).position === 'absolute') continue; low = Math.max(low, d.getBoundingClientRect().bottom); }
    return low > floor + Math.max(4, box.height * .005);
  };
  function checkFit(s) {
    const over = overflows(s.el);
    s.el.classList.toggle('is-over', over);
    $('where').classList.toggle('is-over', over);
    $('where').textContent = whereText(s) + (over ? ' · overflows' : '');
  }
  // Every slide, measured at the stage's size: shown for a frame under the current one, then hidden again.
  function measureAll() {
    if (!stageMode() || document.body.classList.contains('grid-on')) return;
    slides.forEach((s) => {
      const was = s.el.hidden;
      if (was) { s.el.hidden = false; s.el.classList.add('is-measuring'); }
      s.el.classList.toggle('is-over', overflows(s.el));
      if (was) { s.el.hidden = true; s.el.classList.remove('is-measuring'); }
    });
    markGrid();
  }
  const whereText = (s) => `${s.spec.section} · ${s.el.getAttribute('aria-label')}`;

  // ---- The clock ----
  let clockStart = 0, clockTimer = null;
  const pad = (n) => String(n).padStart(2, '0');
  function tick() {
    const s = Math.floor((Date.now() - clockStart) / 1000);
    $('timer').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    $('timer').classList.toggle('is-late', s > PLAN.minutes * 60);
  }
  function startClock() { if (clockStart) return; clockStart = Date.now(); clockTimer = setInterval(tick, 1000); tick(); }
  function resetClock() { clockStart = 0; clearInterval(clockTimer); $('timer').textContent = '00:00'; $('timer').classList.remove('is-late'); }

  // ---- Notes, path, overview, fullscreen ----
  function setNotes(on) {
    document.body.classList.toggle('notes-on', on);
    $('notes').hidden = !on;
    $('notes-btn').setAttribute('aria-pressed', String(on));
    store.set('notes', on ? '1' : '0');
  }
  function setPath(compressed) {
    const cur = shown()[at];
    document.body.classList.toggle('path-compressed', compressed);
    $('path').setAttribute('aria-pressed', String(compressed));
    store.set('path', compressed ? 'compressed' : 'full');
    const i = shown().indexOf(cur);   // stay on the same slide, or the nearest kept one
    at = i >= 0 ? i : Math.max(0, shown().findIndex((s) => slides.indexOf(s) > slides.indexOf(cur)));
    sync();
  }

  function buildGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    slides.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'deck-thumb';
      b.dataset.id = s.spec.id;
      const clone = s.el.cloneNode(true);
      clone.hidden = false; clone.removeAttribute('id'); clone.setAttribute('inert', ''); clone.setAttribute('aria-hidden', 'true');
      q(clone, '.slide-notes').remove();
      b.appendChild(clone);
      b.insertAdjacentHTML('beforeend', `<span class="deck-thumb-label t-small"><b>${i + 1}</b> ${esc(s.spec.section)} · ${esc(s.el.getAttribute('aria-label'))}${s.spec.skip ? ' <em class="t-micro">skipped on the compressed path</em>' : ''}</span>`);
      b.setAttribute('aria-label', `Slide ${i + 1}: ${s.el.getAttribute('aria-label')}`);
      b.addEventListener('click', () => { setGrid(false); if (s.spec.skip && path() === 'compressed') setPath(false); goTo(s.spec.id); });
      grid.appendChild(b);
    });
    markGrid();
  }
  function markGrid() {
    const cur = shown()[at];
    qa($('grid'), '.deck-thumb').forEach((b) => {
      const s = slides.find((x) => x.spec.id === b.dataset.id);
      b.classList.toggle('is-current', s === cur);
      b.classList.toggle('is-skipped', !!(s.spec.skip && path() === 'compressed'));
      b.classList.toggle('is-over', s.el.classList.contains('is-over'));
      b.setAttribute('aria-current', s === cur ? 'true' : 'false');
    });
  }
  function setGrid(on) {
    const grid = $('grid');
    if (on) measureAll();   // before the stage goes, so the flags are current
    if (on && !grid.children.length) buildGrid();
    grid.hidden = !on;
    document.body.classList.toggle('grid-on', on);
    $('grid-btn').setAttribute('aria-pressed', String(on));
    if (on) {
      const cur = q(grid, '.is-current'); if (cur) cur.focus();
    } else {
      $('grid-btn').focus();
    }
  }

  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function present() {
    const block = $('present-block');
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const ask = block.requestFullscreen || block.webkitRequestFullscreen;
    if (ask) ask.call(block).catch(() => {});
  }
  function onFullscreen() {
    const on = !!fsEl();
    document.body.classList.toggle('presenting', on);
    $('present').textContent = on ? 'Leave' : 'Present';
  }


  // ---- Wiring ---------------------------------------------------------------------

  function keys(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    const gridOpen = !$('grid').hidden;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': if (gridOpen) return; e.preventDefault(); step(1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': if (gridOpen) return; e.preventDefault(); step(-1); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(shown().length - 1); break;
      case 'n': case 'N': setNotes($('notes').hidden); break;
      case 'c': case 'C': setPath(path() === 'full'); break;
      case 'g': case 'G': setGrid($('grid').hidden); break;
      case 'f': case 'F': present(); break;
      case 't': case 'T': resetClock(); break;
      case 'Escape': if (gridOpen) setGrid(false); break;
    }
  }

  // A swipe on the stage moves a slide.
  function swipes() {
    let x0 = null;
    const stage = $('stage');
    stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
    stage.addEventListener('pointerup', (e) => {
      if (x0 === null || !stageMode()) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    });
  }

  // A table wider than its frame scrolls sideways (the phone), so the frame is a labelled tab stop while it does.
  function tableWraps() {
    if (!('ResizeObserver' in window)) return;
    qa($('stage'), '.sl-table-wrap').forEach((w) => {
      const ro = new ResizeObserver(() => {
        const scrolls = w.scrollWidth > w.clientWidth + 1;
        if (scrolls) { w.tabIndex = 0; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Table, scroll sideways'); }
        else { w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label'); }
      });
      ro.observe(w);
      const t = q(w, 'table'); if (t) ro.observe(t);
    });
  }

  function notice(m) {
    const n = $('notice');
    if (!m.failed.length) { n.hidden = true; return; }
    n.innerHTML = `<b>Some of the site couldn’t be read.</b> ${m.failed.map((f) => `${esc(f.path)}: ${esc(f.why)}`).join(' · ')}. The slides that need those pages say so; the rest are fine.`;
    n.hidden = false;
  }

  async function start() {
    const live = $('live'), liveLabel = $('live-label');
    const setLive = (state, label) => { live.dataset.state = state; liveLabel.textContent = label; };
    let m;
    try { m = await readSite(); }
    catch (err) { setLive('off', 'Couldn’t read the site'); $('where').textContent = err.message; return; }
    notice(m);
    setLive(m.failed.length ? 'off' : 'on', `Built from the site at ${new Date().toLocaleTimeString('en-US', { timeStyle: 'short' })}`);
    slides = build(m);

    setNotes(store.get('notes') === '1');
    document.body.classList.toggle('path-compressed', store.get('path') === 'compressed');
    $('path').setAttribute('aria-pressed', String(path() === 'compressed'));

    const wanted = location.hash.slice(1);
    at = Math.max(0, shown().findIndex((s) => s.spec.id === wanted));
    sync();
    if (!stageMode() && wanted) goTo(wanted);

    $('prev').addEventListener('click', () => step(-1));
    $('next').addEventListener('click', () => step(1));
    $('notes-btn').addEventListener('click', () => setNotes($('notes').hidden));
    $('path').addEventListener('click', () => setPath(path() === 'full'));
    $('grid-btn').addEventListener('click', () => setGrid($('grid').hidden));
    $('present').addEventListener('click', present);
    $('timer').addEventListener('click', resetClock);
    document.addEventListener('keydown', keys);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && shown()[at].spec.id !== id) goTo(id); });
    stageMQ.addEventListener('change', sync);
    window.addEventListener('beforeprint', () => { printing = true; sync(); });
    window.addEventListener('afterprint', () => { printing = false; sync(); });
    let sized = null;
    window.addEventListener('resize', () => { clearTimeout(sized); sized = setTimeout(() => { measureAll(); if (stageMode()) checkFit(shown()[at]); }, 200); });
    document.fonts.ready.then(measureAll);
    document.fonts.addEventListener('loadingdone', measureAll);   // the faces arrive after the first paint
    swipes();
    tableWraps();
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) $('present').hidden = true;
  }

  start();
})();

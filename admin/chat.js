/* The dashboard's Chat page (admin/chat.html): what people asked the site's
   assistant, and the settings it answers by. Questions come from
   /api/activity?chats (middleware.js CHAT_KEY), read in full once and then
   polled for new ones; the settings from /api/chat-settings. A hash in the
   Visitor column opens the Activity page following that person. */
(() => {
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 15000;
  const HOUR = 3600000;
  const NAMES = {
    '/': 'Home', '/index.html': 'Home', '/work.html': 'Work',
    '/work/cross-sell.html': 'Cross-Sell', '/work/verifications.html': 'Verifications',
    '/work/refinance-offers.html': 'Refinance offers', '/work/staking.html': 'Staking',
    '/work/no-code-tools.html': 'No-code tools', '/work/sign-in-with-ethereum.html': 'Sign-in with Ethereum',
    '/work/design-system-audit-agent.html': 'Design system audit agent',
  };
  const pageName = (p) => NAMES[p] || p.replace(/^\/work\//, '').replace(/\.html$/, '') || p;
  const n = (x) => x.toLocaleString('en-US');
  function ago(t, now) {
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  const stamp = (t) => new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  // The period, the same three as the Activity page's: calendar days, or the
  // last 24 clock hours with the current one included.
  const RANGES = { day: 'last 24 hours', week: 'last 7 days', month: 'last 30 days' };
  let range = 'week';
  const rangeStart = (now) => {
    if (range === 'day') { const d = new Date(now); d.setMinutes(0, 0, 0); return d.getTime() - 23 * HOUR; }
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (range === 'week' ? 6 : 29)); return d.getTime();
  };

  let chats = [];
  const chatSeen = new Set();
  let lastT = 0;

  // ---- Questions ----
  // What people asked the chat in the period, newest first. The answer folds
  // under its first line. Redrawn whole: it is short, and the period and new
  // arrivals both change it.
  const clip = (s, len) => (s.length > len ? `${s.slice(0, len - 1).trimEnd()}…` : s);
  const plainAnswer = (a) => String(a || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  function renderQuestions(now) {
    const start = rangeStart(now);
    const shown = chats.filter((c) => c.t >= start);
    const tb = $('questions');
    tb.replaceChildren(...shown.slice(0, 100).map((c) => {
      const tr = document.createElement('tr');
      const cell = (cls, label) => { const td = document.createElement('td'); td.className = `c-${cls}`; if (label) td.dataset.label = label; tr.appendChild(td); return td; };
      const when = cell('time');
      when.textContent = ago(c.t, now); when.title = stamp(c.t);
      cell('question', 'Question').textContent = c.q || '';
      const ans = cell('answer', 'Answer');
      const text = plainAnswer(c.a);
      if (text.length > 90) {
        const d = document.createElement('details');
        const sm = document.createElement('summary'); sm.textContent = clip(text, 90);
        const full = document.createElement('p');
        full.textContent = String(c.a).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').trim();   // its own lines kept: a list reads as one
        d.append(sm, full); ans.appendChild(d);
      } else ans.textContent = text || '–';
      if (c.asked || c.unlocked) {
        const b = document.createElement('span');
        b.className = 'dash-kind';
        b.dataset.kind = c.unlocked ? 'unlocked' : 'gated';
        b.textContent = c.unlocked ? 'Unlocked' : 'Asked for the password';
        ans.appendChild(b);
      }
      cell('page', 'Page').textContent = c.page ? pageName(c.page) : '–';
      cell('where', 'Where').textContent = c.where || 'unknown';
      const who = cell('visitor', 'Visitor');
      if (c.visitor) {
        const a = document.createElement('a');
        a.className = 'dash-visitor'; a.href = `/admin/?visitor=${encodeURIComponent(c.visitor)}`;
        a.textContent = c.visitor; a.title = 'Follow this visitor on the Activity page';
        who.appendChild(a);
      }
      return tr;
    }));
    $('questions-empty').hidden = shown.length > 0;
    const people = new Set(shown.map((c) => c.visitor)).size;
    $('questions-note').textContent = shown.length
      ? `${n(shown.length)} question${shown.length === 1 ? '' : 's'} from ${n(people)} ${people === 1 ? 'person' : 'people'}, newest first, with the answer each got. A password typed into the chat is never kept. Press a hash in the Visitor column to follow that person on the Activity page.`
      : 'What people asked the chat, newest first, with its answer. A password typed into it is never kept.';
  }

  // ---- The period control ----
  const tabs = $('range');
  const setTabLine = () => {
    const t = tabs.querySelector('[aria-pressed="true"]');
    if (!t) return;
    tabs.style.setProperty('--tab-x', `${t.offsetLeft}px`);
    tabs.style.setProperty('--tab-y', `${t.offsetTop + t.offsetHeight - 2}px`);
    tabs.style.setProperty('--tab-w', String(t.offsetWidth));
  };
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b || b.dataset.range === range) return;
    range = b.dataset.range;
    for (const t of tabs.querySelectorAll('[data-range]')) t.setAttribute('aria-pressed', String(t === b));
    for (const el of document.querySelectorAll('[data-period]')) el.textContent = RANGES[range];
    setTabLine();
    renderQuestions(Date.now());
  });
  window.addEventListener('resize', setTabLine);
  document.fonts?.ready.then(setTabLine);
  setTabLine();

  // The table is wider than a narrow window and scrolls sideways, so its frame is
  // a tab stop while it overflows (dash.js does the same for the Activity tables).
  if ('ResizeObserver' in window) {
    document.querySelectorAll('.table-wrap').forEach((w) => {
      const ro = new ResizeObserver(() => {
        if (w.scrollWidth > w.clientWidth + 1) { w.tabIndex = 0; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Table, scroll sideways'); }
        else { w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label'); }
      });
      ro.observe(w);
      ro.observe(w.querySelector('table'));
    });
  }

  // ---- Chat settings ----
  // It reads /api/chat-settings once (the settings, the models, the defaults,
  // and whether the key and the store are there) and saves the whole form
  // back; the edge cleans what it is given and answers with what it kept,
  // which the form then shows.
  const form = $('chat-settings-form');
  const COST = { 'claude-haiku-4-5': 0.027, 'claude-sonnet-5': 0.055 };   // dollars a question at worst: every page read fresh into the cache, a long answer
  let defaults = null;
  const f = { on: $('chat-set-on'), hour: $('chat-set-hour'), day: $('chat-set-day'), starters: $('chat-set-starters'), notes: $('chat-set-notes') };
  const modelPick = () => (form.querySelector('input[name="chat-set-model"]:checked') || {}).value;
  const ceiling = () => {
    const day = Math.max(0, Math.round(Number(f.day.value) || 0)), per = COST[modelPick()] || COST['claude-haiku-4-5'];
    $('chat-set-day-help').textContent = day
      ? `The cost ceiling. At ${n(day)} a day the chat can spend at most about $${(day * per).toFixed(2)} a day on this model. Most days it spends a small part of that.`
      : 'At 0 the chat answers nothing, the same as switching it off.';
  };
  function fill(st) {
    f.on.checked = !!st.on;
    const pick = form.querySelector(`input[name="chat-set-model"][value="${st.model}"]`);
    if (pick) pick.checked = true;
    f.hour.value = st.hourLimit; f.day.value = st.dayLimit;
    f.starters.value = (st.starters || []).join('\n');
    f.notes.value = st.notes || '';
    ceiling();
  }
  function read() {
    return {
      on: f.on.checked, model: modelPick(),
      hourLimit: Number(f.hour.value), dayLimit: Number(f.day.value),
      starters: f.starters.value.split('\n'), notes: f.notes.value,
    };
  }
  async function loadSettings() {
    try {
      const res = await fetch('/api/chat-settings', { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) { location.reload(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      defaults = data.defaults;
      $('chat-set-model').replaceChildren(...Object.entries(data.models).map(([id, label]) => {
        const l = document.createElement('label'); l.className = 'dash-choice';
        const r = document.createElement('input'); r.type = 'radio'; r.name = 'chat-set-model'; r.value = id;
        r.addEventListener('change', ceiling);
        l.append(r, ` ${label}`);
        return l;
      }));
      fill(data.settings);
      const state = [];
      let warn = !data.key || !data.store;
      state.push(data.key ? 'The API key is set in Vercel.' : 'The API key isn\'t set, so the chat stays hidden whatever this says. Add ANTHROPIC_API_KEY in Vercel (Settings → Environment Variables) and redeploy.');
      if (!data.store) state.push('No store is connected, so these are the defaults and a save has nowhere to go.');
      // What the chat function can read: the pages vercel.json bundles with it.
      const chat = await fetch('/api/chat', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (chat && chat.pages) {
        const { open, gated } = chat.pages;
        if (open) state.push(`It reads ${n(open)} public page${open === 1 ? '' : 's'} and ${n(gated)} case stud${gated === 1 ? 'y' : 'ies'}.`);
        else { state.push('It can\'t find the pages it answers from. Check includeFiles for api/chat.js in vercel.json.'); warn = true; }
      }
      $('chat-settings-state').textContent = state.join(' ');
      $('chat-settings-state').classList.toggle('is-warn', warn);
      $('chat-settings-fields').disabled = false;
      $('chat-settings-save').disabled = !data.store;
      $('chat-settings-defaults').disabled = false;
    } catch (err) {
      console.error(err);
      $('chat-settings-state').textContent = 'The settings couldn\'t be loaded. Reload to try again.';
      $('chat-settings-state').classList.add('is-warn');
    }
  }
  f.day.addEventListener('input', ceiling);
  $('chat-settings-defaults').addEventListener('click', () => {
    if (!defaults) return;
    fill(defaults);
    $('chat-settings-status').textContent = 'Defaults filled in. Save to use them.';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('chat-settings-save');
    btn.disabled = true;
    $('chat-settings-status').textContent = 'Saving…';
    try {
      const res = await fetch('/api/chat-settings', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: read() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      fill(data.settings);
      $('chat-settings-status').textContent = `Saved at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Visitors get it within half a minute.`;
    } catch (err) {
      $('chat-settings-status').textContent = `Not saved: ${err.message}`;
    }
    btn.disabled = false;
  });
  loadSettings();

  // ---- Load ----
  async function poll() {
    try {
      const res = await fetch(`/api/activity?chats${lastT ? `&since=${lastT}` : ''}`, { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) { location.reload(); return; }        // cookie gone: back to the gate
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.configured) {
        $('notice').textContent = 'No store is connected yet, so no questions are being kept. Add an Upstash Redis database to the Vercel project and redeploy; the README has the steps.';
        $('notice').hidden = false;
        return;
      }
      $('notice').hidden = true;
      const fresh = (data.chats || []).filter((c) => !chatSeen.has(`${c.t}|${c.visitor}`));
      for (const c of fresh) chatSeen.add(`${c.t}|${c.visitor}`);
      if (fresh.length) chats = fresh.concat(chats).sort((a, b) => b.t - a.t).slice(0, 1000);
      if (chats[0]) lastT = Math.max(lastT, chats[0].t);
      renderQuestions(Date.now());
    } catch (err) {
      console.error(err);
      $('notice').textContent = `The questions can't be read right now (${err.message}). This page keeps trying.`;
      $('notice').hidden = false;
    }
  }
  let timer = null;
  const start = () => { if (!timer) { poll(); timer = setInterval(poll, POLL_MS); } };
  const stop = () => { clearInterval(timer); timer = null; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
})();

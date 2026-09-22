/* The dashboard's Nine holes section (admin/index.html): the whole leaderboard
   with a Delete on each place, the words kept off it, and the settings the
   game plays by. Reads and writes /api/board (middleware.js), which answers
   every change with the lot, so each render starts from what the store holds.
   Delete and Clear all arm on the first press and act on the second, the way
   Block does in Sent by. Read again every 30 seconds while the tab is open,
   unless something in the section has focus. */
(() => {
  const $ = (id) => document.getElementById(id);
  const section = document.querySelector('.dash-golf');
  if (!section) return;
  const REFRESH_MS = 30000;
  const FIELDS = {
    holes: ['Holes in a round', ''],
    par: ['Par on each hole', ''],
    cup: ['Cup width', 'Game pixels, odd'],
    putt: ['Putting range', 'Game pixels from the cup; 0 turns putting off'],
    wind: ['Strongest wind', ''],
    aim: ['Aim arrow swing', 'Seconds; higher is slower'],
    power: ['Power meter swing', 'Seconds; higher is slower'],
    hazards: ['Holes with a bunker or pond', 'Percent'],
  };
  let limits = null, saved = null, armed = '';
  const n = (v) => Number(v).toLocaleString();
  const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
  const boardStatus = $('board-status');

  async function call(body) {
    const res = await fetch('/api/board', body
      ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { credentials: 'same-origin' });
    if (res.status === 401) { location.reload(); throw new Error('signed out'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    render(data);
    return data;
  }

  // ---- Leaderboard ----
  function renderBoard(entries) {
    const ol = $('board');
    $('board-count').textContent = n(entries.length);
    $('board-empty').hidden = entries.length > 0;
    $('board-clear').hidden = !entries.length;
    ol.replaceChildren(...entries.map((e, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('span'); rank.className = 'dash-rank'; rank.textContent = i + 1;
      const name = document.createElement('span'); name.className = 'dash-label'; name.textContent = e.name;
      const score = document.createElement('span'); score.className = 'dash-count'; score.textContent = e.score;
      const date = document.createElement('span'); date.className = 'dash-when'; date.textContent = when(e.t);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dash-act'; b.dataset.id = e.id; b.dataset.name = e.name;
      setArmed(b, armed === e.id);
      li.append(rank, name, score, date, b);
      return li;
    }));
  }
  function setArmed(b, on) {
    const who = b.dataset.name;
    b.classList.toggle('is-armed', on);
    b.textContent = on ? 'Sure?' : 'Delete';
    b.setAttribute('aria-label', on ? `Delete ${who}: press again to confirm` : `Delete ${who}`);
  }
  function disarm() {
    if (!armed) return;
    const b = armed === 'all' ? $('board-clear') : $('board').querySelector(`[data-id="${CSS.escape(armed)}"]`);
    armed = '';
    if (b === $('board-clear')) { b.textContent = 'Clear all'; b.classList.remove('is-armed'); b.removeAttribute('aria-label'); }
    else if (b) setArmed(b, false);
    if (boardStatus.textContent.endsWith('confirm.')) boardStatus.textContent = '';
  }
  $('board').addEventListener('click', async (e) => {
    const b = e.target.closest('.dash-act');
    if (!b) return;
    const { id, name } = b.dataset;
    if (armed !== id) { disarm(); armed = id; setArmed(b, true); boardStatus.textContent = `Deleting ${name} takes it off the board for good. Press again to confirm.`; return; }
    armed = '';
    const next = b.closest('li').nextElementSibling || b.closest('li').previousElementSibling;
    const nextId = next && next.querySelector('.dash-act').dataset.id;
    boardStatus.textContent = `Deleting ${name}…`;
    try {
      await call({ remove: id });
      boardStatus.textContent = `Deleted ${name}.`;
      const to = nextId && $('board').querySelector(`[data-id="${CSS.escape(nextId)}"]`);
      (to || boardStatus).focus();
    } catch (err) { boardStatus.textContent = `Couldn't delete ${name}: ${err.message}`; }
  });
  $('board-clear').addEventListener('click', async () => {
    const b = $('board-clear');
    if (armed !== 'all') {
      disarm(); armed = 'all';
      b.textContent = 'Sure?'; b.classList.add('is-armed'); b.setAttribute('aria-label', 'Clear the whole leaderboard: press again to confirm');
      boardStatus.textContent = `Clearing takes all ${$('board-count').textContent} places off the board for good. Press again to confirm.`;
      return;
    }
    disarm();
    try { const d = await call({ clear: true }); boardStatus.textContent = `Cleared ${n(d.removed)} place${d.removed === 1 ? '' : 's'}.`; boardStatus.focus(); }
    catch (err) { boardStatus.textContent = `Couldn't clear the board: ${err.message}`; }
  });
  section.addEventListener('keydown', (e) => { if (e.key === 'Escape') disarm(); });
  section.addEventListener('focusout', (e) => { if (armed && !section.contains(e.relatedTarget)) disarm(); });

  // ---- Banned words ----
  function renderBans(words) {
    $('ban-list').replaceChildren(...words.map((w) => {
      const li = document.createElement('li');
      const s = document.createElement('span'); s.textContent = w;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dash-act'; b.dataset.word = w; b.textContent = 'Unban'; b.setAttribute('aria-label', `Unban ${w}`);
      li.append(s, b);
      return li;
    }));
  }
  const clean = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  $('ban-word').addEventListener('input', (e) => { const v = clean(e.target.value); if (v !== e.target.value) e.target.value = v; e.target.removeAttribute('aria-invalid'); });
  $('ban-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('ban-word'), word = clean(input.value), status = $('ban-status');
    if (!word) { input.setAttribute('aria-invalid', 'true'); status.textContent = 'Type a word to ban.'; input.focus(); return; }
    status.textContent = `Banning ${word}…`;
    try {
      const d = await call({ ban: word });
      input.value = '';
      status.textContent = `Banned ${word}${d.removed ? ` and removed ${n(d.removed)} name${d.removed === 1 ? '' : 's'} from the board` : ''}.`;
    } catch (err) { status.textContent = `Couldn't ban ${word}: ${err.message}`; }
  });
  $('ban-list').addEventListener('click', async (e) => {
    const b = e.target.closest('.dash-act');
    if (!b) return;
    const word = b.dataset.word, status = $('ban-status');
    try { await call({ unban: word }); status.textContent = `${word} is allowed again, unless the built-in list catches it.`; $('ban-word').focus(); }
    catch (err) { status.textContent = `Couldn't unban ${word}: ${err.message}`; }
  });

  // ---- Settings ----
  // Built from the limits the edge sends, so a new setting there needs only a
  // label here. Numbers are clamped by the edge as well; the inputs say the range.
  function buildFields() {
    const box = $('golf-fields');
    box.replaceChildren(...Object.entries(limits).map(([k, [d, lo, hi, step]]) => {
      const [label, hint] = FIELDS[k] || [k, ''];
      const row = document.createElement('div'); row.className = 'dash-field';
      const l = document.createElement('label'); l.htmlFor = `golf-${k}`;
      l.innerHTML = `<span></span><small></small>`;
      l.firstChild.textContent = label;
      l.lastChild.textContent = `${hint ? `${hint} · ` : ''}${lo}–${hi}, default ${d}`;
      const i = document.createElement('input'); i.type = 'number'; i.id = `golf-${k}`; i.name = k; i.min = lo; i.max = hi; i.step = step; i.inputMode = 'decimal';
      row.append(l, i);
      return row;
    }), (() => {
      const row = document.createElement('div'); row.className = 'dash-field';
      row.innerHTML = '<label for="golf-open"><span>Take new scores</span><small>Off keeps the board up but closes it to new rounds</small></label><input type="checkbox" id="golf-open" name="open">';
      return row;
    })());
  }
  function fill(st) {
    for (const k of Object.keys(limits)) $(`golf-${k}`).value = st[k];
    $('golf-open').checked = st.open;
  }
  function renderSettings(st, lim) {
    if (!limits) { limits = lim; buildFields(); }
    const focused = $('golf-settings').contains(document.activeElement);
    if (!focused || !saved) fill(st);
    saved = st;
  }
  function read() {
    const out = { open: $('golf-open').checked };
    let bad = null;
    for (const [k, [, lo, hi]] of Object.entries(limits)) {
      const i = $(`golf-${k}`), v = Number(i.value);
      const ok = i.value !== '' && Number.isFinite(v) && v >= lo && v <= hi;
      if (ok) i.removeAttribute('aria-invalid'); else i.setAttribute('aria-invalid', 'true');
      if (!ok && !bad) bad = i;
      out[k] = v;
    }
    return { out, bad };
  }
  $('golf-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('settings-status'), { out, bad } = read();
    if (bad) { const [label] = FIELDS[bad.name] || [bad.name]; status.textContent = `${label} needs a number from ${bad.min} to ${bad.max}.`; bad.focus(); return; }
    const before = saved;
    status.textContent = 'Saving…';
    try {
      const d = await call({ settings: out });
      fill(d.settings);
      const changed = before && (before.holes !== d.settings.holes || before.par !== d.settings.par);
      status.textContent = `Saved. The game plays these from the next round.${changed && d.entries.length ? ' The rounds already on the board were played to the old length; Clear all to start the board fresh.' : ''}`;
    } catch (err) { status.textContent = `Couldn't save: ${err.message}`; }
  });
  $('golf-defaults').addEventListener('click', () => {
    if (!limits) return;
    const st = { open: $('golf-open').checked };
    for (const [k, [d]] of Object.entries(limits)) st[k] = d;
    fill(st);
    $('settings-status').textContent = 'Defaults filled in. Save settings to use them.';
  });

  // ---- Load ----
  function render(d) {
    if (d.entries) renderBoard(d.entries);
    if (d.banned) renderBans(d.banned);
    if (d.settings) renderSettings(d.settings, d.limits);
  }
  async function load() {
    if (document.hidden || section.contains(document.activeElement)) return;
    try { await call(); $('golf-notice').hidden = true; }
    catch (err) {
      if (err.message === 'signed out') return;
      $('golf-notice').textContent = `The game's leaderboard and settings can't be read: ${err.message}.`;
      $('golf-notice').hidden = false;
    }
  }
  load();
  setInterval(load, REFRESH_MS);
  document.addEventListener('visibilitychange', load);
})();

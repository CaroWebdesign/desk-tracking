// ================= Hilfsfunktionen =================
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function breakMs(b, now) {
  const start = new Date(b.start).getTime();
  const end = b.end ? new Date(b.end).getTime() : now;
  return Math.max(0, end - start);
}
function sessionBreakMs(s, now) {
  return s.breaks.reduce((sum, b) => sum + breakMs(b, now), 0);
}
function sessionNetMs(s, now) {
  const start = new Date(s.clockIn).getTime();
  const end = s.clockOut ? new Date(s.clockOut).getTime() : now;
  return Math.max(0, end - start - sessionBreakMs(s, now));
}

function fmtHMS(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
function fmtHM(ms) {
  const t = Math.floor(ms / 60000);
  const h = Math.floor(t / 60), m = t % 60;
  return [h, m].map((n) => String(n).padStart(2, '0')).join(':');
}
// Anzeige-Rundung der Netto-Zeit gemäß Einstellungen
function roundMs(ms) {
  const r = (state.settings && state.settings.roundingMinutes) || 0;
  if (!r) return ms;
  const step = r * 60000;
  return Math.round(ms / step) * step;
}
function fmtNet(ms) { return fmtHM(roundMs(ms)); }

// ISO -> 'HH:MM' (leer bei null), für Anzeige und Eingabefelder
function toHM(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function timeOfDay(iso) { return iso ? toHM(iso) : '–'; }

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function fmtDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WD[dt.getDay()]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function fmtTs(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} `
    + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
function targetMsPerDay() {
  return ((state.settings && state.settings.targetHoursPerDay) || 0) * 3600000;
}

// ================= Zustand =================
let state = { open: null, sessions: [], projects: [], logs: [], settings: {} };
let currentDay = null; // im Edit-Modal geöffneter Tag
const $ = (id) => document.getElementById(id);

// ================= Projekte =================
function projectName(id) {
  const p = state.projects.find((x) => x.id === id);
  return p ? p.name : '—';
}
function projectById(id) { return state.projects.find((x) => x.id === id) || null; }
function projectRate(id) { const p = projectById(id); return p ? (Number(p.rate) || 0) : 0; }
// Betrag einer Sitzung: gerundete Netto-Stunden × Stundensatz (€)
function sessionAmount(s, now) {
  return (roundMs(sessionNetMs(s, now)) / 3600000) * projectRate(s.projectId);
}
function fmtEur(v) {
  return (v || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
// Betrag fürs CSV: deutsches Dezimalkomma, ohne Tausenderpunkt/Symbol
function eurCsv(v) { return (v || 0).toFixed(2).replace('.', ','); }
function projectLabel(p) { return p.name + (p.closed ? ' (abgeschlossen)' : ''); }

// Options-HTML für ein Projekt-<select> (für innerHTML-Vorlagen)
function projectOptionsHtml(selectedId) {
  return state.projects.map((p) =>
    `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(projectLabel(p))}</option>`
  ).join('');
}
// Füllt ein <select> mit den Projekten.
//  allOption=true -> Eintrag „Alle Projekte"; openOnly=true -> abgeschlossene ausblenden
//  (das aktuell gewählte bleibt aber sichtbar, damit der Wert gültig bleibt).
function fillProjectSelect(sel, { allOption = false, selected, openOnly = false } = {}) {
  if (!sel) return;
  const want = selected !== undefined ? selected : sel.value;
  let list = state.projects;
  if (openOnly) list = list.filter((p) => !p.closed || p.id === want);
  sel.innerHTML = '';
  if (allOption) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'Alle Projekte';
    sel.appendChild(o);
  }
  for (const p of list) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = projectLabel(p);
    sel.appendChild(o);
  }
  sel.value = [...sel.options].some((o) => o.value === want)
    ? want : (sel.options[0] ? sel.options[0].value : '');
}

// ================= Live-Uhr =================
function tick() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString('de-DE');
  const todayKey = localDateKey(now);
  const nowMs = now.getTime();
  const todayMs = state.sessions
    .filter((s) => s.date === todayKey)
    .reduce((sum, s) => sum + sessionNetMs(s, nowMs), 0);
  $('workToday').textContent = fmtHMS(todayMs);

  if (state.open) {
    const onBreak = state.open.breaks.some((b) => b.end === null);
    const since = toHM(state.open.clockIn);
    const proj = projectName(state.open.projectId);
    $('sessionInfo').textContent = onBreak
      ? `In Pause · ${proj} · eingestempelt seit ${since} Uhr`
      : `${proj} · eingestempelt seit ${since} Uhr`;
  } else {
    $('sessionInfo').textContent = '';
  }
}

function renderStatus() {
  const open = state.open;
  const onBreak = open && open.breaks.some((b) => b.end === null);
  const dot = $('statusDot'), txt = $('statusText');
  dot.className = 'dot ' + (onBreak ? 'dot-break' : open ? 'dot-on' : 'dot-off');
  txt.textContent = onBreak ? 'In Pause' : open ? 'Eingestempelt' : 'Nicht eingestempelt';
  const hasOpenProject = state.projects.some((p) => !p.closed);
  $('btnIn').disabled = !!open || !hasOpenProject;
  $('btnOut').disabled = !open;
  $('btnBreakStart').disabled = !open || onBreak;
  $('btnBreakEnd').disabled = !open || !onBreak;

  // Projektwahl: bei offener Sitzung deren Projekt zeigen und sperren,
  // sonst nur offene Projekte für die nächste Stempelung anbieten.
  const sel = $('activeProject');
  if (sel) {
    fillProjectSelect(sel, {
      selected: open ? open.projectId : state.settings.activeProjectId,
      openOnly: true,
    });
    sel.disabled = !!open;
  }
}

// ================= Auswertung (Erfassung) =================
function monthsWithData() {
  const set = new Set(state.sessions.map((s) => s.date.slice(0, 7)));
  return [...set].sort();
}
function fillMonthSelect(sel) {
  const months = monthsWithData().reverse();
  const current = localDateKey(new Date()).slice(0, 7);
  if (!months.includes(current)) months.unshift(current);
  const prev = sel.value;
  sel.innerHTML = '';
  for (const key of months) {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = monthLabel(key);
    sel.appendChild(opt);
  }
  sel.value = months.includes(prev) ? prev : months[0];
}

function dailyRows(monthKey, projectId) {
  const now = Date.now();
  const days = {};
  for (const s of state.sessions) {
    if (s.date.slice(0, 7) !== monthKey) continue;
    if (projectId && s.projectId !== projectId) continue;
    const d = (days[s.date] = days[s.date] || {
      date: s.date, firstIn: null, lastOut: null, breakMs: 0, netMs: 0, amount: 0, hasOpen: false,
      projectIds: new Set(),
    });
    d.projectIds.add(s.projectId);
    d.amount += sessionAmount(s, now);
    const inMs = new Date(s.clockIn).getTime();
    if (d.firstIn === null || inMs < d.firstIn) d.firstIn = inMs;
    if (s.clockOut) {
      const outMs = new Date(s.clockOut).getTime();
      if (d.lastOut === null || outMs > d.lastOut) d.lastOut = outMs;
    } else d.hasOpen = true;
    d.breakMs += sessionBreakMs(s, now);
    d.netMs += sessionNetMs(s, now);
  }
  return Object.values(days).sort((a, b) => b.date.localeCompare(a.date));
}

function renderReport() {
  const monthKey = $('monthSelect').value;
  const projectId = $('reportProject').value;
  const rows = dailyRows(monthKey, projectId);
  const body = $('reportBody');
  body.innerHTML = '';
  let sumNet = 0, sumBreak = 0;
  for (const r of rows) {
    sumNet += roundMs(r.netMs);
    sumBreak += r.breakMs;
    const blocks = state.sessions
      .filter((s) => s.date === r.date && (!projectId || s.projectId === projectId)).length;
    const projs = [...r.projectIds].map(projectName).join(', ');
    const tr = document.createElement('tr');
    tr.dataset.day = r.date;
    tr.innerHTML = `
      <td>${fmtDate(r.date)} <span class="block-span">· ${blocks}×</span></td>
      <td>${escapeHtml(projs)}</td>
      <td>${toHM(new Date(r.firstIn).toISOString())}</td>
      <td>${r.hasOpen ? '<em>läuft…</em>' : toHM(new Date(r.lastOut).toISOString())}</td>
      <td>${fmtHM(r.breakMs)}</td>
      <td class="col-net">${fmtNet(r.netMs)}</td>
      <td><button class="del-btn" data-day="${r.date}" title="Tag löschen">✕</button></td>`;
    body.appendChild(tr);
  }
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Keine Einträge in diesem Monat.</td></tr>';
  }
  $('sumMonth').textContent = fmtHM(sumNet);
  $('breakMonth').textContent = fmtHM(sumBreak);
  $('daysMonth').textContent = String(rows.length);

  body.querySelectorAll('tr[data-day]').forEach((tr) => {
    tr.addEventListener('click', () => openDayModal(tr.dataset.day));
  });
  body.querySelectorAll('.del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); onDeleteDay(btn.dataset.day); });
  });
}

// ================= Editierbares Tages-Modal =================
function openDayModal(dateKey) {
  currentDay = dateKey;
  renderDayEditor();
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; currentDay = null; }

function editMsg(text, kind) {
  const el = $('modalEditMsg');
  if (el) { el.textContent = text || ''; el.className = 'message' + (text ? ' ' + (kind || 'error') : ''); }
}

// Führt eine Edit-Operation aus: bei Erfolg neu rendern, bei Fehler Meldung zeigen.
// okMsg wird nach dem Neu-Rendern gesetzt (renderDayEditor baut das Meldungsfeld neu auf);
// ist der Tag danach leer, wandert die Meldung in die Hauptansicht.
async function editOp(promise, okMsg) {
  const res = await promise;
  if (res.ok) {
    await refresh();
    renderDayEditor();
    if (okMsg) { editMsg(okMsg, 'ok'); showMessage(okMsg, 'ok'); }
  } else editMsg(res.error);
}

function renderDayEditor() {
  const dateKey = currentDay;
  if (!dateKey) return;
  const now = Date.now();
  const sessions = state.sessions.filter((s) => s.date === dateKey)
    .sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));

  if (sessions.length === 0) { closeModal(); return; }

  let netSum = 0, breakSum = 0, breakCount = 0;
  for (const s of sessions) {
    netSum += sessionNetMs(s, now); breakSum += sessionBreakMs(s, now); breakCount += s.breaks.length;
  }
  $('modalTitle').textContent = fmtDate(dateKey);

  const kpis = `
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Netto-Arbeitszeit</div><div class="kpi-value">${fmtNet(netSum)}</div></div>
      <div class="kpi"><div class="kpi-label">Pausen gesamt</div><div class="kpi-value">${fmtHM(breakSum)}</div></div>
      <div class="kpi"><div class="kpi-label">Arbeitsblöcke</div><div class="kpi-value">${sessions.length}×</div></div>
      <div class="kpi"><div class="kpi-label">Pausen-Anzahl</div><div class="kpi-value">${breakCount}×</div></div>
    </div>`;

  const blocks = sessions.map((s, i) => {
    const running = s.clockOut === null;
    const breaksHtml = s.breaks.map((b, j) => {
      const bo = b.end === null;
      return `
        <div class="break-row" data-sid="${s.id}" data-idx="${j}">
          <input type="time" class="b-start" value="${toHM(b.start)}" />
          <span class="sep">bis</span>
          <input type="time" class="b-end" value="${toHM(b.end)}" ${bo ? 'disabled' : ''} />
          <button class="icon-btn b-save" type="button" title="Pause speichern">✓</button>
          <button class="break-del b-del" type="button" title="Pause löschen">✕</button>
        </div>`;
    }).join('');

    return `
      <div class="edit-block" data-sid="${s.id}">
        <div class="edit-block-head">
          <span class="block-title">Block ${i + 1}${running ? ' · <span class="running">läuft</span>' : ''}</span>
          <span class="block-net">${fmtNet(sessionNetMs(s, now))}</span>
        </div>
        <div class="block-project">
          <label class="field"><span>Projekt</span>
            <select class="s-project">${projectOptionsHtml(s.projectId)}</select>
          </label>
        </div>
        <div class="time-row">
          <label class="field"><span>Datum</span>
            <input type="date" class="s-date" value="${s.date}" ${running ? 'disabled' : ''}
              title="${running ? 'Eine laufende Sitzung kann nicht verschoben werden.' : 'Block auf einen anderen Tag verschieben'}" />
          </label>
          <label class="field"><span>Kommen</span><input type="time" class="s-in" value="${toHM(s.clockIn)}" /></label>
          <label class="field"><span>Gehen</span><input type="time" class="s-out" value="${toHM(s.clockOut)}" /></label>
          <button class="icon-btn s-save" type="button">Zeiten speichern</button>
          <button class="icon-btn danger s-del" type="button">Block löschen</button>
        </div>
        <div class="edit-breaks">
          <div class="edit-breaks-head"><span>Pausen</span></div>
          ${breaksHtml || '<div class="break-none">keine Pausen</div>'}
          <div class="break-row add-break" data-sid="${s.id}">
            <input type="time" class="nb-start" />
            <span class="sep">bis</span>
            <input type="time" class="nb-end" />
            <button class="icon-btn nb-add" type="button" title="Pause hinzufügen">+ Pause</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const addBlock = `
    <div class="edit-block">
      <div class="edit-block-head"><span class="block-title">Neuen Block hinzufügen</span></div>
      <div class="block-project">
        <label class="field"><span>Projekt</span>
          <select id="ab-project">${projectOptionsHtml(state.settings.activeProjectId)}</select>
        </label>
      </div>
      <div class="time-row">
        <label class="field"><span>Kommen</span><input type="time" id="ab-in" /></label>
        <label class="field"><span>Gehen</span><input type="time" id="ab-out" /></label>
        <button class="icon-btn" id="ab-add" type="button">+ Block</button>
      </div>
    </div>`;

  $('modalBody').innerHTML = kpis + blocks + addBlock + '<div id="modalEditMsg" class="message"></div>';
  bindEditorEvents();
}

function bindEditorEvents() {
  // Block-Zeiten speichern / löschen
  $('modalBody').querySelectorAll('.edit-block[data-sid]').forEach((block) => {
    const sid = block.dataset.sid;
    const save = block.querySelector('.s-save');
    const del = block.querySelector('.s-del');
    if (save) save.addEventListener('click', () => {
      const ci = block.querySelector('.s-in').value;
      const co = block.querySelector('.s-out').value;
      const dateEl = block.querySelector('.s-date');
      const newDate = dateEl && !dateEl.disabled ? dateEl.value : '';
      const moved = newDate && newDate !== currentDay;
      editOp(window.api.updateSessionTimes(sid, ci, co, newDate),
        moved ? `Block auf ${fmtDate(newDate)} verschoben.` : 'Zeiten gespeichert.');
    });
    if (del) del.addEventListener('click', () => {
      if (confirm('Diesen Block wirklich löschen?')) editOp(window.api.deleteSession(sid));
    });
    // Projekt des Blocks ändern (speichert sofort)
    const proj = block.querySelector('.s-project');
    if (proj) proj.addEventListener('change', () => {
      editOp(window.api.updateSessionProject(sid, proj.value));
    });
    // neue Pause hinzufügen
    const addRow = block.querySelector('.add-break');
    if (addRow) addRow.querySelector('.nb-add').addEventListener('click', () => {
      editOp(window.api.addBreak(sid,
        addRow.querySelector('.nb-start').value, addRow.querySelector('.nb-end').value));
    });
  });
  // bestehende Pausen speichern / löschen
  $('modalBody').querySelectorAll('.break-row[data-idx]').forEach((row) => {
    const sid = row.dataset.sid, idx = Number(row.dataset.idx);
    row.querySelector('.b-save').addEventListener('click', () => {
      editOp(window.api.updateBreak(sid, idx,
        row.querySelector('.b-start').value, row.querySelector('.b-end').value));
    });
    row.querySelector('.b-del').addEventListener('click', () => {
      if (confirm('Diese Pause löschen?')) editOp(window.api.deleteBreak(sid, idx));
    });
  });
  // neuen Block hinzufügen
  const abAdd = $('ab-add');
  if (abAdd) abAdd.addEventListener('click', () => {
    editOp(window.api.addManual({
      date: currentDay, projectId: $('ab-project') ? $('ab-project').value : undefined,
      clockIn: $('ab-in').value, clockOut: $('ab-out').value, breaks: [],
    }));
  });
}

// ================= Formular „Zeit nachtragen" =================
function addBreakRow(start = '', end = '') {
  const row = document.createElement('div');
  row.className = 'break-row';
  row.innerHTML = `
    <input type="time" class="b-start" value="${start}" />
    <span class="sep">bis</span>
    <input type="time" class="b-end" value="${end}" />
    <button class="break-del" type="button" title="Pause entfernen">✕</button>`;
  row.querySelector('.break-del').addEventListener('click', () => row.remove());
  $('fBreaks').appendChild(row);
}
function openFormModal() {
  const monthKey = $('monthSelect').value;
  const today = localDateKey(new Date());
  $('fDate').value = today.startsWith(monthKey) ? today : monthKey + '-01';
  const rp = $('reportProject').value; // im Filter gewähltes Projekt vorbelegen
  fillProjectSelect($('fProject'), { selected: rp || state.settings.activeProjectId, openOnly: true });
  $('fIn').value = ''; $('fOut').value = '';
  $('fBreaks').innerHTML = '';
  $('formMsg').textContent = ''; $('formMsg').className = 'message';
  $('formModal').hidden = false;
}
function closeFormModal() { $('formModal').hidden = true; }
async function submitForm() {
  const breaks = [...document.querySelectorAll('#fBreaks .break-row')].map((r) => ({
    start: r.querySelector('.b-start').value, end: r.querySelector('.b-end').value,
  }));
  const entry = {
    date: $('fDate').value, projectId: $('fProject').value,
    clockIn: $('fIn').value, clockOut: $('fOut').value, breaks,
  };
  const res = await window.api.addManual(entry);
  if (res.ok) {
    closeFormModal();
    await refresh();
    const mk = entry.date.slice(0, 7);
    if ([...$('monthSelect').options].some((o) => o.value === mk)) {
      $('monthSelect').value = mk; renderReport();
    }
    showMessage('Zeit nachgetragen.', 'ok');
  } else {
    const el = $('formMsg'); el.textContent = res.error; el.className = 'message error';
  }
}

// ================= Dashboard =================
function renderDashboard() {
  fillMonthSelect($('dashMonth'));
  fillProjectSelect($('dashProject'), { allOption: true });
  const monthKey = $('dashMonth').value;
  const projectId = $('dashProject').value;
  const rows = dailyRows(monthKey, projectId).sort((a, b) => a.date.localeCompare(b.date));

  const workdays = rows.length;
  const netSum = rows.reduce((a, r) => a + roundMs(r.netMs), 0);
  const avg = workdays ? netSum / workdays : 0;
  const target = targetMsPerDay();
  const saldo = netSum - workdays * target;
  const weekTarget = (state.settings.targetDaysPerWeek || 0) * target;

  const saldoCls = saldo >= 0 ? 'saldo-pos' : 'saldo-neg';
  const saldoStr = (saldo >= 0 ? '+' : '−') + fmtHM(Math.abs(saldo));

  $('dashKpis').innerHTML = `
    <div class="summary-item"><span class="summary-label">Summe Monat (netto)</span><span class="summary-big">${fmtHM(netSum)}</span></div>
    <div class="summary-item"><span class="summary-label">Ø pro Arbeitstag</span><span class="summary-big">${fmtHM(avg)}</span></div>
    <div class="summary-item"><span class="summary-label">Saldo (Ist − Soll)</span><span class="summary-big ${saldoCls}">${saldoStr}</span></div>
    <div class="summary-item"><span class="summary-label">Soll / Woche</span><span class="summary-big">${fmtHM(weekTarget)}</span></div>`;

  renderProjectChart(monthKey);
  renderRevenueChart(monthKey);
  renderDayChart(rows, target);
  renderMonthChart(projectId);
}

// Umsatz (€) je Projekt im gewählten Monat – nur Projekte mit Satz > 0
function renderRevenueChart(monthKey) {
  const el = $('chartRevenue');
  const now = Date.now();
  const byProject = {};
  for (const s of state.sessions) {
    if (s.date.slice(0, 7) !== monthKey) continue;
    if (projectRate(s.projectId) <= 0) continue;
    byProject[s.projectId] = (byProject[s.projectId] || 0) + sessionAmount(s, now);
  }
  const entries = Object.entries(byProject).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, e) => a + e[1], 0);
  $('revenueTotal').textContent = 'Gesamt: ' + fmtEur(total);
  if (entries.length === 0) {
    el.innerHTML = '<div class="chart-empty">Kein abrechenbarer Umsatz in diesem Monat.</div>';
    return;
  }
  const max = Math.max(...entries.map((e) => e[1]), 1);
  const H = 150;
  el.innerHTML = entries.map(([pid, v]) => {
    const h = Math.round(v / max * H);
    return `
      <div class="bar-col">
        <div class="bar-val">${fmtEur(v)}</div>
        <div class="bar-track"><div class="bar money" style="height:${h}px"></div></div>
        <div class="bar-label" title="${escapeHtml(projectName(pid))}">${escapeHtml(projectName(pid))}</div>
      </div>`;
  }).join('');
}

// Netto-Stunden je Projekt im gewählten Monat (immer alle Projekte)
function renderProjectChart(monthKey) {
  const el = $('chartProjects');
  const now = Date.now();
  const byProject = {};
  for (const s of state.sessions) {
    if (s.date.slice(0, 7) !== monthKey) continue;
    byProject[s.projectId] = (byProject[s.projectId] || 0) + roundMs(sessionNetMs(s, now));
  }
  const entries = Object.entries(byProject).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    el.innerHTML = '<div class="chart-empty">Keine Daten für diesen Monat.</div>';
    return;
  }
  const max = Math.max(...entries.map((e) => e[1]), 1);
  const H = 150;
  el.innerHTML = entries.map(([pid, v]) => {
    const h = Math.round(v / max * H);
    return `
      <div class="bar-col">
        <div class="bar-val">${fmtHM(v)}</div>
        <div class="bar-track"><div class="bar proj" style="height:${h}px"></div></div>
        <div class="bar-label" title="${escapeHtml(projectName(pid))}">${escapeHtml(projectName(pid))}</div>
      </div>`;
  }).join('');
}

function renderDayChart(rows, target) {
  const el = $('chartDays');
  if (rows.length === 0) { el.innerHTML = '<div class="chart-empty">Keine Daten für diesen Monat.</div>'; return; }
  const vals = rows.map((r) => roundMs(r.netMs));
  const max = Math.max(target, ...vals, 1);
  const H = 150;
  el.innerHTML = rows.map((r, i) => {
    const v = vals[i];
    const h = Math.round(v / max * H);
    const tH = Math.round(target / max * H);
    const over = target > 0 && v >= target;
    const day = Number(r.date.slice(8, 10));
    return `
      <div class="bar-col">
        <div class="bar-val">${fmtHM(v)}</div>
        <div class="bar-track">
          ${target > 0 ? `<div class="bar-target" style="bottom:${tH}px"></div>` : ''}
          <div class="bar ${over ? 'over' : ''}" style="height:${h}px"></div>
        </div>
        <div class="bar-label">${day}.</div>
      </div>`;
  }).join('');
}

function renderMonthChart(projectId) {
  const el = $('chartMonths');
  const now = Date.now();
  const byMonth = {};
  for (const s of state.sessions) {
    if (projectId && s.projectId !== projectId) continue;
    const k = s.date.slice(0, 7);
    byMonth[k] = (byMonth[k] || 0) + roundMs(sessionNetMs(s, now));
  }
  const keys = Object.keys(byMonth).sort().slice(-12);
  if (keys.length === 0) { el.innerHTML = '<div class="chart-empty">Noch keine Daten.</div>'; return; }
  const max = Math.max(...keys.map((k) => byMonth[k]), 1);
  const H = 150;
  el.innerHTML = keys.map((k) => {
    const v = byMonth[k];
    const h = Math.round(v / max * H);
    const [, m] = k.split('-').map(Number);
    return `
      <div class="bar-col">
        <div class="bar-val">${fmtHM(v)}</div>
        <div class="bar-track"><div class="bar" style="height:${h}px"></div></div>
        <div class="bar-label">${MONTH_SHORT[m - 1]}</div>
      </div>`;
  }).join('');
}

// ================= Projekte (Verwaltung) =================
function projectStats() {
  const now = Date.now();
  const stats = {};
  for (const p of state.projects) stats[p.id] = { count: 0, netMs: 0, amount: 0 };
  for (const s of state.sessions) {
    const st = stats[s.projectId];
    if (!st) continue;
    st.count += 1;
    st.netMs += sessionNetMs(s, now);
    st.amount += sessionAmount(s, now);
  }
  return stats;
}
function projMsg(text, kind) {
  const el = $('projMsg');
  el.textContent = text || '';
  el.className = 'message' + (kind ? ' ' + kind : '');
}
function renderProjects() {
  const stats = projectStats();
  const body = $('projectBody');
  let totalAmount = 0, totalMs = 0;
  body.innerHTML = state.projects.map((p) => {
    const st = stats[p.id];
    totalAmount += st.amount; totalMs += st.netMs;
    const betrag = p.rate > 0 ? fmtEur(st.amount) : '<span class="muted">ohne Entlohnung</span>';
    return `
    <tr data-pid="${p.id}" class="${p.closed ? 'proj-closed' : ''}">
      <td><input type="text" class="p-name" value="${escapeHtml(p.name)}" maxlength="60" /></td>
      <td><input type="number" class="p-rate" value="${p.rate}" min="0" step="0.5" /></td>
      <td>${p.closed ? '<span class="badge badge-closed">abgeschlossen</span>'
                     : '<span class="badge badge-open">offen</span>'}</td>
      <td>${st.count}×</td>
      <td>${fmtHM(st.netMs)}</td>
      <td class="col-net">${betrag}</td>
      <td class="proj-actions">
        <button class="icon-btn p-save" type="button">Speichern</button>
        <button class="icon-btn p-export" type="button"
          title="Alle Zeiten dieses Projekts als CSV exportieren">Export</button>
        <button class="icon-btn p-toggle" type="button">${p.closed ? 'Öffnen' : 'Abschließen'}</button>
        <button class="icon-btn danger p-del" type="button">Löschen</button>
      </td>
    </tr>`;
  }).join('');
  if (state.projects.length) {
    body.innerHTML += `
      <tr class="proj-total">
        <td><strong>Gesamt</strong></td><td></td><td></td><td></td>
        <td><strong>${fmtHM(totalMs)}</strong></td>
        <td class="col-net"><strong>${fmtEur(totalAmount)}</strong></td><td></td>
      </tr>`;
  }
  body.querySelectorAll('tr[data-pid]').forEach((tr) => {
    const pid = tr.dataset.pid;
    tr.querySelector('.p-save').addEventListener('click', () => onSaveProject(pid,
      tr.querySelector('.p-name').value, tr.querySelector('.p-rate').value));
    tr.querySelector('.p-export').addEventListener('click', () => onExportProject(pid));
    tr.querySelector('.p-toggle').addEventListener('click', () => onToggleProject(pid));
    tr.querySelector('.p-del').addEventListener('click', () => onDeleteProject(pid));
  });
}
async function onAddProject() {
  const res = await window.api.addProject($('newProjectName').value, Number($('newProjectRate').value) || 0);
  if (res.ok) {
    $('newProjectName').value = ''; $('newProjectRate').value = '';
    await refresh(); renderProjects(); projMsg('Projekt angelegt.', 'ok');
  } else projMsg(res.error, 'error');
}
async function onSaveProject(id, name, rate) {
  const res = await window.api.updateProject(id, { name, rate: Number(rate) || 0 });
  if (res.ok) { await refresh(); renderProjects(); projMsg('Projekt gespeichert.', 'ok'); }
  else projMsg(res.error, 'error');
}
async function onToggleProject(id) {
  const p = projectById(id);
  if (!p) return;
  const res = p.closed ? await window.api.reopenProject(id) : await window.api.closeProject(id);
  if (res.ok) {
    await refresh(); renderProjects();
    projMsg(p.closed ? 'Projekt wieder geöffnet.' : 'Projekt abgeschlossen.', 'ok');
  } else projMsg(res.error, 'error');
}
// Projekt-Löschung mit Umbuchung. Bewusst über ein eigenes Fenster statt
// window.prompt() – das gibt es in Electron nicht und wirft einen Fehler.
let reassignId = null;

function openReassignModal(id, count) {
  reassignId = id;
  const others = state.projects.filter((p) => p.id !== id);
  $('reassignText').textContent = `„${projectName(id)}" hat noch ${count} Eintrag/Einträge. `
    + 'Diese Zeiten werden auf ein anderes Projekt umgebucht, danach wird das Projekt gelöscht.';
  const sel = $('reassignTarget');
  sel.innerHTML = '';
  for (const p of others) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = projectLabel(p);
    sel.appendChild(o);
  }
  $('reassignMsg').textContent = ''; $('reassignMsg').className = 'message';
  $('reassignModal').hidden = false;
}
function closeReassignModal() { $('reassignModal').hidden = true; reassignId = null; }

async function confirmReassign() {
  const id = reassignId;
  const targetId = $('reassignTarget').value;
  if (!id || !targetId) return;
  const targetName = projectName(targetId);
  const res = await window.api.deleteProject(id, targetId);
  if (res.ok) {
    closeReassignModal();
    await refresh(); renderProjects();
    projMsg(`Projekt gelöscht, Zeiten → „${targetName}".`, 'ok');
  } else {
    const el = $('reassignMsg'); el.textContent = res.error; el.className = 'message error';
  }
}

async function onDeleteProject(id) {
  const st = projectStats()[id];
  const others = state.projects.filter((p) => p.id !== id);
  if (others.length === 0) { projMsg('Das letzte Projekt kann nicht gelöscht werden.', 'error'); return; }
  if (st && st.count > 0) {
    openReassignModal(id, st.count);
    return;
  }
  if (!confirm(`Projekt „${projectName(id)}" löschen?`)) return;
  const res = await window.api.deleteProject(id);
  if (res.ok) { await refresh(); renderProjects(); projMsg('Projekt gelöscht.', 'ok'); }
  else projMsg(res.error, 'error');
}

// ================= Logs =================
function renderLogs() {
  const body = $('logBody');
  const logs = [...state.logs].reverse();
  if (logs.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="empty">Noch keine Änderungen protokolliert.</td></tr>';
    return;
  }
  body.innerHTML = logs.map((l) => `
    <tr>
      <td>${fmtTs(l.ts)}</td>
      <td class="log-action">${escapeHtml(l.action)}</td>
      <td>${escapeHtml(l.detail || '')}</td>
    </tr>`).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ================= Einstellungen =================
function decToHM(dec) {
  let h = Math.floor(dec), m = Math.round((dec - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function hmToDec(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}
async function fillSettings() {
  const s = state.settings;
  $('setTarget').value = decToHM(s.targetHoursPerDay || 0);
  $('setDays').value = s.targetDaysPerWeek || 5;
  $('setRound').value = String(s.roundingMinutes || 0);
  $('setMsg').textContent = '';
  const info = await window.api.dataInfo();
  if (info.ok) {
    $('dataPath').textContent = info.data.file;
    $('appVersion').textContent = info.data.version;
  }
}

// ================= Updates =================
function updateStatus(text, kind) {
  const el = $('updateStatus');
  el.textContent = text;
  el.className = 'update-status' + (kind ? ' ' + kind : '');
}
function showUpdateProgress(percent) {
  $('updateBar').hidden = percent === null;
  if (percent !== null) $('updateBarFill').style.width = Math.max(0, Math.min(100, percent)) + '%';
}

// Ein bereits geladenes Update bleibt installierbar, auch wenn danach
// erneut geprüft wird.
let updateReady = false;

// Meldungen des Hauptprozesses zum Update-Vorgang
function onUpdateEvent(info) {
  const busy = ['checking', 'downloading'].includes(info.state);
  if (info.state === 'downloaded') updateReady = true;
  $('btnCheckUpdate').disabled = busy;
  $('btnInstallUpdate').hidden = !updateReady;
  if (info.state !== 'downloading') showUpdateProgress(null);

  switch (info.state) {
    case 'checking':
      updateStatus('Suche nach Updates …'); break;
    case 'available':
      updateStatus(`Version ${info.version} verfügbar – wird im Hintergrund geladen …`); break;
    case 'not-available':
      updateStatus('Du hast die neueste Version.', 'ok'); break;
    case 'downloading':
      updateStatus(`Lade Version ${info.version || ''} … ${Math.round(info.percent || 0)} %`);
      showUpdateProgress(info.percent || 0); break;
    case 'downloaded':
      updateStatus(`Version ${info.version} ist bereit. Beim nächsten Start wird sie installiert.`, 'ok'); break;
    case 'dev':
      updateStatus('Update-Prüfung ist nur in der installierten Version aktiv.'); break;
    case 'error':
      updateStatus('Update-Prüfung fehlgeschlagen: ' + (info.message || 'unbekannter Fehler'), 'error'); break;
    default:
      updateStatus('Noch nicht nach Updates gesucht.');
  }
}
async function saveSettings() {
  const patch = {
    targetHoursPerDay: hmToDec($('setTarget').value || '08:00'),
    targetDaysPerWeek: Math.min(7, Math.max(1, Number($('setDays').value) || 5)),
    roundingMinutes: Number($('setRound').value) || 0,
  };
  const res = await window.api.updateSettings(patch);
  const el = $('setMsg');
  if (res.ok) {
    await refresh();
    el.textContent = 'Einstellungen gespeichert.'; el.className = 'message ok';
  } else { el.textContent = res.error; el.className = 'message error'; }
}

// ================= Views =================
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'projekte') renderProjects();
  if (name === 'logs') renderLogs();
  if (name === 'settings') fillSettings();
}

// ================= Aktionen / Refresh =================
function showMessage(text, kind) {
  const el = $('message');
  el.textContent = text || '';
  el.className = 'message' + (kind ? ' ' + kind : '');
}
async function refresh() {
  const res = await window.api.state();
  if (res.ok) {
    state = res.data;
    renderStatus();
    fillMonthSelect($('monthSelect'));
    fillProjectSelect($('reportProject'), { allOption: true });
    renderReport();
    tick();
  }
}
async function action(fn, okMsg) {
  const res = await fn();
  if (res.ok) { showMessage(okMsg, 'ok'); await refresh(); }
  else showMessage(res.error, 'error');
}
async function onDeleteDay(dateKey) {
  const ids = state.sessions.filter((s) => s.date === dateKey).map((s) => s.id);
  if (!confirm(`Alle Einträge vom ${fmtDate(dateKey)} löschen?`)) return;
  for (const id of ids) await window.api.deleteSession(id);
  await refresh();
  showMessage('Eintrag gelöscht.', 'ok');
}

// Eine CSV-Zelle absichern: Semikolon, Anführungszeichen und Zeilenumbrüche
// in Projektnamen dürfen die Spalten nicht zerreißen.
function csvCell(v) {
  let s = String(v === null || v === undefined ? '' : v);
  // Ein Projektname wie „=SUMME(...)" würde Excel sonst als Formel ausführen.
  // Zahlen (auch negative) bleiben unangetastet.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?[\d.,]+$/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Betrag auf Cent runden – die Summe muss der Addition der gedruckten
// Zeilenbeträge entsprechen, sonst stimmt eine daraus erstellte Rechnung nicht.
function roundEur(v) { return Math.round((v || 0) * 100) / 100; }
function csvRow(cells) { return cells.map(csvCell).join(';'); }

// Netto-Stunden als Dezimalzahl mit deutschem Komma (für Rechnungen)
function hoursCsv(ms) { return (ms / 3600000).toFixed(2).replace('.', ','); }

// Vollständiger Export EINES Projekts: alle Arbeitsblöcke über alle Monate,
// dazu Monatssummen und eine Gesamtsumme.
function buildProjectCsv(projectId) {
  const p = projectById(projectId);
  if (!p) return '';
  const now = Date.now();
  const sessions = state.sessions
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));

  const lines = [];
  lines.push(csvRow(['Projekt', p.name]));
  lines.push(csvRow(['Stundensatz (EUR/h)', eurCsv(p.rate)]));
  lines.push(csvRow(['Status', p.closed ? 'abgeschlossen' : 'offen']));
  lines.push(csvRow(['Exportiert am', fmtTs(new Date().toISOString())]));
  lines.push('');
  lines.push(csvRow(['Datum', 'Kommen', 'Gehen', 'Pausen (h:m)', 'Pausen (Zeiten)',
    'Netto (h:m)', 'Netto (h)', 'Betrag (EUR)']));

  const byMonth = {};
  let sumNet = 0, sumBreak = 0, sumAmount = 0;
  for (const s of sessions) {
    const net = roundMs(sessionNetMs(s, now));
    const brk = sessionBreakMs(s, now);
    const amount = roundEur(sessionAmount(s, now));
    sumNet += net; sumBreak += brk; sumAmount += amount;
    const mk = s.date.slice(0, 7);
    const m = (byMonth[mk] = byMonth[mk] || { net: 0, amount: 0, count: 0 });
    m.net += net; m.amount += amount; m.count += 1;

    const breakTimes = s.breaks.map((b) => `${toHM(b.start)}-${b.end ? toHM(b.end) : 'offen'}`).join(' / ');
    lines.push(csvRow([
      fmtDate(s.date), toHM(s.clockIn), s.clockOut ? toHM(s.clockOut) : 'laeuft',
      fmtHM(brk), breakTimes, fmtHM(net), hoursCsv(net), eurCsv(amount),
    ]));
  }
  if (sessions.length === 0) lines.push(csvRow(['Keine Zeiten erfasst.']));

  lines.push('');
  lines.push(csvRow(['Gesamt', '', '', fmtHM(sumBreak), '', fmtHM(sumNet), hoursCsv(sumNet),
    eurCsv(roundEur(sumAmount))]));
  lines.push('');
  lines.push(csvRow(['Summen je Monat']));
  lines.push(csvRow(['Monat', 'Bloecke', 'Netto (h:m)', 'Netto (h)', 'Betrag (EUR)']));
  for (const mk of Object.keys(byMonth).sort()) {
    const m = byMonth[mk];
    lines.push(csvRow([monthLabel(mk), m.count, fmtHM(m.net), hoursCsv(m.net), eurCsv(roundEur(m.amount))]));
  }
  return lines.join('\r\n');
}

async function onExportProject(projectId) {
  const p = projectById(projectId);
  if (!p) return;
  const stamp = localDateKey(new Date());
  const res = await window.api.exportCsv(buildProjectCsv(projectId), `stempeluhr-${p.name}-${stamp}.csv`);
  if (res.ok) projMsg('Projekt exportiert: ' + res.data, 'ok');
  else if (res.error !== 'Abgebrochen') projMsg(res.error, 'error');
}

function buildCsv() {
  const monthKey = $('monthSelect').value;
  const projectId = $('reportProject').value;
  const rows = dailyRows(monthKey, projectId);
  const lines = ['Datum;Projekt;Kommen;Gehen;Pausen (h:m);Netto (h:m);Betrag (EUR)'];
  for (const r of [...rows].reverse()) {
    lines.push(csvRow([
      fmtDate(r.date), [...r.projectIds].map(projectName).join(' / '),
      toHM(new Date(r.firstIn).toISOString()),
      r.hasOpen ? 'laeuft' : toHM(new Date(r.lastOut).toISOString()),
      fmtHM(r.breakMs), fmtNet(r.netMs), eurCsv(roundEur(r.amount)),
    ]));
  }
  const sumNet = rows.reduce((a, r) => a + roundMs(r.netMs), 0);
  const sumBreak = rows.reduce((a, r) => a + r.breakMs, 0);
  const sumAmount = rows.reduce((a, r) => a + roundEur(r.amount), 0);
  lines.push('');
  lines.push(`Summe;;;;${fmtHM(sumBreak)};${fmtHM(sumNet)};${eurCsv(roundEur(sumAmount))}`);
  return lines.join('\r\n');
}

// ================= Event-Bindung =================
window.addEventListener('DOMContentLoaded', () => {
  // Stempel-Buttons
  $('btnIn').addEventListener('click',
    () => action(() => window.api.clockIn($('activeProject').value), 'Eingestempelt – guten Start!'));
  $('activeProject').addEventListener('change', async () => {
    await window.api.setActiveProject($('activeProject').value);
  });
  $('btnOut').addEventListener('click', () => action(window.api.clockOut, 'Ausgestempelt – Feierabend!'));
  $('btnBreakStart').addEventListener('click', () => action(window.api.startBreak, 'Pause gestartet.'));
  $('btnBreakEnd').addEventListener('click', () => action(window.api.endBreak, 'Pause beendet.'));

  // Auswertung
  $('monthSelect').addEventListener('change', renderReport);
  $('reportProject').addEventListener('change', renderReport);
  $('btnPrint').addEventListener('click', () => window.print());
  $('btnExport').addEventListener('click', async () => {
    const monthKey = $('monthSelect').value;
    const proj = $('reportProject').value ? '-' + projectName($('reportProject').value) : '';
    const res = await window.api.exportCsv(buildCsv(), `stempeluhr-${monthKey}${proj}.csv`);
    if (res.ok) showMessage('CSV gespeichert: ' + res.data, 'ok');
    else if (res.error !== 'Abgebrochen') showMessage(res.error, 'error');
  });

  // Navigation
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => showView(b.dataset.view));
  });
  $('dashMonth').addEventListener('change', renderDashboard);
  $('dashProject').addEventListener('change', renderDashboard);

  // Projekte-Verwaltung
  $('btnAddProject').addEventListener('click', onAddProject);
  const addOnEnter = (e) => { if (e.key === 'Enter') onAddProject(); };
  $('newProjectName').addEventListener('keydown', addOnEnter);
  $('newProjectRate').addEventListener('keydown', addOnEnter);

  // Logs / Einstellungen
  $('btnClearLogs').addEventListener('click', async () => {
    if (!confirm('Das gesamte Änderungsprotokoll löschen?')) return;
    await window.api.clearLogs(); await refresh(); renderLogs();
  });
  $('setSave').addEventListener('click', saveSettings);

  // Updates / Datenspeicher
  $('btnCheckUpdate').addEventListener('click', () => window.api.checkForUpdate());
  $('btnInstallUpdate').addEventListener('click', () => window.api.installUpdate());
  $('btnOpenData').addEventListener('click', () => window.api.openDataFolder());
  window.api.onUpdateEvent(onUpdateEvent);

  // Detail-/Edit-Modal
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  // Nachtragen-Formular
  $('btnAdd').addEventListener('click', openFormModal);
  $('fAddBreak').addEventListener('click', () => addBreakRow());
  $('formClose').addEventListener('click', closeFormModal);
  $('formCancel').addEventListener('click', closeFormModal);
  $('formSave').addEventListener('click', submitForm);
  $('formModal').addEventListener('click', (e) => { if (e.target.id === 'formModal') closeFormModal(); });

  // Projekt löschen / umbuchen
  $('reassignClose').addEventListener('click', closeReassignModal);
  $('reassignCancel').addEventListener('click', closeReassignModal);
  $('reassignOk').addEventListener('click', confirmReassign);
  $('reassignModal').addEventListener('click', (e) => {
    if (e.target.id === 'reassignModal') closeReassignModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeFormModal(); closeReassignModal(); }
  });

  refresh();
  setInterval(tick, 1000);
});

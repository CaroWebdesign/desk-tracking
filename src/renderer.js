// ================= Sprache =================
let lang = 'de';

// Muss zur Liste in store.js passen
const DATE_FORMAT_LIST = [
  'dd.MM.yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy',
  'd. MMMM yyyy', 'EEE dd.MM.yyyy', 'EEE, d. MMMM yyyy',
];

// Übersetzt einen Schlüssel. Fehlt er in der gewählten Sprache, greift
// Deutsch – so bleibt die Oberfläche auch bei einer Lücke benutzbar.
// Platzhalter {0}, {1} … werden durch die weiteren Argumente ersetzt.
function t(key, ...args) {
  const tabelle = STRINGS[lang] || STRINGS.de;
  let text = tabelle[key];
  if (text === undefined) text = STRINGS.de[key];
  if (text === undefined) return key;
  return text.replace(/\{(\d+)\}/g, (_, i) => (args[i] !== undefined ? args[i] : ''));
}

// Meldungen der Datenschicht kommen auf Deutsch – hier übersetzt
function tErr(text) {
  if (lang === 'de' || !text) return text;
  const tabelle = ERRORS[lang];
  if (tabelle && tabelle[text]) return tabelle[text];
  for (const [muster, ersatz] of (ERROR_PATTERNS[lang] || [])) {
    if (muster.test(text)) return text.replace(muster, ersatz);
  }
  return text; // noch nicht übersetzt: Original zeigen, statt zu verschlucken
}

function monthNames() { return MONTHS[lang] || MONTHS.de; }
function monthNamesShort() { return MONTHS_SHORT[lang] || MONTHS_SHORT.de; }
function weekdayNames() { return WEEKDAYS[lang] || WEEKDAYS.de; }

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

// Bewusst nicht „t" als Variablenname – das würde die Übersetzungsfunktion
// t() innerhalb dieser Funktionen verdecken.
function fmtHMS(ms) {
  const sek = Math.floor(ms / 1000);
  const h = Math.floor(sek / 3600), m = Math.floor((sek % 3600) / 60), s = sek % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
function fmtHM(ms) {
  const min = Math.floor(ms / 60000);
  const h = Math.floor(min / 60), m = min % 60;
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

// 'HH:MM' mit Hinweis, wenn der Zeitpunkt nicht mehr am Starttag liegt
// (Schicht über Mitternacht).
function isNextDay(iso, baseDate) {
  return !!iso && localDateKey(new Date(iso)) !== baseDate;
}
function toHMDay(iso, baseDate) {
  if (!iso) return '';
  return toHM(iso) + (isNextDay(iso, baseDate) ? ' <span class="next-day">+1</span>' : '');
}
function toHMPlain(iso, baseDate) {
  if (!iso) return '';
  return toHM(iso) + (isNextDay(iso, baseDate) ? ' (+1)' : '');
}

// Pausenzeiten für den Export: liegt die ganze Pause am Folgetag, steht das
// „(+1)" nur einmal am Ende statt hinter beiden Uhrzeiten.
function breakTimesPlain(s) {
  return s.breaks.map((b) => {
    const von = toHM(b.start);
    const bis = b.end ? toHM(b.end) : t('day.openEnd');
    const vonPlus = isNextDay(b.start, s.date);
    const bisPlus = !!b.end && isNextDay(b.end, s.date);
    if (vonPlus && bisPlus) return `${von}-${bis} (+1)`;
    return `${von}${vonPlus ? ' (+1)' : ''}-${bis}${bisPlus ? ' (+1)' : ''}`;
  }).join(' / ');
}

// Datumsdarstellung nach Einstellung. Unterstützte Bausteine:
//   yyyy/yy Jahr · MM/M Monat als Zahl · MMMM/MMM Monatsname
//   dd/d Tag · EEE Wochentag (kurz)
// „Jahr abkürzen" macht aus yyyy zwei Stellen.
function fmtDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return String(key);
  const dt = new Date(y, m - 1, d);
  const muster = (state.settings && state.settings.dateFormat) || 'dd.MM.yyyy';
  const kurz = !!(state.settings && state.settings.shortYear);

  // Reihenfolge wichtig: längere Platzhalter zuerst ersetzen
  return muster.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|EEE/g, (teil) => {
    switch (teil) {
      case 'yyyy': return kurz ? String(y).slice(-2) : String(y);
      case 'yy': return String(y).slice(-2);
      case 'MMMM': return monthNames()[m - 1];
      case 'MMM': return monthNamesShort()[m - 1];
      case 'MM': return String(m).padStart(2, '0');
      case 'M': return String(m);
      case 'dd': return String(d).padStart(2, '0');
      case 'd': return String(d);
      case 'EEE': return weekdayNames()[dt.getDay()];
      default: return teil;
    }
  });
}

function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  const jahr = (state.settings && state.settings.shortYear) ? String(y).slice(-2) : String(y);
  return `${monthNames()[m - 1]} ${jahr}`;
}

// Zeitpunkt mit Datum und Uhrzeit (Protokoll, Exportkopf)
function fmtTs(iso) {
  const d = new Date(iso);
  return `${fmtDate(localDateKey(d))} `
    + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
function targetMsPerDay() {
  return ((state.settings && state.settings.targetHoursPerDay) || 0) * 3600000;
}

// ================= Zustand =================
let state = { open: null, sessions: [], projects: [], events: [], logs: [], settings: {} };
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
function projectLabel(p) { return p.name + (p.closed ? ` (${t('proj.closed')})` : ''); }

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
    o.value = ''; o.textContent = t('rep.allProjects');
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

// ================= Sprache anwenden =================
// Alle Texte im HTML tragen data-i18n (Inhalt), data-i18n-title (Tooltip)
// oder data-i18n-ph (Platzhalter). So bleibt die Übersetzung an einer Stelle.
function applyLanguage(neu) {
  lang = (STRINGS[neu] ? neu : 'de');
  document.documentElement.lang = lang;

  // data-i18n-arg füllt den Platzhalter {0}, z. B. „5 min" / „5分"
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = el.dataset.i18nArg === undefined
      ? t(el.dataset.i18n)
      : t(el.dataset.i18n, el.dataset.i18nArg);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });

  // Flagge im Umschalter und Auswahlliste
  const meta = LANG_META[lang] || LANG_META.de;
  const use = document.querySelector('#langToggle use');
  if (use) use.setAttribute('href', '#' + meta.flag);
  $('langToggle').title = t('app.language');
  document.querySelectorAll('#langMenu button').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });

  // Wochentagsköpfe im Kalender
  const kopf = WEEKDAYS_MON[lang] || WEEKDAYS_MON.de;
  document.querySelectorAll('.cal-weekdays span').forEach((el, i) => {
    el.textContent = kopf[i];
  });

  // Die Update-Zeile trägt data-i18n nur für den Startzustand. Läuft gerade
  // eine Prüfung oder ein Download, muss diese Meldung erhalten bleiben.
  if (letzterUpdateStand) onUpdateEvent(letzterUpdateStand);
}

function toggleLangMenu(zeigen) {
  const menu = $('langMenu');
  menu.hidden = zeigen === undefined ? !menu.hidden : !zeigen;
}

async function setLanguage(neu) {
  const res = await window.api.updateSettings({ language: neu });
  if (!res.ok) { toast(tErr(res.error), { kind: 'error' }); return; }
  toggleLangMenu(false);
  await refresh();
  // Alles neu zeichnen, damit auch dynamische Inhalte die Sprache übernehmen
  renderAll();
  toast(t('set.langSaved'), { kind: 'ok' });
}

// Zeichnet die aktuell offene Ansicht samt Fenstern neu
function renderAll() {
  renderStatus();
  renderReport();
  if (!$('view-kalender').hidden) renderCalendar();
  if (!$('view-dashboard').hidden) renderDashboard();
  if (!$('view-projekte').hidden) renderProjects();
  if (!$('view-logs').hidden) renderLogs();
  if (!$('view-settings').hidden) fillSettings();
  if (currentDay && !$('modal').hidden) renderDayEditor();
  if (!$('changelogModal').hidden) renderChangelog();
  tick();
}

// ================= Design (hell/dunkel) =================
const THEMES = ['caro-dark', 'caro-light'];

function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : 'caro-dark';
  document.body.dataset.theme = theme;
  // Das Symbol zeigt, wohin der Klick führt: im Dunkeln die Sonne, im Hellen der Mond.
  const use = document.querySelector('#themeToggle use');
  if (use) use.setAttribute('href', theme === 'caro-dark' ? '#i-sun' : '#i-moon');
  document.querySelectorAll('.theme-card').forEach((c) => {
    c.classList.toggle('selected', c.dataset.themeValue === theme);
  });
}

async function setTheme(name) {
  applyTheme(name);
  const res = await window.api.updateSettings({ theme: name });
  if (res.ok) state.settings = res.data;
}

function toggleTheme() {
  setTheme(document.body.dataset.theme === 'caro-dark' ? 'caro-light' : 'caro-dark');
}

// ================= Live-Uhr =================
function tick() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString('de-DE');
  const todayKey = localDateKey(now);
  const nowMs = now.getTime();
  // Eine laufende Nachtschicht gehört zum Vortag – sie muss trotzdem
  // mitgezählt werden, sonst stünde nach Mitternacht 00:00:00 da.
  const todayMs = state.sessions
    .filter((s) => s.date === todayKey || (state.open && s.id === state.open.id))
    .reduce((sum, s) => sum + sessionNetMs(s, nowMs), 0);
  $('workToday').textContent = fmtHMS(todayMs);

  if (state.open) {
    const onBreak = state.open.breaks.some((b) => b.end === null);
    const since = toHM(state.open.clockIn);
    const proj = projectName(state.open.projectId);
    $('sessionInfo').textContent = onBreak
      ? t('status.breakSince', proj, since)
      : t('status.since', proj, since);
  } else {
    $('sessionInfo').textContent = '';
  }
}

function renderStatus() {
  const open = state.open;
  const onBreak = open && open.breaks.some((b) => b.end === null);
  const dot = $('statusDot'), txt = $('statusText');
  dot.className = 'dot ' + (onBreak ? 'dot-break' : open ? 'dot-on' : 'dot-off');
  txt.textContent = onBreak ? t('status.break') : open ? t('status.on') : t('status.off');
  const hasOpenProject = state.projects.some((p) => !p.closed);
  $('btnIn').disabled = !!open || !hasOpenProject;
  $('btnOut').disabled = !open;

  // Ein Knopf für die Pause: er startet sie oder beendet sie wieder.
  // Das Symbol zeigt die Aktion, nicht den Zustand: eine Pause wird
  // gestartet (▶) und wieder angehalten (⏸).
  $('btnBreak').disabled = !open;
  $('btnBreakText').textContent = onBreak ? t('erf.breakEnd') : t('erf.breakStart');
  $('btnBreakIcon').setAttribute('href', onBreak ? '#i-pause' : '#i-play');
  $('btnBreak').title = onBreak ? t('erf.breakEndTitle') : t('erf.breakStartTitle');

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
      projectIds: new Set(), blocks: [],
    });
    d.projectIds.add(s.projectId);
    d.blocks.push({ in: s.clockIn, out: s.clockOut });
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
  for (const d of Object.values(days)) {
    d.blocks.sort((a, b) => new Date(a.in) - new Date(b.in));
  }
  return Object.values(days).sort((a, b) => b.date.localeCompare(a.date));
}

function renderReport() {
  const monthKey = $('monthSelect').value;
  const projectId = $('reportProject').value;
  const rows = dailyRows(monthKey, projectId);
  const body = $('reportBody');
  const target = targetMsPerDay();
  body.innerHTML = '';
  let sumNet = 0, sumBreak = 0;
  for (const r of rows) {
    sumNet += roundMs(r.netMs);
    sumBreak += r.breakMs;
    const blocks = r.blocks.length;
    const projs = [...r.projectIds].map(projectName).join(', ');
    // Bei mehreren Blöcken am Tag alle Zeiten zeigen – sonst sieht es aus,
    // als wäre durchgehend von der ersten bis zur letzten Stempelung gearbeitet worden.
    const inList = r.blocks.map((b) => toHM(b.in)).join('<br>');
    const outList = r.blocks
      .map((b) => (b.out ? toHMDay(b.out, r.date) : `<em>${t('rep.running')}</em>`)).join('<br>');
    const tr = document.createElement('tr');
    tr.dataset.day = r.date;
    tr.innerHTML = `
      <td>${fmtDate(r.date)} <span class="block-span">· ${blocks}×</span></td>
      <td>${escapeHtml(projs)}</td>
      <td>${inList}</td>
      <td>${outList}</td>
      <td>${fmtHM(r.breakMs)}</td>
      <td class="col-net">
        <span class="net-value">${fmtNet(r.netMs)}</span>
        <span class="net-bar"><span style="width:${
  target > 0 ? Math.min(100, Math.round(roundMs(r.netMs) / target * 100)) : 0}%"></span></span>
      </td>
      <td><button class="del-btn" data-day="${r.date}" title="${escapeHtml(t('rep.deleteDay'))}">✕</button></td>`;
    body.appendChild(tr);
  }
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <svg class="ico"><use href="#i-clock"/></svg>
        <p>${escapeHtml(t('rep.empty'))}</p>
      </div></td></tr>`;
  }
  $('sumMonth').textContent = fmtHM(sumNet);
  $('breakMonth').textContent = fmtHM(sumBreak);
  $('daysMonth').textContent = String(rows.length);

  // Termin-Tabelle für PDF/Ausdruck mitfüllen
  const termine = state.events.filter((e) => e.date.slice(0, 7) === monthKey
    && (!projectId || e.projectId === projectId));
  $('printEventBody').innerHTML = termine.length
    ? termine.map((e) => `<tr>
        <td>${fmtDate(e.date)}</td>
        <td>${e.time ? escapeHtml(e.time) : escapeHtml(t('cal.allDay'))}</td>
        <td>${escapeHtml(eventProjectName(e))}</td>
        <td>${escapeHtml(e.title)}</td>
        <td>${escapeHtml(e.note || '')}</td>
      </tr>`).join('')
    : `<tr><td colspan="5">${escapeHtml(t('cal.noEventsMonth'))}</td></tr>`;

  body.querySelectorAll('tr[data-day]').forEach((tr) => {
    tr.addEventListener('click', () => openDayModal(tr.dataset.day));
  });
  body.querySelectorAll('.del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); onDeleteDay(btn.dataset.day); });
  });
}

// ================= Editierbares Tages-Modal =================
let currentTab = 'zeiten';
let editingEvent = null; // id des gerade bearbeiteten Termins

function openDayModal(dateKey, tab) {
  currentDay = dateKey;
  currentTab = tab || 'zeiten';
  editingEvent = null;
  renderDayEditor();
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; currentDay = null; editingEvent = null; }

function switchTab(tab) {
  currentTab = tab;
  renderDayEditor();
}

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
    // Erfolg als Kurzmeldung – der Editor selbst zeigt das Ergebnis ja schon
    if (okMsg) toast(okMsg, { kind: 'ok' });
  } else {
    // Fehler bleiben im Fenster stehen, damit der Bezug zum Feld klar ist
    editMsg(tErr(res.error));
  }
}

function renderDayEditor() {
  const dateKey = currentDay;
  if (!dateKey) return;
  const now = Date.now();
  const sessions = state.sessions.filter((s) => s.date === dateKey)
    .sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));
  const termine = eventsOn(dateKey);

  let netSum = 0, breakSum = 0, breakCount = 0;
  for (const s of sessions) {
    netSum += sessionNetMs(s, now); breakSum += sessionBreakMs(s, now); breakCount += s.breaks.length;
  }
  $('modalTitle').textContent = fmtDate(dateKey);
  $('modalSummary').textContent = sessions.length
    ? t('day.summary', fmtNet(netSum), `${sessions.length}× ${t('day.blocks')}`)
    : t('day.noTimesShort');
  $('tabEventCount').textContent = termine.length ? String(termine.length) : '';
  document.querySelectorAll('.modal-tab').forEach((reiter) => {
    reiter.classList.toggle('active', reiter.dataset.tab === currentTab);
  });

  if (currentTab === 'termine') { renderEventTab(dateKey, termine); return; }

  const kpi = (label, wert) => `
      <div class="kpi"><div class="kpi-label">${escapeHtml(label)}</div>
        <div class="kpi-value">${wert}</div></div>`;
  const kpis = sessions.length
    ? `<div class="kpis">
      ${kpi(t('day.netWork'), fmtNet(netSum))}
      ${kpi(t('day.breaksTotal'), fmtHM(breakSum))}
      ${kpi(t('day.blocks'), sessions.length + '×')}
      ${kpi(t('day.breakCount'), breakCount + '×')}
    </div>`
    : `<div class="empty-state">
      <svg class="ico"><use href="#i-clock"/></svg>
      <p>${escapeHtml(t('day.noTimes'))}</p>
    </div>`;

  const blocks = sessions.map((s, i) => {
    const running = s.clockOut === null;
    const breaksHtml = s.breaks.map((b, j) => {
      const bo = b.end === null;
      return `
        <div class="break-row" data-sid="${s.id}" data-idx="${j}">
          <input type="time" class="b-start" value="${toHM(b.start)}" />
          <span class="sep">${escapeHtml(t('day.to'))}</span>
          <input type="time" class="b-end" value="${toHM(b.end)}" ${bo ? 'disabled' : ''} />
          <button class="icon-btn b-save" type="button" title="${escapeHtml(t('day.saveBreak'))}">✓</button>
          <button class="break-del b-del" type="button" title="${escapeHtml(t('day.deleteBreak'))}">✕</button>
        </div>`;
    }).join('');

    const ueberNacht = isNextDay(s.clockOut, s.date);
    return `
      <div class="edit-block" data-sid="${s.id}">
        <div class="edit-block-head">
          <span class="block-title">${escapeHtml(t('day.blockN', i + 1))}${
  running ? ` · <span class="running">${escapeHtml(t('day.running'))}</span>` : ''}
            ${ueberNacht ? '<span class="over-night">' + escapeHtml(t('day.overnight')) + '</span>' : ''}</span>
          <span class="block-net">${fmtNet(sessionNetMs(s, now))}</span>
        </div>
        <div class="block-project">
          <label class="field"><span>${escapeHtml(t('erf.project'))}</span>
            <select class="s-project">${projectOptionsHtml(s.projectId)}</select>
          </label>
        </div>
        <div class="time-row">
          <label class="field"><span>${escapeHtml(t('form.date'))}</span>
            <input type="date" class="s-date" value="${s.date}" ${running ? 'disabled' : ''}
              title="${escapeHtml(running ? t('day.dateLockedTitle') : t('day.dateMoveTitle'))}" />
          </label>
          <label class="field"><span>${escapeHtml(t('erf.in'))}</span><input type="time" class="s-in" value="${toHM(s.clockIn)}" /></label>
          <label class="field"><span>${escapeHtml(t('erf.out'))}${ueberNacht ? ' <em class="next-day">' + escapeHtml(t('day.nextDay')) + '</em>' : ''}</span>
            <input type="time" class="s-out" value="${toHM(s.clockOut)}" /></label>
          <button class="icon-btn s-save" type="button">${escapeHtml(t('day.saveTimes'))}</button>
          <button class="icon-btn danger s-del" type="button">${escapeHtml(t('day.deleteBlock'))}</button>
        </div>
        <div class="edit-breaks">
          <div class="edit-breaks-head"><span>${escapeHtml(t('day.breaks'))}</span></div>
          ${breaksHtml || '<div class="break-none">' + escapeHtml(t('day.noBreaks')) + '</div>'}
          <div class="break-row add-break" data-sid="${s.id}">
            <input type="time" class="nb-start" />
            <span class="sep">${escapeHtml(t('day.to'))}</span>
            <input type="time" class="nb-end" />
            <button class="icon-btn nb-add" type="button">${escapeHtml(t('day.addBreak'))}</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const addBlock = `
    <div class="edit-block">
      <div class="edit-block-head"><span class="block-title">${escapeHtml(t('day.addBlock'))}</span></div>
      <div class="block-project">
        <label class="field"><span>${escapeHtml(t('erf.project'))}</span>
          <select id="ab-project">${projectOptionsHtml(state.settings.activeProjectId)}</select>
        </label>
      </div>
      <div class="time-row">
        <label class="field"><span>${escapeHtml(t('erf.in'))}</span><input type="time" id="ab-in" /></label>
        <label class="field"><span>${escapeHtml(t('erf.out'))}</span><input type="time" id="ab-out" /></label>
        <button class="icon-btn" id="ab-add" type="button">${escapeHtml(t('day.addBlockBtn'))}</button>
      </div>
    </div>`;

  $('modalBody').innerHTML = kpis + blocks + addBlock + '<div id="modalEditMsg" class="message"></div>';
  bindEditorEvents();
  bindTimeFields($('modalBody'));
}

// ---- Termine eines Tages ----
function renderEventTab(dateKey, termine) {
  const liste = termine.length ? termine.map((e) => {
    if (editingEvent === e.id) return eventFormHtml(e);
    return `
      <div class="event-item" data-eid="${e.id}">
        <div class="event-time">${e.time ? escapeHtml(e.time) : '<span class="muted">' + escapeHtml(t('cal.allDay')) + '</span>'}</div>
        <div class="event-main">
          <div class="event-title">${escapeHtml(e.title)}
            <span class="event-project">${escapeHtml(eventProjectName(e))}</span>
          </div>
          ${e.note ? `<div class="event-note">${escapeHtml(e.note)}</div>` : ''}
        </div>
        <div class="event-actions">
          <button class="icon-btn ev-edit" type="button" title="${escapeHtml(t('ev.edit'))}">
            <svg class="ico"><use href="#i-pencil"/></svg></button>
          <button class="icon-btn danger ev-del" type="button" title="${escapeHtml(t('ev.delete'))}">
            <svg class="ico"><use href="#i-trash"/></svg></button>
        </div>
      </div>`;
  }).join('') : `
    <div class="empty-state">
      <svg class="ico"><use href="#i-note"/></svg>
      <p>${escapeHtml(t('ev.none'))}</p>
    </div>`;

  const neu = editingEvent === 'neu' ? eventFormHtml(null)
    : `<button id="ev-new" class="btn btn-ghost" type="button">
         <svg class="ico"><use href="#i-plus"/></svg>${escapeHtml(t('ev.add'))}
       </button>`;

  $('modalBody').innerHTML = `
    <div class="event-list">${liste}</div>
    <div class="event-add">${neu}</div>
    <div id="modalEditMsg" class="message"></div>`;
  bindEventTab(dateKey);
  bindTimeFields($('modalBody'));
}

// Formular zum Anlegen (e === null) oder Bearbeiten eines Termins
function eventFormHtml(e) {
  return `
    <div class="event-form" data-eid="${e ? e.id : ''}">
      <div class="event-form-grid">
        <label class="field"><span>${escapeHtml(t('ev.time'))}</span>
          <input type="time" class="ev-time" value="${e && e.time ? e.time : ''}" /></label>
        <label class="field"><span>${escapeHtml(t('ev.titleField'))}</span>
          <input type="text" class="ev-title" maxlength="120" placeholder="${escapeHtml(t('ev.titlePlaceholder'))}"
            value="${e ? escapeHtml(e.title) : ''}" /></label>
      </div>
      <label class="field event-form-project"><span>${escapeHtml(t('ev.project'))}</span>
        <select class="ev-project">
          <option value=""${e && !e.projectId ? ' selected' : ''}>${escapeHtml(t('ev.other'))}</option>
          ${state.projects.map((p) => `<option value="${p.id}"${
  e && e.projectId === p.id ? ' selected' : ''}>${escapeHtml(projectLabel(p))}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>${escapeHtml(t('ev.note'))}</span>
        <textarea class="ev-note" rows="4" maxlength="4000"
          placeholder="${escapeHtml(t('ev.notePlaceholder'))}">${e ? escapeHtml(e.note || '') : ''}</textarea>
      </label>
      <div class="form-actions">
        <button class="btn btn-ghost ev-cancel" type="button">${escapeHtml(t('form.cancel'))}</button>
        <button class="btn btn-primary ev-save" type="button">${e ? escapeHtml(t('form.save')) : escapeHtml(t('ev.create'))}</button>
      </div>
    </div>`;
}

function bindEventTab(dateKey) {
  const body = $('modalBody');
  const neuBtn = $('ev-new');
  if (neuBtn) neuBtn.addEventListener('click', () => { editingEvent = 'neu'; renderDayEditor(); });

  body.querySelectorAll('.event-item').forEach((row) => {
    const id = row.dataset.eid;
    row.querySelector('.ev-edit').addEventListener('click', () => {
      editingEvent = id; renderDayEditor();
    });
    row.querySelector('.ev-del').addEventListener('click', async () => {
      const e = state.events.find((x) => x.id === id);
      const ok = await askConfirm({
        title: t('conf.eventTitle'),
        text: t('conf.eventText', e ? e.title : t('ev.thisEvent')),
        hint: t('conf.eventHint'),
      });
      if (!ok) return;
      await editOp(window.api.deleteEvent(id), t('ev.deleted'));
    });
  });

  body.querySelectorAll('.event-form').forEach((form) => {
    const id = form.dataset.eid;
    form.querySelector('.ev-cancel').addEventListener('click', () => {
      editingEvent = null; renderDayEditor();
    });
    form.querySelector('.ev-save').addEventListener('click', async () => {
      const entry = {
        date: dateKey,
        time: form.querySelector('.ev-time').value,
        title: form.querySelector('.ev-title').value,
        note: form.querySelector('.ev-note').value,
        projectId: form.querySelector('.ev-project').value,
      };
      const res = id ? await window.api.updateEvent(id, entry) : await window.api.addEvent(entry);
      if (res.ok) {
        editingEvent = null;
        await refresh();
        renderDayEditor();
        editMsg(id ? t('ev.saved') : t('ev.created'), 'ok');
      } else editMsg(tErr(res.error));
    });
    const titel = form.querySelector('.ev-title');
    if (titel) titel.focus();
  });
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
        moved ? t('day.moved', fmtDate(newDate)) : t('day.timesSaved'));
    });
    if (del) del.addEventListener('click', async () => {
      const s = state.sessions.find((x) => x.id === sid);
      const spanne = s
        ? `${toHM(s.clockIn)}–${s.clockOut ? toHMPlain(s.clockOut, s.date) : t('day.running')}` : '';
      const ok = await askConfirm({
        title: t('conf.blockTitle'),
        text: t('conf.blockText', spanne, fmtDate(currentDay)),
        hint: t('conf.blockHint'),
      });
      if (ok) editOp(window.api.deleteSession(sid), t('day.blockDeleted'));
    });
    // Projekt des Blocks ändern (speichert sofort)
    const proj = block.querySelector('.s-project');
    if (proj) proj.addEventListener('change', () => {
      editOp(window.api.updateSessionProject(sid, proj.value), t('day.rebooked'));
    });
    // neue Pause hinzufügen
    const addRow = block.querySelector('.add-break');
    if (addRow) addRow.querySelector('.nb-add').addEventListener('click', () => {
      editOp(window.api.addBreak(sid,
        addRow.querySelector('.nb-start').value, addRow.querySelector('.nb-end').value),
      t('day.breakAdded'));
    });
  });
  // bestehende Pausen speichern / löschen
  $('modalBody').querySelectorAll('.break-row[data-idx]').forEach((row) => {
    const sid = row.dataset.sid, idx = Number(row.dataset.idx);
    row.querySelector('.b-save').addEventListener('click', () => {
      editOp(window.api.updateBreak(sid, idx,
        row.querySelector('.b-start').value, row.querySelector('.b-end').value),
      t('day.breakSaved'));
    });
    row.querySelector('.b-del').addEventListener('click', async () => {
      const von = row.querySelector('.b-start').value;
      const bis = row.querySelector('.b-end').value;
      const ok = await askConfirm({
        title: t('conf.breakTitle'),
        text: t('conf.breakText', von, bis || t('day.openEnd')),
        hint: t('conf.breakHint'),
      });
      if (ok) editOp(window.api.deleteBreak(sid, idx), t('day.breakDeleted'));
    });
  });
  // neuen Block hinzufügen
  const abAdd = $('ab-add');
  if (abAdd) abAdd.addEventListener('click', () => {
    editOp(window.api.addManual({
      date: currentDay, projectId: $('ab-project') ? $('ab-project').value : undefined,
      clockIn: $('ab-in').value, clockOut: $('ab-out').value, breaks: [],
    }), t('day.blockAdded'));
  });
}

// ================= Formular „Zeit nachtragen" =================
function addBreakRow(start = '', end = '') {
  const row = document.createElement('div');
  row.className = 'break-row';
  row.innerHTML = `
    <input type="time" class="b-start" value="${start}" />
    <span class="sep">${escapeHtml(t('day.to'))}</span>
    <input type="time" class="b-end" value="${end}" />
    <button class="break-del" type="button" title="${escapeHtml(t('day.deleteBreak'))}">✕</button>`;
  row.querySelector('.break-del').addEventListener('click', () => { row.remove(); updateFormPreview(); });
  row.querySelectorAll('input').forEach((i) => i.addEventListener('input', updateFormPreview));
  $('fBreaks').appendChild(row);
  bindTimeFields(row);
  updateFormPreview();
}
// Lokales Date aus 'YYYY-MM-DD' + 'HH:MM'
function buildLocalTime(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// Zeigt im Nachtragen-Formular laufend an, was gespeichert würde – damit ein
// Vertipper („Gehen" vor „Kommen") sofort als Nachtschicht sichtbar wird und
// nicht unbemerkt einen 23-Stunden-Eintrag erzeugt.
function updateFormPreview() {
  const el = $('fPreview');
  if (!el) return;
  const date = $('fDate').value, inHM = $('fIn').value, outHM = $('fOut').value;
  if (!date || !inHM || !outHM) { el.textContent = ''; el.className = 'form-preview'; return; }

  const inD = buildLocalTime(date, inHM);
  let outD = buildLocalTime(date, outHM);
  if (outD.getTime() === inD.getTime()) {
    el.textContent = t('form.sameTime');
    el.className = 'form-preview warn';
    return;
  }
  const ueberNacht = outD < inD;
  if (ueberNacht) outD = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate() + 1,
    outD.getHours(), outD.getMinutes(), 0, 0);

  let pausenMs = 0;
  for (const row of document.querySelectorAll('#fBreaks .break-row')) {
    const bsHM = row.querySelector('.b-start').value;
    const beHM = row.querySelector('.b-end').value;
    if (!bsHM || !beHM) continue;
    let bs = buildLocalTime(date, bsHM);
    if (bs < inD) bs = new Date(bs.getFullYear(), bs.getMonth(), bs.getDate() + 1,
      bs.getHours(), bs.getMinutes(), 0, 0);
    let be = buildLocalTime(localDateKey(bs), beHM);
    if (be <= bs) be = new Date(be.getFullYear(), be.getMonth(), be.getDate() + 1,
      be.getHours(), be.getMinutes(), 0, 0);
    if (bs >= inD && be <= outD) pausenMs += be - bs;
  }

  const netto = Math.max(0, outD - inD - pausenMs);
  const teile = [t('form.preview', fmtHM(netto))];
  if (pausenMs > 0) teile.push(t('form.previewBreak', fmtHM(pausenMs)));
  if (ueberNacht) teile.push(t('form.previewEnds', fmtDate(localDateKey(outD))));
  el.textContent = teile.join(' · ');
  el.className = 'form-preview' + (ueberNacht ? ' over-night-note' : '');
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
  updateFormPreview();
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
    showMessage(t('form.added'), 'ok');
  } else {
    const el = $('formMsg'); el.textContent = tErr(res.error); el.className = 'message error';
  }
}

// ================= Kalender =================
let calMonth = null; // 'YYYY-MM', gerade angezeigter Monat

function eventsOn(dateKey) {
  return state.events.filter((e) => e.date === dateKey);
}

// Projekt eines Termins – ohne Zuordnung gilt „Sonstiges"
function eventProjectName(e) {
  return e.projectId ? projectName(e.projectId) : t('ev.other');
}

// Netto-Zeit je Tag im Monat, als Nachschlagetabelle
function dayTotals(monthKey) {
  const now = Date.now();
  const map = {};
  for (const s of state.sessions) {
    if (s.date.slice(0, 7) !== monthKey) continue;
    map[s.date] = (map[s.date] || 0) + roundMs(sessionNetMs(s, now));
  }
  return map;
}

function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function renderCalendar() {
  if (!calMonth) calMonth = localDateKey(new Date()).slice(0, 7);
  const [year, month] = calMonth.split('-').map(Number);
  $('calTitle').textContent = monthLabel(calMonth);

  const totals = dayTotals(calMonth);
  const heute = localDateKey(new Date());
  const target = targetMsPerDay();

  // Das Raster beginnt am Montag der Woche, in der der Monat startet
  const erster = new Date(year, month - 1, 1);
  const versatz = (erster.getDay() + 6) % 7; // Mo=0 … So=6
  const start = new Date(year, month - 1, 1 - versatz);
  const tageImMonat = new Date(year, month, 0).getDate();
  const zellen = Math.ceil((versatz + tageImMonat) / 7) * 7;

  const html = [];
  for (let i = 0; i < zellen; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localDateKey(d);
    const fremd = d.getMonth() !== month - 1;
    const wochenende = d.getDay() === 0 || d.getDay() === 6;
    const ms = totals[key] || 0;
    const termine = eventsOn(key);

    // Füllstand des Tagesbalkens im Verhältnis zum Tagessoll
    const anteil = target > 0 ? Math.min(100, Math.round(ms / target * 100)) : (ms > 0 ? 100 : 0);
    const klassen = ['cal-day'];
    if (fremd) klassen.push('cal-other');
    if (wochenende) klassen.push('cal-weekend');
    if (key === heute) klassen.push('cal-today');
    if (ms > 0) klassen.push('cal-has-time');

    const chips = termine.slice(0, 2).map((e) => `
      <span class="cal-event" title="${escapeHtml((e.time ? e.time + ' · ' : '') + e.title
        + (e.note ? '\n\n' + e.note : ''))}">
        ${e.time ? `<b>${escapeHtml(e.time)}</b> ` : ''}${escapeHtml(e.title)}
      </span>`).join('');
    const mehr = termine.length > 2
      ? `<span class="cal-more">${escapeHtml(t('cal.more', termine.length - 2))}</span>` : '';

    // Je mehr Zeit an einem Tag steckt, desto kräftiger die Einfärbung –
    // die Auslastung des Monats wird so auf einen Blick lesbar.
    const fuellung = ms > 0 ? 7 + Math.round(anteil / 100 * 11) : 0;
    const flaeche = ms > 0
      ? ` style="background:color-mix(in srgb, var(--accent) ${fuellung}%, var(--panel-2))"` : '';

    html.push(`
      <button class="${klassen.join(' ')}" data-day="${key}" type="button"${flaeche}>
        <span class="cal-day-head">
          <span class="cal-num">${d.getDate()}</span>
          ${ms > 0 ? `<span class="cal-hours">${fmtHM(ms)}</span>` : ''}
        </span>
        ${ms > 0 ? `<span class="cal-bar"><span style="width:${anteil}%"></span></span>` : ''}
        <span class="cal-events">${chips}${mehr}</span>
      </button>`);
  }
  $('calGrid').innerHTML = html.join('');

  // Monatszusammenfassung neben der Navigation
  const summe = Object.values(totals).reduce((a, v) => a + v, 0);
  const tage = Object.keys(totals).length;
  const termineImMonat = state.events.filter((e) => e.date.slice(0, 7) === calMonth).length;
  $('calStats').innerHTML = `
    <span>${escapeHtml(tage === 1
    ? t('cal.inDay', fmtHM(summe)) : t('cal.inDays', fmtHM(summe), tage))}</span>
    <span>${escapeHtml(termineImMonat === 1
    ? t('cal.event', termineImMonat) : t('cal.events', termineImMonat))}</span>`;

  $('calGrid').querySelectorAll('.cal-day').forEach((el) => {
    el.addEventListener('click', () => openDayModal(el.dataset.day));
  });

  renderUpcoming();
}

// Die nächsten Termine ab heute – unabhängig vom angezeigten Monat
function renderUpcoming() {
  const heute = localDateKey(new Date());
  const liste = state.events.filter((e) => e.date >= heute).slice(0, 6);
  const el = $('calUpcoming');
  if (liste.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <svg class="ico"><use href="#i-note"/></svg>
      <p>${escapeHtml(t('cal.noUpcoming'))}</p>
    </div>`;
    return;
  }
  el.innerHTML = liste.map((e) => `
    <button class="upcoming-item" data-day="${e.date}" type="button">
      <span class="upcoming-date">
        <b>${new Date(e.date + 'T12:00:00').getDate()}</b>
        <span>${escapeHtml(monthNamesShort()[Number(e.date.slice(5, 7)) - 1])}</span>
      </span>
      <span class="upcoming-main">
        <span class="upcoming-title">${escapeHtml(e.title)}</span>
        <span class="upcoming-sub">${e.time ? escapeHtml(e.time) : escapeHtml(t('cal.allDay'))}${
  e.note ? ' · ' + escapeHtml(e.note.split('\n')[0].slice(0, 60)) : ''}</span>
      </span>
    </button>`).join('');
  el.querySelectorAll('.upcoming-item').forEach((b) => {
    b.addEventListener('click', () => openDayModal(b.dataset.day));
  });
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

  const kpi = (label, wert, klasse = '') => `
    <div class="summary-item"><span class="summary-label">${escapeHtml(label)}</span>
      <span class="summary-big ${klasse}">${wert}</span></div>`;
  $('dashKpis').innerHTML = kpi(t('rep.sumMonth'), fmtHM(netSum))
    + kpi(t('dash.avgDay'), fmtHM(avg))
    + kpi(t('dash.balance'), saldoStr, saldoCls)
    + kpi(t('dash.weekTarget'), fmtHM(weekTarget));

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
  $('revenueTotal').textContent = t('dash.total', fmtEur(total));
  if (entries.length === 0) {
    el.innerHTML = '<div class="chart-empty">' + escapeHtml(t('dash.noRevenue')) + '</div>';
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
    el.innerHTML = '<div class="chart-empty">' + escapeHtml(t('dash.noData')) + '</div>';
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
  if (rows.length === 0) { el.innerHTML = '<div class="chart-empty">' + escapeHtml(t('dash.noData')) + '</div>'; return; }
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
  if (keys.length === 0) { el.innerHTML = '<div class="chart-empty">' + escapeHtml(t('dash.noDataYet')) + '</div>'; return; }
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
        <div class="bar-label">${escapeHtml(monthNamesShort()[m - 1])}</div>
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
  if (!text) return;
  toast(text, { kind: kind === 'ok' ? 'ok' : kind === 'error' ? 'error' : 'info' });
}
function renderProjects() {
  const stats = projectStats();
  const body = $('projectBody');
  let totalAmount = 0, totalMs = 0;
  body.innerHTML = state.projects.map((p) => {
    const st = stats[p.id];
    totalAmount += st.amount; totalMs += st.netMs;
    const betrag = p.rate > 0 ? fmtEur(st.amount)
      : `<span class="muted" title="${escapeHtml(t('proj.noRate'))}">—</span>`;
    return `
    <tr data-pid="${p.id}" class="${p.closed ? 'proj-closed' : ''}">
      <td><input type="text" class="p-name" value="${escapeHtml(p.name)}" maxlength="60" /></td>
      <td>
        <div class="stepper stepper-small">
          <button type="button" data-step="-5"><svg class="ico"><use href="#i-minus"/></svg></button>
          <input type="number" class="p-rate" value="${p.rate}" min="0" step="5" />
          <button type="button" data-step="5"><svg class="ico"><use href="#i-plus"/></svg></button>
        </div>
      </td>
      <td>${p.closed ? `<span class="badge badge-closed">${escapeHtml(t('proj.closed'))}</span>`
                     : `<span class="badge badge-open">${escapeHtml(t('proj.open'))}</span>`}</td>
      <td>${st.count}×</td>
      <td>${fmtHM(st.netMs)}</td>
      <td class="col-net">${betrag}</td>
      <td class="proj-actions">
        <button class="icon-btn p-save" type="button" title="${escapeHtml(t('proj.saveTitle'))}">
          <svg class="ico"><use href="#i-check"/></svg></button>
        <button class="icon-btn p-export" type="button"
          title="${escapeHtml(t('proj.exportTitle'))}">
          <svg class="ico"><use href="#i-download"/></svg></button>
        <button class="icon-btn p-toggle${p.closed ? ' reopen' : ''}" type="button"
          title="${escapeHtml(p.closed ? t('proj.reopen') : t('proj.close'))}">
          <svg class="ico"><use href="#${p.closed ? 'i-refresh' : 'i-archive'}"/></svg></button>
        <button class="icon-btn danger p-del" type="button" title="${escapeHtml(t('proj.deleteTitle'))}">
          <svg class="ico"><use href="#i-trash"/></svg></button>
      </td>
    </tr>`;
  }).join('');
  if (state.projects.length) {
    body.innerHTML += `
      <tr class="proj-total">
        <td><strong>${escapeHtml(t('proj.total'))}</strong></td><td></td><td></td><td></td>
        <td><strong>${fmtHM(totalMs)}</strong></td>
        <td class="col-net"><strong>${fmtEur(totalAmount)}</strong></td><td></td>
      </tr>`;
  }
  bindSteppers(body);
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
    await refresh(); renderProjects(); projMsg(t('proj.created'), 'ok');
  } else projMsg(tErr(res.error), 'error');
}
async function onSaveProject(id, name, rate) {
  const res = await window.api.updateProject(id, { name, rate: Number(rate) || 0 });
  if (res.ok) { await refresh(); renderProjects(); projMsg(t('proj.saved'), 'ok'); }
  else projMsg(tErr(res.error), 'error');
}
async function onToggleProject(id) {
  const p = projectById(id);
  if (!p) return;
  const res = p.closed ? await window.api.reopenProject(id) : await window.api.closeProject(id);
  if (res.ok) {
    await refresh(); renderProjects();
    projMsg(p.closed ? t('proj.reopenedMsg') : t('proj.closedMsg'), 'ok');
  } else projMsg(tErr(res.error), 'error');
}
// Projekt-Löschung mit Umbuchung. Bewusst über ein eigenes Fenster statt
// window.prompt() – das gibt es in Electron nicht und wirft einen Fehler.
let reassignId = null;

function openReassignModal(id, count) {
  reassignId = id;
  const others = state.projects.filter((p) => p.id !== id);
  $('reassignText').textContent = t('rea.text', projectName(id), count);
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
    projMsg(t('proj.deletedTo', targetName), 'ok');
  } else {
    const el = $('reassignMsg'); el.textContent = tErr(res.error); el.className = 'message error';
  }
}

async function onDeleteProject(id) {
  const st = projectStats()[id];
  const others = state.projects.filter((p) => p.id !== id);
  if (others.length === 0) { projMsg(t('proj.lastOne'), 'error'); return; }
  if (st && st.count > 0) {
    openReassignModal(id, st.count);
    return;
  }
  const ok = await askConfirm({
    title: t('conf.projectTitle'),
    text: t('conf.projectText', projectName(id)),
    hint: t('conf.projectHint'),
  });
  if (!ok) return;
  const res = await window.api.deleteProject(id);
  if (res.ok) { await refresh(); renderProjects(); toast(t('proj.deletedMsg'), { kind: 'ok' }); }
  else toast(tErr(res.error), { kind: 'error' });
}

// ================= Logs =================
function renderLogs() {
  const body = $('logBody');
  const logs = [...state.logs].reverse();
  if (logs.length === 0) {
    body.innerHTML = `<tr><td colspan="3">
      <div class="empty-state">
        <svg class="ico"><use href="#i-list"/></svg>
        <p>${escapeHtml(t('logs.empty'))}</p>
      </div></td></tr>`;
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

// ================= Zeitwähler =================
// Ersetzt den nativen Aufklapper von Chromium (zwei nackte Zahlenspalten)
// durch ein Raster im App-Design. Tippen bleibt möglich – das Feld ist
// weiterhin ein input[type=time].
let tpZiel = null;      // Feld, das gerade bearbeitet wird
let tpStunde = 0;
let tpMinute = 0;

function tpText() {
  return String(tpStunde).padStart(2, '0') + ':' + String(tpMinute).padStart(2, '0');
}

function tpZeichne() {
  $('tpWert').textContent = tpText();
  $('tpStunden').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('aktiv', Number(b.dataset.h) === tpStunde);
  });
  // Die Minutenliste zeigt Fünferschritte; eine abweichende Minute wird
  // zusätzlich als eigener Eintrag hervorgehoben.
  const knoepfe = $('tpMinuten').querySelectorAll('button');
  let getroffen = false;
  knoepfe.forEach((b) => {
    const treffer = Number(b.dataset.m) === tpMinute;
    if (treffer) getroffen = true;
    b.classList.toggle('aktiv', treffer);
  });
  if (!getroffen) {
    // nächstliegenden Fünferschritt dezent markieren, damit die Spalte
    // nicht ohne jede Orientierung dasteht
    const nah = Math.round(tpMinute / 5) * 5 % 60;
    knoepfe.forEach((b) => b.classList.toggle('nah', Number(b.dataset.m) === nah));
  } else knoepfe.forEach((b) => b.classList.remove('nah'));
}

function tpUebernehmen() {
  if (!tpZiel) return;
  tpZiel.value = tpText();
  tpZiel.dispatchEvent(new Event('input', { bubbles: true }));
  tpZiel.dispatchEvent(new Event('change', { bubbles: true }));
}

function tpOeffnen(feld) {
  tpZiel = feld;
  const [h, m] = (feld.value || '').split(':').map(Number);
  const jetzt = new Date();
  tpStunde = Number.isFinite(h) ? h : jetzt.getHours();
  tpMinute = Number.isFinite(m) ? m : 0;
  tpZeichne();

  const box = $('timepicker');
  box.hidden = false;
  // Unter dem Feld ausrichten, bei zu wenig Platz darüber
  const r = feld.getBoundingClientRect();
  const bh = box.offsetHeight, bw = box.offsetWidth;
  let top = r.bottom + 6;
  if (top + bh > window.innerHeight - 8) top = Math.max(8, r.top - bh - 6);
  let left = r.left;
  if (left + bw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - bw - 8);
  box.style.top = `${Math.round(top)}px`;
  box.style.left = `${Math.round(left)}px`;
}

function tpSchliessen() {
  $('timepicker').hidden = true;
  tpZiel = null;
}

function tpAufbauen() {
  const stunden = $('tpStunden');
  const minuten = $('tpMinuten');
  stunden.innerHTML = '';
  minuten.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tp-zahl'; b.dataset.h = String(h);
    b.textContent = String(h).padStart(2, '0');
    b.addEventListener('click', () => { tpStunde = h; tpZeichne(); tpUebernehmen(); });
    stunden.appendChild(b);
  }
  for (let m = 0; m < 60; m += 5) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tp-zahl'; b.dataset.m = String(m);
    b.textContent = String(m).padStart(2, '0');
    b.addEventListener('click', () => { tpMinute = m; tpZeichne(); tpUebernehmen(); });
    minuten.appendChild(b);
  }

  $('tpJetzt').addEventListener('click', () => {
    const d = new Date();
    tpStunde = d.getHours(); tpMinute = d.getMinutes();
    tpZeichne(); tpUebernehmen();
  });
  const feinschritt = (delta) => {
    let gesamt = (tpStunde * 60 + tpMinute + delta + 1440) % 1440;
    tpStunde = Math.floor(gesamt / 60); tpMinute = gesamt % 60;
    tpZeichne(); tpUebernehmen();
  };
  $('tpMinus').addEventListener('click', () => feinschritt(-1));
  $('tpPlus').addEventListener('click', () => feinschritt(1));
  $('tpFertig').addEventListener('click', () => { tpUebernehmen(); tpSchliessen(); });

  // Außerhalb klicken schließt – der Wert ist ohnehin schon übernommen
  document.addEventListener('mousedown', (e) => {
    if ($('timepicker').hidden) return;
    if (e.target.closest('#timepicker') || e.target.closest('.time-open')) return;
    tpSchliessen();
  });
}

// Rüstet jedes Zeitfeld mit dem eigenen Wähler aus (auch nachträglich
// erzeugte, etwa im Tages-Editor).
function bindTimeFields(root = document) {
  root.querySelectorAll('input[type="time"]').forEach((feld) => {
    if (feld.dataset.tp) return;
    feld.dataset.tp = '1';
    const huelle = document.createElement('div');
    huelle.className = 'time-field';
    feld.parentNode.insertBefore(huelle, feld);
    huelle.appendChild(feld);

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'time-open';
    knopf.title = t('tp.pickTime');
    knopf.innerHTML = '<svg class="ico"><use href="#i-clock"/></svg>';
    knopf.addEventListener('click', () => {
      if (feld.disabled) return;
      if (!$('timepicker').hidden && tpZiel === feld) { tpSchliessen(); return; }
      tpOeffnen(feld);
    });
    huelle.appendChild(knopf);
  });
}

// ================= Kurzmeldungen =================
// Meldungen erscheinen unten rechts, verschwinden von allein und lassen sich
// wegklicken. Bei gespeicherten Dateien gibt es einen Weg zum Ordner.
const TOAST_ICONS = { ok: '#i-check', error: '#i-info', info: '#i-info' };

function toast(text, { kind = 'info', detail = '', action = null, dauer } = {}) {
  const box = $('toasts');
  if (!box) return null;
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  el.innerHTML = `
    <span class="toast-icon"><svg class="ico"><use href="${TOAST_ICONS[kind] || '#i-info'}"/></svg></span>
    <div class="toast-main">
      <div class="toast-title"></div>
      ${detail ? '<div class="toast-detail"></div>' : ''}
      ${action ? `<button class="toast-action" type="button">
        <svg class="ico"><use href="${action.icon || '#i-folder-open'}"/></svg>${escapeHtml(action.label)}
      </button>` : ''}
    </div>
    <button class="toast-close" type="button" title="${escapeHtml(t('toast.close'))}">✕</button>`;
  // Texte über textContent setzen, damit Pfade und Namen nie als HTML gelten
  el.querySelector('.toast-title').textContent = text;
  if (detail) el.querySelector('.toast-detail').textContent = detail;

  const weg = () => {
    if (!el.isConnected || el.classList.contains('leaving')) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast-close').addEventListener('click', weg);
  const aktion = el.querySelector('.toast-action');
  if (aktion) aktion.addEventListener('click', () => { action.onClick(); weg(); });

  box.appendChild(el);
  // Fehler bleiben länger stehen, Erfolge verschwinden zügig
  const ms = dauer !== undefined ? dauer : (kind === 'error' ? 9000 : 5500);
  if (ms > 0) setTimeout(weg, ms);
  // Nie mehr als vier gleichzeitig
  while (box.children.length > 4) box.firstElementChild.remove();
  return el;
}

// Meldung für eine gespeicherte Datei – mit Weg zum Ordner
function toastFile(text, pfad) {
  toast(text, {
    kind: 'ok',
    detail: pfad,
    action: {
      label: t('toast.showInFolder'),
      icon: '#i-folder-open',
      onClick: () => window.api.showInFolder(pfad),
    },
    dauer: 9000,
  });
}

// ================= Rückfrage vor dem Löschen =================
let confirmResolve = null;

function askConfirm({ title, text, hint = '', okLabel } = {}) {
  // Eine noch offene Rückfrage zuerst verneinen, statt sie zu überschreiben –
  // sonst bliebe der erste Aufruf für immer hängen.
  if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
  $('confirmTitle').textContent = title || t('conf.deleteQ');
  $('confirmText').textContent = text;
  $('confirmHint').textContent = hint;
  $('confirmOk').textContent = okLabel || t('conf.delete');
  $('confirmModal').hidden = false;
  $('confirmOk').focus();
  return new Promise((resolve) => { confirmResolve = resolve; });
}

function closeConfirm(antwort) {
  $('confirmModal').hidden = true;
  if (confirmResolve) { confirmResolve(antwort); confirmResolve = null; }
}

// ================= Bedienelemente =================
// Segment-Schalter: verhält sich wie ein Auswahlfeld, ist aber mit einem
// Klick bedient statt mit Aufklappen und Zielen.
function getSegmented(id) {
  const aktiv = $(id).querySelector('button.active');
  return aktiv ? aktiv.dataset.value : '';
}
function setSegmented(id, wert) {
  const box = $(id);
  if (!box) return;
  const buttons = [...box.querySelectorAll('button')];
  const treffer = buttons.find((b) => b.dataset.value === String(wert));
  buttons.forEach((b) => b.classList.toggle('active', b === (treffer || buttons[0])));
}

// Schrittzähler: −/+ neben dem Zahlenfeld, Grenzen aus min/max des Feldes
function bindSteppers(root = document) {
  root.querySelectorAll('.stepper button[data-step]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const feld = btn.parentElement.querySelector('input[type="number"]');
      if (!feld) return;
      const schritt = Number(btn.dataset.step) || 1;
      const min = feld.min === '' ? -Infinity : Number(feld.min);
      const max = feld.max === '' ? Infinity : Number(feld.max);
      const jetzt = Number(feld.value) || 0;
      const neu = Math.min(max, Math.max(min, Math.round((jetzt + schritt) * 100) / 100));
      feld.value = String(neu);
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

// „jetzt"-Knopf: setzt die aktuelle Uhrzeit in ein Zeitfeld
function bindNowButtons(root = document) {
  root.querySelectorAll('[data-now]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const feld = $(btn.dataset.now);
      if (!feld) return;
      const d = new Date();
      feld.value = String(d.getHours()).padStart(2, '0') + ':'
        + String(d.getMinutes()).padStart(2, '0');
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

// Alle Segment-Schalter reagieren auf Klicks (auch nachträglich erzeugte)
function bindSegmented(root = document) {
  root.querySelectorAll('.segmented').forEach((box) => {
    if (box.dataset.bound) return;
    box.dataset.bound = '1';
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      box.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

// ================= Tastenkürzel =================
// Das Feld nimmt die gedrückte Kombination auf, statt sie tippen zu lassen.
// Electron-Bezeichner -> Übersetzungsschlüssel. Die Tastennamen heißen je
// Sprache anders: „Umschalt" auf Deutsch, „Shift" auf Englisch, „Maj" auf
// Französisch.
const HOTKEY_LABELS = {
  Control: 'key.control', Alt: 'key.alt', Shift: 'key.shift', Super: 'key.super',
};

// 'Control+T' -> 'Strg + T' für die Anzeige
function hotkeyLesbar(acc) {
  return String(acc || '').split('+')
    .map((teil) => (HOTKEY_LABELS[teil] ? t(HOTKEY_LABELS[teil]) : teil))
    .join(' + ');
}

// Fehler beim Setzen des Kürzels. Der Hauptprozess liefert Ursache und Kürzel
// getrennt, damit hier die Sprache stimmt und „Control+Shift+T" als
// „Strg + Umschalt + T" erscheint.
function hotkeyFehlerText(info) {
  if (!info) return '';
  if (typeof info === 'string') return tErr(info);
  const kuerzel = hotkeyLesbar(info.hotkey);
  if (info.grund === 'belegt') return t('set.hotkeyTaken', kuerzel);
  if (info.grund === 'fehler') return t('set.hotkeyFailed', kuerzel, info.detail || '');
  return tErr(info.error || '');
}

// KeyboardEvent -> Electron-Accelerator, oder null wenn unbrauchbar
function hotkeyAusEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');

  const k = e.key;
  let taste = null;
  if (/^[a-zA-Z0-9]$/.test(k)) taste = k.toUpperCase();
  else if (/^F([1-9]|1[0-2])$/.test(k)) taste = k;
  else if (k === ' ') taste = 'Space';
  else if (['Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End'].includes(k)) taste = k;
  else if (k === 'PageUp' || k === 'PageDown') taste = k;
  else if (k === 'ArrowUp') taste = 'Up';
  else if (k === 'ArrowDown') taste = 'Down';
  else if (k === 'ArrowLeft') taste = 'Left';
  else if (k === 'ArrowRight') taste = 'Right';
  else if (k === '+') taste = 'Plus';
  else if (k === '-') taste = 'Minus';

  if (!taste || !mods.length) return null;
  return [...mods, taste].join('+');
}

let hotkeyEntwurf = 'Control+Shift+T';

function setHotkeyFeld(acc) {
  hotkeyEntwurf = acc;
  $('setHotkey').value = hotkeyLesbar(acc);
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
// Beispiel für die Datumsvorschau in den Einstellungen
function datePreviewFor(muster, kurz) {
  const merk = state.settings;
  state.settings = Object.assign({}, merk, { dateFormat: muster, shortYear: kurz });
  const text = fmtDate('2026-03-09');
  state.settings = merk;
  return text;
}

// Was gerade in den Bedienelementen steht – noch nicht gespeichert.
function dateEntwurf() {
  const sel = $('setDateFormat');
  const muster = DATE_FORMAT_LIST.includes(sel.value)
    ? sel.value : (state.settings.dateFormat || 'dd.MM.yyyy');
  return { muster, kurz: getSegmented('setShortYear') === '1' };
}

// Beschriftungen der Auswahlliste an „Jahr abkürzen" anpassen. Bewusst nur die
// Texte ändern und die Liste nicht neu aufbauen – ein Neubau würde die
// getroffene Auswahl und den Tastaturfokus verwerfen.
function dateOptionenBeschriften(kurz) {
  for (const o of $('setDateFormat').options) {
    o.textContent = datePreviewFor(o.value, kurz);
  }
}

// Nach einer Bedienung: Beispiel und Hinweis nachziehen, Auswahl behalten.
function dateVorschau() {
  const { muster, kurz } = dateEntwurf();
  dateOptionenBeschriften(kurz);
  $('datePreview').textContent = datePreviewFor(muster, kurz);
  $('dateHint').textContent = t('set.dateHint',
    datePreviewFor(muster, true), datePreviewFor(muster, false));
}

// Die Felder aus den gespeicherten Einstellungen füllen. Läuft beim Laden und
// nach dem Speichern – nicht als Reaktion auf einen Klick, sonst würde die
// Eingabe sofort wieder auf den alten Stand gesetzt.
function fillDateSettings() {
  const s = state.settings;
  const gewaehlt = DATE_FORMAT_LIST.includes(s.dateFormat) ? s.dateFormat : 'dd.MM.yyyy';
  const kurz = !!s.shortYear;
  const sel = $('setDateFormat');
  sel.innerHTML = DATE_FORMAT_LIST.map((m) => `<option value="${m}"></option>`).join('');
  sel.value = gewaehlt;
  setSegmented('setShortYear', kurz ? 1 : 0);
  $('setLanguage').value = lang;
  dateVorschau();
}

async function fillSettings() {
  const s = state.settings;
  $('setTarget').value = decToHM(s.targetHoursPerDay || 0);
  $('setDays').value = s.targetDaysPerWeek || 5;
  fillDateSettings();
  setSegmented('setRound', s.roundingMinutes || 0);
  setSegmented('setNotify', s.notify === false ? 0 : 1);
  setSegmented('setNotifyBefore', s.notifyBefore === undefined ? 10 : s.notifyBefore);
  setSegmented('setHotkeyEnabled', s.hotkeyEnabled ? 1 : 0);
  setHotkeyFeld(s.hotkey || 'Control+Shift+T');
  setSegmented('setMiniEnabled', s.miniEnabled === false ? 0 : 1);
  setSegmented('setMiniPosition', s.miniPosition || 'br');
  setSegmented('setTrayOnClose', s.trayOnClose ? 1 : 0);
  setSegmented('setAutoUpdate', s.autoUpdate === false ? 0 : 1);
  const info = await window.api.dataInfo();
  if (info.ok) {
    $('dataPath').textContent = info.data.file;
    $('appVersion').textContent = info.data.version;
    appVersion = info.data.version;
  }
}

// ================= Änderungsliste =================
// Version der laufenden Installation. Bewusst eine Variable und nicht das
// Feld in den Einstellungen: das wird erst gefüllt, wenn man diese Ansicht
// öffnet – die Markierung „installiert" fehlte davor.
let appVersion = '';

// Vergleicht zwei Versionsnummern („1.7.10" ist neuer als „1.7.9", deshalb
// zahlenweise und nicht als Text).
function versionVergleich(a, b) {
  const zerlege = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const x = zerlege(a);
  const y = zerlege(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function renderChangelog() {
  const el = $('changelogBody');
  const liste = typeof CHANGELOG !== 'undefined' ? CHANGELOG : [];
  if (!liste.length) {
    el.innerHTML = `<p class="hint">${escapeHtml(t('chg.empty'))}</p>`;
    return;
  }
  const installiert = appVersion;
  el.innerHTML = liste.map((eintrag) => {
    const punkte = (eintrag.punkte[lang] || eintrag.punkte.de || []);
    const vergleich = installiert && installiert !== '–'
      ? versionVergleich(eintrag.version, installiert) : null;
    // Nur zwei Fälle kennzeichnen: die laufende Version und solche, die
    // neuer sind – alles Ältere braucht keine Markierung.
    const marke = vergleich === 0
      ? `<span class="chg-badge chg-now">${escapeHtml(t('chg.installed'))}</span>`
      : vergleich > 0
        ? `<span class="chg-badge chg-new">${escapeHtml(t('chg.newer'))}</span>` : '';
    return `
      <section class="chg-eintrag">
        <h4>
          <span class="chg-version">${escapeHtml(eintrag.version)}</span>
          <span class="chg-datum">${escapeHtml(fmtDate(eintrag.datum))}</span>
          ${marke}
        </h4>
        <ul>${punkte.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      </section>`;
  }).join('');
}

async function openChangelog() {
  if (!appVersion) {
    const info = await window.api.dataInfo();
    if (info.ok) appVersion = info.data.version;
  }
  renderChangelog();
  $('changelogModal').hidden = false;
}
function closeChangelog() { $('changelogModal').hidden = true; }

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

// Letzter Stand, damit ein Sprachwechsel die aktuelle Meldung neu übersetzt
// statt sie auf „noch nicht gesucht" zurückzusetzen.
let letzterUpdateStand = null;

// Meldungen des Hauptprozesses zum Update-Vorgang
function onUpdateEvent(info) {
  letzterUpdateStand = info;
  const busy = ['checking', 'downloading'].includes(info.state);
  if (info.state === 'downloaded') updateReady = true;
  $('btnCheckUpdate').disabled = busy;
  $('btnInstallUpdate').hidden = !updateReady;
  // „Herunterladen" nur, solange etwas zu holen ist: nach dem Laden übernimmt
  // der Installieren-Knopf.
  $('btnDownloadUpdate').hidden = !(info.state === 'available' && info.selbstLaden);
  if (info.state !== 'downloading') showUpdateProgress(null);

  switch (info.state) {
    case 'checking':
      updateStatus(t('upd.checking')); break;
    case 'available':
      updateStatus(info.selbstLaden
        ? t('upd.availableManual', info.version)
        : t('upd.available', info.version));
      break;
    case 'not-available':
      // Mit der vom Server gemeldeten Version: stimmt sie nicht mit dem
      // überein, was auf GitHub liegt, zeigt schon diese Zeile das Problem.
      updateStatus(info.version
        ? t('upd.notAvailableFound', info.version)
        : t('upd.notAvailable'), 'ok');
      break;
    case 'downloading':
      updateStatus(t('upd.downloading', info.version || '', Math.round(info.percent || 0)));
      showUpdateProgress(info.percent || 0); break;
    case 'downloaded':
      updateStatus(t('upd.downloaded', info.version), 'ok'); break;
    case 'dev':
      updateStatus(t('upd.dev')); break;
    case 'error':
      updateStatus(t('upd.error', info.message || t('upd.unknownError')), 'error'); break;
    default:
      updateStatus(t('upd.none'));
  }
}
async function saveSettings() {
  const patch = {
    targetHoursPerDay: hmToDec($('setTarget').value || '08:00'),
    targetDaysPerWeek: Math.min(7, Math.max(1, Number($('setDays').value) || 5)),
    roundingMinutes: Number(getSegmented('setRound')) || 0,
  };
  const res = await window.api.updateSettings(patch);
  if (res.ok) { await refresh(); toast(t('set.saved'), { kind: 'ok' }); }
  else toast(tErr(res.error), { kind: 'error' });
}

// ================= Views =================
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'kalender') renderCalendar();
  if (name === 'dashboard') renderDashboard();
  if (name === 'projekte') renderProjects();
  if (name === 'logs') renderLogs();
  if (name === 'settings') fillSettings();
}

// ================= Aktionen / Refresh =================
// Globale Rückmeldungen laufen über die Kurzmeldungen unten rechts
function showMessage(text, kind) {
  if (!text) return;
  toast(text, { kind: kind === 'ok' ? 'ok' : kind === 'error' ? 'error' : 'info' });
}
async function refresh() {
  const res = await window.api.state();
  if (res.ok) {
    state = res.data;
    applyTheme(state.settings.theme);
    applyLanguage(state.settings.language);
    renderStatus();
    fillMonthSelect($('monthSelect'));
    fillProjectSelect($('reportProject'), { allOption: true });
    renderReport();
    if (!$('view-kalender').hidden) renderCalendar();
    tick();
  }
}
async function action(fn, okMsg) {
  const res = await fn();
  if (res.ok) { showMessage(okMsg, 'ok'); await refresh(); }
  else showMessage(tErr(res.error), 'error');
}
async function onDeleteDay(dateKey) {
  const ids = state.sessions.filter((s) => s.date === dateKey).map((s) => s.id);
  const ok = await askConfirm({
    title: t('conf.dayTitle'),
    text: ids.length === 1
      ? t('conf.dayTextOne', fmtDate(dateKey))
      : t('conf.dayText', ids.length, fmtDate(dateKey)),
    hint: t('conf.dayHint'),
    okLabel: t('conf.dayBtn'),
  });
  if (!ok) return;
  for (const id of ids) await window.api.deleteSession(id);
  await refresh();
  toast(t('day.dayDeleted', fmtDate(dateKey)), { kind: 'ok' });
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

// Termine als eigener Abschnitt im Export. Notizen werden einzeilig gemacht,
// damit jede Zeile eine Tabellenzeile bleibt.
function eventLines(termine, mitProjekt = true) {
  const lines = [];
  lines.push('');
  lines.push(csvRow([t('csv.events')]));
  if (termine.length === 0) {
    lines.push(csvRow([t('csv.noEvents')]));
    return lines;
  }
  const kopf = [t('csv.date'), t('csv.time')];
  if (mitProjekt) kopf.push(t('csv.project'));
  kopf.push(t('csv.evTitle'), t('csv.note'));
  lines.push(csvRow(kopf));
  for (const e of termine) {
    const zeile = [fmtDate(e.date), e.time || t('csv.allDay')];
    if (mitProjekt) zeile.push(eventProjectName(e));
    zeile.push(e.title, (e.note || '').replace(/\r?\n/g, ' | '));
    lines.push(csvRow(zeile));
  }
  return lines;
}

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
  lines.push(csvRow([t('csv.project'), p.name]));
  lines.push(csvRow([t('csv.rate'), eurCsv(p.rate)]));
  lines.push(csvRow([t('csv.status'), p.closed ? t('proj.closed') : t('proj.open')]));
  lines.push(csvRow([t('csv.exportedAt'), fmtTs(new Date().toISOString())]));
  lines.push('');
  lines.push(csvRow([t('csv.date'), t('csv.in'), t('csv.out'), t('csv.breaksHm'),
    t('csv.breakTimes'), t('csv.netHm'), t('csv.netH'), t('csv.amount')]));

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

    const breakTimes = breakTimesPlain(s);
    lines.push(csvRow([
      fmtDate(s.date), toHM(s.clockIn), s.clockOut ? toHMPlain(s.clockOut, s.date) : t('csv.running'),
      fmtHM(brk), breakTimes, fmtHM(net), hoursCsv(net), eurCsv(amount),
    ]));
  }
  if (sessions.length === 0) lines.push(csvRow([t('csv.noTimes')]));

  lines.push('');
  lines.push(csvRow([t('csv.total'), '', '', fmtHM(sumBreak), '', fmtHM(sumNet), hoursCsv(sumNet),
    eurCsv(roundEur(sumAmount))]));
  lines.push('');
  lines.push(csvRow([t('csv.perMonth')]));
  lines.push(csvRow([t('csv.month'), t('csv.blocks'), t('csv.netHm'), t('csv.netH'), t('csv.amount')]));
  for (const mk of Object.keys(byMonth).sort()) {
    const m = byMonth[mk];
    lines.push(csvRow([monthLabel(mk), m.count, fmtHM(m.net), hoursCsv(m.net), eurCsv(roundEur(m.amount))]));
  }

  // Termine, die diesem Projekt zugeordnet sind
  lines.push(...eventLines(state.events.filter((e) => e.projectId === projectId), false));
  return lines.join('\r\n');
}

async function onExportProject(projectId) {
  const p = projectById(projectId);
  if (!p) return;
  const stamp = localDateKey(new Date());
  const res = await window.api.exportCsv(buildProjectCsv(projectId), `desk-tracking-${p.name}-${stamp}.csv`);
  if (res.ok) toastFile(t('proj.exported', p.name), res.data);
  else if (res.error !== 'Abgebrochen') toast(tErr(res.error), { kind: 'error' });
}

// Monats-CSV: eine Zeile je Arbeitsblock (nicht je Tag) – wer zweimal am Tag
// stempelt, soll auch beide Zeiten sehen. Darunter zusätzlich die Tagessummen.
function buildCsv() {
  const monthKey = $('monthSelect').value;
  const projectId = $('reportProject').value;
  const now = Date.now();
  const sessions = state.sessions
    .filter((s) => s.date.slice(0, 7) === monthKey && (!projectId || s.projectId === projectId))
    .sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));

  const lines = [];
  lines.push(csvRow([t('csv.month'), monthLabel(monthKey)]));
  lines.push(csvRow([t('csv.project'), projectId ? projectName(projectId) : t('rep.allProjects')]));
  lines.push(csvRow([t('csv.exportedAt'), fmtTs(new Date().toISOString())]));
  lines.push('');
  lines.push(csvRow([t('csv.date'), t('csv.project'), t('csv.in'), t('csv.out'), t('csv.breaksHm'),
    t('csv.breakTimes'), t('csv.netHm'), t('csv.netH'), t('csv.amount')]));

  let sumNet = 0, sumBreak = 0, sumAmount = 0;
  for (const s of sessions) {
    const net = roundMs(sessionNetMs(s, now));
    const brk = sessionBreakMs(s, now);
    const amount = roundEur(sessionAmount(s, now));
    sumNet += net; sumBreak += brk; sumAmount += amount;
    const breakTimes = breakTimesPlain(s);
    lines.push(csvRow([
      fmtDate(s.date), projectName(s.projectId), toHM(s.clockIn),
      s.clockOut ? toHMPlain(s.clockOut, s.date) : t('csv.running'),
      fmtHM(brk), breakTimes, fmtHM(net), hoursCsv(net), eurCsv(amount),
    ]));
  }
  if (sessions.length === 0) lines.push(csvRow([t('csv.noEntries')]));

  lines.push('');
  lines.push(csvRow([t('csv.total'), '', '', '', fmtHM(sumBreak), '', fmtHM(sumNet), hoursCsv(sumNet),
    eurCsv(roundEur(sumAmount))]));

  // Tagesübersicht: eine Zeile je Tag, wie in der Auswertung am Bildschirm
  const rows = dailyRows(monthKey, projectId).sort((a, b) => a.date.localeCompare(b.date));
  lines.push('');
  lines.push(csvRow([t('csv.perDay')]));
  lines.push(csvRow([t('csv.date'), t('csv.blocks'), t('csv.in'), t('csv.out'),
    t('csv.breaksHm'), t('csv.netHm'), t('csv.netH'), t('csv.amount')]));
  for (const r of rows) {
    lines.push(csvRow([
      fmtDate(r.date), r.blocks.length,
      r.blocks.map((b) => toHM(b.in)).join(' / '),
      r.blocks.map((b) => (b.out ? toHMPlain(b.out, r.date) : t('csv.running'))).join(' / '),
      fmtHM(r.breakMs), fmtNet(r.netMs), hoursCsv(roundMs(r.netMs)), eurCsv(roundEur(r.amount)),
    ]));
  }

  // Termine des Monats – bei gesetztem Projektfilter nur die passenden
  const termine = state.events.filter((e) => e.date.slice(0, 7) === monthKey
    && (!projectId || e.projectId === projectId));
  lines.push(...eventLines(termine));
  return lines.join('\r\n');
}

// ================= Event-Bindung =================
window.addEventListener('DOMContentLoaded', () => {
  // Stempel-Buttons
  $('btnIn').addEventListener('click',
    () => action(() => window.api.clockIn($('activeProject').value), t('erf.msgIn')));
  $('activeProject').addEventListener('change', async () => {
    await window.api.setActiveProject($('activeProject').value);
  });
  $('btnOut').addEventListener('click', () => action(window.api.clockOut, t('erf.msgOut')));
  $('btnBreak').addEventListener('click', () => {
    const inPause = state.open && state.open.breaks.some((b) => b.end === null);
    action(inPause ? window.api.endBreak : window.api.startBreak,
      inPause ? t('erf.msgBreakEnd') : t('erf.msgBreakStart'));
  });

  // Auswertung
  $('monthSelect').addEventListener('change', renderReport);
  $('reportProject').addEventListener('change', renderReport);
  $('btnPrint').addEventListener('click', () => window.print());
  $('btnPdf').addEventListener('click', async () => {
    const monthKey = $('monthSelect').value;
    const proj = $('reportProject').value ? '-' + projectName($('reportProject').value) : '';
    const res = await window.api.exportPdf(`desk-tracking-${monthKey}${proj}.pdf`);
    if (res.ok) {
      toastFile(t('toast.pdfSaved'), res.data);
      window.api.openPath(res.data);
    } else if (res.error !== 'Abgebrochen') toast(tErr(res.error), { kind: 'error' });
  });
  $('btnExport').addEventListener('click', async () => {
    const monthKey = $('monthSelect').value;
    const proj = $('reportProject').value ? '-' + projectName($('reportProject').value) : '';
    const res = await window.api.exportCsv(buildCsv(), `desk-tracking-${monthKey}${proj}.csv`);
    if (res.ok) toastFile(t('toast.csvSaved'), res.data);
    else if (res.error !== 'Abgebrochen') toast(tErr(res.error), { kind: 'error' });
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
    const ok = await askConfirm({
      title: t('conf.logsTitle'),
      text: t('conf.logsText', state.logs.length),
      hint: t('conf.logsHint'),
      okLabel: t('conf.logsBtn'),
    });
    if (!ok) return;
    await window.api.clearLogs(); await refresh(); renderLogs();
    toast(t('logs.cleared'), { kind: 'ok' });
  });
  $('setSave').addEventListener('click', saveSettings);

  // Erinnerungen
  $('notifySave').addEventListener('click', async () => {
    const res = await window.api.updateSettings({
      notify: getSegmented('setNotify') === '1',
      notifyBefore: Number(getSegmented('setNotifyBefore')) || 0,
    });
    if (res.ok) { await refresh(); toast(t('set.remindSaved'), { kind: 'ok' }); }
    else toast(tErr(res.error), { kind: 'error' });
  });
  $('notifyTest').addEventListener('click', async () => {
    const res = await window.api.testNotification();
    if (res.ok) toast(t('set.testSent'), { kind: 'info' });
    else toast(tErr(res.error) || t('set.notifyUnavailable'), { kind: 'error' });
  });

  // Sprache über die Flagge
  $('langToggle').addEventListener('click', (e) => { e.stopPropagation(); toggleLangMenu(); });
  document.querySelectorAll('#langMenu button').forEach((b) => {
    b.addEventListener('click', () => setLanguage(b.dataset.lang));
  });
  document.addEventListener('mousedown', (e) => {
    if ($('langMenu').hidden) return;
    if (e.target.closest('.lang-wrap')) return;
    toggleLangMenu(false);
  });

  // Datum und Sprache in den Einstellungen. Beim Bedienen nur die Vorschau
  // nachziehen – die Auswahl selbst muss stehen bleiben, bis gespeichert wird.
  $('setShortYear').addEventListener('change', dateVorschau);
  $('setDateFormat').addEventListener('change', dateVorschau);
  $('setLanguage').addEventListener('change', () => setLanguage($('setLanguage').value));
  $('dateSave').addEventListener('click', async () => {
    const res = await window.api.updateSettings({
      dateFormat: $('setDateFormat').value,
      shortYear: getSegmented('setShortYear') === '1',
    });
    if (!res.ok) { toast(tErr(res.error), { kind: 'error' }); return; }
    await refresh();
    renderAll();
    toast(t('set.dateSaved'), { kind: 'ok' });
  });

  // Tastenkürzel aufnehmen
  $('setHotkey').addEventListener('keydown', (e) => {
    e.preventDefault();
    if (e.key === 'Escape') { $('setHotkey').blur(); return; }
    // Reine Zusatztasten noch nicht übernehmen – erst warten
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      const teile = [];
      if (e.ctrlKey) teile.push(t('key.control'));
      if (e.altKey) teile.push(t('key.alt'));
      if (e.shiftKey) teile.push(t('key.shift'));
      if (e.metaKey) teile.push(t('key.super'));
      $('setHotkey').value = teile.join(' + ') + ' + …';
      return;
    }
    const acc = hotkeyAusEvent(e);
    if (!acc) {
      toast(t('set.hotkeyNeedMod'), { kind: 'error' });
      setHotkeyFeld(hotkeyEntwurf);
      return;
    }
    setHotkeyFeld(acc);
  });
  // Während der Aufnahme das eigene Kürzel freigeben – sonst minimiert sich
  // das Fenster mitten im Erfassen, wenn man die aktive Kombination drückt.
  $('setHotkey').addEventListener('focus', () => { window.api.suspendHotkey(); });
  $('setHotkey').addEventListener('blur', () => {
    setHotkeyFeld(hotkeyEntwurf);
    window.api.applyHotkey();
  });
  $('hotkeyReset').addEventListener('click', () => setHotkeyFeld('Control+Shift+T'));

  $('hotkeySave').addEventListener('click', async () => {
    const an = getSegmented('setHotkeyEnabled') === '1';
    const res = await window.api.updateSettings({ hotkeyEnabled: an, hotkey: hotkeyEntwurf });
    if (!res.ok) { toast(tErr(res.error), { kind: 'error' }); return; }
    await refresh();
    const angewandt = await window.api.applyHotkey();
    if (angewandt.ok) {
      toast(an ? t('set.hotkeyActive', hotkeyLesbar(hotkeyEntwurf)) : t('set.hotkeyOff'),
        { kind: 'ok' });
    } else {
      toast(hotkeyFehlerText(angewandt), { kind: 'error' });
    }
  });

  // Mini-Bedienfeld
  $('miniSave').addEventListener('click', async () => {
    const res = await window.api.updateSettings({
      miniEnabled: getSegmented('setMiniEnabled') === '1',
      miniPosition: getSegmented('setMiniPosition'),
    });
    if (res.ok) { await refresh(); toast(t('set.miniSaved'), { kind: 'ok' }); }
    else toast(tErr(res.error), { kind: 'error' });
  });
  $('miniPreview').addEventListener('click', async () => {
    const res = await window.api.previewMini();
    if (!res.ok) toast(tErr(res.error), { kind: 'info' });
  });

  // Verhalten beim Schließen des Fensters
  $('traySave').addEventListener('click', async () => {
    const an = getSegmented('setTrayOnClose') === '1';
    const res = await window.api.updateSettings({ trayOnClose: an });
    if (!res.ok) { toast(tErr(res.error), { kind: 'error' }); return; }
    await refresh();
    toast(an ? t('set.traySavedOn') : t('set.traySavedOff'), { kind: 'ok' });
  });

  // Rückfrage vor dem Löschen
  $('confirmOk').addEventListener('click', () => closeConfirm(true));
  $('confirmCancel').addEventListener('click', () => closeConfirm(false));
  $('confirmClose').addEventListener('click', () => closeConfirm(false));
  $('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirm(false);
  });

  // Das Mini-Bedienfeld hat gestempelt – Ansichten nachziehen, auch offene
  // Fenster. Ein veralteter Tages-Editor würde beim Speichern sonst ein
  // zwischenzeitliches „Gehen" wieder aufheben.
  window.api.onDataChanged(async () => {
    await refresh();
    if (currentDay && !$('modal').hidden) renderDayEditor();
    if (!$('view-projekte').hidden) renderProjects();
    if (!$('view-dashboard').hidden) renderDashboard();
    if (!$('view-logs').hidden) renderLogs();
  });

  // Hinweise aus dem Hauptprozess beim Start (z. B. belegtes Kürzel)
  window.api.onStartupWarning((info) => toast(hotkeyFehlerText(info), {
    kind: 'error', dauer: 14000,
  }));
  // Auf Systemen ohne eingefärbte Fensterleiste entfällt der Platz dafür
  window.api.onSystemleiste(() => document.body.classList.add('systemleiste'));

  // Erinnerung angeklickt: den betroffenen Tag öffnen
  window.api.onOpenDay((date) => {
    showView('kalender');
    calMonth = date.slice(0, 7);
    renderCalendar();
    openDayModal(date, 'termine');
  });

  // Design umschalten
  $('themeToggle').addEventListener('click', toggleTheme);
  document.querySelectorAll('.theme-card').forEach((card) => {
    card.addEventListener('click', () => setTheme(card.dataset.themeValue));
  });

  // Updates / Datenspeicher
  $('btnCheckUpdate').addEventListener('click', () => window.api.checkForUpdate());
  $('btnDownloadUpdate').addEventListener('click', () => window.api.downloadUpdate());
  $('btnInstallUpdate').addEventListener('click', () => window.api.installUpdate());
  $('autoUpdateSave').addEventListener('click', async () => {
    const an = getSegmented('setAutoUpdate') === '1';
    const res = await window.api.updateSettings({ autoUpdate: an });
    if (!res.ok) { toast(tErr(res.error), { kind: 'error' }); return; }
    await refresh();
    toast(t('set.autoUpdateSaved'), { kind: 'ok' });
  });
  $('btnOpenData').addEventListener('click', () => window.api.openDataFolder());
  window.api.onUpdateEvent(onUpdateEvent);

  // Kalender
  $('calPrev').addEventListener('click', () => { calMonth = shiftMonth(calMonth, -1); renderCalendar(); });
  $('calNext').addEventListener('click', () => { calMonth = shiftMonth(calMonth, 1); renderCalendar(); });
  $('calToday').addEventListener('click', () => {
    calMonth = localDateKey(new Date()).slice(0, 7); renderCalendar();
  });

  // Detail-/Edit-Modal
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.querySelectorAll('.modal-tab').forEach((reiter) => {
    reiter.addEventListener('click', () => switchTab(reiter.dataset.tab));
  });

  // Nachtragen-Formular
  $('btnAdd').addEventListener('click', openFormModal);
  $('fAddBreak').addEventListener('click', () => addBreakRow());
  ['fDate', 'fIn', 'fOut'].forEach((id) => $(id).addEventListener('input', updateFormPreview));
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

  // Änderungsliste
  $('btnChangelog').addEventListener('click', openChangelog);
  $('changelogClose').addEventListener('click', closeChangelog);
  $('changelogModal').addEventListener('click', (e) => {
    if (e.target.id === 'changelogModal') closeChangelog();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Von oben nach unten schließen: erst der Zeitwähler, dann die Rückfrage,
    // dann die Fenster – ein Escape soll nicht alles auf einmal wegräumen.
    if (!$('timepicker').hidden) { tpSchliessen(); return; }
    if (!$('confirmModal').hidden) { closeConfirm(false); return; }
    if (!$('changelogModal').hidden) { closeChangelog(); return; }
    closeModal(); closeFormModal(); closeReassignModal();
  });

  // Eigene Bedienelemente aktivieren
  bindSegmented();
  bindSteppers();
  bindNowButtons();
  tpAufbauen();
  bindTimeFields();

  refresh();
  setInterval(tick, 1000);
});

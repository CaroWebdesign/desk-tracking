// Mini-Bedienfeld: Stempeln ohne das Hauptfenster zu öffnen.
// Nutzt dieselbe Brücke wie die Hauptoberfläche.
const $ = (id) => document.getElementById(id);

let state = { open: null, sessions: [], projects: [], events: [], settings: {} };
let lang = 'de';

// Übersetzen – dieselbe Tabelle wie im Hauptfenster (i18n.js)
function t(key, ...args) {
  const tabelle = STRINGS[lang] || STRINGS.de;
  let text = tabelle[key];
  if (text === undefined) text = STRINGS.de[key];
  if (text === undefined) return key;
  return text.replace(/\{(\d+)\}/g, (_, i) => (args[i] !== undefined ? args[i] : ''));
}

// Meldungen der Datenschicht kommen auf Deutsch
function tErr(text) {
  if (lang === 'de' || !text) return text;
  const tabelle = ERRORS[lang];
  if (tabelle && tabelle[text]) return tabelle[text];
  for (const [muster, ersatz] of (ERROR_PATTERNS[lang] || [])) {
    if (muster.test(text)) return text.replace(muster, ersatz);
  }
  return text;
}

function applyLanguage(neu) {
  lang = (STRINGS[neu] ? neu : 'de');
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}

function fmtHMS(ms) {
  const sek = Math.floor(ms / 1000);
  const h = Math.floor(sek / 3600), m = Math.floor((sek % 3600) / 60), s = sek % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    + `-${String(d.getDate()).padStart(2, '0')}`;
}
function breakMs(b, now) {
  return Math.max(0, (b.end ? new Date(b.end).getTime() : now) - new Date(b.start).getTime());
}
function sessionNetMs(s, now) {
  const start = new Date(s.clockIn).getTime();
  const end = s.clockOut ? new Date(s.clockOut).getTime() : now;
  return Math.max(0, end - start - s.breaks.reduce((a, b) => a + breakMs(b, now), 0));
}

function msg(text, kind) {
  const el = $('miniMsg');
  el.textContent = text || '';
  el.className = 'mini-msg' + (kind ? ' ' + kind : '');
  if (text) setTimeout(() => { if (el.textContent === text) msg(''); }, 4000);
}

function render() {
  const open = state.open;
  const onBreak = !!open && open.breaks.some((b) => b.end === null);

  $('miniDot').className = 'dot ' + (onBreak ? 'dot-break' : open ? 'dot-on' : 'dot-off');
  const proj = open ? (state.projects.find((p) => p.id === open.projectId) || {}).name : null;
  $('miniStatus').textContent = onBreak ? t('mini.statusBreak', proj || '')
    : open ? t('mini.statusOn', proj || '') : t('status.off');

  const hatOffene = state.projects.some((p) => !p.closed);
  $('miniIn').disabled = !!open || !hatOffene;
  $('miniOut').disabled = !open;
  $('miniBreak').disabled = !open;
  // Ein Knopf für Pause: startet oder beendet, je nach Zustand
  $('miniBreak').querySelector('span').textContent = onBreak ? t('mini.resume') : t('mini.break');
  // Symbol zeigt die Aktion: Pause starten (▶), Pause beenden (⏸)
  $('miniBreak').querySelector('use').setAttribute('href', onBreak ? '#i-pause' : '#i-play');
  $('miniBreak').title = onBreak ? t('erf.breakEnd') : t('erf.breakStart');

  // Projektwahl: bei laufender Sitzung deren Projekt zeigen und sperren
  const sel = $('miniProject');
  const want = open ? open.projectId : state.settings.activeProjectId;
  const liste = state.projects.filter((p) => !p.closed || p.id === want);
  sel.innerHTML = liste.map((p) =>
    `<option value="${p.id}"${p.id === want ? ' selected' : ''}>${
      p.name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    }${p.closed ? t('mini.closedSuffix') : ''}</option>`).join('');
  sel.disabled = !!open;

  tick();
}

function tick() {
  const now = Date.now();
  const heute = localDateKey(new Date());
  const ms = state.sessions
    .filter((s) => s.date === heute || (state.open && s.id === state.open.id))
    .reduce((a, s) => a + sessionNetMs(s, now), 0);
  $('miniTime').textContent = fmtHMS(ms);
}

async function refresh() {
  const res = await window.api.state();
  if (!res.ok) return;
  state = res.data;
  document.body.dataset.theme = state.settings.theme === 'caro-light' ? 'caro-light' : 'caro-dark';
  applyLanguage(state.settings.language);
  render();
}

// okKey wird erst hier übersetzt, damit die Meldung die aktuelle Sprache trifft
async function action(fn, okKey) {
  const res = await fn();
  if (res.ok) { await refresh(); msg(t(okKey), 'ok'); }
  else msg(tErr(res.error), 'error');
}

window.addEventListener('DOMContentLoaded', () => {
  $('miniIn').addEventListener('click',
    () => action(() => window.api.clockIn($('miniProject').value), 'erf.msgIn'));
  $('miniOut').addEventListener('click', () => action(window.api.clockOut, 'erf.msgOut'));
  $('miniBreak').addEventListener('click', () => {
    const onBreak = state.open && state.open.breaks.some((b) => b.end === null);
    action(onBreak ? window.api.endBreak : window.api.startBreak,
      onBreak ? 'erf.msgBreakEnd' : 'erf.msgBreakStart');
  });
  $('miniProject').addEventListener('change', async () => {
    await window.api.setActiveProject($('miniProject').value);
  });
  $('miniOpen').addEventListener('click', () => window.api.showMainWindow());

  // Änderungen aus dem Hauptfenster übernehmen
  window.api.onDataChanged(refresh);

  refresh();
  setInterval(tick, 1000);
});

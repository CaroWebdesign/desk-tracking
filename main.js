const {
  app, BrowserWindow, ipcMain, dialog, shell, Notification, globalShortcut, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const {
  Store, localDateKey, terminFaellig, terminVerpasst, terminSchluessel,
} = require('./store');
// Texte für Benachrichtigungen und Dialoge. Der Hauptprozess hat kein DOM,
// nutzt aber dieselbe Tabelle wie die Oberfläche – sonst blieben genau diese
// Meldungen für immer deutsch.
const { STRINGS } = require('./src/i18n');

// Kennung der App gegenüber Windows. Aus package.json gelesen, damit sie nicht
// an zwei Stellen gepflegt werden muss und nie auseinanderlaufen kann.
const APP_ID = (() => {
  try {
    return require('./package.json').build.appId;
  } catch (e) {
    return 'de.carowebdesign.stempeluhr';
  }
})();

// Übersetzen im Hauptprozess. Die Sprache steht in den Einstellungen; solange
// der Store noch nicht geladen ist, gilt Deutsch.
function t(key, ...args) {
  const sprache = (() => {
    try {
      return store ? store.getSettings().language : 'de';
    } catch (e) {
      return 'de';
    }
  })();
  const tabelle = STRINGS[sprache] || STRINGS.de;
  const text = tabelle[key] !== undefined ? tabelle[key] : STRINGS.de[key];
  if (text === undefined) return key;
  return text.replace(/\{(\d+)\}/g, (_, i) => (args[i] !== undefined ? args[i] : ''));
}

// Nur eine Instanz zulassen. Zwei parallel laufende Fenster hätten je eine
// eigene Kopie der Daten im Speicher und würden sich beim Speichern
// gegenseitig überschreiben.
if (!app.requestSingleInstanceLock()) {
  // Nach app.quit() läuft das Modul weiter – ohne return würde eine zweite
  // Instanz noch einen Store aufbauen und ein Fenster erzeugen.
  app.quit();
  return;
}

let store;
let mainWindow;
let miniWindow;
let dataDirPath;
let hotkeyAktiv = null; // aktuell registriertes Tastenkürzel
let updateVersion = null;      // Version des gefundenen/geladenen Updates
let updateDownloaded = false;  // erst dann lässt sich „installieren" auslösen

// Verzeichnis für die times.json: „Dokumente\Desk Tracking".
// Bewusst AUSSERHALB des Installationsordners – ein Update (oder eine
// Deinstallation) räumt %LOCALAPPDATA%\Programs\Desk Tracking auf und würde
// eine dort liegende times.json mitnehmen. Unter Dokumente sind die Daten
// sicher, sichtbar und leicht zu sichern.
// STEMPEL_DATA_DIR überschreibt den Ort (für Tests).
function dataDir() {
  if (process.env.STEMPEL_DATA_DIR) {
    fs.mkdirSync(process.env.STEMPEL_DATA_DIR, { recursive: true });
    return process.env.STEMPEL_DATA_DIR;
  }
  const target = path.join(app.getPath('documents'), 'Desk Tracking');
  fs.mkdirSync(target, { recursive: true });
  migrateData(target);
  return target;
}

// Einmaliger Umzug der Daten aus früheren Speicherorten nach Dokumente.
// Läuft nur, wenn am Zielort noch KEINE times.json liegt – bestehende Daten
// werden also niemals überschrieben. Es wird kopiert, nie verschoben: die
// Quelldatei bleibt liegen, zusätzlich landet im Zielordner eine unveränderte
// Kopie als `times.uebernommen-<Datum>.json`. Selbst ein Abbruch mitten im
// Umzug kann damit keine Zeiten kosten.
function migrateData(target) {
  const targetFile = path.join(target, 'times.json');
  if (fs.existsSync(targetFile)) return;

  const legacyDirs = [
    // Bis Version 1.6 hieß die App „Stempeluhr" und legte ihre Daten dort ab.
    // Diese Quelle steht zuerst: sie enthält den aktuellsten Stand.
    path.join(app.getPath('documents'), 'Stempeluhr'),
    process.env.PORTABLE_EXECUTABLE_DIR,
    app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname,
    app.getPath('userData'),
  ].filter(Boolean);

  for (const dir of legacyDirs) {
    const src = path.join(dir, 'times.json');
    if (path.resolve(dir) === path.resolve(target) || !fs.existsSync(src)) continue;
    const tmp = targetFile + '.tmp';
    try {
      // Erst vollständig daneben schreiben, dann umbenennen: ein Abbruch darf
      // keine halbe times.json am Zielort hinterlassen.
      fs.copyFileSync(src, tmp);
      const stamp = localDateKey(new Date());
      const keep = path.join(target, `times.uebernommen-${stamp}.json`);
      if (!fs.existsSync(keep)) fs.copyFileSync(src, keep);
      fs.renameSync(tmp, targetFile);
      console.log(`[Desk Tracking] Daten übernommen: ${src} -> ${targetFile}`);
      return;
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* egal */ }
      console.error(`[Desk Tracking] Umzug aus ${src} fehlgeschlagen:`, e.message);
      // nächste mögliche Quelle probieren
    }
  }
}

// Farben der Fensterleiste je Design. Windows zeichnet sie selbst, kennt
// unsere CSS-Variablen also nicht – die Werte stehen hier doppelt und müssen
// zu --sidebar und --dim in styles.css passen.
const LEISTE = {
  'caro-dark': { color: '#131b2c', symbolColor: '#8fa0ba' },
  'caro-light': { color: '#ffffff', symbolColor: '#64748b' },
};
const LEISTE_HOEHE = 40;

function leisteFuer(theme) {
  return { ...(LEISTE[theme] || LEISTE['caro-dark']), height: LEISTE_HOEHE };
}

// Die eingefärbte Leiste gibt es nur unter Windows 10 und neuer. Ohne diese
// Unterstützung würden die Fensterknöpfe fehlen und das Fenster ließe sich
// nicht mehr schließen – dann bleibt es beim normalen Systemrahmen.
function eigeneLeisteMoeglich() {
  if (process.platform !== 'win32') return false;
  const haupt = Number(String(require('os').release()).split('.')[0]);
  return haupt >= 10;
}

function createWindow() {
  const theme = store.getSettings().theme;
  const eigeneLeiste = eigeneLeisteMoeglich();
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    title: 'Desk Tracking',
    icon: path.join(__dirname, 'icon.ico'),
    // Eigene Leiste in den App-Farben statt des grauen Windows-Balkens.
    // Die Fensterknöpfe bleiben nativ, damit Verhalten und Größe stimmen.
    ...(eigeneLeiste ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: leisteFuer(theme),
    } : {}),
    backgroundColor: theme === 'caro-light' ? '#f4f6fa' : '#0f1626',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Live-Uhr und laufende Arbeitszeit sollen auch im Hintergrund
      // sekundengenau weiterlaufen, statt gedrosselt zu werden.
      backgroundThrottling: false,
    },
  });
  // Ohne eigene Leiste zeichnet Windows seinen Balken darüber – dann darf die
  // Oberfläche oben keinen Platz dafür freihalten.
  if (!eigeneLeiste) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('systemleiste');
    });
  }
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Beim Minimieren übernimmt das kleine Bedienfeld
  mainWindow.on('minimize', () => { if (store.getSettings().miniEnabled) openMini(); });
  mainWindow.on('restore', closeMini);
  mainWindow.on('focus', closeMini);
  mainWindow.on('closed', () => { closeMini(); mainWindow = null; });
}

// ---- Kleines Bedienfeld ----
// Rahmenloses Fenster über allen anderen, damit sich auch bei minimierter App
// stempeln lässt. Es erscheint nur, solange das Hauptfenster minimiert ist.
const MINI_B = 268;
const MINI_H = 148;

function miniPosition() {
  const bereich = screen.getPrimaryDisplay().workArea;
  const abstand = 16;
  const y = bereich.y + bereich.height - MINI_H - abstand;
  const x = store.getSettings().miniPosition === 'bl'
    ? bereich.x + abstand
    : bereich.x + bereich.width - MINI_B - abstand;
  return { x: Math.round(x), y: Math.round(y) };
}

function openMini() {
  if (miniWindow && !miniWindow.isDestroyed()) { miniWindow.show(); return; }
  const { x, y } = miniPosition();
  miniWindow = new BrowserWindow({
    width: MINI_B,
    height: MINI_H,
    x,
    y,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'Desk Tracking',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  miniWindow.setAlwaysOnTop(true, 'floating');
  miniWindow.loadFile(path.join(__dirname, 'src', 'mini.html'));
  miniWindow.on('closed', () => { miniWindow = null; });
}

function closeMini() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
  miniWindow = null;
}

// Hauptfenster hervorholen (aus dem Mini-Feld oder per Tastenkürzel)
function zeigeHauptfenster() {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return; }
  closeMini();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---- Systemweites Tastenkürzel ----
// Ist das Fenster schon im Vordergrund, minimiert das Kürzel es wieder –
// so lässt sich mit derselben Taste ein- und ausblenden.
function toggleHauptfenster() {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return; }
  if (!mainWindow.isMinimized() && mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.minimize();
  } else {
    zeigeHauptfenster();
  }
}

// Registriert das Kürzel neu. Gibt zurück, ob es geklappt hat – belegte
// Kombinationen (etwa von einem anderen Programm) lassen sich nicht greifen.
function setzeHotkey() {
  if (hotkeyAktiv) {
    globalShortcut.unregister(hotkeyAktiv);
    hotkeyAktiv = null;
  }
  const s = store.getSettings();
  if (!s.hotkeyEnabled || !s.hotkey) return { ok: true };
  // Im Fehlerfall geben wir Ursache und Kürzel getrennt zurück. Die Oberfläche
  // baut daraus eine übersetzte Meldung und schreibt das Kürzel lesbar
  // („Strg + Umschalt + T" statt „Control+Shift+T"). `error` ist nur der
  // deutsche Text fürs Protokoll.
  try {
    const erfolg = globalShortcut.register(s.hotkey, toggleHauptfenster);
    if (!erfolg) {
      return {
        ok: false, grund: 'belegt', hotkey: s.hotkey,
        error: `Das Kürzel „${s.hotkey}" ist von einem anderen Programm belegt.`,
      };
    }
    hotkeyAktiv = s.hotkey;
    return { ok: true };
  } catch (e) {
    return {
      ok: false, grund: 'fehler', hotkey: s.hotkey, detail: e.message,
      error: `Das Kürzel „${s.hotkey}" ließ sich nicht setzen: ${e.message}`,
    };
  }
}

// Beide Fenster über Änderungen an den Daten informieren
function broadcastChanged() {
  for (const w of [mainWindow, miniWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send('data-changed');
  }
}

// ---- Automatische Updates (GitHub Releases) ----
// Die Zeitdaten liegen bewusst NICHT im Programmordner: der NSIS-Uninstaller
// räumt bei jedem Update den kompletten Installationsordner ab (RMDir /r).
// Zusätzlich wird vor jeder Installation eine Sicherung angelegt.
function sendUpdate(info) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-event', info);
  }
}

// Update-Vorgänge in eine Datei im Datenordner schreiben – in der
// installierten App ist die Konsole sonst nicht einsehbar.
function updateLog(text) {
  const line = `[${new Date().toISOString()}] ${text}\n`;
  console.log('[Desk Tracking]', text);
  try {
    if (dataDirPath) fs.appendFileSync(path.join(dataDirPath, 'update.log'), line, 'utf8');
  } catch (e) { /* Logging darf nie den Betrieb stören */ }
}

// Legt eine datierte Kopie der times.json an und behält die letzten acht.
function backupData(reason, always) {
  try {
    const src = path.join(dataDirPath, 'times.json');
    if (!fs.existsSync(src)) return;
    const now = new Date();
    // Ortszeit, nicht UTC – sonst trägt eine Sicherung nachts das Datum von gestern.
    const day = localDateKey(now);
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0')).join('-');
    // Beim Start genügt eine Sicherung pro Tag; vor einem Update wird immer
    // eine eigene mit Uhrzeit angelegt.
    const dest = path.join(dataDirPath,
      always ? `times.backup-${day}_${time}.json` : `times.backup-${day}.json`);
    if (fs.existsSync(dest)) return;
    fs.copyFileSync(src, dest);

    // Die acht jüngsten Sicherungen behalten (Namen sortieren chronologisch)
    const old = fs.readdirSync(dataDirPath)
      .filter((n) => /^times\.backup-\d{4}-\d{2}-\d{2}(_\d{2}-\d{2}-\d{2})?\.json$/.test(n))
      .sort();
    for (const name of old.slice(0, Math.max(0, old.length - 8))) {
      try { fs.unlinkSync(path.join(dataDirPath, name)); } catch (e) { /* weiter aufräumen */ }
    }
    console.log(`[Desk Tracking] Sicherung angelegt (${reason}): ${dest}`);
  } catch (e) {
    console.error('[Desk Tracking] Sicherung fehlgeschlagen:', e.message);
  }
}

// ---- Erinnerungen an Termine ----
// Jede Minute wird geprüft, ob ein Termin ansteht. Gemeldet wird einmal pro
// Termin und Programmlauf; verpasste Termine (älter als das Fenster) bleiben
// still, damit nach einem Neustart nicht alles Vergangene aufpoppt.
const gemeldet = new Set();
let terminTimer = null;

function pruefeTermine() {
  try {
    const s = store.getSettings();
    if (!s.notify) return;
    const jetzt = Date.now();
    for (const e of store.getEvents()) {
      // Der Schlüssel enthält Datum und Uhrzeit: ein verschobener Termin
      // gilt wieder als ungemeldet.
      const key = terminSchluessel(e);
      if (gemeldet.has(key)) continue;
      if (!terminFaellig(e, jetzt, s.notifyBefore)) continue;
      gemeldet.add(key);
      zeigeErinnerung(e, s);
    }
  } catch (err) {
    console.error('[Desk Tracking] Terminprüfung fehlgeschlagen:', err.message);
  }
}

function zeigeErinnerung(e, settings) {
  if (!Notification.isSupported()) return;
  const projekt = e.projectId
    ? (store.getProjects().find((p) => p.id === e.projectId) || {}).name
    : t('ev.other');
  const teile = [];
  if (e.time) {
    teile.push(settings.notifyBefore > 0
      ? t('note.atTimeBefore', e.time, settings.notifyBefore)
      : t('note.atTime', e.time));
  } else teile.push(t('note.today'));
  if (projekt) teile.push(projekt);
  if (e.note) teile.push(e.note.split('\n')[0].slice(0, 120));

  const n = new Notification({
    title: e.title,
    body: teile.join(' · '),
    icon: path.join(__dirname, 'icon.png'),
    silent: false,
  });
  // Klick holt das Fenster nach vorn und öffnet den Tag im Kalender
  n.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-day', e.date);
  });
  n.show();
}

function setupTermine() {
  // Termine, die beim Start schon vorbei sind, gelten als erledigt – sonst
  // würde nach jedem Neustart die ganze Vergangenheit aufpoppen.
  const jetzt = Date.now();
  for (const e of store.getEvents()) {
    if (terminVerpasst(e, jetzt)) gemeldet.add(terminSchluessel(e));
  }
  pruefeTermine();
  terminTimer = setInterval(pruefeTermine, 60000);
}

app.on('before-quit', () => {
  if (terminTimer) clearInterval(terminTimer);
  globalShortcut.unregisterAll();
});

function setupUpdater() {
  autoUpdater.autoDownload = true;          // im Hintergrund laden
  autoUpdater.autoInstallOnAppQuit = true;  // still beim Beenden installieren
  autoUpdater.disableDifferentialDownload = true; // ohne Signatur zuverlässiger

  autoUpdater.logger = { info: updateLog, warn: updateLog, error: updateLog, debug: () => {} };

  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => {
    updateVersion = i.version;
    sendUpdate({ state: 'available', version: i.version });
  });
  // Die vom Server gemeldete Version mitschicken. Steht dort etwas anderes als
  // erwartet, ist der Fehler damit sofort sichtbar – ohne diese Angabe sieht
  // „du hast die neueste Version" bei falsch konfiguriertem Repository genauso
  // aus wie bei wirklich aktueller Installation.
  autoUpdater.on('update-not-available', (i) => {
    updateLog(`Keine neuere Version. Server meldet: ${i && i.version ? i.version : 'unbekannt'}`
      + `, installiert: ${app.getVersion()}`);
    sendUpdate({ state: 'not-available', version: i ? i.version : null });
  });
  autoUpdater.on('download-progress', (p) => sendUpdate({
    state: 'downloading', percent: p.percent, version: updateVersion,
  }));
  autoUpdater.on('update-downloaded', (i) => {
    updateVersion = i.version;
    updateDownloaded = true;
    backupData('vor Update ' + i.version, true);
    sendUpdate({ state: 'downloaded', version: i.version });
  });
  autoUpdater.on('error', (err) => {
    updateLog('Update-Fehler: ' + (err ? (err.stack || err.message) : 'unbekannt'));
    sendUpdate({ state: 'error', message: err ? err.message : 'unbekannter Fehler' });
  });

  if (app.isPackaged) {
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4000);
  }
}

app.whenReady().then(() => {
  // Windows schreibt über jede Benachrichtigung den Namen der App, die sie
  // geschickt hat. Erkannt wird sie an der „AppUserModelID"; ohne diese Zeile
  // nimmt Electron den Behelfswert „electron.app.<Name>" – und genau der stand
  // dann in der Kopfzeile. Die Kennung muss zu build.appId passen, denn der
  // Installer hinterlegt sie so in der Startmenü-Verknüpfung. Nur wenn beide
  // übereinstimmen, zeigt Windows deren Namen („Desk Tracking").
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

  // Der Datenumzug muss VOR jeder Update-Prüfung laufen.
  dataDirPath = dataDir();
  store = new Store(dataDirPath);

  // Datei vorhanden, aber nicht lesbar: lieber gar nicht starten, als mit
  // einem leeren Datensatz die vorhandenen Zeiten zu überschreiben.
  if (store.loadError) {
    dialog.showErrorBox('Desk Tracking – Daten nicht lesbar',
      `Die Datei\n${path.join(dataDirPath, 'times.json')}\n\nkonnte nicht gelesen werden:\n`
      + `${store.loadError.message}\n\n`
      + 'Zur Sicherheit wurde nichts gespeichert und nichts verändert. '
      + 'Im selben Ordner liegen Sicherungen („times.backup-….json"). '
      + 'Benenne eine davon in „times.json" um, um sie zu verwenden.');
    shell.openPath(dataDirPath);
    app.quit();
    return;
  }

  backupData('Programmstart');
  createWindow();
  setupUpdater();
  setupTermine();  // Ein belegtes Kürzel muss sichtbar werden – sonst hält der Nutzer es
  // für aktiv, obwohl es ins Leere geht.
  const hk = setzeHotkey();
  if (!hk.ok) {
    updateLog(hk.error);
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('startup-warning', {
        grund: hk.grund, hotkey: hk.hotkey, detail: hk.detail, error: hk.error,
      });
    });
  }


  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((e) => {
  dialog.showErrorBox('Desk Tracking – Start fehlgeschlagen',
    `Desk Tracking konnte nicht starten:\n\n${e && e.message ? e.message : e}\n\n`
    + 'Häufigste Ursache: der Ordner „Dokumente" ist nicht erreichbar.');
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Macht aus einem Vorschlagsnamen (z. B. Projektname) einen gültigen Dateinamen.
// Verhindert, dass Zeichen wie \ / : * ? " < > | aus dem Renderer einen Pfad
// erzeugen oder den Speichern-Dialog abstürzen lassen.
function safeFileName(name, ext = 'csv') {
  if (!name) return '';
  const bad = '\\/:*?"<>|';
  const clean = String(name)
    .split('')
    .map((ch) => (bad.indexOf(ch) >= 0 || ch.charCodeAt(0) < 32 ? '-' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120);
  if (!clean) return '';
  const suffix = '.' + ext;
  const base = clean.toLowerCase().endsWith(suffix) ? clean.slice(0, -suffix.length) : clean;
  // Reservierte Gerätenamen: „nul.csv" ließe sich scheinbar speichern,
  // die Datei existiert danach aber nicht.
  const safe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base.trim()) ? '_' + base : base;
  return safe + suffix;
}

// ---- IPC: wrappt die Datenschicht und gibt Erfolg/Fehler zurück ----
function wrap(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Wie wrap, informiert nach erfolgreicher Änderung aber beide Fenster –
// sonst zeigt das Mini-Bedienfeld einen veralteten Stand.
function mutate(fn) {
  const res = wrap(fn);
  if (res.ok) broadcastChanged();
  return res;
}

ipcMain.handle('state', () => wrap(() => ({
  open: store.getOpenSession(),
  sessions: store.getAll(),
  projects: store.getProjects(),
  events: store.getEvents(),
  logs: store.getLogs(),
  settings: store.getSettings(),
})));
ipcMain.handle('addEvent', (_e, entry) => mutate(() => store.addEvent(entry)));
ipcMain.handle('updateEvent', (_e, id, patch) => mutate(() => store.updateEvent(id, patch)));
ipcMain.handle('deleteEvent', (_e, id) => mutate(() => store.deleteEvent(id)));
ipcMain.handle('clockIn', (_e, projectId) => mutate(() => store.clockIn(projectId)));
ipcMain.handle('addProject', (_e, name, rate) => mutate(() => store.addProject(name, rate)));
ipcMain.handle('updateProject', (_e, id, patch) => mutate(() => store.updateProject(id, patch)));
ipcMain.handle('closeProject', (_e, id) => mutate(() => store.closeProject(id)));
ipcMain.handle('reopenProject', (_e, id) => mutate(() => store.reopenProject(id)));
ipcMain.handle('deleteProject', (_e, id, reassignTo) => mutate(() => store.deleteProject(id, reassignTo)));
ipcMain.handle('setActiveProject', (_e, id) => mutate(() => store.setActiveProject(id)));
ipcMain.handle('updateSessionProject', (_e, id, projectId) => mutate(() => store.updateSessionProject(id, projectId)));
ipcMain.handle('clockOut', () => mutate(() => store.clockOut()));
ipcMain.handle('startBreak', () => mutate(() => store.startBreak()));
ipcMain.handle('endBreak', () => mutate(() => store.endBreak()));
ipcMain.handle('addManual', (_e, entry) => mutate(() => store.addManual(entry)));
ipcMain.handle('updateSessionTimes', (_e, id, ci, co, date) => mutate(() => store.updateSessionTimes(id, ci, co, date)));
ipcMain.handle('addBreak', (_e, id, s, en) => mutate(() => store.addBreak(id, s, en)));
ipcMain.handle('updateBreak', (_e, id, i, s, en) => mutate(() => store.updateBreak(id, i, s, en)));
ipcMain.handle('deleteBreak', (_e, id, i) => mutate(() => store.deleteBreak(id, i)));
ipcMain.handle('updateSettings', (_e, patch) => mutate(() => {
  const settings = store.updateSettings(patch);
  // Die Fensterleiste zeichnet Windows, nicht die Oberfläche – beim
  // Designwechsel muss sie hier nachgezogen werden.
  if (patch && patch.theme !== undefined && mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setTitleBarOverlay(leisteFuer(settings.theme));
    } catch (e) {
      // Ältere Windows-Versionen kennen das Overlay nicht; die Leiste bleibt
      // dann in der Startfarbe. Kein Grund, das Speichern scheitern zu lassen.
      updateLog('Fensterleiste nicht umgefärbt: ' + e.message);
    }
  }
  return settings;
}));
ipcMain.handle('clearLogs', () => mutate(() => { store.clearLogs(); return true; }));
ipcMain.handle('deleteSession', (_e, id) => mutate(() => {
  store.deleteSession(id);
  return true;
}));

// Update-Prüfung aus den Einstellungen anstoßen
ipcMain.handle('checkForUpdate', () => {
  if (!app.isPackaged) { sendUpdate({ state: 'dev' }); return { ok: true }; }
  // Sofort in den Suchzustand gehen. Käme gar keine Prüfung zustande, stünde
  // sonst weiter das Ergebnis der vorigen dort – der Knopf sähe wirkungslos
  // aus und man hielte einen alten Stand für den aktuellen.
  sendUpdate({ state: 'checking' });
  updateLog('Update-Prüfung angefordert (installiert: ' + app.getVersion() + ')');
  autoUpdater.checkForUpdates().then((ergebnis) => {
    // null bedeutet: electron-updater hat gar nicht geprüft (etwa weil die App
    // nicht als Installation läuft). Ohne Hinweis bliebe die Anzeige hängen.
    if (!ergebnis) {
      updateLog('Prüfung nicht ausgeführt – kein Ergebnis von electron-updater');
      sendUpdate({ state: 'error', message: 'Die Prüfung ließ sich nicht starten.' });
    }
  }).catch((e) => {
    updateLog('Update-Prüfung fehlgeschlagen: ' + (e ? (e.stack || e.message) : 'unbekannt'));
    sendUpdate({ state: 'error', message: e ? e.message : 'unbekannter Fehler' });
  });
  return { ok: true };
});

// Geladenes Update sofort installieren (still, App startet danach neu)
ipcMain.handle('installUpdate', () => {
  if (!updateDownloaded) return { ok: false, error: 'Es ist kein Update bereit.' };
  backupData('vor Neustart zur Installation', true);
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      updateLog('quitAndInstall fehlgeschlagen: ' + e.message);
      sendUpdate({ state: 'error', message: e.message });
    }
  });
  return { ok: true };
});

// Hauptfenster aus dem Mini-Bedienfeld hervorholen
ipcMain.handle('showMainWindow', () => wrap(() => { zeigeHauptfenster(); return true; }));

// Tastenkürzel nach einer Änderung neu setzen
ipcMain.handle('applyHotkey', () => setzeHotkey());

// Mini-Bedienfeld zur Vorschau zeigen (Knopf in den Einstellungen).
// Prüft die gespeicherte Einstellung – sonst würde sich das Fenster
// minimieren, ohne dass das Bedienfeld erscheint.
ipcMain.handle('previewMini', () => {
  if (!store.getSettings().miniEnabled) {
    return { ok: false, error: 'Das Mini-Bedienfeld ist ausgeschaltet – erst einschalten und speichern.' };
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  return { ok: true };
});

// Während der Tastenaufnahme darf das eigene Kürzel nicht dazwischenfunken
ipcMain.handle('suspendHotkey', () => wrap(() => {
  if (hotkeyAktiv) { globalShortcut.unregister(hotkeyAktiv); hotkeyAktiv = null; }
  return true;
}));

// Testbenachrichtigung aus den Einstellungen
ipcMain.handle('testNotification', () => {
  if (!Notification.isSupported()) {
    return { ok: false, error: 'Dieses System unterstützt keine Benachrichtigungen.' };
  }
  // Titel wie bei einer echten Erinnerung: dort steht der Termin, nicht der
  // Programmname – den schreibt Windows selbst über die Meldung.
  new Notification({
    title: t('note.testTitle'),
    body: t('note.testBody'),
    icon: path.join(__dirname, 'icon.png'),
  }).show();
  return { ok: true };
});

// Speicherort der Daten (für die Anzeige in den Einstellungen)
ipcMain.handle('dataInfo', () => wrap(() => ({
  dir: dataDirPath,
  file: path.join(dataDirPath, 'times.json'),
  version: app.getVersion(),
})));
ipcMain.handle('openDataFolder', () => wrap(() => { shell.openPath(dataDirPath); return true; }));

// PDF direkt erzeugen, statt über den Windows-Druckdialog zu gehen.
// window.print() setzt einen installierten Drucker voraus und tut sonst nichts;
// printToPDF funktioniert immer und nutzt dasselbe Druck-Layout (@media print).
ipcMain.handle('exportPdf', async (_e, defaultName) => {
  const fallback = `desk-tracking-${new Date().toISOString().slice(0, 10)}.pdf`;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Als PDF speichern',
    defaultPath: safeFileName(defaultName, 'pdf') || fallback,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, error: 'Abgebrochen' };
  try {
    const data = await mainWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: false,
      margins: { top: 1, bottom: 1, left: 1, right: 1 },
    });
    fs.writeFileSync(res.filePath, data);
    return { ok: true, data: res.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Erzeugtes PDF im Standardprogramm öffnen
ipcMain.handle('openPath', (_e, target) => wrap(() => {
  shell.openPath(String(target));
  return true;
}));

// Datei im Explorer zeigen und dabei markieren
ipcMain.handle('showInFolder', (_e, target) => wrap(() => {
  shell.showItemInFolder(String(target));
  return true;
}));

ipcMain.handle('exportCsv', async (_e, csv, defaultName) => {
  const fallback = `desk-tracking-export-${new Date().toISOString().slice(0, 10)}.csv`;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export als CSV',
    defaultPath: safeFileName(defaultName) || fallback,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, error: 'Abgebrochen' };
  try {
    // BOM voranstellen, damit Excel Umlaute korrekt erkennt
    fs.writeFileSync(res.filePath, '\uFEFF' + csv, 'utf8');
    return { ok: true, data: res.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

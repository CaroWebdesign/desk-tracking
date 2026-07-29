const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { Store, localDateKey } = require('./store');

// Nur eine Instanz zulassen. Zwei parallel laufende Fenster hätten je eine
// eigene Kopie der Daten im Speicher und würden sich beim Speichern
// gegenseitig überschreiben.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let store;
let mainWindow;
let dataDirPath;
let updateVersion = null;      // Version des gefundenen/geladenen Updates
let updateDownloaded = false;  // erst dann lässt sich „installieren" auslösen

// Verzeichnis für die times.json: „Dokumente\Stempeluhr".
// Bewusst AUSSERHALB des Installationsordners – ein Update (oder eine
// Deinstallation) räumt %LOCALAPPDATA%\Programs\Stempeluhr auf und würde eine
// dort liegende times.json mitnehmen. Unter Dokumente sind die Daten sicher,
// sichtbar und leicht zu sichern.
// STEMPEL_DATA_DIR überschreibt den Ort (für Tests).
function dataDir() {
  if (process.env.STEMPEL_DATA_DIR) {
    fs.mkdirSync(process.env.STEMPEL_DATA_DIR, { recursive: true });
    return process.env.STEMPEL_DATA_DIR;
  }
  const target = path.join(app.getPath('documents'), 'Stempeluhr');
  fs.mkdirSync(target, { recursive: true });
  migrateData(target);
  return target;
}

// Einmaliger Umzug der Daten aus früheren Speicherorten nach Dokumente.
// Läuft nur, wenn am Zielort noch KEINE times.json liegt – bestehende Daten
// werden also niemals überschrieben. Zusätzlich wird im Zielordner eine
// unveränderte Kopie abgelegt (der alte Ordner ist beim nächsten Update weg).
function migrateData(target) {
  const targetFile = path.join(target, 'times.json');
  if (fs.existsSync(targetFile)) return;

  const legacyDirs = [
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
      console.log(`[Stempeluhr] Daten übernommen: ${src} -> ${targetFile}`);
      return;
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* egal */ }
      console.error(`[Stempeluhr] Umzug aus ${src} fehlgeschlagen:`, e.message);
      // nächste mögliche Quelle probieren
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: 'Stempeluhr',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#1e293b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Live-Uhr und laufende Arbeitszeit sollen auch im Hintergrund
      // sekundengenau weiterlaufen, statt gedrosselt zu werden.
      backgroundThrottling: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
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
  console.log('[Stempeluhr]', text);
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
    console.log(`[Stempeluhr] Sicherung angelegt (${reason}): ${dest}`);
  } catch (e) {
    console.error('[Stempeluhr] Sicherung fehlgeschlagen:', e.message);
  }
}

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
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'not-available' }));
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
  // Der Datenumzug muss VOR jeder Update-Prüfung laufen.
  dataDirPath = dataDir();
  store = new Store(dataDirPath);

  // Datei vorhanden, aber nicht lesbar: lieber gar nicht starten, als mit
  // einem leeren Datensatz die vorhandenen Zeiten zu überschreiben.
  if (store.loadError) {
    dialog.showErrorBox('Stempeluhr – Daten nicht lesbar',
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
  dialog.showErrorBox('Stempeluhr – Start fehlgeschlagen',
    `Die Stempeluhr konnte nicht starten:\n\n${e && e.message ? e.message : e}\n\n`
    + 'Häufigste Ursache: der Ordner „Dokumente" ist nicht erreichbar.');
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Macht aus einem Vorschlagsnamen (z. B. Projektname) einen gültigen Dateinamen.
// Verhindert, dass Zeichen wie \ / : * ? " < > | aus dem Renderer einen Pfad
// erzeugen oder den Speichern-Dialog abstürzen lassen.
function safeFileName(name) {
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
  const base = clean.toLowerCase().endsWith('.csv') ? clean.slice(0, -4) : clean;
  // Reservierte Gerätenamen: „nul.csv" ließe sich scheinbar speichern,
  // die Datei existiert danach aber nicht.
  const safe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base.trim()) ? '_' + base : base;
  return safe + '.csv';
}

// ---- IPC: wrappt die Datenschicht und gibt Erfolg/Fehler zurück ----
function wrap(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

ipcMain.handle('state', () => wrap(() => ({
  open: store.getOpenSession(),
  sessions: store.getAll(),
  projects: store.getProjects(),
  logs: store.getLogs(),
  settings: store.getSettings(),
})));
ipcMain.handle('clockIn', (_e, projectId) => wrap(() => store.clockIn(projectId)));
ipcMain.handle('addProject', (_e, name, rate) => wrap(() => store.addProject(name, rate)));
ipcMain.handle('updateProject', (_e, id, patch) => wrap(() => store.updateProject(id, patch)));
ipcMain.handle('closeProject', (_e, id) => wrap(() => store.closeProject(id)));
ipcMain.handle('reopenProject', (_e, id) => wrap(() => store.reopenProject(id)));
ipcMain.handle('deleteProject', (_e, id, reassignTo) => wrap(() => store.deleteProject(id, reassignTo)));
ipcMain.handle('setActiveProject', (_e, id) => wrap(() => store.setActiveProject(id)));
ipcMain.handle('updateSessionProject', (_e, id, projectId) => wrap(() => store.updateSessionProject(id, projectId)));
ipcMain.handle('clockOut', () => wrap(() => store.clockOut()));
ipcMain.handle('startBreak', () => wrap(() => store.startBreak()));
ipcMain.handle('endBreak', () => wrap(() => store.endBreak()));
ipcMain.handle('addManual', (_e, entry) => wrap(() => store.addManual(entry)));
ipcMain.handle('updateSessionTimes', (_e, id, ci, co, date) => wrap(() => store.updateSessionTimes(id, ci, co, date)));
ipcMain.handle('addBreak', (_e, id, s, en) => wrap(() => store.addBreak(id, s, en)));
ipcMain.handle('updateBreak', (_e, id, i, s, en) => wrap(() => store.updateBreak(id, i, s, en)));
ipcMain.handle('deleteBreak', (_e, id, i) => wrap(() => store.deleteBreak(id, i)));
ipcMain.handle('updateSettings', (_e, patch) => wrap(() => store.updateSettings(patch)));
ipcMain.handle('clearLogs', () => wrap(() => { store.clearLogs(); return true; }));
ipcMain.handle('deleteSession', (_e, id) => wrap(() => {
  store.deleteSession(id);
  return true;
}));

// Update-Prüfung aus den Einstellungen anstoßen
ipcMain.handle('checkForUpdate', () => {
  if (!app.isPackaged) { sendUpdate({ state: 'dev' }); return { ok: true }; }
  autoUpdater.checkForUpdates().catch((e) => {
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

// Speicherort der Daten (für die Anzeige in den Einstellungen)
ipcMain.handle('dataInfo', () => wrap(() => ({
  dir: dataDirPath,
  file: path.join(dataDirPath, 'times.json'),
  version: app.getVersion(),
})));
ipcMain.handle('openDataFolder', () => wrap(() => { shell.openPath(dataDirPath); return true; }));

ipcMain.handle('exportCsv', async (_e, csv, defaultName) => {
  const fallback = `stempeluhr-export-${new Date().toISOString().slice(0, 10)}.csv`;
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

// Schneller Logiktest der Datenschicht – ohne Electron/GUI.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { Store } = require('./store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test-'));
const store = new Store(dir);

// 1) Kommen
const s = store.clockIn();
assert.ok(s.clockOut === null, 'Sitzung ist offen');
assert.ok(store.getOpenSession(), 'offene Sitzung gefunden');

// 2) Doppeltes Kommen -> Fehler
assert.throws(() => store.clockIn(), /bereits eine offene/, 'kein doppeltes Einstempeln');

// 3) Pause start/ende
store.startBreak();
assert.throws(() => store.startBreak(), /bereits eine Pause/, 'keine doppelte Pause');
store.endBreak();
assert.strictEqual(s.breaks.length, 1, 'eine Pause erfasst');
assert.ok(s.breaks[0].end, 'Pause beendet');

// 4) Gehen beendet laufende Pause automatisch
store.startBreak();
store.clockOut();
assert.ok(s.clockOut, 'Sitzung beendet');
assert.ok(s.breaks[1].end, 'laufende Pause beim Gehen mitbeendet');
assert.ok(!store.getOpenSession(), 'keine offene Sitzung mehr');

// 5) Persistenz: neu laden
const store2 = new Store(dir);
assert.strictEqual(store2.getAll().length, 1, 'Sitzung wurde gespeichert/geladen');

// 6) Löschen
store2.deleteSession(s.id);
assert.strictEqual(store2.getAll().length, 0, 'Sitzung gelöscht');

// 7) Fehler ohne offene Sitzung
assert.throws(() => store2.clockOut(), /Keine offene/, 'Gehen ohne Kommen -> Fehler');
assert.throws(() => store2.startBreak(), /Keine offene/, 'Pause ohne Kommen -> Fehler');

// 8) Zeit nachtragen (mit Pause)
const m = store2.addManual({
  date: '2026-05-20', clockIn: '08:00', clockOut: '16:30',
  breaks: [{ start: '12:00', end: '12:45' }],
});
assert.strictEqual(m.date, '2026-05-20', 'Datum übernommen');
assert.ok(m.clockOut, 'Eintrag abgeschlossen');
assert.strictEqual(m.breaks.length, 1, 'eine Pause nachgetragen');
// Brutto 08:00–16:30 = 8,5 h; Pause 45 min; Netto soll 7:45 sein
const gross = new Date(m.clockOut) - new Date(m.clockIn);
const brk = new Date(m.breaks[0].end) - new Date(m.breaks[0].start);
assert.strictEqual(gross - brk, 7 * 3600000 + 45 * 60000, 'Netto = 7:45');
assert.strictEqual(store2.getAll().length, 1, 'Eintrag gespeichert');

// 9) Validierung
assert.throws(() => store2.addManual({ date: '2026-05-20', clockIn: '10:00', clockOut: '09:00' }),
  /nach .Kommen/, 'Gehen vor Kommen -> Fehler');
assert.throws(() => store2.addManual({ date: '2026-05-20', clockIn: '08:00', clockOut: '16:00',
  breaks: [{ start: '07:00', end: '07:30' }] }), /zwischen Kommen und Gehen/, 'Pause außerhalb -> Fehler');
assert.throws(() => store2.addManual({ date: '2026-05-20', clockIn: '', clockOut: '16:00' }),
  /ausfüllen/, 'fehlende Zeit -> Fehler');

// 10) Block-Zeiten bearbeiten
store2.updateSessionTimes(m.id, '08:30', '17:00');
assert.strictEqual(new Date(m.clockIn).getHours(), 8, 'Kommen aktualisiert');
assert.strictEqual(new Date(m.clockIn).getMinutes(), 30, 'Kommen-Minute aktualisiert');
assert.throws(() => store2.updateSessionTimes(m.id, '18:00', '17:00'), /nach .Kommen/, 'Gehen vor Kommen -> Fehler');

// 11) Pausen-CRUD
store2.addBreak(m.id, '10:00', '10:15');
assert.strictEqual(m.breaks.length, 2, 'Pause hinzugefügt (jetzt 2)');
// nach Sortierung ist 10:00 die erste Pause
assert.strictEqual(new Date(m.breaks[0].start).getHours(), 10, 'Pausen sortiert');
store2.updateBreak(m.id, 0, '10:00', '10:30');
assert.strictEqual(new Date(m.breaks[0].end).getMinutes(), 30, 'Pause bearbeitet');
assert.throws(() => store2.addBreak(m.id, '07:00', '07:30'), /zwischen Kommen und Gehen/, 'Pause außerhalb -> Fehler');
store2.deleteBreak(m.id, 0);
assert.strictEqual(m.breaks.length, 1, 'Pause gelöscht');

// 12) Einstellungen
const st = store2.updateSettings({ targetHoursPerDay: 7.5, roundingMinutes: 15 });
assert.strictEqual(st.targetHoursPerDay, 7.5, 'Soll-Stunden gesetzt');
assert.strictEqual(st.targetDaysPerWeek, 5, 'Default für Arbeitstage bleibt');
const store3 = new Store(dir);
assert.strictEqual(store3.getSettings().roundingMinutes, 15, 'Einstellungen persistiert');

// 13) Logging: jede Änderung erzeugt einen Eintrag
assert.ok(store3.getLogs().length >= 8, 'Änderungen wurden protokolliert');
const actions = store3.getLogs().map((l) => l.action);
assert.ok(actions.includes('Block bearbeitet'), 'Block-Bearbeitung geloggt');
assert.ok(actions.includes('Pause hinzugefügt'), 'Pause-Hinzufügen geloggt');
assert.ok(actions.includes('Einstellungen geändert'), 'Settings-Änderung geloggt');

// 14) Projekte: Default „Allgemein" vorhanden, Altsession zugeordnet
const projs = store3.getProjects();
const def = projs.find((p) => p.name === 'Allgemein');
assert.ok(def, 'Default-Projekt „Allgemein" existiert');
assert.strictEqual(store3.getAll()[0].projectId, def.id, 'Altsession dem Default-Projekt zugeordnet');

// 15) Projekt anlegen + Validierung
const pA = store3.addProject('Website Müller');
assert.ok(pA.id, 'Projekt angelegt');
assert.throws(() => store3.addProject('   '), /Projektnamen/, 'leerer Name -> Fehler');
assert.throws(() => store3.addProject('website müller'), /bereits ein Projekt/, 'doppelter Name -> Fehler');

// 16) Aktives Projekt -> neue Stempelung übernimmt es
store3.setActiveProject(pA.id);
const s2 = store3.clockIn();
assert.strictEqual(s2.projectId, pA.id, 'clockIn nutzt aktives Projekt');
store3.clockOut();

// 17) Explizites Projekt bei addManual
const pB = store3.addProject('Projekt B');
const s3 = store3.addManual({ date: '2026-05-21', clockIn: '09:00', clockOut: '10:00', projectId: pB.id });
assert.strictEqual(s3.projectId, pB.id, 'addManual übernimmt projectId');

// 18) Block umbuchen
store3.updateSessionProject(s3.id, pA.id);
assert.strictEqual(store3._find(s3.id).projectId, pA.id, 'Block umgebucht');

// 19) Projekt mit Einträgen: Löschen nur mit Umbuchung
assert.throws(() => store3.deleteProject(pA.id), /umbuchen|Eintrag/, 'Löschen mit Einträgen -> Fehler');
store3.deleteProject(pA.id, def.id);
assert.ok(!store3.getProjects().some((p) => p.id === pA.id), 'Projekt gelöscht');
assert.strictEqual(store3._find(s3.id).projectId, def.id, 'Einträge auf Default umgebucht');

// 20) Letztes Projekt ist geschützt
store3.deleteProject(pB.id, def.id);
assert.throws(() => store3.deleteProject(def.id), /letzte Projekt/, 'letztes Projekt nicht löschbar');

// 21) Projekt-Logs persistiert
const store4 = new Store(dir);
assert.ok(store4.getProjects().some((p) => p.name === 'Allgemein'), 'Projekte persistiert');
assert.ok(store4.getLogs().map((l) => l.action).includes('Projekt angelegt'), 'Projekt-Anlegen geloggt');

// 22) Stundensatz: anlegen, ändern, Validierung
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test2-'));
const ps = new Store(dir2);
const proj = ps.addProject('Kunde A', 40);
assert.strictEqual(proj.rate, 40, 'Stundensatz gesetzt');
assert.strictEqual(proj.closed, false, 'neues Projekt ist offen');
assert.throws(() => ps.addProject('Kunde B', -5), /Stundensatz/, 'negativer Satz -> Fehler');
ps.updateProject(proj.id, { rate: 50, name: 'Kunde A GmbH' });
const upd = ps.getProjects().find((p) => p.id === proj.id);
assert.strictEqual(upd.rate, 50, 'Satz geändert');
assert.strictEqual(upd.name, 'Kunde A GmbH', 'Name geändert');

// 23) Betrag-Logik: 2 h × 50 €/h = 100 €
const ws = ps.addManual({ date: '2026-05-22', clockIn: '08:00', clockOut: '10:00', projectId: proj.id });
const hours = (new Date(ws.clockOut) - new Date(ws.clockIn)) / 3600000;
assert.strictEqual(hours * upd.rate, 100, 'Betrag 2 h × 50 € = 100 €');

// 24) Abschließen: kein clockIn mehr, aktives Projekt wechselt weg
ps.setActiveProject(proj.id);
ps.closeProject(proj.id);
assert.strictEqual(ps.getProjects().find((p) => p.id === proj.id).closed, true, 'Projekt abgeschlossen');
assert.notStrictEqual(ps.getSettings().activeProjectId, proj.id, 'aktives Projekt vom abgeschlossenen weggewechselt');
assert.throws(() => ps.clockIn(proj.id), /abgeschlossen/, 'clockIn auf abgeschlossenes Projekt -> Fehler');

// 25) Wieder öffnen -> erneut buchbar
ps.reopenProject(proj.id);
assert.strictEqual(ps.getProjects().find((p) => p.id === proj.id).closed, false, 'Projekt wieder geöffnet');
const reopened = ps.clockIn(proj.id);
assert.strictEqual(reopened.projectId, proj.id, 'nach Öffnen wieder buchbar');
ps.clockOut();
fs.rmSync(dir2, { recursive: true, force: true });

// 26) Block auf einen anderen Tag verschieben – Pausen wandern mit
const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test3-'));
const ds = new Store(dir3);
const mv = ds.addManual({
  date: '2026-06-10', clockIn: '09:00', clockOut: '17:00',
  breaks: [{ start: '12:00', end: '12:30' }],
});
const netBefore = new Date(mv.clockOut) - new Date(mv.clockIn)
  - (new Date(mv.breaks[0].end) - new Date(mv.breaks[0].start));

ds.updateSessionTimes(mv.id, '09:00', '17:00', '2026-06-11');
assert.strictEqual(mv.date, '2026-06-11', 'Datum verschoben');
assert.strictEqual(new Date(mv.clockIn).getDate(), 11, 'Kommen auf neuem Tag');
assert.strictEqual(new Date(mv.clockOut).getDate(), 11, 'Gehen auf neuem Tag');
assert.strictEqual(new Date(mv.breaks[0].start).getDate(), 11, 'Pausenbeginn mitverschoben');
assert.strictEqual(new Date(mv.breaks[0].end).getDate(), 11, 'Pausenende mitverschoben');
assert.strictEqual(new Date(mv.breaks[0].start).getHours(), 12, 'Pausen-Uhrzeit unverändert');
const netAfter = new Date(mv.clockOut) - new Date(mv.clockIn)
  - (new Date(mv.breaks[0].end) - new Date(mv.breaks[0].start));
assert.strictEqual(netAfter, netBefore, 'Netto-Zeit durch das Verschieben unverändert');

// 27) Datum + Uhrzeiten gleichzeitig ändern
ds.updateSessionTimes(mv.id, '08:00', '16:00', '2026-07-01');
assert.strictEqual(mv.date, '2026-07-01', 'Datum erneut verschoben');
assert.strictEqual(new Date(mv.clockIn).getHours(), 8, 'Kommen mitgeändert');
assert.strictEqual(new Date(mv.breaks[0].start).getMonth(), 6, 'Pause im neuen Monat'); // Juli

// 28) Ohne Datum bleibt der Tag stehen (Rückwärtskompatibilität)
ds.updateSessionTimes(mv.id, '08:30', '16:30');
assert.strictEqual(mv.date, '2026-07-01', 'ohne date-Argument bleibt der Tag');

// 29) Ungültige Datumsangaben werden abgelehnt
assert.throws(() => ds.updateSessionTimes(mv.id, '08:00', '16:00', '2026-02-31'),
  /gültiges Datum/, 'Kalender-Unfug -> Fehler');
assert.throws(() => ds.updateSessionTimes(mv.id, '08:00', '16:00', '01.07.2026'),
  /gültiges Datum/, 'falsches Format -> Fehler');
assert.throws(() => ds.addManual({ date: '2026-13-01', clockIn: '08:00', clockOut: '09:00' }),
  /gültiges Datum/, 'ungültiger Monat beim Nachtragen -> Fehler');

// 30) Pause außerhalb der neuen Zeiten -> Fehler, Daten bleiben unverändert
const dateBefore = mv.date, inBefore = mv.clockIn;
assert.throws(() => ds.updateSessionTimes(mv.id, '13:00', '16:30', '2026-07-02'),
  /Pause liegt außerhalb/, 'Pause außerhalb -> Fehler');
assert.strictEqual(mv.date, dateBefore, 'Datum nach Fehler unverändert');
assert.strictEqual(mv.clockIn, inBefore, 'Kommen nach Fehler unverändert');

// 31) Laufende Sitzung lässt sich nicht auf ein anderes Datum schieben
const run = ds.clockIn();
assert.throws(() => ds.updateSessionTimes(run.id, '08:00', '', '2026-06-01'),
  /laufende Sitzung/, 'laufende Sitzung nicht verschiebbar');
ds.clockOut();

// 32) Verschieben wird protokolliert
assert.ok(ds.getLogs().some((l) => l.action === 'Block bearbeitet' && /2026-06-10.*2026-06-11/.test(l.detail || '')),
  'Verschieben mit altem und neuem Datum protokolliert');

// 33) Verschieben erhält Pausen-Sekunden (sonst ändert sich die Netto-Zeit)
const sec = ds.addManual({ date: '2026-06-20', clockIn: '09:00', clockOut: '17:00' });
sec.breaks.push({
  start: new Date(2026, 5, 20, 12, 0, 17).toISOString(),
  end: new Date(2026, 5, 20, 12, 30, 49).toISOString(),
});
const pauseVorher = new Date(sec.breaks[0].end) - new Date(sec.breaks[0].start);
ds.updateSessionTimes(sec.id, '09:00', '17:00', '2026-06-21');
const pauseNachher = new Date(sec.breaks[0].end) - new Date(sec.breaks[0].start);
assert.strictEqual(pauseNachher, pauseVorher, 'Pausendauer inkl. Sekunden bleibt beim Verschieben gleich');
assert.strictEqual(new Date(sec.breaks[0].start).getSeconds(), 17, 'Sekunden der Pause erhalten');

// 34) Uhrzeit, die es wegen der Zeitumstellung nicht gibt, wird abgelehnt
// (Europe/Berlin: in der Nacht zum 29.03.2026 fehlt die Stunde 02:00–03:00)
const tzBerlin = (() => {
  const probe = new Date(2026, 2, 29, 2, 30, 0);
  return probe.getHours() !== 2; // nur dann greift die Prüfung
})();
if (tzBerlin) {
  assert.throws(() => ds.updateSessionTimes(sec.id, '02:30', '05:00', '2026-03-29'),
    /Zeitumstellung/, 'nicht existierende Uhrzeit -> Fehler');
} else {
  console.log('  (Test 34 übersprungen – Zeitzone ohne Sommerzeitsprung am 29.03.2026)');
}

// 35) „Gehen" nachtragen schließt eine noch offene Pause
const zomb = ds.clockIn();
ds.startBreak();
assert.strictEqual(zomb.breaks[0].end, null, 'Pause läuft');
const zin = new Date(zomb.clockIn);
const zinHM = String(zin.getHours()).padStart(2, '0') + ':' + String(zin.getMinutes()).padStart(2, '0');
ds.updateSessionTimes(zomb.id, zinHM, '23:59');
assert.ok(zomb.breaks[0].end, 'offene Pause wurde beim Setzen von „Gehen" geschlossen');
assert.ok(new Date(zomb.breaks[0].end) <= new Date(zomb.clockOut), 'Pause endet spätestens beim Gehen');

// 36) Eine alte Sitzung lässt sich nicht wieder „laufen lassen"
const alt = ds.addManual({ date: '2026-01-05', clockIn: '08:00', clockOut: '16:00' });
assert.throws(() => ds.updateSessionTimes(alt.id, '08:00', ''),
  /heutige Tag/, 'alte Sitzung kann nicht offen bleiben');
assert.ok(alt.clockOut, 'Gehen der alten Sitzung unverändert');

// 37) Einstellungen: unsinnige Werte werden abgelehnt
assert.throws(() => ds.updateSettings({ targetHoursPerDay: 99 }), /Soll-Stunden/, 'Soll > 24 -> Fehler');
assert.throws(() => ds.updateSettings({ targetDaysPerWeek: 0 }), /Arbeitstage/, 'Tage < 1 -> Fehler');
assert.throws(() => ds.updateSettings({ targetHoursPerDay: 'acht' }), /Soll-Stunden/, 'Text -> Fehler');
ds.updateSettings({ roundingMinutes: 15 });
assert.strictEqual(ds.getSettings().roundingMinutes, 15, 'gültige Rundung übernommen');

// 38) Speichern ist atomar – es bleibt keine .tmp-Datei liegen
assert.ok(!fs.existsSync(path.join(dir3, 'times.json.tmp')), 'keine Temp-Datei nach dem Speichern');

fs.rmSync(dir3, { recursive: true, force: true });

// 39) Defekte Datendatei: NICHT stillschweigend leer starten und überschreiben
const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test4-'));
const kaputt = path.join(dir4, 'times.json');
fs.writeFileSync(kaputt, '{ "sessions": [ das ist kein JSON', 'utf8');
const broken = new Store(dir4);
assert.ok(broken.loadError, 'defekte Datei wird als Lesefehler erkannt');
assert.throws(() => broken.clockIn(), /nicht gelesen werden/, 'Schreiben ist gesperrt');
assert.strictEqual(fs.readFileSync(kaputt, 'utf8'), '{ "sessions": [ das ist kein JSON',
  'die defekte Datei wurde NICHT überschrieben');

// 40) Fehlende Datei ist dagegen ein normaler Erststart
const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test5-'));
const frisch = new Store(dir5);
assert.ok(!frisch.loadError, 'fehlende Datei ist kein Fehler');
frisch.clockIn();
assert.ok(fs.existsSync(path.join(dir5, 'times.json')), 'Datei wurde angelegt');
fs.rmSync(dir4, { recursive: true, force: true });
fs.rmSync(dir5, { recursive: true, force: true });

fs.rmSync(dir, { recursive: true, force: true });
console.log('OK – alle Logiktests bestanden.');

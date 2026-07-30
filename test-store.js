// Schneller Logiktest der Datenschicht – ohne Electron/GUI.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const {
  Store, localDateKey, terminFaellig, terminVerpasst, terminSchluessel,
  LANGUAGES, DATE_FORMATS,
} = require('./store');

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

// 9) Validierung ("Gehen" vor "Kommen" ist keine Fehleingabe mehr, sondern
//    eine Schicht über Mitternacht – dazu Test 41 ff.)
assert.throws(() => store2.addManual({ date: '2026-05-20', clockIn: '08:00', clockOut: '16:00',
  breaks: [{ start: '07:00', end: '07:30' }] }), /zwischen Kommen und Gehen/, 'Pause außerhalb -> Fehler');
assert.throws(() => store2.addManual({ date: '2026-05-20', clockIn: '', clockOut: '16:00' }),
  /ausfüllen/, 'fehlende Zeit -> Fehler');

// 10) Block-Zeiten bearbeiten
store2.updateSessionTimes(m.id, '08:30', '17:00');
assert.strictEqual(new Date(m.clockIn).getHours(), 8, 'Kommen aktualisiert');
assert.strictEqual(new Date(m.clockIn).getMinutes(), 30, 'Kommen-Minute aktualisiert');

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

// 36) Eine beendete Sitzung lässt sich nicht wieder „laufen lassen" –
//     schützt auch davor, dass ein veraltetes Fenster ein „Gehen" aufhebt
const alt = ds.addManual({ date: '2026-01-05', clockIn: '08:00', clockOut: '16:00' });
assert.throws(() => ds.updateSessionTimes(alt.id, '08:00', ''),
  /bereits beendet/, 'beendete Sitzung kann nicht offen bleiben');
assert.ok(alt.clockOut, 'Gehen der alten Sitzung unverändert');
// Auch für heute: einmal beendet, bleibt beendet
const heuteKey = localDateKey(new Date());
const heuteFertig = ds.addManual({ date: heuteKey, clockIn: '06:00', clockOut: '06:30' });
assert.throws(() => ds.updateSessionTimes(heuteFertig.id, '06:00', ''),
  /bereits beendet/, 'auch heute nicht wieder öffenbar');
assert.ok(heuteFertig.clockOut, 'Gehen bleibt erhalten');

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

// ---- Schichten über Mitternacht ----
const dir6 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test6-'));
const ns = new Store(dir6);
const std = (ms) => ms / 3600000;

// 41) Nachtschicht als EIN Eintrag: 22:00 bis 06:00 = 8 Stunden
const nacht = ns.addManual({ date: '2026-06-10', clockIn: '22:00', clockOut: '06:00' });
assert.strictEqual(nacht.date, '2026-06-10', 'Eintrag gehört zum Tag des Kommens');
assert.strictEqual(new Date(nacht.clockOut).getDate(), 11, 'Gehen liegt am Folgetag');
assert.strictEqual(std(new Date(nacht.clockOut) - new Date(nacht.clockIn)), 8, 'Dauer 8 Stunden');

// 42) Pause nach Mitternacht wird dem Folgetag zugeordnet
ns.addBreak(nacht.id, '01:00', '01:30');
const p1 = nacht.breaks[0];
assert.strictEqual(new Date(p1.start).getDate(), 11, 'Pause um 01:00 liegt am Folgetag');
assert.strictEqual(std(new Date(p1.end) - new Date(p1.start)), 0.5, 'Pause 30 Minuten');

// 43) Pause vor Mitternacht bleibt am Starttag
ns.addBreak(nacht.id, '23:00', '23:20');
const vorMitternacht = nacht.breaks.find((b) => new Date(b.start).getHours() === 23);
assert.strictEqual(new Date(vorMitternacht.start).getDate(), 10, 'Pause um 23:00 bleibt am Starttag');

// 44) Pause, die selbst über Mitternacht geht
ns.addBreak(nacht.id, '23:45', '00:15');
const ueber = nacht.breaks.find((b) => new Date(b.start).getHours() === 23
  && new Date(b.start).getMinutes() === 45);
assert.strictEqual(new Date(ueber.start).getDate(), 10, 'Pausenbeginn am Starttag');
assert.strictEqual(new Date(ueber.end).getDate(), 11, 'Pausenende am Folgetag');
assert.strictEqual(std(new Date(ueber.end) - new Date(ueber.start)), 0.5, 'Pause 30 Minuten');

// 45) Pausen außerhalb der Schicht werden weiterhin abgelehnt
assert.throws(() => ns.addBreak(nacht.id, '12:00', '12:30'),
  /zwischen Kommen und Gehen/, 'Pause mittags außerhalb der Nachtschicht -> Fehler');

// 46) Netto-Zeit stimmt: 8 h minus 3 Pausen à 30/20/30 min
const brutto = new Date(nacht.clockOut) - new Date(nacht.clockIn);
const pausen = nacht.breaks.reduce((a, b) => a + (new Date(b.end) - new Date(b.start)), 0);
assert.strictEqual(std(brutto - pausen), 8 - (0.5 + (20 / 60) + 0.5), 'Netto nach Pausenabzug');

// 47) Nachtschicht auf einen anderen Tag verschieben – alles wandert mit
ns.updateSessionTimes(nacht.id, '22:00', '06:00', '2026-06-20');
assert.strictEqual(nacht.date, '2026-06-20', 'Datum verschoben');
assert.strictEqual(new Date(nacht.clockIn).getDate(), 20, 'Kommen am neuen Tag');
assert.strictEqual(new Date(nacht.clockOut).getDate(), 21, 'Gehen weiterhin am Folgetag');
const nachSchub = nacht.breaks.reduce((a, b) => a + (new Date(b.end) - new Date(b.start)), 0);
assert.strictEqual(nachSchub, pausen, 'Pausendauer beim Verschieben unverändert');
assert.ok(nacht.breaks.every((b) => {
  const d = new Date(b.start).getDate();
  return d === 20 || d === 21;
}), 'Pausen liegen weiterhin innerhalb der Schicht');

// 48) Tagwechsel bei bestehendem Block: normale Schicht bleibt eintägig
const tag = ns.addManual({ date: '2026-06-12', clockIn: '09:00', clockOut: '17:00' });
assert.strictEqual(new Date(tag.clockOut).getDate(), 12, 'normale Schicht endet am selben Tag');

// 49) Gleiche Uhrzeit für Kommen und Gehen ist ein Tippfehler, keine 24-h-Schicht
assert.throws(() => ns.addManual({ date: '2026-06-15', clockIn: '08:00', clockOut: '08:00' }),
  /dieselbe Uhrzeit/, 'identische Zeiten -> Fehler');

// 50) Bearbeiten einer eintägigen Schicht zu einer Nachtschicht
const wandel = ns.addManual({ date: '2026-06-13', clockIn: '09:00', clockOut: '17:00' });
ns.updateSessionTimes(wandel.id, '20:00', '04:00');
assert.strictEqual(new Date(wandel.clockOut).getDate(), 14, 'wird zur Nachtschicht');
assert.strictEqual(std(new Date(wandel.clockOut) - new Date(wandel.clockIn)), 8, 'Dauer 8 Stunden');

fs.rmSync(dir6, { recursive: true, force: true });

// ---- Termine und Notizen ----
const dir7 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test7-'));
const ev = new Store(dir7);

// 51) Termin anlegen
const t1 = ev.addEvent({ date: '2026-08-05', time: '14:30', title: 'Abstimmung Kunde',
  note: 'Themen:\n- Angebot\n- Zeitplan' });
assert.ok(t1.id, 'Termin angelegt');
assert.strictEqual(t1.time, '14:30', 'Uhrzeit übernommen');
assert.ok(t1.note.includes('Angebot'), 'Notiz mit Zeilenumbrüchen erhalten');

// 52) Termin ohne Uhrzeit (ganztägig) ist erlaubt
const t2 = ev.addEvent({ date: '2026-08-05', title: 'Urlaubstag' });
assert.strictEqual(t2.time, '', 'ohne Uhrzeit -> ganztägig');
assert.strictEqual(t2.note, '', 'Notiz optional');

// 53) Sortierung: ganztägig zuerst, dann nach Uhrzeit
ev.addEvent({ date: '2026-08-05', time: '09:00', title: 'Frühbesprechung' });
const amTag = ev.getEvents().filter((e) => e.date === '2026-08-05');
assert.deepStrictEqual(amTag.map((e) => e.time), ['', '09:00', '14:30'], 'nach Uhrzeit sortiert');

// 54) Validierung
assert.throws(() => ev.addEvent({ date: '2026-08-05', title: '   ' }), /Titel/, 'leerer Titel -> Fehler');
assert.throws(() => ev.addEvent({ date: '2026-13-01', title: 'X' }), /gültiges Datum/, 'falsches Datum -> Fehler');
assert.throws(() => ev.addEvent({ date: '2026-08-05', time: '25:00', title: 'X' }),
  /gültige Uhrzeit/, 'unmögliche Uhrzeit -> Fehler');
assert.throws(() => ev.addEvent({ date: '2026-08-05', time: 'abends', title: 'X' }),
  /gültige Uhrzeit/, 'Text statt Uhrzeit -> Fehler');

// 55) Bearbeiten
ev.updateEvent(t1.id, { time: '15:00', note: 'verschoben' });
const geaendert = ev.getEvents().find((e) => e.id === t1.id);
assert.strictEqual(geaendert.time, '15:00', 'Uhrzeit geändert');
assert.strictEqual(geaendert.title, 'Abstimmung Kunde', 'Titel bleibt bei Teil-Änderung');
assert.strictEqual(geaendert.note, 'verschoben', 'Notiz geändert');

// 56) Termin auf einen anderen Tag verschieben
ev.updateEvent(t2.id, { date: '2026-08-06' });
assert.strictEqual(ev.getEvents().find((e) => e.id === t2.id).date, '2026-08-06', 'Datum geändert');
assert.strictEqual(ev.getEvents().filter((e) => e.date === '2026-08-05').length, 2, 'Tag hat noch 2 Termine');

// 57) Löschen
ev.deleteEvent(t1.id);
assert.ok(!ev.getEvents().some((e) => e.id === t1.id), 'Termin gelöscht');
assert.throws(() => ev.deleteEvent('gibtsnicht'), /nicht gefunden/, 'unbekannte ID -> Fehler');

// 58) Termine überstehen einen Neustart und werden protokolliert
const ev2 = new Store(dir7);
// 3 angelegt, 1 wieder gelöscht
assert.strictEqual(ev2.getEvents().length, 2, 'Termine persistiert');
const evActions = ev2.getLogs().map((l) => l.action);
assert.ok(evActions.includes('Termin angelegt'), 'Anlegen protokolliert');
assert.ok(evActions.includes('Termin geändert'), 'Ändern protokolliert');
assert.ok(evActions.includes('Termin gelöscht'), 'Löschen protokolliert');

// 59) Altdaten ohne events-Feld laufen weiter
const dir8 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test8-'));
fs.writeFileSync(path.join(dir8, 'times.json'),
  JSON.stringify({ sessions: [], projects: [{ id: 'allgemein', name: 'Allgemein' }] }), 'utf8');
const altStore = new Store(dir8);
assert.deepStrictEqual(altStore.getEvents(), [], 'fehlendes events-Feld wird ergänzt');
altStore.addEvent({ date: '2026-08-10', title: 'Erster Termin' });
assert.strictEqual(altStore.getEvents().length, 1, 'Termin in Altdatei anlegbar');

// 60) Termin mit Projekt, ohne Projekt = Sonstiges
const evProj = ev2.addProject('Kunde Nord', 60);
const mitProj = ev2.addEvent({ date: '2026-08-12', time: '10:00', title: 'Workshop', projectId: evProj.id });
assert.strictEqual(mitProj.projectId, evProj.id, 'Projekt am Termin gespeichert');
const ohneProj = ev2.addEvent({ date: '2026-08-12', title: 'Steuerunterlagen' });
assert.strictEqual(ohneProj.projectId, '', 'ohne Projekt -> leer (Sonstiges)');

// 61) Unbekanntes Projekt wird zu Sonstiges, statt einen toten Verweis zu speichern
const spuk = ev2.addEvent({ date: '2026-08-13', title: 'Test', projectId: 'gibtsnicht' });
assert.strictEqual(spuk.projectId, '', 'unbekanntes Projekt -> Sonstiges');

// 62) Wird das Projekt gelöscht, verlieren seine Termine die Zuordnung –
//     und zwar sofort in der laufenden Instanz, nicht erst beim Neuladen
ev2.deleteProject(evProj.id, ev2.getProjects()[0].id);
assert.strictEqual(ev2.getEvents().find((e) => e.id === mitProj.id).projectId, '',
  'Termin fällt SOFORT auf Sonstiges zurück (nicht erst nach Neustart)');
const nachLoeschen = new Store(dir7);
assert.strictEqual(nachLoeschen.getEvents().find((e) => e.id === mitProj.id).projectId, '',
  'und bleibt auch nach dem Neuladen ohne Zuordnung');
assert.ok(ev2.getLogs().some((l) => l.action === 'Termine gelöst'), 'Lösen der Zuordnung protokolliert');

// 63) Projekt eines Termins nachträglich ändern
const p2 = nachLoeschen.addProject('Kunde Süd');
nachLoeschen.updateEvent(mitProj.id, { projectId: p2.id });
assert.strictEqual(nachLoeschen.getEvents().find((e) => e.id === mitProj.id).projectId, p2.id,
  'Projekt nachträglich zugeordnet');
nachLoeschen.updateEvent(mitProj.id, { projectId: '' });
assert.strictEqual(nachLoeschen.getEvents().find((e) => e.id === mitProj.id).projectId, '',
  'Zuordnung wieder entfernbar');

// 64) Einstellungen für Erinnerungen
assert.strictEqual(nachLoeschen.getSettings().notify, true, 'Erinnerungen sind voreingestellt an');
assert.strictEqual(nachLoeschen.getSettings().notifyBefore, 10, 'Vorlauf 10 Minuten voreingestellt');
nachLoeschen.updateSettings({ notify: false, notifyBefore: 30 });
assert.strictEqual(nachLoeschen.getSettings().notify, false, 'Erinnerungen abschaltbar');
assert.strictEqual(nachLoeschen.getSettings().notifyBefore, 30, 'Vorlauf änderbar');
assert.throws(() => nachLoeschen.updateSettings({ notifyBefore: 999 }), /Vorlaufzeit/,
  'unsinniger Vorlauf -> Fehler');

// 65) Tastenkürzel: gültige Kombinationen werden normalisiert
const hk = nachLoeschen;
// Strg+Umschalt+T statt Strg+T, damit Browsern nicht der neue Tab weggenommen wird
assert.strictEqual(hk.getSettings().hotkey, 'Control+Shift+T', 'Strg+Umschalt+T ist voreingestellt');
assert.strictEqual(hk.getSettings().hotkeyEnabled, false, 'Kürzel ist zunächst aus');
hk.updateSettings({ hotkey: 'alt+shift+z' });
assert.strictEqual(hk.getSettings().hotkey, 'Alt+Shift+Z', 'Kleinschreibung und Reihenfolge normalisiert');
hk.updateSettings({ hotkey: 'Control+F5' });
assert.strictEqual(hk.getSettings().hotkey, 'Control+F5', 'Funktionstaste erlaubt');
hk.updateSettings({ hotkey: 'Shift+Control+Space' });
assert.strictEqual(hk.getSettings().hotkey, 'Control+Shift+Space', 'Zusatztasten in fester Reihenfolge');

// 66) Kürzel ohne Zusatztaste oder mit zwei Haupttasten wird abgelehnt
assert.throws(() => hk.updateSettings({ hotkey: 'T' }), /Zusatztaste/, 'einzelne Taste -> Fehler');
assert.throws(() => hk.updateSettings({ hotkey: 'Control' }), /Zusatztaste|Taste zum/, 'nur Modifier -> Fehler');
assert.throws(() => hk.updateSettings({ hotkey: 'Control+T+S' }), /eine Haupttaste/, 'zwei Tasten -> Fehler');
assert.throws(() => hk.updateSettings({ hotkey: 'Control+Ü' }), /lässt sich nicht/, 'Umlaut -> Fehler');
// Kombinationen, die Windows braucht, bleiben gesperrt
assert.throws(() => hk.updateSettings({ hotkey: 'Alt+F4' }), /Windows gebraucht/, 'Alt+F4 gesperrt');
assert.throws(() => hk.updateSettings({ hotkey: 'Alt+Tab' }), /Windows gebraucht/, 'Alt+Tab gesperrt');
assert.throws(() => hk.updateSettings({ hotkey: 'Control+Alt+Delete' }),
  /Windows gebraucht/, 'Strg+Alt+Entf gesperrt');
assert.strictEqual(hk.getSettings().hotkey, 'Control+Shift+Space', 'Kürzel nach Fehler unverändert');

// 67) Mini-Bedienfeld: Ein/Aus und Ecke
assert.strictEqual(hk.getSettings().miniEnabled, true, 'Mini-Feld ist voreingestellt an');
assert.strictEqual(hk.getSettings().miniPosition, 'br', 'Ecke unten rechts voreingestellt');
hk.updateSettings({ miniEnabled: false, miniPosition: 'bl' });
assert.strictEqual(hk.getSettings().miniEnabled, false, 'Mini-Feld abschaltbar');
assert.strictEqual(hk.getSettings().miniPosition, 'bl', 'Ecke änderbar');
assert.throws(() => hk.updateSettings({ miniPosition: 'oben' }), /Position/, 'unbekannte Ecke -> Fehler');

// 67a) Weiterlaufen im Infobereich: aus, bis es jemand einschaltet. Ein
// Fenster, das sich beim Schließen nicht schließt, darf keine Überraschung
// sein – deshalb ist die Voreinstellung hier ausdrücklich geprüft.
assert.strictEqual(hk.getSettings().trayOnClose, false, 'Infobereich voreingestellt aus');
hk.updateSettings({ trayOnClose: true });
assert.strictEqual(hk.getSettings().trayOnClose, true, 'Infobereich einschaltbar');
hk.updateSettings({ trayOnClose: 0 });
assert.strictEqual(hk.getSettings().trayOnClose, false, 'unscharfe Werte werden zu true/false');
hk.updateSettings({ trayOnClose: true });

// 68) Alle Einstellungen überstehen einen Neustart
const hk2 = new Store(dir7);
assert.strictEqual(hk2.getSettings().hotkey, 'Control+Shift+Space', 'Kürzel persistiert');
assert.strictEqual(hk2.getSettings().miniPosition, 'bl', 'Ecke persistiert');
assert.strictEqual(hk2.getSettings().trayOnClose, true, 'Infobereich persistiert');

// ---- Erinnerungs-Zeitrechnung (ohne Electron testbar) ----
const t = (datum, zeit) => ({ id: 'x', date: datum, time: zeit });
const at = (y, mo, d, hh, mm) => new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();

// 69) Genau zur Uhrzeit, ohne Vorlauf
assert.ok(terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 12, 0), 0), 'punktgenau fällig');
assert.ok(!terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 11, 59), 0), 'eine Minute vorher nicht');
assert.ok(terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 12, 9), 0), 'im Nachlauffenster noch');
assert.ok(!terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 12, 11), 0), 'nach dem Fenster nicht mehr');

// 70) Mit Vorlauf – das Fenster reicht bis zur echten Terminzeit.
//     Startet die App erst innerhalb der Vorlaufzeit, geht die Erinnerung
//     trotzdem nicht verloren (der Fall, der vorher durchs Raster fiel).
assert.ok(terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 11, 0), 60), 'Vorlauf 60: um 11:00 fällig');
assert.ok(terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 11, 30), 60), 'auch um 11:30 noch fällig');
assert.ok(terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 11, 59), 60), 'kurz davor fällig');
assert.ok(terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 12, 0), 60), 'zur Terminzeit fällig');
assert.ok(!terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 12, 11), 60), 'deutlich danach nicht');
assert.ok(!terminFaellig(t('2026-08-05', '12:00'), at(2026, 8, 5, 10, 30), 60), 'vor dem Vorlauf nicht');

// 71) Ganztägige Termine nur am Tag selbst
const heuteStr = localDateKey(new Date());
assert.ok(terminFaellig({ id: 'g', date: heuteStr, time: '' }, Date.now(), 10), 'ganztägig heute fällig');
assert.ok(!terminFaellig({ id: 'g', date: '2026-01-01', time: '' }, Date.now(), 10),
  'ganztägig an anderem Tag nicht');

// 72) Verpasste Termine gelten beim Start als erledigt
assert.ok(terminVerpasst(t('2026-08-05', '12:00'), at(2026, 8, 5, 12, 30)), 'lange vorbei = verpasst');
assert.ok(!terminVerpasst(t('2026-08-05', '12:00'), at(2026, 8, 5, 12, 5)), 'noch im Fenster');
assert.ok(!terminVerpasst(t('2026-08-05', '12:00'), at(2026, 8, 5, 9, 0)), 'noch in der Zukunft');
assert.ok(!terminVerpasst({ id: 'g', date: '2020-01-01', time: '' }, Date.now()),
  'ganztägig gilt nie als verpasst');

// 73) Ein verschobener Termin wird erneut gemeldet (Schlüssel enthält Zeit)
const vorher = terminSchluessel({ id: 'a1', date: '2026-08-05', time: '12:00' });
const nachVerschieben = terminSchluessel({ id: 'a1', date: '2026-08-05', time: '15:00' });
const nachTagwechsel = terminSchluessel({ id: 'a1', date: '2026-08-06', time: '12:00' });
assert.notStrictEqual(vorher, nachVerschieben, 'andere Uhrzeit -> anderer Schlüssel');
assert.notStrictEqual(vorher, nachTagwechsel, 'anderes Datum -> anderer Schlüssel');
assert.strictEqual(vorher, terminSchluessel({ id: 'a1', date: '2026-08-05', time: '12:00' }),
  'unveränderter Termin -> gleicher Schlüssel');

fs.rmSync(dir7, { recursive: true, force: true });
fs.rmSync(dir8, { recursive: true, force: true });

// ---------- Sprache und Datumsformat ----------
const dir9 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test9-'));
const sp = new Store(dir9);

// 74) Voreinstellung: deutsch, vierstelliges Jahr
assert.strictEqual(sp.getSettings().language, 'de', 'Standardsprache ist deutsch');
assert.strictEqual(sp.getSettings().dateFormat, 'dd.MM.yyyy', 'Standardformat ist dd.MM.yyyy');
assert.strictEqual(sp.getSettings().shortYear, false, 'Jahr standardmäßig vierstellig');

// 75) Jede angebotene Sprache lässt sich setzen
for (const l of LANGUAGES) {
  sp.updateSettings({ language: l });
  assert.strictEqual(sp.getSettings().language, l, 'Sprache ' + l + ' gesetzt');
}
assert.strictEqual(LANGUAGES.length, 6, 'sechs Sprachen angeboten');

// 76) Jedes angebotene Format lässt sich setzen
for (const f of DATE_FORMATS) {
  sp.updateSettings({ dateFormat: f });
  assert.strictEqual(sp.getSettings().dateFormat, f, 'Format ' + f + ' gesetzt');
}

// 77) Unbekannte Werte werden abgewiesen, der alte Wert bleibt
sp.updateSettings({ language: 'en', dateFormat: 'yyyy-MM-dd' });
assert.throws(() => sp.updateSettings({ language: 'kl' }), /Unbekannte Sprache/,
  'unbekannte Sprache abgewiesen');
assert.throws(() => sp.updateSettings({ dateFormat: 'MM~dd' }), /Unbekanntes Datumsformat/,
  'unbekanntes Format abgewiesen');
assert.strictEqual(sp.getSettings().language, 'en', 'Sprache nach Fehlversuch unverändert');
assert.strictEqual(sp.getSettings().dateFormat, 'yyyy-MM-dd', 'Format nach Fehlversuch unverändert');

// 78) „Jahr abkürzen" nimmt jeden Wahrheitswert
sp.updateSettings({ shortYear: 1 });
assert.strictEqual(sp.getSettings().shortYear, true, '1 wird zu true');
sp.updateSettings({ shortYear: '' });
assert.strictEqual(sp.getSettings().shortYear, false, 'leerer Text wird zu false');

// 79) Die drei Werte überleben einen Neustart
sp.updateSettings({ language: 'ja', dateFormat: 'd. MMMM yyyy', shortYear: true });
const sp2 = new Store(dir9);
assert.strictEqual(sp2.getSettings().language, 'ja', 'Sprache persistiert');
assert.strictEqual(sp2.getSettings().dateFormat, 'd. MMMM yyyy', 'Format persistiert');
assert.strictEqual(sp2.getSettings().shortYear, true, 'Kurzjahr persistiert');

// 80) Alte Dateien ohne die neuen Felder erhalten die Voreinstellungen
const dir10 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test10-'));
fs.writeFileSync(path.join(dir10, 'times.json'), JSON.stringify({
  sessions: [], projects: [], events: [], logs: [],
  settings: { targetHoursPerDay: 8, theme: 'caro-dark' },
}));
const altbestand = new Store(dir10);
assert.ok(!altbestand.loadError, 'alte Datei ohne Sprachfelder ist lesbar');
assert.strictEqual(altbestand.getSettings().language, 'de', 'Sprache ergänzt');
assert.strictEqual(altbestand.getSettings().dateFormat, 'dd.MM.yyyy', 'Format ergänzt');
assert.strictEqual(altbestand.getSettings().shortYear, false, 'Kurzjahr ergänzt');
assert.strictEqual(altbestand.getSettings().targetHoursPerDay, 8, 'vorhandener Wert bleibt');

// ---------- Automatische Updates abschaltbar ----------
const dir11 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test11-'));
const au = new Store(dir11);

// 81) Voreinstellung: an – wer nichts einstellt, bleibt versorgt
assert.strictEqual(au.getSettings().autoUpdate, true, 'Automatik standardmäßig an');

// 82) Abschalten und wieder einschalten
au.updateSettings({ autoUpdate: false });
assert.strictEqual(au.getSettings().autoUpdate, false, 'Automatik abgeschaltet');
au.updateSettings({ autoUpdate: true });
assert.strictEqual(au.getSettings().autoUpdate, true, 'Automatik wieder an');

// 83) Jeder Wahrheitswert wird übernommen
au.updateSettings({ autoUpdate: 0 });
assert.strictEqual(au.getSettings().autoUpdate, false, '0 wird zu false');
au.updateSettings({ autoUpdate: 'ja' });
assert.strictEqual(au.getSettings().autoUpdate, true, 'nichtleerer Text wird zu true');

// 84) Andere Einstellungen bleiben unberührt
au.updateSettings({ autoUpdate: false, targetHoursPerDay: 7 });
assert.strictEqual(au.getSettings().autoUpdate, false, 'Automatik gesetzt');
assert.strictEqual(au.getSettings().targetHoursPerDay, 7, 'Tagessoll daneben gesetzt');
au.updateSettings({ theme: 'caro-light' });
assert.strictEqual(au.getSettings().autoUpdate, false,
  'Automatik überlebt eine andere Änderung');

// 85) Überlebt einen Neustart
const au2 = new Store(dir11);
assert.strictEqual(au2.getSettings().autoUpdate, false, 'Automatik persistiert');

// 86) Alte Datei ohne das Feld gilt als „an" – ein Update darf nicht
// dadurch ausbleiben, dass die Einstellung fehlt.
const dir12 = fs.mkdtempSync(path.join(os.tmpdir(), 'stempel-test12-'));
fs.writeFileSync(path.join(dir12, 'times.json'), JSON.stringify({
  sessions: [], projects: [], events: [], logs: [],
  settings: { targetHoursPerDay: 8 },
}));
const altAU = new Store(dir12);
assert.strictEqual(altAU.getSettings().autoUpdate, true,
  'fehlendes Feld bedeutet: Automatik an');

fs.rmSync(dir11, { recursive: true, force: true });
fs.rmSync(dir12, { recursive: true, force: true });

fs.rmSync(dir9, { recursive: true, force: true });
fs.rmSync(dir10, { recursive: true, force: true });

fs.rmSync(dir, { recursive: true, force: true });
console.log('OK – alle Logiktests bestanden.');

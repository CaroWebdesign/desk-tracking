// Datenschicht: lädt und speichert Sitzungen, Logs und Einstellungen in einer
// JSON-Datei im Datenordner („Dokumente\Desk Tracking"). Keine native DB nötig.
const fs = require('fs');
const path = require('path');

// Verfügbare Designs (Caro CI v1: hell und dunkel)
const THEMES = ['caro-dark', 'caro-light'];

const DEFAULT_SETTINGS = {
  targetHoursPerDay: 8,   // Soll-Stunden pro Tag (Stunden, dezimal erlaubt)
  targetDaysPerWeek: 5,   // Arbeitstage pro Woche
  roundingMinutes: 0,     // Anzeige-Rundung der Netto-Zeit (0 = aus)
  activeProjectId: null,  // aktuell für neue Stempelungen gewähltes Projekt
  theme: 'caro-dark',     // 'caro-dark' | 'caro-light'
  notify: true,           // Erinnerung an Termine als Windows-Benachrichtigung
  notifyBefore: 10,       // Minuten Vorlauf (0 = genau zur Uhrzeit)
  hotkeyEnabled: false,   // systemweites Tastenkürzel zum Hervorholen
  // Bewusst mit Umschalt: ein reines Strg+T würde Browsern den neuen Tab wegnehmen
  hotkey: 'Control+Shift+T',
  miniEnabled: true,      // kleines Bedienfeld, wenn das Fenster minimiert ist
  miniPosition: 'br',     // 'br' = unten rechts, 'bl' = unten links
  language: 'de',         // Sprache der Oberfläche
  dateFormat: 'dd.MM.yyyy', // Darstellung von Datumsangaben
  shortYear: false,       // Jahr zweistellig statt vierstellig
};

// Verfügbare Sprachen (Oberfläche)
const LANGUAGES = ['de', 'en', 'fr', 'es', 'ja', 'zh'];

// Erlaubte Datumsmuster. „EEE" = Wochentag kurz, „MMMM" = Monatsname.
const DATE_FORMATS = [
  'dd.MM.yyyy',
  'yyyy-MM-dd',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'd. MMMM yyyy',
  'EEE dd.MM.yyyy',
  'EEE, d. MMMM yyyy',
];

// Erlaubte Positionen des Mini-Bedienfelds
const MINI_POSITIONS = ['br', 'bl'];

// Sammelprojekt für Altdaten und projektlose Stempelungen
const DEFAULT_PROJECT_ID = 'allgemein';
const DEFAULT_PROJECT_NAME = 'Allgemein';

class Store {
  // dataDir: Verzeichnis, in dem die times.json liegt (Hauptverzeichnis der App)
  constructor(dataDir) {
    this.file = path.join(dataDir, 'times.json');
    this.data = this._load();
  }

  _load() {
    let parsed = {};
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) {
      // Nur eine fehlende Datei ist ein harmloser Erstsart. Ist die Datei
      // vorhanden, aber unlesbar oder defekt, darf NICHT mit einem leeren
      // Datensatz weitergelaufen werden – das erste Speichern würde die
      // vorhandenen Zeiten überschreiben. Stattdessen sperren wir das
      // Schreiben; main.js meldet das und beendet die App.
      if (e.code !== 'ENOENT') this.loadError = e;
    }
    const data = {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      settings: Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {}),
    };
    this._migrateProjects(data);
    return data;
  }

  // Stellt sicher, dass es immer mindestens ein Projekt gibt und dass jede
  // Sitzung einem gültigen Projekt zugeordnet ist (Altdaten -> „Allgemein").
  _migrateProjects(data) {
    if (data.projects.length === 0) {
      data.projects.push({ id: DEFAULT_PROJECT_ID, name: DEFAULT_PROJECT_NAME });
    }
    // Fehlende Felder ergänzen (Stundensatz in €/h, abgeschlossen-Flag)
    for (const p of data.projects) {
      if (typeof p.rate !== 'number' || isNaN(p.rate)) p.rate = 0;
      if (typeof p.closed !== 'boolean') p.closed = false;
    }
    const def = data.projects.find((p) => p.id === DEFAULT_PROJECT_ID) || data.projects[0];
    const ids = new Set(data.projects.map((p) => p.id));
    for (const s of data.sessions) {
      if (!s.projectId || !ids.has(s.projectId)) s.projectId = def.id;
    }
    if (!data.settings.activeProjectId || !ids.has(data.settings.activeProjectId)) {
      data.settings.activeProjectId = def.id;
    }
    // Termine dürfen projektlos sein („Sonstiges"); ein gelöschtes Projekt
    // wird dabei zu „Sonstiges", damit kein toter Verweis bleibt.
    for (const e of data.events) {
      if (!e.projectId || !ids.has(e.projectId)) e.projectId = '';
    }
  }

  // Erst vollständig in eine Nebendatei schreiben, dann umbenennen. Ein
  // Abbruch mitten im Schreiben (Absturz, Update, Stromausfall) kann so keine
  // halbe times.json hinterlassen – das Umbenennen ist auf NTFS atomar.
  _save() {
    if (this.loadError) {
      throw new Error('Die Datendatei konnte nicht gelesen werden – es wird nichts gespeichert, '
        + 'damit keine Zeiten verloren gehen.');
    }
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  // Änderungs-Protokoll (auf die letzten 5000 Einträge begrenzt, damit die
  // Datei über die Jahre nicht unbegrenzt wächst)
  _log(action, detail) {
    this.data.logs.push({ ts: new Date().toISOString(), action, detail });
    if (this.data.logs.length > 5000) {
      this.data.logs = this.data.logs.slice(-4000);
    }
  }

  // Eine Sitzung:
  // { id, projectId, date:'YYYY-MM-DD', clockIn:ISO, clockOut:ISO|null,
  //   breaks:[{start:ISO, end:ISO|null}] }

  _find(id) {
    const s = this.data.sessions.find((x) => x.id === id);
    if (!s) throw new Error('Eintrag nicht gefunden.');
    return s;
  }

  // ---- Projekte ----
  getProjects() { return this.data.projects; }

  _findProject(id) {
    const p = this.data.projects.find((x) => x.id === id);
    if (!p) throw new Error('Projekt nicht gefunden.');
    return p;
  }

  _projectName(id) {
    const p = this.data.projects.find((x) => x.id === id);
    return p ? p.name : '—';
  }

  // Wählt eine gültige Projekt-ID. Explizit übergebene ID wird honoriert
  // (auch abgeschlossene – z. B. zum Umbuchen). Fallback bevorzugt offene.
  _resolveProjectId(projectId) {
    const byId = (id) => this.data.projects.find((p) => p.id === id);
    if (projectId && byId(projectId)) return projectId;
    const active = byId(this.data.settings.activeProjectId);
    if (active && !active.closed) return active.id;
    const firstOpen = this.data.projects.find((p) => !p.closed);
    return (firstOpen || this.data.projects[0]).id;
  }

  // Prüft einen Stundensatz (€/h, >= 0)
  _normRate(rate) {
    const n = Number(rate);
    if (isNaN(n) || n < 0) throw new Error('Bitte einen gültigen Stundensatz (>= 0) angeben.');
    return Math.round(n * 100) / 100;
  }

  addProject(name, rate = 0) {
    name = String(name || '').trim();
    if (!name) throw new Error('Bitte einen Projektnamen angeben.');
    if (name.length > 60) throw new Error('Projektname ist zu lang (max. 60 Zeichen).');
    if (this.data.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Es gibt bereits ein Projekt mit diesem Namen.');
    }
    const project = { id: newId(), name, rate: this._normRate(rate), closed: false };
    this.data.projects.push(project);
    this._log('Projekt angelegt', `${name} (${project.rate} €/h)`);
    this._save();
    return project;
  }

  // Name und/oder Stundensatz ändern
  updateProject(id, patch) {
    const p = this._findProject(id);
    const { name, rate } = patch || {};
    const changes = [];
    if (name !== undefined) {
      const nm = String(name).trim();
      if (!nm) throw new Error('Bitte einen Projektnamen angeben.');
      if (nm.length > 60) throw new Error('Projektname ist zu lang (max. 60 Zeichen).');
      if (this.data.projects.some((x) => x.id !== id && x.name.toLowerCase() === nm.toLowerCase())) {
        throw new Error('Es gibt bereits ein Projekt mit diesem Namen.');
      }
      if (nm !== p.name) changes.push(`Name ${p.name} → ${nm}`);
      p.name = nm;
    }
    if (rate !== undefined) {
      const r = this._normRate(rate);
      if (r !== p.rate) changes.push(`Satz ${p.rate} → ${r} €/h`);
      p.rate = r;
    }
    if (changes.length) { this._log('Projekt geändert', `${p.name}: ${changes.join(', ')}`); this._save(); }
    return p;
  }

  closeProject(id) {
    const p = this._findProject(id);
    const open = this.getOpenSession();
    if (open && open.projectId === id) {
      throw new Error('Bitte zuerst die laufende Sitzung dieses Projekts beenden.');
    }
    p.closed = true;
    // Aktives Projekt darf nicht abgeschlossen sein -> auf ein offenes wechseln
    if (this.data.settings.activeProjectId === id) {
      const nextOpen = this.data.projects.find((x) => !x.closed);
      if (nextOpen) this.data.settings.activeProjectId = nextOpen.id;
    }
    this._log('Projekt abgeschlossen', p.name);
    this._save();
    return p;
  }

  reopenProject(id) {
    const p = this._findProject(id);
    p.closed = false;
    this._log('Projekt wieder geöffnet', p.name);
    this._save();
    return p;
  }

  // Löscht ein Projekt. Hat es noch Einträge, müssen diese per reassignToId
  // auf ein anderes Projekt umgebucht werden, sonst Fehler.
  deleteProject(id, reassignToId) {
    const p = this._findProject(id);
    if (this.data.projects.length <= 1) {
      throw new Error('Das letzte Projekt kann nicht gelöscht werden.');
    }
    const affected = this.data.sessions.filter((s) => s.projectId === id);
    if (affected.length > 0) {
      if (!reassignToId) {
        throw new Error(`Projekt „${p.name}" hat noch ${affected.length} Eintrag/Einträge – `
          + 'bitte auf ein anderes Projekt umbuchen.');
      }
      const target = this._findProject(reassignToId);
      if (target.id === id) throw new Error('Bitte ein anderes Zielprojekt wählen.');
      for (const s of affected) s.projectId = target.id;
      this._log('Einträge umgebucht', `${affected.length}× ${p.name} → ${target.name}`);
    }
    // Termine des Projekts fallen auf „Sonstiges" zurück – ein toter Verweis
    // würde sonst als „—" in Oberfläche, CSV und PDF auftauchen.
    let termine = 0;
    for (const e of this.data.events) {
      if (e.projectId === id) { e.projectId = ''; termine++; }
    }
    if (termine) this._log('Termine gelöst', `${termine}× ${p.name} → Sonstiges`);

    this.data.projects = this.data.projects.filter((x) => x.id !== id);
    if (this.data.settings.activeProjectId === id) {
      this.data.settings.activeProjectId = this.data.projects[0].id;
    }
    this._log('Projekt gelöscht', p.name);
    this._save();
    return true;
  }

  setActiveProject(id) {
    this._findProject(id);
    this.data.settings.activeProjectId = id;
    this._save();
    return id;
  }

  // Projekt einer bestehenden Sitzung ändern (im Tages-Editor)
  updateSessionProject(id, projectId) {
    const s = this._find(id);
    const target = this._findProject(projectId);
    const before = this._projectName(s.projectId);
    s.projectId = target.id;
    this._log('Block umgebucht', `${s.date}: ${before} → ${target.name}`);
    this._save();
    return s;
  }

  getOpenSession() {
    return this.data.sessions.find((s) => s.clockOut === null) || null;
  }

  // ---- Live-Stempeln ----
  clockIn(projectId) {
    if (this.getOpenSession()) throw new Error('Es läuft bereits eine offene Sitzung.');
    const pid = this._resolveProjectId(projectId);
    if (this._findProject(pid).closed) {
      throw new Error('Dieses Projekt ist abgeschlossen – bitte ein aktives Projekt wählen.');
    }
    const now = new Date();
    const session = {
      id: newId(),
      projectId: pid,
      date: localDateKey(now),
      clockIn: now.toISOString(),
      clockOut: null,
      breaks: [],
    };
    this.data.sessions.push(session);
    this._log('Eingestempelt', `${session.date} ${hm(now)} · ${this._projectName(pid)}`);
    this._save();
    return session;
  }

  clockOut() {
    const s = this.getOpenSession();
    if (!s) throw new Error('Keine offene Sitzung zum Beenden.');
    const openBreak = s.breaks.find((b) => b.end === null);
    if (openBreak) openBreak.end = new Date().toISOString();
    s.clockOut = new Date().toISOString();
    this._log('Ausgestempelt', `${s.date} ${hm(new Date(s.clockOut))}`);
    this._save();
    return s;
  }

  startBreak() {
    const s = this.getOpenSession();
    if (!s) throw new Error('Keine offene Sitzung – bitte zuerst „Kommen".');
    if (s.breaks.some((b) => b.end === null)) throw new Error('Es läuft bereits eine Pause.');
    s.breaks.push({ start: new Date().toISOString(), end: null });
    this._log('Pause gestartet', `${s.date} ${hm(new Date())}`);
    this._save();
    return s;
  }

  endBreak() {
    const s = this.getOpenSession();
    if (!s) throw new Error('Keine offene Sitzung.');
    const openBreak = s.breaks.find((b) => b.end === null);
    if (!openBreak) throw new Error('Keine laufende Pause.');
    openBreak.end = new Date().toISOString();
    this._log('Pause beendet', `${s.date} ${hm(new Date())}`);
    this._save();
    return s;
  }

  // ---- Nachtragen / Bearbeiten ----
  // entry = { date, clockIn:'HH:MM', clockOut:'HH:MM', breaks:[{start,end}] }
  addManual(entry) {
    const { clockIn, clockOut, breaks = [], projectId } = entry || {};
    const rawDate = entry && entry.date;
    if (!rawDate || !clockIn || !clockOut) throw new Error('Bitte Datum, Kommen und Gehen ausfüllen.');
    const date = normDateKey(rawDate);
    const inD = buildLocal(date, clockIn);
    checkExists(inD, date, clockIn);
    const end = buildEnd(date, inD, clockOut);

    const pid = this._resolveProjectId(projectId);
    const session = {
      id: newId(), projectId: pid, date,
      clockIn: inD.toISOString(),
      clockOut: end.at.toISOString(),
      breaks: [],
    };
    for (const b of breaks) {
      if (!b || (!b.start && !b.end)) continue;
      session.breaks.push(this._mkBreak(session, b.start, b.end));
    }
    this.data.sessions.push(session);
    this._log('Block hinzugefügt',
      `${date} ${clockIn}–${clockOut}${end.overnight ? ' (Folgetag)' : ''} · ${this._projectName(pid)}`
      + (session.breaks.length ? `, ${session.breaks.length} Pause(n)` : ''));
    this._save();
    return session;
  }

  // Kommen/Gehen und optional das Datum einer bestehenden Sitzung ändern.
  // clockOut leer ('') -> Sitzung bleibt offen (läuft).
  // date ('YYYY-MM-DD', optional) verschiebt den Block auf einen anderen Tag;
  // die Pausen wandern mit derselben Uhrzeit auf das neue Datum.
  updateSessionTimes(id, clockIn, clockOut, date) {
    const s = this._find(id);
    if (!clockIn) throw new Error('Bitte „Kommen" angeben.');

    const newDate = date ? normDateKey(date) : s.date;
    const dateChanged = newDate !== s.date;
    if (dateChanged && !clockOut) {
      throw new Error('Eine laufende Sitzung kann nicht auf ein anderes Datum verschoben werden – bitte zuerst „Gehen".');
    }

    const inD = buildLocal(newDate, clockIn);
    checkExists(inD, newDate, clockIn);
    let outISO = null;
    if (clockOut) {
      // „Gehen" vor „Kommen" heißt: die Schicht geht über Mitternacht.
      outISO = buildEnd(newDate, inD, clockOut).at.toISOString();
    } else {
      // Eine bereits beendete Sitzung darf nicht wieder geöffnet werden. Sonst
      // könnte ein veraltetes Fenster ein zwischenzeitliches „Gehen" aufheben.
      if (s.clockOut) {
        throw new Error('Diese Sitzung ist bereits beendet – bitte „Gehen" angeben.');
      }
      // Offen lassen darf nur der heutige Tag – sonst würde ein alter Eintrag
      // als „läuft seit damals" gelten und die Arbeitszeit explodieren.
      if (newDate !== localDateKey(new Date())) {
        throw new Error('Nur der heutige Tag kann eine laufende Sitzung haben – bitte „Gehen" angeben.');
      }
      if (this.getOpenSession() && this.getOpenSession().id !== id) {
        throw new Error('Es kann nur eine Sitzung gleichzeitig offen sein.');
      }
    }

    // Immer mit einer Kopie arbeiten, damit ein Fehler weiter unten die
    // gespeicherten Pausen nicht halb verändert zurücklässt.
    // Beim Tageswechsel wandern die Pausen um dieselbe Anzahl Kalendertage mit –
    // sekundengenau und unter Beibehaltung ihrer Lage. Eine Pause nach
    // Mitternacht bleibt dadurch auch nach dem Verschieben nach Mitternacht.
    const versatz = dateChanged ? dayDiff(s.date, newDate) : 0;
    const breaks = s.breaks.map((b) => (versatz
      ? {
        start: shiftDays(b.start, versatz).toISOString(),
        end: b.end ? shiftDays(b.end, versatz).toISOString() : null,
      }
      : { start: b.start, end: b.end }));

    // Wird ein „Gehen" gesetzt, darf keine Pause offen bleiben – sonst würde
    // sie endlos bis „jetzt" weiterlaufen und die Netto-Zeit auffressen.
    if (outISO) {
      for (const b of breaks) if (!b.end) b.end = outISO;
    }

    // Pausen müssen weiterhin in die neuen Grenzen passen
    const lo = inD.getTime();
    const hi = outISO ? new Date(outISO).getTime() : Date.now();
    for (const b of breaks) {
      const bs = new Date(b.start).getTime();
      const be = b.end ? new Date(b.end).getTime() : hi;
      if (bs < lo || be > hi) {
        throw new Error('Eine Pause liegt außerhalb der neuen Zeiten – bitte zuerst die Pause anpassen.');
      }
    }

    const before = `${hm(new Date(s.clockIn))}–${s.clockOut ? hm(new Date(s.clockOut)) : 'offen'}`;
    const oldDate = s.date;
    s.date = newDate;
    s.clockIn = inD.toISOString();
    s.clockOut = outISO;
    s.breaks = breaks;
    const after = `${clockIn}–${clockOut || 'offen'}`;
    this._log('Block bearbeitet', dateChanged
      ? `${oldDate} ${before} → ${newDate} ${after}`
      : `${newDate}: ${before} → ${after}`);
    this._save();
    return s;
  }

  deleteSession(id) {
    const s = this.data.sessions.find((x) => x.id === id);
    if (!s) return;
    this.data.sessions = this.data.sessions.filter((x) => x.id !== id);
    this._log('Block gelöscht', `${s.date} ${hm(new Date(s.clockIn))}`
      + `–${s.clockOut ? hm(new Date(s.clockOut)) : 'offen'}`);
    this._save();
  }

  // ---- Pausen einzeln bearbeiten ----
  // Eine Pause wird nur über die Uhrzeit angegeben. Bei einer Schicht über
  // Mitternacht wird sie dem Tag zugeordnet, an dem sie tatsächlich liegt:
  // eine Pause um 01:00 bei einer Schicht 22:00–06:00 gehört zum Folgetag.
  _mkBreak(session, startHHMM, endHHMM) {
    if (!startHHMM || !endHHMM) throw new Error('Pause: bitte „von" und „bis" angeben.');
    const lo = new Date(session.clockIn);
    const hi = session.clockOut ? new Date(session.clockOut) : new Date();

    let startDate = session.date;
    let bs = buildLocal(startDate, startHHMM);
    checkExists(bs, startDate, startHHMM);
    // Liegt die Uhrzeit vor dem Schichtbeginn, ist der Folgetag gemeint
    if (bs < lo && hi > buildLocal(nextDay(session.date), '00:00')) {
      startDate = nextDay(session.date);
      bs = buildLocal(startDate, startHHMM);
      checkExists(bs, startDate, startHHMM);
    }

    let be = buildLocal(startDate, endHHMM);
    checkExists(be, startDate, endHHMM);
    if (be <= bs) {
      const endDate = nextDay(startDate);
      be = buildLocal(endDate, endHHMM);
      checkExists(be, endDate, endHHMM);
    }

    if (bs < lo || be > hi) {
      throw new Error('Pause muss zwischen Kommen und Gehen liegen.');
    }
    return { start: bs.toISOString(), end: be.toISOString() };
  }

  addBreak(sessionId, start, end) {
    const s = this._find(sessionId);
    s.breaks.push(this._mkBreak(s, start, end));
    s.breaks.sort((a, b) => new Date(a.start) - new Date(b.start));
    this._log('Pause hinzugefügt', `${s.date} ${start}–${end}`);
    this._save();
    return s;
  }

  updateBreak(sessionId, index, start, end) {
    const s = this._find(sessionId);
    if (index < 0 || index >= s.breaks.length) throw new Error('Pause nicht gefunden.');
    const before = `${hm(new Date(s.breaks[index].start))}–`
      + `${s.breaks[index].end ? hm(new Date(s.breaks[index].end)) : 'offen'}`;
    s.breaks[index] = this._mkBreak(s, start, end);
    s.breaks.sort((a, b) => new Date(a.start) - new Date(b.start));
    this._log('Pause bearbeitet', `${s.date}: ${before} → ${start}–${end}`);
    this._save();
    return s;
  }

  deleteBreak(sessionId, index) {
    const s = this._find(sessionId);
    if (index < 0 || index >= s.breaks.length) throw new Error('Pause nicht gefunden.');
    const b = s.breaks.splice(index, 1)[0];
    this._log('Pause gelöscht', `${s.date} ${hm(new Date(b.start))}`
      + `–${b.end ? hm(new Date(b.end)) : 'offen'}`);
    this._save();
    return s;
  }

  // ---- Termine und Notizen ----
  // Ein Termin: { id, date:'YYYY-MM-DD', time:'HH:MM'|'', title, note }
  // Ohne Uhrzeit gilt er als ganztägig – praktisch für reine Notizen.
  getEvents() { return this.data.events; }

  _findEvent(id) {
    const e = this.data.events.find((x) => x.id === id);
    if (!e) throw new Error('Termin nicht gefunden.');
    return e;
  }

  _normEvent({ date, time, title, note, projectId }) {
    const d = normDateKey(date);
    let t = String(time || '').trim();
    if (t) {
      const teile = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!teile) throw new Error('Bitte eine gültige Uhrzeit angeben (z. B. 09:30).');
      const hh = Number(teile[1]), mm = Number(teile[2]);
      if (hh > 23 || mm > 59) throw new Error('Bitte eine gültige Uhrzeit angeben (z. B. 09:30).');
      t = String(hh).padStart(2, '0') + ':' + teile[2];
    }
    const ti = String(title || '').trim();
    if (!ti) throw new Error('Bitte einen Titel für den Termin angeben.');
    if (ti.length > 120) throw new Error('Der Titel ist zu lang (max. 120 Zeichen).');
    const no = String(note || '');
    if (no.length > 4000) throw new Error('Die Notiz ist zu lang (max. 4000 Zeichen).');
    // Projekt ist optional – leer bedeutet „Sonstiges". Ein Projekt, das es
    // nicht (mehr) gibt, wird ebenfalls zu „Sonstiges".
    let pid = projectId ? String(projectId) : '';
    if (pid && !this.data.projects.some((p) => p.id === pid)) pid = '';
    return { date: d, time: t, title: ti, note: no, projectId: pid };
  }

  addEvent(entry) {
    const e = this._normEvent(entry || {});
    const event = Object.assign({ id: newId() }, e);
    this.data.events.push(event);
    this._sortEvents();
    this._log('Termin angelegt', `${event.date}${event.time ? ' ' + event.time : ''}: ${event.title}`);
    this._save();
    return event;
  }

  updateEvent(id, patch) {
    const e = this._findEvent(id);
    const next = this._normEvent(Object.assign({}, e, patch || {}));
    Object.assign(e, next);
    this._sortEvents();
    this._log('Termin geändert', `${e.date}${e.time ? ' ' + e.time : ''}: ${e.title}`);
    this._save();
    return e;
  }

  deleteEvent(id) {
    const e = this._findEvent(id);
    this.data.events = this.data.events.filter((x) => x.id !== id);
    this._log('Termin gelöscht', `${e.date}${e.time ? ' ' + e.time : ''}: ${e.title}`);
    this._save();
    return true;
  }

  // Chronologisch: erst nach Datum, dann nach Uhrzeit (ganztägig zuerst)
  _sortEvents() {
    this.data.events.sort((a, b) => (a.date === b.date
      ? String(a.time || '').localeCompare(String(b.time || ''))
      : a.date.localeCompare(b.date)));
  }

  // ---- Einstellungen ----
  getSettings() { return this.data.settings; }

  // Nur bekannte Felder übernehmen und prüfen – ein fehlerhafter Wert aus der
  // Oberfläche darf die Auswertung nicht unbrauchbar machen.
  updateSettings(patch) {
    const p = patch || {};
    const next = Object.assign({}, this.data.settings);
    const num = (v, min, max, label) => {
      const n = Number(v);
      if (isNaN(n) || n < min || n > max) {
        throw new Error(`${label} muss zwischen ${min} und ${max} liegen.`);
      }
      return n;
    };
    if (p.targetHoursPerDay !== undefined) {
      next.targetHoursPerDay = num(p.targetHoursPerDay, 0, 24, 'Soll-Stunden pro Tag');
    }
    if (p.targetDaysPerWeek !== undefined) {
      next.targetDaysPerWeek = Math.round(num(p.targetDaysPerWeek, 1, 7, 'Arbeitstage pro Woche'));
    }
    if (p.roundingMinutes !== undefined) {
      next.roundingMinutes = Math.round(num(p.roundingMinutes, 0, 60, 'Rundung'));
    }
    if (p.theme !== undefined) {
      if (!THEMES.includes(p.theme)) throw new Error('Unbekanntes Design.');
      next.theme = p.theme;
    }
    if (p.notify !== undefined) next.notify = !!p.notify;
    if (p.notifyBefore !== undefined) {
      next.notifyBefore = Math.round(num(p.notifyBefore, 0, 240, 'Vorlaufzeit'));
    }
    if (p.hotkeyEnabled !== undefined) next.hotkeyEnabled = !!p.hotkeyEnabled;
    if (p.hotkey !== undefined) next.hotkey = normHotkey(p.hotkey);
    if (p.miniEnabled !== undefined) next.miniEnabled = !!p.miniEnabled;
    if (p.miniPosition !== undefined) {
      if (!MINI_POSITIONS.includes(p.miniPosition)) throw new Error('Unbekannte Position.');
      next.miniPosition = p.miniPosition;
    }
    if (p.language !== undefined) {
      if (!LANGUAGES.includes(p.language)) throw new Error('Unbekannte Sprache.');
      next.language = p.language;
    }
    if (p.dateFormat !== undefined) {
      if (!DATE_FORMATS.includes(p.dateFormat)) throw new Error('Unbekanntes Datumsformat.');
      next.dateFormat = p.dateFormat;
    }
    if (p.shortYear !== undefined) next.shortYear = !!p.shortYear;
    this.data.settings = next;
    // Ein reiner Designwechsel muss das Protokoll nicht füllen
    const nurTheme = Object.keys(p).length === 1 && p.theme !== undefined;
    if (!nurTheme) {
      this._log('Einstellungen geändert',
        `Soll/Tag ${this.data.settings.targetHoursPerDay} h, `
        + `Tage/Woche ${this.data.settings.targetDaysPerWeek}, `
        + `Rundung ${this.data.settings.roundingMinutes} min, `
        + `Erinnerung ${this.data.settings.notify
          ? this.data.settings.notifyBefore + ' min vorher' : 'aus'}`);
    }
    this._save();
    return this.data.settings;
  }

  // ---- Lesen ----
  getAll() { return this.data.sessions; }
  getLogs() { return this.data.logs; }

  clearLogs() {
    const n = this.data.logs.length;
    this.data.logs = [];
    this._log('Protokoll geleert', `${n} Einträge entfernt`);
    this._save();
  }
}

// ---- Helfer ----
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Wie lange nach dem Fälligkeitszeitpunkt eine Erinnerung noch gezeigt wird
const MELDE_FENSTER_MS = 10 * 60000;

// Ist eine Erinnerung für diesen Termin jetzt fällig?
// Bewusst hier statt im Hauptprozess, damit die Zeitrechnung testbar ist.
//   jetztMs  – aktuelle Zeit
//   vorlaufMin – Minuten Vorlauf aus den Einstellungen
// Das Fenster reicht bis mindestens zur echten Terminzeit: startet die App
// innerhalb der Vorlaufzeit, geht die Erinnerung dadurch nicht verloren.
function terminFaellig(event, jetztMs, vorlaufMin) {
  if (!event || !event.date) return false;
  if (!event.time) {
    // Ganztägig: nur am Tag selbst, ab dem Moment, in dem die App läuft
    return event.date === localDateKey(new Date(jetztMs));
  }
  const [hh, mm] = String(event.time).split(':').map(Number);
  const [y, mo, d] = String(event.date).split('-').map(Number);
  const terminMs = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
  const ab = terminMs - (Number(vorlaufMin) || 0) * 60000;
  const bis = Math.max(ab + MELDE_FENSTER_MS, terminMs);
  return jetztMs >= ab && jetztMs <= bis;
}

// Termin liegt so weit zurück, dass beim Programmstart nicht mehr erinnert wird
function terminVerpasst(event, jetztMs) {
  if (!event || !event.time) return false;
  const [hh, mm] = String(event.time).split(':').map(Number);
  const [y, mo, d] = String(event.date).split('-').map(Number);
  return new Date(y, mo - 1, d, hh, mm).getTime() + MELDE_FENSTER_MS < jetztMs;
}

// Kennzeichen einer Erinnerung: ändert sich Datum oder Uhrzeit, wird erneut
// erinnert – sonst bliebe ein verschobener Termin für immer stumm.
function terminSchluessel(event) {
  return `${event.id}|${event.date}|${event.time || ''}`;
}

// Prüft ein Tastenkürzel im Electron-Format (z. B. 'Control+Shift+T').
// Verlangt mindestens eine Zusatztaste und genau eine Haupttaste – sonst
// ließe sich versehentlich eine einzelne Buchstabentaste systemweit belegen.
const HOTKEY_MODS = ['Control', 'Alt', 'Shift', 'Super', 'CommandOrControl'];
const HOTKEY_KEYS = /^(?:[A-Z0-9]|F[1-9]|F1[0-2]|Space|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|Minus)$/;
// Kombinationen, die Windows braucht – die wollen wir nicht wegnehmen
const HOTKEY_TABU = ['Alt+F4', 'Alt+Tab', 'Control+Alt+Delete', 'Control+Shift+Escape'];

function normHotkey(value) {
  const teile = String(value || '').split('+').map((t) => t.trim()).filter(Boolean);
  if (teile.length < 2) {
    throw new Error('Das Kürzel braucht mindestens eine Zusatztaste, z. B. Strg + T.');
  }
  const mods = [];
  let key = null;
  for (const t of teile) {
    const mod = HOTKEY_MODS.find((m) => m.toLowerCase() === t.toLowerCase());
    if (mod) {
      if (!mods.includes(mod)) mods.push(mod);
      continue;
    }
    const k = t.length === 1 ? t.toUpperCase() : t;
    if (!HOTKEY_KEYS.test(k)) throw new Error(`Die Taste „${t}" lässt sich nicht als Kürzel verwenden.`);
    if (key) throw new Error('Bitte nur eine Haupttaste angeben.');
    key = k;
  }
  if (!mods.length) throw new Error('Das Kürzel braucht mindestens eine Zusatztaste, z. B. Strg + T.');
  if (!key) throw new Error('Bitte eine Taste zum Kürzel hinzufügen.');
  // Reihenfolge festlegen, damit gespeicherte Kürzel vergleichbar bleiben
  const sortiert = HOTKEY_MODS.filter((m) => mods.includes(m));
  const acc = [...sortiert, key].join('+');
  if (HOTKEY_TABU.includes(acc)) {
    throw new Error(`„${acc}" wird von Windows gebraucht – bitte eine andere Kombination wählen.`);
  }
  return acc;
}

// Prüft ein Datum 'YYYY-MM-DD' und gibt es normalisiert zurück.
// Fängt auch Kalender-Unfug wie '2026-02-31' ab (JS würde still weiterrollen).
function normDateKey(dateStr) {
  const str = String(dateStr).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new Error('Bitte ein gültiges Datum angeben.');
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (isNaN(+dt) || localDateKey(dt) !== str) throw new Error('Bitte ein gültiges Datum angeben.');
  return str;
}

// Baut ein lokales Date aus 'YYYY-MM-DD' + 'HH:MM'
function buildLocal(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// Prüft, ob es die gewünschte Uhrzeit an dem Tag überhaupt gibt. In der Nacht
// der Zeitumstellung fehlt eine Stunde – JS rollt dann stillschweigend weiter.
function checkExists(dt, dateStr, timeStr) {
  if (isNaN(+dt)) throw new Error('Ungültige Zeitangabe.');
  if (hm(dt) !== String(timeStr).slice(0, 5) || localDateKey(dt) !== dateStr) {
    throw new Error(`Die Uhrzeit ${timeStr} gibt es am ${dateStr} nicht (Zeitumstellung).`);
  }
}

// Verschiebt einen Zeitpunkt um n Kalendertage und behält die Uhrzeit exakt bei –
// inklusive Sekunden. Kalendarisch statt „+24 h", damit die Zeitumstellung
// die Uhrzeit nicht verrutschen lässt.
function shiftDays(iso, days) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days,
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

// Der Kalendertag nach dateStr ('YYYY-MM-DD')
function nextDay(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d + 1));
}

// Anzahl Kalendertage zwischen zwei Datums-Schlüsseln (b − a)
function dayDiff(a, b) {
  const [ay, am, ad] = String(a).split('-').map(Number);
  const [by, bm, bd] = String(b).split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

// Baut das „Gehen" zu einem „Kommen". Liegt die Uhrzeit nicht nach dem Beginn,
// gehört sie zum Folgetag – so lassen sich Nachtschichten über Mitternacht
// als EIN Eintrag erfassen (z. B. 22:00 bis 06:00).
function buildEnd(dateStr, inD, outHM) {
  let outD = buildLocal(dateStr, outHM);
  checkExists(outD, dateStr, outHM);
  if (outD.getTime() === inD.getTime()) {
    throw new Error('„Kommen" und „Gehen" dürfen nicht dieselbe Uhrzeit sein.');
  }
  let endDate = dateStr;
  if (outD < inD) {
    endDate = nextDay(dateStr);
    outD = buildLocal(endDate, outHM);
    checkExists(outD, endDate, outHM);
  }
  if (outD - inD > 24 * 3600000) {
    throw new Error('Ein Eintrag darf höchstens 24 Stunden umfassen.');
  }
  return { date: endDate, at: outD, overnight: endDate !== dateStr };
}

// 'HH:MM' aus Date (lokal)
function hm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Lokaler Datums-Schlüssel YYYY-MM-DD (nicht UTC), damit Tage stimmen
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  Store, localDateKey, terminFaellig, terminVerpasst, terminSchluessel, MELDE_FENSTER_MS,
  LANGUAGES, DATE_FORMATS,
};

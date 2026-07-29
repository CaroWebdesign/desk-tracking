// Datenschicht: lädt und speichert Sitzungen, Logs und Einstellungen in einer
// JSON-Datei im Datenordner („Dokumente\Stempeluhr"). Keine native DB nötig.
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  targetHoursPerDay: 8,   // Soll-Stunden pro Tag (Stunden, dezimal erlaubt)
  targetDaysPerWeek: 5,   // Arbeitstage pro Woche
  roundingMinutes: 0,     // Anzeige-Rundung der Netto-Zeit (0 = aus)
  activeProjectId: null,  // aktuell für neue Stempelungen gewähltes Projekt
};

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
    const outD = buildLocal(date, clockOut);
    if (isNaN(+inD) || isNaN(+outD)) throw new Error('Ungültige Zeitangabe.');
    if (outD <= inD) throw new Error('„Gehen" muss nach „Kommen" liegen.');

    const pid = this._resolveProjectId(projectId);
    const session = {
      id: newId(), projectId: pid, date,
      clockIn: inD.toISOString(),
      clockOut: outD.toISOString(),
      breaks: [],
    };
    for (const b of breaks) {
      if (!b || (!b.start && !b.end)) continue;
      session.breaks.push(this._mkBreak(session, b.start, b.end));
    }
    this.data.sessions.push(session);
    this._log('Block hinzugefügt', `${date} ${clockIn}–${clockOut} · ${this._projectName(pid)}`
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
      const outD = buildLocal(newDate, clockOut);
      checkExists(outD, newDate, clockOut);
      if (outD <= inD) throw new Error('„Gehen" muss nach „Kommen" liegen.');
      outISO = outD.toISOString();
    } else {
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
    // Beim Tageswechsel wandern die Pausen zur selben Uhrzeit mit – sekunden-
    // genau, damit sich die Netto-Zeit durch das Verschieben nicht ändert.
    const breaks = s.breaks.map((b) => (dateChanged
      ? {
        start: moveToDate(b.start, newDate).toISOString(),
        end: b.end ? moveToDate(b.end, newDate).toISOString() : null,
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
  _mkBreak(session, startHHMM, endHHMM) {
    if (!startHHMM || !endHHMM) throw new Error('Pause: bitte „von" und „bis" angeben.');
    const bs = buildLocal(session.date, startHHMM);
    const be = buildLocal(session.date, endHHMM);
    if (isNaN(+bs) || isNaN(+be)) throw new Error('Ungültige Pausenzeit.');
    if (be <= bs) throw new Error('Pausenende muss nach Pausenbeginn liegen.');
    const lo = new Date(session.clockIn).getTime();
    const hi = session.clockOut ? new Date(session.clockOut).getTime() : Date.now();
    if (bs.getTime() < lo || be.getTime() > hi) {
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
    this.data.settings = next;
    this._log('Einstellungen geändert',
      `Soll/Tag ${this.data.settings.targetHoursPerDay} h, `
      + `Tage/Woche ${this.data.settings.targetDaysPerWeek}, `
      + `Rundung ${this.data.settings.roundingMinutes} min`);
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

// Verschiebt einen Zeitpunkt auf ein anderes Datum und behält die Uhrzeit
// exakt bei – inklusive Sekunden und Millisekunden.
function moveToDate(iso, dateStr) {
  const d = new Date(iso);
  const [y, m, day] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, day, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
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

module.exports = { Store, localDateKey };

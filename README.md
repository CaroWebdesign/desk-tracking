# 🕒 Stempeluhr

Zeiterfassung für Windows. Du drückst „Kommen", arbeitest, drückst „Gehen" — die App
rechnet Pausen ab, ordnet die Zeit einem Projekt zu und erstellt daraus am Monatsende
eine Aufstellung als CSV oder PDF.

Alles bleibt auf deinem Rechner: keine Cloud, kein Konto, keine Anmeldung.

## Installieren

Lade die neueste `Stempeluhr-Setup-<version>.exe` von der
[Releases-Seite](https://github.com/CaroWebdesign/desk-tracking/releases) und führe sie aus.

Die Installation braucht **keine Administratorrechte**. Sie legt Verknüpfungen auf dem
Desktop und im Startmenü an und startet die App danach sofort.

> **Windows zeigt eine blaue Warnung?** „Der Computer wurde durch Windows geschützt" —
> das erscheint bei jedem Programm ohne gekauftes Signatur-Zertifikat, auch bei diesem.
> Klicke auf *Weitere Informationen* und dann auf *Trotzdem ausführen*.
> Bei späteren Updates kommt die Meldung nicht mehr.

## So arbeitest du damit

Oben wählst du das Projekt, dann drückst du **Kommen**. Die Uhr läuft mit, du siehst
jederzeit, wie lange du heute schon gearbeitet hast. Für eine Mittagspause drückst du
**Pause starten** und danach **Pause beenden** — die Zeit wird automatisch abgezogen.
Am Ende **Gehen**.

Du kannst mehrmals am Tag ein- und ausstempeln, etwa vormittags für einen Kunden und
abends für einen anderen. Jeder dieser Abschnitte ist ein eigener **Block**.

**Etwas vergessen oder falsch gestempelt?** Klicke in der Auswertung auf die Tageszeile.
Dort lassen sich Datum, Kommen, Gehen, Projekt und Pausen jedes Blocks ändern, Blöcke
hinzufügen oder löschen. Über das Datumsfeld verschiebst du einen Block auf einen anderen
Tag, falls du dich im Datum vertan hast.

Für Zeiten, die du gar nicht gestempelt hast, gibt es **+ Zeit nachtragen**.

### Projekte und Abrechnung

Jedes Projekt hat einen Stundensatz. Trägst du dort `0` ein, gilt das Projekt als nicht
abgerechnet — es taucht in den Stunden auf, aber ohne Betrag. Sobald ein Auftrag fertig
ist, klickst du auf **Abschließen**: Das Projekt verschwindet aus der Auswahl beim
Stempeln, bleibt aber in allen Auswertungen sichtbar. Über **Öffnen** holst du es zurück.

### Auswerten und exportieren

Die **Auswertung** zeigt dir jeden Tag des gewählten Monats mit Kommen, Gehen, Pausen und
Netto-Zeit. Das **Dashboard** ergänzt Kennzahlen: Stunden und Umsatz pro Projekt,
Soll/Ist-Saldo, Vergleich mit den Vormonaten.

Zum Exportieren gibt es drei Wege:

| Was | Wo | Inhalt |
|-----|-----|--------|
| **CSV exportieren** | Auswertung | Der gewählte Monat: jeder Block einzeln, darunter die Tagessummen |
| **Als PDF speichern** | Auswertung | Dieselbe Tabelle als PDF, zum Verschicken oder Ablegen |
| **Export** | Projekte, je Zeile | Ein einzelnes Projekt komplett: alle Monate, mit Pausen, Beträgen und Monatssummen |

Die CSV-Dateien öffnen sich in Excel mit korrekten Umlauten; Beträge und Stunden stehen
mit deutschem Komma drin und lassen sich direkt weiterrechnen.

## Wo deine Zeiten gespeichert sind

In einer einzigen Datei:

```
Dokumente\Stempeluhr\times.json
```

Diesen Ordner öffnest du direkt aus der App über **Einstellungen → Datenspeicher →
Ordner öffnen**. Eine Kopie dieser Datei ist ein vollständiges Backup — sie enthält
Zeiten, Projekte, Einstellungen und das Änderungsprotokoll.

Die Datei liegt bewusst nicht im Programmordner. Der Windows-Installer leert diesen
Ordner bei jedem Update vollständig; alles, was dort liegt, wäre danach weg. Unter
„Dokumente" überstehen deine Zeiten Updates und selbst eine Deinstallation.

Zusätzlich schützt die App die Daten von sich aus:

- Bei jedem Start legt sie eine Sicherung `times.backup-JJJJ-MM-TT.json` an; die letzten
  acht bleiben liegen. Vor jedem Update kommt eine weitere dazu.
- Beim Speichern schreibt sie erst eine Nebendatei und benennt sie dann um. Stürzt der
  Rechner mitten im Speichern ab, bleibt die alte Datei unbeschädigt.
- Lässt sich die Datei nicht lesen, weil sie beschädigt ist, **startet die App bewusst
  nicht**. Sie sagt dir, was los ist, und öffnet den Ordner mit den Sicherungen. So kann
  sie deine Zeiten nicht versehentlich mit einem leeren Stand überschreiben.
- Die App läuft nur einmal gleichzeitig. Zwei offene Fenster würden sich sonst
  gegenseitig überschreiben.

Ist etwas kaputt gegangen: Benenne eine der `times.backup-…json` in `times.json` um,
und der Stand von damals ist wieder da.

## Updates

Die App prüft bei jedem Start, ob es eine neuere Version gibt, lädt sie im Hintergrund
und installiert sie, sobald du das Programm schließt. Du musst nichts weiter tun.

Unter **Einstellungen → Updates** siehst du deine Version, kannst von Hand nach Updates
suchen und ein geladenes Update sofort einspielen.

Deine erfassten Zeiten bleiben dabei unangetastet.

## Für Entwickler

```powershell
npm install
npm start        # App im Entwicklungsmodus starten
npm test         # Logiktests der Datenschicht
```

Electron mit `contextIsolation`, ohne `nodeIntegration`; die Oberfläche spricht
ausschließlich über eine schmale Bridge in `preload.js` mit dem Hauptprozess.
Gespeichert wird in JSON — bewusst keine native Datenbank, damit der Build ohne
Compiler-Toolchain auskommt.

| Datei | Zweck |
|-------|-------|
| `main.js` | Hauptprozess: Fenster, IPC, Datenordner, Sicherungen, Updater |
| `preload.js` | Bridge zwischen Oberfläche und Hauptprozess |
| `store.js` | Datenschicht: Stempel- und Editier-Logik, Projekte, Protokoll |
| `src/` | Oberfläche (`index.html`, `styles.css`, `renderer.js`) |
| `build/installer.nsh` | Installer-Hook, der Altdaten aus dem Programmordner rettet |
| `test-store.js` | Tests der Datenschicht (`npm test`) |

Beim Ändern der Datenschicht gilt: `store.js` kennt kein Electron und ist damit ohne
GUI testbar. `STEMPEL_DATA_DIR` überschreibt den Speicherort, etwa für Testläufe.

## Gut zu wissen

Es kann immer nur eine Sitzung gleichzeitig laufen; beim „Gehen" wird eine noch offene
Pause automatisch mitbeendet. Nur der heutige Tag kann eine laufende Sitzung haben —
ältere Einträge lassen sich nicht wieder öffnen, sonst würde die Arbeitszeit ins
Unendliche weiterlaufen.

Ein Block liegt immer innerhalb eines Kalendertages. Arbeitest du über Mitternacht,
erfasst du das als zwei Blöcke.

Die Rundung in den Einstellungen betrifft nur die Anzeige. Gespeichert bleiben immer die
exakten Zeiten, sodass du die Rundung jederzeit ändern kannst, ohne Daten zu verlieren.

# 🕒 Stempeluhr

Einfache Zeiterfassung als Windows-Desktop-App (Electron). Stempeln per Knopfdruck,
Pausen werden automatisch abgezogen, Projekte mit Stundensatz, Monatsauswertung
und Export inklusive. Alle Daten bleiben lokal auf dem Rechner.

## Funktionen

- **Kommen / Gehen** – Arbeitszeit per Knopfdruck erfassen; **beliebig oft pro Tag** ein- und ausstempeln
- **Pausen** – Pause starten/beenden, **mehrfach pro Sitzung**; wird automatisch von der Netto-Arbeitszeit abgezogen
- **Live-Anzeige** – heutige Arbeitszeit läuft sekundengenau mit
- **Projekte** – jede Stempelung gehört zu einem Projekt, jedes Projekt hat einen **Stundensatz** (€/h; 0 = ohne Entlohnung). Projekte lassen sich **abschließen** und wieder öffnen
- **Auswertung** – Monatsübersicht mit einem Eintrag pro Tag, Projekt-Filter und Summen
- **Tagesdetails & Bearbeiten** – Klick auf eine Tageszeile öffnet ein Fenster, in dem sich **Datum, Kommen/Gehen, Projekt und Pausen** jedes Arbeitsblocks bearbeiten lassen. Über das Datumsfeld wandert ein Block auf einen anderen Tag – die Pausen wandern sekundengenau mit
- **Zeit nachtragen** – vergangene, nicht gestempelte Zeiten manuell erfassen
- **Dashboard** – Monats-Kennzahlen, Stunden und Umsatz je Projekt, Tagesbalken mit Soll-Linie, Soll/Ist-Saldo, Monatsvergleich
- **Export**
  - **pro Monat** (mit Projekt-Filter) aus der Auswertung
  - **pro Projekt** – alle Zeiten über alle Monate, mit Pausen, Netto-Stunden, Beträgen und Monatssummen (Schaltfläche „Export" in der Projektzeile)
  - beides als CSV (Excel-tauglich, mit BOM) oder als „Drucken / PDF"
- **Automatische Updates** – die App prüft beim Start, ob eine neuere Version vorliegt, lädt sie im Hintergrund und installiert sie beim Beenden
- **Änderungsprotokoll (Logs)** – jede Änderung wird mit Zeitpunkt protokolliert
- **Einstellungen** – Soll-Stunden pro Tag, Arbeitstage pro Woche, Anzeige-Rundung (5/15/30 min)

## Wo werden die Daten gespeichert?

In **`Dokumente\Stempeluhr\times.json`**.

Bewusst **außerhalb** des Programmordners: Der Windows-Installer räumt bei jedem
Update den kompletten Installationsordner ab (`RMDir /r`). Alles, was dort liegt –
auch eine Datendatei – wäre nach einem Update weg. Unter „Dokumente" überstehen
die Zeiten Updates und sogar eine Deinstallation.

Zusätzlich:

- Beim Programmstart legt die App eine Sicherung `times.backup-JJJJ-MM-TT.json` an
  (die letzten acht bleiben erhalten), vor jedem Update eine weitere mit Uhrzeit.
- Ist die Datei beschädigt oder nicht lesbar, **startet die App bewusst nicht** und
  meldet das, statt mit leeren Daten weiterzulaufen und die Datei zu überschreiben.
- Gespeichert wird immer erst in eine Nebendatei, die anschließend umbenannt wird –
  ein Absturz mitten im Schreiben kann keine halbe Datei hinterlassen.
- Der Speicherort steht in den **Einstellungen** und lässt sich dort direkt öffnen.

Zum Sichern genügt eine Kopie der `times.json` – sie enthält Zeiten, Projekte,
Einstellungen und das Protokoll.

### Umstieg von Version 1.1.0 oder älter

Bis 1.1.0 lag die `times.json` im Programmordner. Beim Update auf 1.2.0 wird sie
automatisch nach `Dokumente\Stempeluhr` übernommen – doppelt abgesichert: einmal
durch den Installer, bevor er den alten Ordner leert, und einmal beim ersten Start
der neuen Version. Eine bereits vorhandene Datei am Zielort wird dabei **nie**
überschrieben.

## Installieren

Neueste Version herunterladen: **[Releases](https://github.com/CaroWebdesign/desk-tracking/releases)** →
`Stempeluhr-Setup-<version>.exe` ausführen.

Es ist ein benutzerbezogener Installer (kein Admin nötig): installiert nach
`%LOCALAPPDATA%\Programs\Stempeluhr`, legt Desktop- und Startmenü-Verknüpfung an
und startet danach sofort.

> Da die App nicht mit einem kostenpflichtigen Zertifikat signiert ist, zeigt
> Windows beim **ersten** Download „Der Computer wurde durch Windows geschützt" →
> *Weitere Informationen* → *Trotzdem ausführen*. Spätere automatische Updates
> laufen ohne diese Meldung.

## Aus dem Quellcode starten (Entwicklung)

```powershell
npm install
npm start        # App starten
npm test         # Logiktests der Datenschicht
```

## Neue Version veröffentlichen

1. `version` in der `package.json` erhöhen (z. B. `1.2.1`).
2. Persönliches GitHub-Token mit `repo`-Rechten setzen und bauen:

   ```powershell
   $env:GH_TOKEN = "<dein-token>"
   npm run release
   ```

   Das baut den Installer und lädt ihn als **veröffentlichtes** Release hoch.
3. Fertig – installierte Stempeluhren finden die neue Version beim nächsten Start.

Falls von Hand hochgeladen wird, müssen **alle drei** Dateien aus `dist\` in
dasselbe Release, unter unverändertem Namen:
`Stempeluhr-Setup-<version>.exe`, `latest.yml` und die `.blockmap`-Datei.
Ohne `latest.yml` findet die App kein Update. Das Release darf **kein Entwurf**
(Draft) sein, sonst ist es für die App unsichtbar.

## Projektstruktur

| Datei                  | Zweck                                                        |
|------------------------|--------------------------------------------------------------|
| `main.js`              | Hauptprozess: Fenster, IPC, Datenordner, Sicherungen, Updater |
| `preload.js`           | Sichere Brücke zwischen Oberfläche und Hauptprozess           |
| `store.js`             | Datenschicht (laden/speichern, Stempel-/Edit-Logik, Projekte, Logs) |
| `src/index.html`       | Oberfläche                                                    |
| `src/styles.css`       | Gestaltung (inkl. Druck-Layout)                               |
| `src/renderer.js`      | Logik der Oberfläche, Auswertung, CSV-Export                  |
| `build/installer.nsh`  | Installer-Hook, der Altdaten aus dem Programmordner rettet     |
| `build-icon.js`        | Erzeugt `icon.ico` / `icon.png`                               |
| `test-store.js`        | Logiktests der Datenschicht (`npm test`)                      |

## Hinweise

- Es kann immer nur **eine** Sitzung gleichzeitig laufen; beim „Gehen" wird eine
  noch laufende Pause automatisch mitbeendet.
- Nur der heutige Tag kann eine laufende Sitzung haben – ältere Einträge lassen
  sich nicht wieder „öffnen".
- Ein Arbeitsblock liegt immer innerhalb eines Kalendertages; Schichten über
  Mitternacht werden als zwei Blöcke erfasst.
- Die App läuft nur einmal gleichzeitig – ein zweiter Start holt das vorhandene
  Fenster nach vorn, damit sich zwei Fenster nicht gegenseitig überschreiben.

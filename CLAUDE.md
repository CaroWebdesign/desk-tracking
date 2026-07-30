# Desk Tracking

Zeiterfassung als Windows-Desktop-App (Electron): Kommen/Gehen stempeln, Pausen
abziehen, Zeiten auf Projekte buchen, Monatsaufstellung als CSV oder PDF. Dazu
Kalender, Dashboard und ein Mini-Bedienfeld für den Schnellzugriff, in sechs
Sprachen. Der lokale Ordner heißt noch „Stempeluhr", das Produkt seit 1.8.1
„Desk Tracking" — dasselbe Ding.

## Referenzfähigkeit

**referenzfaehig: nein** — Hobby-Projekt ohne Architektur-Anspruch: kein Bundler,
kein Framework, Tests nur für `store` und `i18n`.

Das ist für eine kleine Desktop-App völlig in Ordnung, aber **kein Muster für
irgendetwas anderes**. Ohne ausdrückliches `ja` gilt `nein`: nichts von hier als
Vorlage für ein anderes Projekt übernehmen — keine Architektur, keine
Konventionen, keine Snippets. Auch nicht, wenn es hier funktioniert.

## Stack

- Electron 33, reines JavaScript ohne Build-Schritt im Renderer
- Paketierung: `electron-builder`, Releases über GitHub
- Bauen: `npm run dist` · Veröffentlichen: `npm run release`
- Testen: `npm test` (`test-store.js` + `test-i18n.js`)

## Aufbau

```
main.js        Electron-Hauptprozess, Fensterverwaltung, Auto-Update
preload.js     Brücke zwischen Haupt- und Renderer-Prozess
store.js       Persistenz der Zeitdaten
src/
├── index.html / renderer.js / styles.css   Hauptfenster
├── mini.html  / mini.js     / mini.css     Mini-Bedienfeld
├── i18n.js                                 sechs Sprachen
└── changelog.js
```

## Konventionen

- Conventional Commits (`feat:`, `fix:`, `chore:` …), Beschreibung auf Deutsch.
  Release-Commits tragen die Version vorn: `1.9.0: Automatische Updates abschaltbar`.
- Oberflächentexte laufen **immer** über `i18n.js` — nie fest verdrahtet. Eine
  neue Zeichenkette heißt: alle sechs Sprachen ergänzen.
- **Die Zeitdaten des Nutzers gehören nie ins Repository.** `.gitignore` mustert
  `times*` bewusst ohne Endung, weil bei Umzügen und Reparaturen Kopien mit
  allerlei Endungen entstehen (`times.json.alt`, `times.backup-vor-umzug.json`);
  ein Muster auf `.json` ließe genau die durch, die keine solche Endung tragen.

## Arbeitsweise

Denken → ändern → **in einem echten Test prüfen** → bei Bedarf nachbessern.
Bei Änderungen an Persistenz oder Sprachen `npm test` laufen lassen, bei
UI-Änderungen die App wirklich starten und hinsehen.

## Lizenz

MIT — siehe [LICENSE](LICENSE).

@CLAUDE.local.md

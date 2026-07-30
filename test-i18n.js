// Prüft die Übersetzungen – ohne Electron/GUI.
// Findet drei Fehlerarten, die im laufenden Betrieb sonst erst auffallen,
// wenn ein Nutzer die Sprache wechselt:
//   1. ein Schlüssel fehlt in einer Sprache
//   2. ein Schlüssel ist im selben Sprachblock doppelt vergeben (der zweite
//      überschreibt den ersten stillschweigend)
//   3. im HTML oder in den Skripten steht deutscher Text ohne Schlüssel
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = path.join(__dirname, 'src');
const lies = (name) => fs.readFileSync(path.join(src, name), 'utf8');

// i18n.js läuft ohne Electron: als Modul auswerten
const modul = { exports: {} };
new Function('module', 'exports', lies('i18n.js'))(modul, modul.exports);
const { STRINGS, ERRORS, LANG_META, MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_MON } = modul.exports;

const SPRACHEN = ['de', 'en', 'fr', 'es', 'ja', 'zh'];
let fehler = 0;
const melde = (text) => { console.error('  FEHLER ' + text); fehler++; };

// ---------- 1) Vollständigkeit ----------
assert.deepStrictEqual(Object.keys(STRINGS).sort(), [...SPRACHEN].sort(),
  'genau die sechs erwarteten Sprachen');

const basis = Object.keys(STRINGS.de);
for (const s of SPRACHEN) {
  if (s === 'de') continue;
  const fehlt = basis.filter((k) => STRINGS[s][k] === undefined);
  const zuviel = Object.keys(STRINGS[s]).filter((k) => STRINGS.de[k] === undefined);
  if (fehlt.length) melde(s + ': ' + fehlt.length + ' Schlüssel fehlen – ' + fehlt.slice(0, 8).join(', '));
  if (zuviel.length) melde(s + ': ' + zuviel.length + ' Schlüssel gibt es nur dort – ' + zuviel.slice(0, 8).join(', '));
}
console.log('Oberflächentexte: ' + basis.length + ' Schlüssel × ' + SPRACHEN.length + ' Sprachen');

// Leere Werte fallen sonst als unsichtbare Beschriftung auf
for (const s of SPRACHEN) {
  const leer = Object.entries(STRINGS[s]).filter(([, v]) => typeof v !== 'string' || !v.trim());
  if (leer.length) melde(s + ': leere Texte bei ' + leer.map(([k]) => k).join(', '));
}

// Platzhalter müssen in jeder Sprache dieselben sein, sonst fehlt eine Zahl
for (const k of basis) {
  const soll = (STRINGS.de[k].match(/\{\d+\}/g) || []).sort().join('');
  for (const s of SPRACHEN) {
    if (s === 'de' || STRINGS[s][k] === undefined) continue;
    const ist = (STRINGS[s][k].match(/\{\d+\}/g) || []).sort().join('');
    if (ist !== soll) melde(s + '/' + k + ': Platzhalter "' + ist + '" statt "' + soll + '"');
  }
}

// ---------- 2) Doppelte Schlüssel im Quelltext ----------
// Nach dem Auswerten wäre ein Duplikat unsichtbar – daher zeilenweise prüfen.
{
  let block = null;
  const gesehen = new Map();
  lies('i18n.js').split(/\r?\n/).forEach((z, i) => {
    const kopf = /^\s{2}(de|en|fr|es|ja|zh):\s*\{/.exec(z)
      || /^\s*\w+\.(de|en|fr|es|ja|zh)\s*=\s*\{/.exec(z);
    if (kopf) { block = kopf[1]; gesehen.clear(); return; }
    if (!block) return;
    const eintrag = /^\s+'((?:[^'\\]|\\.)*)':/.exec(z);
    if (!eintrag) return;
    if (gesehen.has(eintrag[1])) {
      melde(block + ': "' + eintrag[1] + '" doppelt (Zeile ' + gesehen.get(eintrag[1]) + ' und ' + (i + 1) + ')');
    } else {
      gesehen.set(eintrag[1], i + 1);
    }
  });
}

// ---------- 3) Monats- und Wochentagsnamen ----------
for (const s of SPRACHEN) {
  if (!LANG_META[s]) melde(s + ': kein Eintrag in LANG_META');
  if (!MONTHS[s] || MONTHS[s].length !== 12) melde(s + ': MONTHS unvollständig');
  if (!MONTHS_SHORT[s] || MONTHS_SHORT[s].length !== 12) melde(s + ': MONTHS_SHORT unvollständig');
  if (!WEEKDAYS[s] || WEEKDAYS[s].length !== 7) melde(s + ': WEEKDAYS unvollständig');
  if (!WEEKDAYS_MON[s] || WEEKDAYS_MON[s].length !== 7) melde(s + ': WEEKDAYS_MON unvollständig');
}

// ---------- 4) Jeder verwendete Schlüssel muss existieren ----------
const htmlQuellen = ['index.html', 'mini.html'].map(lies).join('\n');
const skripte = ['renderer.js', 'mini.js'].map(lies).join('\n');
const benutzt = new Set();
for (const re of [/data-i18n="([^"]+)"/g, /data-i18n-title="([^"]+)"/g, /data-i18n-ph="([^"]+)"/g]) {
  let m; while ((m = re.exec(htmlQuellen)) !== null) benutzt.add(m[1]);
}
{
  let m;
  const re = /\bt\(\s*'([a-zA-Z][\w.]*)'/g;
  while ((m = re.exec(skripte)) !== null) benutzt.add(m[1]);
}
const unbekannt = [...benutzt].filter((k) => STRINGS.de[k] === undefined);
if (unbekannt.length) melde('verwendet, aber nicht übersetzt: ' + unbekannt.join(', '));
console.log('Verwendete Schlüssel: ' + benutzt.size);

// ---------- 5) Kein deutscher Text ohne Schlüssel ----------
// Abgleich gegen die deutschen Werte: was dort wörtlich vorkommt, gehört
// durch t() und nicht als Literal in den Code.
{
  const nachText = new Map();
  for (const [k, v] of Object.entries(STRINGS.de)) {
    const rein = v.replace(/\{\d+\}/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    // kurze Wörter wie „Tag" kommen auch als interner Bezeichner vor
    if (rein.length >= 8 && !nachText.has(rein)) nachText.set(rein, k);
  }
  for (const name of ['renderer.js', 'mini.js']) {
    const ohneKommentar = lies(name)
      .replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:'"\\`])\/\/[^\n]*/g, (x, v) => v + x.slice(v.length).replace(/./g, ' '));
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = re.exec(ohneKommentar)) !== null) {
      const roh = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
      if (roh === undefined || STRINGS.de[roh] !== undefined) continue;
      if (/\bt(?:Err)?\(\s*$/.test(ohneKommentar.slice(Math.max(0, m.index - 14), m.index))) continue;
      const zeile = ohneKommentar.slice(0, m.index).split('\n').length;
      const sichtbar = roh.replace(/\$\{[\s\S]*?\}/g, '\u0000').replace(/<[^>]*>/g, '\u0000');
      for (let stueck of sichtbar.split('\u0000')) {
        stueck = stueck.replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
        // Ein einzelnes Wort in Kleinbuchstaben ist ein interner Bezeichner
        // (showView('kalender'), Tab-Namen) und kein Oberflächentext.
        if (!/\s/.test(stueck) && !/[A-ZÄÖÜ]/.test(stueck)) continue;
        const schluessel = nachText.get(stueck.toLowerCase());
        if (schluessel) melde(name + ':' + zeile + ' fester Text statt t(\'' + schluessel + '\')');
      }
    }
  }
  // Dasselbe fürs HTML: sichtbarer Text in einem Element ohne data-i18n
  const reTag = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>([^<]*)/g;
  let m;
  while ((m = reTag.exec(htmlQuellen)) !== null) {
    if (/data-i18n(?:=|\s|>)/.test(m[2] || '')) continue;
    const text = (m[3] || '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const schluessel = nachText.get(text);
    if (schluessel) melde('HTML <' + m[1] + '> fester Text statt data-i18n="' + schluessel + '"');
  }
}

// ---------- 6) Änderungsliste ----------
// Eigene Datei, eigene Struktur – ohne Prüfung fiele eine fehlende Sprache
// erst auf, wenn jemand die Oberfläche umstellt und dort deutsche Sätze liest.
{
  const chgModul = { exports: {} };
  new Function('module', 'exports', lies('changelog.js'))(chgModul, chgModul.exports);
  const { CHANGELOG } = chgModul.exports;
  if (!Array.isArray(CHANGELOG) || !CHANGELOG.length) {
    melde('changelog.js enthält keine Einträge');
  } else {
    for (const e of CHANGELOG) {
      if (!/^\d+\.\d+\.\d+$/.test(e.version || '')) melde('Changelog: Version "' + e.version + '" unerwartet');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum || '')) melde('Changelog ' + e.version + ': Datum "' + e.datum + '" unerwartet');
      const anzahl = (e.punkte && e.punkte.de) ? e.punkte.de.length : 0;
      if (!anzahl) melde('Changelog ' + e.version + ': keine deutschen Punkte');
      for (const s of SPRACHEN) {
        const p = e.punkte ? e.punkte[s] : null;
        if (!Array.isArray(p) || !p.length) { melde('Changelog ' + e.version + ': ' + s + ' fehlt'); continue; }
        if (p.length !== anzahl) {
          melde('Changelog ' + e.version + '/' + s + ': ' + p.length + ' Punkte statt ' + anzahl);
        }
        const leer = p.filter((x) => typeof x !== 'string' || !x.trim());
        if (leer.length) melde('Changelog ' + e.version + '/' + s + ': leerer Punkt');
      }
    }
    // Absteigend sortiert? Sonst stünde eine alte Version oben.
    const zerlege = (v) => v.split('.').map(Number);
    for (let i = 1; i < CHANGELOG.length; i++) {
      const a = zerlege(CHANGELOG[i - 1].version);
      const b = zerlege(CHANGELOG[i].version);
      let neuerZuerst = false;
      for (let k = 0; k < 3; k++) {
        if (a[k] !== b[k]) { neuerZuerst = a[k] > b[k]; break; }
      }
      if (!neuerZuerst) {
        melde('Changelog: ' + CHANGELOG[i - 1].version + ' steht über ' + CHANGELOG[i].version);
      }
    }
    console.log('Änderungsliste: ' + CHANGELOG.length + ' Versionen × ' + SPRACHEN.length + ' Sprachen');
  }
}

// ---------- 7) Fehlermeldungen der Datenschicht ----------
// Die Datenschicht meldet auf Deutsch; ERRORS bildet das je Sprache ab.
// Lücken sind erlaubt (der Urtext erscheint dann), werden aber gezeigt.
const abdeckung = SPRACHEN.filter((s) => s !== 'de')
  .map((s) => s + ': ' + Object.keys(ERRORS[s] || {}).length);
console.log('Fehlermeldungen übersetzt – ' + abdeckung.join(' / '));
for (const s of SPRACHEN) {
  if (s === 'de') continue;
  if (!ERRORS[s]) melde(s + ': kein ERRORS-Block');
}

if (fehler) {
  console.error('\n' + fehler + ' Problem(e) gefunden.');
  process.exit(1);
}
console.log('OK – Übersetzungen vollständig und widerspruchsfrei.');

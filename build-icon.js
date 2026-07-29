// Erzeugt icon.ico (und icon.png als Vorschau) mit einer einfachen Uhr.
// Aufruf: node build-icon.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const S = 256;            // Zeichenfläche
const c = S / 2;          // Mittelpunkt
const faceR = 92;         // Radius Zifferblatt

// --- Stundenstriche rund ums Zifferblatt ---
let ticks = '';
for (let i = 0; i < 12; i++) {
  const a = (i * 30) * Math.PI / 180;     // Winkel im Uhrzeigersinn, 0 = oben
  const dx = Math.sin(a), dy = -Math.cos(a);
  const outer = 78, len = i % 3 === 0 ? 16 : 10;
  const w = i % 3 === 0 ? 7 : 4;
  const x1 = c + dx * outer, y1 = c + dy * outer;
  const x2 = c + dx * (outer - len), y2 = c + dy * (outer - len);
  ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" `
    + `stroke="#334155" stroke-width="${w}" stroke-linecap="round"/>`;
}

// --- Zeiger: Stunde auf 10, Minute auf 2 ---
function hand(hourPos, length, width, color) {
  const a = (hourPos * 30) * Math.PI / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const x = c + dx * length, y = c + dy * length;
  return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" `
    + `stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#1e3a8a"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- Hintergrund (abgerundetes Quadrat) -->
  <rect x="8" y="8" width="${S - 16}" height="${S - 16}" rx="52" fill="url(#bg)"/>

  <!-- Zifferblatt -->
  <circle cx="${c}" cy="${c}" r="${faceR}" fill="#f8fafc" filter="url(#shadow)"/>
  <circle cx="${c}" cy="${c}" r="${faceR}" fill="none" stroke="#e2e8f0" stroke-width="3"/>

  ${ticks}

  <!-- Zeiger -->
  ${hand(10, 48, 11, '#1e293b')}
  ${hand(2, 66, 8, '#1e293b')}

  <!-- Sekundenzeiger-Akzent + Mittelpunkt -->
  ${hand(7, 60, 3, '#22c55e')}
  <circle cx="${c}" cy="${c}" r="9" fill="#1e293b"/>
  <circle cx="${c}" cy="${c}" r="4" fill="#22c55e"/>
</svg>`;

const sizes = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  const svgBuf = Buffer.from(svg);

  // Vorschau-PNG (256px)
  await sharp(svgBuf).resize(256, 256).png().toFile(path.join(__dirname, 'icon.png'));

  // PNGs in allen Größen für die ICO
  const pngs = await Promise.all(
    sizes.map((sz) => sharp(svgBuf).resize(sz, sz).png().toBuffer())
  );

  const ico = await pngToIco(pngs);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);

  console.log('OK – icon.ico und icon.png erstellt (' + sizes.join(', ') + ' px).');
}

main().catch((e) => { console.error(e); process.exit(1); });

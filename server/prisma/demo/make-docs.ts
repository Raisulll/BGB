// Generates the PDF evidence documents of the demo dataset (seizure lists, patrol, rescue and
// inspection reports) into media/docs/<incident id>.pdf. Chromium renders them so Bangla text is
// shaped correctly. Run once after changing the dataset; the PDFs are committed.
//
//   PLAYWRIGHT_CORE=<path to playwright-core> CHROME=<path to chrome.exe> npx tsx prisma/demo/make-docs.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bn, buildIncidents, userById, type DemoIncident } from './demo-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'media', 'docs');
const FRONTEND = path.resolve(here, '../../../BGB');

const b64 = (file: string) => readFileSync(file).toString('base64');
const fontDir = path.join(FRONTEND, 'node_modules/@fontsource/noto-sans-bengali/files');
const CREST = `data:image/png;base64,${b64(path.join(here, 'media', 'crest-160.png'))}`; // BGB crest, 160 px
const FONTS = [400, 600]
  .map((w) => `@font-face{font-family:'Noto Sans Bengali';font-weight:${w};src:url(data:font/woff2;base64,${b64(path.join(fontDir, `noto-sans-bengali-bengali-${w}-normal.woff2`))}) format('woff2');unicode-range:U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1;}`)
  .join('');

const TITLES = {
  seizure: ['SEIZURE LIST', 'জব্দ তালিকা'],
  patrol: ['PATROL REPORT', 'টহল প্রতিবেদন'],
  rescue: ['RESCUE REPORT', 'উদ্ধার প্রতিবেদন'],
  inspection: ['INSPECTION REPORT', 'পরিদর্শন প্রতিবেদন'],
} as const;
const WITNESSES: [string, string][] = [
  ['Md. Abdur Rahim, Member, Union Parishad', 'মো. আবদুর রহিম, সদস্য, ইউনিয়ন পরিষদ'],
  ['Shamsul Alam, local resident', 'শামসুল আলম, স্থানীয় বাসিন্দা'],
  ['Nazma Begum, local resident', 'নাজমা বেগম, স্থানীয় বাসিন্দা'],
  ['Abul Hashem, village chowkidar', 'আবুল হাশেম, গ্রাম চৌকিদার'],
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const para = (s: string) => s.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('');
const ddmmyyyy = (ymd: string) => ymd.split('-').reverse().join('-');
const battalionBn = (b: string) => `${bn(b.replace(/\D/g, ''))} বিজিবি`;

export function html(inc: DemoIncident) {
  const doc = inc.doc!;
  const [tEn, tBn] = TITLES[doc.type];
  const filer = userById.get(inc.createdBy)!;
  const n = Number(inc.id.slice(-2));
  const w = [WITNESSES[n % 4]!, WITNESSES[(n + 1) % 4]!];
  const ref = `${inc.bop.battalion.replace(' ', '')}/${inc.bop.bop.replace('BOP ', '').replace(/\s+/g, '')}/${inc.date.slice(0, 4)}/${inc.id.slice(-4)}`;
  const rows: [string, string][] = [
    ['Reference / স্মারক', ref],
    ['BIRDS incident / ঘটনা নম্বর', inc.id],
    ['Date and time / তারিখ ও সময়', `${ddmmyyyy(inc.date)}, ${inc.time} (${bn(ddmmyyyy(inc.date))}, ${bn(inc.time)})`],
    ['Place / ঘটনাস্থল', inc.location],
    ['Unit / ইউনিট', `${inc.bop.bop}, ${inc.bop.battalion}, ${inc.bop.sector} (${inc.bop.bopBn}, ${battalionBn(inc.bop.battalion)})`],
    ['GPS / জিপিএস', `${inc.lat.toFixed(5)}° N, ${inc.lng.toFixed(5)}° E`],
    ['Category / শ্রেণি', `${inc.category} — ${inc.subcategory}`],
  ];
  const items = doc.type === 'seizure' && doc.items.length
    ? `<h3>Seized items / জব্দকৃত মালামাল</h3>
       <table class="grid"><thead><tr><th>Sl</th><th>Item / মালামাল</th><th>Quantity / পরিমাণ</th><th>Remarks / মন্তব্য</th></tr></thead>
       <tbody>${doc.items.map(([a, q, rm], i) => `<tr><td>${i + 1}</td><td>${esc(a)}</td><td>${esc(q)}</td><td>${esc(rm)}</td></tr>`).join('')}</tbody></table>`
    : '';
  const witnesses = doc.type === 'seizure'
    ? `<h3>Witnesses / সাক্ষী</h3><table class="sig"><tr>${w.map(([e, b]) => `<td><div class="line"></div>${esc(e)}<br>${esc(b)}</td>`).join('')}</tr></table>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${FONTS}
    @page { size: A4; margin: 16mm 16mm 18mm; }
    body { font-family: 'Times New Roman', 'Noto Sans Bengali', serif; font-size: 11pt; color: #111; }
    .banner { text-align: center; font: 600 9pt Arial, sans-serif; letter-spacing: .08em; color: #8b0000; border: 1px solid #8b0000; padding: 3px; }
    header { display: flex; align-items: center; gap: 14px; margin: 10px 0 6px; padding-bottom: 8px; border-bottom: 2px solid #14532d; }
    header img { width: 62px; height: 62px; }
    header .org { font-size: 15pt; font-weight: 600; }
    header .unit { font-size: 10.5pt; color: #333; }
    h1 { text-align: center; font-size: 14pt; margin: 12px 0 2px; letter-spacing: .04em; }
    h1 + .sub { text-align: center; font-size: 12pt; margin-bottom: 10px; }
    h3 { font-size: 11pt; margin: 14px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; }
    .kv td { padding: 3px 6px; vertical-align: top; border-bottom: 1px dotted #bbb; }
    .kv td:first-child { width: 34%; color: #333; }
    .grid th, .grid td { border: 1px solid #555; padding: 4px 6px; font-size: 10.5pt; text-align: left; }
    .grid th { background: #f1f1f1; }
    p { margin: 0 0 6px; line-height: 1.45; text-align: justify; }
    .sig td { width: 50%; padding: 26px 10px 0 0; font-size: 10pt; vertical-align: bottom; }
    .line { border-top: 1px solid #333; width: 85%; margin-bottom: 3px; }
    footer { position: fixed; bottom: -10mm; left: 0; right: 0; text-align: center; font: 8pt Arial, 'Noto Sans Bengali', sans-serif; color: #666; }
  </style></head><body>
    <div class="banner">CONFIDENTIAL // OPERATIONAL · গোপনীয়</div>
    <header><img src="${CREST}" alt="">
      <div><div class="org">Border Guard Bangladesh · বর্ডার গার্ড বাংলাদেশ</div>
      <div class="unit">${esc(inc.bop.battalion)} · ${esc(inc.bop.bop)} · ${esc(inc.bop.sector)} — ${esc(battalionBn(inc.bop.battalion))} · ${esc(inc.bop.bopBn)}</div></div>
    </header>
    <h1>${tEn}</h1><div class="sub">${tBn}</div>
    <table class="kv">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <h3>Subject / বিষয়</h3><p><strong>${esc(inc.title)}</strong></p>
    <h3>Narrative / বিবরণ</h3>${para(inc.description)}
    ${items}
    <h3>Persons involved / সংশ্লিষ্ট ব্যক্তি</h3>${para(inc.personsInvolved)}
    <h3>Action taken / গৃহীত ব্যবস্থা</h3>${para(inc.actionTaken)}
    ${witnesses}
    <table class="sig"><tr>
      <td><div class="line"></div>${esc(filer.name)}<br>${doc.type === 'seizure' ? 'Seizing officer / জব্দকারী কর্মকর্তা' : 'Reporting officer / প্রতিবেদনকারী কর্মকর্তা'}, ${esc(inc.bop.battalion)}</td>
      <td><div class="line"></div>Commander, ${esc(inc.bop.bop)}<br>কমান্ডার, ${esc(inc.bop.bopBn)}</td>
    </tr></table>
    <footer>BIRDS demonstration document — fictional data · বার্ডস প্রদর্শনী নথি — কাল্পনিক তথ্য · ${inc.id}</footer>
  </body></html>`;
}

async function main() {
  const pw = process.env.PLAYWRIGHT_CORE;
  if (!pw) throw new Error('Set PLAYWRIGHT_CORE to the playwright-core package directory');
  const { chromium } = await import(pathToFileURL(path.join(pw, 'index.mjs')).href);
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const page = await browser.newPage();
  mkdirSync(OUT, { recursive: true });
  const incidents = buildIncidents().filter((i) => i.doc);
  for (const inc of incidents) {
    await page.setContent(html(inc), { waitUntil: 'load' });
    writeFileSync(path.join(OUT, `${inc.id}.pdf`), await page.pdf({ format: 'A4', printBackground: true }));
  }
  await browser.close();
  console.log(`${incidents.length} documents written to ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

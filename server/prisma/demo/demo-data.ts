// BIRDS demo dataset (TEC demonstration). Deterministic: a fixed PRNG seed and fixed dates, so the
// seeded database and the generated PDF documents (make-docs.ts) always describe the same records.
// Narratives are bilingual (English + Bangla, spec #43); places are real border locations, people and
// events are fictional. Used by demo-seed.ts (npm run db:demo).
import { EDIT_NOTES, FILER_REPLIES, REJECT_REASONS, RETURN_REASONS, REVIEW_COMMENTS, TEMPLATES, type Template } from './demo-templates.js';

export const DEMO_START = '2025-04-01';
export const DEMO_END = '2026-10-11'; // newest incident day (Bangladesh)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
    weighted: <T>(items: readonly (readonly [T, number])[]): T => {
      const total = items.reduce((n, [, w]) => n + w, 0);
      let x = next() * total;
      for (const [v, w] of items) if ((x -= w) < 0) return v;
      return items[items.length - 1]![0];
    },
    sample: <T>(arr: readonly T[], k: number): T[] => {
      const copy = [...arr];
      const out: T[] = [];
      while (out.length < k && copy.length) out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]!);
      return out;
    },
  };
}
export type Rng = ReturnType<typeof prng>;

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** Number in Bangla digits with Indian grouping (1,20,000 → ১,২০,০০০) */
export const bn = (n: number | string) =>
  (typeof n === 'number' ? n.toLocaleString('en-IN') : n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
export const en = (n: number) => n.toLocaleString('en-IN');

const DAY = 86_400_000;
/** 'YYYY-MM-DD HH:MM' Bangladesh time → Date */
export const dhaka = (ymd: string, hm = '00:00') => new Date(`${ymd}T${hm}:00+06:00`);
export const ymdOf = (d: Date) => new Date(d.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
export const hmOf = (d: Date) => new Date(d.getTime() + 6 * 3_600_000).toISOString().slice(11, 16);
export const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

// ---------------------------------------------------------------------------
// People (fictional) — the five demo accounts keep their usernames and passwords
// ---------------------------------------------------------------------------
export interface DemoUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: string;
  scope: string;
  email: string;
  isActive?: boolean;
}
const PW = 'Birds@2026';
export const USERS: DemoUser[] = [
  { id: 'U001', username: 'hq_admin', password: 'Admin@123', name: 'Col. Rahman', role: 'HQ Administrator', scope: 'HQ', email: 'rahman@bgb.gov.bd' },
  { id: 'U002', username: 'sector_off', password: 'Sector@123', name: 'Lt. Col. Karim', role: 'Sector Officer', scope: 'Sector-7', email: 'karim@bgb.gov.bd' },
  { id: 'U003', username: 'batt_op', password: 'Batt@123', name: 'Capt. Hasan', role: 'Battalion Operator', scope: '17 BGB', email: 'hasan@bgb.gov.bd' },
  { id: 'U004', username: 'verifier', password: 'Verify@123', name: 'Maj. Alam', role: 'Verifier/Approver', scope: 'Sector-7', email: 'alam@bgb.gov.bd' },
  { id: 'U005', username: 'auditor', password: 'Audit@123', name: 'SSM. Islam', role: 'Auditor', scope: 'HQ', email: 'islam@bgb.gov.bd' },
  { id: 'U006', username: 'op_tanvir', password: PW, name: 'Lt. Tanvir Ahmed', role: 'Battalion Operator', scope: '17 BGB', email: 'tanvir@bgb.gov.bd' },
  { id: 'U007', username: 'op_34bgb', password: PW, name: 'Capt. Mahmudul Haque', role: 'Battalion Operator', scope: '34 BGB', email: 'mahmudul@bgb.gov.bd' },
  { id: 'U008', username: 'op_42bgb', password: PW, name: 'Capt. Farzana Akter', role: 'Battalion Operator', scope: '42 BGB', email: 'farzana@bgb.gov.bd' },
  { id: 'U009', username: 'op_8bgb', password: PW, name: 'Capt. Rafiqul Islam', role: 'Battalion Operator', scope: '8 BGB', email: 'rafiqul@bgb.gov.bd' },
  { id: 'U010', username: 'op_21bgb', password: PW, name: 'Capt. Sohel Rana', role: 'Battalion Operator', scope: '21 BGB', email: 'sohel@bgb.gov.bd' },
  { id: 'U011', username: 'op_22bgb', password: PW, name: 'Capt. Nusrat Jahan', role: 'Battalion Operator', scope: '22 BGB', email: 'nusrat@bgb.gov.bd' },
  { id: 'U012', username: 'op_29bgb', password: PW, name: 'Capt. Imran Hossain', role: 'Battalion Operator', scope: '29 BGB', email: 'imran@bgb.gov.bd' },
  { id: 'U013', username: 'op_48bgb', password: PW, name: 'Capt. Arif Chowdhury', role: 'Battalion Operator', scope: '48 BGB', email: 'arif@bgb.gov.bd' },
  { id: 'U014', username: 'op_46bgb', password: PW, name: 'Capt. Mizanur Rahman', role: 'Battalion Operator', scope: '46 BGB', email: 'mizanur@bgb.gov.bd' },
  { id: 'U015', username: 'op_33bgb', password: PW, name: 'Capt. Kamrul Hasan', role: 'Battalion Operator', scope: '33 BGB', email: 'kamrul@bgb.gov.bd' },
  { id: 'U016', username: 'sector11', password: PW, name: 'Lt. Col. Shahidul Haque', role: 'Sector Officer', scope: 'Sector-11', email: 'shahidul@bgb.gov.bd' },
  { id: 'U017', username: 'sector3', password: PW, name: 'Lt. Col. Ayesha Siddiqua', role: 'Sector Officer', scope: 'Sector-3', email: 'ayesha@bgb.gov.bd' },
  { id: 'U018', username: 'sector5', password: PW, name: 'Lt. Col. Mostafa Kamal', role: 'Sector Officer', scope: 'Sector-5', email: 'mostafa@bgb.gov.bd' },
  { id: 'U019', username: 'sector9', password: PW, name: 'Lt. Col. Habibur Rahman', role: 'Sector Officer', scope: 'Sector-9', email: 'habibur@bgb.gov.bd' },
  { id: 'U020', username: 'verifier_hq', password: PW, name: 'Maj. Selina Parvin', role: 'Verifier/Approver', scope: 'HQ', email: 'selina@bgb.gov.bd' },
  { id: 'U021', username: 'op_rezaul', password: PW, name: 'Capt. Rezaul Karim', role: 'Battalion Operator', scope: '8 BGB', email: 'rezaul@bgb.gov.bd', isActive: false },
];
export const userById = new Map(USERS.map((u) => [u.id, u]));

// ---------------------------------------------------------------------------
// Units: real border locations (coordinates on the Bangladesh side)
// ---------------------------------------------------------------------------
export interface Bop {
  sector: string;
  battalion: string;
  bop: string;
  bopBn: string;
  lat: number;
  lng: number;
  places: (readonly [string, string])[]; // [English, Bangla]
}
export const BOPS: Bop[] = [
  // Sector-7 — Cox's Bazar, Bandarban, Chattogram Hill Tracts, Cumilla/Feni
  { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Teknaf', bopBn: 'বিওপি টেকনাফ', lat: 20.8655, lng: 92.2985, places: [['Jaliapara ghat, Naf River', 'নাফ নদীর জালিয়াপাড়া ঘাট'], ['Naitongpara', 'নাইট্যংপাড়া'], ['Kayukkhali canal', 'কায়ুকখালী খাল']] },
  { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Teknaf River', bopBn: 'বিওপি টেকনাফ রিভার', lat: 20.9205, lng: 92.2655, places: [['Nayapara ghat', 'নয়াপাড়া ঘাট'], ['Hnila', 'হ্নীলা'], ['Jadimura', 'জাদিমুড়া']] },
  { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Shah Porir Dwip', bopBn: 'বিওপি শাহপরীর দ্বীপ', lat: 20.7745, lng: 92.3255, places: [['Shah Porir Dwip jetty', 'শাহপরীর দ্বীপ জেটি'], ['Golachipa', 'গোলাচিপা'], ['Western beach, Shah Porir Dwip', 'শাহপরীর দ্বীপ পশ্চিম সৈকত']] },
  { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Whykong', bopBn: 'বিওপি হোয়াইক্যং', lat: 21.0655, lng: 92.1845, places: [['Kharangkhali', 'খারাংখালী'], ['Lambabil', 'লম্বাবিল']] },
  { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Ghumdhum', bopBn: 'বিওপি ঘুমধুম', lat: 21.2105, lng: 92.1655, places: [['Tumbru', 'তুমব্রু'], ['Konarpara', 'কোনারপাড়া'], ['Pillar 34 area', '৩৪ নম্বর পিলার এলাকা']] },
  { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Himchari', bopBn: 'বিওপি হিমছড়ি', lat: 21.3545, lng: 92.0385, places: [['Himchari beach', 'হিমছড়ি সৈকত'], ['Pechardwip', 'পেঁচারদ্বীপ']] },
  { sector: 'Sector-7', battalion: '34 BGB', bop: 'BOP Bandarban', bopBn: 'বিওপি বান্দরবান', lat: 21.4695, lng: 92.2305, places: [['Alikadam', 'আলীকদম'], ['Poamuhuri', 'পোয়ামুহুরী']] },
  { sector: 'Sector-7', battalion: '34 BGB', bop: 'BOP Thanchi', bopBn: 'বিওপি থানচি', lat: 21.6805, lng: 92.4955, places: [['Remakri', 'রেমাক্রি'], ['Bara Madak', 'বড় মদক']] },
  { sector: 'Sector-7', battalion: '34 BGB', bop: 'BOP Rangamati', bopBn: 'বিওপি রাঙ্গামাটি', lat: 22.7505, lng: 92.4705, places: [['Thegamukh', 'ঠেগামুখ'], ['Barkal', 'বরকল']] },
  { sector: 'Sector-7', battalion: '34 BGB', bop: 'BOP Khagrachari', bopBn: 'বিওপি খাগড়াছড়ি', lat: 22.9905, lng: 91.7205, places: [['Ramgarh', 'রামগড়'], ['Feni river bank, Ramgarh', 'রামগড় ফেনী নদীর তীর']] },
  { sector: 'Sector-7', battalion: '42 BGB', bop: 'BOP Comilla', bopBn: 'বিওপি কুমিল্লা', lat: 23.4805, lng: 91.2105, places: [['Bibir Bazar', 'বিবির বাজার'], ['Golabari', 'গোলাবাড়ি']] },
  { sector: 'Sector-7', battalion: '42 BGB', bop: 'BOP Feni', bopBn: 'বিওপি ফেনী', lat: 23.2155, lng: 91.4405, places: [['Parshuram', 'পরশুরাম'], ['Muhuri river', 'মুহুরী নদী']] },
  // Sector-11 — Jashore, Jhenaidah, Rajshahi
  { sector: 'Sector-11', battalion: '8 BGB', bop: 'BOP Benapole', bopBn: 'বিওপি বেনাপোল', lat: 23.0423, lng: 88.8951, places: [['Benapole checkpost', 'বেনাপোল চেকপোস্ট'], ['Sadipur', 'সাদিপুর'], ['Putkhali', 'পুটখালী']] },
  { sector: 'Sector-11', battalion: '8 BGB', bop: 'BOP Jessore', bopBn: 'বিওপি যশোর', lat: 23.2705, lng: 88.9605, places: [['Chowgacha', 'চৌগাছা'], ['Shahjadpur', 'শাহজাদপুর']] },
  { sector: 'Sector-11', battalion: '8 BGB', bop: 'BOP Jhenaidah', bopBn: 'বিওপি ঝিনাইদহ', lat: 23.3555, lng: 88.8805, places: [['Maheshpur', 'মহেশপুর'], ['Jadabpur', 'যাদবপুর']] },
  { sector: 'Sector-11', battalion: '21 BGB', bop: 'BOP Rajshahi', bopBn: 'বিওপি রাজশাহী', lat: 24.3605, lng: 88.5805, places: [['Khanpur char, Padma', 'পদ্মার খানপুর চর'], ['Talaimari', 'তালাইমারী']] },
  { sector: 'Sector-11', battalion: '21 BGB', bop: 'BOP Godagari', bopBn: 'বিওপি গোদাগাড়ী', lat: 24.4705, lng: 88.3305, places: [['Premtoli', 'প্রেমতলী'], ['Char Ashariadaha', 'চর আষাড়িয়াদহ']] },
  // Sector-3 — Rangpur division
  { sector: 'Sector-3', battalion: '22 BGB', bop: 'BOP Burimari', bopBn: 'বিওপি বুড়িমারী', lat: 26.4055, lng: 88.9505, places: [['Burimari land port', 'বুড়িমারী স্থলবন্দর'], ['Dahagram', 'দহগ্রাম']] },
  { sector: 'Sector-3', battalion: '22 BGB', bop: 'BOP Roumari', bopBn: 'বিওপি রৌমারী', lat: 25.5605, lng: 89.8455, places: [['Roumari char', 'রৌমারী চর'], ['Jinjiram river', 'জিঞ্জিরাম নদী']] },
  { sector: 'Sector-3', battalion: '22 BGB', bop: 'BOP Tetulia', bopBn: 'বিওপি তেঁতুলিয়া', lat: 26.4905, lng: 88.3505, places: [['Banglabandha', 'বাংলাবান্ধা'], ['Mahananda river', 'মহানন্দা নদী']] },
  { sector: 'Sector-3', battalion: '29 BGB', bop: 'BOP Hili', bopBn: 'বিওপি হিলি', lat: 25.2805, lng: 89.0005, places: [['Hili land port', 'হিলি স্থলবন্দর'], ['Basudebpur', 'বাসুদেবপুর']] },
  { sector: 'Sector-3', battalion: '29 BGB', bop: 'BOP Birol', bopBn: 'বিওপি বিরল', lat: 25.6305, lng: 88.5505, places: [['Birol', 'বিরল'], ['Mangalpur', 'মঙ্গলপুর']] },
  // Sector-5 — Sylhet division
  { sector: 'Sector-5', battalion: '48 BGB', bop: 'BOP Tamabil', bopBn: 'বিওপি তামাবিল', lat: 25.1755, lng: 92.0305, places: [['Tamabil land port', 'তামাবিল স্থলবন্দর'], ['Jaflong', 'জাফলং'], ['Piyain river', 'পিয়াইন নদী']] },
  { sector: 'Sector-5', battalion: '48 BGB', bop: 'BOP Bholaganj', bopBn: 'বিওপি ভোলাগঞ্জ', lat: 25.1805, lng: 91.8505, places: [['Bholaganj', 'ভোলাগঞ্জ'], ['Sada Pathor', 'সাদা পাথর']] },
  { sector: 'Sector-5', battalion: '48 BGB', bop: 'BOP Zakiganj', bopBn: 'বিওপি জকিগঞ্জ', lat: 24.8805, lng: 92.3705, places: [['Zakiganj', 'জকিগঞ্জ'], ['Kushiyara river', 'কুশিয়ারা নদী']] },
  { sector: 'Sector-5', battalion: '46 BGB', bop: 'BOP Kamalganj', bopBn: 'বিওপি কমলগঞ্জ', lat: 24.3005, lng: 91.8705, places: [['Kamalganj', 'কমলগঞ্জ'], ['Kurma', 'কুরমা']] },
  // Sector-9 — Satkhira
  { sector: 'Sector-9', battalion: '33 BGB', bop: 'BOP Bhomra', bopBn: 'বিওপি ভোমরা', lat: 22.7305, lng: 88.9905, places: [['Bhomra land port', 'ভোমরা স্থলবন্দর'], ['Ichamati river', 'ইছামতী নদী']] },
  { sector: 'Sector-9', battalion: '33 BGB', bop: 'BOP Kalaroa', bopBn: 'বিওপি কলারোয়া', lat: 22.8705, lng: 88.9905, places: [['Kalaroa', 'কলারোয়া'], ['Kakdanga', 'কাকডাঙ্গা']] },
  { sector: 'Sector-9', battalion: '33 BGB', bop: 'BOP Kaikhali', bopBn: 'বিওপি কৈখালী', lat: 22.2105, lng: 89.0505, places: [['Kaikhali', 'কৈখালী'], ['Raimangal river', 'রায়মঙ্গল নদী']] },
];
/** Units kept from the original seed that have no incidents (they still appear in the hierarchy) */
export const EXTRA_UNITS = [
  { sector: 'Sector-7', battalion: '42 BGB', bop: 'BOP Noakhali' },
  { sector: 'Sector-11', battalion: '21 BGB', bop: 'BOP Natore' },
  { sector: 'Sector-11', battalion: '21 BGB', bop: 'BOP Pabna' },
];

/** Who files, reviews, verifies and approves in each unit */
export const FILERS: Record<string, [string, number][]> = {
  '17 BGB': [['U003', 7], ['U006', 3]],
  '34 BGB': [['U007', 1]],
  '42 BGB': [['U008', 1]],
  '8 BGB': [['U009', 1]],
  '21 BGB': [['U010', 1]],
  '22 BGB': [['U011', 1]],
  '29 BGB': [['U012', 1]],
  '48 BGB': [['U013', 1]],
  '46 BGB': [['U014', 1]],
  '33 BGB': [['U015', 1]],
};
export const SECTOR_OFFICER: Record<string, string> = { 'Sector-7': 'U002', 'Sector-11': 'U016', 'Sector-3': 'U017', 'Sector-5': 'U018', 'Sector-9': 'U019' };
export const verifierFor = (sector: string) => (sector === 'Sector-7' ? 'U004' : 'U020');
export const approverFor = (sector: string, severity: string, r: Rng) =>
  severity === 'Critical' || severity === 'High' ? 'U001' : sector === 'Sector-7' ? (r.chance(0.5) ? 'U020' : 'U001') : 'U001';
export const ADMIN = 'U001';

// The former 8 BGB operator (now deactivated) filed the early 8 BGB reports
const FORMER_8BGB_UNTIL = '2025-09-30';

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
export interface DemoEvidence {
  kind: 'image' | 'video' | 'doc';
  media: string; // media file key (images/<k>.jpg, videos/<k>.mp4) or 'doc'
  name: string; // original file name as uploaded
}
export interface DemoEvent {
  at: Date;
  kind: 'timeline' | 'comment';
  action: string; // timeline action, or 'Comment'
  userId: string | null; // null = BIRDS System
  status: string; // status after the event (timeline)
  notes?: string | null;
}
export interface DemoIncident {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  severity: string;
  status: string;
  date: string;
  time: string;
  bop: Bop;
  location: string;
  lat: number;
  lng: number;
  description: string;
  personsInvolved: string;
  actionTaken: string;
  outcome: string;
  createdBy: string;
  createdAt: Date;
  events: DemoEvent[];
  evidence: DemoEvidence[];
  evidenceAt: Date;
  archivedAt: Date | null;
  discardedAt: Date | null;
  doc: { type: 'seizure' | 'patrol' | 'rescue' | 'inspection'; items: (readonly [string, string, string])[] } | null;
  template: string;
}

// Incidents per month, April 2025 → October 2026 (rising trend; dry-season peaks)
const MONTHS: [string, number][] = [
  ['2025-04', 4], ['2025-05', 4], ['2025-06', 5], ['2025-07', 5], ['2025-08', 4], ['2025-09', 5],
  ['2025-10', 6], ['2025-11', 7], ['2025-12', 7], ['2026-01', 8], ['2026-02', 7], ['2026-03', 6],
  ['2026-04', 5], ['2026-05', 6], ['2026-06', 6], ['2026-07', 7], ['2026-08', 8], ['2026-09', 13], ['2026-10', 3],
];
const BATTALION_WEIGHT: [string, number][] = [
  ['17 BGB', 30], ['34 BGB', 8], ['42 BGB', 6], ['8 BGB', 11], ['21 BGB', 8], ['22 BGB', 8], ['29 BGB', 6], ['48 BGB', 9], ['46 BGB', 4], ['33 BGB', 10],
];

/** "Now" for the dataset: the morning after the newest incident day */
export const DEMO_NOW = dhaka('2026-10-12', '09:00');

const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, '0');
const compact = (d: Date) => `${ymdOf(d).replace(/-/g, '')}_${hmOf(d).replace(':', '')}${pad(d.getUTCSeconds() || 7)}`;

interface Plan {
  tpl: Template;
  bop: Bop;
  date: string;
  time: string;
  createdAt: Date;
  filer: string;
}

function hourIn(r: Rng, [from, to]: [number, number]) {
  const span = from <= to ? to - from : 24 - from + to;
  return (from + r.int(0, span)) % 24;
}

function plan(r: Rng): Plan[] {
  const out: Plan[] = [];
  for (const [ym, count] of MONTHS) {
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    const lastDay = ym === DEMO_END.slice(0, 7) ? Number(DEMO_END.slice(8)) : daysIn(ym);
    for (let k = 0; k < count; k++) {
      const battalion = r.weighted(BATTALION_WEIGHT);
      const fits = TEMPLATES.filter((t) => t.battalions.includes(battalion) && BOPS.some((b) => b.battalion === battalion && (!t.bops || t.bops.includes(b.bop))));
      const tpl = r.weighted(fits.map((t) => [t, t.weight * (t.season ? t.season(month, year) : 1)] as const));
      const bop = r.pick(BOPS.filter((b) => b.battalion === battalion && (!tpl.bops || tpl.bops.includes(b.bop))));
      const date = `${ym}-${pad(r.int(1, lastDay))}`;
      const time = `${pad(hourIn(r, tpl.hours))}:${pad(r.int(0, 11) * 5)}`;
      // Filed a few hours after the event (night events: next morning)
      let createdAt = addHours(dhaka(date, time), r.int(2, 7) + r.next());
      if (createdAt > DEMO_NOW) createdAt = addHours(DEMO_NOW, -3);
      const filers = battalion === '8 BGB' && date <= FORMER_8BGB_UNTIL ? [['U021', 1] as [string, number]] : FILERS[battalion]!;
      out.push({ tpl, bop, date, time, createdAt, filer: r.weighted(filers) });
    }
  }
  // A busier last nine days, mostly in Sector-7 (the demo accounts' area), so the work queues
  // show the newest reports waiting at each step
  const recent: [string, number][] = [['17 BGB', 6], ['34 BGB', 2], ['42 BGB', 1], ['8 BGB', 1], ['48 BGB', 1], ['22 BGB', 1], ['33 BGB', 1]];
  for (let k = 0; k < 11; k++) {
    const battalion = r.weighted(recent);
    const fits = TEMPLATES.filter((t) => t.battalions.includes(battalion) && BOPS.some((b) => b.battalion === battalion && (!t.bops || t.bops.includes(b.bop))));
    const tpl = r.weighted(fits.map((t) => [t, t.weight * (t.season ? t.season(10, 2026) : 1)] as const));
    const bop = r.pick(BOPS.filter((b) => b.battalion === battalion && (!tpl.bops || tpl.bops.includes(b.bop))));
    const date = ymdOf(new Date(dhaka(DEMO_END).getTime() - r.int(0, 8) * DAY));
    const time = `${pad(hourIn(r, tpl.hours))}:${pad(r.int(0, 11) * 5)}`;
    let createdAt = addHours(dhaka(date, time), r.int(2, 6) + r.next());
    if (createdAt > DEMO_NOW) createdAt = addHours(DEMO_NOW, -2 - r.next() * 4);
    out.push({ tpl, bop, date, time, createdAt, filer: r.weighted(FILERS[battalion]!) });
  }
  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Final status for an incident filed `age` days before DEMO_NOW */
function statusFor(r: Rng, age: number): string {
  if (age > 60) return r.weighted([['Closed', 89], ['Rejected', 11]] as const);
  if (age > 30) return r.weighted([['Closed', 80], ['Approved', 5], ['Verified', 2], ['Rejected', 12], ['Returned', 1]] as const);
  return r.weighted([['Closed', 45], ['Approved', 12], ['Verified', 6], ['Reviewed', 6], ['Submitted', 6], ['Returned', 5], ['Rejected', 10]] as const);
}

const ORDER = ['Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed'];

export function buildIncidents(): DemoIncident[] {
  const r = prng(20_261_012);
  const plans = plan(r);
  const counters: Record<string, number> = {};
  const incidents: DemoIncident[] = [];

  for (const p of plans) {
    const year = ymdOf(p.createdAt).slice(0, 4);
    counters[year] = (counters[year] ?? 1000) + 1;
    const id = `BIRDS-${year}-${counters[year]}`;
    const place = r.pick(p.bop.places);
    const built = p.tpl.build({ r, b: p.bop, place, time: p.time });
    const age = (DEMO_NOW.getTime() - p.createdAt.getTime()) / DAY;
    const status = statusFor(r, age);
    const useBnTitle = r.chance(0.3);
    incidents.push({
      id,
      title: useBnTitle ? built.titleBn : built.title,
      category: p.tpl.category,
      subcategory: p.tpl.subcategory,
      severity: built.severity,
      status,
      date: p.date,
      time: p.time,
      bop: p.bop,
      location: `${place[0]} (${place[1]})`,
      lat: Number((p.bop.lat + (r.next() - 0.5) * 0.03).toFixed(5)),
      lng: Number((p.bop.lng + (r.next() - 0.5) * 0.03).toFixed(5)),
      description: built.description,
      personsInvolved: built.personsInvolved,
      actionTaken: built.actionTaken,
      outcome: built.outcome,
      createdBy: p.filer,
      createdAt: p.createdAt,
      events: [],
      evidence: [],
      evidenceAt: p.createdAt,
      archivedAt: null,
      discardedAt: null,
      doc: { type: p.tpl.doc, items: built.items ?? [] },
      template: p.tpl.id,
    });
  }

  enforceCoverage(incidents);
  for (const inc of incidents) buildHistory(r, inc);
  addDrafts(r, incidents);
  return incidents;
}

/** Makes sure each demo account has work waiting and every state appears in the recent records */
function enforceCoverage(incidents: DemoIncident[]) {
  const recent = incidents.filter((i) => DEMO_NOW.getTime() - i.createdAt.getTime() < 30 * DAY).reverse(); // newest first
  const s7 = recent.filter((i) => i.bop.sector === 'Sector-7');
  // newest first: the newest wait for review, older ones further along (a few are overdue)
  const plan7 = ['Submitted', 'Submitted', 'Submitted', 'Reviewed', 'Submitted', 'Reviewed', 'Approved', 'Verified', 'Reviewed', 'Approved', 'Verified', 'Approved', 'Closed', 'Closed', 'Rejected', 'Closed', 'Closed', 'Closed', 'Closed', 'Closed'];
  s7.forEach((inc, i) => {
    if (i < plan7.length) inc.status = plan7[i]!;
  });
  // Two of Capt. Hasan's recent reports returned to him for correction
  const hasan = s7.filter((i) => i.createdBy === 'U003');
  [...hasan.filter((i) => i.status === 'Closed'), ...hasan.filter((i) => i.status === 'Approved')].slice(0, 2).forEach((i) => (i.status = 'Returned'));
  const others = recent.filter((i) => i.bop.sector !== 'Sector-7');
  const planX = ['Submitted', 'Reviewed', 'Approved', 'Submitted', 'Verified', 'Returned', 'Closed', 'Approved', 'Rejected', 'Closed', 'Closed', 'Closed', 'Closed', 'Rejected', 'Closed', 'Closed'];
  others.forEach((inc, i) => {
    if (i < planX.length) inc.status = planX[i]!;
  });
}

interface Step {
  action: string;
  userId: string | null;
  status: string;
  notes?: string | null;
  gap: number; // hours after the previous step
  comment?: boolean;
  lateDoc?: boolean;
}

function buildHistory(r: Rng, inc: DemoIncident) {
  const sector = inc.bop.sector;
  const so = SECTOR_OFFICER[sector]!;
  const ver = verifierFor(sector);
  const final = inc.status;
  const tpl = TEMPLATES.find((x) => x.id === inc.template)!;
  const hasDoc = r.chance(0.8);
  // Some records went through a return and resubmission before moving on
  const returnedBefore = final !== 'Returned' && r.chance(0.18);
  const docLate = returnedBefore && hasDoc && r.chance(0.6);
  const steps: Step[] = [
    { action: 'Created', userId: inc.createdBy, status: 'Draft', gap: 0 },
    { action: 'Evidence added', userId: inc.createdBy, status: 'Draft', gap: 0.15 + r.next() * 0.3 },
    { action: 'Submitted', userId: inc.createdBy, status: 'Submitted', gap: 0.2 + r.next() * 1.2 },
  ];

  if (returnedBefore || final === 'Returned') {
    const reason = docLate || (final === 'Returned' && hasDoc && r.chance(0.5)) ? RETURN_REASONS.doc : r.pick(RETURN_REASONS.other);
    steps.push({ action: 'Returned', userId: so, status: 'Returned', notes: reason, gap: 4 + r.next() * 26 });
    if (returnedBefore) {
      steps.push({ action: 'Edited', userId: inc.createdBy, status: 'Returned', notes: reason === RETURN_REASONS.doc ? 'Changed: action taken' : r.pick(EDIT_NOTES), gap: 2 + r.next() * 18 });
      if (docLate) steps.push({ action: 'Evidence added', userId: inc.createdBy, status: 'Returned', gap: 0.2, lateDoc: true });
      steps.push({ action: 'Resubmitted', userId: inc.createdBy, status: 'Submitted', gap: 0.2 + r.next() * 2 });
    }
  }

  if (final === 'Rejected') {
    const reviewedFirst = r.chance(0.4);
    if (reviewedFirst) steps.push({ action: 'Reviewed', userId: so, status: 'Reviewed', gap: 3 + r.next() * 30 });
    steps.push({ action: 'Rejected', userId: reviewedFirst ? ver : so, status: 'Rejected', notes: r.pick(REJECT_REASONS), gap: 3 + r.next() * 36 });
  } else if (final !== 'Returned') {
    const upto = ORDER.indexOf(final);
    if (upto >= 1) steps.push({ action: 'Reviewed', userId: so, status: 'Reviewed', gap: 3 + r.next() * 33 });
    if (upto >= 1 && r.chance(0.3)) steps.push({ action: 'Comment', userId: so, status: '', notes: r.pick(REVIEW_COMMENTS), gap: 0.5 + r.next() * 4, comment: true });
    if (upto >= 2) steps.push({ action: 'Verified', userId: ver, status: 'Verified', gap: 4 + r.next() * 44 });
    if (upto >= 3) steps.push({ action: 'Approved', userId: approverFor(sector, inc.severity, r), status: 'Approved', gap: 4 + r.next() * 44 });
    if (upto >= 4) steps.push({ action: 'Closed', userId: ADMIN, status: 'Closed', gap: 24 + r.next() * 200 });
  }
  if (r.chance(0.25)) {
    steps.push({ action: 'Comment', userId: r.pick([so, ver, ADMIN]), status: '', notes: r.pick(REVIEW_COMMENTS), gap: 1 + r.next() * 20, comment: true });
    if (r.chance(0.6)) steps.push({ action: 'Comment', userId: inc.createdBy, status: '', notes: r.pick(FILER_REPLIES), gap: 1 + r.next() * 10, comment: true });
  }

  // Fit the history before DEMO_NOW (recent records moved faster)
  const total = steps.reduce((n, s) => n + s.gap, 0);
  const room = (DEMO_NOW.getTime() - inc.createdAt.getTime()) / 3_600_000 - 1;
  const scale = total > room * 0.92 ? (room * 0.92) / total : 1;
  let t = inc.createdAt;
  const events: (DemoEvent & { lateDoc?: boolean })[] = [];
  for (const s of steps) {
    t = addHours(t, s.gap * scale);
    events.push({ at: t, kind: s.comment ? 'comment' : 'timeline', action: s.action, userId: s.userId, status: s.status, notes: s.notes ?? null, lateDoc: s.lateDoc });
  }

  // Evidence: photos (+ video) when created; the document then, or after the return
  const nImages = r.weighted([[1, 3], [2, 5], [3, 2]] as const);
  const images = r.sample(tpl.images, Math.min(nImages, tpl.images.length));
  const bnNames = r.chance(0.25);
  const evidence: DemoEvidence[] = images.map((k, i) => ({
    kind: 'image' as const,
    media: `images/${k}.jpg`,
    name: bnNames ? `ঘটনাস্থলের_ছবি_${bn(i + 1)}.jpg` : `IMG_${compact(addHours(dhaka(inc.date, inc.time), 0.1 + i * 0.05))}.jpg`,
  }));
  if (tpl.videos && r.chance(tpl.videoChance ?? 0)) {
    evidence.push({ kind: 'video', media: `videos/${r.pick(tpl.videos)}.mp4`, name: `VID_${compact(addHours(dhaka(inc.date, inc.time), 0.2))}.mp4` });
  }
  let docEv: DemoEvidence | null = null;
  if (hasDoc) {
    const docName = { seizure: ['Seizure_List', 'জব্দ_তালিকা'], patrol: ['Patrol_Report', 'টহল_প্রতিবেদন'], rescue: ['Rescue_Report', 'উদ্ধার_প্রতিবেদন'], inspection: ['Inspection_Report', 'পরিদর্শন_প্রতিবেদন'] }[tpl.doc];
    docEv = { kind: 'doc', media: `docs/${inc.id}.pdf`, name: `${r.chance(0.4) ? docName[1] : docName[0]}_${inc.id}.pdf` };
    evidence.push(docEv);
  } else {
    inc.doc = null;
  }
  for (const e of events) {
    if (e.action !== 'Evidence added') continue;
    e.notes = e.lateDoc ? docEv!.name : evidence.filter((x) => !(docLate && x === docEv)).map((x) => x.name).join(', ');
  }
  inc.evidence = evidence;
  inc.evidenceAt = events[1]!.at;
  inc.events = events.map(({ lateDoc: _late, ...e }) => e);

  // Archiving: final and untouched for more than a year → archived by the nightly job
  if (['Closed', 'Rejected'].includes(final)) {
    const lastChange = [...inc.events].reverse().find((e) => e.kind === 'timeline')!;
    const due = new Date(lastChange.at.getTime() + 366 * DAY);
    if (due < DEMO_NOW) {
      const at = dhaka(ymdOf(due), '02:00');
      inc.archivedAt = at;
      inc.events.push({ at, kind: 'timeline', action: 'Archived', userId: null, status: final, notes: 'Archiving policy: final and not updated for 365 days' });
    }
  }
}

/** Capt. Hasan's unsubmitted drafts, and one he discarded */
function addDrafts(r: Rng, incidents: DemoIncident[]) {
  const year = '2026';
  let next = Math.max(...incidents.filter((i) => i.id.startsWith(`BIRDS-${year}`)).map((i) => Number(i.id.slice(-4)))) + 1;
  const teknaf = BOPS.filter((b) => b.battalion === '17 BGB');
  const specs: [string, number, boolean][] = [['suspicious', 9, true], ['yaba-boat', 1.2, false], ['drone', 0.4, false]];
  for (const [tplId, daysAgo, discard] of specs) {
    const tpl = TEMPLATES.find((t) => t.id === tplId)!;
    const bop = r.pick(teknaf.filter((b) => !tpl.bops || tpl.bops.includes(b.bop)));
    const place = r.pick(bop.places);
    const createdAt = new Date(DEMO_NOW.getTime() - daysAgo * DAY);
    const date = ymdOf(addHours(createdAt, -5));
    const time = `${pad(hourIn(r, tpl.hours))}:${pad(r.int(0, 11) * 5)}`;
    const built = tpl.build({ r, b: bop, place, time });
    const id = `BIRDS-${year}-${next++}`;
    const evAt = addHours(createdAt, 0.2);
    const evidence: DemoEvidence[] = [{ kind: 'image', media: `images/${r.pick(tpl.images)}.jpg`, name: `IMG_${compact(addHours(dhaka(date, time), 0.1))}.jpg` }];
    const events: DemoEvent[] = [
      { at: createdAt, kind: 'timeline', action: 'Created', userId: 'U003', status: 'Draft', notes: null },
      { at: evAt, kind: 'timeline', action: 'Evidence added', userId: 'U003', status: 'Draft', notes: evidence[0]!.name },
    ];
    let discardedAt: Date | null = null;
    if (discard) {
      discardedAt = addHours(createdAt, 3);
      events.push({ at: discardedAt, kind: 'timeline', action: 'Discarded', userId: 'U003', status: 'Draft', notes: 'Same event already filed by BOP Teknaf River. / একই ঘটনা বিওপি টেকনাফ রিভার আগেই দাখিল করেছে।' });
    }
    incidents.push({
      id, title: built.title, category: tpl.category, subcategory: tpl.subcategory, severity: built.severity, status: 'Draft', date, time, bop,
      location: `${place[0]} (${place[1]})`, lat: Number((bop.lat + 0.004).toFixed(5)), lng: Number((bop.lng - 0.003).toFixed(5)),
      description: built.description, personsInvolved: built.personsInvolved, actionTaken: built.actionTaken, outcome: built.outcome,
      createdBy: 'U003', createdAt, events, evidence, evidenceAt: evAt, archivedAt: null, discardedAt, doc: null, template: tpl.id,
    });
  }
}

/** Next free reference number per year after the dataset */
export function nextIds(incidents: DemoIncident[]) {
  const max: Record<string, number> = {};
  for (const i of incidents) {
    const [, y, n] = /^BIRDS-(\d{4})-(\d+)$/.exec(i.id)!;
    max[y!] = Math.max(max[y!] ?? 1000, Number(n));
  }
  return Object.fromEntries(Object.entries(max).map(([y, n]) => [y, n + 1]));
}

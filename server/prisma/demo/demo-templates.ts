// Incident scenarios for the demo dataset. Each builds a bilingual (English + Bangla) record for a
// given BOP, place, date and time. Places and police stations are real; people and events are not.
import type { Bop, Rng } from './demo-data.js';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (n: number | string) => (typeof n === 'number' ? n.toLocaleString('en-IN') : n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
const en = (n: number) => n.toLocaleString('en-IN');

export interface Ctx {
  r: Rng;
  b: Bop;
  place: readonly [string, string];
  time: string; // HH:MM
}
export interface Built {
  title: string;
  titleBn: string;
  severity: string;
  description: string;
  personsInvolved: string;
  actionTaken: string;
  outcome: string;
  items?: (readonly [string, string, string])[]; // seizure list rows: item, quantity, remarks
}
export interface Template {
  id: string;
  category: string;
  subcategory: string;
  battalions: string[];
  bops?: string[]; // limit to these BOPs
  weight: number;
  season?: (month: number, year: number) => number;
  hours: [number, number];
  images: string[];
  videos?: string[];
  videoChance?: number;
  doc: 'seizure' | 'patrol' | 'rescue' | 'inspection';
  build: (c: Ctx) => Built;
}

// Police station for each BOP [English, Bangla]
const PS: Record<string, readonly [string, string]> = {
  'BOP Teknaf': ['Teknaf Model Police Station', 'টেকনাফ মডেল থানা'],
  'BOP Teknaf River': ['Teknaf Model Police Station', 'টেকনাফ মডেল থানা'],
  'BOP Shah Porir Dwip': ['Teknaf Model Police Station', 'টেকনাফ মডেল থানা'],
  'BOP Whykong': ['Teknaf Model Police Station', 'টেকনাফ মডেল থানা'],
  'BOP Ghumdhum': ['Naikhongchhari Police Station', 'নাইক্ষ্যংছড়ি থানা'],
  'BOP Himchari': ["Cox's Bazar Sadar Model Police Station", 'কক্সবাজার সদর মডেল থানা'],
  'BOP Bandarban': ['Alikadam Police Station', 'আলীকদম থানা'],
  'BOP Thanchi': ['Thanchi Police Station', 'থানচি থানা'],
  'BOP Rangamati': ['Barkal Police Station', 'বরকল থানা'],
  'BOP Khagrachari': ['Ramgarh Police Station', 'রামগড় থানা'],
  'BOP Comilla': ['Cumilla Kotwali Model Police Station', 'কুমিল্লা কোতোয়ালি মডেল থানা'],
  'BOP Feni': ['Parshuram Police Station', 'পরশুরাম থানা'],
  'BOP Benapole': ['Benapole Port Police Station', 'বেনাপোল পোর্ট থানা'],
  'BOP Jessore': ['Chowgacha Police Station', 'চৌগাছা থানা'],
  'BOP Jhenaidah': ['Maheshpur Police Station', 'মহেশপুর থানা'],
  'BOP Rajshahi': ['Charghat Police Station', 'চারঘাট থানা'],
  'BOP Godagari': ['Godagari Police Station', 'গোদাগাড়ী থানা'],
  'BOP Burimari': ['Patgram Police Station', 'পাটগ্রাম থানা'],
  'BOP Roumari': ['Roumari Police Station', 'রৌমারী থানা'],
  'BOP Tetulia': ['Tetulia Police Station', 'তেঁতুলিয়া থানা'],
  'BOP Hili': ['Hakimpur Police Station', 'হাকিমপুর থানা'],
  'BOP Birol': ['Birol Police Station', 'বিরল থানা'],
  'BOP Tamabil': ['Gowainghat Police Station', 'গোয়াইনঘাট থানা'],
  'BOP Bholaganj': ['Companiganj Police Station', 'কোম্পানীগঞ্জ থানা'],
  'BOP Zakiganj': ['Zakiganj Police Station', 'জকিগঞ্জ থানা'],
  'BOP Kamalganj': ['Kamalganj Police Station', 'কমলগঞ্জ থানা'],
  'BOP Bhomra': ['Satkhira Sadar Police Station', 'সাতক্ষীরা সদর থানা'],
  'BOP Kalaroa': ['Kalaroa Police Station', 'কলারোয়া থানা'],
  'BOP Kaikhali': ['Shyamnagar Police Station', 'শ্যামনগর থানা'],
};
const ps = (b: Bop) => PS[b.bop] ?? ['the local police station', 'স্থানীয় থানা'];

// Fictional names [English, Bangla]
const NAMES: (readonly [string, string])[] = [
  ['Md. Rafiq', 'মো. রফিক'], ['Abdul Malek', 'আবদুল মালেক'], ['Jamal Uddin', 'জামাল উদ্দিন'], ['Nurul Amin', 'নুরুল আমিন'],
  ['Shafiqul Islam', 'শফিকুল ইসলাম'], ['Kamal Hossain', 'কামাল হোসেন'], ['Abul Kalam', 'আবুল কালাম'], ['Rashed Mia', 'রাশেদ মিয়া'],
  ['Selim Reza', 'সেলিম রেজা'], ['Babul Sheikh', 'বাবুল শেখ'], ['Monir Hossain', 'মনির হোসেন'], ['Sujon Mia', 'সুজন মিয়া'],
  ['Alamgir Hossain', 'আলমগীর হোসেন'], ['Jahangir Alam', 'জাহাঙ্গীর আলম'], ['Faruk Ahmed', 'ফারুক আহমেদ'], ['Liton Das', 'লিটন দাস'],
];
const people = (r: Rng, k: number) => r.sample(NAMES, k).map(([e, b]) => {
  const age = r.int(19, 52);
  return { en: `${e} (${age})`, bn: `${b} (${bn(age)})` };
});
const list = (xs: string[], and = 'and') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);

const bnTime = (t: string) => bn(t);
const both = (e: string, b: string) => `${e}\n\n${b}`;

const dry = (m: number) => (m >= 11 || m <= 2 ? 1.6 : m >= 6 && m <= 9 ? 0.7 : 1);
const monsoon = (m: number) => (m >= 6 && m <= 9 ? 2.2 : m === 5 || m === 10 ? 1 : 0.2);
const seaSeason = (m: number) => (m >= 10 || m <= 3 ? 1.8 : 0.4);

export const TEMPLATES: Template[] = [
  // ------------------------------------------------------------------ Smuggling
  {
    id: 'yaba-boat', category: 'Smuggling', subcategory: 'Yaba/Ice', battalions: ['17 BGB'],
    bops: ['BOP Teknaf', 'BOP Teknaf River', 'BOP Whykong', 'BOP Shah Porir Dwip'], weight: 9, hours: [0, 5],
    images: ['naf-river', 'naf-boats-hills', 'yaba-tablets', 'fishing-boat', 'teknaf-port'], videos: ['sampan-boats-coxs', 'river-launches'], videoChance: 0.4, doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const q = r.pick([18, 24, 30, 45, 60, 80, 120, 150, 200, 250, 320]) * 1000;
      const packs = Math.max(2, Math.round(q / 10000));
      const [p, pb] = ps(b);
      return {
        title: `${en(q)} Yaba tablets seized from a boat at ${place[0]}`,
        titleBn: `${place[1]}-এ নৌকা থেকে ${bn(q)} পিস ইয়াবা জব্দ`,
        severity: q >= 150000 ? 'Critical' : q >= 50000 ? 'High' : 'Medium',
        description: both(
          `At about ${time} a patrol from ${b.bop} on duty along the Naf River saw a small wooden boat coming from the Myanmar side towards ${place[0]}. When challenged, two people jumped into the water and swam back towards the Myanmar side in the dark. The patrol searched the boat and recovered ${en(q)} Yaba (methamphetamine) tablets in ${packs} plastic packets hidden under fishing nets.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর একটি টহল দল নাফ নদীতে দায়িত্ব পালনকালে মিয়ানমারের দিক থেকে ${place[1]}-এর দিকে একটি ছোট কাঠের নৌকা আসতে দেখে। থামার সংকেত দিলে দুইজন ব্যক্তি নদীতে লাফিয়ে অন্ধকারে মিয়ানমারের দিকে সাঁতরে পালিয়ে যায়। নৌকা তল্লাশি করে মাছ ধরার জালের নিচে ${bn(packs)}টি প্লাস্টিকের প্যাকেটে লুকানো ${bn(q)} পিস ইয়াবা ট্যাবলেট উদ্ধার করা হয়।`,
        ),
        personsInvolved: both('Two unidentified carriers escaped towards the Myanmar side.', 'অজ্ঞাতনামা ২ জন বাহক মিয়ানমারের দিকে পালিয়ে যায়।'),
        actionTaken: both(
          `Boat and tablets seized; seizure list prepared in front of local witnesses; case filed with ${p}.`,
          `নৌকা ও ইয়াবা জব্দ; স্থানীয় সাক্ষীদের উপস্থিতিতে জব্দ তালিকা প্রস্তুত; ${pb}য় মামলা দায়ের।`,
        ),
        outcome: both(
          'Tablets kept in the battalion store and handed to the Department of Narcotics Control for destruction under court order.',
          'ট্যাবলেট ব্যাটালিয়ন স্টোরে সংরক্ষিত; আদালতের আদেশে ধ্বংসের জন্য মাদকদ্রব্য নিয়ন্ত্রণ অধিদপ্তরে হস্তান্তর।',
        ),
        items: [
          ['Yaba tablets / ইয়াবা ট্যাবলেট', `${en(q)} pcs`, `Est. value Tk ${en(q * 150)}`],
          ['Wooden boat / কাঠের নৌকা', '1', 'Unregistered, no engine'],
          ['Fishing net / মাছ ধরার জাল', '2', '—'],
        ],
      };
    },
  },
  {
    id: 'yaba-carrier', category: 'Smuggling', subcategory: 'Yaba/Ice', battalions: ['17 BGB', '34 BGB'],
    bops: ['BOP Whykong', 'BOP Teknaf River', 'BOP Himchari', 'BOP Ghumdhum', 'BOP Bandarban'], weight: 6, hours: [7, 22],
    images: ['yaba-tablets', 'teknaf-sanctuary', 'phones'], doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const q = r.pick([2000, 3500, 5000, 8000, 10000, 15000, 22000, 30000]);
      const [x] = people(r, 1);
      const [p, pb] = ps(b);
      return {
        title: `Carrier arrested with ${en(q)} Yaba tablets at ${place[0]} checkpoint`,
        titleBn: `${place[1]} চেকপোস্টে ${bn(q)} পিস ইয়াবাসহ বাহক আটক`,
        severity: q >= 15000 ? 'High' : 'Medium',
        description: both(
          `Acting on information, a check team of ${b.bop} stopped a passenger auto-rickshaw at ${place[0]} at about ${time}. A male passenger looked nervous and tried to walk away. A body search found ${en(q)} Yaba tablets wrapped in tape around his waist and inside his shoes.`,
          `গোপন সংবাদের ভিত্তিতে ${b.bopBn}-এর একটি চেকিং দল আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এ একটি যাত্রীবাহী অটোরিকশা থামায়। একজন পুরুষ যাত্রী অস্বাভাবিক আচরণ করে সরে যাওয়ার চেষ্টা করলে তাকে তল্লাশি করা হয়। তার কোমরে টেপ দিয়ে পেঁচানো ও জুতার ভেতরে লুকানো ${bn(q)} পিস ইয়াবা উদ্ধার করা হয়।`,
        ),
        personsInvolved: both(`1 arrested: ${x!.en}, auto-rickshaw passenger.`, `আটক ১ জন: ${x!.bn}, অটোরিকশার যাত্রী।`),
        actionTaken: both(`Accused and tablets handed over to ${p} with a case under the Narcotics Control Act 2018.`, `মাদকদ্রব্য নিয়ন্ত্রণ আইন ২০১৮-এ মামলাসহ আসামি ও ইয়াবা ${pb}য় হস্তান্তর।`),
        outcome: both('Accused remanded to jail custody by the court.', 'আদালত আসামিকে জেলহাজতে পাঠিয়েছেন।'),
        items: [['Yaba tablets / ইয়াবা ট্যাবলেট', `${en(q)} pcs`, `Est. value Tk ${en(q * 150)}`], ['Mobile phone / মোবাইল ফোন', '1', 'Button phone, 2 SIMs']],
      };
    },
  },
  {
    id: 'ice', category: 'Smuggling', subcategory: 'Yaba/Ice', battalions: ['17 BGB'], bops: ['BOP Shah Porir Dwip', 'BOP Teknaf', 'BOP Teknaf River'],
    weight: 3, hours: [1, 5], images: ['coxs-fishing-boats', 'fishing-boat', 'naf-boats-hills'], videos: ['sampan-boats-coxs'], videoChance: 0.5, doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const kg = r.pick([0.5, 0.8, 1, 1.5, 2, 3]);
      const [p, pb] = ps(b);
      return {
        title: `${kg} kg crystal meth (Ice) recovered at ${place[0]}`,
        titleBn: `${place[1]}-এ ${bn(String(kg))} কেজি ক্রিস্টাল মেথ (আইস) উদ্ধার`,
        severity: kg >= 1 ? 'Critical' : 'High',
        description: both(
          `A night ambush of ${b.bop} at ${place[0]} saw a fishing trawler land two bags at about ${time}. The people on shore fled into the mangroves when the patrol moved in. The bags held ${kg} kg of crystal methamphetamine (Ice) in vacuum-sealed packets, wrapped in polythene against seawater.`,
          `${place[1]}-এ ${b.bopBn}-এর রাত্রিকালীন অ্যাম্বুশ দল আনুমানিক ${bnTime(time)} ঘটিকায় একটি মাছ ধরার ট্রলার থেকে দুটি ব্যাগ নামাতে দেখে। টহল দল এগিয়ে গেলে তীরে থাকা লোকজন প্যারাবনের দিকে পালিয়ে যায়। ব্যাগ দুটি থেকে সমুদ্রের পানি থেকে রক্ষায় পলিথিনে মোড়ানো ভ্যাকুয়াম সিল করা প্যাকেটে ${bn(String(kg))} কেজি ক্রিস্টাল মেথ (আইস) উদ্ধার করা হয়।`,
        ),
        personsInvolved: both('3 to 4 unidentified people fled; the trawler left towards the sea.', 'অজ্ঞাতনামা ৩-৪ জন পালিয়ে যায়; ট্রলারটি সাগরের দিকে চলে যায়।'),
        actionTaken: both(`Contraband seized; Coast Guard informed about the trawler; case filed with ${p}.`, `মাদক জব্দ; ট্রলারের বিষয়ে কোস্ট গার্ডকে অবহিত; ${pb}য় মামলা দায়ের।`),
        outcome: both('Sample sent to the chemical examiner; result confirmed methamphetamine.', 'নমুনা রাসায়নিক পরীক্ষকের কাছে পাঠানো হয়; মেথঅ্যামফিটামিন নিশ্চিত হয়েছে।'),
        items: [['Crystal meth (Ice) / আইস', `${kg} kg`, `Est. value Tk ${en(kg * 1_00_00_000)}`], ['Nylon bag / নাইলনের ব্যাগ', '2', '—']],
      };
    },
  },
  {
    id: 'phensedyl', category: 'Smuggling', subcategory: 'Phensedyl', battalions: ['8 BGB', '21 BGB', '33 BGB', '29 BGB', '42 BGB'],
    weight: 7, season: (m) => dry(m), hours: [20, 4], images: ['syrup-bottles', 'syrup-bottle-2', 'fence-dinajpur', 'footprints-mud'], videos: ['padma-cargo-boat'], videoChance: 0.15, doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const q = r.pick([120, 180, 250, 340, 480, 600, 850, 1200, 1800, 2400]);
      const caught = r.chance(0.5);
      const xs = caught ? people(r, r.int(1, 2)) : [];
      const [p, pb] = ps(b);
      return {
        title: `${en(q)} bottles of Phensedyl seized at ${place[0]}`,
        titleBn: `${place[1]}-এ ${bn(q)} বোতল ফেনসিডিল জব্দ`,
        severity: q >= 1000 ? 'High' : q >= 300 ? 'Medium' : 'Low',
        description: both(
          `At about ${time} a patrol of ${b.bop} lying in wait near ${place[0]} saw ${caught ? 'two men' : 'a group'} carrying sacks from the zero line towards the village. ${caught ? 'The patrol caught them after a short chase.' : 'They dropped the sacks and ran back across the border when challenged.'} The sacks contained ${en(q)} bottles of Indian Phensedyl cough syrup (100 ml).`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এর কাছে ওত পেতে থাকা ${b.bopBn}-এর টহল দল শূন্যরেখা থেকে গ্রামের দিকে ${caught ? 'দুইজন ব্যক্তিকে' : 'একদল লোককে'} বস্তা বহন করতে দেখে। ${caught ? 'সংক্ষিপ্ত ধাওয়ার পর তাদের আটক করা হয়।' : 'চ্যালেঞ্জ করলে তারা বস্তা ফেলে সীমান্তের ওপারে পালিয়ে যায়।'} বস্তাগুলো থেকে ভারতীয় ফেনসিডিল সিরাপের ${bn(q)} বোতল (১০০ মিলি) উদ্ধার করা হয়।`,
        ),
        personsInvolved: caught
          ? both(`Arrested: ${list(xs.map((x) => x.en))}.`, `আটক: ${list(xs.map((x) => x.bn), 'ও')}।`)
          : both('Carriers unidentified; fled across the border.', 'বাহকরা অজ্ঞাতনামা; সীমান্তের ওপারে পালিয়ে গেছে।'),
        actionTaken: both(`Bottles seized and listed; ${caught ? `accused handed over to ${p}` : `case filed against unknown persons with ${p}`}.`, `বোতল জব্দ ও তালিকাভুক্ত; ${caught ? `আসামিদের ${pb}য় হস্তান্তর` : `অজ্ঞাতনামাদের বিরুদ্ধে ${pb}য় মামলা দায়ের`}।`),
        outcome: both('Seized bottles deposited at the battalion store pending destruction.', 'জব্দকৃত বোতল ধ্বংসের অপেক্ষায় ব্যাটালিয়ন স্টোরে জমা।'),
        items: [['Phensedyl 100 ml / ফেনসিডিল', `${en(q)} bottles`, `Est. value Tk ${en(q * 1200)}`], ['Plastic sack / প্লাস্টিকের বস্তা', String(Math.ceil(q / 120)), '—']],
      };
    },
  },
  {
    id: 'gold', category: 'Smuggling', subcategory: 'Gold', battalions: ['8 BGB', '33 BGB', '22 BGB'], bops: ['BOP Benapole', 'BOP Bhomra', 'BOP Kalaroa', 'BOP Burimari'],
    weight: 5, hours: [7, 18], images: ['gold-ingots', 'gold-bars', 'benapole-port'], doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const pcs = r.pick([2, 4, 6, 8, 12, 16, 24]);
      const kg = (pcs * 116.64) / 1000;
      const [x] = people(r, 1);
      const [p, pb] = ps(b);
      const vehicle = r.pick([['motorcycle', 'মোটরসাইকেল'], ['bicycle', 'বাইসাইকেল'], ['passenger bus', 'যাত্রীবাহী বাস']] as const);
      return {
        title: `${pcs} gold bars (${kg.toFixed(2)} kg) seized near ${place[0]}`,
        titleBn: `${place[1]}-এর কাছে ${bn(pcs)}টি স্বর্ণের বার (${bn(kg.toFixed(2))} কেজি) জব্দ`,
        severity: pcs >= 10 ? 'Critical' : 'High',
        description: both(
          `On specific information that gold would be smuggled to India, a team of ${b.bop} set up a check near ${place[0]}. At about ${time} they stopped a man travelling by ${vehicle[0]}. ${pcs} gold bars of 10 tola each (${kg.toFixed(2)} kg) were found sewn into a cloth belt under his shirt. He could not show any papers for the gold.`,
          `ভারতে স্বর্ণ পাচারের সুনির্দিষ্ট তথ্যের ভিত্তিতে ${b.bopBn}-এর একটি দল ${place[1]}-এর কাছে চেকপোস্ট স্থাপন করে। আনুমানিক ${bnTime(time)} ঘটিকায় ${vehicle[1]}যোগে যাওয়া এক ব্যক্তিকে থামানো হয়। তার জামার নিচে কাপড়ের বেল্টে সেলাই করা অবস্থায় ১০ তোলা ওজনের ${bn(pcs)}টি স্বর্ণের বার (${bn(kg.toFixed(2))} কেজি) পাওয়া যায়। তিনি স্বর্ণের কোনো বৈধ কাগজ দেখাতে পারেননি।`,
        ),
        personsInvolved: both(`1 arrested: ${x!.en}, courier.`, `আটক ১ জন: ${x!.bn}, বাহক।`),
        actionTaken: both(`Gold weighed and tested by a goldsmith in front of witnesses; accused handed over to ${p}; case under the Special Powers Act.`, `সাক্ষীদের সামনে স্বর্ণকার দিয়ে ওজন ও পরীক্ষা; আসামি ${pb}য় হস্তান্তর; বিশেষ ক্ষমতা আইনে মামলা।`),
        outcome: both('Gold deposited with Bangladesh Bank through the customs house.', 'কাস্টমস হাউসের মাধ্যমে স্বর্ণ বাংলাদেশ ব্যাংকে জমা।'),
        items: [['Gold bar 10 tola / স্বর্ণের বার', `${pcs} pcs (${kg.toFixed(2)} kg)`, `Est. value Tk ${en(Math.round(kg * 1_45_00_000))}`], [`${vehicle[0].charAt(0).toUpperCase()}${vehicle[0].slice(1)} / ${vehicle[1]}`, '1', vehicle[0] === 'passenger bus' ? 'Not seized' : 'Seized']],
      };
    },
  },
  {
    id: 'liquor', category: 'Smuggling', subcategory: 'Alcohol', battalions: ['33 BGB', '29 BGB', '22 BGB', '8 BGB'], weight: 4, season: (m) => dry(m),
    hours: [19, 2], images: ['liquor-bottles', 'fence-dinajpur', 'river-boat'], doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const q = r.pick([48, 72, 96, 144, 210, 300, 420, 600]);
      const [p, pb] = ps(b);
      return {
        title: `${en(q)} bottles of Indian liquor seized at ${place[0]}`,
        titleBn: `${place[1]}-এ ${bn(q)} বোতল ভারতীয় মদ জব্দ`,
        severity: q >= 300 ? 'High' : q >= 100 ? 'Medium' : 'Low',
        description: both(
          `A patrol of ${b.bop} found ${en(q)} bottles of Indian whisky and rum hidden in a jute field at ${place[0]} at about ${time}, about 150 m inside Bangladesh. Fresh footprints led back to the zero line. The bottles were in cartons marked "for sale in India only".`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর টহল দল ${place[1]}-এ সীমান্ত থেকে প্রায় ১৫০ মিটার ভেতরে একটি পাটক্ষেতে লুকানো ভারতীয় হুইস্কি ও রামের ${bn(q)} বোতল পায়। টাটকা পায়ের ছাপ শূন্যরেখা পর্যন্ত গেছে। বোতলগুলো "শুধু ভারতে বিক্রয়ের জন্য" লেখা কার্টনে ছিল।`,
        ),
        personsInvolved: both('No arrest; owners unidentified.', 'কেউ আটক হয়নি; মালিক অজ্ঞাত।'),
        actionTaken: both(`Bottles seized; case filed against unknown persons with ${p}; area placed under extra night patrol.`, `বোতল জব্দ; অজ্ঞাতনামাদের বিরুদ্ধে ${pb}য় মামলা; এলাকায় রাত্রিকালীন টহল জোরদার।`),
        outcome: both('Liquor destroyed in the presence of a magistrate.', 'ম্যাজিস্ট্রেটের উপস্থিতিতে মদ ধ্বংস করা হয়েছে।'),
        items: [['Indian liquor 750 ml / ভারতীয় মদ', `${en(q)} bottles`, `Est. value Tk ${en(q * 1800)}`]],
      };
    },
  },
  {
    id: 'cattle', category: 'Smuggling', subcategory: 'Livestock', battalions: ['21 BGB', '22 BGB', '29 BGB', '33 BGB'], weight: 5,
    hours: [1, 5], images: ['cattle-char', 'cattle-water', 'river-boat'], videos: ['padma-cargo-boat'], videoChance: 0.35, doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const q = r.pick([6, 9, 12, 15, 22, 30, 45]);
      const [p, pb] = ps(b);
      return {
        title: `${q} head of cattle seized while crossing at ${place[0]}`,
        titleBn: `${place[1]}-এ পারাপারের সময় ${bn(q)}টি গরু আটক`,
        severity: q >= 25 ? 'High' : 'Medium',
        description: both(
          `At about ${time}, in fog, a patrol of ${b.bop} heard cattle moving through the shallow channel near ${place[0]}. The herders ran back across the border when the patrol switched on torches. ${q} head of Indian cattle were rounded up on the char; the animals had no ear tags or veterinary papers.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় কুয়াশার মধ্যে ${b.bopBn}-এর টহল দল ${place[1]}-এর কাছে অগভীর চ্যানেল দিয়ে গবাদিপশু চলাচলের শব্দ শুনতে পায়। টর্চ জ্বালালে রাখালরা সীমান্তের ওপারে পালিয়ে যায়। চর থেকে ${bn(q)}টি ভারতীয় গরু আটক করা হয়; গরুগুলোর কানে ট্যাগ বা পশু চিকিৎসার কোনো কাগজ ছিল না।`,
        ),
        personsInvolved: both('Herders unidentified; fled across the border.', 'রাখালরা অজ্ঞাতনামা; সীমান্তের ওপারে পালিয়ে গেছে।'),
        actionTaken: both(`Cattle seized and handed to the customs authority; GD entry at ${p}.`, `গরু জব্দ করে কাস্টমস কর্তৃপক্ষের কাছে হস্তান্তর; ${pb}য় জিডি।`),
        outcome: both('Cattle auctioned by customs; proceeds deposited to the treasury.', 'কাস্টমস কর্তৃক গরু নিলামে বিক্রি; অর্থ সরকারি কোষাগারে জমা।'),
        items: [['Indian cattle / ভারতীয় গরু', `${q} head`, `Est. value Tk ${en(q * 85000)}`]],
      };
    },
  },
  {
    id: 'electronics', category: 'Smuggling', subcategory: 'Electronics', battalions: ['22 BGB', '48 BGB', '29 BGB'], bops: ['BOP Burimari', 'BOP Tamabil', 'BOP Hili'],
    weight: 3, hours: [9, 19], images: ['phones', 'tamabil-coal-trucks', 'benapole-port'], doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const q = r.pick([60, 120, 200, 350, 500, 800]);
      const [x] = people(r, 1);
      const [p, pb] = ps(b);
      return {
        title: `${en(q)} smuggled mobile phones found in a truck at ${place[0]}`,
        titleBn: `${place[1]}-এ ট্রাক থেকে ${bn(q)}টি চোরাই মোবাইল ফোন উদ্ধার`,
        severity: q >= 300 ? 'High' : 'Medium',
        description: both(
          `During a joint check with customs at ${place[0]} at about ${time}, a returning empty truck was found to have a false floor behind the driver's cabin. ${en(q)} new smartphones and chargers without customs papers were hidden inside.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এ কাস্টমসের সঙ্গে যৌথ তল্লাশিতে একটি খালি ফেরত আসা ট্রাকের চালকের কেবিনের পেছনে গোপন খোপ পাওয়া যায়। ভেতরে শুল্ক কাগজবিহীন ${bn(q)}টি নতুন স্মার্টফোন ও চার্জার লুকানো ছিল।`,
        ),
        personsInvolved: both(`Truck driver ${x!.en} detained for questioning.`, `ট্রাকচালক ${x!.bn}-কে জিজ্ঞাসাবাদের জন্য আটক।`),
        actionTaken: both(`Phones and truck seized jointly with customs; driver handed to ${p}.`, `কাস্টমসের সঙ্গে যৌথভাবে ফোন ও ট্রাক জব্দ; চালককে ${pb}য় হস্তান্তর।`),
        outcome: both('Goods handed to the customs house under a seizure memo.', 'জব্দ তালিকামূলে মালামাল কাস্টমস হাউসে হস্তান্তর।'),
        items: [['Smartphone / স্মার্টফোন', `${en(q)} pcs`, `Est. value Tk ${en(q * 14000)}`], ['Truck / ট্রাক', '1', 'Indian registration']],
      };
    },
  },
  {
    id: 'stone-boats', category: 'Smuggling', subcategory: 'Other', battalions: ['48 BGB'], weight: 3, hours: [5, 17],
    images: ['jaflong-boats', 'jaflong-boats-2', 'tamabil-coal'], videos: ['haor-boat', 'floating-market-boats'], videoChance: 0.5, doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const q = r.pick([4, 6, 8, 12, 15]);
      return {
        title: `${q} boats carrying stone and coal stopped on the ${place[0]}`,
        titleBn: `${place[1]}-এ পাথর ও কয়লাবাহী ${bn(q)}টি নৌকা আটক`,
        severity: q >= 10 ? 'Medium' : 'Low',
        description: both(
          `A river patrol of ${b.bop} stopped ${q} country boats at ${place[0]} at about ${time}. The boatmen had collected stones and coal from the Indian side of the river beyond the zero line, which is not permitted. The loads were offloaded and the boatmen warned.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর নদী টহল দল ${place[1]}-এ ${bn(q)}টি দেশি নৌকা থামায়। মাঝিরা শূন্যরেখা অতিক্রম করে নদীর ভারতীয় অংশ থেকে পাথর ও কয়লা সংগ্রহ করেছিল, যা অনুমোদিত নয়। মালামাল নামিয়ে মাঝিদের সতর্ক করা হয়।`,
        ),
        personsInvolved: both(`${q * 2} boatmen from local villages (warned, not arrested).`, `স্থানীয় গ্রামের ${bn(q * 2)} জন মাঝি (সতর্ক করা হয়েছে, আটক করা হয়নি)।`),
        actionTaken: both('Stone and coal seized; boatmen listed and warned; matter raised with the Upazila administration.', 'পাথর ও কয়লা জব্দ; মাঝিদের তালিকা করে সতর্ক; উপজেলা প্রশাসনকে অবহিত।'),
        outcome: both('Seized material handed to the Upazila Nirbahi Officer for auction.', 'জব্দকৃত মালামাল নিলামের জন্য উপজেলা নির্বাহী অফিসারের কাছে হস্তান্তর।'),
        items: [['Stone / পাথর', `${q * 150} cft`, '—'], ['Coal / কয়লা', `${q * 0.8} t`, '—']],
      };
    },
  },
  // ------------------------------------------------------------------ Illegal crossing
  {
    id: 'crossing-entry', category: 'Illegal Crossing', subcategory: 'Entry without documents', battalions: ['8 BGB', '33 BGB', '29 BGB', '22 BGB', '42 BGB'],
    weight: 6, season: (m) => dry(m), hours: [2, 6], images: ['fence-dinajpur', 'fence-barrier', 'pillar-175-a', 'footprints-mud'], doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const men = r.int(1, 6), women = r.int(0, 4), children = r.int(0, 3);
      const n = men + women + children;
      const [p, pb] = ps(b);
      return {
        title: `${n} people detained after entering without documents at ${place[0]}`,
        titleBn: `${place[1]} দিয়ে অবৈধভাবে প্রবেশের সময় ${bn(n)} জন আটক`,
        severity: n >= 10 ? 'High' : 'Medium',
        description: both(
          `At about ${time} a patrol of ${b.bop} detained ${n} people (${men} men, ${women} women, ${children} children) walking from the zero line towards ${place[0]}. They said they are Bangladeshi nationals who had gone to India for work through brokers two to three years ago and were coming back without passports.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর টহল দল শূন্যরেখা থেকে ${place[1]}-এর দিকে হেঁটে আসা ${bn(n)} জনকে (পুরুষ ${bn(men)}, নারী ${bn(women)}, শিশু ${bn(children)}) আটক করে। তারা জানায়, তারা বাংলাদেশি নাগরিক; দুই-তিন বছর আগে দালালের মাধ্যমে কাজের জন্য ভারতে গিয়েছিল এবং পাসপোর্ট ছাড়াই ফিরে আসছিল।`,
        ),
        personsInvolved: both(`${n} Bangladeshi nationals (addresses verified through Union Parishad).`, `${bn(n)} জন বাংলাদেশি নাগরিক (ইউনিয়ন পরিষদের মাধ্যমে ঠিকানা যাচাই)।`),
        actionTaken: both(`Identities checked; handed over to ${p} under the Passport Act.`, `পরিচয় যাচাই; পাসপোর্ট আইনে ${pb}য় হস্তান্তর।`),
        outcome: both('Released to families on bail by the court; broker information shared with police.', 'আদালত জামিনে পরিবারের কাছে মুক্তি দিয়েছেন; দালালদের তথ্য পুলিশের সঙ্গে বিনিময়।'),
      };
    },
  },
  {
    id: 'crossing-exit', category: 'Illegal Crossing', subcategory: 'Exit without documents', battalions: ['33 BGB', '8 BGB', '21 BGB'], weight: 4,
    hours: [21, 4], images: ['fence-barrier', 'pillar-angarpota', 'footprints-mud'], doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const n = r.int(2, 9);
      const [broker] = people(r, 1);
      const [p, pb] = ps(b);
      return {
        title: `Attempt to cross into India foiled at ${place[0]}; broker arrested`,
        titleBn: `${place[1]} দিয়ে ভারতে অনুপ্রবেশের চেষ্টা ব্যর্থ; দালাল আটক`,
        severity: n >= 6 ? 'High' : 'Medium',
        description: both(
          `At about ${time}, ${n} people were stopped by a patrol of ${b.bop} at ${place[0]} as a local broker led them towards a gap near the zero line. Each had paid the broker Tk 15,000–25,000 for being taken to India for work.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এ একজন স্থানীয় দালাল ${bn(n)} জনকে শূন্যরেখার কাছে একটি ফাঁকা জায়গার দিকে নিয়ে যাওয়ার সময় ${b.bopBn}-এর টহল দল তাদের থামায়। কাজের জন্য ভারতে নিয়ে যাওয়ার কথা বলে প্রত্যেকের কাছ থেকে দালাল ১৫,০০০–২৫,০০০ টাকা নিয়েছিল।`,
        ),
        personsInvolved: both(`Broker ${broker!.en} arrested; ${n} would-be migrants.`, `দালাল ${broker!.bn} আটক; ${bn(n)} জন অভিবাসনপ্রত্যাশী।`),
        actionTaken: both(`Broker handed to ${p} under the Prevention and Suppression of Human Trafficking Act; migrants counselled and released to families.`, `মানব পাচার প্রতিরোধ ও দমন আইনে দালালকে ${pb}য় হস্তান্তর; অভিবাসনপ্রত্যাশীদের পরামর্শ দিয়ে পরিবারের কাছে হস্তান্তর।`),
        outcome: both('Case under investigation by police.', 'মামলাটি পুলিশের তদন্তাধীন।'),
      };
    },
  },
  {
    id: 'overstay', category: 'Illegal Crossing', subcategory: 'Overstay', battalions: ['8 BGB', '48 BGB', '22 BGB'], bops: ['BOP Benapole', 'BOP Tamabil', 'BOP Burimari'],
    weight: 2, hours: [10, 17], images: ['benapole-port', 'tamabil-coal-trucks'], doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const days = r.int(12, 140);
      return {
        title: `Foreign national with expired visa stopped at ${place[0]}`,
        titleBn: `${place[1]}-এ মেয়াদোত্তীর্ণ ভিসাধারী বিদেশি নাগরিক আটক`,
        severity: 'Low',
        description: both(
          `At about ${time}, at the departure gate of ${place[0]}, immigration staff found that a foreign traveller's visa had expired ${days} days earlier. The BGB post of ${b.bop} held him until the immigration police completed the formalities.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এর বহির্গমন গেটে ইমিগ্রেশন কর্মকর্তারা দেখেন, এক বিদেশি যাত্রীর ভিসার মেয়াদ ${bn(days)} দিন আগে শেষ হয়েছে। ইমিগ্রেশন পুলিশের আনুষ্ঠানিকতা শেষ না হওয়া পর্যন্ত ${b.bopBn} তাকে হেফাজতে রাখে।`,
        ),
        personsInvolved: both('1 foreign national (passport details in the immigration record).', '১ জন বিদেশি নাগরিক (পাসপোর্টের বিবরণ ইমিগ্রেশন রেকর্ডে)।'),
        actionTaken: both('Handed to immigration police; overstay fine assessed.', 'ইমিগ্রেশন পুলিশের কাছে হস্তান্তর; অতিরিক্ত অবস্থানের জরিমানা নির্ধারণ।'),
        outcome: both('Fine paid; allowed to depart.', 'জরিমানা পরিশোধের পর বহির্গমনের অনুমতি দেওয়া হয়েছে।'),
      };
    },
  },
  {
    id: 'myanmar-entry', category: 'Illegal Crossing', subcategory: 'Route violation', battalions: ['17 BGB', '34 BGB'], bops: ['BOP Ghumdhum', 'BOP Whykong', 'BOP Bandarban', 'BOP Thanchi'],
    weight: 3, season: (_m, y) => (y >= 2026 ? 1.6 : 0.8), hours: [4, 9], images: ['teknaf-sanctuary', 'naf-boats-hills', 'pillar-angarpota'], doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const n = r.int(3, 18);
      return {
        title: `${n} Myanmar nationals entered through ${place[0]} fleeing fighting`,
        titleBn: `সংঘাত থেকে পালিয়ে ${place[1]} দিয়ে ${bn(n)} জন মিয়ানমার নাগরিকের প্রবেশ`,
        severity: n >= 10 ? 'Critical' : 'High',
        description: both(
          `At about ${time}, ${n} Myanmar nationals, including injured persons, crossed through the hills near ${place[0]} after heavy fighting on the Myanmar side through the night. The patrol of ${b.bop} stopped them close to the border, gave first aid and food, and kept them under guard.`,
          `রাতভর মিয়ানমারের অভ্যন্তরে তীব্র সংঘর্ষের পর আনুমানিক ${bnTime(time)} ঘটিকায় আহত ব্যক্তিসহ ${bn(n)} জন মিয়ানমার নাগরিক ${place[1]}-এর কাছে পাহাড়ি পথ দিয়ে সীমান্ত অতিক্রম করে। ${b.bopBn}-এর টহল দল তাদের সীমান্তের কাছেই থামিয়ে প্রাথমিক চিকিৎসা ও খাবার দেয় এবং পাহারায় রাখে।`,
        ),
        personsInvolved: both(`${n} Myanmar nationals (${r.int(1, 3)} injured).`, `${bn(n)} জন মিয়ানমার নাগরিক (কয়েকজন আহত)।`),
        actionTaken: both('Reported to Sector HQ and BGB HQ at once; injured referred to the upazila health complex under guard.', 'তাৎক্ষণিকভাবে সেক্টর সদর ও বিজিবি সদর দপ্তরে অবহিত; আহতদের পাহারায় উপজেলা স্বাস্থ্য কমপ্লেক্সে প্রেরণ।'),
        outcome: both('Handled according to government instructions; return arranged through a flag meeting.', 'সরকারি নির্দেশনা অনুযায়ী ব্যবস্থা; পতাকা বৈঠকের মাধ্যমে ফেরত পাঠানোর ব্যবস্থা।'),
      };
    },
  },
  // ------------------------------------------------------------------ Arms & ammunition
  {
    id: 'pistol', category: 'Arms & Ammunition', subcategory: 'Firearms', battalions: ['21 BGB', '29 BGB', '8 BGB', '42 BGB'], weight: 3,
    hours: [19, 3], images: ['pistol', 'cartridges', 'fence-barrier'], doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const rounds = r.pick([4, 7, 10, 14, 20]);
      const caught = r.chance(0.4);
      const [x] = people(r, 1);
      const [p, pb] = ps(b);
      return {
        title: `Foreign-made pistol and ${rounds} rounds recovered at ${place[0]}`,
        titleBn: `${place[1]}-এ বিদেশি পিস্তল ও ${bn(rounds)} রাউন্ড গুলি উদ্ধার`,
        severity: 'Critical',
        description: both(
          `At about ${time} a patrol of ${b.bop} challenged ${caught ? 'a man' : 'two men'} near ${place[0]}. ${caught ? 'He was caught while trying to throw a bag into a pond.' : 'They threw down a bag and escaped across the border.'} The bag held a foreign-made 7.65 mm pistol, one magazine and ${rounds} rounds of ammunition wrapped in a towel.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এর কাছে ${b.bopBn}-এর টহল দল ${caught ? 'এক ব্যক্তিকে' : 'দুই ব্যক্তিকে'} চ্যালেঞ্জ করে। ${caught ? 'পুকুরে একটি ব্যাগ ছুড়ে ফেলার চেষ্টাকালে তাকে আটক করা হয়।' : 'তারা একটি ব্যাগ ফেলে সীমান্তের ওপারে পালিয়ে যায়।'} ব্যাগে তোয়ালেতে মোড়ানো একটি বিদেশি ৭.৬৫ মিমি পিস্তল, একটি ম্যাগাজিন ও ${bn(rounds)} রাউন্ড গুলি পাওয়া যায়।`,
        ),
        personsInvolved: caught ? both(`1 arrested: ${x!.en}.`, `আটক ১ জন: ${x!.bn}।`) : both('Two unidentified persons escaped across the border.', 'অজ্ঞাতনামা দুই ব্যক্তি সীমান্তের ওপারে পালিয়ে যায়।'),
        actionTaken: both(`Weapon made safe and seized; case under the Arms Act filed with ${p}; intelligence agencies informed.`, `অস্ত্র নিরাপদ করে জব্দ; অস্ত্র আইনে ${pb}য় মামলা; গোয়েন্দা সংস্থাকে অবহিত।`),
        outcome: both('Weapon sent for forensic examination; investigation continuing.', 'অস্ত্রটি ফরেনসিক পরীক্ষায় পাঠানো হয়েছে; তদন্ত চলছে।'),
        items: [['Pistol 7.65 mm / পিস্তল', '1', 'Foreign made, serial filed off'], ['Magazine / ম্যাগাজিন', '1', '—'], ['Ammunition / গুলি', `${rounds} rounds`, '7.65 mm']],
      };
    },
  },
  {
    id: 'ammo-cache', category: 'Arms & Ammunition', subcategory: 'Ammunition', battalions: ['34 BGB', '17 BGB'], bops: ['BOP Thanchi', 'BOP Bandarban', 'BOP Rangamati', 'BOP Ghumdhum'],
    weight: 2, hours: [9, 15], images: ['cartridges', 'teknaf-sanctuary'], doc: 'seizure',
    build: ({ r, b, place, time }) => {
      const rounds = r.pick([60, 110, 180, 250, 340]);
      const [p, pb] = ps(b);
      return {
        title: `Hidden cache of ${rounds} rounds found in the hills near ${place[0]}`,
        titleBn: `${place[1]}-এর পাহাড়ে লুকানো ${bn(rounds)} রাউন্ড গুলির মজুত উদ্ধার`,
        severity: 'Critical',
        description: both(
          `During an area-domination patrol, a section of ${b.bop} found a buried plastic drum under a rock overhang near ${place[0]} at about ${time}. It held ${rounds} rounds of rifle ammunition, two empty magazines and a set of old uniforms, apparently left by an armed group.`,
          `এলাকা নিয়ন্ত্রণ টহলের সময় আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর একটি সেকশন ${place[1]}-এর কাছে পাথরের খাঁজের নিচে মাটিচাপা একটি প্লাস্টিকের ড্রাম খুঁজে পায়। ড্রামে রাইফেলের ${bn(rounds)} রাউন্ড গুলি, দুটি খালি ম্যাগাজিন ও পুরোনো পোশাক ছিল, যা কোনো সশস্ত্র গোষ্ঠী রেখে গেছে বলে ধারণা।`,
        ),
        personsInvolved: both('No persons found at the site.', 'ঘটনাস্থলে কাউকে পাওয়া যায়নি।'),
        actionTaken: both(`Site cordoned; ammunition recovered and counted; case filed with ${p}; joint search planned with the army camp.`, `ঘটনাস্থল ঘেরাও; গুলি উদ্ধার ও গণনা; ${pb}য় মামলা; সেনা ক্যাম্পের সঙ্গে যৌথ তল্লাশির পরিকল্পনা।`),
        outcome: both('Follow-up search found no further caches.', 'পরবর্তী তল্লাশিতে আর কোনো মজুত পাওয়া যায়নি।'),
        items: [['Rifle ammunition / রাইফেলের গুলি', `${rounds} rounds`, '7.62 mm'], ['Magazine / ম্যাগাজিন', '2', 'Empty'], ['Plastic drum / প্লাস্টিকের ড্রাম', '1', '—']],
      };
    },
  },
  {
    id: 'sharp-weapons', category: 'Arms & Ammunition', subcategory: 'Sharp weapons', battalions: ['29 BGB', '21 BGB', '22 BGB'], weight: 2,
    hours: [22, 4], images: ['footprints-mud', 'fence-dinajpur'], doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const xs = people(r, 2);
      const [p, pb] = ps(b);
      return {
        title: `Smugglers attack patrol with sharp weapons at ${place[0]}; two arrested`,
        titleBn: `${place[1]}-এ ধারালো অস্ত্র নিয়ে টহল দলের ওপর চোরাকারবারিদের হামলা; দুইজন আটক`,
        severity: 'High',
        description: both(
          `At about ${time} a group of about 15 smugglers attacked a patrol of ${b.bop} at ${place[0]} with machetes and sticks when the patrol tried to stop a cattle crossing. Two BGB members received minor cuts. The patrol fired blank rounds in self-defence; the group fled and two were caught.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এ গরু পারাপারে বাধা দিলে প্রায় ১৫ জনের একদল চোরাকারবারি রামদা ও লাঠিসোঁটা নিয়ে ${b.bopBn}-এর টহল দলের ওপর হামলা চালায়। দুইজন বিজিবি সদস্য সামান্য আহত হন। টহল দল আত্মরক্ষার্থে ফাঁকা গুলি ছোড়ে; দলটি পালিয়ে যায় এবং দুইজনকে আটক করা হয়।`,
        ),
        personsInvolved: both(`Arrested: ${list(xs.map((x) => x.en))}. Two BGB members slightly injured.`, `আটক: ${list(xs.map((x) => x.bn), 'ও')}। দুইজন বিজিবি সদস্য সামান্য আহত।`),
        actionTaken: both(`Injured treated at the BOP; machetes seized; case for assault on duty filed with ${p}.`, `আহতদের বিওপিতে চিকিৎসা; রামদা জব্দ; কর্তব্যরত অবস্থায় হামলার অভিযোগে ${pb}য় মামলা।`),
        outcome: both('Both accused in jail custody; injured members back on duty.', 'আসামি দুজন জেলহাজতে; আহত সদস্যরা দায়িত্বে ফিরেছেন।'),
      };
    },
  },
  // ------------------------------------------------------------------ Human trafficking
  {
    id: 'sea-trafficking', category: 'Human Trafficking', subcategory: 'Rohingya trafficking', battalions: ['17 BGB'], bops: ['BOP Shah Porir Dwip', 'BOP Teknaf', 'BOP Himchari'],
    weight: 4, season: (m) => seaSeason(m), hours: [21, 3], images: ['coxs-fishing-boats', 'fishing-boat', 'naf-boats-hills'], videos: ['sampan-boats-coxs'], videoChance: 0.5, doc: 'rescue',
    build: ({ r, b, place, time }) => {
      const n = r.int(12, 38);
      const brokers = people(r, 2);
      const [p, pb] = ps(b);
      return {
        title: `${n} people rescued from a boat bound for Malaysia at ${place[0]}`,
        titleBn: `${place[1]}-এ মালয়েশিয়াগামী নৌকা থেকে ${bn(n)} জন উদ্ধার`,
        severity: n >= 25 ? 'Critical' : 'High',
        description: both(
          `On information about a sea-route trafficking attempt, a team of ${b.bop} reached ${place[0]} at about ${time} and found ${n} people, including women and children, waiting in a house near the beach to be put on a fishing boat to Malaysia. Brokers had promised them jobs and charged their families large sums.`,
          `সমুদ্রপথে মানব পাচারের তথ্যের ভিত্তিতে ${b.bopBn}-এর একটি দল আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এ পৌঁছে সৈকতের কাছে একটি ঘরে মালয়েশিয়াগামী মাছ ধরার নৌকায় ওঠার অপেক্ষায় থাকা নারী ও শিশুসহ ${bn(n)} জনকে পায়। দালালরা তাদের চাকরির প্রতিশ্রুতি দিয়ে পরিবারের কাছ থেকে মোটা অঙ্কের টাকা নিয়েছিল।`,
        ),
        personsInvolved: both(`${n} victims rescued; brokers ${list(brokers.map((x) => x.en))} arrested.`, `${bn(n)} জন ভুক্তভোগী উদ্ধার; দালাল ${list(brokers.map((x) => x.bn), 'ও')} আটক।`),
        actionTaken: both(`Victims given food and medical checks; brokers handed to ${p} under the Human Trafficking Act; boat seized.`, `ভুক্তভোগীদের খাবার ও স্বাস্থ্য পরীক্ষা; মানব পাচার আইনে দালালদের ${pb}য় হস্তান্তর; নৌকা জব্দ।`),
        outcome: both('Victims handed to the camp authority and families with support from IOM and local administration.', 'আইওএম ও স্থানীয় প্রশাসনের সহায়তায় ভুক্তভোগীদের ক্যাম্প কর্তৃপক্ষ ও পরিবারের কাছে হস্তান্তর।'),
      };
    },
  },
  {
    id: 'labour-trafficking', category: 'Human Trafficking', subcategory: 'Labor trafficking', battalions: ['33 BGB', '8 BGB', '22 BGB'], weight: 3,
    hours: [18, 23], images: ['fence-barrier', 'benapole-port', 'river-boat'], doc: 'rescue',
    build: ({ r, b, place, time }) => {
      const n = r.int(3, 11);
      const [broker] = people(r, 1);
      const [p, pb] = ps(b);
      return {
        title: `${n} young men rescued from labour traffickers at ${place[0]}`,
        titleBn: `${place[1]}-এ শ্রম পাচারকারীদের কবল থেকে ${bn(n)} তরুণ উদ্ধার`,
        severity: 'High',
        description: both(
          `At about ${time}, a team of ${b.bop} stopped a microbus near ${place[0]} carrying ${n} young men from northern districts. They had been promised factory jobs in India and were to be taken across at night. The broker in charge was arrested at the spot.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর একটি দল ${place[1]}-এর কাছে উত্তরাঞ্চলের ${bn(n)} তরুণকে বহনকারী একটি মাইক্রোবাস থামায়। ভারতের কারখানায় চাকরির প্রতিশ্রুতি দিয়ে রাতে তাদের সীমান্ত পার করানোর কথা ছিল। দায়িত্বে থাকা দালালকে ঘটনাস্থলেই আটক করা হয়।`,
        ),
        personsInvolved: both(`${n} victims (aged 17–24); broker ${broker!.en} arrested.`, `${bn(n)} জন ভুক্তভোগী (বয়স ১৭–২৪); দালাল ${broker!.bn} আটক।`),
        actionTaken: both(`Broker handed to ${p}; victims' families contacted through the Union Parishad.`, `দালালকে ${pb}য় হস্তান্তর; ইউনিয়ন পরিষদের মাধ্যমে ভুক্তভোগীদের পরিবারের সঙ্গে যোগাযোগ।`),
        outcome: both('All victims returned to their families.', 'সকল ভুক্তভোগীকে পরিবারের কাছে ফিরিয়ে দেওয়া হয়েছে।'),
      };
    },
  },
  {
    id: 'child-trafficking', category: 'Human Trafficking', subcategory: 'Child trafficking', battalions: ['8 BGB', '22 BGB', '33 BGB'], weight: 2,
    hours: [8, 20], images: ['benapole-port', 'fence-barrier'], doc: 'rescue',
    build: ({ r, b, place, time }) => {
      const age = r.int(9, 14);
      const [x] = people(r, 1);
      const [p, pb] = ps(b);
      return {
        title: `Child (${age}) rescued from a trafficker near ${place[0]}`,
        titleBn: `${place[1]}-এর কাছে পাচারকারীর কাছ থেকে শিশু (${bn(age)}) উদ্ধার`,
        severity: 'Critical',
        description: both(
          `At about ${time}, BGB members of ${b.bop} at ${place[0]} noticed a ${age}-year-old girl crying while travelling with an unrelated adult who could not explain their relationship. The child said she had been taken from her village with a promise of housework in Dhaka.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এ ${b.bopBn}-এর সদস্যরা ${bn(age)} বছর বয়সী এক মেয়েশিশুকে সম্পর্কহীন এক প্রাপ্তবয়স্কের সঙ্গে কাঁদতে দেখেন; লোকটি তাদের সম্পর্ক ব্যাখ্যা করতে পারেনি। শিশুটি জানায়, ঢাকায় বাসাবাড়িতে কাজ দেওয়ার কথা বলে তাকে গ্রাম থেকে আনা হয়েছে।`,
        ),
        personsInvolved: both(`Child victim (${age}); suspect ${x!.en} arrested.`, `শিশু ভুক্তভোগী (${bn(age)}); সন্দেহভাজন ${x!.bn} আটক।`),
        actionTaken: both(`Child kept with women BGB members; suspect handed to ${p}; Department of Social Services informed.`, `শিশুটিকে নারী বিজিবি সদস্যদের তত্ত্বাবধানে রাখা হয়; সন্দেহভাজনকে ${pb}য় হস্তান্তর; সমাজসেবা অধিদপ্তরকে অবহিত।`),
        outcome: both('Child handed to her parents in the presence of the Upazila Social Services Officer.', 'উপজেলা সমাজসেবা কর্মকর্তার উপস্থিতিতে শিশুটিকে বাবা-মায়ের কাছে হস্তান্তর।'),
      };
    },
  },
  // ------------------------------------------------------------------ Border infrastructure
  {
    id: 'fence-damage', category: 'Border Infrastructure', subcategory: 'Fence damage', battalions: ['29 BGB', '22 BGB', '8 BGB', '42 BGB'], weight: 3,
    hours: [6, 11], images: ['fence-dinajpur', 'fence-barrier'], doc: 'inspection',
    build: ({ r, b, place, time }) => {
      const m = r.int(3, 12);
      const pillar = `${r.int(250, 390)}/${r.int(1, 9)}-S`;
      return {
        title: `Border fence cut over ${m} m near pillar ${pillar}, ${place[0]}`,
        titleBn: `${place[1]}-এ ${bn(pillar)} নম্বর পিলারের কাছে ${bn(m)} মিটার কাঁটাতারের বেড়া কাটা`,
        severity: m >= 8 ? 'Medium' : 'Low',
        description: both(
          `A morning patrol of ${b.bop} found at about ${time} that the barbed-wire fence near pillar ${pillar} at ${place[0]} had been cut over about ${m} m during the night, apparently to move cattle and goods. Drag marks and hoof prints were seen on both sides.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর সকালের টহল দল দেখতে পায়, ${place[1]}-এ ${bn(pillar)} নম্বর পিলারের কাছে রাতে প্রায় ${bn(m)} মিটার কাঁটাতারের বেড়া কেটে ফেলা হয়েছে, সম্ভবত গরু ও মালামাল পারাপারের জন্য। দুই পাশেই টেনে নেওয়ার দাগ ও খুরের ছাপ দেখা গেছে।`,
        ),
        personsInvolved: both('Unknown.', 'অজ্ঞাত।'),
        actionTaken: both('Damage photographed and measured; raised with the BSF company commander at a flag meeting; extra night ambush posted.', 'ক্ষতির ছবি তোলা ও মাপা হয়েছে; পতাকা বৈঠকে বিএসএফ কোম্পানি কমান্ডারের কাছে উত্থাপন; রাত্রিকালীন অ্যাম্বুশ মোতায়েন।'),
        outcome: both('Fence repaired by the Indian side within the week.', 'সপ্তাহের মধ্যে ভারতীয় পক্ষ বেড়া মেরামত করেছে।'),
      };
    },
  },
  {
    id: 'pillar-damage', category: 'Border Infrastructure', subcategory: 'Pillar damage', battalions: ['21 BGB', '22 BGB', '48 BGB', '33 BGB', '34 BGB'], weight: 3,
    season: (m) => (m >= 7 && m <= 10 ? 1.8 : 0.8), hours: [8, 15], images: ['pillar-175-a', 'pillar-175-b', 'pillar-angarpota', 'border-hat'], doc: 'inspection',
    build: ({ r, b, place, time }) => {
      const pillar = `${r.int(100, 2100)}/${r.int(1, 12)}-S`;
      // [English, Bangla locative (by …), Bangla genitive (… of)]
      const cause = r.pick([['river erosion', 'নদীভাঙনে', 'নদীভাঙনের'], ['a landslide', 'পাহাড়ধসে', 'পাহাড়ধসের'], ['earth cutting by brickfield workers', 'ইটভাটার শ্রমিকদের মাটি কাটায়', 'ইটভাটার শ্রমিকদের মাটি কাটার']] as const);
      return {
        title: `Border pillar ${pillar} damaged by ${cause[0]} at ${place[0]}`,
        titleBn: `${place[1]}-এ ${cause[1]} ${bn(pillar)} নম্বর সীমান্ত পিলার ক্ষতিগ্রস্ত`,
        severity: r.chance(0.3) ? 'Medium' : 'Low',
        description: both(
          `During the monthly pillar inspection at about ${time}, the patrol of ${b.bop} found main pillar ${pillar} at ${place[0]} tilted by about 30 degrees with its base exposed, caused by ${cause[0]}. The inscription is still readable.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় মাসিক পিলার পরিদর্শনের সময় ${b.bopBn}-এর টহল দল দেখতে পায়, ${place[1]}-এ ${bn(pillar)} নম্বর মূল পিলারটি ${cause[2]} কারণে প্রায় ৩০ ডিগ্রি হেলে গেছে এবং ভিত্তি বেরিয়ে পড়েছে। খোদাই করা লেখা এখনো পড়া যায়।`,
        ),
        personsInvolved: both('None.', 'প্রযোজ্য নয়।'),
        actionTaken: both('GPS position recorded; photographs sent to Sector HQ for the Joint Boundary Working Group.', 'জিপিএস অবস্থান রেকর্ড; যৌথ সীমানা কার্যকরী দলের জন্য ছবি সেক্টর সদরে প্রেরণ।'),
        outcome: both('Included in the list for joint inspection and repair.', 'যৌথ পরিদর্শন ও মেরামতের তালিকায় অন্তর্ভুক্ত।'),
      };
    },
  },
  {
    id: 'road-washed', category: 'Border Infrastructure', subcategory: 'Road damage', battalions: ['48 BGB', '46 BGB', '22 BGB', '34 BGB'], weight: 2,
    season: (m) => monsoon(m), hours: [7, 16], images: ['flood-2016-a', 'flood-2016-b', 'jaflong-bgb-camp'], videos: ['haor-boat'], videoChance: 0.4, doc: 'inspection',
    build: ({ r, b, place, time }) => {
      const m = r.pick([40, 80, 120, 200, 350]);
      return {
        title: `Flash flood washes away ${m} m of border patrol road at ${place[0]}`,
        titleBn: `${place[1]}-এ পাহাড়ি ঢলে ${bn(m)} মিটার সীমান্ত টহল সড়ক বিলীন`,
        severity: m >= 200 ? 'High' : 'Medium',
        description: both(
          `After heavy rain upstream, a flash flood at ${place[0]} washed away about ${m} m of the border patrol road at about ${time}. Two border outposts are now reachable only by boat, and foot patrols along that stretch are suspended.`,
          `উজানে ভারী বৃষ্টির পর আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এ পাহাড়ি ঢলে সীমান্ত টহল সড়কের প্রায় ${bn(m)} মিটার ভেসে গেছে। দুটি সীমান্ত চৌকিতে এখন শুধু নৌকায় যাওয়া যাচ্ছে এবং ওই অংশে পায়ে হেঁটে টহল বন্ধ রয়েছে।`,
        ),
        personsInvolved: both('No casualties.', 'কোনো হতাহত নেই।'),
        actionTaken: both('Boat patrol started on the affected stretch; damage report sent for repair through the engineering wing.', 'ক্ষতিগ্রস্ত অংশে নৌ-টহল চালু; প্রকৌশল শাখার মাধ্যমে মেরামতের জন্য ক্ষতির প্রতিবেদন প্রেরণ।'),
        outcome: both('Temporary repair done after the water receded.', 'পানি নেমে যাওয়ার পর অস্থায়ী মেরামত সম্পন্ন।'),
      };
    },
  },
  // ------------------------------------------------------------------ Security threats
  {
    id: 'drone', category: 'Security Threat', subcategory: 'Drone sighting', battalions: ['17 BGB', '34 BGB', '42 BGB'], weight: 4,
    season: (_m, y) => (y >= 2026 ? 1.5 : 0.7), hours: [20, 3], images: ['drone', 'naf-river', 'teknaf-sanctuary'], videos: ['night-uas', 'aerial-bangladesh'], videoChance: 0.6, doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const min = r.int(8, 35);
      return {
        title: `Unidentified drone flew over ${b.bop} for ${min} minutes`,
        titleBn: `${b.bopBn}-এর ওপর ${bn(min)} মিনিট ধরে অজ্ঞাত ড্রোন`,
        severity: min >= 20 ? 'High' : 'Medium',
        description: both(
          `At about ${time} sentries at ${b.bop} saw a small drone with blinking lights at an estimated 150 m above ${place[0]}. It circled the BOP and the river bank for about ${min} minutes and then flew back across the border. The duty officer recorded it on a mobile phone.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর সেন্ট্রিরা ${place[1]}-এর ওপর আনুমানিক ১৫০ মিটার উচ্চতায় মিটমিট আলোযুক্ত একটি ছোট ড্রোন দেখতে পান। এটি প্রায় ${bn(min)} মিনিট বিওপি ও নদীতীরের ওপর চক্কর দিয়ে সীমান্তের ওপারে ফিরে যায়। ডিউটি অফিসার মোবাইল ফোনে দৃশ্যটি ধারণ করেন।`,
        ),
        personsInvolved: both('Operator unknown; the drone came from across the border.', 'চালক অজ্ঞাত; ড্রোনটি সীমান্তের ওপার থেকে এসেছিল।'),
        actionTaken: both('BOP alerted; video sent to Sector HQ; protest to be lodged through the next flag meeting.', 'বিওপি সতর্ক অবস্থায়; ভিডিও সেক্টর সদরে প্রেরণ; পরবর্তী পতাকা বৈঠকে প্রতিবাদ জানানো হবে।'),
        outcome: both('No further flights seen in the following week.', 'পরবর্তী সপ্তাহে আর কোনো ড্রোন দেখা যায়নি।'),
      };
    },
  },
  {
    id: 'firing', category: 'Security Threat', subcategory: 'Hostile activity', battalions: ['17 BGB', '34 BGB'], bops: ['BOP Ghumdhum', 'BOP Whykong', 'BOP Bandarban', 'BOP Thanchi', 'BOP Teknaf River'],
    weight: 3, season: (_m, y) => (y >= 2026 ? 1.7 : 0.9), hours: [22, 5], images: ['teknaf-sanctuary', 'naf-boats-hills', 'pillar-angarpota'], videos: ['aerial-bangladesh'], videoChance: 0.2, doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const shell = r.chance(0.4);
      return {
        title: shell ? `Mortar shell from Myanmar lands inside Bangladesh at ${place[0]}` : `Heavy gunfire heard across the border at ${place[0]}`,
        titleBn: shell ? `${place[1]}-এ মিয়ানমার থেকে ছোড়া মর্টারশেল বাংলাদেশে পড়েছে` : `${place[1]}-এ সীমান্তের ওপারে ভারী গোলাগুলি`,
        severity: shell ? 'Critical' : 'High',
        description: both(
          `From about ${time} heavy firing between armed groups and Myanmar forces was heard from across the border opposite ${place[0]} for nearly two hours. ${shell ? 'One mortar shell landed in a paddy field about 300 m inside Bangladesh; it did not explode.' : 'No shells or bullets fell on the Bangladesh side.'} Residents near the border were moved to safer places.`,
          `আনুমানিক ${bnTime(time)} ঘটিকা থেকে প্রায় দুই ঘণ্টা ধরে ${place[1]}-এর বিপরীতে সীমান্তের ওপারে সশস্ত্র গোষ্ঠী ও মিয়ানমার বাহিনীর মধ্যে ভারী গোলাগুলির শব্দ শোনা যায়। ${shell ? 'একটি মর্টারশেল বাংলাদেশের প্রায় ৩০০ মিটার ভেতরে একটি ধানক্ষেতে পড়ে; সেটি বিস্ফোরিত হয়নি।' : 'বাংলাদেশের অংশে কোনো গোলা বা গুলি পড়েনি।'} সীমান্তের কাছের বাসিন্দাদের নিরাপদ স্থানে সরিয়ে নেওয়া হয়।`,
        ),
        personsInvolved: both('No injuries on the Bangladesh side.', 'বাংলাদেশের অংশে কেউ আহত হয়নি।'),
        actionTaken: both(`BOP on high alert; ${shell ? 'area cordoned and the army bomb disposal team called; ' : ''}reported to BGB HQ and the Ministry of Home Affairs.`, `বিওপি সর্বোচ্চ সতর্কতায়; ${shell ? 'এলাকা ঘেরাও করে সেনাবাহিনীর বোমা নিষ্ক্রিয়কারী দল তলব; ' : ''}বিজিবি সদর দপ্তর ও স্বরাষ্ট্র মন্ত্রণালয়ে প্রতিবেদন।`),
        outcome: both(shell ? 'Shell defused by the army; protest note sent to Myanmar through diplomatic channels.' : 'Situation calm by morning; patrols increased.', shell ? 'সেনাবাহিনী শেলটি নিষ্ক্রিয় করেছে; কূটনৈতিক মাধ্যমে মিয়ানমারকে প্রতিবাদলিপি পাঠানো হয়েছে।' : 'সকাল নাগাদ পরিস্থিতি শান্ত; টহল বৃদ্ধি করা হয়েছে।'),
      };
    },
  },
  {
    id: 'suspicious', category: 'Security Threat', subcategory: 'Suspicious movement', battalions: ['17 BGB', '21 BGB', '22 BGB', '29 BGB', '33 BGB', '42 BGB', '46 BGB', '48 BGB', '8 BGB'],
    weight: 3, hours: [0, 5], images: ['footprints-mud', 'river-boat', 'sundarbans-river', 'fence-barrier'], doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const n = r.int(3, 8);
      return {
        title: `Suspicious movement of ${n} people near the zero line at ${place[0]}`,
        titleBn: `${place[1]}-এ শূন্যরেখার কাছে ${bn(n)} জনের সন্দেহজনক চলাফেরা`,
        severity: r.chance(0.3) ? 'Medium' : 'Low',
        description: both(
          `At about ${time} the night patrol of ${b.bop} saw ${n} people moving along the zero line near ${place[0]} with torches switched off. They moved away across the border when the patrol approached. Fresh footprints and a sack of rice husk were found.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর রাত্রিকালীন টহল দল ${place[1]}-এর কাছে শূন্যরেখা বরাবর ${bn(n)} জনকে টর্চ নিভিয়ে চলাফেরা করতে দেখে। টহল দল এগিয়ে গেলে তারা সীমান্তের ওপারে সরে যায়। ঘটনাস্থলে টাটকা পায়ের ছাপ ও এক বস্তা তুষ পাওয়া যায়।`,
        ),
        personsInvolved: both('Unknown.', 'অজ্ঞাত।'),
        actionTaken: both('Area searched at first light; local informers alerted; ambush posted for the next three nights.', 'ভোরে এলাকায় তল্লাশি; স্থানীয় সোর্সদের সতর্ক; পরবর্তী তিন রাত অ্যাম্বুশ মোতায়েন।'),
        outcome: both('No further activity observed.', 'পরবর্তীতে আর কোনো তৎপরতা দেখা যায়নি।'),
      };
    },
  },
  {
    id: 'trespass-fishing', category: 'Security Threat', subcategory: 'Trespassing', battalions: ['17 BGB', '33 BGB'], bops: ['BOP Teknaf River', 'BOP Shah Porir Dwip', 'BOP Kaikhali'],
    weight: 3, hours: [5, 14], images: ['bgb-patrol-craft', 'fishing-boat', 'sundarbans-river-2'], videos: ['sampan-boats-coxs', 'river-launches'], videoChance: 0.35, doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const n = r.int(1, 4);
      const crew = n * r.int(4, 8);
      const naf = b.bop !== 'BOP Kaikhali';
      return {
        title: `${n} foreign fishing boat${n > 1 ? 's' : ''} detained in Bangladesh waters at ${place[0]}`,
        titleBn: `${place[1]}-এ বাংলাদেশের জলসীমায় ${bn(n)}টি বিদেশি মাছ ধরার নৌকা আটক`,
        severity: n >= 3 ? 'Medium' : 'Low',
        description: both(
          `At about ${time} a speedboat patrol of ${b.bop} found ${n} ${naf ? 'Myanmar' : 'Indian'} fishing boat${n > 1 ? 's' : ''} with ${crew} crew fishing inside Bangladesh waters near ${place[0]}. The crew said strong current had carried them across.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${b.bopBn}-এর স্পিডবোট টহল দল ${place[1]}-এর কাছে বাংলাদেশের জলসীমার ভেতরে ${bn(crew)} জন মাঝিমাল্লাসহ ${bn(n)}টি ${naf ? 'মিয়ানমারের' : 'ভারতীয়'} মাছ ধরার নৌকা মাছ ধরতে দেখে। মাঝিরা জানায়, প্রবল স্রোত তাদের ভাসিয়ে এনেছে।`,
        ),
        personsInvolved: both(`${crew} foreign fishermen.`, `${bn(crew)} জন বিদেশি জেলে।`),
        actionTaken: both('Boats escorted to the BOP; nets and catch listed; matter reported to Sector HQ.', 'নৌকাগুলো বিওপিতে আনা হয়; জাল ও মাছের তালিকা প্রস্তুত; সেক্টর সদরে প্রতিবেদন।'),
        outcome: both('Fishermen returned with their boats through a flag meeting after verification.', 'যাচাই শেষে পতাকা বৈঠকের মাধ্যমে নৌকাসহ জেলেদের ফেরত পাঠানো হয়েছে।'),
      };
    },
  },
  // ------------------------------------------------------------------ Other
  {
    id: 'flood-rescue', category: 'Other', subcategory: 'Natural disaster', battalions: ['48 BGB', '46 BGB', '22 BGB', '21 BGB'], weight: 3,
    season: (m) => monsoon(m), hours: [6, 18], images: ['flood-2016-a', 'flood-2016-b', 'jaflong-bgb-camp', 'bgb-patrol-craft'], videos: ['haor-boat'], videoChance: 0.5, doc: 'rescue',
    build: ({ r, b, place, time }) => {
      const n = r.pick([45, 80, 130, 210, 320]);
      return {
        title: `BGB evacuates ${n} flood-hit villagers at ${place[0]}`,
        titleBn: `${place[1]}-এ বন্যাকবলিত ${bn(n)} জন গ্রামবাসীকে বিজিবির উদ্ধার`,
        severity: n >= 200 ? 'High' : 'Medium',
        description: both(
          `Rising water from upstream flooded villages around ${place[0]} from about ${time}. Members of ${b.bop} used country boats and the BOP speedboat to move ${n} people, mostly women, children and elderly, to the flood shelter and the BOP compound. Dry food and drinking water were distributed.`,
          `আনুমানিক ${bnTime(time)} ঘটিকা থেকে উজানের পানিতে ${place[1]}-এর আশপাশের গ্রাম প্লাবিত হয়। ${b.bopBn}-এর সদস্যরা দেশি নৌকা ও বিওপির স্পিডবোট দিয়ে নারী, শিশু ও বয়স্কসহ ${bn(n)} জনকে বন্যা আশ্রয়কেন্দ্র ও বিওপি প্রাঙ্গণে সরিয়ে নেন। শুকনো খাবার ও বিশুদ্ধ পানি বিতরণ করা হয়।`,
        ),
        personsInvolved: both(`${n} villagers evacuated; no casualties.`, `${bn(n)} জন গ্রামবাসী উদ্ধার; কোনো প্রাণহানি নেই।`),
        actionTaken: both('Rescue boats deployed; medical team from the battalion attended the shelter.', 'উদ্ধারকারী নৌকা মোতায়েন; ব্যাটালিয়নের চিকিৎসা দল আশ্রয়কেন্দ্রে সেবা দেয়।'),
        outcome: both('Villagers returned home after the water receded.', 'পানি নেমে যাওয়ার পর গ্রামবাসীরা বাড়ি ফিরেছেন।'),
      };
    },
  },
  {
    id: 'drowning-rescue', category: 'Other', subcategory: 'Rescue operation', battalions: ['21 BGB', '33 BGB', '22 BGB', '48 BGB'], weight: 2,
    hours: [10, 18], images: ['river-boat', 'bgb-patrol-craft', 'sundarbans-river'], videos: ['padma-cargo-boat'], videoChance: 0.3, doc: 'rescue',
    build: ({ r, b, place, time }) => {
      const n = r.int(2, 9);
      return {
        title: `${n} passengers rescued after a boat capsized at ${place[0]}`,
        titleBn: `${place[1]}-এ নৌকাডুবির পর ${bn(n)} যাত্রী উদ্ধার`,
        severity: 'Medium',
        description: both(
          `At about ${time} an overloaded country boat capsized in strong current near ${place[0]}. A river patrol of ${b.bop} nearby reached the spot within minutes and pulled ${n} passengers out of the water.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এর কাছে প্রবল স্রোতে অতিরিক্ত যাত্রীবোঝাই একটি দেশি নৌকা ডুবে যায়। কাছেই থাকা ${b.bopBn}-এর নদী টহল দল কয়েক মিনিটের মধ্যে ঘটনাস্থলে পৌঁছে ${bn(n)} জন যাত্রীকে পানি থেকে উদ্ধার করে।`,
        ),
        personsInvolved: both(`${n} passengers rescued; all survived.`, `${bn(n)} জন যাত্রী উদ্ধার; সবাই জীবিত।`),
        actionTaken: both('First aid given; two passengers taken to the upazila health complex.', 'প্রাথমিক চিকিৎসা; দুইজন যাত্রীকে উপজেলা স্বাস্থ্য কমপ্লেক্সে প্রেরণ।'),
        outcome: both('All passengers discharged the same day.', 'সব যাত্রী একই দিনে ছাড়া পেয়েছেন।'),
      };
    },
  },
  {
    id: 'medical-evac', category: 'Other', subcategory: 'Medical emergency', battalions: ['34 BGB'], bops: ['BOP Thanchi', 'BOP Bandarban', 'BOP Rangamati'], weight: 2,
    hours: [8, 20], images: ['teknaf-sanctuary', 'jaflong-bgb-camp'], doc: 'rescue',
    build: ({ r, b, place, time }) => {
      const age = r.int(20, 70);
      return {
        title: `Seriously ill villager evacuated from ${place[0]}`,
        titleBn: `${place[1]} থেকে গুরুতর অসুস্থ গ্রামবাসীকে উদ্ধার`,
        severity: 'Low',
        description: both(
          `At about ${time} the headman of a remote para near ${place[0]} asked ${b.bop} for help with a ${age}-year-old patient with high fever and breathing difficulty. A BGB team carried the patient on a stretcher for four hours through the hills and arranged transport to the district hospital.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${place[1]}-এর কাছে একটি দুর্গম পাড়ার কারবারি তীব্র জ্বর ও শ্বাসকষ্টে আক্রান্ত ${bn(age)} বছর বয়সী এক রোগীর জন্য ${b.bopBn}-এর সাহায্য চান। বিজিবির একটি দল পাহাড়ি পথে চার ঘণ্টা স্ট্রেচারে বহন করে রোগীকে জেলা হাসপাতালে পাঠানোর ব্যবস্থা করে।`,
        ),
        personsInvolved: both(`1 patient (${age}).`, `১ জন রোগী (${bn(age)})।`),
        actionTaken: both('Stretcher party and battalion ambulance provided.', 'স্ট্রেচার দল ও ব্যাটালিয়নের অ্যাম্বুলেন্স প্রদান।'),
        outcome: both('Patient recovered and returned home.', 'রোগী সুস্থ হয়ে বাড়ি ফিরেছেন।'),
      };
    },
  },
  {
    id: 'elephants', category: 'Other', subcategory: 'Other', battalions: ['17 BGB', '34 BGB'], bops: ['BOP Whykong', 'BOP Ghumdhum', 'BOP Bandarban'], weight: 1,
    hours: [19, 23], images: ['teknaf-sanctuary', 'naf-boats-hills'], doc: 'patrol',
    build: ({ r, b, place, time }) => {
      const n = r.int(3, 9);
      return {
        title: `Herd of ${n} wild elephants enters village near ${place[0]}`,
        titleBn: `${place[1]}-এর কাছে লোকালয়ে ${bn(n)}টি বন্য হাতির পাল`,
        severity: 'Low',
        description: both(
          `At about ${time} a herd of ${n} wild elephants came down from the hills into the village near ${place[0]}, damaging crops and two huts. Members of ${b.bop} helped villagers and Forest Department staff drive the herd back to the forest with fire and drums.`,
          `আনুমানিক ${bnTime(time)} ঘটিকায় ${bn(n)}টি বন্য হাতির একটি পাল পাহাড় থেকে নেমে ${place[1]}-এর কাছের গ্রামে ঢুকে ফসল ও দুটি ঘরের ক্ষতি করে। ${b.bopBn}-এর সদস্যরা গ্রামবাসী ও বন বিভাগের কর্মীদের সঙ্গে আগুন ও ঢোল বাজিয়ে পালটিকে বনে ফেরত পাঠাতে সহায়তা করেন।`,
        ),
        personsInvolved: both('No injuries.', 'কেউ আহত হয়নি।'),
        actionTaken: both('Forest Department informed; affected families listed for compensation.', 'বন বিভাগকে অবহিত; ক্ষতিগ্রস্ত পরিবারের তালিকা ক্ষতিপূরণের জন্য প্রেরণ।'),
        outcome: both('Herd returned to the forest the same night.', 'একই রাতে হাতির পাল বনে ফিরে গেছে।'),
      };
    },
  },
];

// Comments, return and rejection reasons (bilingual)
export const REVIEW_COMMENTS = [
  'Good work by the patrol. Please keep the seizure list originals at the battalion. / টহল দলের প্রশংসনীয় কাজ। জব্দ তালিকার মূল কপি ব্যাটালিয়নে সংরক্ষণ করুন।',
  'Share the brokers\' details with the district intelligence cell. / দালালদের তথ্য জেলা গোয়েন্দা সেলের সঙ্গে বিনিময় করুন।',
  'Has the case number from the police station been received? / থানা থেকে মামলার নম্বর পাওয়া গেছে কি?',
  'Increase night ambush at this point for the next two weeks. / আগামী দুই সপ্তাহ এই স্থানে রাত্রিকালীন অ্যাম্বুশ বাড়ান।',
  'Include this location in the next flag meeting agenda. / পরবর্তী পতাকা বৈঠকের আলোচ্যসূচিতে এই স্থানটি অন্তর্ভুক্ত করুন।',
  'Similar movement was reported here last month; check for a pattern. / গত মাসেও এখানে একই ধরনের তৎপরতা ছিল; কোনো ধারা আছে কি না দেখুন।',
];
export const FILER_REPLIES = [
  'Case number received from the police station and noted in the file. / থানা থেকে মামলার নম্বর পাওয়া গেছে এবং নথিতে লেখা হয়েছে।',
  'Ambush increased from tonight. / আজ রাত থেকে অ্যাম্বুশ বাড়ানো হয়েছে।',
  'Information shared with the intelligence cell. / গোয়েন্দা সেলের সঙ্গে তথ্য বিনিময় করা হয়েছে।',
];
export const RETURN_REASONS = {
  doc: 'Please attach the seizure list signed by the witnesses. / সাক্ষীদের স্বাক্ষরসহ জব্দ তালিকা সংযুক্ত করুন।',
  other: [
    'GPS position is outside the BOP area; please correct the location. / জিপিএস অবস্থান বিওপি এলাকার বাইরে; অবস্থান সংশোধন করুন।',
    'Quantity in the narrative does not match the seizure list. / বিবরণের পরিমাণ জব্দ তালিকার সঙ্গে মিলছে না।',
    'Add the addresses of the detained persons. / আটক ব্যক্তিদের ঠিকানা যোগ করুন।',
  ],
};
export const EDIT_NOTES = ['Changed: description, persons involved', 'Changed: location, lat, lng', 'Changed: description'];
export const REJECT_REASONS = [
  'Duplicate: the same event was already reported by the neighbouring BOP. / ডুপ্লিকেট: একই ঘটনা পাশের বিওপি আগেই প্রতিবেদন করেছে।',
  'Outside BGB jurisdiction; referred to the police. / বিজিবির এখতিয়ারের বাইরে; পুলিশের কাছে পাঠানো হয়েছে।',
  'Could not be verified on the ground; insufficient evidence. / সরেজমিনে যাচাই করা যায়নি; প্রমাণ অপর্যাপ্ত।',
];


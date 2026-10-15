// Demo database for the TEC demonstration: WIPES ALL DATA (database rows and stored evidence files),
// then loads the demo dataset (demo-data.ts) with real photos, videos and PDF documents as evidence,
// complete workflow histories, comments, notifications, messaging, calls and a consistent audit
// trail. Evidence goes through the real storage layer (encrypted at rest, SHA-256, EXIF metadata).
//
//   DEMO_RESET=yes npm run db:demo
//
// Reference data (roles, permissions, categories, settings) is the same as prisma/seed.ts. Tests
// keep using prisma/seed.ts; this script is only for demonstration environments.
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../src/config/env.js';
import { storage, storageEncrypted } from '../../src/config/storage.js';
import { prisma } from '../../src/db.js';
import { CONFIG_DEFAULTS } from '../../src/modules/admin/config.service.js';
import { recipientsFor } from '../../src/modules/alerts/alerts.service.js';
import { callSummary } from '../../src/modules/calls/calls.service.js';
import { ALLOWED_TYPES, detectMime } from '../../src/modules/evidence/fileType.js';
import { extractMetadata, sha256 } from '../../src/modules/evidence/metadata.js';
import { canApprove, canReview, DEFAULT_PERMISSIONS, ROLE_DESCRIPTIONS, ROLES } from '../../src/utils/roles.js';
import { inScope, resolveScope } from '../../src/utils/scope.js';
import { INCIDENT_CATEGORIES, ROLES as ROLE_NAMES } from '../data/seed-data.js';
import { addHours, BOPS, buildIncidents, DEMO_NOW, dhaka, EXTRA_UNITS, nextIds, prng, USERS, userById, ymdOf, type DemoIncident } from './demo-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.join(here, 'media');
const DAY = 86_400_000;
const SYSTEM = { name: 'BIRDS System', username: 'system' };
const r = prng(7_310);

// ---------------------------------------------------------------------------
// Audit entries are collected first and written in time order at the end, so the
// SHA-256 hash chain (built by the database trigger, in insert order) follows the timeline
// ---------------------------------------------------------------------------
interface AuditRow {
  timestamp: Date;
  userId: string | null;
  username: string;
  action: string;
  details: string;
  ipAddress: string | null;
}
const audit: AuditRow[] = [];
const SECTOR_NET: Record<string, number> = { HQ: 10, 'Sector-7': 17, 'Sector-11': 11, 'Sector-3': 13, 'Sector-5': 15, 'Sector-9': 19 };
function ipOf(userId: string) {
  const u = userById.get(userId)!;
  const bop = BOPS.find((b) => b.battalion === u.scope);
  const net = SECTOR_NET[bop ? bop.sector : u.scope] ?? 10;
  return `10.${net}.${(Number(u.id.slice(1)) * 7) % 250}.${20 + (Number(u.id.slice(1)) % 200)}`;
}
function log(at: Date, userId: string | null, action: string, details: string) {
  const u = userId ? userById.get(userId)! : null;
  audit.push({ timestamp: at, userId, username: u ? u.username : SYSTEM.username, action, details: details.slice(0, 4000), ipAddress: u ? ipOf(u.id) : null });
}
const nameOf = (userId: string | null) => (userId ? userById.get(userId)!.name : SYSTEM.name);

// Days each user was signed in: LOGIN before their first action, LOGOUT (or idle timeout) after the last
const activity = new Map<string, Date[]>();
const touch = (userId: string | null, at: Date) => {
  if (!userId) return;
  const list = activity.get(userId) ?? [];
  list.push(at);
  activity.set(userId, list);
};

// ---------------------------------------------------------------------------
// 1. Wipe
// ---------------------------------------------------------------------------
async function wipeDatabase() {
  const tables = (await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`).map((t) => t.tablename);
  const quoted = tables.map((t) => `"${t}"`).join(', ');
  await prisma.$transaction(async (tx) => {
    // The append-only tables refuse TRUNCATE (integrity triggers); the owner switches them off for the reset only
    for (const t of tables) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
    await tx.$executeRawUnsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
    for (const t of tables) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
  });
  return tables.length;
}

async function wipeStorage() {
  if (env.STORAGE_DRIVER === 'local') {
    rmSync(path.resolve(env.EVIDENCE_DIR), { recursive: true, force: true });
    return `local folder ${env.EVIDENCE_DIR}`;
  }
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  let removed = 0;
  for (const prefix of ['incidents/', 'groups/', 'voice/', 'messages/', 'alerts/']) {
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) {
        await s3.send(new DeleteObjectsCommand({ Bucket: env.S3_BUCKET, Delete: { Objects: keys } }));
        removed += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  return `${removed} objects in bucket ${env.S3_BUCKET}`;
}

// ---------------------------------------------------------------------------
// 2. Reference data
// ---------------------------------------------------------------------------
const SETUP = dhaka('2025-03-20', '10:15');

async function referenceData() {
  for (const name of ROLE_NAMES as string[]) await prisma.role.create({ data: { name, description: ROLE_DESCRIPTIONS[name] ?? null } });
  await prisma.rolePermission.createMany({
    data: Object.entries(DEFAULT_PERMISSIONS).flatMap(([role, pages]) => pages.map((pageId) => ({ role, pageId, enabled: true }))),
  });
  for (const u of USERS) {
    await prisma.user.create({
      data: {
        id: u.id, username: u.username, passwordHash: await bcrypt.hash(u.password, env.BCRYPT_ROUNDS), name: u.name, role: u.role,
        scope: u.scope, email: u.email, isActive: u.isActive ?? true, createdAt: u.id === 'U001' ? SETUP : addHours(SETUP, 0.1 * Number(u.id.slice(1))),
      },
    });
    if (u.id === 'U001') log(SETUP, null, 'CREATE_USER', `Created ${u.username} (${u.id}) as ${u.role}, scope ${u.scope} (installation)`);
    else log(addHours(SETUP, 0.1 * Number(u.id.slice(1))), 'U001', 'CREATE_USER', `Created ${u.username} (${u.id}) as ${u.role}, scope ${u.scope}`);
  }
  await prisma.orgHierarchy.createMany({ data: [...BOPS.map(({ sector, battalion, bop }) => ({ hq: 'HQ', sector, battalion, bop })), ...EXTRA_UNITS.map((u) => ({ hq: 'HQ', ...u }))] });
  for (const c of INCIDENT_CATEGORIES) {
    await prisma.incidentCategory.create({ data: { id: c.id, name: c.name } });
    await prisma.incidentSubcategory.createMany({ data: c.subcategories.map((name: string) => ({ categoryId: c.id, name })) });
  }
  await prisma.systemConfig.createMany({ data: Object.entries(CONFIG_DEFAULTS).map(([key, { value, description }]) => ({ key, value, description })) });
}

// ---------------------------------------------------------------------------
// 3. Incidents, timelines, comments, evidence
// ---------------------------------------------------------------------------
const mediaCache = new Map<string, Buffer>();
const media = (key: string) => {
  if (!mediaCache.has(key)) mediaCache.set(key, readFileSync(path.join(MEDIA, key)));
  return mediaCache.get(key)!;
};
const DECLARED: Record<string, string> = { image: 'image/jpeg', video: 'video/mp4', doc: 'application/pdf' };
let storedBytes = 0;

async function seedIncident(inc: DemoIncident) {
  const timeline = inc.events.filter((e) => e.kind === 'timeline');
  const statusEvents = timeline.filter((e) => !['Edited', 'Evidence added', 'Archived', 'Discarded'].includes(e.action));
  const lastStatus = statusEvents[statusEvents.length - 1]!;
  const lastChange = [...timeline].reverse().find((e) => e.action !== 'Evidence added' && e.action !== 'Archived') ?? lastStatus;

  await prisma.incident.create({
    data: {
      id: inc.id, title: inc.title, category: inc.category, subcategory: inc.subcategory, severity: inc.severity, status: inc.status,
      incidentDate: new Date(`${inc.date}T00:00:00Z`), incidentTime: new Date(`1970-01-01T${inc.time}:00Z`), location: inc.location,
      bop: inc.bop.bop, sector: inc.bop.sector, battalion: inc.bop.battalion, lat: inc.lat, lng: inc.lng,
      description: inc.description, personsInvolved: inc.personsInvolved, actionTaken: inc.actionTaken, outcome: inc.outcome,
      createdBy: inc.createdBy, createdAt: inc.createdAt, updatedAt: inc.archivedAt ?? inc.discardedAt ?? lastChange.at,
      statusChangedAt: lastStatus.at, archivedAt: inc.archivedAt, archivedBy: null, discardedAt: inc.discardedAt, discardedBy: inc.discardedAt ? inc.createdBy : null,
      timeline: { create: timeline.map((e) => ({ action: e.action, userName: nameOf(e.userId), userId: e.userId, status: e.status, notes: e.notes ?? null, createdAt: e.at })) },
      comments: {
        create: inc.events.filter((e) => e.kind === 'comment').map((e) => ({ userId: e.userId!, userName: nameOf(e.userId), body: e.notes!, createdAt: e.at })),
      },
    },
  });

  // Evidence in the upload batches named by the timeline
  const batches = timeline.filter((e) => e.action === 'Evidence added');
  const lateDoc = batches.length > 1 ? inc.evidence.find((x) => x.kind === 'doc') : undefined;
  for (const [i, batch] of batches.entries()) {
    const files = i === 0 ? inc.evidence.filter((x) => x !== lateDoc) : lateDoc ? [lateDoc] : [];
    const described: string[] = [];
    for (const f of files) {
      const buf = media(f.media);
      const mime = detectMime(buf);
      if (!mime) throw new Error(`Not an allowed evidence type: ${f.media}`);
      const metadata = await extractMetadata(buf, mime, DECLARED[f.kind]!, new Date(batch.at.getTime() - 3_600_000).toISOString());
      const key = `incidents/${inc.id}/${randomUUID()}${ALLOWED_TYPES[mime]}`;
      await storage.put(key, buf);
      storedBytes += buf.length;
      const hash = sha256(buf);
      await prisma.evidence.create({
        data: {
          incidentId: inc.id, fileName: path.posix.basename(key), originalName: f.name, mimeType: mime, fileSize: BigInt(buf.length),
          storagePath: key, sha256: hash, fileMetadata: JSON.parse(JSON.stringify({ ...metadata, scan: { status: 'not_scanned' } })),
          uploadedBy: inc.createdBy, uploadedAt: batch.at,
        },
      });
      described.push(`${f.name} (${mime}, ${buf.length} B, sha256 ${hash.slice(0, 16)}…)`);
    }
    if (described.length) log(addHours(batch.at, 0.001), inc.createdBy, 'UPLOAD_EVIDENCE', `${inc.id}: ${described.join('; ')}`);
  }

  // Audit entries and activity for the workflow
  for (const e of inc.events) {
    touch(e.userId, e.at);
    if (e.kind === 'comment') {
      log(e.at, e.userId, 'COMMENT_INCIDENT', `Commented on ${inc.id}: ${e.notes!.length > 300 ? `${e.notes!.slice(0, 300)}…` : e.notes}`);
      continue;
    }
    switch (e.action) {
      case 'Created':
        log(e.at, e.userId, 'CREATE_INCIDENT', `Draft saved: ${inc.id} (${inc.title})`);
        break;
      case 'Submitted':
      case 'Resubmitted':
        log(e.at, e.userId, 'SUBMIT_INCIDENT', `${e.action}: ${inc.id}`);
        break;
      case 'Edited':
        log(e.at, e.userId, 'UPDATE_INCIDENT', `Updated ${inc.id} (${(e.notes ?? '').replace(/^Changed: /, '')})`);
        break;
      case 'Discarded':
        log(e.at, e.userId, 'DISCARD_DRAFT', `Discarded draft ${inc.id} (${inc.title})${e.notes ? `: ${e.notes}` : ''}`);
        break;
      case 'Reviewed':
      case 'Verified':
      case 'Approved':
      case 'Closed':
      case 'Returned':
      case 'Rejected': {
        const verb = { Reviewed: 'REVIEW', Verified: 'VERIFY', Approved: 'APPROVE', Closed: 'CLOSE', Returned: 'RETURN', Rejected: 'REJECT' }[e.action];
        log(e.at, e.userId, `${verb}_INCIDENT`, `${e.action}: ${inc.id}${e.notes ? ` — ${e.notes}` : ''}`);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Notifications (same routing as notifications.service.ts)
// ---------------------------------------------------------------------------
const ROUTING: Record<string, { roles: string[]; creator: boolean; title: string; type: string }> = {
  submitted: { roles: Object.values(ROLES).filter(canReview), creator: false, title: 'New Incident Submitted', type: 'submission' },
  reviewed: { roles: Object.values(ROLES).filter(canApprove), creator: true, title: 'Incident Reviewed', type: 'review' },
  verified: { roles: Object.values(ROLES).filter(canApprove), creator: true, title: 'Incident Verified', type: 'review' },
  approved: { roles: [ROLES.HQ_ADMIN], creator: true, title: 'Incident Approved', type: 'approval' },
  closed: { roles: [], creator: true, title: 'Incident Closed', type: 'review' },
  returned: { roles: [], creator: true, title: 'Incident Returned', type: 'return' },
  rejected: { roles: [], creator: true, title: 'Incident Rejected', type: 'review' },
};
const scopes = new Map<string, Awaited<ReturnType<typeof resolveScope>>>();
async function scopeOf(userId: string) {
  if (!scopes.has(userId)) scopes.set(userId, await resolveScope(userById.get(userId)!.scope));
  return scopes.get(userId)!;
}
const notifications: { userId: string; title: string; message: string; type: string; isRead: boolean; incidentId: string | null; createdAt: Date }[] = [];
const readState = (at: Date) => DEMO_NOW.getTime() - at.getTime() > 2.5 * DAY || r.chance(0.15);

async function notifyIncident(inc: DemoIncident) {
  const ref = { sector: inc.bop.sector, battalion: inc.bop.battalion, bop: inc.bop.bop };
  const commenters = new Set<string>();
  for (const e of inc.events) {
    if (DEMO_NOW.getTime() - e.at.getTime() > 45 * DAY || !e.userId) {
      if (e.kind === 'comment' && e.userId) commenters.add(e.userId);
      continue;
    }
    if (e.kind === 'comment') {
      const ids = new Set([inc.createdBy, ...commenters]);
      ids.delete(e.userId);
      const snippet = e.notes!.length > 140 ? `${e.notes!.slice(0, 140)}…` : e.notes!;
      for (const id of ids) {
        if ((userById.get(id)!.isActive ?? true) && inScope(await scopeOf(id), ref)) {
          notifications.push({ userId: id, title: 'New Comment', message: `${inc.id} (${inc.title}): ${nameOf(e.userId)} commented: ${snippet}`.slice(0, 2000), type: 'comment', isRead: readState(e.at), incidentId: inc.id, createdAt: e.at });
        }
      }
      commenters.add(e.userId);
      continue;
    }
    const event = { Submitted: 'submitted', Resubmitted: 'submitted', Reviewed: 'reviewed', Verified: 'verified', Approved: 'approved', Closed: 'closed', Returned: 'returned', Rejected: 'rejected' }[e.action];
    if (!event) continue;
    const route = ROUTING[event]!;
    const recipients = new Set<string>();
    for (const u of USERS) {
      if ((u.isActive ?? true) && route.roles.includes(u.role) && inScope(await scopeOf(u.id), ref)) recipients.add(u.id);
    }
    if (route.creator) recipients.add(inc.createdBy);
    recipients.delete(e.userId);
    const message = `${inc.id} (${inc.title}) ${event} by ${nameOf(e.userId)}${e.notes ? `: ${e.notes}` : ''}`.slice(0, 2000);
    for (const id of recipients) {
      if (userById.get(id)!.isActive === false) continue;
      notifications.push({ userId: id, title: route.title, message, type: route.type, isRead: readState(e.at), incidentId: inc.id, createdAt: e.at });
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Messaging and calls
// ---------------------------------------------------------------------------
const ago = (days: number, hm: string) => {
  const d = new Date(DEMO_NOW.getTime() - days * DAY);
  return dhaka(new Date(d.getTime() + 6 * 3_600_000).toISOString().slice(0, 10), hm);
};
type Line = [string, number, string, string]; // sender, days ago, HH:MM, text

const DIRECT: { a: string; b: string; lines: Line[]; unreadFor?: [string, number] }[] = [
  {
    a: 'U002', b: 'U003',
    lines: [
      ['U003', 9, '08:12', 'স্যার, নাফ নদীর ঘটনার জব্দ তালিকা আপলোড করেছি। / Sir, I have uploaded the seizure list for the Naf River case.'],
      ['U002', 9, '08:40', 'Thanks. The witness signatures are clear now. I will review it this morning.'],
      ['U002', 6, '21:05', 'রাতে জালিয়াপাড়া ঘাটে অ্যাম্বুশ বাড়াও। Two boats were seen there last week.'],
      ['U003', 6, '21:11', 'জি স্যার, আজ রাত থেকে দুটি অতিরিক্ত সেকশন থাকবে।'],
      ['U002', 1, '10:20', 'I returned one of your reports: please correct the GPS position and resubmit today.'],
      ['U002', 0.3, '07:45', 'আজ বিকেলে সেক্টর সদরে সাপ্তাহিক ব্রিফিং, ৪টায়। / Weekly briefing at Sector HQ today, 16:00.'],
    ],
    unreadFor: ['U003', 2],
  },
  {
    a: 'U004', b: 'U002',
    lines: [
      ['U004', 4, '11:02', 'Karim, the drone report from Ghumdhum — is the video attached?'],
      ['U002', 4, '11:15', 'Yes, the duty officer recorded it on his phone. It is in the evidence list.'],
      ['U004', 4, '13:30', 'Verified. Forwarding it to HQ for approval.'],
      ['U004', 0.8, '18:10', 'মিয়ানমার সীমান্তের সর্বশেষ পরিস্থিতি সম্পর্কে একটি সংক্ষিপ্ত নোট পাঠাবেন? HQ wants it for tomorrow.'],
    ],
    unreadFor: ['U002', 1],
  },
  {
    a: 'U001', b: 'U004',
    lines: [
      ['U001', 12, '09:30', 'Alam, good work on the Teknaf seizures this month.'],
      ['U004', 12, '09:41', 'Thank you sir. The battalions are doing well with the night ambushes.'],
      ['U001', 2, '16:05', 'Approved reports pending closure: I will close them after the weekly review.'],
      ['U004', 2, '16:20', 'জি স্যার। দুটি রিপোর্টে মামলার নম্বর যোগ করা হয়েছে।'],
    ],
  },
  {
    a: 'U001', b: 'U005',
    lines: [
      ['U005', 11, '10:00', 'Monthly audit log export is done. Hash chain verified — no breaks.'],
      ['U001', 11, '10:12', 'Good. Please keep the export with the monthly file.'],
      ['U005', 0.5, '09:20', 'এই মাসে একটি অ্যাকাউন্ট লক হয়েছিল (ভুল পাসওয়ার্ড)। Details are in the audit trail.'],
    ],
    unreadFor: ['U001', 1],
  },
  {
    a: 'U003', b: 'U006',
    lines: [
      ['U006', 3, '05:50', 'ভাই, রাতের টহলে হ্নীলায় সন্দেহজনক নৌকা দেখা গেছে, রিপোর্ট দিচ্ছি।'],
      ['U003', 3, '06:05', 'ঠিক আছে, ছবিগুলো সংযুক্ত করো। Add the GPS from your phone.'],
      ['U006', 3, '06:30', 'Done, submitted.'],
    ],
  },
  {
    a: 'U020', b: 'U016',
    lines: [
      ['U020', 7, '12:15', 'Shahidul, the Benapole gold case — has customs confirmed the purity test?'],
      ['U016', 7, '12:40', 'Yes, 22 carat. The certificate will be attached by 8 BGB today.'],
      ['U020', 7, '17:55', 'Received. Verified.'],
    ],
  },
  {
    a: 'U001', b: 'U020',
    lines: [
      ['U020', 1.5, '15:00', 'Sir, Sector-3 has three reports waiting for review for more than three days.'],
      ['U001', 1.5, '15:08', 'Ask Lt. Col. Ayesha to clear them by tomorrow. ধন্যবাদ।'],
    ],
  },
];

const GROUPS: { title: string; creator: string; admins: string[]; members: string[]; days: number; cover?: string; lines: Line[]; pending?: [string, string] }[] = [
  {
    title: 'Sector-7 Operations', creator: 'U002', admins: ['U002', 'U004'], members: ['U003', 'U006', 'U007', 'U008'], days: 40,
    lines: [
      ['U002', 30, '08:00', 'সবাইকে শুভ সকাল। From this week, every seizure report must have the signed seizure list attached.'],
      ['U007', 30, '08:20', 'Noted sir. 34 BGB will follow from today.'],
      ['U008', 21, '19:30', 'Heavy rain in Parshuram; patrol road near Muhuri river partly under water.'],
      ['U004', 14, '10:05', 'Reminder: reports waiting more than 3 days are flagged overdue on the dashboard.'],
      ['U003', 5, '22:40', 'টেকনাফে আজ রাতে অতিরিক্ত টহল। Possible landing at Shah Porir Dwip.'],
      ['U002', 0.6, '08:15', 'Good results last night, well done 17 BGB. রিপোর্ট আজই দাখিল করুন।'],
      ['U006', 0.4, '09:40', 'Report submitted with photos and video.'],
    ],
    pending: ['U020', 'U003'],
  },
  {
    title: 'HQ Duty Officers', creator: 'U001', admins: ['U001', 'U020'], members: ['U005', 'U002', 'U016', 'U017', 'U018', 'U019'], days: 60,
    lines: [
      ['U001', 50, '09:00', 'This group is for daily duty coordination between HQ and the sectors.'],
      ['U017', 20, '08:30', 'Sector-3: flood water rising at Roumari; two BOPs on alert.'],
      ['U018', 19, '13:10', 'Sector-5: rescue boats deployed near Jaflong. সবাই নিরাপদ আছে।'],
      ['U019', 8, '07:50', 'Sector-9: three Indian fishing boats detained in the Raimangal; flag meeting arranged.'],
      ['U020', 2, '18:00', 'Please clear overdue reviews before Thursday’s briefing.'],
      ['U016', 1, '11:25', 'Sector-11 done. সব রিপোর্ট হালনাগাদ।'],
      ['U001', 0.2, '08:05', 'আজ ১১টায় ভিডিও কনফারেন্স। Video conference at 11:00 today.'],
    ],
  },
  {
    title: 'নাফ নদী নজরদারি · Naf River Watch', creator: 'U003', admins: ['U003'], members: ['U006', 'U002'], days: 25, cover: 'images/naf-river.jpg',
    lines: [
      ['U003', 24, '20:00', 'নাফ নদীর রাত্রিকালীন টহলের সমন্বয়ের জন্য এই গ্রুপ।'],
      ['U006', 10, '02:15', 'Boat movement seen near Jadimura, patrol moving.'],
      ['U006', 10, '03:05', 'দুইজন পালিয়েছে, নৌকা জব্দ। Report in the morning.'],
      ['U002', 10, '07:30', 'Well done. Upload the photos with the report.'],
      ['U003', 0.9, '21:20', 'আজ রাতে জোয়ার ১টায়; সব পোস্ট সতর্ক থাকবে।'],
    ],
  },
];

async function seedMessaging(calls: SeededCall[]) {
  const touchMsg = (userId: string, at: Date) => touch(userId, at);
  // Direct conversations: the written lines and the pair's calls (as call entries), in time order.
  // Pairs who only ever called each other get a conversation of call entries.
  const pairKey = (a: string, b: string) => [a, b].sort().join(':');
  const pairs = new Map<string, { a: string; b: string; lines: Line[]; unreadFor?: [string, number] }>();
  for (const d of DIRECT) pairs.set(pairKey(d.a, d.b), d);
  for (const c of calls) if (!pairs.has(pairKey(c.callerId, c.calleeId))) pairs.set(pairKey(c.callerId, c.calleeId), { a: c.callerId, b: c.calleeId, lines: [] });
  for (const [directKey, d] of pairs) {
    type Item = { at: Date; sender: string; text?: string; call?: SeededCall; unreadBy?: string };
    const items: Item[] = d.lines.map(([sender, days, hm, text]) => ({ at: ago(days, hm), sender, text }));
    // The last n written lines are unread for d.unreadFor[0]
    if (d.unreadFor && d.unreadFor[1] > 0) for (const it of items.slice(-d.unreadFor[1])) it.unreadBy = d.unreadFor[0];
    for (const c of calls.filter((x) => pairKey(x.callerId, x.calleeId) === directKey)) {
      // A missed call from the last day is still unread for the person who missed it
      const missed = (c.status === 'missed' || c.status === 'cancelled') && DEMO_NOW.getTime() - c.endedAt.getTime() <= DAY;
      items.push({ at: c.endedAt, sender: c.callerId, call: c, unreadBy: missed ? c.calleeId : undefined });
    }
    items.sort((x, y) => x.at.getTime() - y.at.getTime());
    const created = new Date(items[0]!.at.getTime() - 60_000);
    const conv = await prisma.conversation.create({ data: { kind: 'direct', directKey, createdBy: items[0]!.sender, createdAt: created } });
    const ids: number[] = [];
    for (const it of items) {
      const m = await prisma.message.create({
        data: it.call
          ? { conversationId: conv.id, senderId: it.sender, kind: 'call', body: callSummary(it.call), callId: it.call.id, createdAt: it.at }
          : { conversationId: conv.id, senderId: it.sender, kind: 'text', body: it.text!, createdAt: it.at },
      });
      ids.push(m.id);
      if (it.text) touchMsg(it.sender, it.at);
    }
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: items[items.length - 1]!.at } });
    for (const u of [d.a, d.b]) {
      // Everything before the first item this person hasn't read
      const first = items.findIndex((it) => it.unreadBy === u);
      await prisma.conversationMember.create({ data: { conversationId: conv.id, userId: u, joinedAt: created, lastReadId: first < 0 ? ids[ids.length - 1]! : (ids[first - 1] ?? 0) } });
    }
  }

  // Groups
  for (const g of GROUPS) {
    const created = ago(g.days, '09:00');
    const conv = await prisma.conversation.create({ data: { kind: 'group', title: g.title, createdBy: g.creator, createdAt: created } });
    const everyone = [...new Set([g.creator, ...g.admins, ...g.members])];
    const names = everyone.filter((u) => u !== g.creator).map(nameOf);
    const sys = await prisma.message.create({ data: { conversationId: conv.id, senderId: g.creator, kind: 'system', body: `${nameOf(g.creator)} created the group "${g.title}" with ${names.join(', ')}`, createdAt: created } });
    log(created, g.creator, 'MESSAGE_GROUP_CREATE', `Created group #${conv.id} "${g.title}" with ${everyone.filter((u) => u !== g.creator).join(', ')}`);
    const ids: number[] = [sys.id];
    for (const a of g.admins.filter((x) => x !== g.creator)) {
      const at = addHours(created, 0.1);
      const m = await prisma.message.create({ data: { conversationId: conv.id, senderId: g.creator, kind: 'system', body: `${nameOf(g.creator)} made ${nameOf(a)} an admin`, createdAt: at } });
      ids.push(m.id);
      log(at, g.creator, 'MESSAGE_GROUP_ROLE', `Made ${a} an admin of group #${conv.id}`);
    }
    if (g.cover) {
      const buf = media(g.cover);
      const key = `groups/${conv.id}/${randomUUID()}.jpg`;
      await storage.put(key, buf);
      const at = addHours(created, 0.2);
      await prisma.conversation.update({ where: { id: conv.id }, data: { coverPath: key, coverMime: 'image/jpeg', coverSha256: sha256(buf), coverUpdatedAt: at } });
      const m = await prisma.message.create({ data: { conversationId: conv.id, senderId: g.creator, kind: 'system', body: `${nameOf(g.creator)} changed the group photo`, createdAt: at } });
      ids.push(m.id);
      log(at, g.creator, 'MESSAGE_GROUP_COVER', `Changed the photo of group #${conv.id}`);
    }
    for (const [sender, days, hm, text] of g.lines) {
      const at = ago(days, hm);
      const m = await prisma.message.create({ data: { conversationId: conv.id, senderId: sender, kind: 'text', body: text, createdAt: at } });
      ids.push(m.id);
      touchMsg(sender, at);
    }
    const lastAt = ago(g.lines[g.lines.length - 1]![1], g.lines[g.lines.length - 1]![2]);
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: lastAt } });
    for (const u of everyone) {
      // Members who did not write the latest messages have the last one or two unread
      const own = g.lines.slice(-2).some(([s]) => s === u);
      const unread = own ? 0 : r.int(0, 2);
      await prisma.conversationMember.create({
        data: { conversationId: conv.id, userId: u, joinedAt: created, role: g.admins.includes(u) ? 'admin' : 'member', lastReadId: ids[ids.length - 1 - unread] ?? 0 },
      });
    }
    if (g.pending) {
      const [userId, by] = g.pending;
      const at = ago(1.2, '14:30');
      await prisma.conversationJoinRequest.create({ data: { conversationId: conv.id, userId, requestedBy: by, createdAt: at } });
      log(at, by, 'MESSAGE_GROUP_REQUEST', `Asked to add ${userId} to group #${conv.id} (waiting for an admin)`);
    }
  }
}

const CALLS: [string, string, number, string, 'ended' | 'missed' | 'declined' | 'cancelled', number][] = [
  ['U002', 'U003', 14, '22:10', 'ended', 184], ['U003', 'U002', 13, '06:15', 'ended', 95], ['U004', 'U002', 11, '11:40', 'ended', 312],
  ['U001', 'U004', 10, '09:05', 'ended', 428], ['U006', 'U003', 9, '02:20', 'ended', 66], ['U002', 'U007', 8, '19:00', 'missed', 0],
  ['U007', 'U002', 8, '19:12', 'ended', 141], ['U020', 'U016', 7, '12:05', 'ended', 233], ['U001', 'U017', 6, '08:45', 'declined', 0],
  ['U017', 'U001', 6, '09:10', 'ended', 276], ['U003', 'U006', 5, '23:30', 'ended', 52], ['U005', 'U001', 4, '10:30', 'cancelled', 0],
  ['U002', 'U003', 2, '21:55', 'ended', 118], ['U004', 'U001', 1, '17:20', 'ended', 205], ['U001', 'U002', 0.5, '07:50', 'missed', 0],
  ['U019', 'U020', 0.6, '16:40', 'ended', 167],
];

type SeededCall = { id: number; callerId: string; calleeId: string; status: string; endReason: string | null; answeredAt: Date | null; endedAt: Date };

async function seedCalls() {
  const seeded: SeededCall[] = [];
  for (const [caller, callee, days, hm, status, secs] of CALLS) {
    const startedAt = ago(days, hm);
    const answeredAt = status === 'ended' ? new Date(startedAt.getTime() + 6000) : null;
    const endedAt = status === 'ended' ? new Date(answeredAt!.getTime() + secs * 1000) : new Date(startedAt.getTime() + (status === 'missed' ? 30000 : 9000));
    const endReason = status === 'missed' ? 'no answer' : null;
    const call = await prisma.call.create({ data: { callerId: caller, calleeId: callee, status, startedAt, answeredAt, endedAt, endReason } });
    seeded.push({ id: call.id, callerId: caller, calleeId: callee, status, endReason, answeredAt, endedAt });
    const summary = status === 'ended' ? `answered, ${secs} s` : status + (endReason ? ` (${endReason})` : '');
    log(endedAt, caller, 'CALL', `Call #${call.id} ${nameOf(caller)} → ${nameOf(callee)}: ${summary}`);
    touch(caller, startedAt);
    if (status === 'ended') touch(callee, startedAt);
    if (status === 'missed') {
      notifications.push({ userId: callee, title: 'Missed Call', message: `Missed call from ${nameOf(caller)}`, type: 'call', isRead: DEMO_NOW.getTime() - endedAt.getTime() > DAY, incidentId: null, createdAt: endedAt });
    }
  }
  return seeded;
}

// ---------------------------------------------------------------------------
// 5b. Flash Alerts (history only: all are closed or expired, so no alert screen opens at sign-in;
//     raise a live one during the demonstration). Same rules as alerts.service.ts.
// ---------------------------------------------------------------------------
type AlertUpdate = [number, string, string]; // hours after raising, user, text
interface DemoAlert {
  at: Date;
  sender: string;
  title: string;
  threatType: string;
  priority: 'flash' | 'immediate';
  subjectName?: string;
  subjectDescription?: string;
  details: string;
  instructions: string;
  lastSeen?: { hoursBefore: number; place: string; lat: number; lng: number };
  sectors: string[]; // empty = every unit
  incidentId?: string;
  validHours: number;
  attachments: [string, string][]; // media file, name shown
  updates: AlertUpdate[];
  close?: { hoursAfter: number; by: string; kind: 'resolved' | 'cancelled'; note: string };
  ackShare: number; // share of recipients who acknowledged
}

const ALERTS: DemoAlert[] = [
  {
    at: dhaka('2026-09-18', '16:40'), sender: 'U019', title: 'Trafficking group expected to move women across at Kakdanga tonight',
    threatType: 'trafficking', priority: 'immediate',
    subjectDescription: 'Group of 4–5 men with 6–8 young women, said to travel by battery-driven van from Kalaroa bazar after dark.',
    details: 'A source in Kalaroa reports that a trafficking ring will take 6–8 women across the border near Kakdanga between 20:00 and 02:00, promising them jobs in Kolkata.',
    instructions: 'Kalaroa and Kaikhali BOPs: reinforce night ambushes on the Kakdanga crossing routes, check vans on the Kalaroa–Kakdanga road, and report any movement at once to Sector-9.',
    sectors: ['Sector-9'], validHours: 12, attachments: [],
    updates: [[1.5, 'U019', 'Police in Kalaroa are checking the source; ambushes stay in place.']],
    close: { hoursAfter: 3.2, by: 'U019', kind: 'cancelled', note: 'Source retracted: the group was a wedding party, confirmed by Kalaroa police. No crossing planned. Ambushes return to normal duty.' },
    ackShare: 0.9,
  },
  {
    at: dhaka('2026-09-24', '22:05'), sender: 'U018', title: 'সশস্ত্র দল জাফলং সীমান্তের দিকে আসছে বলে তথ্য · Armed group reported moving towards Jaflong',
    threatType: 'armed_group', priority: 'immediate',
    subjectDescription: 'About 6 men, two with long-barrelled weapons, in dark clothing; seen near the Dawki bridge on the Indian side.',
    details: 'Villagers report an armed group on the Indian side near the Dawki bridge, possibly a stone-smuggling gang planning to cross the Piyain river at night to collect payment.',
    instructions: 'Tamabil and Bholaganj BOPs: double the river-bank posts on the Piyain, keep the quick reaction team ready, and do not engage across the border; report through Sector-5.',
    lastSeen: { hoursBefore: 1, place: 'Near the Dawki bridge, opposite Jaflong zero point', lat: 25.1628, lng: 92.0177 },
    sectors: ['Sector-5'], validHours: 24, attachments: [['jaflong-boats.jpg', 'piyain-crossing-point.jpg']],
    updates: [[8, 'U018', 'রাতে কোনো চলাচল দেখা যায়নি। No movement seen overnight; posts stay doubled until the alert expires.']],
    ackShare: 0.8,
  },
  {
    at: dhaka('2026-10-03', '09:40'), sender: 'U002', title: 'Known Yaba carrier expected to cross the Naf at Jadimura today',
    threatType: 'wanted_person', priority: 'flash', subjectName: 'Md. Jamal alias "Kala Jamal"',
    subjectDescription: 'Man, about 30, thin, dark complexion, scar on the left cheek; usually wears a blue lungi and carries a fishing net bag. Wanted in two earlier Yaba cases at Teknaf.',
    details: 'Intelligence from the DGFI detachment: the carrier will land a consignment of about 5,000 Yaba tablets at the Jadimura landing point in the afternoon, from a small fishing boat coming from Maungdaw.',
    instructions: 'Teknaf River BOP: set an ambush at the Jadimura landing point from 12:00; Teknaf and Shah Porir Dwip BOPs: check fishing boats coming ashore. Arrest and report to Sector-7 at once. Do not open fire unless fired upon.',
    lastSeen: { hoursBefore: 14, place: 'Maungdaw jetty (Myanmar side), opposite Jadimura', lat: 20.9310, lng: 92.2580 },
    sectors: ['Sector-7'], incidentId: 'BIRDS-2026-1070', validHours: 24,
    attachments: [['naf-boats-hills.jpg', 'jadimura-landing-point.jpg'], ['yaba-tablets.jpg', 'earlier-seizure-same-carrier.jpg']],
    updates: [
      [3.5, 'U002', 'Source confirms the boat left Maungdaw. Landing expected between 14:00 and 16:00.'],
      [5.3, 'U002', 'জাদিমুড়া পয়েন্টে অ্যাম্বুশ প্রস্তুত। Ambush in place at Jadimura since 12:00.'],
    ],
    close: { hoursAfter: 6.6, by: 'U002', kind: 'resolved', note: 'Carrier arrested at Jadimura with 5,000 Yaba tablets at 15:15. Recorded as incident BIRDS-2026-1070.' },
    ackShare: 1,
  },
  {
    at: dhaka('2026-10-10', '19:30'), sender: 'U001', title: 'Boat with Rohingya bound for Malaysia may leave from the Teknaf coast tonight',
    threatType: 'trafficking', priority: 'flash',
    subjectDescription: 'Wooden trawler, blue hull with a white stripe, about 15 m; 20–30 people expected, including women and children. Brokers from Ukhia camps.',
    details: 'Coast Guard and police intelligence: brokers plan to board 20–30 people from the camps onto a trawler off the Teknaf / Shah Porir Dwip coast after midnight, bound for Malaysia. All units are informed in case the departure point changes.',
    instructions: 'Sector-7: patrol the beaches from Shah Porir Dwip to Baharchhara after 22:00 with the Coast Guard; stop and rescue, treat the passengers as victims. Other sectors: report any similar movement on your coast or rivers.',
    lastSeen: { hoursBefore: 3, place: 'Off Shah Porir Dwip west beach', lat: 20.7650, lng: 92.3190 },
    sectors: [], incidentId: 'BIRDS-2026-1079', validHours: 24, attachments: [['coxs-fishing-boats.jpg', 'trawler-type-reported.jpg']],
    updates: [[4, 'U001', 'Coast Guard vessel on station off Shah Porir Dwip. Beach patrols to report every hour.']],
    close: { hoursAfter: 6.5, by: 'U001', kind: 'resolved', note: '23 people rescued from the trawler at Shah Porir Dwip at 01:20; two brokers arrested. Recorded as incident BIRDS-2026-1079.' },
    ackShare: 0.95,
  },
];

async function seedAlerts(incidentIds: Set<string>) {
  let seq = 0;
  for (const al of ALERTS) {
    if (al.incidentId && !incidentIds.has(al.incidentId)) throw new Error(`Flash Alert demo: incident ${al.incidentId} not in the dataset`);
    seq++;
    const reference = `FA-${ymdOf(al.at).slice(0, 4)}-${String(seq).padStart(4, '0')}`;
    const closedAt = al.close ? addHours(al.at, al.close.hoursAfter) : null;
    const recipients = (await recipientsFor(al.sectors)).filter((id) => id !== al.sender);
    const a = await prisma.flashAlert.create({
      data: {
        reference, title: al.title, threatType: al.threatType, priority: al.priority, subjectName: al.subjectName ?? null,
        subjectDescription: al.subjectDescription ?? null, details: al.details, instructions: al.instructions,
        lastSeenAt: al.lastSeen ? addHours(al.at, -al.lastSeen.hoursBefore) : null, lastSeenPlace: al.lastSeen?.place ?? null,
        lat: al.lastSeen?.lat ?? null, lng: al.lastSeen?.lng ?? null, targetSectors: al.sectors, incidentId: al.incidentId ?? null,
        validUntil: addHours(al.at, al.validHours), status: al.close?.kind ?? 'active', declarationAt: new Date(al.at.getTime() - 40_000),
        createdBy: al.sender, createdAt: al.at, closedBy: al.close?.by ?? null, closedAt, closeNote: al.close?.note ?? null,
      },
    });
    touch(al.sender, al.at);
    const described: string[] = [];
    for (const [file, name] of al.attachments) {
      const buf = media(`images/${file}`);
      const mime = detectMime(buf);
      if (!mime) throw new Error(`Not an allowed attachment type: ${file}`);
      const metadata = await extractMetadata(buf, mime, 'image/jpeg', null);
      const key = `alerts/${randomUUID()}${ALLOWED_TYPES[mime]}`;
      await storage.put(key, buf);
      storedBytes += buf.length;
      await prisma.flashAlertAttachment.create({
        data: { alertId: a.id, originalName: name, mimeType: mime, fileSize: BigInt(buf.length), storagePath: key, sha256: sha256(buf), fileMetadata: JSON.parse(JSON.stringify({ ...metadata, scan: { status: 'not_scanned' } })), uploadedAt: al.at },
      });
      described.push(name);
    }
    log(
      al.at, al.sender, 'RAISE_FLASH_ALERT',
      `${reference} (${al.priority}, ${al.threatType}): ${al.title}. Area: ${al.sectors.length ? al.sectors.join(', ') : 'all units'}; ${recipients.length} recipients; ${described.length} attachment(s); valid ${al.validHours} h. False-alert declaration accepted.`,
    );

    // Delivery within a couple of minutes; most acknowledge within the hour, the rest never do
    const ackEnd = closedAt ?? addHours(al.at, al.validHours);
    const viewers: string[] = [];
    await prisma.flashAlertRecipient.createMany({
      data: recipients.map((userId) => {
        const deliveredAt = new Date(al.at.getTime() + r.int(5, 150) * 1000);
        let acknowledgedAt: Date | null = null;
        if (r.chance(al.ackShare)) {
          acknowledgedAt = new Date(Math.min(deliveredAt.getTime() + r.int(1, 55) * 60_000, ackEnd.getTime() - 60_000));
          log(acknowledgedAt, userId, 'ACKNOWLEDGE_FLASH_ALERT', `${reference}: ${al.title}`);
          touch(userId, acknowledgedAt);
          if (described.length && viewers.length < 3 && r.chance(0.4)) viewers.push(userId);
        }
        return { alertId: a.id, userId, deliveredAt, acknowledgedAt };
      }),
    });
    for (const [i, userId] of viewers.entries()) {
      const at = addHours(al.at, 0.5 + i * 0.2);
      log(at, userId, 'VIEW_ALERT_ATTACHMENT', `${reference}: ${described[i % described.length]} (#${i % described.length + 1})`);
    }

    for (const [hours, userId, body] of al.updates) {
      const at = addHours(al.at, hours);
      await prisma.flashAlertUpdate.create({ data: { alertId: a.id, userId, userName: nameOf(userId), kind: 'update', body, createdAt: at } });
      log(at, userId, 'UPDATE_FLASH_ALERT', `${reference}: ${body}`);
      touch(userId, at);
    }
    if (al.close) {
      await prisma.flashAlertUpdate.create({ data: { alertId: a.id, userId: al.close.by, userName: nameOf(al.close.by), kind: al.close.kind, body: al.close.note, createdAt: closedAt! } });
      log(closedAt!, al.close.by, al.close.kind === 'resolved' ? 'RESOLVE_FLASH_ALERT' : 'CANCEL_FLASH_ALERT', `${reference}: ${al.close.note}`);
      touch(al.close.by, closedAt!);
    }
  }
  // Next number, as allocateReference() keeps it
  const year = ymdOf(ALERTS[ALERTS.length - 1]!.at).slice(0, 4);
  await prisma.systemConfig.create({ data: { key: `alert.next_id.${year}`, value: String(seq + 1), description: `Next Flash Alert number for ${year}` } });
}

// ---------------------------------------------------------------------------
// 6. Administration history, sign-ins and the audit trail
// ---------------------------------------------------------------------------
function adminHistory() {
  const a = (ymd: string, hm: string, user: string, action: string, details: string) => {
    const at = dhaka(ymd, hm);
    log(at, user, action, details);
    touch(user, at);
  };
  a('2025-03-20', '11:05', 'U001', 'CONFIG_CHANGE', 'session.timeout_minutes: 15 → 30');
  a('2025-03-20', '11:20', 'U001', 'PERMISSION_CHANGE', 'Auditor: +reports');
  a('2025-04-02', '10:00', 'U003', 'PASSWORD_CHANGE', 'Password changed by user');
  a('2025-06-18', '09:40', 'U001', 'CONFIG_CHANGE', 'workflow.overdue_days: 5 → 3');
  a('2025-09-30', '16:30', 'U001', 'DEACTIVATE_USER', 'op_rezaul (U021): isActive: true → false; sessions ended');
  a('2025-10-01', '10:10', 'U001', 'UPDATE_USER', 'op_8bgb (U009): scope: 8 BGB → 8 BGB (posted as battalion operator)');
  a('2026-01-14', '12:00', 'U009', 'LOGIN_FAILED', 'Wrong password (attempt 4 of 5)');
  a('2026-01-14', '12:01', 'U009', 'ACCOUNT_LOCKED', 'Locked for 15 min after 5 failed attempts');
  a('2026-01-14', '12:20', 'U001', 'UNLOCK_USER', 'op_8bgb (U009): account unlocked');
  a('2026-02-03', '15:15', 'U001', 'PASSWORD_RESET', 'Reset password for op_33bgb; change required at next login; sessions ended');
  a('2026-02-03', '15:40', 'U015', 'PASSWORD_CHANGE', 'Password changed by user');
  a('2026-07-08', '10:30', 'U001', 'CONFIG_CHANGE', 'archive.after_days: 730 → 365');
  a('2026-09-21', '22:48', 'U012', 'LOGIN_FAILED', 'Wrong password (attempt 1 of 5)');
  // Monthly reporting and audit review
  for (let m = 0; m < 18; m++) {
    const d = new Date(Date.UTC(2025, 4 + m, 3));
    if (d > DEMO_NOW) break;
    const ymd = d.toISOString().slice(0, 10);
    a(ymd, '10:30', 'U001', 'EXPORT_REPORT', `EXCEL export of statistical report (${20 + m * 4} incidents)`);
    a(ymd, '11:00', 'U001', 'PRINT_REPORT', `Printed operational report BGB/BIRDS/RPT/${ymd.slice(0, 4)}/${String(m + 1).padStart(4, '0')} (${20 + m * 4} incidents)`);
    a(ymd, '14:00', 'U005', 'EXPORT_AUDIT_LOG', 'CSV export of the audit log (chain verified)');
  }
}

function signIns() {
  for (const [userId, times] of activity) {
    const days = new Map<string, Date[]>();
    for (const t of times) {
      const k = new Date(t.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
      days.set(k, [...(days.get(k) ?? []), t]);
    }
    for (const list of days.values()) {
      list.sort((x, y) => x.getTime() - y.getTime());
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const loginAt = new Date(first.getTime() - (5 + r.int(0, 40)) * 60_000);
      log(loginAt, userId, 'LOGIN', `Successful login by ${nameOf(userId)}`);
      const outAt = new Date(last.getTime() + (3 + r.int(0, 25)) * 60_000);
      if (outAt > DEMO_NOW) continue; // still signed in
      if (r.chance(0.25)) log(new Date(last.getTime() + 30 * 60_000), userId, 'SESSION_TIMEOUT', 'Session ended after 30 min of inactivity');
      else log(outAt, userId, 'LOGOUT', `User ${nameOf(userId)} logged out`);
    }
  }
}

function archiveRuns(incidents: DemoIncident[]) {
  const byDay = new Map<string, string[]>();
  for (const i of incidents) {
    if (!i.archivedAt) continue;
    const k = i.archivedAt.toISOString();
    byDay.set(k, [...(byDay.get(k) ?? []), i.id]);
  }
  for (const [iso, ids] of byDay) {
    log(new Date(Date.parse(iso) + 60_000), null, 'ARCHIVE_RUN', `Scheduled archiving run (after 365 days): ${ids.length} incident(s) — ${ids.sort().join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.env.DEMO_RESET !== 'yes') {
    console.error('This deletes ALL data in the database and all stored evidence files, then loads the demo dataset.');
    console.error(`Database: ${new URL(env.DATABASE_URL).host}${new URL(env.DATABASE_URL).pathname} · storage: ${env.STORAGE_DRIVER}`);
    console.error('Run again with DEMO_RESET=yes to proceed.');
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  console.log(`Target: ${new URL(env.DATABASE_URL).host}${new URL(env.DATABASE_URL).pathname} · storage ${env.STORAGE_DRIVER}${storageEncrypted ? ' (encrypted)' : ''}`);
  console.log(`Wiped ${await wipeDatabase()} tables; cleared ${await wipeStorage()}`);

  await referenceData();
  const incidents = buildIncidents();
  for (const inc of incidents) await seedIncident(inc);
  for (const [year, next] of Object.entries(nextIds(incidents))) {
    await prisma.systemConfig.create({ data: { key: `incident.next_id.${year}`, value: String(next), description: `Next incident reference number for ${year}` } });
  }
  for (const inc of incidents) if (!inc.discardedAt && inc.status !== 'Draft') await notifyIncident(inc);
  // Calls first: each one is also an entry in the pair's chat
  await seedMessaging(await seedCalls());
  await seedAlerts(new Set(incidents.filter((i) => !i.discardedAt).map((i) => i.id)));
  adminHistory();
  archiveRuns(incidents);
  signIns();

  // Last sign-in per user
  const lastLogin = new Map<string, Date>();
  for (const a of audit) if (a.action === 'LOGIN' && a.userId && (!lastLogin.get(a.userId) || a.timestamp > lastLogin.get(a.userId)!)) lastLogin.set(a.userId, a.timestamp);
  for (const [id, at] of lastLogin) await prisma.user.update({ where: { id }, data: { lastLogin: at } });

  await prisma.notification.createMany({ data: notifications });
  audit.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
  for (let i = 0; i < audit.length; i += 500) await prisma.auditLog.createMany({ data: audit.slice(i, i + 500) });

  const chain = await prisma.$queryRaw<{ rows_checked: bigint; first_broken_seq: bigint | null }[]>`SELECT rows_checked, first_broken_seq FROM audit_log_verify()`;
  const counts = {
    users: await prisma.user.count(),
    incidents: await prisma.incident.count(),
    timeline: await prisma.incidentTimeline.count(),
    comments: await prisma.incidentComment.count(),
    evidence: await prisma.evidence.count(),
    storedMB: Math.round(storedBytes / 1048576),
    notifications: await prisma.notification.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    calls: await prisma.call.count(),
    flashAlerts: await prisma.flashAlert.count(),
    auditLog: await prisma.auditLog.count(),
    auditChainIntact: chain[0]?.first_broken_seq === null,
  };
  console.log('Demo data loaded:', counts, `in ${Math.round((Date.now() - started) / 1000)} s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

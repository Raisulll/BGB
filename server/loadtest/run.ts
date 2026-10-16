// Load test (specs #38, #39): simulated BIRDS users against a running API on a COPY of the demo data.
//
//   npx tsx loadtest/run.ts --users=500 [--hold=300] [--think=20] [--label=u500] [--base=http://localhost:4000]
//
// Each virtual user signs in (load001…, loadtest/seed-users.ts), opens the realtime WebSocket like the
// browser, then repeats: wait (exponential think time, mean --think seconds), open a screen. A screen
// sends the same API requests as the web app (recorded from Chrome, 15-10-2026), in parallel like a
// browser. Background checks run on the app's timers (alerts and notifications 30 s, unread messages
// 60 s). Screens are chosen by the role's permitted pages. Statistics cover the hold period only
// (after every user has signed in). Results: loadtest/results/<label>.json.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { PASSWORD } from './common.js';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const USERS = Number(arg('users', '100'));
const HOLD_S = Number(arg('hold', '300'));
const THINK_S = Number(arg('think', '20'));
const RAMP_S = Number(arg('ramp', String(Math.max(30, Math.round(USERS * 0.4))))); // sign-ins are spread (bcrypt cost 12)
const LABEL = arg('label', `u${USERS}`);
const BASE = arg('base', 'http://localhost:4000');
const API = `${BASE}/api/v1`;

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------
type Sample = { t: number; ms: number; status: number };
const requests = new Map<string, Sample[]>();
const screens = new Map<string, Sample[]>();
let holdFrom = Infinity;
let holdTo = Infinity;
const add = (m: Map<string, Sample[]>, k: string, s: Sample) => (m.get(k) ?? m.set(k, []).get(k)!).push(s);

// ---------------------------------------------------------------------------
// Virtual user
// ---------------------------------------------------------------------------
const PAGES: Record<string, string[]> = {
  'HQ Administrator': ['dashboard', 'incidents', 'map', 'analytics', 'reports', 'messages'],
  'Sector Officer': ['dashboard', 'incidents', 'map', 'analytics', 'reports', 'messages'],
  'Battalion Operator': ['dashboard', 'incidents', 'map', 'messages'],
  'Verifier/Approver': ['dashboard', 'incidents', 'map', 'analytics', 'reports', 'messages'],
  Auditor: ['dashboard', 'incidents', 'analytics', 'reports', 'messages'],
};
// Relative frequency of each screen; screens the role may not open are skipped
const WEIGHTS: [string, number, string][] = [
  ['dashboard', 25, 'dashboard'],
  ['list', 20, 'incidents'],
  ['detail', 25, 'incidents'],
  ['map', 8, 'map'],
  ['analytics', 7, 'analytics'],
  ['reports', 5, 'reports'],
  ['messages', 5, 'messages'],
  ['alerts', 3, 'incidents'],
  ['comment', 2, 'incidents'],
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exp = (mean: number) => -Math.log(1 - Math.random()) * mean;
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
const today = new Date();
const monthsAgo = (m: number) => new Date(today.getFullYear(), today.getMonth() - m, 1).toISOString().slice(0, 10);

class User {
  token = '';
  cookie = '';
  role = '';
  ids = new Set<string>();
  ws: WebSocket | null = null;
  running = true;
  constructor(readonly username: string) {}

  async call(label: string, p: string, init: RequestInit = {}, retried = false): Promise<Response | null> {
    const t0 = performance.now();
    let res: Response | null = null;
    try {
      res = await fetch(`${API}${p}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${this.token}`, 'content-type': 'application/json' } });
      if (res.status === 401 && !retried) {
        await res.arrayBuffer();
        await this.refresh();
        return this.call(label, p, init, true);
      }
      await res.clone().arrayBuffer(); // the whole body, as a browser would
    } catch {
      res = null;
    }
    const ms = performance.now() - t0;
    add(requests, label, { t: Date.now(), ms, status: res?.status ?? 0 });
    return res;
  }

  async login() {
    const t0 = performance.now();
    const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: this.username, password: PASSWORD }) });
    add(requests, 'POST /auth/login', { t: Date.now(), ms: performance.now() - t0, status: res.status });
    if (!res.ok) throw new Error(`login ${this.username}: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { accessToken: string; user: { role: string } };
    this.token = body.accessToken;
    this.role = body.user.role;
    this.cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }

  async refresh() {
    const res = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { cookie: this.cookie } });
    if (res.ok) {
      this.token = ((await res.json()) as { accessToken: string }).accessToken;
      const set = res.headers.getSetCookie().map((c) => c.split(';')[0]);
      if (set.length) this.cookie = set.join('; ');
    }
  }

  openSocket() {
    // Same origin as the web app: production accepts browser connections only from BIRDS' own origin
    const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/ws`, { headers: { origin: BASE } });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: this.token })));
    ws.on('error', () => {});
    ws.on('close', () => {
      if (this.running) setTimeout(() => this.running && this.openSocket(), 5000);
    });
    this.ws = ws;
  }

  // One screen: its requests in parallel; the screen time is until the last one completes
  async screen(name: string, calls: [string, string, RequestInit?][]) {
    const t0 = performance.now();
    const results = await Promise.all(calls.map(([label, p, init]) => this.call(label, p, init)));
    const worst = results.reduce((s, r) => Math.max(s, r ? (r.status >= 500 ? r.status : 200) : 0), 200);
    add(screens, name, { t: Date.now(), ms: performance.now() - t0, status: results.some((r) => !r) ? 0 : worst });
    return results;
  }

  remember(res: Response | null) {
    return res?.ok ? res.json().then((b) => (b as { data?: { id: string; status: string }[] }).data?.forEach((i) => i.status !== 'Draft' && this.ids.add(i.id))).catch(() => {}) : undefined;
  }

  async dashboard() {
    const r = await this.screen('Dashboard', [
      ['GET /reports/summary', '/reports/summary'],
      ['GET /reports/trends', '/reports/trends?granularity=month'],
      ['GET /reports/trends', '/reports/trends?granularity=month&status=Approved%2CClosed'],
      ['GET /reports/by-category', '/reports/by-category'],
      ['GET /reports/by-sector', '/reports/by-sector'],
      ['GET /incidents (list)', '/incidents?pageSize=5&sort=createdAt&order=desc'],
      ['GET /incidents (count)', '/incidents?needsAction=true&pageSize=1'],
      ['GET /incidents (count)', '/incidents?needsAction=true&overdue=true&pageSize=1'],
      ['GET /incidents (count)', '/incidents?createdBy=me&status=Returned&pageSize=1'],
      ['GET /incidents (count)', '/incidents?createdBy=me&status=Draft&pageSize=1'],
      ['GET /incidents (count)', '/incidents?overdue=true&pageSize=1'],
    ]);
    await this.remember(r[5]!);
  }

  async list() {
    const filters = ['', '&status=Submitted', '&severity=High', '&category=Smuggling', '&q=BOP', `&dateFrom=${monthsAgo(3)}`];
    const r = await this.screen('Incident register', [
      ['GET /incidents (list)', `/incidents?sort=createdAt&order=desc&page=${1 + Math.floor(Math.random() * 3)}&pageSize=25${pick(filters)}`],
      ['GET /incidents (count)', '/incidents?needsAction=true&pageSize=1'],
      ['GET /incidents (count)', '/incidents?createdBy=me&status=Draft&pageSize=1'],
    ]);
    await this.remember(r[0]!);
  }

  async detail() {
    if (this.ids.size === 0) return this.list();
    const id = pick([...this.ids]);
    const t0 = performance.now();
    const [inc] = await Promise.all([this.call('GET /incidents/:id', `/incidents/${id}`), this.call('GET /incidents/:id/related', `/incidents/${id}/related`)]);
    const body = inc?.ok ? ((await inc.json()) as { evidence?: { id: number; available: boolean; mimeType: string }[] }) : {};
    // The page shows image previews (decrypted and integrity-checked by the server)
    const previews = (body.evidence ?? []).filter((e) => e.available && e.mimeType.startsWith('image/')).slice(0, 2);
    await Promise.all(previews.map((e) => this.call('GET evidence preview', `/incidents/${id}/evidence/${e.id}?inline=1`)));
    add(screens, 'Incident record (with evidence previews)', { t: Date.now(), ms: performance.now() - t0, status: inc ? (inc.status >= 500 ? inc.status : 200) : 0 });
  }

  analytics() {
    const q = `dateFrom=${monthsAgo(11)}`;
    return this.screen('Analytics', [
      ['GET /reports/summary', `/reports/summary?${q}`],
      ['GET /reports/trends', `/reports/trends?${q}&granularity=month`],
      ['GET /reports/trends', `/reports/trends?dateFrom=${monthsAgo(23)}&granularity=month&dateTo=${monthsAgo(11)}`],
      ['GET /reports/by-severity', `/reports/by-severity?${q}`],
      ['GET /reports/by-category', `/reports/by-category?${q}`],
      ['GET /reports/by-sector', `/reports/by-sector?${q}`],
      ['GET /reports/by-location', `/reports/by-location?${q}&limit=8`],
      ['GET /reports/by-time', `/reports/by-time?${q}`],
    ]);
  }

  async comment() {
    if (this.ids.size === 0 || this.role === 'Auditor') return this.detail();
    const id = pick([...this.ids]);
    await this.screen('Add comment', [['POST /incidents/:id/comments', `/incidents/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: `Load test comment ${Date.now()}` }) }]]);
  }

  async act(kind: string) {
    switch (kind) {
      case 'dashboard': return this.dashboard();
      case 'list': return this.list();
      case 'detail': return this.detail();
      case 'map': return this.screen('GIS map', [['GET /gis/incidents', '/gis/incidents']]);
      case 'analytics': return this.analytics();
      case 'reports': return this.screen('Reports', [['GET /reports/operational', '/reports/operational?type=operational']]);
      case 'messages': return this.screen('Messages', [['GET /messaging/conversations', '/messaging/conversations']]);
      case 'alerts': return this.screen('Flash alerts', [['GET /alerts', '/alerts?state=active&page=1&pageSize=20']]);
      case 'comment': return this.comment();
    }
  }

  async run() {
    await this.login();
    this.openSocket();
    // App start: shell data, then the dashboard
    await this.screen('Sign-in (app start)', [
      ['GET /auth/me', '/auth/me'],
      ['GET /incidents/meta', '/incidents/meta'],
      ['GET /notifications', '/notifications?pageSize=50'],
      ['GET /alerts/active', '/alerts/active'],
      ['GET /messaging/unread', '/messaging/unread'],
      ['GET /push/config', '/push/config'],
    ]);
    await this.dashboard();
    const pages = PAGES[this.role] ?? ['dashboard'];
    const options = WEIGHTS.filter(([, , page]) => pages.includes(page));
    const total = options.reduce((s, [, w]) => s + w, 0);
    const bg30 = setInterval(() => {
      void this.call('GET /alerts/active', '/alerts/active');
      void this.call('GET /notifications', '/notifications?pageSize=50');
    }, 30_000 + Math.random() * 2000);
    const bg60 = setInterval(() => void this.call('GET /messaging/unread', '/messaging/unread'), 60_000 + Math.random() * 2000);
    while (this.running) {
      await sleep(exp(THINK_S * 1000));
      if (!this.running) break;
      let r = Math.random() * total;
      const kind = options.find(([, w]) => (r -= w) < 0)?.[0] ?? 'dashboard';
      await this.act(kind);
    }
    clearInterval(bg30);
    clearInterval(bg60);
    this.ws?.close();
  }
}

// ---------------------------------------------------------------------------
// Server resource use (Windows: the API process and PostgreSQL), sampled every 10 s
// ---------------------------------------------------------------------------
function serverPid() {
  const port = new URL(BASE).port || '80';
  const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.includes(`:${port} `) && l.includes('LISTENING'));
  return line ? Number(line.trim().split(/\s+/).pop()) : null;
}
function cpuSeconds(pid: number | null) {
  const ps = `$a=(Get-Process -Id ${pid ?? 0} -ErrorAction SilentlyContinue); $p=(Get-Process postgres -ErrorAction SilentlyContinue | Measure-Object CPU -Sum).Sum; "$($a.CPU) $($a.WorkingSet64) $p"`;
  const [api, rss, pg] = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(' ').map(Number);
  return { api: api ?? 0, rss: rss ?? 0, pg: pg ?? 0, at: Date.now() };
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]! : 0);
function summarise(m: Map<string, Sample[]>) {
  const out: Record<string, object> = {};
  for (const [k, all] of [...m.entries()].sort()) {
    const s = all.filter((x) => x.t >= holdFrom && x.t <= holdTo);
    if (!s.length) continue;
    const ms = s.map((x) => x.ms).sort((a, b) => a - b);
    out[k] = {
      count: s.length,
      errors: s.filter((x) => x.status === 0 || x.status >= 500).length,
      rejected4xx: s.filter((x) => x.status >= 400 && x.status < 500).length,
      p50: Math.round(pct(ms, 50)),
      p95: Math.round(pct(ms, 95)),
      p99: Math.round(pct(ms, 99)),
      max: Math.round(ms[ms.length - 1]!),
      over3s: s.filter((x) => x.ms > 3000).length,
    };
  }
  return out;
}

// seed-users.ts numbers the accounts role by role (operators first). Interleave them so that the
// first N accounts have the same role mix as all of them, whatever N is.
function accountOrder() {
  const groups = [300, 75, 50, 50, 25]; // operators, sector officers, verifiers, auditors, HQ administrators
  const order: { n: number; key: number }[] = [];
  let first = 1;
  for (const size of groups) {
    for (let k = 0; k < size; k++) order.push({ n: first + k, key: (k + 0.5) / size });
    first += size;
  }
  return order.sort((a, b) => a.key - b.key || a.n - b.n).map((o) => o.n);
}

async function main() {
  const pid = serverPid();
  console.log(`${LABEL}: ${USERS} users, sign-ins over ${RAMP_S} s, hold ${HOLD_S} s, think time ${THINK_S} s; API pid ${pid}`);
  const users = accountOrder().slice(0, USERS).map((n) => new User(`load${String(n).padStart(3, '0')}`));
  const runs: Promise<void>[] = [];
  const failures: string[] = [];
  const started = Date.now();
  for (const [i, u] of users.entries()) {
    await sleep(Math.max(0, started + (i * RAMP_S * 1000) / USERS - Date.now()));
    runs.push(u.run().catch((e) => void failures.push(String(e))));
  }
  await sleep(30_000); // let the last users settle before measuring
  holdFrom = Date.now();
  const cpu0 = cpuSeconds(pid);
  const samples: { t: number; apiCpu: number; pgCpu: number; rssMB: number; sockets: number }[] = [];
  let prev = cpu0;
  const sampler = setInterval(() => {
    const c = cpuSeconds(pid);
    const dt = (c.at - prev.at) / 1000;
    samples.push({ t: Math.round((c.at - holdFrom) / 1000), apiCpu: Math.round(((c.api - prev.api) / dt) * 100), pgCpu: Math.round(((c.pg - prev.pg) / dt) * 100), rssMB: Math.round(c.rss / 1048576), sockets: users.filter((u) => u.ws?.readyState === WebSocket.OPEN).length });
    prev = c;
  }, 10_000);
  await sleep(HOLD_S * 1000);
  holdTo = Date.now();
  clearInterval(sampler);
  const cpu1 = cpuSeconds(pid);
  for (const u of users) u.running = false;

  const all = [...requests.values()].flat().filter((x) => x.t >= holdFrom && x.t <= holdTo);
  const ms = all.map((x) => x.ms).sort((a, b) => a - b);
  const hold = (holdTo - holdFrom) / 1000;
  const result = {
    label: LABEL,
    date: new Date().toISOString(),
    settings: { users: USERS, rampSeconds: RAMP_S, holdSeconds: HOLD_S, thinkSeconds: THINK_S, base: BASE },
    signInFailures: failures.length,
    overall: {
      requests: all.length,
      perSecond: Math.round((all.length / hold) * 10) / 10,
      errors: all.filter((x) => x.status === 0 || x.status >= 500).length,
      p50: Math.round(pct(ms, 50)),
      p95: Math.round(pct(ms, 95)),
      p99: Math.round(pct(ms, 99)),
      max: Math.round(ms[ms.length - 1] ?? 0),
      over3s: all.filter((x) => x.ms > 3000).length,
      apiCpuPercentOfOneCore: Math.round(((cpu1.api - cpu0.api) / hold) * 100),
      postgresCpuPercentOfOneCore: Math.round(((cpu1.pg - cpu0.pg) / hold) * 100),
      apiMemoryMB: Math.round(cpu1.rss / 1048576),
      websocketsOpen: users.filter((u) => u.ws?.readyState === WebSocket.OPEN).length,
    },
    screens: summarise(screens),
    requests: summarise(requests),
    samples,
  };
  mkdirSync(path.join(import.meta.dirname, 'results'), { recursive: true });
  writeFileSync(path.join(import.meta.dirname, 'results', `${LABEL}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ overall: result.overall, signInFailures: failures.slice(0, 3), screens: result.screens }, null, 1));
  await Promise.race([Promise.all(runs), sleep(5000)]);
  process.exit(0);
}

void main();

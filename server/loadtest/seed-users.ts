// Load test (specs #38, #39): adds load-test accounts load001…loadNNN to a COPY of the demo database.
// Never run against a live database.
//
//   DATABASE_URL=postgresql://…/birds_load npx tsx loadtest/seed-users.ts 500
//
// Roles and scopes follow a realistic spread: most users file reports at battalions, fewer review
// in sectors, a few work at HQ. All share the password in PASSWORD (one bcrypt hash, cost 12).
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { PASSWORD } from './common.js';
const count = Number(process.argv[2] ?? 500);

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? '').pathname;
  if (!/load/.test(db)) throw new Error(`Refusing to add load-test users to ${db}: use a copy whose name contains "load"`);

  const org = await prisma.orgHierarchy.findMany();
  const sectors = [...new Set(org.map((o) => o.sector))].sort();
  const battalions = [...new Set(org.map((o) => o.battalion))].sort();
  const hash = await bcrypt.hash(PASSWORD, 12);

  // Shares of the user base per role, with the scope each gets
  const plan: [string, number, (i: number) => string][] = [
    ['Battalion Operator', 0.6, (i) => battalions[i % battalions.length]!],
    ['Sector Officer', 0.15, (i) => sectors[i % sectors.length]!],
    ['Verifier/Approver', 0.1, (i) => sectors[i % sectors.length]!],
    ['Auditor', 0.1, () => 'HQ'],
    ['HQ Administrator', 0.05, () => 'HQ'],
  ];
  const rows = [];
  let n = 0;
  for (const [role, share, scope] of plan) {
    const k = Math.round(count * share);
    for (let i = 0; i < k && n < count; i++) {
      n++;
      const id = `L${String(n).padStart(4, '0')}`;
      rows.push({ id, username: `load${String(n).padStart(3, '0')}`, passwordHash: hash, name: `Load User ${n}`, role, scope: scope(i), email: `load${n}@load.test` });
    }
  }
  await prisma.user.deleteMany({ where: { id: { startsWith: 'L' } } });
  await prisma.user.createMany({ data: rows });
  const byRole = rows.reduce<Record<string, number>>((a, r) => ((a[r.role] = (a[r.role] ?? 0) + 1), a), {});
  console.log(`${rows.length} load-test users added to ${db}:`, byRole);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

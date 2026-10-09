// Dev helper: restore a demo account to its seed password, unlocked, with sessions ended.
// Usage: npm run demo:reset-user -- sector_off
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db.js';
import { USERS } from '../prisma/data/seed-data.js';

const username = process.argv[2];
const seed = USERS.find((u: { username: string }) => u.username === username);
if (!seed) {
  console.error(`Unknown demo user "${username}". Options: ${USERS.map((u: { username: string }) => u.username).join(', ')}`);
  process.exit(1);
}
const user = await prisma.user.update({
  where: { username },
  data: {
    passwordHash: await bcrypt.hash(seed.password, env.BCRYPT_ROUNDS),
    failedAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    isActive: true,
  },
});
await prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true, revokedReason: 'demo_reset' } });
console.log(`Reset ${username} to its demo password`);
await prisma.$disconnect();

import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './config/env.js';
import { PrismaClient } from './generated/prisma/client.js';

// Single shared client per process. Pool size per §26: (CPU cores * 2) + 1, set via DB_POOL_MAX.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX });

export const prisma = new PrismaClient({ adapter });

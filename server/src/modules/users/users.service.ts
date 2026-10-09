import { prisma } from '../../db.js';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { AppError, badRequest, notFound } from '../../utils/errors.js';
import { paged, toSkipTake } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { ROLES } from '../../utils/roles.js';
import { resolveScope } from '../../utils/scope.js';
import { getSecurityConfig, validatePassword } from '../admin/config.service.js';
import { writeAudit } from '../audit/audit.service.js';
import { generateTemporaryPassword, hashPassword } from '../auth/auth.service.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema.js';

type AuthUser = Express.AuthUser;

// §19.2 — user administration (spec #3). Users are never hard-deleted; deactivation keeps
// their name on every timeline, evidence and audit record they touched.
export function toUserAdminDto(u: User) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    scope: u.scope,
    email: u.email,
    isActive: u.isActive,
    locked: !!u.lockedUntil && u.lockedUntil.getTime() > Date.now(),
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    failedAttempts: u.failedAttempts,
    mustChangePassword: u.mustChangePassword,
    lastLogin: u.lastLogin?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

async function assertRole(role: string) {
  if (!(await prisma.role.findUnique({ where: { name: role } }))) throw badRequest(`Unknown role "${role}"`);
}

async function assertScope(scope: string) {
  if ((await resolveScope(scope)).level === 'none') {
    throw badRequest(`Unknown scope "${scope}": use HQ, or a sector, battalion or BOP from the org hierarchy`);
  }
}

function uniqueViolation(err: unknown): string | null {
  const e = err as { code?: string; meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } };
  if (e?.code !== 'P2002') return null;
  const fields = e.meta?.driverAdapterError?.cause?.constraint?.fields ?? (Array.isArray(e.meta?.target) ? (e.meta.target as string[]) : []);
  return fields.join(', ') || 'value';
}

/** The system must always keep at least one active HQ Administrator. */
async function assertAdminRemains(tx: Prisma.TransactionClient, excludingUserId: string) {
  const others = await tx.user.count({ where: { role: ROLES.HQ_ADMIN, isActive: true, id: { not: excludingUserId } } });
  if (others === 0) throw new AppError(409, 'LAST_ADMIN', 'At least one active HQ Administrator must remain');
}

export async function listUsers(q: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.active ? { isActive: q.active === 'true' } : {}),
    ...(q.q
      ? {
          OR: [
            { username: { contains: q.q, mode: 'insensitive' } },
            { name: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({ where, orderBy: { id: 'asc' }, ...toSkipTake(q) }),
    prisma.user.count({ where }),
  ]);
  return paged(rows.map(toUserAdminDto), total, q);
}

export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw notFound('User not found');
  return toUserAdminDto(u);
}

export async function createUser(admin: AuthUser, input: CreateUserInput, ctx: RequestContext) {
  await assertRole(input.role);
  await assertScope(input.scope);
  const policy = await getSecurityConfig();
  const generated = !input.password;
  const password = input.password ?? generateTemporaryPassword(policy.minLength);
  const policyError = validatePassword(password, policy);
  if (policyError) throw badRequest(policyError);
  const passwordHash = await hashPassword(password);

  let user: User;
  try {
    user = await prisma.$transaction(async (tx) => {
      // Serialise id allocation (U001, U002, …)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('birds.users.id'))`;
      const rows = await tx.$queryRaw<{ max: number | null }[]>`SELECT max(substring(id from 2)::int) AS max FROM users WHERE id ~ '^U[0-9]+$'`;
      const id = `U${String((rows[0]?.max ?? 0) + 1).padStart(3, '0')}`;
      return tx.user.create({
        data: {
          id,
          username: input.username,
          name: input.name,
          role: input.role,
          scope: input.scope,
          email: input.email,
          passwordHash,
          // A password chosen by the admin is still known to the admin: force a change either way
          mustChangePassword: true,
        },
      });
    });
  } catch (err) {
    const field = uniqueViolation(err);
    if (field) throw new AppError(409, 'DUPLICATE', `A user with this ${field} already exists`);
    throw err;
  }

  await writeAudit({
    action: 'CREATE_USER',
    username: admin.username,
    userId: admin.id,
    details: `Created ${user.username} (${user.id}) as ${user.role}, scope ${user.scope}`,
    ctx,
  });
  return { user: toUserAdminDto(user), ...(generated ? { temporaryPassword: password } : {}) };
}

export async function updateUser(admin: AuthUser, id: string, input: UpdateUserInput, ctx: RequestContext) {
  if (Object.keys(input).length === 0) throw badRequest('No changes supplied');
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound('User not found');
  if (input.role) await assertRole(input.role);
  if (input.scope) await assertScope(input.scope);

  const demotingAdmin = before.role === ROLES.HQ_ADMIN && ((input.role && input.role !== ROLES.HQ_ADMIN) || input.isActive === false);
  if (id === admin.id && (input.isActive === false || (input.role && input.role !== before.role))) {
    throw new AppError(409, 'SELF_CHANGE', 'You cannot change your own role or deactivate your own account');
  }

  const privilegeChange =
    (input.role !== undefined && input.role !== before.role) ||
    (input.scope !== undefined && input.scope !== before.scope) ||
    (input.isActive === false && before.isActive);

  let after: User;
  try {
    after = await prisma.$transaction(async (tx) => {
      if (demotingAdmin) await assertAdminRemains(tx, id);
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.unlock ? { failedAttempts: 0, lockedUntil: null } : {}),
        },
      });
      // New role, new scope or deactivation: end existing sessions so nothing runs on old privileges
      if (privilegeChange) {
        await tx.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true, revokedReason: 'privilege_change' } });
      }
      return updated;
    });
  } catch (err) {
    const field = uniqueViolation(err);
    if (field) throw new AppError(409, 'DUPLICATE', `A user with this ${field} already exists`);
    throw err;
  }

  const changes = (['name', 'role', 'scope', 'email', 'isActive'] as const)
    .filter((k) => input[k] !== undefined && input[k] !== before[k])
    .map((k) => `${k}: ${String(before[k])} → ${String(after[k])}`);
  if (input.unlock) changes.push('account unlocked');
  const action =
    input.isActive === false && before.isActive
      ? 'DEACTIVATE_USER'
      : input.isActive === true && !before.isActive
        ? 'REACTIVATE_USER'
        : input.role && input.role !== before.role
          ? 'ROLE_CHANGE'
          : input.unlock && Object.keys(input).length === 1
            ? 'UNLOCK_USER'
            : 'UPDATE_USER';

  await writeAudit({
    action,
    username: admin.username,
    userId: admin.id,
    details: `${before.username} (${id}): ${changes.join('; ') || 'no effective change'}${privilegeChange ? '; sessions ended' : ''}`,
    ctx,
  });
  return toUserAdminDto(after);
}

export async function deactivateUser(admin: AuthUser, id: string, ctx: RequestContext) {
  return updateUser(admin, id, { isActive: false }, ctx);
}

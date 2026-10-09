import { prisma } from '../../db.js';
import { invalidatePermissionCache } from '../../middleware/rbac.js';
import { AppError, badRequest, notFound } from '../../utils/errors.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { DEFAULT_PERMISSIONS, PAGE_IDS, ROLES, type PageId } from '../../utils/roles.js';
import { invalidateOrgCache } from '../../utils/scope.js';
import { writeAudit } from '../audit/audit.service.js';
import { CONFIG_DEFAULTS, invalidateConfigCache, validateConfigValue } from './config.service.js';

type AuthUser = Express.AuthUser;
const audit = (admin: AuthUser, action: string, details: string, ctx: RequestContext) =>
  writeAudit({ action, username: admin.username, userId: admin.id, details, ctx });

// ---------------------------------------------------------------------------
// System configuration (spec #47) — typed and range-checked; incident counters are read-only
// ---------------------------------------------------------------------------
export async function getConfig() {
  const stored = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' }, include: { updater: { select: { username: true } } } });
  // Settings added after the database was seeded have no row yet: show their default
  const missing = Object.entries(CONFIG_DEFAULTS)
    .filter(([key]) => !stored.some((r) => r.key === key))
    .map(([key, spec]) => ({ key, value: spec.value, description: spec.description, updater: null, updatedAt: new Date(0) }));
  const rows = [...stored, ...missing].sort((a, b) => a.key.localeCompare(b.key));
  return rows.map((r) => {
    const spec = CONFIG_DEFAULTS[r.key];
    return {
      key: r.key,
      value: spec?.type === 'int' ? Number(r.value) : spec?.type === 'bool' ? r.value === 'true' : r.value,
      description: r.description,
      editable: !!spec,
      ...(spec ? { type: spec.type, min: spec.min, max: spec.max } : {}),
      updatedBy: r.updater?.username ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export async function updateConfig(admin: AuthUser, values: Record<string, unknown>, ctx: RequestContext) {
  const normalised: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    const r = validateConfigValue(key, raw);
    if ('error' in r) errors[key] = r.error;
    else normalised[key] = r.value;
  }
  if (Object.keys(errors).length) throw badRequest('Invalid settings', errors);

  const before = new Map((await prisma.systemConfig.findMany({ where: { key: { in: Object.keys(normalised) } } })).map((r) => [r.key, r.value]));
  await prisma.$transaction(
    Object.entries(normalised).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value, updatedBy: admin.id },
        create: { key, value, description: CONFIG_DEFAULTS[key]!.description, updatedBy: admin.id },
      }),
    ),
  );
  invalidateConfigCache();

  const changes = Object.entries(normalised)
    .filter(([k, v]) => before.get(k) !== v)
    .map(([k, v]) => `${k}: ${before.get(k) ?? '(unset)'} → ${v}`);
  if (changes.length) await audit(admin, 'CONFIG_CHANGE', changes.join('; '), ctx);
  return getConfig();
}

// ---------------------------------------------------------------------------
// Role → page permissions (spec #3)
// ---------------------------------------------------------------------------
export async function getPermissions() {
  const [roles, rows] = await Promise.all([
    prisma.role.findMany({ orderBy: { id: 'asc' } }),
    prisma.rolePermission.findMany({ where: { enabled: true } }),
  ]);
  const matrix: Record<string, PageId[]> = {};
  for (const r of roles) {
    matrix[r.name] = PAGE_IDS.filter((p) => rows.some((row) => row.role === r.name && row.pageId === p));
  }
  return { pageIds: PAGE_IDS, roles: roles.map((r) => ({ name: r.name, description: r.description })), permissions: matrix };
}

async function writeRolePermissions(role: string, pages: readonly PageId[]) {
  await prisma.$transaction(
    PAGE_IDS.map((pageId) =>
      prisma.rolePermission.upsert({
        where: { role_pageId: { role, pageId } },
        update: { enabled: pages.includes(pageId) },
        create: { role, pageId, enabled: pages.includes(pageId) },
      }),
    ),
  );
}

export async function updatePermissions(
  admin: AuthUser,
  body: { role: string; pageId: PageId; enabled: boolean } | { role: string; permissions: PageId[] },
  ctx: RequestContext,
) {
  if (!(await prisma.role.findUnique({ where: { name: body.role } }))) throw badRequest(`Unknown role "${body.role}"`);
  const current = (await getPermissions()).permissions[body.role] ?? [];
  const next =
    'permissions' in body
      ? [...new Set(body.permissions)]
      : body.enabled
        ? [...new Set([...current, body.pageId])]
        : current.filter((p) => p !== body.pageId);

  // Never let the matrix lock every administrator out of the Admin module
  if (body.role === ROLES.HQ_ADMIN && !next.includes('admin')) {
    throw new AppError(409, 'ADMIN_LOCKOUT', 'HQ Administrator must keep access to the admin module');
  }

  await writeRolePermissions(body.role, next);
  invalidatePermissionCache();
  const added = next.filter((p) => !current.includes(p));
  const removed = current.filter((p) => !next.includes(p));
  if (added.length || removed.length) {
    await audit(
      admin,
      'PERMISSION_CHANGE',
      `${body.role}: ${[...added.map((p) => `+${p}`), ...removed.map((p) => `-${p}`)].join(', ')}`,
      ctx,
    );
  }
  return getPermissions();
}

export async function resetPermissions(admin: AuthUser, ctx: RequestContext) {
  for (const [role, pages] of Object.entries(DEFAULT_PERMISSIONS)) await writeRolePermissions(role, pages);
  invalidatePermissionCache();
  await audit(admin, 'PERMISSION_RESET', 'Reset all role permissions to factory defaults', ctx);
  return getPermissions();
}

// ---------------------------------------------------------------------------
// Incident categories (spec #6). Incidents store the category *name*, so a category that is
// in use cannot be renamed (that would split historical statistics); deactivate it instead.
// ---------------------------------------------------------------------------
export async function getCategories() {
  const [cats, usage] = await Promise.all([
    prisma.incidentCategory.findMany({ orderBy: { id: 'asc' }, include: { subcategories: { orderBy: { id: 'asc' } } } }),
    prisma.incident.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);
  const used = new Map(usage.map((u) => [u.category, u._count._all]));
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    isActive: c.isActive,
    incidentCount: used.get(c.name) ?? 0,
    subcategories: c.subcategories.map((s) => ({ name: s.name, isActive: s.isActive })),
  }));
}

const dedupe = (names: string[]) => [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];

export async function createCategory(admin: AuthUser, input: { name: string; subcategories: string[] }, ctx: RequestContext) {
  if (await prisma.incidentCategory.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) {
    throw new AppError(409, 'DUPLICATE', `Category "${input.name}" already exists`);
  }
  const subs = dedupe(input.subcategories);
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('birds.categories.id'))`;
    const rows = await tx.$queryRaw<{ max: number | null }[]>`SELECT max(substring(id from 4)::int) AS max FROM incident_categories WHERE id ~ '^CAT[0-9]+$'`;
    const id = `CAT${String((rows[0]?.max ?? 0) + 1).padStart(2, '0')}`;
    return tx.incidentCategory.create({ data: { id, name: input.name, subcategories: { create: subs.map((name) => ({ name })) } } });
  });
  await audit(admin, 'CATEGORY_CREATE', `${created.id} "${created.name}"${subs.length ? ` with ${subs.join(', ')}` : ''}`, ctx);
  return (await getCategories()).find((c) => c.id === created.id);
}

export async function updateCategory(
  admin: AuthUser,
  id: string,
  input: { name?: string; isActive?: boolean; addSubcategories?: string[]; subcategoryStatus?: { name: string; isActive: boolean }[] },
  ctx: RequestContext,
) {
  const cat = await prisma.incidentCategory.findUnique({ where: { id }, include: { subcategories: true } });
  if (!cat) throw notFound('Category not found');
  const changes: string[] = [];

  if (input.name !== undefined && input.name !== cat.name) {
    if (await prisma.incident.count({ where: { category: cat.name } })) {
      throw new AppError(409, 'CATEGORY_IN_USE', `"${cat.name}" is used by existing incidents; deactivate it and create a new category instead`);
    }
    if (await prisma.incidentCategory.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' }, id: { not: id } } })) {
      throw new AppError(409, 'DUPLICATE', `Category "${input.name}" already exists`);
    }
    changes.push(`name: ${cat.name} → ${input.name}`);
  }
  for (const s of input.subcategoryStatus ?? []) {
    if (!cat.subcategories.some((c) => c.name === s.name)) throw badRequest(`"${s.name}" is not a subcategory of ${cat.name}`);
  }
  const toAdd = dedupe(input.addSubcategories ?? []).filter((n) => !cat.subcategories.some((s) => s.name.toLowerCase() === n.toLowerCase()));

  await prisma.$transaction(async (tx) => {
    await tx.incidentCategory.update({
      where: { id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
    });
    if (toAdd.length) await tx.incidentSubcategory.createMany({ data: toAdd.map((name) => ({ categoryId: id, name })) });
    for (const s of input.subcategoryStatus ?? []) {
      await tx.incidentSubcategory.updateMany({ where: { categoryId: id, name: s.name }, data: { isActive: s.isActive } });
    }
  });

  if (input.isActive !== undefined && input.isActive !== cat.isActive) changes.push(input.isActive ? 'activated' : 'deactivated');
  if (toAdd.length) changes.push(`added ${toAdd.join(', ')}`);
  for (const s of input.subcategoryStatus ?? []) {
    const was = cat.subcategories.find((c) => c.name === s.name)!.isActive;
    if (was !== s.isActive) changes.push(`${s.name} ${s.isActive ? 'activated' : 'deactivated'}`);
  }
  if (changes.length) await audit(admin, 'CATEGORY_UPDATE', `${id}: ${changes.join('; ')}`, ctx);
  return (await getCategories()).find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Organizational hierarchy (spec #9). Units are added, never deleted: incidents reference them.
// ---------------------------------------------------------------------------
export async function getOrgHierarchy() {
  const rows = await prisma.orgHierarchy.findMany({ orderBy: [{ sector: 'asc' }, { battalion: 'asc' }, { bop: 'asc' }] });
  const nested: Record<string, Record<string, { BOPs: string[] }>> = {};
  for (const r of rows) ((nested[r.sector] ??= {})[r.battalion] ??= { BOPs: [] }).BOPs.push(r.bop);
  return { hq: 'HQ', hierarchy: nested, units: rows.map(({ sector, battalion, bop }) => ({ sector, battalion, bop })) };
}

export async function createOrgUnit(admin: AuthUser, unit: { sector: string; battalion: string; bop: string }, ctx: RequestContext) {
  const rows = await prisma.orgHierarchy.findMany();
  if (rows.some((r) => r.bop === unit.bop)) throw new AppError(409, 'DUPLICATE', `${unit.bop} already exists`);
  // A battalion belongs to exactly one sector
  const parent = rows.find((r) => r.battalion === unit.battalion);
  if (parent && parent.sector !== unit.sector) {
    throw new AppError(409, 'HIERARCHY_CONFLICT', `${unit.battalion} belongs to ${parent.sector}, not ${unit.sector}`);
  }
  // Names must be unambiguous across levels, because user scopes are matched by name
  const clash = rows.find((r) => r.sector === unit.battalion || r.sector === unit.bop || r.battalion === unit.sector || r.battalion === unit.bop || r.bop === unit.sector || r.bop === unit.battalion);
  if (clash || [unit.sector, unit.battalion, unit.bop].includes('HQ')) {
    throw new AppError(409, 'HIERARCHY_CONFLICT', 'Sector, battalion and BOP names must be distinct from each other and from "HQ"');
  }

  await prisma.orgHierarchy.create({ data: { hq: 'HQ', ...unit } });
  invalidateOrgCache();
  await audit(admin, 'ORG_UNIT_CREATE', `${unit.sector} / ${unit.battalion} / ${unit.bop}`, ctx);
  return getOrgHierarchy();
}

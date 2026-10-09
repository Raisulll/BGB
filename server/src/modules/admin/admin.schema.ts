import { z } from 'zod';
import { PAGE_IDS } from '../../utils/roles.js';

export const updateConfigSchema = z
  .object({ values: z.record(z.string().max(100), z.union([z.string().max(100), z.number(), z.boolean()])) })
  .strict()
  .refine((b) => Object.keys(b.values).length > 0, 'No settings supplied');

const role = z.string().trim().min(1).max(50);

// Either toggle one page (what the Admin panel's matrix does) or replace a role's whole set
export const updatePermissionsSchema = z.union([
  z.object({ role, pageId: z.enum(PAGE_IDS), enabled: z.boolean() }).strict(),
  z.object({ role, permissions: z.array(z.enum(PAGE_IDS)).max(PAGE_IDS.length) }).strict(),
]);

const label = (max: number) => z.string().trim().min(1).max(max);

export const createCategorySchema = z
  .object({ name: label(100), subcategories: z.array(label(100)).max(50).default([]) })
  .strict();

export const updateCategorySchema = z
  .object({
    name: label(100),
    isActive: z.boolean(),
    addSubcategories: z.array(label(100)).max(50),
    subcategoryStatus: z.array(z.object({ name: label(100), isActive: z.boolean() }).strict()).max(50),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'No changes supplied');

export const createOrgUnitSchema = z.object({ sector: label(50), battalion: label(50), bop: label(100) }).strict();

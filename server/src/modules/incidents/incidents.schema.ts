import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';
import { SEVERITIES, STATUSES } from './workflow.js';

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional().transform((v) => (v ? v : null));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

// Specs #5, #7, #8, #9 — every field the 3-step form captures
const incidentFields = {
  title: trimmed(255).min(3),
  category: trimmed(100).min(1),
  subcategory: optionalText(100),
  severity: z.enum(SEVERITIES),
  date: isoDate,
  time: hhmm,
  location: optionalText(255),
  sector: trimmed(50).min(1),
  battalion: trimmed(50).min(1),
  bop: trimmed(100).min(1),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  description: trimmed(10_000).min(10),
  personsInvolved: optionalText(5_000),
  actionTaken: optionalText(5_000),
  outcome: optionalText(5_000),
};

export const createIncidentSchema = z
  .object({
    ...incidentFields,
    // The form offers "Save as draft" or "Submit"
    status: z.enum(['Draft', 'Submitted']).default('Draft'),
  })
  .strict();

// PATCH: any subset of the fields. Status changes go through the workflow endpoints.
// A reviewer modifying someone else's report (spec #14) must give a reason.
export const updateIncidentSchema = z
  .object(incidentFields)
  .partial()
  .extend({ reason: trimmed(2_000).optional() })
  .strict();

// Duplicate check while filing (GET /incidents/similar)
export const similarQuerySchema = z.object({
  date: isoDate,
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  bop: trimmed(100).optional(),
  category: trimmed(100).optional(),
  excludeId: z.string().regex(/^BIRDS-\d{4}-\d{4,}$/).optional(),
});

export const commentSchema = z.object({ body: trimmed(4_000).pipe(z.string().min(1, 'Comment is empty')) }).strict();

export const workflowActionSchema = z.object({ notes: trimmed(2_000).optional() }).strict();

const csv = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)));

// Spec #15, #16 — search & filter
export const listIncidentsSchema = paginationSchema.extend({
  q: trimmed(200).optional(), // reference number, title, description, location
  status: csv(STATUSES).optional(),
  severity: csv(SEVERITIES).optional(),
  category: trimmed(100).optional(),
  subcategory: trimmed(100).optional(), // incident type (spec #16)
  sector: trimmed(50).optional(),
  battalion: trimmed(50).optional(),
  bop: trimmed(100).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  createdBy: trimmed(10).optional(), // user id, or "me"
  // "Needs my action": incidents the caller can act on now, plus their own Returned reports
  needsAction: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  // Waiting longer than the workflow.overdue_days setting in their current step
  overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  // Spec #45 — archived records: lists exclude them unless asked; statistics include them
  archived: z.enum(['exclude', 'include', 'only']).optional(),
  sort: z.enum(['createdAt', 'incidentDate', 'id']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ListIncidentsQuery = z.infer<typeof listIncidentsSchema>;

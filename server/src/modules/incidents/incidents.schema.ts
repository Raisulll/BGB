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
export const updateIncidentSchema = z.object(incidentFields).partial().strict();

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
  sector: trimmed(50).optional(),
  battalion: trimmed(50).optional(),
  bop: trimmed(100).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  createdBy: trimmed(10).optional(), // user id, or "me"
  sort: z.enum(['createdAt', 'incidentDate', 'id']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ListIncidentsQuery = z.infer<typeof listIncidentsSchema>;

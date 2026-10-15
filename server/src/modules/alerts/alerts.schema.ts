import { z } from 'zod';

// Flash Alert (spec #23/#58 extension) — request validation
export const FLASH_THREATS = ['illegal_crossing', 'smuggling', 'armed_group', 'trafficking', 'wanted_person', 'other'] as const;
export const FLASH_PRIORITIES = ['flash', 'immediate'] as const;
export const VALID_HOURS = [6, 12, 24, 48, 72, 168] as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

// Sent as the multipart field "data" (JSON) next to the files
export const raiseAlertSchema = z
  .object({
    title: text(5, 200),
    threatType: z.enum(FLASH_THREATS),
    priority: z.enum(FLASH_PRIORITIES).default('flash'),
    subjectName: optionalText(200),
    subjectDescription: optionalText(4_000),
    details: text(20, 10_000),
    instructions: text(5, 4_000),
    lastSeenAt: z.string().datetime({ offset: true }).optional().nullable(),
    lastSeenPlace: optionalText(255),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    // Empty: every unit in the country
    targetSectors: z.array(text(1, 50)).max(50).default([]),
    validHours: z.coerce.number().refine((h) => (VALID_HOURS as readonly number[]).includes(h), 'Choose one of the offered validity periods'),
    incidentId: z
      .string()
      .regex(/^BIRDS-\d{4}-\d{4,}$/)
      .optional()
      .nullable(),
    // The sender confirms the information is genuine and that a false alert is an offence
    declaration: z.literal(true, { message: 'The declaration must be accepted to raise a Flash Alert' }),
  })
  .strict()
  .refine((v) => (v.lat == null) === (v.lng == null), { message: 'Give both latitude and longitude, or neither', path: ['lat'] });

export const alertNoteSchema = z.object({ notes: text(3, 4_000) }).strict();
export const alertUpdateSchema = z.object({ body: text(3, 4_000) }).strict();

export const listAlertsSchema = z.object({
  state: z.enum(['active', 'closed', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const previewSchema = z.object({
  sectors: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [])),
});

export type RaiseAlertInput = z.infer<typeof raiseAlertSchema>;

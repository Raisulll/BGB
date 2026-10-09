import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,50}$/, 'Username: 3–50 characters, lowercase letters, digits, "_" or "."');

export const createUserSchema = z
  .object({
    username,
    name: z.string().trim().min(2).max(100),
    role: z.string().trim().min(1).max(50),
    scope: z.string().trim().min(1).max(100),
    email: z.email().max(150).transform((e) => e.toLowerCase()),
    // Omit to have the server generate a temporary password (returned once; change forced at first login)
    password: z.string().min(1).max(128).optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    role: z.string().trim().min(1).max(50),
    scope: z.string().trim().min(1).max(100),
    email: z.email().max(150).transform((e) => e.toLowerCase()),
    isActive: z.boolean(),
    unlock: z.literal(true), // clear a failed-login lockout
  })
  .partial()
  .strict();

export const listUsersSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.string().trim().max(50).optional(),
  active: z.enum(['true', 'false']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersSchema>;

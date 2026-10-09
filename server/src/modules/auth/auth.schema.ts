import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

export const adminResetPasswordSchema = z.object({
  userId: z.string().trim().min(1).max(10),
  // Omit to have the server generate a policy-compliant temporary password
  temporaryPassword: z.string().min(1).max(128).optional(),
});

import { z } from 'zod';

// §26 — offset pagination, default 25, max 100.
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const toSkipTake = ({ page, pageSize }: Pagination) => ({ skip: (page - 1) * pageSize, take: pageSize });

export const paged = <T>(data: T[], total: number, { page, pageSize }: Pagination) => ({
  data,
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { notFound } from '../../utils/errors.js';
import { paged, paginationSchema, toSkipTake } from '../../utils/pagination.js';

// §19.6 — /api/v1/notifications (spec #23). Every user sees only their own notifications;
// the frontend polls GET / every 30 s (§23).
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, apiLimiter);

const listSchema = paginationSchema.extend({ unread: z.enum(['true', 'false']).optional() });

notificationsRouter.get('/', async (req, res) => {
  const q = listSchema.parse(req.query);
  const userId = req.user!.id;
  const where = { userId, ...(q.unread === 'true' ? { isRead: false } : {}) };
  const [rows, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...toSkipTake(q) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  res.json({
    ...paged(
      rows.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.isRead,
        incidentId: n.incidentId,
        conversationId: n.conversationId,
        createdAt: n.createdAt.toISOString(),
      })),
      total,
      q,
    ),
    unreadCount,
  });
});

notificationsRouter.patch('/read-all', async (req, res) => {
  const { count } = await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true } });
  res.json({ updated: count });
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Notification not found');
  // Scoped to the caller: someone else's notification is simply "not found"
  const { count } = await prisma.notification.updateMany({ where: { id, userId: req.user!.id }, data: { isRead: true } });
  if (count === 0) throw notFound('Notification not found');
  res.status(204).end();
});

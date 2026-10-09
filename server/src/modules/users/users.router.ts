import { Router, type Request } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { notFound } from '../../utils/errors.js';
import { requestContext } from '../../utils/requestContext.js';
import { createUserSchema, listUsersSchema, updateUserSchema } from './users.schema.js';
import * as service from './users.service.js';

// §19.2 — /api/v1/users (admin only)
export const usersRouter = Router();
usersRouter.use(requireAuth, apiLimiter, requirePermission('admin'));

function userId(req: Request) {
  const id = String(req.params.id ?? '');
  if (!/^U\d{3,}$/.test(id)) throw notFound('User not found');
  return id;
}

usersRouter.get('/', async (req, res) => {
  res.json(await service.listUsers(listUsersSchema.parse(req.query)));
});

usersRouter.post('/', async (req, res) => {
  res.status(201).json(await service.createUser(req.user!, createUserSchema.parse(req.body), requestContext(req)));
});

usersRouter.get('/:id', async (req, res) => {
  res.json(await service.getUser(userId(req)));
});

usersRouter.patch('/:id', async (req, res) => {
  res.json(await service.updateUser(req.user!, userId(req), updateUserSchema.parse(req.body), requestContext(req)));
});

// Soft-deactivate: users are never hard-deleted
usersRouter.delete('/:id', async (req, res) => {
  res.json(await service.deactivateUser(req.user!, userId(req), requestContext(req)));
});

import { credentialsSchema, type PublicUser } from '@mdiw/shared';
import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { asyncHandler } from '../http/async-handler.js';
import { AppError, conflict, unauthenticated } from '../http/errors.js';
import { authLimiter } from '../http/rate-limit.js';
import { validate } from '../http/validate.js';
import { currentUserId, requireAuth } from './require-auth.js';

const BCRYPT_ROUNDS = 12;

function toPublicUser(row: { id: string; email: string; createdAt: Date }): PublicUser {
  return { id: row.id, email: row.email, createdAt: row.createdAt.toISOString() };
}

/** Rotates the session id so a pre-login cookie cannot be replayed. */
async function startSession(req: Request, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.userId = userId;
  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate('body', credentialsSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      throw conflict('An account with that email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email, createdAt: users.createdAt });

    if (!created) {
      throw new AppError(500, 'INTERNAL_ERROR', 'The account could not be created.');
    }

    await startSession(req, created.id);
    res.status(201).json(toPublicUser(created));
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate('body', credentialsSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Hash a dummy value when the account is unknown so timing does not leak it.
    const hash = user?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000';
    const matches = await bcrypt.compare(password, hash);

    if (!user || !matches) {
      throw unauthenticated('Email or password is incorrect.');
    }

    await startSession(req, user.id);
    res.json(toPublicUser(user));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
    res.clearCookie('mdiw.sid', { path: '/' });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw unauthenticated();
    }
    res.json(toPublicUser(user));
  }),
);

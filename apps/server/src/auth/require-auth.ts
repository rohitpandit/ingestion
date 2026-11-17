import type { Request, RequestHandler } from 'express';
import { unauthenticated } from '../http/errors.js';

export interface AuthedRequest extends Request {
  userId: string;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const userId = req.session.userId;
  if (!userId) {
    next(unauthenticated());
    return;
  }
  (req as AuthedRequest).userId = userId;
  next();
};

/** Narrow helper so route handlers avoid repeating the cast. */
export function currentUserId(req: Request): string {
  const userId = (req as AuthedRequest).userId ?? req.session.userId;
  if (!userId) {
    throw unauthenticated();
  }
  return userId;
}

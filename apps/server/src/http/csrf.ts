import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { forbidden } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The session cookie is SameSite=Lax, which already blocks cross-site POSTs from
 * forms. This adds a second check: state-changing requests must declare an
 * Origin (or Referer) that matches the configured web origin.
 */
export function originCheck(): RequestHandler {
  const allowed = new Set([env.WEB_ORIGIN]);

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    if (origin) {
      if (!allowed.has(origin)) {
        next(forbidden('Request origin is not allowed.'));
        return;
      }
      next();
      return;
    }

    const referer = req.get('referer');
    if (referer) {
      try {
        if (!allowed.has(new URL(referer).origin)) {
          next(forbidden('Request origin is not allowed.'));
          return;
        }
      } catch {
        next(forbidden('Request origin is not allowed.'));
        return;
      }
      next();
      return;
    }

    next(forbidden('A matching Origin header is required for this request.'));
  };
}

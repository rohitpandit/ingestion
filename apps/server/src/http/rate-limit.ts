import rateLimit, { type Options } from 'express-rate-limit';

const shared: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' },
    });
  },
};

/** Credential endpoints: tight, keyed by IP. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

/** Uploads are expensive to process, so they get their own budget per session. */
export const uploadLimiter = rateLimit({
  ...shared,
  windowMs: 10 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.session?.userId ?? req.ip ?? 'anonymous',
});

export const analysisLimiter = rateLimit({
  ...shared,
  windowMs: 10 * 60 * 1000,
  limit: 120,
  keyGenerator: (req) => req.session?.userId ?? req.ip ?? 'anonymous',
});

export const generalLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 600,
});

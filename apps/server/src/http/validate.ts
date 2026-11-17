import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError } from './errors.js';

type Source = 'body' | 'query' | 'params';

function flatten(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Replaces the raw request slice with the parsed value, so handlers only ever
 * see data that matched the shared schema.
 */
export function validate(source: Source, schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(
        new AppError(400, 'VALIDATION_FAILED', 'The request did not pass validation.', flatten(result.error)),
      );
      return;
    }
    if (source === 'query') {
      // req.query is a getter in Express 5-style setups; mutate in place instead.
      Object.assign(req.query as Record<string, unknown>, result.data);
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

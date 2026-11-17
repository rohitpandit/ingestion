import type { ErrorCode } from '@mdiw/shared';

/** Any error the API is willing to describe to the client. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthenticated = (message = 'You must sign in to continue.'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource.'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found.'): AppError =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string): AppError => new AppError(409, 'CONFLICT', message);

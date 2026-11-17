import type { ErrorCode } from '@mdiw/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from './errors.js';

/** Terminal middleware: nothing leaves the API except the agreed envelope. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let status = 500;
  let code: ErrorCode = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details: unknown;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof multer.MulterError) {
    status = 400;
    if (error.code === 'LIMIT_FILE_SIZE') {
      code = 'TOO_LARGE';
      message = 'One of the files exceeds the maximum upload size.';
    } else if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      code = 'TOO_MANY_FILES';
      message = 'Too many files in a single upload.';
    } else {
      code = 'BAD_REQUEST';
      message = 'The upload could not be read.';
    }
  } else if (error instanceof SyntaxError && 'body' in error) {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'The request body is not valid JSON.';
  }

  if (status >= 500) {
    console.error('[error]', error);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint.' } });
};

import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { authRouter } from '../auth/routes.js';
import { sessionMiddleware } from '../auth/session.js';
import { env } from '../config/env.js';
import { analysesRouter } from '../modules/analyses/routes.js';
import { documentsRouter } from '../modules/documents/routes.js';
import { workspacesRouter } from '../modules/workspaces/routes.js';
import { originCheck } from './csrf.js';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { generalLimiter } from './rate-limit.js';

export function createApp(): Express {
  const app = express();

  // Behind the Vite dev proxy and any production reverse proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '128kb' }));
  app.use(sessionMiddleware());
  app.use(generalLimiter);
  app.use(originCheck());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', provider: env.LLM_PROVIDER });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api', documentsRouter);
  app.use('/api', analysesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

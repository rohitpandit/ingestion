import connectPgSimple from 'connect-pg-simple';
import type { RequestHandler } from 'express';
import session from 'express-session';
import { env } from '../config/env.js';
import { pool } from '../db/client.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const PgStore = connectPgSimple(session);

export function sessionMiddleware(): RequestHandler {
  return session({
    name: 'mdiw.sid',
    store: new PgStore({
      pool,
      tableName: 'session',
      // The table ships with the Drizzle migrations.
      createTableIfMissing: false,
      pruneSessionInterval: 60 * 15,
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      maxAge: 1000 * 60 * 60 * 12,
      path: '/',
    },
  });
}

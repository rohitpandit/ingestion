import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters.'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  LLM_PROVIDER: z.enum(['mock']).default('mock'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  uploadDir: path.resolve(process.cwd(), parsed.data.UPLOAD_DIR),
};

export type Env = typeof env;

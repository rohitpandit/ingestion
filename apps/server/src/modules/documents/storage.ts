import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

/**
 * Uploads live outside any statically served directory and are addressed by a
 * generated id. The user's filename is metadata only and never touches a path.
 */
export async function ensureUploadRoot(): Promise<void> {
  await mkdir(env.uploadDir, { recursive: true, mode: 0o700 });
}

export interface StoredFile {
  storageKey: string;
  sha256: string;
}

export async function storeFile(userId: string, buffer: Buffer): Promise<StoredFile> {
  const directory = path.join(env.uploadDir, userId);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const storageKey = path.join(directory, randomUUID());
  await writeFile(storageKey, buffer, { mode: 0o600 });

  return {
    storageKey,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export async function deleteFile(storageKey: string): Promise<void> {
  // A missing file must not block deleting its database row.
  await rm(storageKey, { force: true }).catch(() => undefined);
}

/** Keeps a display name safe to render and store without path semantics. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001F\u007F]/g, '');
  const cleaned = base.replace(/[^A-Za-z0-9._ ()\-]/g, '_').trim();
  return (cleaned.length > 0 ? cleaned : 'document').slice(0, 200);
}

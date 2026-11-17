import { and, count, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { analyses, documents, workspaces, type WorkspaceRow } from '../../db/schema.js';
import { notFound } from '../../http/errors.js';

/**
 * Every workspace lookup is scoped by user id, so ownership is enforced in one
 * place rather than at each call site.
 */
export async function requireWorkspace(workspaceId: string, userId: string): Promise<WorkspaceRow> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);

  if (!workspace) {
    throw notFound('Workspace not found.');
  }
  return workspace;
}

export async function touchWorkspace(workspaceId: string): Promise<void> {
  await db.update(workspaces).set({ updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
}

export async function countDocuments(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId));
  return row?.value ?? 0;
}

export async function countAnalyses(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(analyses)
    .where(eq(analyses.workspaceId, workspaceId));
  return row?.value ?? 0;
}

import { createWorkspaceSchema, idParamSchema, type WorkspaceSummary } from '@mdiw/shared';
import { Router } from 'express';
import { and, count, countDistinct, desc, eq } from 'drizzle-orm';
import { currentUserId, requireAuth } from '../../auth/require-auth.js';
import { db } from '../../db/client.js';
import { analyses, documents, workspaces } from '../../db/schema.js';
import { asyncHandler } from '../../http/async-handler.js';
import { validate } from '../../http/validate.js';
import { deleteFile } from '../documents/storage.js';
import { listWorkspaceDocuments } from '../documents/service.js';
import { toDocumentSummary } from '../documents/serialize.js';
import { requireWorkspace } from './service.js';

export const workspacesRouter: Router = Router();

workspacesRouter.use(requireAuth);

workspacesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);

    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
        documentCount: countDistinct(documents.id),
        analysisCount: countDistinct(analyses.id),
      })
      .from(workspaces)
      .leftJoin(documents, eq(documents.workspaceId, workspaces.id))
      .leftJoin(analyses, eq(analyses.workspaceId, workspaces.id))
      .where(eq(workspaces.userId, userId))
      .groupBy(workspaces.id)
      .orderBy(desc(workspaces.updatedAt));

    const payload: WorkspaceSummary[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      documentCount: Number(row.documentCount),
      analysisCount: Number(row.analysisCount),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    res.json(payload);
  }),
);

workspacesRouter.post(
  '/',
  validate('body', createWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const { name } = req.body as { name: string };

    const [created] = await db.insert(workspaces).values({ userId, name }).returning();
    if (!created) throw new Error('Workspace insert returned no row.');

    res.status(201).json({
      id: created.id,
      name: created.name,
      documentCount: 0,
      analysisCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    } satisfies WorkspaceSummary);
  }),
);

workspacesRouter.get(
  '/:id',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const workspace = await requireWorkspace(req.params.id as string, userId);

    const rows = await listWorkspaceDocuments(workspace.id);

    const [analysisCount] = await db
      .select({ value: count() })
      .from(analyses)
      .where(eq(analyses.workspaceId, workspace.id));

    res.json({
      id: workspace.id,
      name: workspace.name,
      documentCount: rows.length,
      analysisCount: analysisCount?.value ?? 0,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
      documents: rows.map((row) => toDocumentSummary(row.document, row.factCount)),
    });
  }),
);

workspacesRouter.delete(
  '/:id',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const workspace = await requireWorkspace(req.params.id as string, userId);

    const stored = await db
      .select({ storageKey: documents.storageKey })
      .from(documents)
      .where(eq(documents.workspaceId, workspace.id));

    await db
      .delete(workspaces)
      .where(and(eq(workspaces.id, workspace.id), eq(workspaces.userId, userId)));

    await Promise.all(stored.map((row) => deleteFile(row.storageKey)));

    res.status(204).end();
  }),
);

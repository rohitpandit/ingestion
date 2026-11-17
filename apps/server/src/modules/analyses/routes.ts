import {
  createAnalysisSchema,
  idParamSchema,
  type AnalysisDetail,
  type AnalysisStatus,
  type AnalysisSummary,
} from '@mdiw/shared';
import { Router } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { currentUserId, requireAuth } from '../../auth/require-auth.js';
import { db } from '../../db/client.js';
import { analyses, documents, type AnalysisRow } from '../../db/schema.js';
import { asyncHandler } from '../../http/async-handler.js';
import { AppError, notFound } from '../../http/errors.js';
import { analysisLimiter } from '../../http/rate-limit.js';
import { validate } from '../../http/validate.js';
import { enqueueAnalysis } from '../../jobs/queue.js';
import { requireWorkspace, touchWorkspace } from '../workspaces/service.js';

function toSummary(row: AnalysisRow): AnalysisSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    prompt: row.prompt,
    status: row.status as AnalysisStatus,
    documentIds: row.documentIds,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toDetail(row: AnalysisRow): AnalysisDetail {
  return { ...toSummary(row), result: row.result ?? null };
}

export const analysesRouter: Router = Router();
analysesRouter.use(requireAuth);

analysesRouter.post(
  '/workspaces/:id/analyses',
  analysisLimiter,
  validate('params', idParamSchema),
  validate('body', createAnalysisSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const workspace = await requireWorkspace(req.params.id as string, userId);
    const { prompt, documentIds } = req.body as { prompt: string; documentIds: string[] };

    const selected = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.workspaceId, workspace.id), inArray(documents.id, documentIds)));

    if (selected.length !== documentIds.length) {
      throw notFound('One or more selected documents are not in this workspace.');
    }
    if (!selected.some((row) => row.status === 'ready')) {
      throw new AppError(
        400,
        'NO_READY_DOCUMENTS',
        'None of the selected documents have finished processing successfully.',
      );
    }

    const [created] = await db
      .insert(analyses)
      .values({ workspaceId: workspace.id, userId, prompt, documentIds, status: 'queued' })
      .returning();

    if (!created) throw new AppError(500, 'INTERNAL_ERROR', 'The analysis could not be queued.');

    await touchWorkspace(workspace.id);
    enqueueAnalysis(created.id);

    res.status(202).json(toSummary(created));
  }),
);

analysesRouter.get(
  '/workspaces/:id/analyses',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const workspace = await requireWorkspace(req.params.id as string, userId);

    const rows = await db
      .select()
      .from(analyses)
      .where(eq(analyses.workspaceId, workspace.id))
      .orderBy(desc(analyses.createdAt));

    res.json(rows.map(toSummary));
  }),
);

analysesRouter.get(
  '/analyses/:id',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const [row] = await db
      .select()
      .from(analyses)
      .where(and(eq(analyses.id, req.params.id as string), eq(analyses.userId, userId)))
      .limit(1);

    if (!row) throw notFound('Analysis not found.');
    res.json(toDetail(row));
  }),
);

analysesRouter.delete(
  '/analyses/:id',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const [row] = await db
      .select({ id: analyses.id })
      .from(analyses)
      .where(and(eq(analyses.id, req.params.id as string), eq(analyses.userId, userId)))
      .limit(1);

    if (!row) throw notFound('Analysis not found.');
    await db.delete(analyses).where(eq(analyses.id, row.id));
    res.status(204).end();
  }),
);

import {
  LIMITS,
  idParamSchema,
  type UploadRejection,
  type UploadResponse,
} from '@mdiw/shared';
import { Router } from 'express';
import { and, count, eq } from 'drizzle-orm';
import multer from 'multer';
import { currentUserId, requireAuth } from '../../auth/require-auth.js';
import { db } from '../../db/client.js';
import { documents, extractedFacts } from '../../db/schema.js';
import { asyncHandler } from '../../http/async-handler.js';
import { AppError, notFound } from '../../http/errors.js';
import { uploadLimiter } from '../../http/rate-limit.js';
import { validate } from '../../http/validate.js';
import { enqueueDocument } from '../../jobs/queue.js';
import { requireWorkspace, touchWorkspace } from '../workspaces/service.js';
import { toDocumentDetail, toDocumentSummary } from './serialize.js';
import { listWorkspaceDocuments } from './service.js';
import { deleteFile, sanitizeFilename, storeFile } from './storage.js';
import { validateUpload } from './validate-upload.js';

// Files are buffered in memory so their contents can be inspected before
// anything is written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITS.maxFileBytes,
    files: LIMITS.maxFilesPerRequest,
  },
});

export const documentsRouter: Router = Router();
documentsRouter.use(requireAuth);

documentsRouter.post(
  '/workspaces/:id/documents',
  uploadLimiter,
  validate('params', idParamSchema),
  upload.array('files', LIMITS.maxFilesPerRequest),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const workspace = await requireWorkspace(req.params.id as string, userId);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (files.length === 0) {
      throw new AppError(400, 'BAD_REQUEST', 'No files were uploaded.');
    }

    const [existing] = await db
      .select({ value: count() })
      .from(documents)
      .where(eq(documents.workspaceId, workspace.id));
    let remaining = LIMITS.maxDocumentsPerWorkspace - Number(existing?.value ?? 0);

    const accepted: UploadResponse['accepted'] = [];
    const rejected: UploadRejection[] = [];

    for (const file of files) {
      const originalName = sanitizeFilename(file.originalname);

      if (remaining <= 0) {
        rejected.push({
          originalName,
          code: 'WORKSPACE_FULL',
          message: `A workspace can hold at most ${LIMITS.maxDocumentsPerWorkspace} documents.`,
        });
        continue;
      }

      const outcome = validateUpload({
        originalName,
        mimetype: file.mimetype,
        buffer: file.buffer,
        size: file.size,
      });

      if (!outcome.ok) {
        rejected.push({ originalName, code: outcome.code, message: outcome.message });
        continue;
      }

      const stored = await storeFile(userId, file.buffer);

      const [duplicate] = await db
        .select({ id: documents.id, originalName: documents.originalName })
        .from(documents)
        .where(and(eq(documents.workspaceId, workspace.id), eq(documents.sha256, stored.sha256)))
        .limit(1);

      const [created] = await db
        .insert(documents)
        .values({
          workspaceId: workspace.id,
          userId,
          originalName,
          storageKey: stored.storageKey,
          kind: outcome.kind,
          mime: outcome.mime,
          sizeBytes: file.size,
          sha256: stored.sha256,
          status: 'queued',
          warnings: duplicate
            ? [
                {
                  code: 'DUPLICATE_CONTENT',
                  message: `This file has the same contents as ${duplicate.originalName}.`,
                },
              ]
            : [],
        })
        .returning();

      if (!created) {
        await deleteFile(stored.storageKey);
        rejected.push({
          originalName,
          code: 'INTERNAL_ERROR',
          message: 'The document could not be saved.',
        });
        continue;
      }

      remaining -= 1;
      accepted.push(toDocumentSummary(created, 0));
      enqueueDocument(created.id);
    }

    await touchWorkspace(workspace.id);

    const payload: UploadResponse = { accepted, rejected };
    res.status(accepted.length > 0 ? 201 : 400).json(payload);
  }),
);

documentsRouter.get(
  '/workspaces/:id/documents',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const workspace = await requireWorkspace(req.params.id as string, userId);

    const rows = await listWorkspaceDocuments(workspace.id);
    res.json(rows.map((row) => toDocumentSummary(row.document, row.factCount)));
  }),
);

documentsRouter.get(
  '/documents/:id',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const [row] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id as string), eq(documents.userId, userId)))
      .limit(1);

    if (!row) throw notFound('Document not found.');

    const facts = await db
      .select()
      .from(extractedFacts)
      .where(eq(extractedFacts.documentId, row.id));

    res.json(toDocumentDetail(row, facts));
  }),
);

documentsRouter.delete(
  '/documents/:id',
  validate('params', idParamSchema),
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const [row] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id as string), eq(documents.userId, userId)))
      .limit(1);

    if (!row) throw notFound('Document not found.');

    await db.delete(documents).where(eq(documents.id, row.id));
    await deleteFile(row.storageKey);
    await touchWorkspace(row.workspaceId);

    res.status(204).end();
  }),
);

import { z } from 'zod';
import { LIMITS } from './limits.js';
import { documentSummarySchema } from './documents.js';

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters.')
    .max(200, 'Password must be at most 200 characters.'),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const workspaceSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  documentCount: z.number().int().nonnegative(),
  analysisCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const workspaceDetailSchema = workspaceSummarySchema.extend({
  documents: z.array(documentSummarySchema),
});
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;

export const createAnalysisSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(LIMITS.promptMinChars, 'Describe the analysis you need.')
    .max(LIMITS.promptMaxChars, 'Instruction is too long.'),
  documentIds: z
    .array(z.string().uuid())
    .min(1, 'Select at least one document.')
    .max(LIMITS.maxDocumentsPerAnalysis, 'Too many documents selected.'),
});
export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>;

/** Per-file outcome of a multipart upload; rejected files never reach the queue. */
export const uploadRejectionSchema = z.object({
  originalName: z.string(),
  code: z.string(),
  message: z.string(),
});
export type UploadRejection = z.infer<typeof uploadRejectionSchema>;

export const uploadResponseSchema = z.object({
  accepted: z.array(documentSummarySchema),
  rejected: z.array(uploadRejectionSchema),
});
export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const EXAMPLE_INSTRUCTIONS = [
  'Compare the information across all uploaded documents.',
  'Identify inconsistencies between the application form and supporting documents.',
  'Extract key dates, obligations, financial values, and missing information.',
  'Compare the financial position of the companies represented in the documents.',
  'Highlight discrepancies in names, addresses, licence details, or revenue figures.',
] as const;

import type {
  AnalysisDetail,
  AnalysisSummary,
  CreateAnalysisInput,
  DocumentDetail,
  DocumentSummary,
  ErrorCode,
  PublicUser,
  UploadResponse,
  WorkspaceDetail,
  WorkspaceSummary,
} from '@mdiw/shared';

const BASE = '/api';

/** Mirrors the API error envelope so the UI can react to specific codes. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly details: unknown;

  constructor(status: number, code: ErrorCode | 'NETWORK_ERROR', message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code: ErrorCode; message: string; details?: unknown } } | null)?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'The request failed.',
      error?.details,
    );
  }

  return payload as T;
}

export const api = {
  me: () => request<PublicUser>('/auth/me'),
  login: (email: string, password: string) =>
    request<PublicUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<PublicUser>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  listWorkspaces: () => request<WorkspaceSummary[]>('/workspaces'),
  createWorkspace: (name: string) =>
    request<WorkspaceSummary>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  getWorkspace: (id: string) => request<WorkspaceDetail>(`/workspaces/${id}`),
  deleteWorkspace: (id: string) => request<void>(`/workspaces/${id}`, { method: 'DELETE' }),

  listDocuments: (workspaceId: string) => request<DocumentSummary[]>(`/workspaces/${workspaceId}/documents`),
  getDocument: (id: string) => request<DocumentDetail>(`/documents/${id}`),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  uploadDocuments: (workspaceId: string, files: File[]) => {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    return request<UploadResponse>(`/workspaces/${workspaceId}/documents`, { method: 'POST', body });
  },

  listAnalyses: (workspaceId: string) => request<AnalysisSummary[]>(`/workspaces/${workspaceId}/analyses`),
  createAnalysis: (workspaceId: string, input: CreateAnalysisInput) =>
    request<AnalysisSummary>(`/workspaces/${workspaceId}/analyses`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getAnalysis: (id: string) => request<AnalysisDetail>(`/analyses/${id}`),
  deleteAnalysis: (id: string) => request<void>(`/analyses/${id}`, { method: 'DELETE' }),
};

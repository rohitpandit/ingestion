import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiRequestError } from '../api/client.js';
import { AnalysisHistory } from '../components/AnalysisHistory.js';
import { DocumentDrawer } from '../components/DocumentDrawer.js';
import { DocumentList } from '../components/DocumentList.js';
import { PromptPanel } from '../components/PromptPanel.js';
import { Spinner } from '../components/Spinner.js';
import { UploadDropzone } from '../components/UploadDropzone.js';
import { AnalysisResultView } from '../results/AnalysisResultView.js';

const POLL_MS = 1_500;

export function WorkspacePage(): JSX.Element {
  const { workspaceId = '' } = useParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const workspace = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.getWorkspace(workspaceId),
  });

  // Poll while anything is still in flight, then fall still.
  const documents = useQuery({
    queryKey: ['documents', workspaceId],
    queryFn: () => api.listDocuments(workspaceId),
    refetchInterval: (query) =>
      query.state.data?.some((document) => document.status === 'queued' || document.status === 'processing')
        ? POLL_MS
        : false,
  });

  const analyses = useQuery({
    queryKey: ['analyses', workspaceId],
    queryFn: () => api.listAnalyses(workspaceId),
    refetchInterval: (query) =>
      query.state.data?.some((analysis) => analysis.status === 'queued' || analysis.status === 'processing')
        ? POLL_MS
        : false,
  });

  const activeAnalysis = useQuery({
    queryKey: ['analysis', activeAnalysisId],
    queryFn: () => api.getAnalysis(activeAnalysisId as string),
    enabled: activeAnalysisId !== null,
    refetchInterval: (query) =>
      query.state.data && (query.state.data.status === 'queued' || query.state.data.status === 'processing')
        ? POLL_MS
        : false,
  });

  const readyDocuments = useMemo(
    () => (documents.data ?? []).filter((document) => document.status === 'ready'),
    [documents.data],
  );

  // Newly processed documents join the selection; removed ones drop out.
  useEffect(() => {
    setSelected((current) => {
      const next = new Set<string>();
      for (const document of readyDocuments) {
        if (current.has(document.id) || current.size === 0) next.add(document.id);
      }
      return next;
    });
  }, [readyDocuments]);

  useEffect(() => {
    if (activeAnalysisId === null && analyses.data && analyses.data.length > 0) {
      setActiveAnalysisId(analyses.data[0]?.id ?? null);
    }
  }, [analyses.data, activeAnalysisId]);

  const run = useMutation({
    mutationFn: (prompt: string) =>
      api.createAnalysis(workspaceId, { prompt, documentIds: Array.from(selected) }),
    onSuccess: (created) => {
      setRunError(null);
      setActiveAnalysisId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['analyses', workspaceId] });
    },
    onError: (caught: unknown) =>
      setRunError(caught instanceof ApiRequestError ? caught.message : 'The analysis could not be started.'),
  });

  if (workspace.isLoading) {
    return <Spinner label="Loading workspace" />;
  }

  if (workspace.isError) {
    return (
      <div className="panel p-6 text-sm text-slate-400">
        This workspace could not be loaded.{' '}
        <Link className="text-sky-400 hover:underline" to="/">
          Back to workspaces
        </Link>
      </div>
    );
  }

  const analysis = activeAnalysis.data;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="order-2 space-y-5 lg:order-1">
        {analysis?.status === 'failed' ? (
          <p className="panel border-rose-500/40 p-4 text-sm text-rose-300">
            {analysis.error ?? 'The analysis failed.'}
          </p>
        ) : null}

        {analysis && (analysis.status === 'queued' || analysis.status === 'processing') ? (
          <div className="panel p-6">
            <Spinner label="Analysing documents" />
          </div>
        ) : null}

        {analysis?.result ? <AnalysisResultView result={analysis.result} /> : null}

        {!analysis ? (
          <div className="panel p-6 text-sm text-slate-400">
            Upload documents, write an instruction, and run an analysis to see results here.
          </div>
        ) : null}
      </div>

      <div className="order-1 space-y-5 lg:order-2">
        <div>
          <Link className="inline-flex min-h-[24px] items-center text-xs text-slate-400 hover:text-slate-200" to="/">
            ← All workspaces
          </Link>
          <h1 className="mt-1 text-base font-semibold text-white">{workspace.data?.name}</h1>
        </div>

        <UploadDropzone workspaceId={workspaceId} />

        <PromptPanel
          selectedCount={selected.size}
          busy={run.isPending}
          error={runError}
          onRun={(prompt) => run.mutate(prompt)}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Documents</h2>
            {documents.isFetching ? <Spinner /> : null}
          </div>
          <DocumentList
            workspaceId={workspaceId}
            documents={documents.data ?? []}
            selected={selected}
            onToggle={(id) =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onInspect={setInspecting}
          />
        </div>

        <AnalysisHistory
          workspaceId={workspaceId}
          analyses={analyses.data ?? []}
          activeId={activeAnalysisId}
          onSelect={setActiveAnalysisId}
        />
      </div>

      {inspecting ? (
        <DocumentDrawer documentId={inspecting} onClose={() => setInspecting(null)} />
      ) : null}
    </div>
  );
}

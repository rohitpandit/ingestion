import { ALLOWED_EXTENSIONS, LIMITS, type UploadRejection } from '@mdiw/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { api, ApiRequestError } from '../api/client.js';

interface Props {
  workspaceId: string;
}

const ACCEPT = ALLOWED_EXTENSIONS.join(',');

/** Checks the obvious problems in the browser; the server re-checks everything. */
function prefilter(files: File[]): { ok: File[]; rejected: UploadRejection[] } {
  const ok: File[] = [];
  const rejected: UploadRejection[] = [];

  for (const file of files) {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
      rejected.push({
        originalName: file.name,
        code: 'UNSUPPORTED_TYPE',
        message: 'Only PDF and CSV files are supported.',
      });
      continue;
    }
    if (file.size > LIMITS.maxFileBytes) {
      rejected.push({
        originalName: file.name,
        code: 'TOO_LARGE',
        message: `Files must be under ${Math.round(LIMITS.maxFileBytes / (1024 * 1024))} MB.`,
      });
      continue;
    }
    if (file.size === 0) {
      rejected.push({ originalName: file.name, code: 'EMPTY_CONTENT', message: 'The file is empty.' });
      continue;
    }
    ok.push(file);
  }

  return { ok, rejected };
}

export function UploadDropzone({ workspaceId }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<UploadRejection[]>([]);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploadDocuments(workspaceId, files),
    onSuccess: (response) => {
      setRejected((current) => [...current, ...response.rejected]);
      void queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiRequestError ? caught.message : 'The upload failed.'),
  });

  function handleFiles(fileList: FileList | null): void {
    setError(null);
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const { ok, rejected: localRejections } = prefilter(files.slice(0, LIMITS.maxFilesPerRequest));
    setRejected(localRejections);
    if (ok.length > 0) upload.mutate(ok);
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div>
      <div
        className={`panel flex flex-col items-center gap-2 border-dashed p-6 text-center transition-colors ${
          dragging ? 'border-sky-500 bg-sky-500/5' : ''
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p className="text-sm text-slate-300">Drop PDF or CSV files here</p>
        <p className="text-xs text-slate-400">
          Up to {LIMITS.maxFilesPerRequest} files per upload, {Math.round(LIMITS.maxFileBytes / (1024 * 1024))} MB each
        </p>
        <button type="button" className="btn-secondary mt-1" onClick={() => inputRef.current?.click()}>
          {upload.isPending ? 'Uploading...' : 'Choose files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      {rejected.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {rejected.map((rejection, index) => (
            <li
              key={`${rejection.originalName}-${index}`}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              <span className="font-medium">{rejection.originalName}</span> was not accepted: {rejection.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

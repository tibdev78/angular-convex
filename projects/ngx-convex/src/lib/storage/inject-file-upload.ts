import { computed, signal, type Signal } from '@angular/core';
import { CONVEX_CLIENT } from '../core/config';
import type { MutationReference, WithInjector } from '../core/types';
import { resolveInjector } from '../util/compat';
import { toError } from '../util/args';

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export interface FileUpload {
  /** Uploads one file to Convex storage and resolves with its `Id<"_storage">`. */
  upload(file: Blob, options?: { signal?: AbortSignal }): Promise<string>;
  readonly status: Signal<UploadStatus>;
  /** 0 → 1 for the current upload. */
  readonly progress: Signal<number>;
  readonly error: Signal<Error | undefined>;
  readonly storageId: Signal<string | undefined>;
  readonly isUploading: Signal<boolean>;
}

/**
 * Convex file storage upload (`generateUploadUrl` → POST → `storageId`), with
 * progress. `generateUploadUrl` is your mutation returning
 * `ctx.storage.generateUploadUrl()`; store the id with another mutation.
 */
export function injectFileUpload(
  generateUploadUrl: MutationReference,
  options: WithInjector = {},
): FileUpload {
  const injector = resolveInjector(options.injector);
  const client = injector.get(CONVEX_CLIENT);
  const status = signal<UploadStatus>('idle');
  const progress = signal(0);
  const error = signal<Error | undefined>(undefined);
  const storageId = signal<string | undefined>(undefined);

  const upload = async (file: Blob, opts: { signal?: AbortSignal } = {}): Promise<string> => {
    status.set('uploading');
    progress.set(0);
    error.set(undefined);
    try {
      const url = (await client.mutation(generateUploadUrl, {})) as string;
      const id = await postFile(url, file, (p) => progress.set(p), opts.signal);
      storageId.set(id);
      progress.set(1);
      status.set('success');
      return id;
    } catch (e) {
      const err = toError(e);
      error.set(err);
      status.set('error');
      throw err;
    }
  };

  return {
    upload,
    status: status.asReadonly(),
    progress: progress.asReadonly(),
    error: error.asReadonly(),
    storageId: storageId.asReadonly(),
    isUploading: computed(() => status() === 'uploading'),
  };
}

/** POSTs a file to a Convex upload URL. Uses XHR for progress events. */
function postFile(
  url: string,
  file: Blob,
  onProgress: (fraction: number) => void = () => undefined,
  abort?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed with HTTP ${xhr.status}: ${xhr.responseText}`));
        return;
      }
      try {
        resolve((JSON.parse(xhr.responseText) as { storageId: string }).storageId);
      } catch (e) {
        reject(toError(e));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    abort?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

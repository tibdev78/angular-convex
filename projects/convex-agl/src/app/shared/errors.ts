import { ConvexError } from 'convex/values';

/** Readable text for a Convex error: `ConvexError` data first, then the message. */
export function errorText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string; code?: string } | string;
    return typeof data === 'string' ? data : (data.message ?? data.code ?? 'Error');
  }
  return error instanceof Error ? error.message : String(error);
}

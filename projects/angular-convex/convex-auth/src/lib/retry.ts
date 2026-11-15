/*
 * Ported from @convex-dev/auth 2.0.0 `src/browser/retry.ts`
 * (not exported by the package). Apache-2.0 © Convex, Inc.
 */

const RETRY_BACKOFF = [500, 2000];
const RETRY_JITTER = 100;

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && /network|failed to fetch|load failed/i.test(error.message);
}

/**
 * Runs `fn`, retrying it twice (after ~500 ms then ~2 s) when it fails with a
 * network error. Any other error is rethrown immediately.
 */
export async function retryOnNetworkError<T>(fn: () => Promise<T>, log?: (message: string) => void): Promise<T> {
  for (const [retry, backoff] of RETRY_BACKOFF.entries()) {
    try {
      return await fn();
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      const wait = backoff + RETRY_JITTER * Math.random();
      log?.(`network error, retry ${retry + 1} in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return await fn();
}

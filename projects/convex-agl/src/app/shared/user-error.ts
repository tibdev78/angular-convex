/** Readable text for a Convex Auth `userError` (`{ error: 'CODE', ... }`). */
export function userErrorText(userError: unknown): string {
  if (userError === null || userError === undefined) return '';
  const { error, cause } = userError as { error?: string; cause?: unknown };
  if (error === 'OTHER_ERROR' && cause instanceof Error) return cause.message;
  return (error ?? 'ERROR').replaceAll('_', ' ').toLowerCase();
}

import { makeFunctionReference } from 'convex/server';

/**
 * Typed references to the convex-agl demo functions this smoke app calls —
 * what `convex/_generated/api` gives a real app, without compiling the backend
 * with every TypeScript version of the matrix.
 */
type None = Record<string, never>;
type SignUpResult = { status: 'complete'; tokens: unknown } | { status: 'error'; userError: { error: string } };

export const api = {
  system: {
    info: makeFunctionReference<'query', None, unknown>('system:info'),
    ping: makeFunctionReference<'action', None, { ok: boolean; status: number; body: string }>('system:ping'),
  },
  users: {
    me: makeFunctionReference<'query', None, { name: string } | null>('users:me'),
    rename: makeFunctionReference<'mutation', { name: string }, null>('users:rename'),
  },
  auth: {
    refreshSession: makeFunctionReference<'mutation'>('auth:refreshSession'),
    signOut: makeFunctionReference<'mutation'>('auth:signOut'),
    isAuthenticated: makeFunctionReference<'query'>('auth:isAuthenticated'),
    signUpWithUsernamePassword: makeFunctionReference<'mutation', { username: string; password: string }, SignUpResult>(
      'auth:signUpWithUsernamePassword',
    ),
  },
};

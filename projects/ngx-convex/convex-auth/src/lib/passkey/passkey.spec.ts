import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fakeMutation, FakeConvexClient } from 'ngx-convex/testing';
import { authSetup, complete, flush, run } from '../../test/auth-test-helpers';
import { injectAuthToken } from '../provide-convex-auth-client';
import type { PasskeyCeremonies, WireCreationOptions, WireRequestOptions } from './ceremonies';
import {
  createUsernamePasskeyInjectors,
  injectAddPasskey,
  injectRemovePasskey,
  injectSignInWithUsernamePasskey,
  providePasskeyCeremonies,
} from './inject-passkey';

const api = {
  startSignInWithUsernamePasskey: fakeMutation('auth:startSignInWithUsernamePasskey'),
  startAutofillSignInWithUsernamePasskey: fakeMutation('auth:startAutofillSignInWithUsernamePasskey'),
  finishSignInWithUsernamePasskey: fakeMutation('auth:finishSignInWithUsernamePasskey'),
  finishSignUpWithUsernamePasskey: fakeMutation('auth:finishSignUpWithUsernamePasskey'),
  startAddPasskey: fakeMutation('auth:startAddPasskey'),
  verifyAddPasskey: fakeMutation('auth:verifyAddPasskey'),
  finishAddPasskey: fakeMutation('auth:finishAddPasskey'),
  startRemovePasskey: fakeMutation('auth:startRemovePasskey'),
  finishRemovePasskey: fakeMutation('auth:finishRemovePasskey'),
};

const requestOptions = { challenge: 'ch', timeout: 60_000, rpId: 'localhost', allowCredentials: [], userVerification: 'required' } as WireRequestOptions;
const creationOptions = { challenge: 'cc' } as WireCreationOptions;
const registration = {
  id: 'cred',
  rawId: 'cred',
  response: { clientDataJSON: 'cd', attestationObject: 'ao', transports: ['internal'] },
  type: 'public-key' as const,
};
const assertion = {
  id: 'cred',
  rawId: 'cred',
  response: { clientDataJSON: 'cd', authenticatorData: 'ad', signature: 'sg', userHandle: null },
  type: 'public-key' as const,
};
const wireAssertion = {
  id: 'cred',
  rawId: 'cred',
  response: { clientDataJSON: 'cd', authenticatorData: 'ad', signature: 'sg' },
  clientExtensionResults: {},
  type: 'public-key',
};

/** Ceremonies that succeed at once; autofill is a request the test settles. */
function fakeCeremonies(options: { autofill?: boolean } = {}) {
  let settleAutofill: ((result: Awaited<ReturnType<NonNullable<PasskeyCeremonies['autofill']>['authenticate']>>) => void) | null =
    null;
  const autofillSignals: AbortSignal[] = [];
  const ceremonies: PasskeyCeremonies = {
    isSupported: () => true,
    register: vi.fn(async () => ({ success: true as const, response: registration })),
    authenticate: vi.fn(async () => ({ success: true as const, response: assertion })),
    autofill: options.autofill
      ? {
          isAvailable: async () => true,
          authenticate: (_options, signal) =>
            new Promise((resolve) => {
              autofillSignals.push(signal);
              settleAutofill = resolve;
              signal.addEventListener('abort', () =>
                resolve({ success: false, userError: { error: 'CEREMONY_ABORTED' } }),
              );
            }),
        }
      : undefined,
  };
  return {
    ceremonies,
    autofillSignals,
    settleAutofill: (result: Parameters<NonNullable<typeof settleAutofill>>[0]) => settleAutofill?.(result),
  };
}

function passkeySetup(options: { autofill?: boolean } = {}) {
  const convex = new FakeConvexClient();
  const fake = fakeCeremonies(options);
  authSetup({ convex, providers: [providePasskeyCeremonies(fake.ceremonies)] });
  return { convex, ...fake };
}

describe('injectSignInWithUsernamePasskey', () => {
  it('creates the account when the username is new (flow: signUp)', async () => {
    const { convex, ceremonies } = passkeySetup();
    convex.onMutation(api.startSignInWithUsernamePasskey, () => ({ success: true, step: 'register', options: creationOptions }));
    const finished: unknown[] = [];
    convex.onMutation(api.finishSignUpWithUsernamePasskey, (args) => {
      finished.push(args);
      return complete(1);
    });
    const passkey = run(() => injectSignInWithUsernamePasskey(api, { autofill: false }));
    const token = run(() => injectAuthToken());

    const result = passkey.signIn({ username: 'ada' });
    expect(passkey.pending()).toBe(true);
    await expect(result).resolves.toMatchObject({ status: 'complete', flow: 'signUp' });
    expect(passkey.pending()).toBe(false);
    expect(ceremonies.register).toHaveBeenCalledWith(creationOptions);
    expect(finished).toEqual([
      {
        username: 'ada',
        response: {
          id: 'cred',
          rawId: 'cred',
          response: { clientDataJSON: 'cd', attestationObject: 'ao', transports: ['internal'] },
          clientExtensionResults: {},
          type: 'public-key',
        },
      },
    ]);
    expect(token()).toBe('jwt-1');
  });

  it('signs in to an existing account (flow: signIn)', async () => {
    const { convex } = passkeySetup();
    convex.onMutation(api.startSignInWithUsernamePasskey, () => ({ success: true, step: 'authenticate', options: requestOptions }));
    convex.onMutation(api.finishSignInWithUsernamePasskey, () => complete(2));
    const passkey = run(() => injectSignInWithUsernamePasskey(api, { autofill: false }));
    await expect(passkey.signIn({ username: 'ada' })).resolves.toMatchObject({ status: 'complete', flow: 'signIn' });
  });

  it('refuses a second ceremony while one runs (ALREADY_PENDING)', async () => {
    const { convex } = passkeySetup();
    let release!: () => void;
    convex.onMutation(
      api.startSignInWithUsernamePasskey,
      () => new Promise((resolve) => (release = () => resolve({ success: false, userError: { error: 'X' } }))),
    );
    const passkey = run(() => injectSignInWithUsernamePasskey(api, { autofill: false }));
    const first = passkey.signIn({ username: 'ada' });
    await expect(passkey.signIn({ username: 'ada' })).resolves.toEqual({
      status: 'error',
      userError: { error: 'ALREADY_PENDING' },
    });
    release();
    await expect(first).resolves.toEqual({ status: 'error', userError: { error: 'X' } });
  });

  it('reports WEBAUTHN_UNSUPPORTED without calling the server', async () => {
    const convex = new FakeConvexClient();
    authSetup({ convex });
    const { injectSignInWithUsernamePasskey: inject } = createUsernamePasskeyInjectors({
      isSupported: () => false,
      register: vi.fn(),
      authenticate: vi.fn(),
    });
    const passkey = run(() => inject(api, { autofill: false }));
    await expect(passkey.signIn({ username: 'ada' })).resolves.toEqual({
      status: 'error',
      userError: { error: 'WEBAUTHN_UNSUPPORTED' },
    });
    expect(convex.calls).toEqual([]);
  });

  it('autofill: waits, signs in on an assertion, then reports signedIn', async () => {
    const { convex, settleAutofill } = passkeySetup({ autofill: true });
    convex.onMutation(api.startAutofillSignInWithUsernamePasskey, () => ({ options: requestOptions }));
    const finished: unknown[] = [];
    convex.onMutation(api.finishSignInWithUsernamePasskey, (args) => {
      finished.push(args);
      return complete(3);
    });
    const passkey = run(() => injectSignInWithUsernamePasskey(api));
    const token = run(() => injectAuthToken());
    await flush();
    expect(passkey.autofill.available()).toBe(true);
    expect(passkey.autofill.status()).toBe('waiting');

    settleAutofill({ success: true, response: assertion });
    await flush();
    expect(finished).toEqual([{ response: wireAssertion }]);
    expect(passkey.autofill.status()).toBe('signedIn');
    expect(token()).toBe('jwt-3');
  });

  it('autofill: yields to a modal ceremony, then asks for a fresh challenge', async () => {
    const { convex, autofillSignals } = passkeySetup({ autofill: true });
    let starts = 0;
    convex.onMutation(api.startAutofillSignInWithUsernamePasskey, () => {
      starts++;
      return { options: requestOptions };
    });
    convex.onMutation(api.startSignInWithUsernamePasskey, () => ({ success: true, step: 'authenticate', options: requestOptions }));
    convex.onMutation(api.finishSignInWithUsernamePasskey, () => ({ status: 'error', userError: { error: 'INVALID' } }));
    const passkey = run(() => injectSignInWithUsernamePasskey(api));
    await flush();
    expect(starts).toBe(1);

    await passkey.signIn({ username: 'ada' });
    expect(autofillSignals[0].aborted).toBe(true);
    await flush();
    expect(starts).toBe(2);
    expect(passkey.autofill.status()).toBe('waiting');
  });

  it('autofill: a foreign ceremony stops it with a warning', async () => {
    const { convex, settleAutofill } = passkeySetup({ autofill: true });
    convex.onMutation(api.startAutofillSignInWithUsernamePasskey, () => ({ options: requestOptions }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const passkey = run(() => injectSignInWithUsernamePasskey(api));
    await flush();
    settleAutofill({ success: false, userError: { error: 'CEREMONY_ABORTED' } });
    await flush();
    expect(passkey.autofill.status()).toBe('stopped');
    expect(passkey.autofill.lastError()).toEqual({ error: 'CEREMONY_ABORTED' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ended by another WebAuthn ceremony'));
    warn.mockRestore();
  });

  it('autofill: stops when its injector is destroyed', async () => {
    const { convex, autofillSignals } = passkeySetup({ autofill: true });
    convex.onMutation(api.startAutofillSignInWithUsernamePasskey, () => ({ options: requestOptions }));
    const child = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    run(() => injectSignInWithUsernamePasskey(api, { injector: child }));
    await flush();
    child.destroy();
    expect(autofillSignals[0].aborted).toBe(true);
  });
});

describe('passkey management', () => {
  it('adds a passkey: re-authenticate, verify, register, finish', async () => {
    const { convex, ceremonies } = passkeySetup();
    convex.onMutation(api.startAddPasskey, () => ({ success: true, options: requestOptions }));
    convex.onMutation(api.verifyAddPasskey, () => ({ success: true, options: creationOptions }));
    convex.onMutation(api.finishAddPasskey, () => ({ success: true, passkeyId: 'pk-2' }));
    const { addPasskey, pending } = run(() => injectAddPasskey(api));
    const result = addPasskey();
    expect(pending()).toBe(true);
    await expect(result).resolves.toEqual({ success: true, passkeyId: 'pk-2' });
    expect(ceremonies.authenticate).toHaveBeenCalledWith(requestOptions);
    expect(ceremonies.register).toHaveBeenCalledWith(creationOptions);
    expect(convex.calls.map((c) => c.name)).toEqual(['auth:startAddPasskey', 'auth:verifyAddPasskey', 'auth:finishAddPasskey']);
    expect(pending()).toBe(false);
  });

  it('removes a passkey after re-authentication', async () => {
    const { convex } = passkeySetup();
    convex.onMutation(api.startRemovePasskey, () => ({ success: true, options: requestOptions }));
    convex.onMutation(api.finishRemovePasskey, () => ({ success: true }));
    const { removePasskey } = run(() => injectRemovePasskey(api));
    await expect(removePasskey('pk-1')).resolves.toEqual({ success: true });
    expect(convex.calls.at(-1)).toMatchObject({ name: 'auth:finishRemovePasskey', args: { passkeyId: 'pk-1', response: wireAssertion } });
  });

  it('stops at the first server refusal', async () => {
    const { convex, ceremonies } = passkeySetup();
    convex.onMutation(api.startAddPasskey, () => ({ success: false, userError: { error: 'NOT_SIGNED_IN' } }));
    const { addPasskey } = run(() => injectAddPasskey(api));
    await expect(addPasskey()).resolves.toEqual({ success: false, userError: { error: 'NOT_SIGNED_IN' } });
    expect(ceremonies.authenticate).not.toHaveBeenCalled();
  });
});

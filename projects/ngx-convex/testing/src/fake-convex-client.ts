import { type EnvironmentProviders } from '@angular/core';
import type { ConnectionState, ConvexClient } from 'convex/browser';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import { convexToJson, type Value } from 'convex/values';
import { provideConvex } from 'ngx-convex';

type Ref = Parameters<typeof getFunctionName>[0];
type Handler = (args: Record<string, unknown>) => unknown;

interface Listener {
  key: string;
  callback: (value: unknown) => void;
  onError?: (error: Error) => void;
}

interface PaginatedListener {
  name: string;
  args: Record<string, unknown>;
  loaded: number;
  callback: (value: unknown) => void;
  onError?: (error: Error) => void;
}

const keyOf = (name: string, args: unknown) => `${name}:${JSON.stringify(convexToJson((args ?? {}) as Value))}`;

/**
 * In-memory stand-in for `ConvexClient`, for unit tests of components and
 * services that use ngx-convex. No network, fully synchronous.
 *
 * ```ts
 * const convex = new FakeConvexClient();
 * convex.setQuery(api.todos.list, {}, [{ _id: '1', text: 'a' }]);
 * convex.onMutation(api.todos.add, ({ text }) => 'new-id');
 * TestBed.configureTestingModule({ providers: [provideConvexTesting(convex)] });
 * ```
 */
export class FakeConvexClient {
  private readonly results = new Map<string, { value?: unknown; error?: Error }>();
  private readonly listeners = new Set<Listener>();
  private readonly paginated = new Set<PaginatedListener>();
  private readonly paginatedData = new Map<string, unknown[]>();
  private readonly handlers = new Map<string, Handler>();
  private readonly connectionListeners = new Set<(s: ConnectionState) => void>();
  private connection: ConnectionState = {
    hasInflightRequests: false,
    isWebSocketConnected: true,
    timeOfOldestInflightRequest: null,
    hasEverConnected: true,
    connectionCount: 1,
    connectionRetries: 0,
    inflightMutations: 0,
    inflightActions: 0,
  };
  /** Every mutation/action call, in order: `{ name, args }`. */
  readonly calls: { type: 'mutation' | 'action' | 'query'; name: string; args: Record<string, unknown> }[] = [];
  /** Auth hooks used by `provideConvexAuth` (mirrors `BaseConvexClient`). */
  readonly client = {
    url: 'https://fake.convex.cloud',
    fetchToken: undefined as undefined | ((a: { forceRefreshToken: boolean }) => Promise<string | null | undefined>),
    onAuthChange: undefined as undefined | ((isAuthenticated: boolean) => void),
    setAuth: (fetchToken: (a: { forceRefreshToken: boolean }) => Promise<string | null | undefined>, onChange: (auth: boolean) => void) => {
      this.client.fetchToken = fetchToken;
      this.client.onAuthChange = onChange;
    },
    clearAuth: () => {
      this.client.fetchToken = undefined;
      this.client.onAuthChange = undefined;
    },
  };

  /** Number of live (non-paginated) subscriptions. */
  get subscriptionCount(): number {
    return this.listeners.size;
  }

  /** Sets (and pushes to subscribers) the result of a query. */
  setQuery(ref: unknown, args: Record<string, unknown>, value: unknown): void {
    const key = keyOf(getFunctionName(ref as Ref), args);
    this.results.set(key, { value });
    for (const l of this.listeners) if (l.key === key) l.callback(value);
  }

  /** Makes a query fail for its subscribers. */
  setQueryError(ref: unknown, args: Record<string, unknown>, error: Error): void {
    const key = keyOf(getFunctionName(ref as Ref), args);
    this.results.set(key, { error });
    for (const l of this.listeners) if (l.key === key) l.onError?.(error);
  }

  /** Backing items of a paginated query (args without `paginationOpts`). */
  setPaginatedItems(ref: unknown, args: Record<string, unknown>, items: unknown[]): void {
    const name = getFunctionName(ref as Ref);
    this.paginatedData.set(keyOf(name, args), items);
    for (const l of this.paginated) if (l.name === name && keyOf(name, l.args) === keyOf(name, args)) this.pushPage(l);
  }

  /** Makes a paginated query fail (args without `paginationOpts`). */
  setPaginatedError(ref: unknown, args: Record<string, unknown>, error: Error): void {
    const name = getFunctionName(ref as Ref);
    for (const l of this.paginated) if (l.name === name && keyOf(name, l.args) === keyOf(name, args)) l.onError?.(error);
  }

  /** Registers the implementation of a mutation or action. */
  onMutation(ref: unknown, handler: Handler): void {
    this.handlers.set(getFunctionName(ref as Ref), handler);
  }

  onAction(ref: unknown, handler: Handler): void {
    this.onMutation(ref, handler);
  }

  setConnectionState(patch: Partial<ConnectionState>): void {
    this.connection = { ...this.connection, ...patch };
    for (const l of this.connectionListeners) l(this.connection);
  }

  /** Simulates the backend accepting / rejecting the auth token. */
  async resolveAuth(isAuthenticated: boolean): Promise<void> {
    await this.client.fetchToken?.({ forceRefreshToken: false });
    this.client.onAuthChange?.(isAuthenticated);
  }

  // --- ConvexClient surface used by ngx-convex ---------------------------

  onUpdate(ref: unknown, args: Record<string, unknown>, callback: (v: unknown) => void, onError?: (e: Error) => void) {
    const key = keyOf(getFunctionName(ref as Ref), args);
    const listener: Listener = { key, callback, onError };
    this.listeners.add(listener);
    const unsubscribe = () => void this.listeners.delete(listener);
    return Object.assign(unsubscribe, {
      unsubscribe,
      getCurrentValue: () => {
        const r = this.results.get(key);
        if (r?.error) throw r.error;
        return r?.value;
      },
      getQueryLogs: () => [],
    });
  }

  onPaginatedUpdate_experimental(
    ref: unknown,
    args: Record<string, unknown>,
    options: { initialNumItems: number },
    callback: (v: unknown) => void,
    onError?: (e: Error) => void,
  ) {
    const listener: PaginatedListener = { name: getFunctionName(ref as Ref), args, loaded: options.initialNumItems, callback, onError };
    this.paginated.add(listener);
    const unsubscribe = () => void this.paginated.delete(listener);
    return Object.assign(unsubscribe, {
      unsubscribe,
      getCurrentValue: () => this.page(listener),
      getQueryLogs: () => [],
    });
  }

  async query(ref: unknown, args: Record<string, unknown> = {}): Promise<unknown> {
    const name = getFunctionName(ref as Ref);
    this.calls.push({ type: 'query', name, args });
    const r = this.results.get(keyOf(name, args));
    if (r?.error) throw r.error;
    return r?.value;
  }

  async mutation(ref: unknown, args: Record<string, unknown> = {}, options?: { optimisticUpdate?: unknown }): Promise<unknown> {
    void options;
    return this.run('mutation', ref, args);
  }

  async action(ref: unknown, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.run('action', ref, args);
  }

  connectionState(): ConnectionState {
    return this.connection;
  }

  subscribeToConnectionState(cb: (s: ConnectionState) => void): () => void {
    this.connectionListeners.add(cb);
    return () => void this.connectionListeners.delete(cb);
  }

  setAuth(fetchToken: never, onChange?: (auth: boolean) => void): void {
    this.client.setAuth(fetchToken, onChange ?? (() => undefined));
  }

  getAuth(): undefined {
    return undefined;
  }

  async close(): Promise<void> {
    this.listeners.clear();
    this.paginated.clear();
  }

  /** Typed view for `provideConvex({ client })`. */
  asConvexClient(): ConvexClient {
    return this as unknown as ConvexClient;
  }

  private async run(type: 'mutation' | 'action', ref: unknown, args: Record<string, unknown>): Promise<unknown> {
    const name = getFunctionName(ref as Ref);
    this.calls.push({ type, name, args });
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`FakeConvexClient: no handler for ${type} ${name}`);
    return handler(args);
  }

  private page(l: PaginatedListener) {
    const items = this.paginatedData.get(keyOf(l.name, l.args));
    if (!items) return undefined;
    const results = items.slice(0, l.loaded);
    return {
      results,
      status: results.length < items.length ? 'CanLoadMore' : 'Exhausted',
      loadMore: (n: number) => {
        if (results.length >= items.length) return false;
        l.loaded += n;
        this.pushPage(l);
        return true;
      },
    };
  }

  private pushPage(l: PaginatedListener): void {
    const value = this.page(l);
    if (value) l.callback(value);
  }
}

/** `provideConvex` wired to a {@link FakeConvexClient}. */
export function provideConvexTesting(fake: FakeConvexClient = new FakeConvexClient()): EnvironmentProviders {
  return provideConvex({ url: fake.client.url, client: fake.asConvexClient() });
}

/**
 * Builds a function reference usable with the fake client without generated
 * code, e.g. `const list = fakeQuery<Todo[]>('todos:list')`.
 */
export function fakeRef<Type extends 'query' | 'mutation' | 'action', Args = Record<string, unknown>, Return = unknown>(
  type: Type,
  name: string,
): { _type: Type; _visibility: 'public'; _args: Args; _returnType: Return; _componentPath: undefined } {
  void type;
  return makeFunctionReference(name) as never;
}


export const fakeQuery = <Return = unknown, Args = Record<string, unknown>>(name: string) => fakeRef<'query', Args, Return>('query', name);
export const fakeMutation = <Return = unknown, Args = Record<string, unknown>>(name: string) => fakeRef<'mutation', Args, Return>('mutation', name);
export const fakeAction = <Return = unknown, Args = Record<string, unknown>>(name: string) => fakeRef<'action', Args, Return>('action', name);

/*
 * Public API Surface of ngx-convex. Every name is listed: a module's internal
 * helpers stay out of the package even when other modules import them.
 */
export { CONVEX_CLIENT, CONVEX_CONFIG } from './lib/core/config';
export type { ConvexConfig, ConvexSsrOptions, ResolvedConvexConfig } from './lib/core/config';
export { CONVEX_HTTP_CLIENT, injectConvex, injectConvexHttpClient, provideConvex } from './lib/core/provide-convex';
export { skipToken } from './lib/core/types';
export type {
  ActionReference,
  ArgsInput,
  ArgsOf,
  ConvexFunctionReference,
  ConvexFunctionType,
  EmptyArgs,
  MutationReference,
  OptionalArgs,
  QueryReference,
  ReturnOf,
  SkipToken,
  WithInjector,
} from './lib/core/types';

export { injectQuery } from './lib/query/inject-query';
export type { ConvexQuery, QueryOptions, QueryRest, QueryStatus } from './lib/query/inject-query';
export { injectQueries } from './lib/query/inject-queries';
export type { QueriesResult, QueryRequest } from './lib/query/inject-queries';
export { injectPaginatedQuery } from './lib/query/inject-paginated-query';
export type {
  ConvexPaginatedQuery,
  PaginatedArgs,
  PaginatedItem,
  PaginatedQueryOptions,
  PaginationStatus,
} from './lib/query/inject-paginated-query';
export { injectPrewarmQuery, prewarmQuery } from './lib/query/prewarm';
export { convexQueryOptions, injectQueryFromOptions, prewarmQueryFromOptions } from './lib/query/query-options';
export type { ConvexQueryOptions, QueryFromOptions } from './lib/query/query-options';

export { injectMutation } from './lib/mutation/inject-mutation';
export type {
  CallOptions,
  CallState,
  CallStatus,
  ConvexMutation,
  MutationOptions,
  OptimisticUpdate,
} from './lib/mutation/inject-mutation';
export { injectAction } from './lib/action/inject-action';
export type { ConvexAction } from './lib/action/inject-action';

export { injectConvexConnectionState } from './lib/connection/inject-connection-state';
export {
  ConvexAuthService,
  injectAuthenticatedHttpClient,
  injectConvexAuth,
  injectFetchAccessToken,
  provideConvexAuth,
} from './lib/auth/convex-auth';
export type { AccessTokenFetcher, ConvexAuthProvider, ConvexAuthState } from './lib/auth/convex-auth';
export {
  ConvexAuthenticated,
  ConvexAuthLoading,
  ConvexAuthRefreshing,
  ConvexUnauthenticated,
} from './lib/auth/auth-directives';

export {
  insertAtBottomIfLoaded,
  insertAtPosition,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
} from './lib/optimistic/paginated';
export type { InsertAtPositionOptions, InsertOptions } from './lib/optimistic/paginated';
export { injectFileUpload } from './lib/storage/inject-file-upload';
export type { FileUpload, UploadStatus } from './lib/storage/inject-file-upload';
export { fromConvexQuery } from './lib/rx/from-convex';

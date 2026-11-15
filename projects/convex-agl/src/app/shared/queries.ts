import { convexQueryOptions } from 'angular-convex';
import { api } from '../convex';

/** One `{ query, args }` value shared by the nav prewarm and the Lab page. */
export const labSamples = convexQueryOptions({ query: api.lab.list, args: {} });

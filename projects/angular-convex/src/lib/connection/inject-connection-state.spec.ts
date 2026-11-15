import { TestBed } from '@angular/core/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import { injectConvexConnectionState } from './inject-connection-state';
import { fromConvexQuery } from '../rx/from-convex';
import { injectConvex } from '../core/provide-convex';
import { setup } from '../../test/helpers';
import { listTodos } from '../../test/refs';

describe('injectConvexConnectionState', () => {
  it('follows the client connection state', () => {
    const { convex, injector } = setup();
    const state = injectConvexConnectionState({ injector });
    expect(state().isWebSocketConnected).toBe(true);
    convex.setConnectionState({ isWebSocketConnected: false, connectionRetries: 2 });
    expect(state().isWebSocketConnected).toBe(false);
    expect(state().connectionRetries).toBe(2);
  });
});

describe('fromConvexQuery', () => {
  it('emits each new result and unsubscribes', async () => {
    const { convex } = setup();
    const client = TestBed.runInInjectionContext(() => injectConvex());
    const values = firstValueFrom(fromConvexQuery(client, listTodos, {}).pipe(take(2), toArray()));
    convex.setQuery(listTodos, {}, []);
    convex.setQuery(listTodos, {}, [{ _id: '1', text: 'a' }]);
    expect(await values).toEqual([[], [{ _id: '1', text: 'a' }]]);
    expect(convex.subscriptionCount).toBe(0);
  });
});

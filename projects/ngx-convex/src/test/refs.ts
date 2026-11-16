import { fakeAction, fakeMutation, fakeQuery } from '../../testing/src/fake-convex-client';

export interface Todo { _id: string; text: string; done?: boolean }
export const listTodos = fakeQuery<Todo[], { done?: boolean }>('todos:list');
export const getTodo = fakeQuery<Todo | null, { id: string }>('todos:get');
export const pageTodos = fakeQuery<{ page: Todo[]; isDone: boolean; continueCursor: string }, { paginationOpts: { numItems: number; cursor: string | null }; tag?: string }>('todos:page');
export const addTodo = fakeMutation<string, { text: string }>('todos:add');
export const sendEmail = fakeAction<{ ok: boolean }, { to: string }>('emails:send');

import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectMutation, injectQueries, injectQuery } from 'angular-convex';
import { api, type Id } from '../convex';

type Filter = 'all' | 'active' | 'done';
type Priority = 'low' | 'medium' | 'high';

@Component({
  selector: 'app-todos',
  imports: [FormsModule],
  template: `
    <h1>Todos</h1>

    <section class="card">
      <form class="row" (ngSubmit)="addTodo()">
        <input class="grow" name="text" [(ngModel)]="text" placeholder="What needs to be done?" data-testid="todo-input" />
        <select name="priority" [(ngModel)]="priority" data-testid="todo-priority">
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <select name="project" [(ngModel)]="projectId" data-testid="todo-project">
          <option [ngValue]="undefined">No project</option>
          @for (p of projects() ?? []; track p._id) {
            <option [ngValue]="p._id">{{ p.name }}</option>
          }
        </select>
        <button type="submit" [disabled]="!text().trim()" data-testid="todo-add">Add</button>
      </form>
      @if (add.error(); as e) { <p class="error" data-testid="todo-error">{{ e.message }}</p> }
    </section>

    <section class="card">
      <div class="tabs">
        @for (f of filters; track f) {
          <button type="button" [class.active]="filter() === f" (click)="filter.set(f)" [attr.data-testid]="'filter-' + f">{{ f }} <small [attr.data-testid]="'count-' + f">{{ countOf(f) }}</small></button>
        }
        <span class="grow"></span>
        @if (stats(); as s) {
          <span class="muted" data-testid="todo-stats">{{ s.done }}/{{ s.total }} done · high {{ s.byPriority.high }}</span>
        }
      </div>

      @if (todos.isLoading()) {
        <p class="muted">Loading…</p>
      } @else {
        <ul class="list" data-testid="todo-list">
          @for (t of todos() ?? []; track t._id) {
            <li data-testid="todo-item">
              <input type="checkbox" [checked]="t.done" (change)="toggle({ id: t._id })" />
              <span class="grow" [class.done]="t.done">{{ t.text }}</span>
              <span class="badge" [class]="t.priority">{{ t.priority }}</span>
              @if (projectName(t.projectId); as name) { <span class="badge">{{ name }}</span> }
              <button class="danger" type="button" (click)="remove({ id: t._id })" aria-label="Delete">✕</button>
            </li>
          } @empty {
            <li class="muted">Nothing here.</li>
          }
        </ul>
        <div class="row">
          <button class="ghost" type="button" (click)="clearCompleted()" data-testid="clear-completed">Clear completed</button>
        </div>
      }
    </section>

    <section class="card">
      <h2>Projects (one-to-many relation)</h2>
      <form class="row" (ngSubmit)="addProject()">
        <input class="grow" name="project" [(ngModel)]="projectName_" placeholder="New project" data-testid="project-input" />
        <button type="submit" [disabled]="!projectName_.trim()">Create</button>
      </form>
      <ul class="list" data-testid="project-list">
        @for (p of projects() ?? []; track p._id) {
          <li>
            <span class="badge" [style.background]="p.color" style="color: white">●</span>
            <span class="grow">{{ p.name }}</span>
            <span class="muted">{{ p.doneCount }}/{{ p.todoCount }} done</span>
            <button class="danger" type="button" (click)="removeProject({ id: p._id })">Delete (cascade)</button>
          </li>
        }
      </ul>
    </section>

    <section class="card">
      <h2>Full-text search</h2>
      <div class="row">
        <input class="grow" [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Search todos…" data-testid="todo-search" />
        <label class="muted"><input type="checkbox" [ngModel]="onlyActive()" (ngModelChange)="onlyActive.set($event)" /> open only</label>
      </div>
      <ul class="list" data-testid="search-results">
        @for (t of results() ?? []; track t._id) {
          <li><span [class.done]="t.done">{{ t.text }}</span></li>
        }
      </ul>
    </section>
  `,
})
export class TodosPage {
  protected readonly filters: Filter[] = ['all', 'active', 'done'];
  protected readonly filter = signal<Filter>('all');
  protected readonly search = signal('');
  protected readonly onlyActive = signal(false);
  protected readonly text = signal('');
  protected priority: Priority = 'medium';
  protected projectId: Id<'projects'> | undefined;
  protected projectName_ = '';

  // Re-subscribes automatically when `filter` changes.
  protected readonly todos = injectQuery(api.todos.list, () => ({ filter: this.filter() }), { keepPreviousData: true });
  protected readonly stats = injectQuery(api.todos.stats);
  protected readonly projects = injectQuery(api.projects.list);
  // `'skip'` disables the subscription while the box is empty.
  protected readonly results = injectQuery(api.todos.search, () =>
    this.search().trim() ? { text: this.search(), onlyActive: this.onlyActive() } : 'skip',
  );

  // One subscription per filter at once (React `useQueries`), for the tab counts.
  private readonly perFilter = injectQueries(() =>
    Object.fromEntries(this.filters.map((f) => [f, { query: api.todos.list, args: { filter: f } }])),
  );
  protected countOf(f: Filter): string {
    const list = this.perFilter()[f];
    return Array.isArray(list) ? String(list.length) : '…';
  }

  private readonly projectsById = computed(() => new Map((this.projects() ?? []).map((p) => [p._id, p.name])));

  // Optimistic: the new todo shows instantly, before the server confirms.
  protected readonly add = injectMutation(api.todos.add).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.todos.list, { filter: this.filter() });
    if (current === undefined || this.filter() === 'done') return;
    store.setQuery(api.todos.list, { filter: this.filter() }, [
      {
        _id: crypto.randomUUID() as Id<'todos'>,
        _creationTime: Date.now(),
        ownerId: '' as Id<'users'>,
        text: args.text,
        done: false,
        priority: args.priority ?? 'medium',
        tags: args.tags ?? [],
        projectId: args.projectId,
        dueAt: args.dueAt,
      },
      ...current,
    ]);
  });
  protected readonly toggle = injectMutation(api.todos.toggle);
  protected readonly remove = injectMutation(api.todos.remove);
  protected readonly clearCompleted = injectMutation(api.todos.clearCompleted);
  protected readonly createProject = injectMutation(api.projects.create);
  protected readonly removeProject = injectMutation(api.projects.remove);

  protected projectName(id: Id<'projects'> | undefined): string | undefined {
    return id ? this.projectsById().get(id) : undefined;
  }

  protected async addTodo(): Promise<void> {
    const text = this.text();
    this.text.set('');
    await this.add({ text, priority: this.priority, projectId: this.projectId }).catch(() => this.text.set(text));
  }

  protected async addProject(): Promise<void> {
    const name = this.projectName_;
    this.projectName_ = '';
    const palette = ['#4f46e5', '#0891b2', '#db2777', '#65a30d', '#ea580c'];
    await this.createProject({ name, color: palette[(this.projects()?.length ?? 0) % palette.length] });
  }
}

import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { shot, signUpWithPassword, unique } from './helpers';

/** A valid 8×8 PNG of one colour, built in memory. */
function png(r: number, g: number, b: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(8).fill([r, g, b]).flat())]);
  const raw = Buffer.concat(Array(8).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('Demo features', () => {
  test.beforeEach(async ({ page }) => {
    await signUpWithPassword(page);
  });

  test('todos: optimistic add, toggle, filters, stats, projects and full-text search', async ({ page }, info) => {
    const add = async (text: string, priority: string) => {
      await page.getByTestId('todo-input').fill(text);
      await page.getByTestId('todo-priority').selectOption(priority);
      await page.getByTestId('todo-add').click();
      await expect(page.getByTestId('todo-item').filter({ hasText: text })).toBeVisible();
    };
    await page.getByTestId('project-input').fill('Garden');
    await page.getByTestId('project-input').press('Enter');
    await expect(page.getByTestId('project-list')).toContainText('Garden');
    await page.getByTestId('todo-project').selectOption({ label: 'Garden' });
    await add('Water the tomatoes', 'high');
    await page.getByTestId('todo-project').selectOption({ label: 'No project' });
    await add('Buy oat milk', 'low');
    await add('Write the angular-convex README', 'medium');
    await expect(page.getByTestId('todo-stats')).toHaveText('0/3 done · high 1');
    // Tab counts come from injectQueries: one live subscription per filter.
    await expect(page.getByTestId('count-all')).toHaveText('3');
    await expect(page.getByTestId('count-done')).toHaveText('0');
    await shot(page, info, 'three-todos');

    await page.getByTestId('todo-item').filter({ hasText: 'Buy oat milk' }).getByRole('checkbox').check();
    await expect(page.getByTestId('todo-stats')).toHaveText('1/3 done · high 1');
    await expect(page.getByTestId('count-done')).toHaveText('1');
    await expect(page.getByTestId('count-active')).toHaveText('2');
    await page.getByTestId('filter-done').click();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
    await shot(page, info, 'filter-done');
    await page.getByTestId('filter-active').click();
    await expect(page.getByTestId('todo-item')).toHaveCount(2);
    await expect(page.getByTestId('project-list')).toContainText('0/1 done');

    await page.getByTestId('todo-search').fill('tomatoes');
    await expect(page.getByTestId('search-results')).toContainText('Water the tomatoes');
    await shot(page, info, 'search');

    await page.getByTestId('filter-all').click();
    await page.getByTestId('clear-completed').click();
    await expect(page.getByTestId('todo-stats')).toHaveText('0/2 done · high 1');
    await shot(page, info, 'cleared');
  });

  test('chat: real-time between two users, presence, image upload and search', async ({ page, browser }, info) => {
    await page.goto('/chat');
    const other = await browser.newPage();
    const bob = await signUpWithPassword(other, unique('bob'));
    await other.goto('/chat');

    await expect(page.getByTestId('presence')).toContainText(bob);
    const text = `hello from ${bob}`;
    await other.getByTestId('chat-input').fill(text);
    await other.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-message').filter({ hasText: text })).toBeVisible();
    await shot(page, info, 'message-received-live');

    const caption = `with a picture from ${bob}`;
    await page.getByTestId('chat-input').fill(caption);
    await page.getByTestId('chat-file').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: png(220, 40, 40) });
    await page.getByTestId('chat-send').click();
    const withImage = other.getByTestId('chat-message').filter({ hasText: caption });
    await expect(withImage.locator('img')).toBeVisible();
    await shot(other, info, 'image-received-live');

    await page.getByTestId('chat-search').fill(bob);
    await expect(page.locator('li', { hasText: text }).last()).toBeVisible();
    await shot(page, info, 'chat-search');
    await other.close();
  });

  test('data: seed 1,000 rows in batches, paginate and filter by index', async ({ page }, info) => {
    await page.goto('/data');
    const count = page.getByTestId('event-count');
    await expect(count).not.toHaveText('…');
    const before = Number(await count.textContent());
    await page.getByTestId('seed').click();
    await expect(count).toHaveText(String(before + 1000), { timeout: 45_000 });
    await shot(page, info, 'seeded');

    // A Convex page keeps the range it was first read with: a first page read
    // on an empty table stays open-ended and grows with every insert. A fresh
    // subscription paginates the 1,000 rows normally.
    await page.reload();

    await expect(page.getByTestId('event-status')).toContainText('CanLoadMore');
    const loaded = async () => Number((await page.getByTestId('event-status').textContent())!.split('·')[1].trim().split(' ')[0]);
    const first = await loaded();
    await page.getByTestId('event-more').click();
    await expect.poll(loaded).toBe(first + 50);
    await shot(page, info, 'load-more');

    await page.getByTestId('kind-error').click();
    await expect(page.getByTestId('event-rows').locator('tr').first()).toContainText('error');
    const kinds = await page.getByTestId('event-rows').locator('tr td:nth-child(2)').allTextContents();
    expect(new Set(kinds)).toEqual(new Set(['error']));
    await shot(page, info, 'filtered-by-kind');
  });

  test('files: upload with progress, gallery and server-side validation', async ({ page }, info) => {
    await page.goto('/files');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'green.png', mimeType: 'image/png', buffer: png(40, 180, 80) },
      { name: 'blue.png', mimeType: 'image/png', buffer: png(40, 80, 220) },
    ]);
    await expect(page.getByTestId('gallery-item')).toHaveCount(2);
    await expect(page.getByTestId('gallery-item').first().locator('img')).toBeVisible();
    await shot(page, info, 'gallery');

    await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.getByTestId('upload-error')).toBeVisible();
    await expect(page.getByTestId('gallery-item')).toHaveCount(2);
    await shot(page, info, 'rejected-non-image');

    await page.getByTestId('gallery-item').first().getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('gallery-item')).toHaveCount(1);
  });

  test('notes: vector search from an action', async ({ page }, info) => {
    await page.goto('/notes');
    const note = async (title: string, body: string) => {
      await page.getByTestId('note-title').fill(title);
      await page.getByTestId('note-body').fill(body);
      await page.getByTestId('note-add').click();
      await expect(page.getByTestId('note-list')).toContainText(title);
    };
    await note('Pasta', 'boil water, cook spaghetti with tomato sauce and basil');
    await note('Running', 'morning jogging plan, five kilometres in the park');
    await note('Angular', 'signals, components and dependency injection');
    await page.getByTestId('note-query').fill('spaghetti tomato dinner');
    await page.getByTestId('note-search').click();
    await expect(page.getByTestId('note-hits').locator('li').first()).toContainText('Pasta');
    await shot(page, info, 'vector-hits');
  });

  test('jobs: scheduled function runs, can be cancelled, cron counter moves', async ({ page }, info) => {
    test.setTimeout(150_000);
    await page.goto('/jobs');
    await page.getByTestId('job-label').fill('soon');
    await page.getByTestId('job-delay').fill('2');
    await page.getByTestId('job-schedule').click();
    const soon = page.getByTestId('job-item').filter({ hasText: 'soon' });
    await expect(soon.locator('.badge')).toHaveText('scheduled');
    await shot(page, info, 'scheduled');
    await expect(soon.locator('.badge')).toHaveText('done', { timeout: 20_000 });

    await page.getByTestId('job-label').fill('later');
    await page.getByTestId('job-delay').fill('600');
    await page.getByTestId('job-schedule').click();
    const later = page.getByTestId('job-item').filter({ hasText: 'later' });
    await later.getByRole('button', { name: 'Cancel' }).click();
    await expect(later.locator('.badge')).toHaveText('canceled');
    await shot(page, info, 'done-and-canceled');
    // The "heartbeat stat" cron runs every minute and pushes its counter live.
    const cronCount = page.getByTestId('cron-count');
    const ticks = await cronCount.textContent();
    await expect(cronCount).not.toHaveText(ticks ?? '0', { timeout: 75_000 });
    await shot(page, info, 'cron');
  });

  test('mail: delayed email lands in the fake inbox', async ({ page }, info) => {
    await page.goto('/mail');
    const subject = unique('Subject ');
    await page.getByTestId('mail-subject').fill(subject);
    await page.getByTestId('mail-send').click();
    await expect(page.getByTestId('mail-item').filter({ hasText: subject })).toBeVisible();
    await page.getByTestId('mail-item').filter({ hasText: subject }).click();
    await expect(page.getByTestId('mail-body')).toContainText('scheduled mutation');
    await shot(page, info, 'inbox');
  });

  test('system: meta, typed errors, action → HTTP route, one-shot HTTP client', async ({ page }, info) => {
    await page.goto('/system');
    await expect(page.getByTestId('connection-state')).toContainText('"isWebSocketConnected": true');
    await expect(page.getByTestId('meta')).not.toHaveText('null');
    await page.getByTestId('trigger-error').click();
    await expect(page.getByTestId('error-text')).toBeVisible();
    await page.getByTestId('ping').click();
    await expect(page.getByTestId('ping-result')).toContainText('ok');
    await page.getByTestId('http-query').click();
    await expect(page.getByTestId('http-result')).not.toHaveText('null');
    await shot(page, info, 'system');
  });
});

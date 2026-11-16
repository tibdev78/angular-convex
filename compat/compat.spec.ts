import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';

const apps = process.env['COMPAT_APPS'] ?? join(process.env['TMPDIR'] ?? '/tmp', 'ngx-convex-compat');
const shots = join(__dirname, 'screenshots');

/** Every `<apps>/<name>/dist/<name>/browser` produced by run.sh. */
function builds(): { name: string; root: string }[] {
  if (!existsSync(apps)) return [];
  return readdirSync(apps)
    .map((name) => ({ name, root: join(apps, name, 'dist', name, 'browser') }))
    .filter((b) => existsSync(join(b.root, 'index.html')))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve(root: string): Promise<Server> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = join(root, path);
    const target = file.startsWith(root) && existsSync(file) && extname(file) ? file : join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(target)] ?? 'application/octet-stream' });
    res.end(readFileSync(target));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const all = builds();
test('at least one compat build exists', () => expect(all.length, `no builds under ${apps}`).toBeGreaterThan(0));

for (const { name, root } of all) {
  test(`${name}: query, auth, mutation, action against a live deployment`, async ({ page }) => {
    const server = await serve(root);
    try {
      const major = name.match(/^ng(\d+)/)![1];
      await page.goto(`http://localhost:${(server.address() as AddressInfo).port}/`);
      await expect(page.getByTestId('ng-version')).toHaveText(new RegExp(`^${major}\\.`));
      await expect(page.getByTestId('ws')).toHaveText('connected');
      await expect(page.getByTestId('query')).toHaveText('ok');
      await expect(page.getByTestId('signed-out')).toBeVisible();

      await page.getByTestId('sign-up').click();
      await expect(page.getByTestId('signed-in')).toBeVisible();
      await expect(page.getByTestId('signed-out')).toHaveCount(0);
      await expect(page.getByTestId('me')).toHaveText(/^compat/);

      await page.getByTestId('rename').click();
      await expect(page.getByTestId('me')).toHaveText(`Renamed on Angular ${major}`);
      await page.getByTestId('ping').click();
      await expect(page.getByTestId('ping-result')).toHaveText('action ok');
      await expect(page.getByTestId('error')).toHaveText('');

      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: join(shots, `${name}.png`) });
    } finally {
      server.close();
    }
  });
}

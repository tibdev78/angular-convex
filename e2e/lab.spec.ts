import { expect, test } from '@playwright/test';
import { shot, signUpWithPassword } from './helpers';

test.describe('Lab: remaining server primitives', () => {
  test.beforeEach(async ({ page }) => {
    await signUpWithPassword(page);
    await page.goto('/lab');
  });

  test('value types, replace, function handle, pagination, normalizeId, delete', async ({ page }, info) => {
    const rows = page.getByTestId('lab-row');
    await page.getByTestId('lab-create').click();
    await expect(rows).toHaveCount(1);
    const first = rows.first();
    await expect(first).toContainText('{ "apples": 3, "pears": 5 }');
    await expect(first).toContainText('11 B “hello bytes”');
    // 2^53 + 1: only exact as a bigint, so it went through v.int64() untouched.
    await expect(first.getByTestId('lab-big-cell')).toHaveText('9007199254740993n (bigint)');
    await expect(first).toContainText('"list": [ 1, "two", true ]');
    await expect(first).toContainText('null');
    // ctx.db.vars.commitTs resolved to an int64 when the mutation committed.
    await expect(first.getByTestId('lab-commit')).toHaveText('bigint');

    await page.getByTestId('lab-label').fill('second sample');
    await page.getByTestId('lab-note').fill('a note');
    await page.getByTestId('lab-create').click();
    await page.getByTestId('lab-label').fill('third sample');
    await page.getByTestId('lab-create').click();
    await expect(rows).toHaveCount(3);
    // The list reads the commit-order index, newest first.
    await expect(rows.first()).toContainText('third sample');
    await expect(page.getByTestId('lab-overview')).toContainText('"latestLabel": "third sample"');
    await expect(page.getByTestId('lab-overview')).toContainText('"subject":');
    // `for await` over the query, and a q.and(...) filter on the note field.
    await expect(page.getByTestId('lab-overview')).toContainText('"iterated": 3');
    await expect(page.getByTestId('lab-overview')).toContainText('"withNote": 2');
    // A first page read on an empty table stays open-ended (see the README
    // notes): a fresh subscription paginates the three rows by two.
    await page.reload();
    await expect(page.getByTestId('lab-page')).toContainText('2 loaded · CanLoadMore');
    await page.getByTestId('lab-page-more').click();
    await expect(page.getByTestId('lab-page')).toContainText('3 loaded · Exhausted');
    await shot(page, info, 'value-types');

    // db.replace rewrites the whole document; the handle-scheduled mutation adds 10.
    const oldest = rows.last();
    await oldest.getByTestId('lab-replace').click();
    await expect(rows.filter({ hasText: 'first sample (replaced)' })).toContainText('0 B “”');
    const replaced = rows.filter({ hasText: 'first sample (replaced)' });
    await expect(replaced.getByTestId('lab-big-cell')).toHaveText('9007199254740994n (bigint)');
    await expect(replaced.getByTestId('lab-revision')).toHaveText('1');
    await replaced.getByTestId('lab-bump').click();
    await expect(replaced.getByTestId('lab-revision')).toHaveText('11');
    await expect(page.getByTestId('lab-handle')).toContainText('function://');
    // The second bump schedules the handle stored in the document, with runAt.
    await replaced.getByTestId('lab-bump').click();
    await expect(replaced.getByTestId('lab-revision')).toHaveText('21');
    // Read back from the `_scheduled_functions` system table.
    await expect(page.getByTestId('lab-scheduled')).toContainText('lab.js:bump · success');
    await shot(page, info, 'replaced-and-bumped');

    await page.getByTestId('lab-raw-id').fill('not-an-id');
    await expect(page.getByTestId('lab-normalized')).toContainText('"samples": null');
    const sampleId = (await replaced.getAttribute('data-id'))!;
    await page.getByTestId('lab-raw-id').fill(sampleId);
    await expect(page.getByTestId('lab-normalized')).toContainText(`"samples": "${sampleId}"`);
    // The same string is not an id of another table.
    await expect(page.getByTestId('lab-normalized')).toContainText('"users": null');
    await shot(page, info, 'normalize-id');

    await replaced.getByTestId('lab-delete').click();
    await expect(rows).toHaveCount(2);
  });

  test('nested queries, Node action with storage, CORS HTTP route, authenticated HTTP client, throwOnError', async ({ page }, info) => {
    await page.getByTestId('lab-create').click();
    await expect(page.getByTestId('lab-row')).toHaveCount(1);

    await page.getByTestId('lab-nested').click();
    const nested = page.getByTestId('lab-nested-result');
    await expect(nested).toContainText('"limited": 1');
    await expect(nested).toContainText('"stale": 1');
    await expect(nested).not.toContainText('"limitHit": null');

    await page.getByTestId('lab-digest').click();
    const digest = page.getByTestId('lab-digest-result');
    // sha256("angular-convex"), computed with node:crypto in the Node runtime.
    await expect(digest).toContainText('"sha256": "');
    await expect(digest).toContainText('"node": "v');
    await expect(digest).toContainText('"readBack": "angular-convex\\nsha256=');
    await shot(page, info, 'nested-and-node');

    await page.getByTestId('lab-http-anon').click();
    await expect(page.getByTestId('lab-http-result')).toContainText('"status": 401');
    await page.getByTestId('lab-http-upload').click();
    await expect(page.getByTestId('lab-http-result')).toContainText('"status": 200');
    await expect(page.getByTestId('lab-http-result')).toContainText('"contentType": "text/plain"');
    await expect(page.getByTestId('lab-http-readback')).toContainText('uploaded over HTTP at');

    await page.getByTestId('lab-consistent').click();
    await expect(page.getByTestId('lab-consistent-result')).toContainText('"consistentCount": 1');
    await expect(page.getByTestId('lab-consistent-result')).not.toContainText('"identitySubject": null');

    await expect(page.getByTestId('lab-default-error')).toContainText('status error');
    await expect(page.getByTestId('lab-default-error')).toContainText('LAB_FAILURE');
    await expect(page.getByTestId('lab-thrown')).toContainText('caught LAB_THROWN');
    await shot(page, info, 'http-and-errors');
  });
});

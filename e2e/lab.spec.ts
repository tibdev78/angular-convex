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
    // sha256("ngx-convex"), computed with node:crypto in the Node runtime.
    await expect(digest).toContainText('"sha256": "');
    await expect(digest).toContainText('"node": "v');
    await expect(digest).toContainText('"readBack": "ngx-convex\\nsha256=');
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

  test('db.table, log.audit, service URL and token, storage.getMetadata', async ({ page }, info) => {
    await page.getByTestId('lab-via-table').click();
    const table = page.getByTestId('lab-via-table-result');
    await expect(table).toContainText('"patched": 7');
    await expect(table).toContainText('"readBack": "via db.table"');
    await expect(table).toContainText('"queried": 1');
    await expect(table).toContainText('"deleted": true');

    // log.audit from a mutation, with every log.vars field.
    await page.getByTestId('lab-audit').click();
    await expect(page.getByTestId('lab-audit-result')).toContainText('"ok": true');
    await expect(page.getByTestId('lab-audit-result')).toContainText('"value": "recorded"');
    const trail = page.getByTestId('lab-audit-trail');
    await expect(trail.locator('li').first()).toHaveText('lab.audit · mutation');
    await page.getByTestId('lab-platform').click();
    const platform = page.getByTestId('lab-platform-result');
    await expect(platform).toContainText('"metadata"');
    // storage.getMetadata (deprecated, still served) on a blob the action stored.
    await expect(platform).toContainText('size 14 · text/plain · sha256');
    await expect(platform).toContainText('"value": "https://ai-gateway.convex.dev"');
    // getServiceToken depends on the deployment: an anonymous local backend (CI)
    // asks for `npx convex login`; a cloud team on the free plan is told the AI
    // gateway needs a paid plan; a paid team gets a token (only its length is shown).
    // E2E_EXPECT_SERVICE_TOKEN=1 (a paid team) requires the token itself.
    await expect(platform).toContainText(
      process.env['E2E_EXPECT_SERVICE_TOKEN']
        ? /token of \d+ chars/
        : /token of \d+ chars|requires an authenticated local deployment|AI gateway is not enabled for your team/,
    );
    // An action audits through ctx.runMutation; a direct log.audit in an
    // action is refused by every deployment.
    await expect(platform).toContainText(/"audit": \{\s*"ok": true,\s*"value": "recorded \\"lab\.platform\\" via ctx\.runMutation"/);
    await expect(platform).toContainText('Audit logging is not yet supported in actions');
    // Both events are in the live audit trail, newest first.
    await expect(trail.locator('li')).toHaveText(['lab.platform · action', 'lab.audit · mutation']);
    await shot(page, info, 'platform-probes');
  });
});

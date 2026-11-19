// Tests of scripts/check-skills.mjs on a temporary skills/ folder and a fake
// dist/ holding one .d.ts: each test breaks one rule and expects its message.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { checkSkills } from '../check-skills.mjs';

const COMMIT = 'a'.repeat(40);
const HEADER = `<!-- Adapted from get-convex/agent-skills \`convex\` @ \`${COMMIT}\`, Apache-2.0. -->`;
let root, skillsDir, dist, lock;

function writeSkill(name, body, frontmatterName = name) {
  mkdirSync(join(skillsDir, name), { recursive: true });
  writeFileSync(
    join(skillsDir, name, 'SKILL.md'),
    `---\nname: ${frontmatterName}\ndescription: "${name} skill"\n---\n${body}\n`,
  );
}

const router = (...names) =>
  `${HEADER}\n## Installed skills\n${names.map((n) => `- **${n}**: …`).join('\n')}\n`;
const writeLock = () => writeFileSync(join(skillsDir, 'upstream.lock.json'), JSON.stringify(lock));
const problems = () => checkSkills(['--skills-dir', skillsDir, '--dist', dist]).problems;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'check-skills-'));
  skillsDir = join(root, 'skills');
  dist = join(root, 'dist');
  mkdirSync(join(dist, 'types'), { recursive: true });
  writeFileSync(
    join(dist, 'types', 'ngx-convex.d.ts'),
    'export declare function injectQuery(): void;\nexport declare function provideConvex(): void;\n',
  );
  lock = {
    repo: 'x',
    commit: COMMIT,
    selected: ['convex-docs'],
    excluded: {},
    adapted: { convex: { source: 'convex', commit: COMMIT, sha256: 'f'.repeat(64) } },
  };
  writeSkill('convex', router('convex-docs', 'convex-angular'));
  writeSkill(
    'convex-angular',
    'Use `provideConvex(url)`, `injectQuery(ref)` and `provideZonelessChangeDetection()`.',
  );
  writeFileSync(join(skillsDir, 'NOTICE'), '`skills/convex` is adapted.\n');
  writeLock();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test('a consistent skills/ folder passes, Angular names included', () => {
  assert.deepEqual(problems(), []);
});

test('an API the library does not export is reported', () => {
  writeSkill('convex-angular', 'Use `injectQuery` and `injectLiveQuery`.');
  assert.deepEqual(problems(), [
    'convex-angular: cites injectLiveQuery, which ngx-convex does not export.',
  ]);
});

test('a missing dist/ is reported, not taken as a pass', () => {
  rmSync(dist, { recursive: true });
  assert.match(problems().join('\n'), /does not exist: run npm run build:lib first/);
});

test('a frontmatter name that differs from the folder is reported', () => {
  writeSkill('convex-angular', 'body', 'angular');
  assert.match(problems().join('\n'), /convex-angular: frontmatter name is "angular"/);
});

test('an adaptation without header, fingerprint or notice entry is reported', () => {
  writeSkill('convex', router('convex-docs', 'convex-angular').replace(HEADER, ''));
  lock.adapted.convex.sha256 = '';
  writeLock();
  writeFileSync(join(skillsDir, 'NOTICE'), '');
  const report = problems().join('\n');
  assert.match(report, /convex: the header must read/);
  assert.match(
    report,
    /convex: no upstream fingerprint; run: node scripts\/convex-skills\.mjs reviewed convex/,
  );
  assert.match(report, /convex: not mentioned in skills\/NOTICE/);
});

test('a local skill claiming an adaptation the lock does not declare is reported', () => {
  writeSkill('convex-angular', `${HEADER.replace('`convex`', '`convex-x`')}\nUse \`injectQuery\`.`);
  assert.match(problems().join('\n'), /convex-angular: says it is adapted but is not in "adapted"/);
});

test('the router must list exactly the installed skills', () => {
  writeSkill('convex', router('convex-angular', 'convex-billing'));
  assert.deepEqual(problems(), [
    'convex: "convex-docs" is installed but not listed.',
    'convex: lists "convex-billing", which is not installed.',
  ]);
});

test('a skill with two roles in the lock is reported', () => {
  lock.selected.push('convex-angular');
  writeLock();
  assert.match(problems().join('\n'), /two roles: convex-angular: selected \+ local/);
});

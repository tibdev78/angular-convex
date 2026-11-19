// Tests of scripts/convex-skills.mjs against a fake upstream git repository,
// with HOME and the cache in a temporary folder: nothing real is touched.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, test } from 'node:test';
import { main } from '../convex-skills.mjs';
import { MARKER } from './install.mjs';
import { hashSkill } from './upstream.mjs';

let root, upstream, skillsDir, home, env, out;

const git = (...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], {
    cwd: upstream,
    encoding: 'utf8',
  }).trim();

function writeSkill(dir, name, body) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name}\n---\n${body}\n`,
  );
}

/** Commits the given upstream skills (name → body) and returns the commit. */
function commitUpstream(skills) {
  rmSync(join(upstream, 'skills'), { recursive: true, force: true });
  for (const [name, body] of Object.entries(skills))
    writeSkill(join(upstream, 'skills'), name, body);
  git('add', '-A');
  git('commit', '-qm', 'skills');
  return git('rev-parse', 'HEAD');
}

const lockPath = () => join(skillsDir, 'upstream.lock.json');
const readLockFile = () => JSON.parse(readFileSync(lockPath(), 'utf8'));
const run = (args, answer = '') =>
  main([...args, '--skills-dir', skillsDir], {
    env,
    input: Readable.from([answer + '\n']),
    log: (line) => out.push(line),
  });
const installed = (agentDir, name) => join(home, agentDir, 'skills', name);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'convex-skills-'));
  upstream = join(root, 'upstream');
  skillsDir = join(root, 'repo-skills');
  home = join(root, 'home');
  env = { HOME: home, XDG_CACHE_HOME: join(root, 'cache') };
  out = [];
  mkdirSync(upstream);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: upstream });
  const commit = commitUpstream({
    'convex-docs': 'docs v1',
    convex: 'router v1',
    'convex-billing': 'billing v1',
  });
  writeSkill(skillsDir, 'convex', 'angular router');
  writeSkill(skillsDir, 'convex-angular', 'angular');
  const sha256 = hashSkill(join(upstream, 'skills', 'convex'));
  writeFileSync(
    lockPath(),
    JSON.stringify({
      repo: upstream,
      commit,
      selected: ['convex-docs'],
      excluded: { 'convex-billing': 'not used' },
      adapted: { convex: { source: 'convex', commit, sha256 } },
    }),
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test('install puts the selection and the local skills in both agent folders, marked', async () => {
  await run(['install']);
  for (const agent of ['.claude', '.agents']) {
    assert.match(
      readFileSync(join(installed(agent, 'convex-docs'), 'SKILL.md'), 'utf8'),
      /docs v1/,
    );
    assert.match(
      readFileSync(join(installed(agent, 'convex'), 'SKILL.md'), 'utf8'),
      /angular router/,
    );
    assert.ok(existsSync(join(installed(agent, 'convex-angular'), MARKER)));
    assert.ok(!existsSync(installed(agent, 'convex-billing')), 'excluded skills are not installed');
  }
});

test('install refuses a same-name folder it did not create, and writes nothing', async () => {
  writeSkill(join(home, '.agents', 'skills'), 'convex-docs', 'mine');
  await assert.rejects(
    run(['install']),
    /Refusing to overwrite[\s\S]*\.agents\/skills\/convex-docs/,
  );
  assert.match(readFileSync(join(installed('.agents', 'convex-docs'), 'SKILL.md'), 'utf8'), /mine/);
  assert.ok(
    !existsSync(installed('.claude', 'convex-docs')),
    'nothing is installed when one folder conflicts',
  );
});

test('install leaves foreign skills alone and removes only its own deselected ones', async () => {
  writeSkill(join(home, '.claude', 'skills'), 'other-skill', 'not ours');
  await run(['install']);
  const lock = readLockFile();
  writeFileSync(
    lockPath(),
    JSON.stringify({
      ...lock,
      selected: [],
      excluded: { ...lock.excluded, 'convex-docs': 'dropped' },
    }),
  );
  await run(['install']);
  assert.ok(!existsSync(installed('.claude', 'convex-docs')));
  assert.ok(existsSync(join(installed('.claude', 'other-skill'), 'SKILL.md')));
});

test('check reports changed, new and gone skills, and flags an adaptation whose source moved', async () => {
  commitUpstream({ 'convex-billing': 'billing v1', convex: 'router v2', 'convex-new': 'new' });
  await run(['check']);
  const report = out.join('\n');
  assert.match(report, /Selected skills gone upstream[\s\S]*- convex-docs/);
  assert.match(report, /New upstream skills[\s\S]*- convex-new/);
  assert.match(report, /TO REVIEW[\s\S]*- convex \(from convex/);
});

test('check prints the diff of a changed selected skill', async () => {
  commitUpstream({ 'convex-docs': 'docs v2', convex: 'router v1', 'convex-billing': 'billing v1' });
  await run(['check']);
  const report = out.join('\n');
  assert.match(report, /changed upstream:\n {2}- convex-docs/);
  assert.match(report, /-docs v1\n\+docs v2/);
  assert.doesNotMatch(report, /TO REVIEW/);
});

test('update answered "non" changes neither the lock nor the installed skills', async () => {
  await run(['install']);
  const before = readFileSync(lockPath(), 'utf8');
  commitUpstream({ 'convex-docs': 'docs v2', convex: 'router v1', 'convex-billing': 'billing v1' });
  await run(['update'], 'non');
  assert.equal(readFileSync(lockPath(), 'utf8'), before);
  assert.match(
    readFileSync(join(installed('.claude', 'convex-docs'), 'SKILL.md'), 'utf8'),
    /docs v1/,
  );
  assert.match(out.at(-1), /Nothing changed/);
});

test('update answered "oui" installs the latest commit and locks it', async () => {
  await run(['install']);
  const latest = commitUpstream({
    'convex-docs': 'docs v2',
    convex: 'router v1',
    'convex-billing': 'billing v1',
  });
  await run(['update'], 'oui');
  assert.equal(readLockFile().commit, latest);
  assert.match(
    readFileSync(join(installed('.agents', 'convex-docs'), 'SKILL.md'), 'utf8'),
    /docs v2/,
  );
});

test('reviewed records the current upstream source of an adaptation', async () => {
  const lock = readLockFile();
  writeFileSync(
    lockPath(),
    JSON.stringify({ ...lock, adapted: { convex: { ...lock.adapted.convex, sha256: '' } } }),
  );
  await run(['reviewed', 'convex']);
  assert.equal(readLockFile().adapted.convex.sha256, hashSkill(join(upstream, 'skills', 'convex')));
  await assert.rejects(run(['reviewed', 'convex-docs']), /not an adapted skill/);
});

test('a skill both selected and written locally is rejected', async () => {
  writeSkill(skillsDir, 'convex-docs', 'local copy');
  await assert.rejects(run(['check']), /two roles[\s\S]*convex-docs: selected \+ local/);
});

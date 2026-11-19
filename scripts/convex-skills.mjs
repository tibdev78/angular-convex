#!/usr/bin/env node
// convex-skills.mjs — install and update the Convex agent skills for Claude
// Code (~/.claude/skills) and Codex (~/.agents/skills):
//   - the upstream skills listed in skills/upstream.lock.json, taken as they are
//     from get-convex/agent-skills at the locked commit;
//   - the skills of this repository (skills/*), written or adapted for Angular.
//
//   node scripts/convex-skills.mjs install          install the locked selection
//   node scripts/convex-skills.mjs check            compare with the latest upstream commit
//   node scripts/convex-skills.mjs update           check, then ask before installing it
//   node scripts/convex-skills.mjs reviewed <name>  record that an adaptation matches upstream again
//
// Options: --skills-dir <dir> (default: skills/ of this repository).
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentSkillDirs, applyInstall, planInstall } from './convex-skills/install.mjs';
import { readLock, roleConflicts, writeLock } from './convex-skills/lock.mjs';
import { compare, diff, hasNews, summary } from './convex-skills/report.mjs';
import {
  cacheRoot,
  checkout,
  commitDate,
  hashSkill,
  latestCommit,
  listSkills,
} from './convex-skills/upstream.mjs';

const short = (sha) => sha.slice(0, 7);

function context(argv, env) {
  const at = argv.indexOf('--skills-dir');
  const skillsDir =
    at === -1
      ? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
      : resolve(argv[at + 1]);
  const lockPath = join(skillsDir, 'upstream.lock.json');
  const lock = readLock(lockPath);
  const local = listSkills(skillsDir);
  const conflicts = roleConflicts(lock, local);
  if (conflicts.length)
    throw new Error(`${lockPath}: a skill has two roles:\n  ${conflicts.join('\n  ')}`);
  const args = argv.filter((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--skills-dir');
  return {
    skillsDir,
    lockPath,
    lock,
    local,
    home: env.HOME || homedir(),
    cache: cacheRoot(env),
    args,
  };
}

/** Upstream selection at `commit`, plus this repository's skills. */
function wantedSkills(ctx, commit) {
  const tree = checkout(ctx.lock.repo, commit, ctx.cache);
  const upstream = ctx.lock.selected.map((name) => ({
    name,
    from: join(tree, 'skills', name),
    origin: `${ctx.lock.repo}@${commit}`,
  }));
  const local = ctx.local.map((name) => ({
    name,
    from: join(ctx.skillsDir, name),
    origin: 'ngx-convex',
  }));
  return [...upstream, ...local];
}

function install(ctx, commit, log) {
  const plan = planInstall(wantedSkills(ctx, commit), agentSkillDirs(ctx.home));
  applyInstall(plan);
  const names = [...new Set(plan.write.map((w) => w.skill.name))];
  log(
    `✓ ${names.length} skills installed in ${agentSkillDirs(ctx.home).join(' and ')}:\n  ${names.join(', ')}`,
  );
  if (plan.remove.length) log(`✓ removed, no longer selected:\n  ${plan.remove.join('\n  ')}`);
}

function check(ctx, log) {
  const latest = latestCommit(ctx.lock.repo);
  const lockedTree = checkout(ctx.lock.repo, ctx.lock.commit, ctx.cache);
  const latestTree = checkout(ctx.lock.repo, latest, ctx.cache);
  log(
    `${ctx.lock.repo}\n  locked  ${short(ctx.lock.commit)} (${commitDate(lockedTree)})\n  latest  ${short(latest)} (${commitDate(latestTree)})`,
  );
  const changes = compare(ctx.lock, lockedTree, latestTree, ctx.local);
  log(summary(changes));
  const patch = diff(lockedTree, latestTree, changes.changed, { color: process.stdout.isTTY });
  if (patch) log(`\n${patch}`);
  return { latest, changes };
}

async function confirm(question, input) {
  const rl = createInterface({ input, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return ['o', 'oui', 'y', 'yes'].includes(answer);
}

async function update(ctx, log, input) {
  const { latest, changes } = check(ctx, log);
  if (latest === ctx.lock.commit && !hasNews(changes)) return;
  if (latest === ctx.lock.commit)
    return log('\nSame commit: only the lock needs attention (see above).');
  if (!(await confirm(`\nInstall ${short(latest)} for the selection above? [y/N] `, input)))
    return log('Nothing changed.');
  const next = { ...ctx.lock, commit: latest };
  install({ ...ctx, lock: next }, latest, log);
  writeLock(ctx.lockPath, next);
  log(`✓ ${ctx.lockPath} now locks ${short(latest)}.`);
  if (changes.drifted.length)
    log(
      '⚠ Review the adaptations listed above, then run: node scripts/convex-skills.mjs reviewed <name>',
    );
}

function reviewed(ctx, name, log) {
  const adaptation = ctx.lock.adapted[name];
  if (!adaptation)
    throw new Error(`"${name}" is not an adapted skill (see "adapted" in ${ctx.lockPath}).`);
  const tree = checkout(ctx.lock.repo, ctx.lock.commit, ctx.cache);
  ctx.lock.adapted[name] = {
    ...adaptation,
    commit: ctx.lock.commit,
    sha256: hashSkill(join(tree, 'skills', adaptation.source)),
  };
  writeLock(ctx.lockPath, ctx.lock);
  log(`✓ ${name} recorded as matching ${adaptation.source} at ${short(ctx.lock.commit)}.`);
}

export async function main(
  argv,
  { env = process.env, input = process.stdin, log = console.log } = {},
) {
  const ctx = context(argv, env);
  const [command, name] = ctx.args;
  if (command === 'install') return install(ctx, ctx.lock.commit, log);
  if (command === 'check') return void check(ctx, log);
  if (command === 'update') return update(ctx, log, input);
  if (command === 'reviewed' && name) return reviewed(ctx, name, log);
  throw new Error(
    'Usage: convex-skills.mjs install | check | update | reviewed <name> [--skills-dir <dir>]',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}

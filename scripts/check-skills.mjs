#!/usr/bin/env node
// check-skills.mjs — CI check of skills/ (run after npm run build:lib):
// frontmatter, lock coherence, adaptation headers and notice, the router's
// list, and that every ngx-convex API a skill cites exists in dist/.
//
//   node scripts/check-skills.mjs [--skills-dir <dir>] [--dist <dir>]
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkAdaptations,
  checkApis,
  checkFrontmatter,
  checkRouter,
} from './convex-skills/checks.mjs';
import { readLock, roleConflicts } from './convex-skills/lock.mjs';
import { listSkills } from './convex-skills/upstream.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function option(argv, flag, fallback) {
  const at = argv.indexOf(flag);
  return at === -1 ? fallback : resolve(argv[at + 1]);
}

export function checkSkills(argv) {
  const skillsDir = option(argv, '--skills-dir', join(repo, 'skills'));
  const distDir = option(argv, '--dist', join(repo, 'dist', 'ngx-convex'));
  const lock = readLock(join(skillsDir, 'upstream.lock.json'));
  const local = listSkills(skillsDir);
  return {
    local,
    problems: [
      ...roleConflicts(lock, local).map(
        (conflict) => `upstream.lock.json: a skill has two roles: ${conflict}`,
      ),
      ...checkFrontmatter(skillsDir, local),
      ...checkAdaptations(skillsDir, lock, local),
      ...checkRouter(skillsDir, lock, local),
      ...checkApis(skillsDir, local, distDir),
    ],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { local, problems } = checkSkills(process.argv.slice(2));
  if (problems.length) {
    console.error(`✗ skills/: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`✓ skills/: ${local.length} skills consistent (${local.join(', ')}).`);
}

// upstream.mjs — fetch get-convex/agent-skills at an exact commit into a cache,
// and fingerprint its skills. git is the only tool used.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function cacheRoot(env = process.env) {
  return join(env.XDG_CACHE_HOME || join(env.HOME || homedir(), '.cache'), 'ngx-convex-skills');
}

/** Commit the upstream default branch points to now. */
export function latestCommit(repo) {
  const line = git(['ls-remote', repo, 'HEAD']);
  const sha = line.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha ?? ''))
    throw new Error(`git ls-remote ${repo} HEAD returned no commit.`);
  return sha;
}

/**
 * Directory holding the upstream tree at `commit`. Fetched once, then reused:
 * a commit never changes, so the cache never goes stale.
 */
export function checkout(repo, commit, root) {
  const dir = join(root, commit);
  if (existsSync(join(dir, '.complete'))) return dir;
  const tmp = `${dir}.partial-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  git(['init', '-q'], tmp);
  git(['fetch', '-q', '--depth', '1', repo, commit], tmp);
  git(['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD'], tmp);
  writeFileSync(join(tmp, '.complete'), commit + '\n');
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
  return dir;
}

export function commitDate(dir) {
  return git(['log', '-1', '--format=%cs'], dir);
}

/** Skill folders (those holding a SKILL.md) directly under `skillsDir`. */
export function listSkills(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((name) => existsSync(join(skillsDir, name, 'SKILL.md')))
    .sort();
}

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map((entry) => join(dir, String(entry)))
    .filter((path) => statSync(path).isFile())
    .sort();
}

/** sha256 of a skill folder: every file's relative path and content. */
export function hashSkill(dir) {
  const hash = createHash('sha256');
  for (const file of filesUnder(dir)) {
    hash.update(relative(dir, file)).update('\0').update(readFileSync(file)).update('\0');
  }
  return hash.digest('hex');
}

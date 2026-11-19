// lock.mjs — skills/upstream.lock.json: which upstream commit is installed,
// which upstream skills are taken as they are, and which ones were adapted.
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * @typedef {{ source: string, commit: string, sha256: string }} Adaptation
 * @typedef {{
 *   repo: string,
 *   commit: string,
 *   selected: string[],
 *   excluded: Record<string, string>,
 *   adapted: Record<string, Adaptation>,
 * }} Lock
 */

/** @returns {Lock} */
export function readLock(path) {
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  for (const key of ['repo', 'commit']) {
    if (typeof lock[key] !== 'string' || lock[key] === '')
      throw new Error(`${path}: "${key}" is missing.`);
  }
  if (!Array.isArray(lock.selected)) throw new Error(`${path}: "selected" must be a list.`);
  lock.excluded ??= {};
  lock.adapted ??= {};
  return lock;
}

/** @param {Lock} lock */
export function writeLock(path, lock) {
  writeFileSync(path, JSON.stringify(lock, null, 2) + '\n');
}

/**
 * Names that appear in two roles at once: a skill is either installed from
 * upstream, adapted here, or excluded.
 * @param {Lock} lock
 * @param {string[]} localSkills
 */
export function roleConflicts(lock, localSkills) {
  const roles = new Map();
  const add = (name, role) => roles.set(name, [...(roles.get(name) ?? []), role]);
  lock.selected.forEach((name) => add(name, 'selected'));
  Object.keys(lock.excluded).forEach((name) => add(name, 'excluded'));
  localSkills.forEach((name) => add(name, 'local'));
  return [...roles]
    .filter(([, list]) => list.length > 1)
    .map(([name, list]) => `${name}: ${list.join(' + ')}`);
}

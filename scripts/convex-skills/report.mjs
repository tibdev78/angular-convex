// report.mjs — what changed upstream between the locked commit and another one,
// seen from the selection: changed, vanished and new skills, and adaptations
// whose upstream source moved.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { hashSkill, listSkills } from './upstream.mjs';

/**
 * @typedef {import('./lock.mjs').Lock} Lock
 * @typedef {{ changed: string[], vanished: string[], unclassified: string[], drifted: string[] }} Changes
 * @param {Lock} lock
 * @param {string} lockedTree upstream tree at lock.commit
 * @param {string} latestTree upstream tree at the commit being considered
 * @param {string[]} localSkills skills adapted or written here
 * @returns {Changes}
 */
export function compare(lock, lockedTree, latestTree, localSkills) {
  const before = join(lockedTree, 'skills');
  const after = join(latestTree, 'skills');
  const afterSkills = listSkills(after);
  const exists = new Set(afterSkills);
  const known = new Set([...lock.selected, ...Object.keys(lock.excluded), ...localSkills]);
  const sources = new Set(Object.values(lock.adapted).map((a) => a.source));
  return {
    changed: lock.selected.filter(
      (name) => exists.has(name) && hashSkill(join(before, name)) !== hashSkill(join(after, name)),
    ),
    vanished: lock.selected.filter((name) => !exists.has(name)),
    unclassified: afterSkills.filter((name) => !known.has(name) && !sources.has(name)),
    drifted: Object.entries(lock.adapted)
      .filter(([, a]) => !exists.has(a.source) || hashSkill(join(after, a.source)) !== a.sha256)
      .map(([name, a]) => `${name} (from ${a.source}, reviewed at ${a.commit.slice(0, 7)})`),
  };
}

export const hasNews = (c) =>
  c.changed.length + c.vanished.length + c.unclassified.length + c.drifted.length > 0;

/** @param {Changes} c */
export function summary(c) {
  const lines = [];
  const section = (title, list) =>
    list.length && lines.push(`${title}\n${list.map((item) => `  - ${item}`).join('\n')}`);
  section('~ Selected skills changed upstream:', c.changed);
  section('- Selected skills gone upstream (remove them from "selected"):', c.vanished);
  section(
    '+ New upstream skills, neither selected nor excluded (classify them in the lock):',
    c.unclassified,
  );
  section('⚠ TO REVIEW — the upstream source of an Angular adaptation changed:', c.drifted);
  return lines.length ? lines.join('\n') : '= Nothing changed upstream for this selection.';
}

/** Full diff of the changed selected skills, as git prints it. */
export function diff(lockedTree, latestTree, names, { color = false } = {}) {
  return names
    .map((name) => {
      try {
        execFileSync(
          'git',
          [
            'diff',
            '--no-index',
            `--color=${color ? 'always' : 'never'}`,
            join(lockedTree, 'skills', name),
            join(latestTree, 'skills', name),
          ],
          {
            encoding: 'utf8',
          },
        );
        return '';
      } catch (error) {
        if (error.status === 1) return error.stdout; // 1 = the trees differ
        throw error;
      }
    })
    .join('');
}

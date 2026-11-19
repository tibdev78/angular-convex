// install.mjs — copy skills into the agents' skill folders. Each installed
// folder carries a marker; only marked folders are ever replaced or removed,
// so skills from agentic-workflow or anything else are never touched.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const MARKER = '.ngx-convex-skills';

/** Claude Code and Codex (which reads ~/.agents/skills). */
export function agentSkillDirs(home) {
  return [join(home, '.claude', 'skills'), join(home, '.agents', 'skills')];
}

const isOurs = (dir) => existsSync(join(dir, MARKER));

/**
 * @typedef {{ name: string, from: string, origin: string }} Wanted
 * @typedef {{ write: { dest: string, skill: Wanted }[], remove: string[], conflicts: string[] }} InstallPlan
 * @param {Wanted[]} wanted
 * @param {string[]} targets
 * @returns {InstallPlan}
 */
export function planInstall(wanted, targets) {
  const plan = { write: [], remove: [], conflicts: [] };
  const names = new Set(wanted.map((skill) => skill.name));
  for (const target of targets) {
    for (const skill of wanted) {
      const dest = join(target, skill.name);
      if (existsSync(dest) && !isOurs(dest)) plan.conflicts.push(dest);
      else plan.write.push({ dest, skill });
    }
    if (!existsSync(target)) continue;
    for (const name of readdirSync(target)) {
      const dir = join(target, name);
      if (!names.has(name) && isOurs(dir)) plan.remove.push(dir);
    }
  }
  return plan;
}

/** Writes through a sibling folder so a failed copy never leaves half a skill. */
function writeSkill(dest, skill) {
  const tmp = `${dest}.installing`;
  rmSync(tmp, { recursive: true, force: true });
  cpSync(skill.from, tmp, { recursive: true });
  writeFileSync(join(tmp, MARKER), JSON.stringify({ origin: skill.origin }) + '\n');
  rmSync(dest, { recursive: true, force: true });
  renameSync(tmp, dest);
}

/** @param {InstallPlan} plan */
export function applyInstall(plan) {
  if (plan.conflicts.length)
    throw new Error(
      `Refusing to overwrite folders this script did not install:\n  ${plan.conflicts.join('\n  ')}`,
    );
  for (const { dest, skill } of plan.write) {
    mkdirSync(join(dest, '..'), { recursive: true });
    writeSkill(dest, skill);
  }
  for (const dir of plan.remove) rmSync(dir, { recursive: true, force: true });
}

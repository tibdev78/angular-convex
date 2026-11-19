// checks.mjs — consistency of skills/: frontmatter, adaptation headers and
// notice, the router's skill list, and the ngx-convex APIs the skills cite.
// Each check returns a list of problems; an empty list means it passes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Angular names the skills may cite: they are not ngx-convex exports. */
export const ANGULAR_NAMES = new Set([
  'provideZonelessChangeDetection',
  'provideZoneChangeDetection',
  'provideExperimentalZonelessChangeDetection',
  'runInInjectionContext',
  'provideRouter',
  'provideHttpClient',
]);

/** Identifiers shaped like ngx-convex APIs (injectors, providers, helpers, directives). */
const API_NAME =
  /\*?\b(inject[A-Z]\w*|provide[A-Z]\w*|prewarm[A-Z]\w*|convexQueryOptions|fromConvexQuery|skipToken|insertAt[A-Z]\w*|optimisticallyUpdateValueInPaginatedQuery|FakeConvexClient|flushEffects|supportsWebAuthn|convex(?:Authenticated|Unauthenticated|AuthLoading|AuthRefreshing))\b/g;

const NAME_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DESCRIPTION_MAX = 1024;

const readSkill = (skillsDir, name) => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');

export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0)
      fields[line.slice(0, at).trim()] = line
        .slice(at + 1)
        .trim()
        .replace(/^"(.*)"$/, '$1');
  }
  return fields;
}

export function checkFrontmatter(skillsDir, local) {
  return local.flatMap((name) => {
    const fields = parseFrontmatter(readSkill(skillsDir, name));
    if (!fields) return [`${name}: SKILL.md has no frontmatter.`];
    const problems = [];
    if (fields.name !== name)
      problems.push(`${name}: frontmatter name is "${fields.name}", expected the folder name.`);
    if (!NAME_RULE.test(name))
      problems.push(`${name}: a skill name is lowercase words joined by hyphens.`);
    if (!fields.description) problems.push(`${name}: description is missing.`);
    else if (fields.description.length > DESCRIPTION_MAX)
      problems.push(`${name}: description exceeds ${DESCRIPTION_MAX} characters.`);
    return problems;
  });
}

/** Every adaptation is a local skill whose header names its upstream source and commit, and is in NOTICE. */
export function checkAdaptations(skillsDir, lock, local) {
  const notice = existsSync(join(skillsDir, 'NOTICE'))
    ? readFileSync(join(skillsDir, 'NOTICE'), 'utf8')
    : '';
  const problems = Object.entries(lock.adapted).flatMap(([name, a]) => {
    if (!local.includes(name))
      return [`${name}: listed in "adapted" but skills/${name}/SKILL.md is missing.`];
    const out = [];
    const header = `Adapted from get-convex/agent-skills \`${a.source}\` @ \`${a.commit}\``;
    if (!readSkill(skillsDir, name).includes(header))
      out.push(`${name}: the header must read: ${header}`);
    if (!/^[0-9a-f]{64}$/.test(a.sha256 ?? ''))
      out.push(
        `${name}: no upstream fingerprint; run: node scripts/convex-skills.mjs reviewed ${name}`,
      );
    if (!notice.includes(`skills/${name}\``)) out.push(`${name}: not mentioned in skills/NOTICE.`);
    return out;
  });
  const undeclared = local.filter(
    (name) =>
      !lock.adapted[name] &&
      readSkill(skillsDir, name).includes('Adapted from get-convex/agent-skills'),
  );
  return [
    ...problems,
    ...undeclared.map(
      (name) => `${name}: says it is adapted but is not in "adapted" of upstream.lock.json.`,
    ),
  ];
}

/** The router (skills/convex) lists exactly the other installed skills. */
export function checkRouter(skillsDir, lock, local) {
  if (!local.includes('convex')) return [];
  const section = readSkill(skillsDir, 'convex').split('## Installed skills')[1];
  if (section === undefined) return ['convex: the "## Installed skills" section is missing.'];
  const listed = new Set([...section.matchAll(/^- \*\*([\w-]+)\*\*/gm)].map((m) => m[1]));
  const installed = new Set([...lock.selected, ...local].filter((name) => name !== 'convex'));
  return [
    ...[...installed]
      .filter((name) => !listed.has(name))
      .map((name) => `convex: "${name}" is installed but not listed.`),
    ...[...listed]
      .filter((name) => !installed.has(name))
      .map((name) => `convex: lists "${name}", which is not installed.`),
  ];
}

function declarations(distDir) {
  return readdirSync(distDir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.d.ts'))
    .map((file) => readFileSync(join(distDir, file), 'utf8'))
    .join('\n');
}

/** Every ngx-convex-shaped name a local skill cites exists in the built library's types. */
export function checkApis(skillsDir, local, distDir) {
  if (!existsSync(distDir)) return [`${distDir} does not exist: run npm run build:lib first.`];
  const types = declarations(distDir);
  const known = new Set(types.match(/\b\w+\b/g));
  return local.flatMap((name) => {
    const cited = new Set([...readSkill(skillsDir, name).matchAll(API_NAME)].map((m) => m[1]));
    return [...cited]
      .filter((api) => !known.has(api) && !ANGULAR_NAMES.has(api))
      .map((api) => `${name}: cites ${api}, which ngx-convex does not export.`);
  });
}

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface Cache {
  key: string;
  value: string;
}

let cache: Cache | undefined;

/**
 * Loads the Markdown skill library into a single prompt block. Cached by the
 * directory's file signature so repeated turns are cheap.
 */
export function loadSkills(dir = process.env.SKILLS_DIR ?? 'skills'): string {
  if (!existsSync(dir)) return '';
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  const signature = files
    .map((name) => `${name}:${statSync(join(dir, name)).mtimeMs}`)
    .join('|');
  if (cache?.key === signature) return cache.value;
  const value = files
    .map(
      (name) =>
        `## Skill: ${name.replace(/\.md$/, '')}\n\n${readFileSync(
          join(dir, name),
          'utf8',
        )}`,
    )
    .join('\n\n---\n\n')
    .slice(0, 24000);
  cache = { key: signature, value };
  return value;
}

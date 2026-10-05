import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import { defineTool, type ToolDefinition } from './tools.js';

const MARKDOWN = (path: string) =>
  path.endsWith('.md') || path.endsWith('.markdown');

/**
 * Obsidian vault tools. Paths are relative to the vault root and cannot escape
 * it. Returns an empty list when OBSIDIAN_VAULT_PATH is not configured.
 */
export function obsidianTools(root: string | undefined): ToolDefinition[] {
  if (!root || !existsSync(root)) return [];
  const base = resolve(root);
  const safe = (relative: string) => {
    const full = resolve(base, relative);
    if (full !== base && !full.startsWith(base + sep))
      throw new Error('Path escapes the Obsidian vault.');
    return full;
  };
  return [
    defineTool({
      name: 'obsidian_read_note',
      description:
        'Read a Markdown note from the local Obsidian vault by its vault-relative path.',
      parameters: z.object({ path: z.string().min(1).max(300) }),
      execute: ({ path }) => {
        if (!MARKDOWN(path))
          throw new Error('Only Markdown notes can be read.');
        const full = safe(path);
        if (!existsSync(full)) throw new Error('Note not found in the vault.');
        return readFileSync(full, 'utf8').slice(0, 50000);
      },
    }),
    defineTool({
      name: 'obsidian_write_note',
      description:
        'Create or update a Markdown note in the local Obsidian vault. Use for GDD, specs and DevLog entries.',
      parameters: z.object({
        path: z.string().min(1).max(300),
        content: z.string().max(100000),
      }),
      execute: ({ path, content }) => {
        if (!MARKDOWN(path))
          throw new Error('Only Markdown notes can be written.');
        const full = safe(path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content, 'utf8');
        return { saved: path, bytes: content.length };
      },
    }),
    defineTool({
      name: 'obsidian_list_notes',
      description:
        'List Markdown notes in the vault, optionally limited to a folder.',
      parameters: z.object({ folder: z.string().max(300).optional() }),
      execute: ({ folder }) => {
        const full = safe(folder ?? '.');
        if (!existsSync(full)) return [];
        return readdirSync(full)
          .filter(MARKDOWN)
          .slice(0, 200);
      },
    }),
  ];
}

/** Reads GDD/DevLog context from the vault for game/dev Dots. */
export function vaultPrimer(
  root: string | undefined,
  files: string[] = ['GDD.md', 'DevLog.md'],
): string {
  if (!root || !existsSync(root)) return '';
  const base = resolve(root);
  return files
    .map((name) => {
      const full = resolve(base, name);
      if (!full.startsWith(base) || !existsSync(full)) return '';
      return `### ${name}\n\n${readFileSync(full, 'utf8').slice(-4000)}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import { defineTool, type ToolDefinition } from './tools.js';

export interface DevToolsConfig {
  devDockerEnabled?: boolean;
  devDockerImage?: string;
  godotDockerImage?: string;
  devWorkspaceRoot?: string;
}

function runDocker(
  image: string,
  workspace: string,
  command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((settle) => {
    execFile(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '-v',
        `${workspace}:/workspace`,
        '-w',
        '/workspace',
        image,
        'sh',
        '-lc',
        command,
      ],
      {
        timeout: Number(process.env.DOCKER_TIMEOUT_MS ?? 300000),
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const code = (error as { code?: number | string } | null)?.code;
        const exitCode =
          typeof code === 'number' ? code : error ? 1 : 0;
        settle({
          exitCode,
          stdout: String(stdout ?? '').slice(-20000),
          stderr: String(stderr ?? '').slice(-8000),
        });
      },
    );
  });
}

/**
 * Dev-loop tools for dev-hermes-dot: a persistent per-Dot workspace plus
 * optional isolated Docker execution for web builds and Godot projects.
 */
export function devTools(
  config: DevToolsConfig,
  dotId: string,
): ToolDefinition[] {
  const root = resolve(config.devWorkspaceRoot ?? 'data/workspaces', dotId);
  mkdirSync(root, { recursive: true });
  const safe = (relative: string) => {
    const full = resolve(root, relative);
    if (full !== root && !full.startsWith(root + sep))
      throw new Error('Path escapes the Dot workspace.');
    return full;
  };
  const tools: ToolDefinition[] = [
    defineTool({
      name: 'dev_list_files',
      description: 'List files in this Dot\u2019s persistent project workspace.',
      parameters: z.object({ folder: z.string().max(300).optional() }),
      execute: ({ folder }) => {
        const full = safe(folder ?? '.');
        return existsSync(full) ? readdirSync(full).slice(0, 200) : [];
      },
    }),
    defineTool({
      name: 'dev_read_file',
      description: 'Read a file from this Dot\u2019s workspace.',
      parameters: z.object({ path: z.string().min(1).max(300) }),
      execute: ({ path }) => {
        const full = safe(path);
        if (!existsSync(full)) throw new Error('File not found.');
        return readFileSync(full, 'utf8').slice(0, 60000);
      },
    }),
    defineTool({
      name: 'dev_write_file',
      description:
        'Create or overwrite a file in this Dot\u2019s workspace (scripts, GDScript, configs).',
      parameters: z.object({
        path: z.string().min(1).max(300),
        content: z.string().max(200000),
      }),
      execute: ({ path, content }) => {
        const full = safe(path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content, 'utf8');
        return { saved: path, bytes: content.length };
      },
    }),
  ];
  if (config.devDockerEnabled)
    tools.push(
      defineTool({
        name: 'dev_docker_exec',
        description:
          'Run a shell command inside an isolated Docker container with this Dot\u2019s workspace mounted at /workspace. Use runtime "web" for Node/web projects (npm, tests, builds) and "godot" for Godot imports, exports and headless runs.',
        parameters: z.object({
          command: z.string().min(1).max(4000),
          runtime: z.enum(['web', 'godot']).default('web'),
        }),
        execute: ({ command, runtime }) =>
          runDocker(
            runtime === 'godot'
              ? (config.godotDockerImage ?? 'barichello/godot-ci:4.3')
              : (config.devDockerImage ?? 'node:24'),
            root,
            command,
          ),
      }),
    );
  return tools;
}

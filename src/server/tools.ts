import type { z } from 'zod';

/** Provider-agnostic tool definition shared by agents and the AG-UI runtime. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute?: (input: unknown) => unknown | Promise<unknown>;
}

interface ToolConfig<TInput> {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  execute?: (input: TInput) => unknown | Promise<unknown>;
}

export function defineTool<TInput>(config: ToolConfig<TInput>): ToolDefinition {
  return config as unknown as ToolDefinition;
}

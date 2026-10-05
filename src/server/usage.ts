export interface ParsedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Extracts token usage from a TanStack AI RUN_FINISHED chunk. */
export function parseUsage(chunk: unknown): ParsedUsage {
  const raw = chunk as {
    usage?: unknown;
    promptTokens?: unknown;
    completionTokens?: unknown;
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
  };
  let usage: Record<string, unknown> | undefined;
  if (Array.isArray(raw.usage)) usage = raw.usage.at(-1) as Record<string, unknown>;
  else if (raw.usage && typeof raw.usage === 'object')
    usage = raw.usage as Record<string, unknown>;
  const source = usage ?? raw;
  const inputTokens =
    asNumber(source.promptTokens) || asNumber(source.inputTokens);
  const outputTokens =
    asNumber(source.completionTokens) || asNumber(source.outputTokens);
  const totalTokens =
    asNumber(source.totalTokens) || inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

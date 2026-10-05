import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import type { BaseEvent, Message, RunAgentInput } from '@ag-ui/core';

interface TanStackChunk {
  type?: string;
  name?: string;
  value?: { toolCallId?: string; toolName?: string };
  message?: string;
  delta?: string;
  toolCallId?: string;
  toolCallName?: string;
  content?: unknown;
  result?: unknown;
  messageId?: string;
}

function convertUserContent(content: unknown): unknown {
  if (!content) return null;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  if (content.length === 0) return '';
  const parts: unknown[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object' || !('type' in part)) continue;
    const value = part as Record<string, unknown>;
    if (value.type === 'text' && value.text != null)
      parts.push({ type: 'text', content: value.text });
  }
  return parts.length > 0 ? parts : '';
}

/**
 * Recursively normalizes a client tool JSON Schema so OpenAI-compatible
 * providers accept it as a function-tool schema (close open objects).
 */
function sanitizeClientToolSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeClientToolSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const node = { ...(schema as Record<string, unknown>) };
  if ('additionalProperties' in node) node.additionalProperties = false;
  if (node.properties && typeof node.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      node.properties as Record<string, unknown>,
    ))
      props[key] = sanitizeClientToolSchema(value);
    node.properties = props;
  }
  if ('items' in node) node.items = sanitizeClientToolSchema(node.items);
  for (const combinator of ['anyOf', 'allOf', 'oneOf'])
    if (Array.isArray(node[combinator]))
      node[combinator] = (node[combinator] as unknown[]).map(
        sanitizeClientToolSchema,
      );
  return node;
}

export function convertInputToTanStackAI(input: RunAgentInput): {
  messages: unknown[];
  systemPrompts: string[];
  tools: unknown[];
} {
  const chatRoles = new Set(['user', 'assistant', 'tool']);
  const messages = input.messages
    .filter((message: Message) => chatRoles.has(message.role))
    .map((message: Message) => {
      const value = message as unknown as Record<string, unknown>;
      const output: Record<string, unknown> = {
        role: message.role,
        content:
          message.role === 'user'
            ? convertUserContent(message.content)
            : typeof message.content === 'string'
              ? message.content
              : null,
      };
      if (message.role === 'assistant' && Array.isArray(value.toolCalls))
        output.toolCalls = value.toolCalls;
      if (message.role === 'tool' && value.toolCallId)
        output.toolCallId = value.toolCallId;
      return output;
    });
  const systemPrompts: string[] = [];
  for (const message of input.messages)
    if (
      (message.role === 'system' || message.role === 'developer') &&
      message.content
    )
      systemPrompts.push(
        typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content),
      );
  const tools = (input.tools ?? []).map((tool) => ({
    __toolSide: 'client',
    name: tool.name,
    description: tool.description,
    inputSchema: sanitizeClientToolSchema(tool.parameters),
  }));
  return { messages, systemPrompts, tools };
}

function safeParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Converts a TanStack AI stream into AG-UI content events. Lifecycle events
 * (RUN_STARTED / RUN_FINISHED / RUN_ERROR) are owned by HarnessAgent.
 */
export async function* convertTanStackStream(
  stream: AsyncIterable<unknown>,
  abortSignal: AbortSignal,
  onRunFinished?: (chunk: unknown) => void,
): AsyncGenerator<BaseEvent> {
  const messageId = randomUUID();
  const toolNamesById = new Map<string, string>();
  const startedToolCalls = new Set<string>();
  const endedToolCalls = new Set<string>();
  let reasoningRunOpen = false;
  let reasoningMessageOpen = false;
  const reasoningMessageId = randomUUID();
  function* closeReasoningIfOpen(): Generator<BaseEvent> {
    if (reasoningMessageOpen) {
      reasoningMessageOpen = false;
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoningMessageId,
      };
    }
    if (reasoningRunOpen) {
      reasoningRunOpen = false;
      yield { type: EventType.REASONING_END, messageId: reasoningMessageId };
    }
  }
  for await (const chunk of stream) {
    if (abortSignal.aborted) break;
    const raw = chunk as TanStackChunk;
    const type = raw.type;
    if (type === 'CUSTOM' && raw.name === 'approval-requested') continue;
    if (type === 'RUN_FINISHED' || type === 'RUN_STARTED') {
      if (type === 'RUN_FINISHED') onRunFinished?.(chunk);
      continue;
    }
    if (type === 'RUN_ERROR')
      throw new Error(
        typeof raw.message === 'string' ? raw.message : 'TanStack AI run error',
      );
    if (type === 'TEXT_MESSAGE_CONTENT' && raw.delta != null) {
      yield* closeReasoningIfOpen();
      yield {
        type: EventType.TEXT_MESSAGE_CHUNK,
        role: 'assistant',
        messageId,
        delta: raw.delta,
      };
    } else if (type === 'TOOL_CALL_START') {
      const toolCallId = raw.toolCallId ?? '';
      if (startedToolCalls.has(toolCallId)) continue;
      startedToolCalls.add(toolCallId);
      yield* closeReasoningIfOpen();
      toolNamesById.set(toolCallId, raw.toolCallName ?? '');
      yield {
        type: EventType.TOOL_CALL_START,
        parentMessageId: messageId,
        toolCallId,
        toolCallName: raw.toolCallName ?? '',
      };
    } else if (type === 'TOOL_CALL_ARGS') {
      if (endedToolCalls.has(raw.toolCallId ?? '')) continue;
      yield* closeReasoningIfOpen();
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: raw.toolCallId ?? '',
        delta: raw.delta ?? '',
      };
    } else if (type === 'TOOL_CALL_END') {
      const toolCallId = raw.toolCallId ?? '';
      if (endedToolCalls.has(toolCallId)) continue;
      endedToolCalls.add(toolCallId);
      yield* closeReasoningIfOpen();
      yield { type: EventType.TOOL_CALL_END, toolCallId };
    } else if (type === 'TOOL_CALL_RESULT') {
      yield* closeReasoningIfOpen();
      const toolCallId = raw.toolCallId ?? '';
      const payload = raw.content ?? raw.result;
      const serialized =
        typeof payload === 'string'
          ? payload
          : JSON.stringify(safeParse(payload) ?? null);
      yield {
        type: EventType.TOOL_CALL_RESULT,
        role: 'tool',
        messageId: randomUUID(),
        toolCallId,
        content: serialized,
      };
      toolNamesById.delete(toolCallId);
    } else if (type === 'REASONING_START') {
      yield* closeReasoningIfOpen();
      reasoningRunOpen = true;
      yield { type: EventType.REASONING_START, messageId: reasoningMessageId };
    } else if (type === 'REASONING_MESSAGE_START') {
      reasoningMessageOpen = true;
      yield {
        type: EventType.REASONING_MESSAGE_START,
        messageId: reasoningMessageId,
        role: 'reasoning',
      };
    } else if (type === 'REASONING_MESSAGE_CONTENT') {
      yield {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: reasoningMessageId,
        delta: raw.delta ?? '',
      };
    } else if (type === 'REASONING_MESSAGE_END') {
      reasoningMessageOpen = false;
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoningMessageId,
      };
    } else if (type === 'REASONING_END') {
      if (reasoningMessageOpen) {
        reasoningMessageOpen = false;
        yield {
          type: EventType.REASONING_MESSAGE_END,
          messageId: reasoningMessageId,
        };
      }
      reasoningRunOpen = false;
      yield { type: EventType.REASONING_END, messageId: reasoningMessageId };
    }
  }
  yield* closeReasoningIfOpen();
}

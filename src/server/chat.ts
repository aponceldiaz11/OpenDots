import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import type { Message, RunAgentInput } from '@ag-ui/core';
import { z } from 'zod';
import type { Platform } from './platform.js';

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

const chatSchema = z
  .object({
    threadId: z.string().min(1),
    prompt: z.string().trim().min(1).max(4000).optional(),
    toolResult: z
      .object({
        toolCallId: z.string().min(1),
        content: z.string().max(50000),
      })
      .optional(),
    tools: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.unknown(),
        }),
      )
      .optional(),
  })
  .strict();

/**
 * Streams one agent turn as AG-UI Server-Sent Events and persists the
 * assistant message (including tool calls) to the local thread store.
 */
export async function handleChat(
  platform: Platform,
  request: Request,
): Promise<Response> {
  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.prompt && !parsed.data.toolResult))
    return Response.json(
      { error: 'A conversation and either a prompt or tool result are required.' },
      { status: 400 },
    );
  if (platform.store.settings().paused)
    return Response.json({ error: 'All Dots are paused.' }, { status: 409 });
  let thread;
  try {
    thread = platform.workspace.requireThread(parsed.data.threadId);
  } catch {
    return Response.json(
      { error: 'Conversation is not owned by this workspace.' },
      { status: 403 },
    );
  }
  if (!platform.workspace.dot(thread.dotId))
    return Response.json({ error: 'Specialist Dot not found.' }, { status: 404 });

  const history = platform.threads.messages(thread.id);
  const additions: Message[] = parsed.data.toolResult
    ? [
        {
          id: randomUUID(),
          role: 'tool',
          toolCallId: parsed.data.toolResult.toolCallId,
          content: parsed.data.toolResult.content,
        },
      ]
    : [{ id: randomUUID(), role: 'user', content: parsed.data.prompt! }];
  platform.threads.appendMessages(thread.id, additions);

  const input: RunAgentInput = {
    threadId: thread.id,
    runId: randomUUID(),
    state: {},
    context: [],
    tools: parsed.data.tools ?? [],
    forwardedProps: {},
    messages: [...history, ...additions],
  };
  const agent = platform.createAgent(thread.dotId);
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, value: unknown) =>
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
    );
  const stream = new ReadableStream({
    start(controller) {
      let text = '';
      const toolCalls = new Map<string, ToolCallAccumulator>();
      const toolResults: Message[] = [];
      request.signal.addEventListener('abort', () => agent.abortRun(), {
        once: true,
      });
      agent.run(input).subscribe({
        next: (event) => {
          if (event.type === EventType.TEXT_MESSAGE_CHUNK)
            text += typeof event.delta === 'string' ? event.delta : '';
          if (event.type === EventType.TOOL_CALL_START)
            toolCalls.set(String(event.toolCallId), {
              id: String(event.toolCallId),
              name: String(event.toolCallName),
              arguments: '',
            });
          if (event.type === EventType.TOOL_CALL_ARGS) {
            const current = toolCalls.get(String(event.toolCallId));
            if (current && typeof event.delta === 'string')
              current.arguments += event.delta;
          }
          if (event.type === EventType.TOOL_CALL_RESULT)
            toolResults.push({
              id: randomUUID(),
              role: 'tool',
              toolCallId: String(event.toolCallId),
              content:
                typeof event.content === 'string'
                  ? event.content
                  : JSON.stringify(event.content ?? null),
            } as Message);
          send(controller, event);
        },
        error: (error: unknown) => {
          send(controller, {
            type: EventType.RUN_ERROR,
            message:
              error instanceof Error ? error.message : 'The agent run failed.',
          });
          controller.close();
        },
        complete: () => {
          const assistant: Message = {
            id: randomUUID(),
            role: 'assistant',
            content: text,
            ...(toolCalls.size
              ? {
                  toolCalls: [...toolCalls.values()].map((call) => ({
                    id: call.id,
                    type: 'function' as const,
                    function: {
                      name: call.name,
                      arguments: call.arguments,
                    },
                  })),
                }
              : {}),
          } as Message;
          if (text.trim() || toolCalls.size)
            platform.threads.appendMessage(thread.id, assistant);
          if (toolResults.length)
            platform.threads.appendMessages(thread.id, toolResults);
          controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
          controller.close();
        },
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

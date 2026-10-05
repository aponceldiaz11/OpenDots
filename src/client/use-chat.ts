import { useCallback, useEffect, useRef, useState } from 'react';
import { EventType } from '@ag-ui/core';
import type { AssistantMessage, Message, ToolCall } from '@ag-ui/core';
import { api } from './api';
import { streamChat, type ChatRequestBody } from './chat-stream';

export interface ChatTool {
  name: string;
  description: string;
  parameters: unknown;
}

const str = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

/**
 * Native chat controller: loads local thread history and streams turns from
 * /api/chat (AG-UI SSE) without CopilotKit.
 */
export function useChat(
  threadId: string,
  buildPrompt: (text: string) => string,
  tools: ChatTool[],
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolResults, setToolResults] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const data = await api<{ messages: Message[] }>(
        `/conversations/${threadId}/messages`,
      );
      const results: Record<string, string> = {};
      for (const message of data.messages)
        if (message.role === 'tool' && 'toolCallId' in message)
          results[str(message.toolCallId)] = str(message.content);
      setMessages(data.messages);
      setToolResults(results);
      setLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load the conversation.',
      );
    }
  }, [threadId]);

  useEffect(() => {
    setMessages([]);
    setToolResults({});
    setLoaded(false);
    setError('');
    void reload();
  }, [threadId, reload]);

  const run = useCallback(
    async (request: ChatRequestBody, onDone?: () => void) => {
      if (running) return;
      setRunning(true);
      setError('');
      const controller = new AbortController();
      abort.current = controller;
      let streamId: string | undefined;
      const ensureStream = () => {
        if (streamId) return streamId;
        streamId = `stream-${Date.now()}`;
        const message = {
          id: streamId,
          role: 'assistant',
          content: '',
        } as Message;
        setMessages((prev) => [...prev, message]);
        return streamId;
      };
      const upsert = (updater: (message: AssistantMessage) => AssistantMessage) =>
        setMessages((prev) => {
          const index = prev.findIndex((message) => message.id === streamId);
          if (index === -1) return prev;
          const next = [...prev];
          next[index] = updater(next[index] as AssistantMessage) as Message;
          return next;
        });
      try {
        for await (const event of streamChat(request, controller.signal)) {
          if (event.type === EventType.TEXT_MESSAGE_CHUNK) {
            ensureStream();
            upsert(
              (message) =>
                ({
                  ...message,
                  content: str(message.content) + str(event.delta),
                }) as AssistantMessage,
            );
          } else if (event.type === EventType.TOOL_CALL_START) {
            ensureStream();
            upsert((message) => {
              const toolCalls: ToolCall[] = [
                ...(message.toolCalls ?? []),
                {
                  id: str(event.toolCallId),
                  type: 'function',
                  function: { name: str(event.toolCallName), arguments: '' },
                },
              ];
              return { ...message, toolCalls } as AssistantMessage;
            });
          } else if (event.type === EventType.TOOL_CALL_ARGS) {
            upsert((message) => {
              const toolCalls = (message.toolCalls ?? []).map((call) =>
                call.id === str(event.toolCallId)
                  ? {
                      ...call,
                      function: {
                        ...call.function,
                        arguments:
                          call.function.arguments + str(event.delta),
                      },
                    }
                  : call,
              );
              return { ...message, toolCalls } as AssistantMessage;
            });
          } else if (event.type === EventType.TOOL_CALL_RESULT) {
            setToolResults((prev) => ({
              ...prev,
              [str(event.toolCallId)]: str(event.content),
            }));
          } else if (event.type === EventType.RUN_ERROR) {
            setError(str(event.message));
          }
        }
        onDone?.();
        await reload();
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'The turn failed. Your conversation remains saved.',
          );
      } finally {
        setRunning(false);
        abort.current = undefined;
      }
    },
    [running, reload],
  );

  return {
    messages,
    toolResults,
    running,
    loaded,
    error,
    setError,
    reload,
    send: (text: string) =>
      run({ threadId, prompt: buildPrompt(text), tools }),
    respond: (toolCallId: string, content: string) =>
      run({ threadId, toolResult: { toolCallId, content }, tools }),
    stop: () => abort.current?.abort(),
  };
}

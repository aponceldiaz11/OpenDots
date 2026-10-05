import type { BaseEvent } from '@ag-ui/core';
import { authHeaders } from './api';

export interface ChatRequestBody {
  threadId: string;
  prompt?: string;
  toolResult?: { toolCallId: string; content: string };
  tools?: { name: string; description: string; parameters: unknown }[];
}

function parseFrame(frame: string): BaseEvent | undefined {
  const dataLine = frame
    .split('\n')
    .find((line) => line.startsWith('data: '));
  if (!dataLine) return undefined;
  const payload = dataLine.slice(6).trim();
  if (!payload || payload === '{}') return undefined;
  try {
    return JSON.parse(payload) as BaseEvent;
  } catch {
    return undefined;
  }
}

export async function* streamChat(
  body: ChatRequestBody,
  signal: AbortSignal,
): AsyncGenerator<BaseEvent> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const error = (await response
      .json()
      .catch(() => ({ error: `Request failed (${response.status}).` }))) as {
      error?: string;
    };
    throw new Error(error.error ?? `Request failed (${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const event = parseFrame(frame);
      if (event) yield event;
    }
  }
  const tail = parseFrame(buffer);
  if (tail) yield tail;
}

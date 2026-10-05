import type { AssistantMessage } from '@ag-ui/core';
import { ComputerToolCard } from './ComputerToolCard';
import { PageReviewCard } from './PageReviewCard';
import { DelegationCard } from './DelegationCard';
import { pageReviewTool } from '../shared/page-review';

function safeParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function ToolCards({
  message,
  toolResults,
  threadId,
  dotId,
  dotName,
  running,
  showScreenFor,
  onSaved,
  onComputer,
  respond,
}: {
  message: AssistantMessage;
  toolResults: Record<string, string>;
  threadId: string;
  dotId: string;
  dotName: string;
  running: boolean;
  showScreenFor?: string;
  onSaved: () => void;
  onComputer?: () => void;
  respond?: (toolCallId: string, content: string) => void;
}) {
  return (
    <>
      {(message.toolCalls ?? []).map((call) => {
        const result = toolResults[call.id];
        const complete = result !== undefined;
        if (call.function.name.startsWith('computer_'))
          return (
            <ComputerToolCard
              key={call.id}
              name={call.function.name}
              toolCallId={call.id}
              status={complete ? 'complete' : 'running'}
              args={safeParse(call.function.arguments)}
              result={complete ? safeParse(result) : undefined}
              dotId={dotId}
              dotName={dotName}
              showScreen={showScreenFor === call.id}
              running={running}
              onExpand={onComputer}
            />
          );
        if (call.function.name === pageReviewTool.name)
          return (
            <PageReviewCard
              key={call.id}
              threadId={threadId}
              toolCallId={call.id}
              status={complete ? 'complete' : 'running'}
              args={safeParse(call.function.arguments)}
              result={complete ? safeParse(result) : undefined}
              respond={
                !complete && respond
                  ? (payload) =>
                      Promise.resolve(respond(call.id, JSON.stringify(payload)))
                  : undefined
              }
              onSaved={onSaved}
            />
          );
        if (call.function.name === 'delegate_task') {
          const args = safeParse(call.function.arguments) as
            | { target?: string; instructions?: string }
            | undefined;
          return (
            <DelegationCard
              key={call.id}
              target={args?.target ?? 'especialista'}
              instructions={args?.instructions ?? ''}
              result={complete ? safeParse(result) : undefined}
            />
          );
        }
        return null;
      })}
    </>
  );
}

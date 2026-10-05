import { AbstractAgent, EventType } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { convertTanStackStream } from './agui.js';

export interface HarnessContext {
  input: RunAgentInput;
  abortController: AbortController;
  abortSignal: AbortSignal;
}

export type HarnessFactory = (
  ctx: HarnessContext,
) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;

export interface HarnessAgentOptions {
  onRunFinished?: (chunk: unknown) => void;
}

/**
 * Minimal AG-UI agent that streams a TanStack AI chat through the local
 * converter. Replaces CopilotKit's BuiltInAgent without any @copilotkit import.
 */
export class HarnessAgent extends AbstractAgent {
  private controller?: AbortController;
  constructor(
    private factory: HarnessFactory,
    private options: HarnessAgentOptions = {},
  ) {
    super();
  }

  clone(): HarnessAgent {
    return new HarnessAgent(this.factory, this.options);
  }

  abortRun(): void {
    this.controller?.abort();
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      this.controller = controller;
      let runError: unknown;
      void (async () => {
        subscriber.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        });
        try {
          const stream = await this.factory({
            input,
            abortController: controller,
            abortSignal: controller.signal,
          });
          for await (const event of convertTanStackStream(
            stream,
            controller.signal,
            this.options.onRunFinished,
          ))
            subscriber.next(event);
          if (!controller.signal.aborted)
            subscriber.next({
              type: EventType.RUN_FINISHED,
              threadId: input.threadId,
              runId: input.runId,
            });
        } catch (error) {
          runError = error;
          if (!controller.signal.aborted)
            subscriber.next({
              type: EventType.RUN_ERROR,
              message:
                error instanceof Error
                  ? error.message
                  : 'The agent run failed.',
            });
        } finally {
          if (this.controller === controller) this.controller = undefined;
          if (runError !== undefined && !controller.signal.aborted)
            subscriber.error(runError);
          else subscriber.complete();
        }
      })();
      return () => {
        controller.abort();
      };
    });
  }
}

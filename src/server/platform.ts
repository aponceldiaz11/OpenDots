import { ComputerService } from './computer-service.js';
import { PageService, type PageIntelligence } from './page-service.js';
import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import type { Message, RunAgentInput } from '@ag-ui/core';
import { Store } from './store.js';
import { WorkspaceStore } from './workspace.js';
import { ThreadStore } from './threads.js';
import { DotAgent } from './dot-agent.js';
import { TelegramService } from './telegram.js';
import type { DelegateFn } from './harness-tools.js';
import { setupStatus, type PlatformConfig } from './platform-config.js';

export class Platform {
  readonly pages: PageService;
  readonly computers: ComputerService;
  readonly telegram: TelegramService;
  constructor(
    readonly store: Store,
    readonly workspace: WorkspaceStore,
    readonly threads: ThreadStore,
    readonly config: PlatformConfig,
  ) {
    this.telegram = new TelegramService(
      config.telegramBotToken,
      config.telegramChatId,
      workspace,
    );
    this.computers = new ComputerService(
      workspace,
      config,
      () => store.settings().paused,
    );
    this.pages = new PageService(workspace, () => this.pageIntelligence());
  }
  private pageIntelligence(): PageIntelligence {
    return {
      getOrCreateThread: async ({ threadId, agentId, name }) => {
        if (
          !this.workspace
            .conversations()
            .some((candidate) => candidate.id === threadId)
        )
          this.workspace.bindThread(threadId, agentId, name);
        this.threads.ensureThread(threadId, agentId, name);
      },
      getThreadMessages: async ({ threadId }) => ({
        messages: this.threads.messages(threadId),
      }),
    };
  }
  setup() {
    return setupStatus(this.config);
  }
  requireReady() {
    const missing = this.setup().missing;
    if (missing.length)
      throw new Error(`Setup required: ${missing.join(', ')}.`);
  }
  async start() {
    this.telegram.start();
  }
  async stop() {
    await this.telegram.stop();
  }
  createAgent(dotId: string, channel = false): DotAgent {
    return new DotAgent(
      this.store,
      this.workspace,
      this.config,
      dotId,
      channel,
      this.telegram,
      this.delegateFn(),
      (usage) => this.workspace.recordUsage({ dotId, ...usage }),
    );
  }
  usage() {
    return this.workspace.usageSummary(
      this.config.providers?.opencodeGoQuotaTokens ?? null,
    );
  }
  async createConversation(dotId: string, title: string) {
    this.requireReady();
    if (!this.workspace.dot(dotId)) throw new Error('Dot not found.');
    const id = randomUUID();
    this.threads.ensureThread(id, dotId, title);
    return this.workspace.bindThread(id, dotId, title);
  }
  async history(threadId: string): Promise<string> {
    this.workspace.requireThread(threadId);
    return this.threads
      .messages(threadId)
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .slice(-12)
      .map(
        (message) =>
          `${message.role}: ${typeof message.content === 'string' ? message.content : ''}`,
      )
      .join('\n')
      .slice(-12000);
  }
  private delegateFn(): DelegateFn {
    return (input) => this.delegate(input);
  }
  async delegate(input: {
    targetDotId: string;
    prompt: string;
    signal: AbortSignal;
  }): Promise<string> {
    this.requireReady();
    const target = this.workspace.dot(input.targetDotId);
    if (!target) throw new Error('Specialist Dot not found.');
    let thread = this.workspace
      .conversations()
      .find(
        (candidate) =>
          candidate.dotId === input.targetDotId &&
          candidate.title.startsWith('Delegado:'),
      );
    if (!thread)
      thread = await this.createConversation(
        input.targetDotId,
        `Delegado: ${input.prompt.slice(0, 60)}`,
      );
    if (target.telegramNotify)
      await this.telegram
        .notify(`🔔 ${target.name}: nueva tarea delegada.`)
        .catch(() => undefined);
    const result = await this.turn(thread.id, input.prompt, input.signal);
    if (target.telegramNotify)
      await this.telegram
        .notify(`✅ ${target.name} terminó la tarea delegada.`)
        .catch(() => undefined);
    return result;
  }
  async turn(
    threadId: string,
    prompt: string,
    signal: AbortSignal,
    _metadata?: Record<string, unknown>,
  ): Promise<string> {
    this.requireReady();
    const thread = this.workspace.requireThread(threadId);
    const history = this.threads.messages(threadId);
    const userMessage: Message = {
      id: randomUUID(),
      role: 'user',
      content: prompt,
    };
    this.threads.appendMessage(threadId, userMessage);
    const input: RunAgentInput = {
      threadId,
      runId: randomUUID(),
      state: {},
      context: [],
      tools: [],
      forwardedProps: {},
      messages: [...history, userMessage],
    };
    return this.collectTurn(thread.dotId, input, threadId, signal);
  }
  private collectTurn(
    dotId: string,
    input: RunAgentInput,
    threadId: string,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const agent = this.createAgent(dotId);
      let text = '';
      const stop = () => agent.abortRun();
      signal.addEventListener('abort', stop, { once: true });
      const subscription = agent.run(input).subscribe({
        next: (event) => {
          if (event.type === EventType.TEXT_MESSAGE_CHUNK) text += event.delta;
        },
        error: (error: unknown) => {
          signal.removeEventListener('abort', stop);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
        complete: () => {
          signal.removeEventListener('abort', stop);
          subscription.unsubscribe();
          if (text.trim())
            this.threads.appendMessage(threadId, {
              id: randomUUID(),
              role: 'assistant',
              content: text,
            } satisfies Message);
          resolve(text);
        },
      });
    });
  }
}

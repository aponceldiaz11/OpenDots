import { randomUUID } from 'node:crypto';
import type { ApprovalDecision } from '../shared/types.js';
import type { WorkspaceStore } from './workspace.js';

interface PendingApproval {
  resolve: (decision: ApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    from?: { id: number; username?: string };
    message?: { message_id: number; chat: { id: number } };
  };
  message?: { text?: string; chat: { id: number } };
}

interface InlineButton {
  text: string;
  callback_data: string;
}

export interface ApprovalRequest {
  dotId: string;
  dotName: string;
  title: string;
  summary: string;
  threadId?: string | null;
}

const API = 'https://api.telegram.org';
const APPROVE = 'ap';
const REJECT = 'rj';

export class TelegramService {
  private pending = new Map<string, PendingApproval>();
  private offset = 0;
  private running = false;
  private pollLoop?: Promise<void>;

  constructor(
    private token: string | undefined,
    private chatId: string | undefined,
    private workspace: WorkspaceStore,
    private approvalTimeoutMs = 15 * 60 * 1000,
  ) {}

  get enabled(): boolean {
    return !!this.token && !!this.chatId;
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.token) throw new Error('Telegram is not configured.');
    const response = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
    } | null;
    if (!response.ok || !payload?.ok)
      throw new Error(
        `Telegram ${method} failed: ${payload?.description ?? response.status}`,
      );
    return payload.result as T;
  }

  async sendMessage(text: string, keyboard?: InlineButton[][]): Promise<void> {
    if (!this.enabled) return;
    await this.call(
      'sendMessage',
      {
        chat_id: this.chatId,
        text,
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      },
      AbortSignal.timeout(10000),
    );
  }

  async notify(text: string): Promise<void> {
    await this.sendMessage(text);
  }

  async requestApproval(input: ApprovalRequest): Promise<ApprovalDecision> {
    if (!this.enabled)
      throw new Error(
        'Human approval requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.',
      );
    const id = randomUUID();
    this.workspace.createApproval({
      id,
      dotId: input.dotId,
      threadId: input.threadId ?? null,
      title: input.title,
      summary: input.summary,
    });
    await this.sendMessage(
      [
        `Aprobación requerida · ${input.dotName}`,
        '',
        input.title,
        '',
        input.summary,
        '',
        'Responde con un botón. Caduca en 15 minutos.',
      ].join('\n'),
      [
        [
          { text: '✅ Aprobar', callback_data: `${APPROVE}:${id}` },
          { text: '❌ Rechazar', callback_data: `${REJECT}:${id}` },
        ],
      ],
    );
    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.workspace.decideApproval(id, 'expired', 'timeout');
        resolve('expired');
      }, this.approvalTimeoutMs);
      this.pending.set(id, { resolve, timer });
    });
  }

  start(): void {
    if (!this.enabled || this.running) return;
    this.running = true;
    this.pollLoop = this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const [, entry] of this.pending) clearTimeout(entry.timer);
    this.pending.clear();
    await this.pollLoop?.catch(() => undefined);
  }

  private async poll(): Promise<void> {
    await this.call('deleteWebhook', { drop_pending_updates: false }).catch(
      () => undefined,
    );
    while (this.running) {
      try {
        const updates = await this.call<TelegramUpdate[]>(
          'getUpdates',
          { offset: this.offset, timeout: 25, allowed_updates: ['callback_query'] },
          AbortSignal.timeout(35000),
        );
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const query = update.callback_query;
    if (!query?.data) return;
    const [action, id] = query.data.split(':');
    const decision: ApprovalDecision | undefined =
      action === APPROVE ? 'approved' : action === REJECT ? 'rejected' : undefined;
    if (!id || !decision) return;
    const decidedBy = query.from?.username
      ? `telegram:@${query.from.username}`
      : `telegram:${query.from?.id ?? 'unknown'}`;
    const record = this.workspace.decideApproval(id, decision, decidedBy);
    const entry = this.pending.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.resolve(decision);
    }
    await this.call(
      'answerCallbackQuery',
      {
        callback_query_id: query.id,
        text:
          decision === 'approved'
            ? 'Aprobado'
            : record?.status === 'pending'
              ? 'Ya decidido'
              : 'Rechazado',
      },
      AbortSignal.timeout(10000),
    ).catch(() => undefined);
    if (query.message) {
      const status = decision === 'approved' ? '✅ Aprobado' : '❌ Rechazado';
      const title = record?.title ? `${record.title}\n\n` : '';
      await this.call(
        'editMessageText',
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          text: `${title}${status} por ${decidedBy}`,
        },
        AbortSignal.timeout(10000),
      ).catch(() => undefined);
    }
  }
}

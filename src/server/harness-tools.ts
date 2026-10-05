import { defineTool, type ToolDefinition } from './tools.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Dot } from '../shared/types.js';
import type { TelegramService } from './telegram.js';
import type { WorkspaceStore } from './workspace.js';

export type DelegateFn = (input: {
  targetDotId: string;
  prompt: string;
  signal: AbortSignal;
}) => Promise<string>;

export function approvalTool(
  telegram: TelegramService,
  dot: Dot,
  threadId: string,
): ToolDefinition | null {
  if (!dot.sensitiveActions || !telegram.enabled) return null;
  return defineTool({
    name: 'request_human_approval',
    description:
      'Pause and ask the owner to approve a sensitive action (refunds, sending emails, payments, destructive writes) through Telegram. Returns "approved", "rejected", or "expired". Never perform the sensitive action before this tool returns "approved".',
    parameters: z.object({
      action: z
        .string()
        .min(3)
        .max(200)
        .describe('Short label of the action requiring approval.'),
      summary: z
        .string()
        .min(3)
        .max(1500)
        .describe('What will happen, to whom, and the impact.'),
    }),
    execute: async ({ action, summary }) => {
      const decision = await telegram.requestApproval({
        dotId: dot.id,
        dotName: dot.name,
        title: action,
        summary,
        threadId,
      });
      return { decision };
    },
  });
}

export function notificationTool(
  workspace: WorkspaceStore,
  telegram: TelegramService | undefined,
  dot: Dot,
): ToolDefinition {
  return defineTool({
    name: 'send_notification',
    description:
      'Send a notification card to the owner PWA alerts panel and, when configured, to Telegram. Use for proactive alerts (errors, PR ready, disputes) not for ordinary replies.',
    parameters: z.object({
      title: z.string().min(3).max(120),
      body: z.string().min(1).max(1500),
      level: z.enum(['info', 'warning', 'critical']).default('info'),
    }),
    execute: async ({ title, body, level }) => {
      const record = workspace.createNotification({
        id: randomUUID(),
        dotId: dot.id,
        title,
        body,
        level,
      });
      if (telegram?.enabled)
        await telegram.notify(`🔔 ${title}\n\n${body}`).catch(() => undefined);
      return {
        delivered: true,
        id: record.id,
        telegram: telegram?.enabled ?? false,
      };
    },
  });
}

export function delegationTool(
  dots: Dot[],
  delegate: DelegateFn,
  controller: AbortController,
): ToolDefinition {
  const targets = dots.filter((candidate) => !candidate.isOrchestrator);
  return defineTool({
    name: 'delegate_task',
    description:
      'Delegate a scoped task to a specialist Dot and return its result. Use this to hand work to the right area instead of doing it yourself.',
    parameters: z.object({
      target: z
        .string()
        .min(1)
        .describe(
          `Specialist to receive the task. One of: ${targets
            .map((candidate) => `${candidate.name} (${candidate.area})`)
            .join(', ')}`,
        ),
      instructions: z
        .string()
        .min(3)
        .max(4000)
        .describe('Clear, self-contained brief for the specialist.'),
    }),
    execute: async ({ target, instructions }) => {
      const normalized = target.trim().toLowerCase();
      const match =
        targets.find((candidate) => candidate.id === target) ??
        targets.find((candidate) => candidate.name.toLowerCase() === normalized) ??
        targets.find(
          (candidate) =>
            candidate.area.toLowerCase() === normalized ||
            candidate.name.toLowerCase().includes(normalized),
        );
      if (!match)
        return {
          error: `Unknown specialist "${target}". Available: ${targets
            .map((candidate) => candidate.name)
            .join(', ')}.`,
        };
      const result = await delegate({
        targetDotId: match.id,
        prompt: instructions,
        signal: controller.signal,
      });
      return { target: match.name, area: match.area, result };
    },
  });
}

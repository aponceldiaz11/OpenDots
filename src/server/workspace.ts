import { ComputerStore } from './computer-store.js';
import { Pages } from './pages.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateLearningSettings } from '../shared/learning.js';
import type {
  ApprovalDecision,
  ApprovalRecord,
  CallReceipt,
  Conversation,
  Dot,
  NotificationRecord,
  Space,
  UsageSummary,
} from '../shared/types.js';
export class WorkspaceStore {
  private db: DatabaseSync;
  readonly pages: Pages;
  readonly computers: ComputerStore;
  constructor(
    path: string,
    readonly ownerId: string,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS dots(id TEXT PRIMARY KEY, spaceId TEXT NOT NULL, name TEXT NOT NULL, instructions TEXT NOT NULL, researchAllowed INTEGER NOT NULL, memoryAllowed INTEGER NOT NULL, createdAt INTEGER NOT NULL, providerId TEXT NOT NULL DEFAULT 'custom', model TEXT, baseUrl TEXT, apiKeyEnv TEXT, area TEXT NOT NULL DEFAULT 'general', parentId TEXT, isOrchestrator INTEGER NOT NULL DEFAULT 0, telegramNotify INTEGER NOT NULL DEFAULT 0, sensitiveActions INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS thread_bindings(id TEXT PRIMARY KEY, dotId TEXT NOT NULL, ownerId TEXT NOT NULL, title TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS task_threads(taskId TEXT PRIMARY KEY, threadId TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, startedAt INTEGER NOT NULL, endedAt INTEGER, status TEXT NOT NULL, transcript TEXT NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS captures(threadId TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, dotId TEXT NOT NULL, threadId TEXT, title TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL, decidedAt INTEGER, decidedBy TEXT);
      CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, dotId TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, level TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_events(id INTEGER PRIMARY KEY AUTOINCREMENT, dotId TEXT NOT NULL, providerId TEXT NOT NULL, model TEXT, inputTokens INTEGER NOT NULL, outputTokens INTEGER NOT NULL, totalTokens INTEGER NOT NULL, createdAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_events_created ON usage_events(createdAt);`);
    for (const [table, column, definition] of [
      ['dots', 'learningContainerId', 'TEXT'],
      ['dots', 'skillDeliveryEnabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['dots', 'providerId', "TEXT NOT NULL DEFAULT 'custom'"],
      ['dots', 'model', 'TEXT'],
      ['dots', 'baseUrl', 'TEXT'],
      ['dots', 'apiKeyEnv', 'TEXT'],
      ['dots', 'area', "TEXT NOT NULL DEFAULT 'general'"],
      ['dots', 'parentId', 'TEXT'],
      ['dots', 'isOrchestrator', 'INTEGER NOT NULL DEFAULT 0'],
      ['dots', 'telegramNotify', 'INTEGER NOT NULL DEFAULT 0'],
      ['dots', 'sensitiveActions', 'INTEGER NOT NULL DEFAULT 0'],
      ['thread_bindings', 'learningContainerId', 'TEXT'],
    ]) {
      if (
        !this.db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((field) => field.name === column)
      )
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    // Migrate only once: restarting must never restore a revoked grant.
    if (
      !this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='dot_spaces'",
        )
        .get()
    ) {
      this.db.exec(`BEGIN;
        CREATE TABLE dot_spaces(dotId TEXT NOT NULL, spaceId TEXT NOT NULL, PRIMARY KEY(dotId, spaceId));
        INSERT INTO dot_spaces SELECT id, spaceId FROM dots;
        COMMIT;`);
    }
    this.computers = new ComputerStore(this.db);
    this.pages = new Pages(this.db, (id) =>
      this.spaces().some((space) => space.id === id),
    );
    if (
      !this.db
        .prepare('PRAGMA table_info(calls)')
        .all()
        .some((column) => column.name === 'anchorMessageId')
    )
      this.db.exec('ALTER TABLE calls ADD COLUMN anchorMessageId TEXT');
    // In-memory approval resolvers do not survive a restart.
    this.db
      .prepare(
        "UPDATE approvals SET status='expired', decidedAt=?, decidedBy='startup' WHERE status='pending'",
      )
      .run(Date.now());
    if (!this.spaces().length) {
      const space = this.createSpace(
        'Everyday',
        'A little space for your day.',
      );
      this.createDot(
        space.id,
        'Dot',
        'Be thoughtful, practical, and concise. Help the user think clearly and follow through.',
        true,
        true,
      );
    }
  }
  close() {
    this.db.close();
  }
  spaces(): Space[] {
    return this.db
      .prepare('SELECT * FROM spaces ORDER BY createdAt')
      .all() as unknown as Space[];
  }
  createSpace(name: string, description: string): Space {
    const space = {
      id: randomUUID(),
      name,
      description,
      createdAt: Date.now(),
    };
    this.db
      .prepare('INSERT INTO spaces VALUES (?, ?, ?, ?)')
      .run(space.id, name, description, space.createdAt);
    return space;
  }
  dots(): Dot[] {
    return this.db
      .prepare('SELECT * FROM dots ORDER BY createdAt')
      .all()
      .map((row) => ({
        ...row,
        spaceIds: this.db
          .prepare(
            'SELECT spaceId FROM dot_spaces WHERE dotId=? ORDER BY spaceId',
          )
          .all(String(row.id))
          .map((grant) => String(grant.spaceId)),
        researchAllowed: !!row.researchAllowed,
        memoryAllowed: !!row.memoryAllowed,
        skillDeliveryEnabled: !!row.skillDeliveryEnabled,
        providerId: (row.providerId as Dot['providerId']) ?? 'custom',
        model: (row.model as string | null) ?? null,
        baseUrl: (row.baseUrl as string | null) ?? null,
        apiKeyEnv: (row.apiKeyEnv as string | null) ?? null,
        area: (row.area as Dot['area']) ?? 'general',
        parentId: (row.parentId as string | null) ?? null,
        isOrchestrator: !!row.isOrchestrator,
        telegramNotify: !!row.telegramNotify,
        sensitiveActions: !!row.sensitiveActions,
      })) as unknown as Dot[];
  }
  dot(id: string) {
    return this.dots().find((dot) => dot.id === id);
  }
  createDot(
    spaceId: string,
    name: string,
    instructions: string,
    researchAllowed: boolean,
    memoryAllowed: boolean,
    spaceIds: string[] = [spaceId],
    learningContainerId: string | null = null,
    skillDeliveryEnabled = false,
    harness: Partial<
      Pick<
        Dot,
        | 'providerId'
        | 'model'
        | 'baseUrl'
        | 'apiKeyEnv'
        | 'area'
        | 'parentId'
        | 'isOrchestrator'
        | 'telegramNotify'
        | 'sensitiveActions'
      >
    > = {},
  ): Dot {
    this.validateSpaceAccess(spaceId, spaceIds);
    validateLearningSettings(learningContainerId, skillDeliveryEnabled);
    const dot: Dot = {
      id: randomUUID(),
      spaceId,
      spaceIds: [...new Set(spaceIds)].sort(),
      name,
      instructions,
      researchAllowed,
      memoryAllowed,
      learningContainerId,
      skillDeliveryEnabled,
      createdAt: Date.now(),
      providerId: harness.providerId ?? 'custom',
      model: harness.model ?? null,
      baseUrl: harness.baseUrl ?? null,
      apiKeyEnv: harness.apiKeyEnv ?? null,
      area: harness.area ?? 'general',
      parentId: harness.parentId ?? null,
      isOrchestrator: harness.isOrchestrator ?? false,
      telegramNotify: harness.telegramNotify ?? false,
      sensitiveActions: harness.sensitiveActions ?? false,
    };
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          'INSERT INTO dots (id, spaceId, name, instructions, researchAllowed, memoryAllowed, createdAt, learningContainerId, skillDeliveryEnabled, providerId, model, baseUrl, apiKeyEnv, area, parentId, isOrchestrator, telegramNotify, sensitiveActions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          dot.id,
          spaceId,
          name,
          instructions,
          +researchAllowed,
          +memoryAllowed,
          dot.createdAt,
          learningContainerId,
          +skillDeliveryEnabled,
          dot.providerId,
          dot.model ?? null,
          dot.baseUrl ?? null,
          dot.apiKeyEnv ?? null,
          dot.area,
          dot.parentId ?? null,
          +dot.isOrchestrator!,
          +dot.telegramNotify!,
          +dot.sensitiveActions!,
        );
      for (const id of dot.spaceIds)
        this.db.prepare('INSERT INTO dot_spaces VALUES (?, ?)').run(dot.id, id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return dot;
  }
  canAccessSpace(dotId: string, spaceId: string) {
    return !!this.db
      .prepare('SELECT 1 FROM dot_spaces WHERE dotId=? AND spaceId=?')
      .get(dotId, spaceId);
  }
  private validateSpaceAccess(defaultSpace: string, spaceIds: string[]) {
    if (
      !spaceIds.includes(defaultSpace) ||
      spaceIds.some((id) => !this.spaces().some((space) => space.id === id))
    )
      throw new Error('Space access must include a valid default destination.');
  }
  updateDot(
    id: string,
    patch: Pick<
      Dot,
      'name' | 'instructions' | 'researchAllowed' | 'memoryAllowed'
    > & {
      spaceId?: string;
      spaceIds?: string[];
      learningContainerId?: string | null;
      skillDeliveryEnabled?: boolean;
      providerId?: Dot['providerId'];
      model?: string | null;
      baseUrl?: string | null;
      apiKeyEnv?: string | null;
      area?: Dot['area'];
      parentId?: string | null;
      isOrchestrator?: boolean;
      telegramNotify?: boolean;
      sensitiveActions?: boolean;
    },
  ): Dot {
    const current = this.dot(id);
    if (!current) throw new Error('Dot not found.');
    const defaultSpace = patch.spaceId ?? current.spaceId;
    const spaceIds = patch.spaceIds ?? current.spaceIds;
    this.validateSpaceAccess(defaultSpace, spaceIds);
    const learningContainerId =
      patch.learningContainerId === undefined
        ? (current.learningContainerId ?? null)
        : patch.learningContainerId;
    const skillDeliveryEnabled =
      patch.skillDeliveryEnabled ?? current.skillDeliveryEnabled ?? false;
    validateLearningSettings(learningContainerId, skillDeliveryEnabled);
    const providerId = patch.providerId ?? current.providerId ?? 'custom';
    const model =
      patch.model === undefined ? (current.model ?? null) : patch.model;
    const baseUrl =
      patch.baseUrl === undefined ? (current.baseUrl ?? null) : patch.baseUrl;
    const apiKeyEnv =
      patch.apiKeyEnv === undefined
        ? (current.apiKeyEnv ?? null)
        : patch.apiKeyEnv;
    const area = patch.area ?? current.area ?? 'general';
    const parentId =
      patch.parentId === undefined
        ? (current.parentId ?? null)
        : patch.parentId;
    const isOrchestrator =
      patch.isOrchestrator ?? current.isOrchestrator ?? false;
    const telegramNotify =
      patch.telegramNotify ?? current.telegramNotify ?? false;
    const sensitiveActions =
      patch.sensitiveActions ?? current.sensitiveActions ?? false;
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          'UPDATE dots SET name=?, instructions=?, researchAllowed=?, memoryAllowed=?, learningContainerId=?, skillDeliveryEnabled=?, providerId=?, model=?, baseUrl=?, apiKeyEnv=?, area=?, parentId=?, isOrchestrator=?, telegramNotify=?, sensitiveActions=? WHERE id=?',
        )
        .run(
          patch.name,
          patch.instructions,
          +patch.researchAllowed,
          +patch.memoryAllowed,
          learningContainerId,
          +skillDeliveryEnabled,
          providerId,
          model,
          baseUrl,
          apiKeyEnv,
          area,
          parentId,
          +isOrchestrator,
          +telegramNotify,
          +sensitiveActions,
          id,
        );
      this.db
        .prepare('UPDATE dots SET spaceId=? WHERE id=?')
        .run(defaultSpace, id);
      this.db.prepare('DELETE FROM dot_spaces WHERE dotId=?').run(id);
      for (const space of new Set(spaceIds))
        this.db.prepare('INSERT INTO dot_spaces VALUES (?, ?)').run(id, space);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.dot(id)!;
  }
  conversations(): Conversation[] {
    return this.db
      .prepare(
        'SELECT * FROM thread_bindings WHERE ownerId=? ORDER BY createdAt DESC',
      )
      .all(this.ownerId) as unknown as Conversation[];
  }
  bindThread(id: string, dotId: string, title: string): Conversation {
    const dot = this.dot(dotId);
    if (!dot) throw new Error('Dot not found.');
    const value: Conversation = {
      id,
      dotId,
      ownerId: this.ownerId,
      title,
      createdAt: Date.now(),
      learningContainerId: dot.learningContainerId ?? null,
    };
    this.db
      .prepare(
        'INSERT INTO thread_bindings (id, dotId, ownerId, title, createdAt, learningContainerId) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        dotId,
        this.ownerId,
        title,
        value.createdAt,
        value.learningContainerId ?? null,
      );
    return value;
  }
  requireThread(id: string, dotId?: string): Conversation {
    const thread = this.conversations().find((thread) => thread.id === id);
    if (!thread || (dotId && thread.dotId !== dotId))
      throw new Error('Conversation does not belong to this Dot and owner.');
    return thread;
  }
  bindTask(taskId: string, threadId: string) {
    this.requireThread(threadId);
    this.db
      .prepare('INSERT INTO task_threads VALUES (?, ?)')
      .run(taskId, threadId);
  }
  taskThread(taskId: string): string | undefined {
    const row = this.db
      .prepare('SELECT threadId FROM task_threads WHERE taskId=?')
      .get(taskId);
    return typeof row?.threadId === 'string' ? row.threadId : undefined;
  }
  calls(threadId?: string): CallReceipt[] {
    if (threadId) this.requireThread(threadId);
    return this.db
      .prepare(
        `SELECT * FROM calls ${threadId ? 'WHERE threadId=?' : ''} ORDER BY startedAt DESC`,
      )
      .all(...(threadId ? [threadId] : [])) as unknown as CallReceipt[];
  }
  createCall(threadId: string): CallReceipt {
    this.requireThread(threadId);
    const call: CallReceipt = {
      id: randomUUID(),
      threadId,
      startedAt: Date.now(),
      endedAt: null,
      status: 'connecting',
      transcript: '',
      error: null,
    };
    this.db
      .prepare(
        'INSERT INTO calls(id, threadId, startedAt, endedAt, status, transcript, error) VALUES (?, ?, ?, NULL, ?, ?, NULL)',
      )
      .run(call.id, threadId, call.startedAt, call.status, '');
    return call;
  }
  call(id: string): CallReceipt {
    const call = this.calls().find((call) => call.id === id);
    if (!call) throw new Error('Call not found.');
    this.requireThread(call.threadId);
    return call;
  }
  setCall(
    id: string,
    status: CallReceipt['status'],
    transcript: string,
    error: string | null = null,
  ) {
    const call = this.call(id);
    if (call.endedAt) return call;
    this.db
      .prepare(
        'UPDATE calls SET status=?, transcript=?, error=?, endedAt=? WHERE id=?',
      )
      .run(
        status,
        transcript,
        error,
        status === 'ended' || status === 'failed' ? Date.now() : null,
        id,
      );
    return this.call(id);
  }
  saveLateTranscript(id: string, transcript: string) {
    this.call(id);
    return (
      this.db
        .prepare(
          "UPDATE calls SET transcript=? WHERE id=? AND transcript='' AND endedAt IS NOT NULL",
        )
        .run(transcript, id).changes > 0
    );
  }
  anchorCall(id: string, anchor: string | undefined) {
    this.call(id);
    this.db
      .prepare('UPDATE calls SET anchorMessageId=? WHERE id=?')
      .run(anchor ?? null, id);
  }
  setCallError(id: string, error: string | null) {
    this.call(id);
    this.db.prepare('UPDATE calls SET error=? WHERE id=?').run(error, id);
  }
  saveCapture(threadId: string, value: unknown) {
    this.requireThread(threadId);
    this.db
      .prepare(
        'INSERT INTO captures VALUES (?, ?) ON CONFLICT(threadId) DO UPDATE SET value=excluded.value',
      )
      .run(threadId, JSON.stringify(value));
  }
  capture(threadId: string): unknown {
    this.requireThread(threadId);
    const row = this.db
      .prepare('SELECT value FROM captures WHERE threadId=?')
      .get(threadId);
    return typeof row?.value === 'string' ? JSON.parse(row.value) : null;
  }
  approvals(): ApprovalRecord[] {
    return this.db
      .prepare('SELECT * FROM approvals ORDER BY createdAt DESC')
      .all() as unknown as ApprovalRecord[];
  }
  approval(id: string): ApprovalRecord | undefined {
    return this.db
      .prepare('SELECT * FROM approvals WHERE id=?')
      .get(id) as unknown as ApprovalRecord | undefined;
  }
  createApproval(
    record: Pick<ApprovalRecord, 'id' | 'dotId' | 'title' | 'summary'> & {
      threadId?: string | null;
    },
  ): ApprovalRecord {
    this.db
      .prepare(
        "INSERT INTO approvals(id, dotId, threadId, title, summary, status, createdAt, decidedAt, decidedBy) VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NULL)",
      )
      .run(
        record.id,
        record.dotId,
        record.threadId ?? null,
        record.title,
        record.summary,
        Date.now(),
      );
    return this.approval(record.id)!;
  }
  decideApproval(
    id: string,
    decision: ApprovalDecision,
    decidedBy: string,
  ): ApprovalRecord | undefined {
    const current = this.approval(id);
    if (!current || current.status !== 'pending') return current;
    this.db
      .prepare('UPDATE approvals SET status=?, decidedAt=?, decidedBy=? WHERE id=?')
      .run(decision, Date.now(), decidedBy, id);
    return this.approval(id);
  }
  notifications(): NotificationRecord[] {
    return this.db
      .prepare('SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 100')
      .all() as unknown as NotificationRecord[];
  }
  createNotification(input: {
    id: string;
    dotId: string;
    title: string;
    body: string;
    level: NotificationRecord['level'];
  }): NotificationRecord {
    this.db
      .prepare(
        "INSERT INTO notifications(id, dotId, title, body, level, status, createdAt) VALUES (?, ?, ?, ?, ?, 'unread', ?)",
      )
      .run(input.id, input.dotId, input.title, input.body, input.level, Date.now());
    return this.db
      .prepare('SELECT * FROM notifications WHERE id=?')
      .get(input.id) as unknown as NotificationRecord;
  }
  markNotificationRead(id: string): boolean {
    return (
      this.db
        .prepare("UPDATE notifications SET status='read' WHERE id=?")
        .run(id).changes > 0
    );
  }
  recordUsage(input: {
    dotId: string;
    providerId: string;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }): void {
    this.db
      .prepare(
        'INSERT INTO usage_events(dotId, providerId, model, inputTokens, outputTokens, totalTokens, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        input.dotId,
        input.providerId,
        input.model,
        input.inputTokens,
        input.outputTokens,
        input.totalTokens,
        Date.now(),
      );
  }
  usageSummary(quotaTokens: number | null): UsageSummary {
    const total = this.db
      .prepare(
        'SELECT COALESCE(SUM(inputTokens),0) AS inputTokens, COALESCE(SUM(outputTokens),0) AS outputTokens, COALESCE(SUM(totalTokens),0) AS totalTokens, COUNT(*) AS requests FROM usage_events',
      )
      .get() as unknown as {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      requests: number;
    };
    const byProvider = this.db
      .prepare(
        'SELECT providerId, COALESCE(SUM(totalTokens),0) AS tokens, COUNT(*) AS requests FROM usage_events GROUP BY providerId ORDER BY tokens DESC',
      )
      .all() as unknown as {
      providerId: string;
      tokens: number;
      requests: number;
    }[];
    const recent = this.db
      .prepare(
        'SELECT COALESCE(SUM(totalTokens),0) AS tokens, COUNT(*) AS requests FROM usage_events WHERE createdAt>=?',
      )
      .get(Date.now() - 5 * 60 * 60 * 1000) as unknown as {
      tokens: number;
      requests: number;
    };
    return {
      totalTokens: total.totalTokens,
      inputTokens: total.inputTokens,
      outputTokens: total.outputTokens,
      requests: total.requests,
      quotaTokens,
      last5hTokens: recent.tokens,
      last5hRequests: recent.requests,
      byProvider,
    };
  }
}

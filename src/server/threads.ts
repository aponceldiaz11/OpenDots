import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Message } from '@ag-ui/core';

export interface ThreadRecord {
  id: string;
  dotId: string;
  ownerId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface MessageRow {
  value: string;
}

/**
 * Local replacement for CopilotKit Intelligence Threads. Conversations and
 * their AG-UI message history live entirely in the workspace database.
 */
export class ThreadStore {
  private db: DatabaseSync;
  constructor(
    path: string,
    readonly ownerId: string,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS agent_threads(id TEXT PRIMARY KEY, dotId TEXT NOT NULL, ownerId TEXT NOT NULL, title TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_messages(id INTEGER PRIMARY KEY AUTOINCREMENT, threadId TEXT NOT NULL, seq INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS agent_messages_thread ON agent_messages(threadId, seq);
      CREATE INDEX IF NOT EXISTS agent_threads_dot ON agent_threads(dotId, createdAt);`);
  }

  close(): void {
    this.db.close();
  }

  threads(): ThreadRecord[] {
    return this.db
      .prepare(
        'SELECT * FROM agent_threads WHERE ownerId=? ORDER BY updatedAt DESC',
      )
      .all(this.ownerId) as unknown as ThreadRecord[];
  }

  thread(id: string): ThreadRecord | undefined {
    return this.db
      .prepare('SELECT * FROM agent_threads WHERE id=? AND ownerId=?')
      .get(id, this.ownerId) as unknown as ThreadRecord | undefined;
  }

  requireThread(id: string): ThreadRecord {
    const thread = this.thread(id);
    if (!thread) throw new Error('Conversation does not belong to this owner.');
    return thread;
  }

  createThread(dotId: string, title: string): ThreadRecord {
    const now = Date.now();
    const thread: ThreadRecord = {
      id: randomUUID(),
      dotId,
      ownerId: this.ownerId,
      title,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        'INSERT INTO agent_threads(id, dotId, ownerId, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        thread.id,
        thread.dotId,
        thread.ownerId,
        thread.title,
        thread.createdAt,
        thread.updatedAt,
      );
    return thread;
  }

  renameThread(id: string, title: string): ThreadRecord {
    this.requireThread(id);
    this.db
      .prepare('UPDATE agent_threads SET title=?, updatedAt=? WHERE id=?')
      .run(title, Date.now(), id);
    return this.requireThread(id);
  }

  deleteThread(id: string): boolean {
    this.requireThread(id);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM agent_messages WHERE threadId=?').run(id);
      const changes = this.db
        .prepare('DELETE FROM agent_threads WHERE id=? AND ownerId=?')
        .run(id, this.ownerId).changes;
      this.db.exec('COMMIT');
      return changes > 0;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  messages(threadId: string): Message[] {
    this.requireThread(threadId);
    return (
      this.db
        .prepare(
          'SELECT value FROM agent_messages WHERE threadId=? ORDER BY seq',
        )
        .all(threadId) as unknown as MessageRow[]
    ).map((row) => JSON.parse(row.value) as Message);
  }

  appendMessage(threadId: string, message: Message): void {
    this.appendMessages(threadId, [message]);
  }

  appendMessages(threadId: string, messages: Message[]): void {
    this.requireThread(threadId);
    if (!messages.length) return;
    const next = this.db
      .prepare(
        'SELECT COALESCE(MAX(seq), -1) AS seq FROM agent_messages WHERE threadId=?',
      )
      .get(threadId) as { seq: number };
    this.db.exec('BEGIN');
    try {
      let seq = next.seq + 1;
      for (const message of messages) {
        this.db
          .prepare(
            'INSERT INTO agent_messages(threadId, seq, value) VALUES (?, ?, ?)',
          )
          .run(threadId, seq, JSON.stringify(message));
        seq += 1;
      }
      this.db
        .prepare('UPDATE agent_threads SET updatedAt=? WHERE id=?')
        .run(Date.now(), threadId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

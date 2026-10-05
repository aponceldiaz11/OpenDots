import { afterEach, expect, it } from 'vitest';
import type { Message } from '@ag-ui/core';
import { ThreadStore } from '../src/server/threads.js';

const stores: ThreadStore[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));

function store() {
  const value = new ThreadStore(':memory:', 'owner');
  stores.push(value);
  return value;
}

const user = (content: string): Message => ({
  id: content,
  role: 'user',
  content,
});

it('creates threads owned by the stable owner id', () => {
  const threads = store();
  const thread = threads.createThread('dot-1', 'First');
  expect(threads.threads()).toEqual([expect.objectContaining({ id: thread.id })]);
  expect(threads.thread(thread.id)?.title).toBe('First');
  expect(() => threads.requireThread('missing')).toThrow();
});

it('appends and reads message history in order', () => {
  const threads = store();
  const thread = threads.createThread('dot-1', 'Chat');
  threads.appendMessage(thread.id, user('one'));
  threads.appendMessages(thread.id, [user('two'), user('three')]);
  expect(threads.messages(thread.id).map((message) => message.content)).toEqual([
    'one',
    'two',
    'three',
  ]);
});

it('renames and deletes threads with their messages', () => {
  const threads = store();
  const thread = threads.createThread('dot-1', 'Chat');
  threads.appendMessage(thread.id, user('hello'));
  threads.renameThread(thread.id, 'Renamed');
  expect(threads.requireThread(thread.id).title).toBe('Renamed');
  expect(threads.deleteThread(thread.id)).toBe(true);
  expect(threads.thread(thread.id)).toBeUndefined();
  expect(() => threads.messages(thread.id)).toThrow();
});

it('persists across reopen', () => {
  const path = `/tmp/threads-test-${Date.now()}.sqlite`;
  const first = new ThreadStore(path, 'owner');
  const thread = first.createThread('dot-1', 'Persisted');
  first.appendMessage(thread.id, user('stored'));
  first.close();
  const second = new ThreadStore(path, 'owner');
  expect(second.messages(thread.id)).toHaveLength(1);
  second.close();
});

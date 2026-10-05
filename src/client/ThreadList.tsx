import { MessageCircle, Plus } from 'lucide-react';
import type { Conversation, Dot } from '../shared/types';

export function ThreadList({
  dots,
  dotId,
  local,
  selected,
  onSelect,
  onNew,
}: {
  dots: Dot[];
  dotId: string;
  local: Conversation[];
  selected?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const threads = local
    .filter((thread) => thread.dotId === dotId)
    .slice(0, 20);
  return (
    <section className="thread-list">
      <div className="nav-label">
        RECENT CHATS
        <button
          className="icon-button"
          onClick={onNew}
          aria-label="New conversation"
        >
          <Plus size={14} />
        </button>
      </div>
      {threads.map((thread) => (
        <button
          key={thread.id}
          className={`nav-item ${selected === thread.id ? 'active' : ''}`}
          onClick={() => onSelect(thread.id)}
        >
          <MessageCircle size={15} />
          <span className="thread-summary">
            <span>{thread.title}</span>
            <small>{dots.find((dot) => dot.id === thread.dotId)?.name}</small>
          </span>
        </button>
      ))}
      {!threads.length && (
        <p className="sidebar-empty">Your first conversation will live here.</p>
      )}
    </section>
  );
}

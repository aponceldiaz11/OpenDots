import { isInternalVoiceReceipt } from './ChatTranscript';
import { pageReviewTool } from '../shared/page-review';
import { contextualMessage, type PageContext } from './page-context';
import { api } from './api';
import type { Page } from '../server/pages';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Clock3,
  FilePlus,
  Link2,
  Mic,
  Phone,
  PhoneOff,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type { AssistantMessage } from '@ag-ui/core';
import type { CallReceipt, Conversation, Dot } from '../shared/types';
import { Mascot } from './Mascot';
import { useVoice } from './useVoice';
import { useChat } from './use-chat';
import { useSpeech } from './use-speech';
import { ToolCards } from './ToolCards';
import { CallView } from './CallView';
import type { Message } from '@ag-ui/core';

export function Chat({
  thread,
  dot,
  initialPrompt,
  onConsumed,
  voiceReady,
  calls,
  paused,
  onSaved,
  onSchedule,
  onComputer,
}: {
  thread: Conversation;
  dot: Dot;
  initialPrompt?: string;
  onConsumed: () => void;
  voiceReady: boolean;
  calls: CallReceipt[];
  paused: boolean;
  onSaved: () => void;
  onSchedule: () => void;
  onComputer?: () => void;
}) {
  const [pageContext, setPageContext] = useState<PageContext | null>();
  const [contextError, setContextError] = useState('');
  const [contextAttempt, setContextAttempt] = useState(0);
  const contextReady = pageContext !== undefined;
  useEffect(() => {
    let active = true;
    setPageContext(undefined);
    setContextError('');
    void api<PageContext | null>(
      `/conversations/${thread.id}/page-context`,
      'GET',
      undefined,
      AbortSignal.timeout(10000),
    )
      .then((page) => {
        if (active) setPageContext(page);
      })
      .catch(() => {
        if (active)
          setContextError(
            'Conversation context could not load. Retry before sending your message.',
          );
      });
    return () => {
      active = false;
    };
  }, [thread.id, contextAttempt]);
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const sent = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const chat = useChat(
    thread.id,
    (text) => contextualMessage(text, pageContext),
    [
      {
        name: pageReviewTool.name,
        description: pageReviewTool.description,
        parameters: pageReviewTool.parameters,
      },
    ],
  );
  const { messages, running, loaded, error, setError } = chat;
  const voice = useVoice(thread.id, onSaved, messages.at(-1)?.id);
  const [speakReplies, setSpeakReplies] = useState(false);
  const speech = useSpeech('es-ES', (text) =>
    setDraft((previous) => `${previous}${previous ? ' ' : ''}${text}`),
  );
  const lastAssistant = messages.at(-1);
  useEffect(() => {
    if (
      speakReplies &&
      !running &&
      lastAssistant?.role === 'assistant' &&
      typeof lastAssistant.content === 'string'
    )
      speech.speak(lastAssistant.content);
  }, [speakReplies, running]);
  const send = async (text: string) => {
    if (!text.trim() || running || !loaded || !contextReady || paused) return;
    setDraft('');
    setSource('');
    setSourceOpen(false);
    await chat.send(text);
    onSaved();
  };
  useEffect(() => {
    if (loaded && contextReady && !paused && initialPrompt && !sent.current) {
      sent.current = true;
      onConsumed();
      void send(initialPrompt);
    }
  }, [loaded, contextReady, paused, initialPrompt]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [messages.length, running]);
  useEffect(() => {
    if (paused && voice.status !== 'idle') void voice.end();
  }, [paused]);
  const computerCalls = messages.flatMap((message) =>
    message.role === 'assistant' ? (message.toolCalls ?? []) : [],
  );
  const latestBrowserCall = computerCalls.findLast((call) =>
    [
      'navigate',
      'snapshot',
      'read',
      'screenshot',
      'click',
      'type',
      'key',
      'scroll',
    ].some((action) => call.function.name === `computer_${action}`),
  );
  const visible = messages.filter(
    (message: Message) =>
      !isInternalVoiceReceipt(message) &&
      ['user', 'assistant'].includes(message.role) &&
      ((typeof message.content === 'string' && message.content.trim()) ||
        (message.role === 'assistant' &&
          message.toolCalls?.some(
            (call) =>
              call.function.name.startsWith('computer_') ||
              call.function.name === pageReviewTool.name ||
              call.function.name === 'delegate_task',
          ))),
  );
  return (
    <div className="live-chat">
      <header className="chat-persona">
        <Mascot
          identity={dot.id}
          name={dot.name}
          small
          state={running ? 'working' : paused ? 'paused' : 'idle'}
        />
        <div>
          <strong>{dot.name}</strong>
          <span>
            {paused
              ? 'Paused'
              : running
                ? 'Thinking…'
                : loaded && contextReady
                  ? 'Here with you'
                  : 'Connecting to your conversation…'}
          </span>
        </div>
        <div className="chat-persona-actions">
          <button
            className="icon-button"
            aria-label="Save conversation as page"
            disabled={running}
            onClick={async () => {
              const title = window.prompt('Page title', thread.title);
              if (!title) return;
              try {
                const page = await api<Page>(
                  `/conversations/${thread.id}/page`,
                  'POST',
                  { title },
                );
                location.hash = `/spaces/${page.spaceId}/pages/${page.id}`;
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Could not save conversation.',
                );
              }
            }}
          >
            <FilePlus size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Schedule a task in this conversation"
            onClick={onSchedule}
          >
            <Clock3 size={18} />
          </button>
          <button
            className={`icon-button ${voice.status === 'active' ? 'on-call' : ''}`}
            aria-label={
              voice.status === 'idle' ? 'Start voice call' : 'End voice call'
            }
            title={
              voiceReady
                ? 'Talk with your Dot'
                : 'Voice setup requires VOICE_API_KEY and VOICE_MODEL'
            }
            disabled={!voiceReady || paused || !loaded || !contextReady}
            onClick={() =>
              voice.status === 'idle' ? void voice.start() : void voice.end()
            }
          >
            {voice.status === 'idle' ? (
              <Phone size={18} />
            ) : (
              <PhoneOff size={18} />
            )}
          </button>
        </div>
      </header>
      {pageContext && (
        <div className="page-chat-context">
          Working on{' '}
          <a href={`/#/spaces/${pageContext.spaceId}/pages/${pageContext.id}`}>
            {pageContext.title}
          </a>
        </div>
      )}
      <div className="chat-transcript">
        {!visible.length && (
          <div className="chat-welcome">
            <span className="eyebrow">A LITTLE SPACE TO THINK</span>
            <h1>What’s on your mind?</h1>
            <p>{dot.instructions}</p>
            <p className="muted">
              Your conversation stays with this Dot, across text and calls.
            </p>
          </div>
        )}
        {visible.map((message: Message) => (
          <ChatRow
            key={message.id}
            message={message}
            calls={calls}
            toolResults={chat.toolResults}
            threadId={thread.id}
            dot={dot}
            running={running}
            showScreenFor={latestBrowserCall?.id}
            onSaved={onSaved}
            onComputer={onComputer}
            respond={chat.respond}
          />
        ))}
        {running && (
          <div className="thinking">
            <span />
            <span />
            <span />
            <span>{dot.name} is thinking</span>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {contextError && (
        <div className="chat-error" role="alert">
          {contextError}
          <button onClick={() => setContextAttempt((value) => value + 1)}>
            Retry context
          </button>
        </div>
      )}
      {(error || voice.error) && (
        <div className="chat-error" role="alert">
          {error || voice.error}
          {error && (
            <button
              onClick={() => {
                setError('');
                void chat.reload();
              }}
            >
              Reconnect
            </button>
          )}
        </div>
      )}
      <CallView
        key={voice.status === 'idle' ? 'idle' : 'call'}
        dot={dot}
        voice={voice}
      />
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(`${source ? `From ${source}:\n\n` : ''}${draft}`);
        }}
      >
        {sourceOpen && (
          <div className="source-input">
            <Link2 size={15} />
            <input
              aria-label="Source page URL"
              type="url"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://example.com/page"
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove source"
              onClick={() => {
                setSourceOpen(false);
                setSource('');
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="chat-compose-row">
          <button
            type="button"
            className="icon-button"
            aria-label="Add source page link"
            onClick={() => setSourceOpen(!sourceOpen)}
          >
            <Link2 size={19} />
          </button>
          {speech.supported && (
            <button
              type="button"
              className={`icon-button ${speech.listening ? 'on-call' : ''}`}
              aria-label={
                speech.listening ? 'Stop dictation' : 'Dictate with the microphone'
              }
              onClick={() =>
                speech.listening ? speech.stop() : speech.start()
              }
            >
              <Mic size={19} />
            </button>
          )}
          <button
            type="button"
            className={`icon-button ${speakReplies ? 'on-call' : ''}`}
            aria-label="Leer respuestas en voz alta"
            onClick={() => setSpeakReplies(!speakReplies)}
          >
            <Volume2 size={19} />
          </button>
          <textarea
            aria-label="Message your Dot"
            placeholder={`Message ${dot.name}…`}
            rows={1}
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {running ? (
            <button
              type="button"
              className="send-button"
              aria-label="Stop response"
              onClick={() => chat.stop()}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              className="send-button"
              aria-label="Send message"
              disabled={!draft.trim() || !loaded || !contextReady || paused}
            >
              <ArrowUp size={19} />
            </button>
          )}
        </div>
        <div className="chat-compose-note">
          {voiceReady
            ? 'Text and voice, one conversation.'
            : 'Text is ready. Voice needs separate server configuration.'}
        </div>
      </form>
    </div>
  );
}

function ChatRow({
  message,
  calls,
  toolResults,
  threadId,
  dot,
  running,
  showScreenFor,
  onSaved,
  onComputer,
  respond,
}: {
  message: Message;
  calls: CallReceipt[];
  toolResults: Record<string, string>;
  threadId: string;
  dot: Dot;
  running: boolean;
  showScreenFor?: string;
  onSaved: () => void;
  onComputer?: () => void;
  respond: (toolCallId: string, content: string) => void;
}) {
  const content = typeof message.content === 'string' ? message.content : '';
  const call = calls.find((item) => item.anchorMessageId === message.id);
  return (
    <div>
      {content.trim() && (
        <div className={`chat-bubble ${message.role}`}>
          <span>{content}</span>
        </div>
      )}
      {message.role === 'assistant' && (
        <ToolCards
          message={message as AssistantMessage}
          toolResults={toolResults}
          threadId={threadId}
          dotId={dot.id}
          dotName={dot.name}
          running={running}
          showScreenFor={showScreenFor}
          onSaved={onSaved}
          onComputer={onComputer}
          respond={respond}
        />
      )}
      {call && (
        <div className="call-receipt">
          <PhoneOff size={13} />
          <span>
            {call.status === 'failed'
              ? 'Call failed'
              : call.endedAt
                ? `${Math.round((call.endedAt - call.startedAt) / 1000)}s · Call ended`
                : 'Call in progress'}
          </span>
          {call.error && <small>{call.error}</small>}
        </div>
      )}
    </div>
  );
}

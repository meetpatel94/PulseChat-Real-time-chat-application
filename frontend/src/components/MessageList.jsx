import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble.jsx";

export default function MessageList({
  messages,
  currentUsername,
  state,
  error,
  onRetry,
}) {
  const containerRef = useRef(null);

  // Auto-scroll to the bottom on new messages — but only when the
  // user is already near the bottom (don't yank them while scrolling).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="messages-scroll" ref={containerRef} aria-live="polite">
      <div className="messages-inner">
        {state === "loading" && (
          <div className="list-state">
            <span className="spinner" aria-hidden="true" />
            <p>Loading chat history…</p>
          </div>
        )}

        {state === "error" && (
          <div className="list-state">
            <p className="list-state-error">
              {error || "Could not load messages."}
            </p>
            <button type="button" className="retry-btn" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        {state === "ready" && messages.length === 0 && (
          <div className="list-state">
            <p className="list-state-title">No messages yet</p>
            <p>Say hello — new messages appear here in real time.</p>
          </div>
        )}

        {state === "ready" &&
          messages.map((m) => (
            <MessageBubble
              key={m._id || m.id}
              message={m}
              isOwn={m.username === currentUsername}
            />
          ))}
      </div>
    </div>
  );
}

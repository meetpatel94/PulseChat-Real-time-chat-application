export default function TypingIndicator({ names }) {
  const visible = names.length > 0;

  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names.length} people are typing`;

  // Fixed height so the layout never jumps when typing starts/stops.
  return (
    <div className="typing-row" role="status" aria-live="polite">
      {visible && (
        <>
          <span className="typing-text">{label}</span>
          <span className="typing-dots" aria-hidden="true">
            <span className="typing-dot" />
            <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
            <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
          </span>
        </>
      )}
    </div>
  );
}

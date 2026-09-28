import { useEffect, useRef, useState } from "react";

const TYPE_EMIT_MS = 400; // throttle: at most one "typing" every 400ms
const STOP_TYPING_MS = 1200; // idle for 1.2s => "stop_typing"

export default function MessageInput({ onSend, onTyping, onTypingStop }) {
  const [text, setText] = useState("");
  const stopTimer = useRef(null);
  const lastEmit = useRef(0);

  useEffect(() => () => clearTimeout(stopTimer.current), []);

  const scheduleStop = () => {
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      lastEmit.current = 0;
      onTypingStop();
    }, STOP_TYPING_MS);
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    if (value.trim()) {
      const now = Date.now();
      if (now - lastEmit.current > TYPE_EMIT_MS) {
        lastEmit.current = now;
        onTyping();
      }
      scheduleStop();
    }
  };

  const handleSend = () => {
    const clean = text.trim();
    if (!clean) return; // prevent empty messages
    clearTimeout(stopTimer.current);
    lastEmit.current = 0;
    onTypingStop();
    onSend(clean);
    setText("");
  };

  return (
    <form
      className="input-bar"
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
    >
      <input
        className="input-field"
        type="text"
        placeholder="Type a message…"
        value={text}
        maxLength={1000}
        autoComplete="off"
        aria-label="Message"
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <button
        type="submit"
        className="send-btn"
        disabled={!text.trim()}
        aria-label="Send message"
        title="Send (Enter)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4 20-7z" />
        </svg>
      </button>
    </form>
  );
}

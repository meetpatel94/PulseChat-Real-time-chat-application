import { formatTime } from "../utils/format.js";

function StatusIcon({ status }) {
  if (status === "delivered") {
    return (
      <svg
        className="msg-status"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="Delivered"
      >
        <path d="M18 6 7 17l-5-5" />
        <path d="m22 10-7.5 7.5L13 16" />
      </svg>
    );
  }
  return (
    <svg
      className="msg-status"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Sent"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function MessageBubble({ message, isOwn }) {
  return (
    <div className={`msg-row ${isOwn ? "msg-own" : "msg-other"}`}>
      <div className="msg-bubble">
        {!isOwn && <span className="msg-author">{message.username}</span>}
        <p className="msg-text">{message.text}</p>
        <span className="msg-meta">
          {formatTime(message.createdAt)}
          {isOwn && <StatusIcon status={message.status} />}
        </span>
      </div>
    </div>
  );
}

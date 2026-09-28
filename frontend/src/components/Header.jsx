import OnlineUsers from "./OnlineUsers.jsx";

const STATUS_META = {
  connected: { label: "Connected", cls: "status-connected" },
  connecting: { label: "Connecting", cls: "status-connecting" },
  disconnected: { label: "Disconnected", cls: "status-disconnected" },
};

export default function Header({
  username,
  onlineUsers,
  connectionStatus,
  onLogout,
}) {
  const status = STATUS_META[connectionStatus] || STATUS_META.connecting;

  return (
    <header className="chat-header">
      <div className="header-brand">
        <span className="brand-mark" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
          </svg>
        </span>
        <span className="brand-name">PulseChat</span>
      </div>

      <span className={`status-pill ${status.cls}`}>
        <span className="status-dot" aria-hidden="true" />
        {status.label}
      </span>

      <div className="header-right">
        <OnlineUsers users={onlineUsers} />
        <span className="user-chip" title="You are chatting as this user">
          <span className="user-chip-dot" aria-hidden="true" />
          {username}
        </span>
        <button
          type="button"
          className="logout-btn"
          onClick={onLogout}
          title="Log out"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="logout-label">Logout</span>
        </button>
      </div>
    </header>
  );
}

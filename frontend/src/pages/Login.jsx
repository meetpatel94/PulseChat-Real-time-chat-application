import { useState } from "react";

const MAX_USERNAME_LENGTH = 30;

export default function Login({ onLogin }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Please enter a username.");
      return;
    }
    if (clean.length > MAX_USERNAME_LENGTH) {
      setError(`Username must be at most ${MAX_USERNAME_LENGTH} characters.`);
      return;
    }
    onLogin(clean);
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo" aria-hidden="true">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
          </svg>
        </div>

        <h1 className="login-title">PulseChat</h1>
        <p className="login-sub">
          Real-time chat. Join with any username — no password needed.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="login-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="login-input"
            type="text"
            placeholder="e.g. Meet"
            value={name}
            maxLength={MAX_USERNAME_LENGTH}
            autoComplete="off"
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
          />
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary login-btn">
            Join chat
          </button>
        </form>

        <p className="login-hint">
          Tip: open a second window (or incognito) with a different name to see
          live sync, typing and online users.
        </p>
      </div>
    </div>
  );
}

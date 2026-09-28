"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  username: string;
  text: string;
  createdAt: string;
  status: "sent" | "delivered";
};

type ConnectionState = "connecting" | "connected" | "disconnected";
type HistoryState = "loading" | "ready" | "error";

const STORAGE_KEY = "pulsechat_username";
const MAX_USERNAME = 30;

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function avatarColor(name: string) {
  const palette = ["#0e7d6c", "#b45309", "#a04e2f", "#55685f", "#7d5a1e"];
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return palette[sum % palette.length];
}

function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#12907c] to-[#0b6e5f] text-white shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
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
  );
}

function SendIcon() {
  return (
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
  );
}

function LogoutIcon() {
  return (
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
  );
}

function TrashIcon() {
  return (
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
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function CheckIcon({ double }: { double: boolean }) {
  return double ? (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Delivered"
    >
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  ) : (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Sent"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function PulseChat() {
  const [username, setUsername] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  });
  const [loginName, setLoginName] = useState("");
  const [loginError, setLoginError] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [historyError, setHistoryError] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [conn, setConn] = useState<ConnectionState>("connecting");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);

  const seenOnce = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upsertMessage = useCallback((msg: ChatMessage) => {
    if (!msg || !msg.id) return;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = msg;
        return next;
      }
      return [...prev, msg].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
    });
  }, []);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  const loadHistory = useCallback(async (quiet: boolean) => {
    if (!quiet) setHistoryState("loading");
    try {
      const res = await fetch("/api/messages?limit=100");
      if (!res.ok) throw new Error("Request failed");
      const data = (await res.json()) as ChatMessage[];
      setMessages(data);
      setHistoryState("ready");
    } catch {
      if (!quiet) {
        setHistoryError("Could not load chat history. Is the server running?");
        setHistoryState("error");
      }
    }
  }, []);

  // Load history once on mount so a refresh always shows previous messages.
  useEffect(() => {
    loadHistory(false);
  }, [loadHistory]);

  // Realtime stream (server-sent events) — one per tab, auto-reconnects.
  useEffect(() => {
    if (!username) return;
    const source = new EventSource(
      `/api/stream?username=${encodeURIComponent(username)}`
    );

    source.onopen = () => {
      setConn("connected");
      if (seenOnce.current) {
        // Pick up anything sent while this tab was disconnected.
        loadHistory(true);
      } else {
        seenOnce.current = true;
      }
    };
    source.onerror = () => setConn("disconnected");
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          event: string;
          data:
            | ChatMessage
            | string[]
            | { username: string; isTyping: boolean }
            | { by: string };
        };
        if (parsed.event === "message") {
          upsertMessage(parsed.data as ChatMessage);
        } else if (parsed.event === "chat_cleared") {
          // Another user cleared the whole chat — empty this tab too.
          setMessages([]);
          setHistoryState("ready");
        } else if (parsed.event === "online_users") {
          setOnlineUsers(parsed.data as string[]);
        } else if (parsed.event === "typing") {
          const { username: name, isTyping } = parsed.data as {
            username: string;
            isTyping: boolean;
          };
          setTypingUsers((prev) => {
            const next = { ...prev };
            if (isTyping) next[name] = Date.now();
            else delete next[name];
            return next;
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => source.close();
  }, [username, loadHistory, upsertMessage]);

  // Expire stale typing indicators after 3 seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const expired = Object.keys(prev).filter(
          (k) => now - prev[k] > 3000
        );
        if (expired.length === 0) return prev;
        const next = { ...prev };
        expired.forEach((k) => delete next[k]);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keep scrolled to the bottom unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, typingUsers]);

  const emitTyping = useCallback(
    (isTyping: boolean) => {
      if (!username) return;
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, isTyping }),
      }).catch(() => undefined);
    },
    [username]
  );

  const stopTypingNow = useCallback(() => {
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    lastTypingSent.current = 0;
    emitTyping(false);
  }, [emitTyping]);

  const handleInputChange = (value: string) => {
    if (value.trim().length === 0) return;
    const now = Date.now();
    if (now - lastTypingSent.current > 400) {
      lastTypingSent.current = now;
      emitTyping(true);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      lastTypingSent.current = 0;
      emitTyping(false);
    }, 1200);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = (inputRef.current?.value ?? "").trim();
    if (!text || sending) return;
    setSending(true);
    stopTypingNow();
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, text }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        message?: ChatMessage;
      } | null;
      if (!res.ok || !data?.success || !data.message) {
        throw new Error(data?.error ?? "Failed to send message");
      }
      upsertMessage(data.message);
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.focus();
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Failed to send message"
      );
    } finally {
      setSending(false);
    }
  };

  /**
   * Clear every message in the chat (for all users) after confirmation.
   * The DELETE call broadcasts `chat_cleared` so other tabs clear live.
   */
  const handleClearChat = async () => {
    if (clearing) return;
    const ok = window.confirm(
      "Clear all messages for everyone? This cannot be undone."
    );
    if (!ok) return;
    setClearing(true);
    try {
      const res = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error ?? "Failed to clear chat");
      }
      setMessages([]);
      setHistoryState("ready");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Failed to clear chat");
    } finally {
      setClearing(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = loginName.trim();
    if (!clean) {
      setLoginError("Please enter a username.");
      return;
    }
    if (clean.length > MAX_USERNAME) {
      setLoginError(`Username must be at most ${MAX_USERNAME} characters.`);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, clean);
    setLoginError("");
    setNotice("");
    setUsername(clean);
  };

  const handleLogout = () => {
    stopTypingNow();
    window.localStorage.removeItem(STORAGE_KEY);
    setOnlineUsers([]);
    setTypingUsers({});
    setConn("connecting");
    setLoginName("");
    setUsername("");
  };

  /* ---------------- Login screen ---------------- */

  if (!username) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#eef1ef] px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-[#e2e8e4] bg-white p-8 shadow-[0_24px_70px_rgba(24,35,31,0.14)]">
          <div className="flex flex-col items-center text-center">
            <Logo size={52} />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1c2521]">
              PulseChat
            </h1>
            <p className="mt-1.5 text-sm text-[#5c6b64]">
              Real-time chat. Join with any username — no password needed.
            </p>
          </div>
          <form onSubmit={handleLogin} className="mt-6" noValidate>
            <label
              htmlFor="login-username"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#5c6b64]"
            >
              Username
            </label>
            <input
              id="login-username"
              className="w-full rounded-xl border border-[#d5ded8] bg-[#f6f8f7] px-4 py-3 text-[15px] text-[#1c2521] outline-none transition focus:border-[#0e7d6c] focus:ring-2 focus:ring-[#0e7d6c]/20"
              placeholder="e.g. Meet"
              value={loginName}
              maxLength={MAX_USERNAME}
              autoComplete="off"
              autoFocus
              onChange={(e) => {
                setLoginName(e.target.value);
                if (loginError) setLoginError("");
              }}
            />
            {loginError && (
              <p className="mt-2 text-sm text-[#dc2626]" role="alert">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              className="mt-4 w-full rounded-xl bg-[#0e7d6c] px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#0b6e5f]"
            >
              Join chat
            </button>
          </form>
          <p className="mt-5 text-center text-xs leading-relaxed text-[#8a968f]">
            Tip: open a second browser window with a different name to watch
            messages, typing and online users sync live.
          </p>
          <p className="mt-2 text-center text-[11px] text-[#a8b1ab]">
            Sandbox demo — production source (Socket.io + MongoDB) lives in{" "}
            <code>backend/</code> and <code>frontend/</code>.
          </p>
        </div>
      </div>
    );
  }

  /* ---------------- Chat screen ---------------- */

  const typingNames = Object.keys(typingUsers);
  const typingLabel =
    typingNames.length === 1
      ? `${typingNames[0]} is typing`
      : typingNames.length === 2
        ? `${typingNames[0]} and ${typingNames[1]} are typing`
        : `${typingNames.length} people are typing`;

  const shownOnline = onlineUsers.length > 0 ? onlineUsers : [username];

  return (
    <div className="min-h-dvh bg-[#eef1ef] md:flex md:items-center md:justify-center md:p-6">
      <div className="flex h-dvh flex-col overflow-hidden bg-white md:h-[min(840px,calc(100dvh-3rem))] md:max-w-3xl md:rounded-2xl md:border md:border-[#e2e8e4] md:shadow-[0_24px_70px_rgba(24,35,31,0.14)]">
        {/* Header */}
        <header className="flex items-center gap-2.5 border-b border-[#e2e8e4] bg-white px-4 py-3 md:px-5">
          <Logo size={34} />
          <h1 className="hidden text-[15px] font-bold tracking-tight text-[#1c2521] sm:inline">
            PulseChat
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              conn === "connected"
                ? "bg-emerald-50 text-emerald-700"
                : conn === "connecting"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-red-50 text-red-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {conn === "connected"
              ? "Connected"
              : conn === "connecting"
                ? "Connecting"
                : "Disconnected"}
          </span>
          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <div
              className="flex items-center"
              title={`Online: ${shownOnline.join(", ")}`}
            >
              <div className="flex -space-x-1.5">
                {shownOnline.slice(0, 4).map((u) => (
                  <span
                    key={u}
                    className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-white"
                    style={{ backgroundColor: avatarColor(u) }}
                  >
                    {u.slice(0, 1).toUpperCase()}
                  </span>
                ))}
                {shownOnline.length > 4 && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#e8ecea] text-[10px] font-bold text-[#55605a] ring-2 ring-white">
                    +{shownOnline.length - 4}
                  </span>
                )}
              </div>
              <span className="ml-2 hidden text-xs font-medium text-[#5c6b64] sm:inline">
                {shownOnline.length} online
              </span>
            </div>
            <span className="hidden max-w-[140px] truncate items-center rounded-full bg-[#edf4f1] px-3 py-1 text-xs font-semibold text-[#0b6e5f] sm:inline-flex">
              {username}
            </span>
            <button
              type="button"
              onClick={handleClearChat}
              disabled={clearing || messages.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#f0d3d3] px-3 py-1.5 text-xs font-semibold text-[#b91c1c] transition-colors hover:border-[#e5b4b4] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
              title="Clear all messages for everyone"
            >
              <TrashIcon />
              <span className="hidden sm:inline">
                {clearing ? "Clearing…" : "Clear chat"}
              </span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d5ded8] px-3 py-1.5 text-xs font-semibold text-[#55605a] transition-colors hover:border-[#c3cec7] hover:bg-[#f6f8f7]"
              title="Log out"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {conn !== "connected" && (
          <div
            className={`px-4 py-2 text-center text-xs font-medium ${
              conn === "connecting"
                ? "bg-[#f4f6f5] text-[#5c6b64]"
                : "bg-amber-50 text-amber-800"
            }`}
            role="status"
          >
            {conn === "connecting"
              ? "Connecting to the chat server…"
              : "Connection lost — reconnecting automatically…"}
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            nearBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 140;
          }}
          className="flex-1 overflow-y-auto bg-white px-3 py-4 md:px-5"
          aria-live="polite"
        >
          {historyState === "loading" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[#5c6b64]">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#cfd9d3] border-t-[#0e7d6c]" />
              Loading chat history…
            </div>
          ) : historyState === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-medium text-[#1c2521]">{historyError}</p>
              <button
                type="button"
                onClick={() => loadHistory(false)}
                className="rounded-full bg-[#0e7d6c] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0b6e5f]"
              >
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Logo size={44} />
              <p className="text-sm font-semibold text-[#1c2521]">
                No messages yet
              </p>
              <p className="text-xs text-[#8a968f]">
                Say hello — new messages appear here instantly.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-1">
              {messages.map((m) => {
                const own = m.username === username;
                return (
                  <div
                    key={m.id}
                    className={`flex ${own ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2 shadow-sm md:max-w-[72%] ${
                        own
                          ? "rounded-br-md bg-gradient-to-br from-[#12907c] to-[#0b6e5f] text-white"
                          : "rounded-bl-md border border-[#e2e8e4] bg-[#f3f6f4] text-[#1c2521]"
                      }`}
                    >
                      {!own && (
                        <p
                          className="mb-0.5 text-[11px] font-bold"
                          style={{ color: avatarColor(m.username) }}
                        >
                          {m.username}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                        {m.text}
                      </p>
                      <span
                        className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                          own ? "text-white/70" : "text-[#8a968f]"
                        }`}
                      >
                        {formatTime(m.createdAt)}
                        {own && <CheckIcon double={m.status === "delivered"} />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Typing indicator */}
        <div
          className="flex h-7 items-center gap-1.5 px-4 text-xs text-[#5c6b64] md:px-5"
          role="status"
          aria-live="polite"
        >
          {typingNames.length > 0 && (
            <>
              <span>{typingLabel}</span>
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#5c6b64]" />
              <span
                className="typing-dot h-1.5 w-1.5 rounded-full bg-[#5c6b64]"
                style={{ animationDelay: "0.15s" }}
              />
              <span
                className="typing-dot h-1.5 w-1.5 rounded-full bg-[#5c6b64]"
                style={{ animationDelay: "0.3s" }}
              />
            </>
          )}
        </div>

        {notice && (
          <div
            className="bg-red-50 px-4 py-1.5 text-center text-xs font-medium text-red-700"
            role="alert"
          >
            {notice}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="border-t border-[#e2e8e4] bg-white px-3 py-3 md:px-4"
        >
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              className="h-11 flex-1 rounded-full border border-[#d5ded8] bg-[#f6f8f7] px-4 text-[14px] text-[#1c2521] outline-none transition focus:border-[#0e7d6c] focus:bg-white focus:ring-2 focus:ring-[#0e7d6c]/20"
              placeholder="Type a message…"
              maxLength={1000}
              autoComplete="off"
              aria-label="Message"
              onChange={(e) => handleInputChange(e.target.value)}
            />
            <button
              type="submit"
              disabled={sending}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0e7d6c] text-white transition-colors hover:bg-[#0b6e5f] disabled:opacity-50"
              aria-label="Send message"
              title="Send (Enter)"
            >
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

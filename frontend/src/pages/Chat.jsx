import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAllMessages,
  fetchMessages,
  getErrorMessage,
  sendRestMessage,
} from "../services/api.js";
import { connectSocket, disconnectSocket, getSocket } from "../services/socket.js";
import { messageId } from "../utils/format.js";
import ChatWindow from "../components/ChatWindow.jsx";

const TYPING_EXPIRY_MS = 3000;

export default function Chat({ username, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [historyState, setHistoryState] = useState("loading"); // loading | ready | error
  const [historyError, setHistoryError] = useState("");
  const [onlineUsers, setOnlineUsers] = useState(() => [username]);
  const [typingUsers, setTypingUsers] = useState({}); // { [name]: lastSeen }
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [notice, setNotice] = useState("");

  const noticeTimer = useRef(null);
  const firstLoad = useRef(true);

  const showNotice = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  /** Add a message or replace an existing one (by id) — keeps status fresh. */
  const upsertMessage = useCallback((msg) => {
    const id = messageId(msg);
    if (!id) return;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => messageId(m) === id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = msg;
        return next;
      }
      return [...prev, msg].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
    });
  }, []);

  /** Load previous messages from the REST API (MongoDB). */
  const loadHistory = useCallback(async () => {
    if (firstLoad.current) setHistoryState("loading");
    try {
      const msgs = await fetchMessages(100);
      setMessages(msgs);
      setHistoryState("ready");
    } catch (err) {
      if (firstLoad.current) {
        setHistoryError(getErrorMessage(err));
        setHistoryState("error");
      }
    } finally {
      firstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    // 1. Fetch history first, then 2. use Socket.io for realtime updates.
    loadHistory();

    const socket = connectSocket(username);

    const onConnect = () => setConnectionStatus("connected");
    const onConnecting = () => setConnectionStatus("connecting");
    const onDisconnect = () => setConnectionStatus("disconnected");
    const onReconnect = () => loadHistory(); // pick up missed messages
    const onReceive = (msg) => upsertMessage(msg);
    const onChatCleared = () => {
      // Someone cleared the whole chat — empty this client too.
      setMessages([]);
      setHistoryState("ready");
    };
    const onOnline = (users) =>
      setOnlineUsers(Array.isArray(users) && users.length > 0 ? users : [username]);
    const onTyping = ({ username: name } = {}) => {
      if (!name || name === username) return;
      setTypingUsers((prev) => ({ ...prev, [name]: Date.now() }));
    };
    const onStopTyping = ({ username: name } = {}) => {
      if (!name || name === username) return;
      setTypingUsers((prev) => {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      });
    };
    const onMessageError = ({ message } = {}) =>
      showNotice(message || "Could not send message.");

    socket.on("connect", onConnect);
    socket.on("connecting", onConnecting);
    socket.on("disconnect", onDisconnect);
    socket.on("reconnect", onReconnect);
    socket.on("receive_message", onReceive);
    socket.on("chat_cleared", onChatCleared);
    socket.on("online_users", onOnline);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);
    socket.on("message_error", onMessageError);

    // Expire stale typing indicators so the UI never gets stuck.
    const typer = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const expired = Object.keys(prev).filter(
          (k) => now - prev[k] > TYPING_EXPIRY_MS
        );
        if (expired.length === 0) return prev;
        const next = { ...prev };
        expired.forEach((k) => delete next[k]);
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(typer);
      clearTimeout(noticeTimer.current);
      socket.off("chat_cleared", onChatCleared);
      disconnectSocket();
    };
  }, [username, loadHistory, upsertMessage, showNotice]);

  /**
   * Send a message: prefer the socket (server persists + broadcasts);
   * fall back to the REST API when the socket is not connected.
   */
  const handleSend = useCallback(
    async (text) => {
      const clean = text.trim();
      if (!clean) return;

      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit("send_message", { text: clean });
        return;
      }

      try {
        const data = await sendRestMessage(username, clean);
        upsertMessage(data.message);
      } catch (err) {
        showNotice(getErrorMessage(err));
      }
    },
    [username, upsertMessage, showNotice]
  );

  /**
   * Clear every message in the chat (for all users) after confirmation.
   * The DELETE call broadcasts `chat_cleared` so all clients empty live.
   */
  const handleClear = useCallback(async () => {
    const ok = window.confirm(
      "Clear all messages for everyone? This cannot be undone."
    );
    if (!ok) return false;

    try {
      await clearAllMessages();
      setMessages([]);
      setHistoryState("ready");
      return true;
    } catch (err) {
      showNotice(getErrorMessage(err));
      return false;
    }
  }, [showNotice]);

  const handleTyping = useCallback(() => {
    const socket = getSocket();
    if (socket && socket.connected) socket.emit("typing");
  }, []);

  const handleTypingStop = useCallback(() => {
    const socket = getSocket();
    if (socket && socket.connected) socket.emit("stop_typing");
  }, []);

  return (
    <ChatWindow
      username={username}
      messages={messages}
      onlineUsers={onlineUsers}
      typingNames={Object.keys(typingUsers)}
      connectionStatus={connectionStatus}
      historyState={historyState}
      historyError={historyError}
      notice={notice}
      onRetryHistory={loadHistory}
      onSend={handleSend}
      onClear={handleClear}
      onTyping={handleTyping}
      onTypingStop={handleTypingStop}
      onLogout={onLogout}
    />
  );
}

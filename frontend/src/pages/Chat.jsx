import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addGroupMembers, createConversation, getConversationMessages, getConversations,
  getGlobalConversation, markConversationRead, searchUsers,
} from "../services/api.js";
import { connectSocket, disconnectSocket, getSocket } from "../services/socket.js";

const THEMES = ["#e8f2ee", "#f1e8f6", "#f8eee2", "#e8eef8", "#f7e8eb", "#e9edf0"];
const THEME_KEY = "pulsechat_chat_themes";
const MODE_KEY = "pulsechat_mode";

export default function Chat({ user, token, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "light");
  const [themes, setThemes] = useState(() => { try { return JSON.parse(localStorage.getItem(THEME_KEY) || "{}"); } catch { return {}; } });
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [dialog, setDialog] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [typing, setTyping] = useState({});
  const [showPalette, setShowPalette] = useState(false);

  const activeId = active?._id || active?.id;
  const isAdmin = active?.admins?.some((a) => String(a._id || a) === user.id);
  const title = active?.type === "global" ? "Global lounge" : active?.type === "group" ? active.title : active?.participants?.find((p) => String(p._id || p.id) !== user.id)?.name || "Private chat";

  const refreshConversations = useCallback(async () => {
    const [global, rows] = await Promise.all([getGlobalConversation(), getConversations()]);
    const merged = [global, ...rows.filter((c) => c.type !== "global")];
    setConversations(merged);
    setActive((current) => current ? merged.find((c) => String(c._id || c.id) === String(current._id || current.id)) || global : global);
  }, []);

  useEffect(() => {
    let mounted = true;
    refreshConversations().catch((err) => mounted && setError(err.response?.data?.error || "Could not load conversations."));
    const socket = connectSocket(token);
    socket.on("connect", () => setOnline(true));
    socket.on("disconnect", () => setOnline(false));
    socket.on("connect_error", () => { setOnline(false); setError("Secure realtime connection failed. Please sign in again."); });
    socket.on("presence:update", () => refreshConversations().catch(() => {}));
    socket.on("typing:update", (event) => {
      if (!event?.conversationId) return;
      setTyping((prev) => ({ ...prev, [event.conversationId]: event.typing ? event.username : null }));
    });
    return () => { mounted = false; disconnectSocket(); };
  }, [token, refreshConversations]);

  useEffect(() => {
    if (!activeId) return;
    let mounted = true;
    setMessages([]);
    setError("");
    getConversationMessages(activeId)
      .then((rows) => { if (mounted) setMessages(rows); })
      .catch((err) => mounted && setError(err.response?.data?.error || "Could not load messages."));
    const socket = getSocket();
    if (socket?.connected) socket.emit("conversation:join", { conversationId: activeId }, (result) => {
      if (!result?.success && mounted) setError(result?.error || "Could not join this chat.");
    });
    if (active.type !== "global") markConversationRead(activeId).catch(() => {});
    return () => { mounted = false; };
  }, [activeId, active?.type]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const receive = (message) => {
      const id = String(message.conversation);
      if (id === String(activeId)) {
        setMessages((prev) => prev.some((m) => m._id === message._id) ? prev : [...prev, message]);
        if (String(message.sender?._id) !== user.id) markConversationRead(activeId).catch(() => {});
      }
      refreshConversations().catch(() => {});
    };
    socket.on("message:new", receive);
    return () => socket.off("message:new", receive);
  }, [activeId, refreshConversations, user.id]);

  useEffect(() => {
    if (query.trim().length < 2) { setUsers([]); return; }
    const timer = setTimeout(() => searchUsers(query).then(setUsers).catch(() => setUsers([])), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const toggleMode = () => setMode((old) => { const next = old === "dark" ? "light" : "dark"; localStorage.setItem(MODE_KEY, next); return next; });
  const setChatTheme = (color) => {
    const next = { ...themes, [activeId]: color };
    setThemes(next); localStorage.setItem(THEME_KEY, JSON.stringify(next));
  };

  async function startDirect(person) {
    setBusy(true); setError("");
    try {
      const conversation = await createConversation({ type: "direct", participantIds: [person.id] });
      await refreshConversations(); setActive(conversation); setDialog("");
      setQuery(""); setUsers([]);
    } catch (err) { setError(err.response?.data?.error || "Could not start private chat."); }
    finally { setBusy(false); }
  }

  async function createGroup() {
    if (!groupName.trim() || selectedUsers.length < 1) return;
    setBusy(true); setError("");
    try {
      const conversation = await createConversation({ type: "group", title: groupName.trim(), participantIds: selectedUsers });
      await refreshConversations(); setActive(conversation); setDialog("");
      setGroupName(""); setSelectedUsers([]); setQuery(""); setUsers([]);
    } catch (err) { setError(err.response?.data?.error || "Could not create group."); }
    finally { setBusy(false); }
  }

  async function addMembers() {
    if (!selectedUsers.length || !activeId) return;
    setBusy(true);
    try {
      await addGroupMembers(activeId, selectedUsers);
      await refreshConversations(); setDialog(""); setSelectedUsers([]);
    } catch (err) { setError(err.response?.data?.error || "Could not add members."); }
    finally { setBusy(false); }
  }

  function sendMessage(event) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !activeId) return;
    const socket = getSocket();
    if (!socket?.connected) { setError("Realtime connection is offline. Reconnect before sending."); return; }
    socket.emit("message:send", { conversationId: activeId, text: clean }, (result) => {
      if (!result?.success) setError(result?.error || "Message could not be sent.");
    });
    setText("");
    socket.emit("typing:stop", { conversationId: activeId });
  }

  const grouped = useMemo(() => ({
    direct: conversations.filter((c) => c.type === "direct"),
    group: conversations.filter((c) => c.type === "group"),
  }), [conversations]);

  return <main className="pulse-app" data-theme={mode}>
    <aside className="pulse-sidebar">
      <div className="side-top">
        <div className="pulse-brand"><span className="brand-symbol">ϟ</span><span>PulseChat</span></div>
        <button className="icon-button" onClick={toggleMode} title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{mode === "dark" ? "☀" : "☾"}</button>
      </div>
      <div className="profile-row"><div className="profile-avatar">{user.name?.[0]?.toUpperCase() || "U"}</div><div className="profile-meta"><b>{user.name}</b><span>@{user.username}</span></div><button className="text-button" onClick={onLogout}>Log out</button></div>
      <div className="side-actions">
        <button className="new-chat-button" onClick={() => setDialog("direct")}>＋ New private chat</button>
        <button className="new-group-button" onClick={() => setDialog("group")}>＋ Create group</button>
      </div>
      <div className="side-label">PUBLIC SPACE</div>
      <button className={`conversation-item ${activeId === conversations[0]?._id ? "selected" : ""}`} onClick={() => setActive(conversations[0])}>
        <span className="conversation-avatar global-avatar">◎</span><span className="conversation-copy"><b>Global lounge</b><small>Everyone on PulseChat</small></span><span className="online-indicator"/>
      </button>
      <div className="side-label">PRIVATE MESSAGES <span>{grouped.direct.length}</span></div>
      {grouped.direct.map((c) => {
        const other = c.participants?.find((p) => String(p._id || p.id) !== user.id);
        return <button key={c._id} className={`conversation-item ${activeId === c._id ? "selected" : ""}`} onClick={() => setActive(c)}>
          <span className="conversation-avatar">{other?.name?.[0]?.toUpperCase() || "?"}</span><span className="conversation-copy"><b>{other?.name || "Private chat"}</b><small>@{other?.username || "member"}</small></span>
        </button>;
      })}
      <div className="side-label">GROUPS <span>{grouped.group.length}</span></div>
      {grouped.group.map((c) => <button key={c._id} className={`conversation-item ${activeId === c._id ? "selected" : ""}`} onClick={() => setActive(c)}>
        <span className="conversation-avatar group-avatar">✣</span><span className="conversation-copy"><b>{c.title}</b><small>{c.participants?.length || 0} members</small></span>
      </button>)}
      <div className="sidebar-foot"><span className={online ? "online-indicator" : "offline-indicator"}/>{online ? "Secure connection active" : "Reconnecting…"}</div>
    </aside>

    <section className="pulse-main">
      <header className="room-header">
        <div className="room-icon">{active?.type === "group" ? "✣" : active?.type === "global" ? "◎" : "◉"}</div>
        <div className="room-heading"><h1>{title}</h1><p>{active?.type === "global" ? "A shared room for the whole community" : active?.type === "group" ? `${active.participants?.length || 0} members · Group conversation` : "End-to-end private room access · Members only"}</p></div>
        <div className="room-tools">
          {active?.type === "group" && isAdmin && <button className="icon-button" onClick={() => setDialog("members")} title="Add group members">＋</button>}
          <button className="icon-button" onClick={() => setShowPalette((v) => !v)} title="Customize chat background">◐</button>
          <span className={online ? "live-pill" : "offline-pill"}>{online ? "LIVE" : "OFFLINE"}</span>
        </div>
      </header>

      {showPalette && <div className="theme-popover"><b>Chat background</b><div className="theme-swatches">{THEMES.map((color) => <button key={color} aria-label={`Set chat background ${color}`} style={{ background: color }} onClick={() => setChatTheme(color)}/>)}</div><button className="reset-theme" onClick={() => { const next={...themes}; delete next[activeId]; setThemes(next); localStorage.setItem(THEME_KEY,JSON.stringify(next)); }}>Reset background</button></div>}
      <div className="message-stage" style={{ "--room-wallpaper": themes[activeId] || "var(--chat-wallpaper)" }}>
        <div className="message-feed">
          {messages.length === 0 && <div className="empty-room"><div>✧</div><h2>Make the first move.</h2><p>Start the conversation. Good things begin with hello.</p></div>}
          {messages.map((m) => {
            const own = String(m.sender?._id || m.sender) === user.id;
            return <article key={m._id} className={`message-line ${own ? "mine" : ""}`}>
              {!own && <span className="message-avatar">{m.sender?.name?.[0]?.toUpperCase() || "U"}</span>}
              <div className="message-content">{!own && <span className="message-sender">{m.sender?.name || m.sender?.username}</span>}
                <div className="message-bubble">{m.text}</div>
                <time>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{own && m.readBy?.length > 1 ? " · Seen" : ""}</time>
              </div>
            </article>;
          })}
          {typing[activeId] && <div className="typing-note">{typing[activeId]} is typing…</div>}
        </div>
      </div>
      {error && <div className="room-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
      <form className="composer" onSubmit={sendMessage}>
        <input value={text} onChange={(e) => { setText(e.target.value); const socket=getSocket(); if(socket && activeId) { socket.emit("typing:start",{conversationId:activeId}); } }} onBlur={() => { const socket=getSocket(); if(socket && activeId) socket.emit("typing:stop",{conversationId:activeId}); }} placeholder={active?.type === "global" ? "Share something with everyone…" : "Write a message…"} maxLength={4000} aria-label="Write a message"/>
        <span className="composer-hint">Enter to send</span><button disabled={!text.trim() || !online}>↑</button>
      </form>
    </section>

    {dialog && <div className="modal-backdrop" onClick={() => setDialog("")}><section className="people-modal" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setDialog("")}>×</button>
      <span className="eyebrow">{dialog === "group" ? "BUILD YOUR CIRCLE" : dialog === "members" ? "GROUP SETTINGS" : "START A CONVERSATION"}</span>
      <h2>{dialog === "group" ? "Create a group" : dialog === "members" ? "Add members" : "Find someone"}</h2>
      {dialog === "group" && <input className="modal-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name"/>}
      <input className="modal-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people by name or username…"/>
      <div className="people-results">{users.map((person) => <button key={person.id} className="person-result" onClick={() => {
        if (dialog === "direct") startDirect(person);
        else setSelectedUsers((prev) => prev.includes(person.id) ? prev.filter((id) => id !== person.id) : [...prev, person.id]);
      }}><span className="conversation-avatar">{person.name?.[0]?.toUpperCase()}</span><span><b>{person.name}</b><small>@{person.username}</small></span><span className="person-check">{selectedUsers.includes(person.id) ? "✓" : dialog === "direct" ? "→" : "+"}</span></button>)}
      {query.length >= 2 && users.length === 0 && <p className="no-results">No matching users found.</p>}</div>
      {dialog !== "direct" && <button className="modal-submit" disabled={busy || selectedUsers.length === 0 || (dialog === "group" && !groupName.trim())} onClick={dialog === "group" ? createGroup : addMembers}>{busy ? "Working…" : dialog === "group" ? `Create group · ${selectedUsers.length}` : `Add selected · ${selectedUsers.length}`}</button>}
    </section></div>}
  </main>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addGroupMembers, clearConversationHistory, createConversation, deleteMessage as deleteMessageApi,
  getAttachmentBlob, getConversationMessages, getConversations, getGlobalConversation,
  markConversationRead, searchUsers, uploadAttachment, getSettings, updateSettings, getBlockedUsers, blockUser, unblockUser,
  updateGroup, setGroupAdmin, removeGroupMember, leaveGroup, setMemberNickname,
} from "../services/api.js";
import { connectSocket, disconnectSocket, getSocket } from "../services/socket.js";

const THEMES = ["#e8f2ee", "#f1e8f6", "#f8eee2", "#e8eef8", "#f7e8eb", "#e9edf0"];
const THEME_KEY = "pulsechat_chat_themes";
const MODE_KEY = "pulsechat_mode_v2";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"];

export default function Chat({ user, token, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "dark");
  const [themes, setThemes] = useState(() => { try { return JSON.parse(localStorage.getItem(THEME_KEY) || "{}"); } catch { return {}; } });
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [dialog, setDialog] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState({});
  const [showPalette, setShowPalette] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [mediaUrls, setMediaUrls] = useState({});
  const [settings, setSettings] = useState({ readReceiptsEnabled: true });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupMediaTab, setGroupMediaTab] = useState("media");
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [memberMenuId, setMemberMenuId] = useState(null);
  const typingTimer = useRef(null);
  const typingActive = useRef(false);
  const fileInput = useRef(null);

  const activeId = active?._id || active?.id;
  const isAdmin = active?.admins?.some((a) => String(a._id || a) === user.id);
  const isOnlyAdmin = isAdmin && (active?.admins?.length || 0) === 1;
  const title = active?.type === "global" ? "Global lounge" : active?.type === "group" ? active.title : active?.participants?.find((p) => String(p._id || p.id) !== user.id)?.name || "Private chat";

  const refreshConversations = useCallback(async () => {
    const [global, rows] = await Promise.all([getGlobalConversation(), getConversations()]);
    const merged = [global, ...rows.filter((c) => c.type !== "global")];
    setConversations(merged);
    setActive((current) => current ? merged.find((c) => String(c._id || c.id) === String(current._id || current.id)) || global : global);
  }, []);

  useEffect(() => {
    getSettings().then((value) => { setSettings(value); setSettingsLoaded(true); }).catch(() => setSettingsLoaded(true));
    getBlockedUsers().then(setBlockedUsers).catch(() => {});
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
    socket.on("history:cleared", ({ conversationId } = {}) => {
      if (String(conversationId) === String(activeId)) setMessages([]);
    });
    socket.on("group:updated", (updated) => {
      setConversations((prev) => prev.map((item) => String(item._id) === String(updated._id) ? updated : item));
      setActive((current) => String(current?._id) === String(updated._id) ? updated : current);
    });
    const handleGroupExit = ({ conversationId } = {}) => {
      setConversations((prev) => prev.filter((item) => String(item._id) !== String(conversationId)));
      setActive((current) => String(current?._id) === String(conversationId) ? null : current);
      refreshConversations().catch(() => {});
    };
    socket.on("group:removed", handleGroupExit);
    socket.on("group:left", handleGroupExit);
    return () => {
      mounted = false;
      clearTimeout(typingTimer.current);
      socket.off("group:updated");
      socket.off("group:removed");
      socket.off("group:left");
      disconnectSocket();
    };
  }, [token, refreshConversations]);

  useEffect(() => {
    if (!activeId) return;
    let mounted = true;
    setMessages([]);
    setError("");
    const socket = getSocket();
    const joinRoom = () => socket?.emit("conversation:join", { conversationId: activeId }, (result) => {
      if (!result?.success && mounted) setError(result?.error || "Could not join this chat.");
    });
    if (socket?.connected) joinRoom();
    socket?.on("connect", joinRoom);
    getConversationMessages(activeId)
      .then((rows) => { if (mounted) setMessages(rows); })
      .catch((err) => mounted && setError(err.response?.data?.error || "Could not load messages."));
    // Global rooms also need read receipts; the server authorizes global membership separately.
    if (settingsLoaded && settings.readReceiptsEnabled) markConversationRead(activeId).catch(() => {});
    return () => { mounted = false; socket?.off("connect", joinRoom); };
  }, [activeId, active?.type, settingsLoaded, settings.readReceiptsEnabled]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const receive = (message) => {
      const conversationId = String(message.conversation?._id || message.conversation);
      if (conversationId === String(activeId)) {
        setMessages((prev) => prev.some((m) => String(m._id) === String(message._id)) ? prev : [...prev, message]);
        if (String(message.sender?._id || message.sender) !== user.id && settingsLoaded && settings.readReceiptsEnabled) markConversationRead(activeId).catch(() => {});
      }
      refreshConversations().catch(() => {});
    };
    const onRead = ({ conversationId, userId: readerId } = {}) => {
      if (String(conversationId) !== String(activeId)) return;
      setMessages((prev) => prev.map((message) => ({
        ...message,
        readBy: readerId && !message.readBy?.some((id) => String(id._id || id) === String(readerId))
          ? [...(message.readBy || []), readerId] : message.readBy,
        deliveredTo: readerId && !message.deliveredTo?.some((id) => String(id._id || id) === String(readerId))
          ? [...(message.deliveredTo || []), readerId] : message.deliveredTo,
      })));
    };
    const onDelivered = ({ conversationId, userId: recipientId, recipientIds = [] } = {}) => {
      if (String(conversationId) !== String(activeId)) return;
      const ids = recipientIds.length ? recipientIds : recipientId ? [recipientId] : [];
      setMessages((prev) => prev.map((message) => {
        if (String(message.sender?._id || message.sender) !== user.id) return message;
        const current = message.deliveredTo || [];
        return { ...message, deliveredTo: [...current, ...ids.filter((id) => !current.some((old) => String(old._id || old) === String(id)))] };
      }));
    };
    const onDeleted = ({ messageId, conversationId } = {}) => {
      if (String(conversationId) !== String(activeId)) return;
      setMessages((prev) => prev.map((m) => String(m._id) === String(messageId)
        ? { ...m, deletedForEveryone: true, text: "", attachment: null } : m));
    };
    const onHidden = ({ messageId, conversationId } = {}) => {
      if (String(conversationId) === String(activeId)) setMessages((prev) => prev.filter((m) => String(m._id) !== String(messageId)));
    };
    const onHistoryCleared = ({ conversationId } = {}) => {
      if (String(conversationId) === String(activeId)) setMessages([]);
    };
    socket.on("message:new", receive);
    socket.on("messages:read", onRead);
    socket.on("messages:delivered", onDelivered);
    socket.on("message:deleted", onDeleted);
    socket.on("message:hidden", onHidden);
    socket.on("history:cleared", onHistoryCleared);
    return () => {
      socket.off("message:new", receive);
      socket.off("messages:read", onRead);
      socket.off("messages:delivered", onDelivered);
      socket.off("message:deleted", onDeleted);
      socket.off("message:hidden", onHidden);
      socket.off("history:cleared", onHistoryCleared);
    };
  }, [activeId, refreshConversations, user.id, settings.readReceiptsEnabled]);

  useEffect(() => {
    if (query.trim().length < 2) { setUsers([]); return; }
    const timer = setTimeout(() => searchUsers(query).then(setUsers).catch(() => setUsers([])), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const mediaUrlCache = useRef({});
  useEffect(() => {
    let alive = true;
    const attachments = messages.filter((m) => m.attachment?.url && !m.deletedForEveryone && !mediaUrlCache.current[m._id]);
    Promise.all(attachments.map(async (message) => {
      const filename = message.attachment.url.split("/").pop();
      try {
        const blob = await getAttachmentBlob(String(message.conversation?._id || message.conversation), filename);
        if (alive) mediaUrlCache.current[message._id] = URL.createObjectURL(blob);
      } catch { /* Keep the message metadata visible if media cannot be fetched. */ }
    })).then(() => { if (alive) setMediaUrls({ ...mediaUrlCache.current }); });
    return () => { alive = false; };
  }, [messages]);
  useEffect(() => () => Object.values(mediaUrlCache.current).forEach(URL.revokeObjectURL), []);

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

  function stopTyping() {
    clearTimeout(typingTimer.current);
    if (typingActive.current && activeId) getSocket()?.emit("typing:stop", { conversationId: activeId });
    typingActive.current = false;
  }

  function handleTyping(value) {
    setText(value);
    const socket = getSocket();
    if (!socket || !activeId) return;
    if (value.trim() && !typingActive.current) {
      socket.emit("typing:start", { conversationId: activeId });
      typingActive.current = true;
    }
    clearTimeout(typingTimer.current);
    if (value.trim()) typingTimer.current = setTimeout(stopTyping, 900);
    else stopTyping();
  }

  function sendMessage(event) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !activeId) return;
    const socket = getSocket();
    if (!socket?.connected) { setError("Realtime connection is offline. Reconnect before sending."); return; }
    socket.emit("message:send", { conversationId: activeId, text: clean, replyToMessageId: replyTo?._id }, (result) => {
      if (!result?.success) setError(result?.error || "Message could not be sent.");
      else { setMessages((prev) => prev.some((m) => String(m._id) === String(result.message?._id)) ? prev : [...prev, result.message]); setReplyTo(null); }
    });
    setText("");
    stopTyping();
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeId) return;
    if (!ACCEPTED_MEDIA.includes(file.type)) { setError("Choose a supported image or video file."); return; }
    if (file.size > MAX_FILE_SIZE) { setError("File must be 25 MB or smaller."); return; }
    setUploading(true); setError("");
    try {
      await uploadAttachment(activeId, file);
    } catch (err) {
      setError(err.response?.data?.error || "Media upload failed. Please try again.");
    } finally { setUploading(false); }
  }

  async function handleDelete(message, scope) {
    const prompt = scope === "everyone" ? "Delete this message for everyone? This cannot be undone." : "Delete this message only for you?";
    if (!window.confirm(prompt)) return;
    try {
      await deleteMessageApi(message._id, scope);
      if (scope === "me") setMessages((prev) => prev.filter((m) => String(m._id) !== String(message._id)));
      else setMessages((prev) => prev.map((m) => String(m._id) === String(message._id) ? { ...m, deletedForEveryone: true, text: "", attachment: null } : m));
      setMenuMessageId(null);
      if (String(selectedMedia?._id) === String(message._id)) setSelectedMedia(null);
    } catch (err) { setError(err.response?.data?.error || "Could not delete message."); }
  }

  async function handleClearHistory() {
    if (!activeId || !window.confirm("Clear this conversation from your history? Other members will still see their messages.")) return;
    try {
      await clearConversationHistory(activeId);
      setMessages([]);
    } catch (err) { setError(err.response?.data?.error || "Could not clear chat history."); }
  }


  async function saveGroupName() {
    const nextName = window.prompt("Enter the new group name", active?.title || "");
    if (!nextName?.trim() || !activeId) return;
    try { const updated = await updateGroup(activeId, { title: nextName.trim() }); setActive(updated); await refreshConversations(); }
    catch (err) { setError(err.response?.data?.error || "Could not update group name."); }
  }

  async function changeAdmin(memberId, action) {
    try { const updated = await setGroupAdmin(activeId, memberId, action); setActive(updated); await refreshConversations(); }
    catch (err) { setError(err.response?.data?.error || "Could not update group admin."); }
  }

  async function kickMember(memberId) {
    if (!window.confirm("Remove this member from the group?")) return;
    try { const updated = await removeGroupMember(activeId, memberId); setActive(updated); await refreshConversations(); }
    catch (err) { setError(err.response?.data?.error || "Could not remove member."); }
  }

  async function exitGroup() {
    if (!window.confirm(isOnlyAdmin ? "Promote another member to admin before leaving." : "Leave this group?")) return;
    if (isOnlyAdmin) return;
    try { await leaveGroup(activeId); setDialog(""); await refreshConversations(); setActive(conversations[0]); }
    catch (err) { setError(err.response?.data?.error || "Could not leave group."); }
  }

  async function toggleReadReceipts(enabled) {
    try { const next = await updateSettings({ readReceiptsEnabled: enabled }); setSettings(next); setSettingsLoaded(true); }
    catch (err) { setError(err.response?.data?.error || "Could not save privacy settings."); }
  }

  async function handleBlock(personId) {
    if (!window.confirm("Block this user? They will not be able to start or continue private messages with you.")) return;
    try { await blockUser(personId); setBlockedUsers(await getBlockedUsers()); setDialog(""); await refreshConversations(); }
    catch (err) { setError(err.response?.data?.error || "Could not block user."); }
  }

  async function handleUnblock(personId) {
    try { await unblockUser(personId); setBlockedUsers(await getBlockedUsers()); }
    catch (err) { setError(err.response?.data?.error || "Could not unblock user."); }
  }


  function saveAttachment(message) {
    const url = mediaUrls[message?._id];
    if (!url || !message?.attachment) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = message.attachment.name || "pulsechat-media";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function openPrivateMessage(member) {
    try {
      const conversation = await createConversation({ type: "direct", participantIds: [String(member._id || member.id)] });
      await refreshConversations();
      setActive(conversation);
      setDialog("");
      setMemberMenuId(null);
    } catch (err) { setError(err.response?.data?.error || "Could not open private chat."); }
  }

  async function updateNickname(memberId) {
    const current = active?.memberNicknames?.[memberId] || "";
    const nickname = window.prompt("Set a group nickname (leave blank to clear)", current);
    if (nickname === null) return;
    try {
      const updated = await setMemberNickname(activeId, memberId, nickname);
      setActive(updated);
      await refreshConversations();
      setMemberMenuId(null);
    } catch (err) { setError(err.response?.data?.error || "Could not update nickname."); }
  }

  function startReply(message) {
    setReplyTo(message);
    setMenuMessageId(null);
    setSelectedMedia(null);
    requestAnimationFrame(() => document.querySelector(".composer input[aria-label='Write a message']")?.focus());
  }

  const groupMembers = active?.participants || [];
  const groupAdmins = active?.admins || [];
  const filteredGroupMessages = messages.filter((m) => (m.text || "").toLowerCase().includes(groupSearch.toLowerCase()));
  const groupMedia = messages.filter((m) => m.attachment && !m.deletedForEveryone);

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
      <button className="sidebar-settings" onClick={() => { setDialog("settings"); setQuery(""); }} title="Settings"><span>⚙</span><b>Settings</b></button>
    </aside>

    <section className="pulse-main">
      <header className="room-header">
        <div className="room-icon">{active?.type === "group" ? "✣" : active?.type === "global" ? "◎" : "◉"}</div>
        <div className="room-heading"><h1>{title}</h1><p>{active?.type === "global" ? "A shared room for the whole community" : active?.type === "group" ? `${active.participants?.length || 0} members · Group conversation` : "Only conversation members can access this chat"}</p></div>
        <div className="room-tools">
          <button className="icon-button" onClick={handleClearHistory} title="Clear my chat history">⌫</button>
          {active?.type === "group" && <button className="icon-button" onClick={() => { setDialog("group-settings"); setGroupSearch(""); }} title="Group settings">⚙</button>}
          <button className="icon-button" onClick={() => setShowPalette((v) => !v)} title="Customize chat background">◐</button>
          <span className={online ? "live-pill" : "offline-pill"}>{online ? "LIVE" : "OFFLINE"}</span>
        </div>
      </header>

      {showPalette && <div className="theme-popover"><b>Chat background</b><div className="theme-swatches">{THEMES.map((color) => <button key={color} aria-label={`Set chat background ${color}`} style={{ background: color }} onClick={() => setChatTheme(color)}/>)}</div><button className="reset-theme" onClick={() => { const next={...themes}; delete next[activeId]; setThemes(next); localStorage.setItem(THEME_KEY,JSON.stringify(next)); }}>Reset background</button></div>}
      <div className="message-stage" style={{ "--room-wallpaper": themes[activeId] || "var(--chat-wallpaper)" }}>
        <div className="message-feed">
          {active?.type === "group" && groupSearch && <div className="group-search-results"><b>Search results</b><input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search messages in this group…"/>{filteredGroupMessages.map((m) => <p key={m._id}>{m.sender?.name || "Member"}: {m.text}</p>)}</div>}
          {messages.length === 0 && <div className="empty-room"><div>✧</div><h2>Make the first move.</h2><p>Start the conversation. Good things begin with hello.</p></div>}
          {messages.map((m) => {
            const own = String(m.sender?._id || m.sender) === user.id;
            const delivered = (m.deliveredTo || []).length > 0;
            const seen = (m.readBy || []).some((id) => String(id._id || id) !== user.id);
            const filename = m.attachment?.name || "Attachment";
            return <article id={"message-" + m._id} key={m._id} className={`message-line ${own ? "mine" : ""}`}>
              {!own && <span className="message-avatar">{m.sender?.name?.[0]?.toUpperCase() || "U"}</span>}
              <div className="message-content">
                {!own && <span className="message-sender">{m.sender?.name || m.sender?.username}</span>}
                <div className="message-bubble">
                  {m.deletedForEveryone ? <i className="deleted-message">This message was deleted</i> : <>
                    {m.replyTo && <button className="reply-quote" onClick={() => document.getElementById("message-" + m.replyTo._id)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                      <b>{m.replyTo.sender?.name || "Reply"}</b><span>{m.replyTo.deletedForEveryone ? "This message was deleted" : m.replyTo.text || m.replyTo.attachment?.name || "Media"}</span>
                    </button>}
                    {m.text && <p>{m.text}</p>}
                    {m.attachment && mediaUrls[m._id] && <div className="message-media-wrap">
                      {m.attachment.mimeType.startsWith("image/")
                        ? <img className="chat-image" src={mediaUrls[m._id]} alt={filename} onClick={() => setSelectedMedia(m)} />
                        : <video className="chat-video" src={mediaUrls[m._id]} controls preload="metadata" />}
                      <button className="media-save-button" onClick={() => saveAttachment(m)} title="Save media" aria-label="Save media">↓</button>
                      <button className="media-expand-button" onClick={() => setSelectedMedia(m)} title="View media" aria-label="View media">⛶</button>
                    </div>}
                    {m.attachment && <small className="attachment-name">{filename}</small>}
                  </>}
                </div>
                <div className="message-meta-row">
                  <time>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  {own && !m.deletedForEveryone && <span className={`receipt ${seen ? "receipt-seen" : delivered ? "receipt-delivered" : ""}`} title={seen ? "Seen" : delivered ? "Delivered" : "Sent"}>{delivered || seen ? "✓✓" : "✓"}</span>}
                  {!m.deletedForEveryone && <div className="message-actions">
                    <button className="message-menu-trigger" onClick={() => setMenuMessageId(menuMessageId === m._id ? null : m._id)} aria-label="Message options">⋯</button>
                    {menuMessageId === m._id && <div className="message-menu">
                      <button onClick={() => startReply(m)}>↩ Reply</button>
                      {m.attachment && <button onClick={() => saveAttachment(m)}>↓ Save media</button>}
                      <button onClick={() => handleDelete(m, "me")}>Delete for me</button>
                      {own && <button className="danger-action" onClick={() => handleDelete(m, "everyone")}>Delete for everyone</button>}
                    </div>}
                  </div>}
                </div>
              </div>
            </article>;
          })}
          {typing[activeId] && <div className="typing-note"><span>{typing[activeId]} is typing</span><span className="typing-dots"><i/><i/><i/></span></div>}
        </div>
      </div>
      {error && <div className="room-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
      <form className="composer" onSubmit={sendMessage}>
        {replyTo && <div className="reply-composer-preview"><span><b>Replying to {replyTo.sender?.name || "message"}</b><small>{replyTo.text || replyTo.attachment?.name || "Media attachment"}</small></span><button type="button" onClick={() => setReplyTo(null)}>×</button></div>}
        <input ref={fileInput} className="media-file-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" onChange={handleFile}/>
        <button type="button" className="attach-button" onClick={() => fileInput.current?.click()} disabled={uploading || !online} title="Attach photo or video">{uploading ? "…" : "＋"}</button>
        <input value={text} onChange={(e) => handleTyping(e.target.value)} onBlur={stopTyping} placeholder={active?.type === "global" ? "Share something with everyone…" : "Write a message…"} maxLength={4000} aria-label="Write a message"/>
        <span className="composer-hint">Enter to send</span><button type="submit" disabled={!text.trim() || !online}>↑</button>
      </form>
    </section>

    {dialog && dialog !== "settings" && dialog !== "group-settings" && <div className="modal-backdrop" onClick={() => setDialog("")}><section className="people-modal" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setDialog("")}>×</button>
      <span className="eyebrow">{dialog === "group" ? "BUILD YOUR CIRCLE" : "START A CONVERSATION"}</span>
      <h2>{dialog === "group" ? "Create a group" : "Find someone"}</h2>
      {dialog === "group" && <input className="modal-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name"/>}
      <input className="modal-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people by name or username…"/>
      <div className="people-results">{users.map((person) => <button key={person.id} className="person-result" onClick={() => {
        if (dialog === "direct") startDirect(person);
        else setSelectedUsers((prev) => prev.includes(person.id) ? prev.filter((id) => id !== person.id) : [...prev, person.id]);
      }}><span className="conversation-avatar">{person.name?.[0]?.toUpperCase()}</span><span><b>{person.name}</b><small>@{person.username}</small></span><span className="person-check">{selectedUsers.includes(person.id) ? "✓" : dialog === "direct" ? "→" : "+"}</span></button>)}
      {query.length >= 2 && users.length === 0 && <p className="no-results">No matching users found.</p>}</div>
      {dialog === "group" && <button className="modal-submit" disabled={busy || selectedUsers.length === 0 || !groupName.trim()} onClick={createGroup}>{busy ? "Working…" : `Create group · ${selectedUsers.length}`}</button>}
      {dialog === "members" && <button className="modal-submit" disabled={busy || selectedUsers.length === 0} onClick={addMembers}>{busy ? "Adding…" : `Add selected · ${selectedUsers.length}`}</button>}
    </section></div>}

    {dialog === "group-settings" && active?.type === "group" && <div className="modal-backdrop" onClick={() => setDialog("")}><section className="people-modal group-settings-modal" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setDialog("")}>×</button>
      <span className="eyebrow">GROUP MANAGEMENT</span><h2>{active.title}</h2>
      <div className="group-settings-actions">
        {isAdmin && <button onClick={saveGroupName}>✎ Rename group</button>}
        {isAdmin && <button onClick={() => { setDialog("members"); setQuery(""); setSelectedUsers([]); }}>＋ Add member</button>}
        <button onClick={() => setGroupMediaTab("media")}>▧ Group media ({groupMedia.length})</button>
        <button onClick={() => setGroupMediaTab("search")}>⌕ Search messages</button>
      </div>
      {groupMediaTab === "search" && <input className="modal-input" value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search messages in this group…"/>}
      {groupMediaTab === "search" && <div className="group-media-grid">{filteredGroupMessages.map((m) => <p key={m._id}>{m.sender?.name || "Member"}: {m.text}</p>)}</div>}
      {groupMediaTab === "media" && <div className="group-media-grid">{groupMedia.map((m) => <button className="group-media-item" key={m._id} onClick={() => setSelectedMedia(m)}>{mediaUrls[m._id] ? (m.attachment.mimeType.startsWith("image/") ? <img src={mediaUrls[m._id]} alt={m.attachment.name}/> : <video src={mediaUrls[m._id]} muted preload="metadata"/>) : <span>{m.attachment.name}</span>}<small>{m.attachment.name}</small></button>)}{groupMedia.length === 0 && <p className="no-results">No shared media yet.</p>}</div>}
      <div className="group-member-heading">Members · {groupMembers.length}</div>
      <div className="group-member-list">{groupMembers.map((member) => {
        const memberId = String(member._id || member.id);
        const admin = groupAdmins.some((a) => String(a._id || a) === memberId);
        const self = memberId === user.id;
        return <div className="group-member-row" key={memberId}><span className="conversation-avatar">{member.name?.[0]?.toUpperCase() || "?"}</span><span><b>{active?.memberNicknames?.[memberId] || member.name}</b><small>@{member.username} {admin ? " · Admin" : ""}</small></span>
          <div className="member-controls"><button className="member-more-button" onClick={() => setMemberMenuId(memberMenuId === memberId ? null : memberId)} aria-label={"Actions for " + member.name}>⋯</button>
            {memberMenuId === memberId && <div className="member-action-menu">
              <button onClick={() => openPrivateMessage(member)}>✉ Send message privately</button>
              {isAdmin && !self && <button onClick={() => changeAdmin(memberId, admin ? "demote" : "promote")}>{admin ? "♙ Remove admin" : "♟ Make admin"}</button>}
              {isAdmin && !self && <button onClick={() => updateNickname(memberId)}>✎ Add nickname</button>}
              {isAdmin && !self && <button className="danger-action" onClick={() => kickMember(memberId)}>✕ Remove member</button>}
            </div>}
          </div>
        </div>;
      })}</div>
      <button className="leave-group-button" disabled={isOnlyAdmin} onClick={exitGroup}>{isOnlyAdmin ? "Promote another admin before leaving" : "Exit group"}</button>
    </section></div>}

    {selectedMedia && mediaUrls[selectedMedia._id] && <div className="media-viewer-backdrop" onClick={() => setSelectedMedia(null)}>
      <section className="media-viewer" onClick={(e) => e.stopPropagation()}>
        <header><span>{selectedMedia.attachment?.name || "Media"}</span><button onClick={() => setSelectedMedia(null)}>×</button></header>
        {selectedMedia.attachment?.mimeType.startsWith("image/") ? <img src={mediaUrls[selectedMedia._id]} alt={selectedMedia.attachment.name}/> : <video src={mediaUrls[selectedMedia._id]} controls autoPlay/>}
        <footer><button onClick={() => saveAttachment(selectedMedia)}>↓ Save media</button><button onClick={() => startReply(selectedMedia)}>↩ Reply</button><button className="danger-action" onClick={() => handleDelete(selectedMedia, "me")}>Delete for me</button>{(String(selectedMedia.sender?._id || selectedMedia.sender) === user.id || (active?.type === "group" && isAdmin)) && <button className="danger-action" onClick={() => handleDelete(selectedMedia, "everyone")}>Delete for everyone</button>}</footer>
      </section>
    </div>}
    {dialog === "settings" && <div className="modal-backdrop" onClick={() => setDialog("")}><section className="people-modal settings-modal" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setDialog("")}>×</button><span className="eyebrow">PULSECHAT PREFERENCES</span><h2>Settings & privacy</h2>
      <div className="setting-row"><span><b>Read receipts</b><small>Allow others to know when you have read their messages.</small></span><input type="checkbox" checked={settings.readReceiptsEnabled} onChange={(e) => toggleReadReceipts(e.target.checked)}/></div>
      <h3>Blocked accounts</h3><input className="modal-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search someone to block…"/>
      <div className="people-results">{users.map((person) => <div className="person-result" key={person.id}><span className="conversation-avatar">{person.name?.[0]?.toUpperCase()}</span><span><b>{person.name}</b><small>@{person.username}</small></span><button className="person-check" onClick={() => handleBlock(person.id)}>Block</button></div>)}</div>
      <div className="group-member-heading">Blocked users · {blockedUsers.length}</div>
      <div className="people-results">{blockedUsers.map((person) => <div className="person-result" key={person.id}><span className="conversation-avatar">{person.name?.[0]?.toUpperCase()}</span><span><b>{person.name}</b><small>@{person.username}</small></span><button className="person-check" onClick={() => handleUnblock(person.id)}>Unblock</button></div>)}{blockedUsers.length === 0 && <p className="no-results">No blocked users.</p>}</div>
    </section></div>}

  </main>;
}

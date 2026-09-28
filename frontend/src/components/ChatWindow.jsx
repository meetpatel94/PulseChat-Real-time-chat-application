import Header from "./Header.jsx";
import MessageList from "./MessageList.jsx";
import TypingIndicator from "./TypingIndicator.jsx";
import MessageInput from "./MessageInput.jsx";

export default function ChatWindow({
  username,
  messages,
  onlineUsers,
  typingNames,
  connectionStatus,
  historyState,
  historyError,
  notice,
  onRetryHistory,
  onSend,
  onTyping,
  onTypingStop,
  onLogout,
}) {
  return (
    <div className="chat-shell">
      <div className="chat-card">
        <Header
          username={username}
          onlineUsers={onlineUsers}
          connectionStatus={connectionStatus}
          onLogout={onLogout}
        />

        {connectionStatus !== "connected" && (
          <div className="conn-banner" role="status">
            {connectionStatus === "connecting"
              ? "Connecting to the chat server…"
              : "Connection lost — reconnecting automatically…"}
          </div>
        )}

        {notice && (
          <div className="notice-banner" role="alert">
            {notice}
          </div>
        )}

        <MessageList
          messages={messages}
          currentUsername={username}
          state={historyState}
          error={historyError}
          onRetry={onRetryHistory}
        />

        <TypingIndicator names={typingNames} />

        <MessageInput
          onSend={onSend}
          onTyping={onTyping}
          onTypingStop={onTypingStop}
        />
      </div>
    </div>
  );
}

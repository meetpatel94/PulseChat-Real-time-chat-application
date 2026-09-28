const Message = require("../models/Message");

const MAX_MESSAGE_LENGTH = 1000;
const MAX_USERNAME_LENGTH = 30;

/**
 * Online users map: username -> Set of socket ids.
 * A user with several tabs/browsers stays "online" while at least
 * one of their sockets is connected.
 */
const onlineUsers = new Map();

function getOnlineList() {
  return Array.from(onlineUsers.keys()).sort((a, b) => a.localeCompare(b));
}

function normalizeUsername(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (!name || name.length > MAX_USERNAME_LENGTH) return null;
  return name;
}

/**
 * Wires all Socket.io event handling onto the given `io` instance.
 *
 * Client -> server events: send_message, typing, stop_typing
 * Server -> client events: receive_message, online_users, typing,
 *                          stop_typing, message_error
 */
function initializeSocket(io) {
  io.on("connection", (socket) => {
    const username = normalizeUsername(
      socket.handshake.auth && socket.handshake.auth.username
    );

    if (username) {
      let sockets = onlineUsers.get(username);
      if (!sockets) {
        sockets = new Set();
        onlineUsers.set(username, sockets);
      }
      sockets.add(socket.id);
      console.log(`🟢 ${username} connected (${socket.id}). Online: ${onlineUsers.size}`);
      io.emit("online_users", getOnlineList());
    } else {
      // No valid username in the handshake — allow the socket (health
      // checks, probes) but do not track or broadcast for it.
      console.warn(`⚠️ Socket ${socket.id} connected without a valid username`);
    }

    /**
     * send_message — validate, persist to MongoDB, then broadcast the
     * saved document to every connected client (including the sender).
     */
    socket.on("send_message", async (payload) => {
      if (!username) return;

      const text =
        payload && typeof payload.text === "string" ? payload.text.trim() : "";

      if (!text) {
        socket.emit("message_error", { message: "Message cannot be empty" });
        return;
      }
      if (text.length > MAX_MESSAGE_LENGTH) {
        socket.emit("message_error", {
          message: `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
        });
        return;
      }

      try {
        const created = await Message.create({
          username,
          text,
          status: "sent",
        });

        // Mark "delivered" when at least one other user is online.
        const otherUserIds = new Set();
        onlineUsers.forEach((ids, name) => {
          if (name !== username) ids.forEach((id) => otherUserIds.add(id));
        });

        let outgoing = created;
        if (otherUserIds.size > 0) {
          outgoing = await Message.findByIdAndUpdate(
            created._id,
            { status: "delivered" },
            { new: true }
          ).lean();
        }

        io.emit("receive_message", outgoing);
      } catch (err) {
        console.error("Failed to save message:", err.message);
        socket.emit("message_error", {
          message: "Failed to save message. Please try again.",
        });
      }
    });

    /** Relay typing state to everyone except the typer. */
    socket.on("typing", () => {
      if (username) socket.broadcast.emit("typing", { username });
    });

    socket.on("stop_typing", () => {
      if (username) socket.broadcast.emit("stop_typing", { username });
    });

    socket.on("disconnect", () => {
      if (!username) return;
      const sockets = onlineUsers.get(username);
      if (!sockets) return;
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(username);
        console.log(`🔴 ${username} disconnected (${socket.id}). Online: ${onlineUsers.size}`);
        io.emit("online_users", getOnlineList());
      }
    });
  });
}

module.exports = { initializeSocket };

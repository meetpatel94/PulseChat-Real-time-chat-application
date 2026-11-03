const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const MAX_MESSAGE_LENGTH = 4000;

function isParticipant(conversation, userId) {
  return conversation.type === "global" ||
    conversation.participants.some((id) => String(id) === String(userId));
}

function initializeSocket(io) {
  io.on("connection", (socket) => {
    const { id: userId, username } = socket.user;
    socket.join(`user:${userId}`);
    socket.emit("session:ready", { userId, username });

    socket.on("conversation:join", async ({ conversationId } = {}, ack = () => {}) => {
      try {
        const conversation = await Conversation.findById(conversationId).select("type participants");
        if (!conversation || !isParticipant(conversation, userId))
          return ack({ success: false, error: "Conversation not found" });
        socket.join(`conversation:${conversationId}`);
        return ack({ success: true });
      } catch {
        return ack({ success: false, error: "Could not join conversation" });
      }
    });

    socket.on("message:send", async (payload = {}, ack = () => {}) => {
      try {
        const { conversationId } = payload;
        const text = typeof payload.text === "string" ? payload.text.trim() : "";
        if (!text || text.length > MAX_MESSAGE_LENGTH)
          return ack({ success: false, error: "Message must contain 1–4000 characters" });
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !isParticipant(conversation, userId))
          return ack({ success: false, error: "Conversation not found" });
        const message = await Message.create({
          conversation: conversation._id, sender: userId, text, readBy: [userId],
        });
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();
        const populated = await Message.findById(message._id)
          .populate("sender", "name username avatarUrl").lean();
        io.to(`conversation:${conversationId}`).emit("message:new", populated);
        return ack({ success: true, message: populated });
      } catch (error) {
        return ack({ success: false, error: "Message could not be saved" });
      }
    });

    socket.on("typing:start", async ({ conversationId } = {}) => {
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId, userId, username, typing: true,
      });
    });

    socket.on("typing:stop", ({ conversationId } = {}) => {
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId, userId, username, typing: false,
      });
    });

    socket.on("disconnect", () => {
      socket.broadcast.emit("presence:update", { userId, username, online: false });
    });
    socket.broadcast.emit("presence:update", { userId, username, online: true });
  });
}

module.exports = { initializeSocket };

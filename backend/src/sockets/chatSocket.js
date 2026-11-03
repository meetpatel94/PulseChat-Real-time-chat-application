const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

async function isDirectBlocked(conversation) {
  if (conversation.type !== "direct") return false;
  const users = await User.find({ _id: { $in: conversation.participants } }).select("_id blockedUsers").lean();
  return users.some((u) => (u.blockedUsers || []).some((id) => conversation.participants.some((p) => String(p) === String(id) && String(p) !== String(u._id))));
}

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
        if (!conversationId) return ack({ success: false, error: "Conversation id is required" });
        const conversation = await Conversation.findById(conversationId).select("type participants");
        // Membership is checked against MongoDB; do not require the socket to be in the room before joining it.
        if (!conversation || !isParticipant(conversation, userId))
          return ack({ success: false, error: "Conversation not found" });
        if (await isDirectBlocked(conversation))
          return ack({ success: false, error: "Private messaging is blocked between these accounts" });
        const room = `conversation:${conversationId}`;
        await socket.join(room);
        const result = await Message.updateMany(
          { conversation: conversationId, sender: { $ne: userId }, deletedAt: null, deliveredTo: { $ne: userId } },
          { $addToSet: { deliveredTo: userId } }
        );
        if (result.modifiedCount) io.to(room).emit("messages:delivered", { conversationId, userId });
        return ack({ success: true });
      } catch {
        return ack({ success: false, error: "Could not join conversation" });
      }
    });

    socket.on("message:send", async (payload = {}, ack = () => {}) => {
      try {
        const { conversationId, replyToMessageId } = payload;
        const text = typeof payload.text === "string" ? payload.text.trim() : "";
        if (!text || text.length > MAX_MESSAGE_LENGTH)
          return ack({ success: false, error: "Message must contain 1–4000 characters" });
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !isParticipant(conversation, userId))
          return ack({ success: false, error: "Conversation not found" });
        if (await isDirectBlocked(conversation))
          return ack({ success: false, error: "Private messaging is blocked between these accounts" });
        const room = `conversation:${conversationId}`;
        const roomSockets = io.sockets.adapter.rooms.get(room) || new Set();
        const deliveredTo = new Set();
        for (const socketId of roomSockets) {
          const recipient = io.sockets.sockets.get(socketId);
          if (recipient?.user?.id && recipient.user.id !== userId) deliveredTo.add(recipient.user.id);
        }
        let replyTo = null;
        if (replyToMessageId) {
          if (!require("mongoose").isValidObjectId(replyToMessageId)) return ack({ success: false, error: "Invalid reply target" });
          replyTo = await Message.findOne({ _id: replyToMessageId, conversation: conversation._id, deletedForEveryone: false });
          if (!replyTo) return ack({ success: false, error: "The message being replied to is no longer available" });
        }
        const message = await Message.create({
          conversation: conversation._id, sender: userId, text, readBy: [userId], deliveredTo: [...deliveredTo],
          replyTo: replyTo?._id || null,
        });
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();
        const populated = await Message.findById(message._id)
          .populate("sender", "name username avatarUrl")
          .populate({ path: "replyTo", select: "text attachment sender deletedForEveryone createdAt", populate: { path: "sender", select: "name username" } }).lean();
        io.to(room).emit("message:new", populated);
        if (deliveredTo.size) io.to(room).emit("messages:delivered", { conversationId, userId: null, recipientIds: [...deliveredTo] });
        return ack({ success: true, message: populated });
      } catch {
        return ack({ success: false, error: "Message could not be saved" });
      }
    });

    socket.on("typing:start", async ({ conversationId } = {}) => {
      if (!conversationId || !socket.rooms.has(`conversation:${conversationId}`)) return;
      const conversation = await Conversation.findById(conversationId).select("type participants");
      if (!conversation || !isParticipant(conversation, userId) || await isDirectBlocked(conversation)) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", { conversationId, userId, username, typing: true });
    });

    socket.on("typing:stop", ({ conversationId } = {}) => {
      if (!conversationId || !socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit("typing:update", { conversationId, userId, username, typing: false });
    });

    socket.on("disconnect", () => {
      socket.broadcast.emit("presence:update", { userId, username, online: false });
    });
    socket.broadcast.emit("presence:update", { userId, username, online: true });
  });
}

module.exports = { initializeSocket };

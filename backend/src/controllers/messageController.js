const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

async function createMessage(req, res, next) {
  try {
    const { text } = req.body || {};
    if (typeof text !== "string" || !text.trim() || text.trim().length > 4000)
      return res.status(400).json({ success: false, error: "Message must contain 1–4000 characters" });
    if (!mongoose.isValidObjectId(req.params.conversationId))
      return res.status(400).json({ success: false, error: "Invalid conversation id" });
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.some((id) => String(id) === req.auth.userId))
      return res.status(404).json({ success: false, error: "Conversation not found" });
    const message = await Message.create({
      conversation: conversation._id, sender: req.auth.userId,
      text: text.trim(), readBy: [req.auth.userId],
    });
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();
    const populated = await Message.findById(message._id).populate("sender", "name username avatarUrl");
    req.app.get("io")?.to(String(conversation._id)).emit("message:new", populated);
    res.status(201).json({ success: true, message: populated });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    const conversation = await Conversation.findById(req.params.conversationId).select("participants");
    if (!conversation || !conversation.participants.some((id) => String(id) === req.auth.userId))
      return res.status(404).json({ success: false, error: "Conversation not found" });
    await Message.updateMany(
      { conversation: conversation._id, sender: { $ne: req.auth.userId }, readBy: { $ne: req.auth.userId } },
      { $addToSet: { readBy: req.auth.userId } }
    );
    req.app.get("io")?.to(String(conversation._id)).emit("messages:read", {
      conversationId: String(conversation._id), userId: req.auth.userId,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { createMessage, markRead };

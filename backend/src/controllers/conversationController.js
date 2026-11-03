const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const isMember = (conversation, userId) =>
  conversation.participants.some((id) => String(id) === String(userId));

async function listConversations(req, res, next) {
  try {
    const rows = await Conversation.find({ participants: req.auth.userId })
      .sort({ lastMessageAt: -1 })
      .populate("participants", "name username avatarUrl")
      .populate("admins", "name username")
      .lean();
    const conversations = await Promise.all(rows.map(async (row) => {
      const lastMessage = await Message.findOne({ conversation: row._id, deletedAt: null })
        .sort({ createdAt: -1 }).populate("sender", "name username").lean();
      return { ...row, lastMessage };
    }));
    res.json({ success: true, conversations });
  } catch (err) { next(err); }
}

async function createConversation(req, res, next) {
  try {
    const { type, title, participantIds = [] } = req.body || {};
    if (!["direct", "group"].includes(type))
      return res.status(400).json({ success: false, error: "Conversation type must be direct or group" });
    if (!Array.isArray(participantIds) || participantIds.length > 49 ||
        participantIds.some((id) => !mongoose.isValidObjectId(id)))
      return res.status(400).json({ success: false, error: "Invalid participants" });
    const ids = [...new Set([String(req.auth.userId), ...participantIds.map(String)])];
    if (type === "direct" && ids.length !== 2)
      return res.status(400).json({ success: false, error: "A private chat requires exactly one other user" });
    if (type === "group" && (ids.length < 2 || typeof title !== "string" || !title.trim() || title.trim().length > 80))
      return res.status(400).json({ success: false, error: "Groups need a name and at least one other member" });

    if (type === "direct") {
      const existing = await Conversation.findOne({ type: "direct", participants: { $all: ids, $size: 2 } })
        .populate("participants", "name username avatarUrl");
      if (existing) return res.json({ success: true, conversation: existing });
    }

    const conversation = await Conversation.create({
      type, title: type === "group" ? title.trim() : "",
      participants: ids, admins: type === "group" ? [req.auth.userId] : [],
      createdBy: req.auth.userId,
    });
    const populated = await Conversation.findById(conversation._id)
      .populate("participants", "name username avatarUrl")
      .populate("admins", "name username");
    res.status(201).json({ success: true, conversation: populated });
  } catch (err) { next(err); }
}

async function getMessages(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ success: false, error: "Invalid conversation id" });
    const conversation = await Conversation.findById(req.params.id).select("participants");
    if (!conversation || !isMember(conversation, req.auth.userId))
      return res.status(404).json({ success: false, error: "Conversation not found" });
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const messages = await Message.find({ conversation: conversation._id, deletedAt: null })
      .sort({ createdAt: -1 }).limit(limit)
      .populate("sender", "name username avatarUrl").lean();
    res.json({ success: true, messages: messages.reverse() });
  } catch (err) { next(err); }
}

async function addMembers(req, res, next) {
  try {
    const { userIds } = req.body || {};
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || conversation.type !== "group")
      return res.status(404).json({ success: false, error: "Group not found" });
    if (!isMember(conversation, req.auth.userId) ||
        !conversation.admins.some((id) => String(id) === String(req.auth.userId)))
      return res.status(403).json({ success: false, error: "Group admin permission required" });
    if (!Array.isArray(userIds) || userIds.length < 1 || userIds.length > 20 ||
        userIds.some((id) => !mongoose.isValidObjectId(id)))
      return res.status(400).json({ success: false, error: "Invalid member list" });
    const unique = [...new Set(userIds.map(String))];
    conversation.participants.addToSet(...unique);
    await conversation.save();
    const populated = await Conversation.findById(conversation._id).populate("participants", "name username avatarUrl");
    res.json({ success: true, conversation: populated });
  } catch (err) { next(err); }
}


async function getGlobalConversation(req, res, next) {
  try {
    let conversation = await Conversation.findOne({ type: "global" });
    if (!conversation) {
      try {
        conversation = await Conversation.create({
          type: "global", title: "Global Chat", participants: [req.auth.userId], createdBy: req.auth.userId,
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        conversation = await Conversation.findOne({ type: "global" });
      }
    }
    res.json({ success: true, conversation });
  } catch (err) { next(err); }
}

module.exports = { listConversations, createConversation, getMessages, addMembers, getGlobalConversation };

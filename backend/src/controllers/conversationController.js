const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Message = require("../models/Message");

async function usersHaveBlockedEachOther(a, b) {
  const blocked = await User.find({ _id: { $in: [a, b] } }).select("_id blockedUsers").lean();
  return blocked.some((u) => (u.blockedUsers || []).some((id) => String(id) === String(u._id) ? false : [String(a), String(b)].includes(String(id))));
}

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
      const lastMessage = await Message.findOne({ conversation: row._id, deletedAt: null, hiddenFor: { $ne: req.auth.userId } })
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
    const validUsers = await User.countDocuments({ _id: { $in: ids }, isActive: true });
    if (validUsers !== ids.length) return res.status(400).json({ success: false, error: "One or more users do not exist" });
    if (type === "direct" && ids.length !== 2)
      return res.status(400).json({ success: false, error: "A private chat requires exactly one other user" });
    if (type === "direct" && await usersHaveBlockedEachOther(ids[0], ids[1]))
      return res.status(403).json({ success: false, error: "This private chat is unavailable because one account has blocked the other" });
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
    const conversation = await Conversation.findById(req.params.id).select("type participants");
    if (!conversation || (conversation.type !== "global" && !isMember(conversation, req.auth.userId)))
      return res.status(404).json({ success: false, error: "Conversation not found" });
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const messages = await Message.find({ conversation: conversation._id, hiddenFor: { $ne: req.auth.userId } })
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
    const validUsers = await User.countDocuments({ _id: { $in: unique }, isActive: true });
    if (validUsers !== unique.length) return res.status(400).json({ success: false, error: "One or more users do not exist" });
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


async function updateGroup(req, res, next) {
  try {
    const { title } = req.body || {};
    const group = await Conversation.findById(req.params.id);
    if (!group || group.type !== "group") return res.status(404).json({ success: false, error: "Group not found" });
    if (!isMember(group, req.auth.userId) || !group.admins.some((id) => String(id) === req.auth.userId))
      return res.status(403).json({ success: false, error: "Group admin permission required" });
    if (typeof title !== "string" || !title.trim() || title.trim().length > 80)
      return res.status(400).json({ success: false, error: "Group name must be 1–80 characters" });
    group.title = title.trim();
    await group.save();
    const populated = await Conversation.findById(group._id).populate("participants", "name username avatarUrl").populate("admins", "name username");
    req.app.get("io")?.to(`conversation:${group._id}`).emit("group:updated", populated);
    res.json({ success: true, conversation: populated });
  } catch (err) { next(err); }
}

async function setGroupAdmin(req, res, next) {
  try {
    const { userId, action = "promote" } = req.body || {};
    const group = await Conversation.findById(req.params.id);
    if (!group || group.type !== "group") return res.status(404).json({ success: false, error: "Group not found" });
    if (!isMember(group, req.auth.userId) || !group.admins.some((id) => String(id) === req.auth.userId))
      return res.status(403).json({ success: false, error: "Group admin permission required" });
    if (!mongoose.isValidObjectId(userId) || !isMember(group, userId) || !["promote", "demote"].includes(action))
      return res.status(400).json({ success: false, error: "Select a valid group member and action" });
    if (action === "promote") group.admins.addToSet(userId);
    else {
      if (group.admins.length <= 1 && group.admins.some((id) => String(id) === String(userId)))
        return res.status(400).json({ success: false, error: "A group must always have at least one admin" });
      group.admins.pull(userId);
    }
    await group.save();
    const populated = await Conversation.findById(group._id).populate("participants", "name username avatarUrl").populate("admins", "name username");
    req.app.get("io")?.to(`conversation:${group._id}`).emit("group:updated", populated);
    res.json({ success: true, conversation: populated });
  } catch (err) { next(err); }
}

async function removeGroupMember(req, res, next) {
  try {
    const group = await Conversation.findById(req.params.id);
    const { userId } = req.params;
    if (!group || group.type !== "group") return res.status(404).json({ success: false, error: "Group not found" });
    if (!isMember(group, req.auth.userId) || !group.admins.some((id) => String(id) === req.auth.userId))
      return res.status(403).json({ success: false, error: "Group admin permission required" });
    if (!mongoose.isValidObjectId(userId) || !isMember(group, userId))
      return res.status(404).json({ success: false, error: "Member not found" });
    if (String(userId) === req.auth.userId)
      return res.status(400).json({ success: false, error: "Use Leave group to exit" });
    if (group.admins.some((id) => String(id) === String(userId)) && group.admins.length === 1)
      return res.status(400).json({ success: false, error: "Promote another admin before removing the only admin" });
    group.participants.pull(userId);
    group.admins.pull(userId);
    await group.save();
    const io = req.app.get("io");
    io?.in(`user:${userId}`).socketsLeave(`conversation:${group._id}`);
    io?.to(`user:${userId}`).emit("group:removed", { conversationId: String(group._id) });
    const populated = await Conversation.findById(group._id).populate("participants", "name username avatarUrl").populate("admins", "name username");
    req.app.get("io")?.to(`conversation:${group._id}`).emit("group:updated", populated);
    res.json({ success: true, conversation: populated });
  } catch (err) { next(err); }
}

async function leaveGroup(req, res, next) {
  try {
    const group = await Conversation.findById(req.params.id);
    if (!group || group.type !== "group" || !isMember(group, req.auth.userId))
      return res.status(404).json({ success: false, error: "Group not found" });
    const isAdmin = group.admins.some((id) => String(id) === req.auth.userId);
    if (isAdmin && group.admins.length === 1)
      return res.status(400).json({ success: false, error: "Promote another admin before leaving the group" });
    group.participants.pull(req.auth.userId);
    group.admins.pull(req.auth.userId);
    await group.save();
    const io = req.app.get("io");
    io?.in(`user:${req.auth.userId}`).socketsLeave(`conversation:${group._id}`);
    io?.to(`user:${req.auth.userId}`).emit("group:left", { conversationId: String(group._id) });
    req.app.get("io")?.to(`conversation:${group._id}`).emit("group:updated", { _id: String(group._id), participants: group.participants, admins: group.admins });
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { listConversations, createConversation, getMessages, addMembers, getGlobalConversation, updateGroup, setGroupAdmin, removeGroupMember, leaveGroup };

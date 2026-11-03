const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

async function isDirectBlocked(conversation, userId) {
  if (conversation.type !== "direct") return false;
  const users = await User.find({ _id: { $in: conversation.participants } }).select("_id blockedUsers").lean();
  return users.some((u) => (u.blockedUsers || []).some((id) => String(id) !== String(u._id) && conversation.participants.some((p) => String(p) === String(id))));
}

const MAX_UPLOAD = 25 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime", "application/pdf", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"]);
const isMember = (conversation, userId) => conversation.type === "global" ||
  conversation.participants.some((id) => String(id) === String(userId));

async function createMessage(req, res, next) {
  try {
    const { text } = req.body || {};
    if (typeof text !== "string" || !text.trim() || text.trim().length > 4000)
      return res.status(400).json({ success: false, error: "Message must contain 1–4000 characters" });
    if (!mongoose.isValidObjectId(req.params.conversationId))
      return res.status(400).json({ success: false, error: "Invalid conversation id" });
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !isMember(conversation, req.auth.userId))
      return res.status(404).json({ success: false, error: "Conversation not found" });
    if (conversation.type === "group" && conversation.onlyAdminsCanMessage && !conversation.admins.some((id) => String(id) === req.auth.userId))
      return res.status(403).json({ success: false, error: "Only group admins can send messages right now" });
    const message = await Message.create({
      conversation: conversation._id, sender: req.auth.userId,
      text: text.trim(), readBy: [req.auth.userId],
    });
    conversation.lastMessageAt = message.createdAt;
    conversation.hiddenFor = [];
    await conversation.save();
    const populated = await Message.findById(message._id).populate("sender", "name username avatarUrl").lean();
    req.app.get("io")?.to(`conversation:${String(conversation._id)}`).emit("message:new", populated);
    res.status(201).json({ success: true, message: populated });
  } catch (err) { next(err); }
}

async function uploadAttachment(req, res, next) {
  let storedPath;
  try {
    const conversationId = req.params.conversationId;
    if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ success: false, error: "Invalid conversation id" });
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isMember(conversation, req.auth.userId)) return res.status(404).json({ success: false, error: "Conversation not found" });
    if (await isDirectBlocked(conversation, req.auth.userId)) return res.status(403).json({ success: false, error: "Messaging is unavailable because one account has blocked the other" });
    if (conversation.type === "group" && conversation.onlyAdminsCanMessage && !conversation.admins.some((id) => String(id) === req.auth.userId)) return res.status(403).json({ success: false, error: "Only group admins can send messages right now" });
    const buffer = req.body;
    const mimeType = req.headers["x-file-mime"];
    const originalName = decodeURIComponent(req.headers["x-file-name"] || "attachment").slice(0, 180);
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_UPLOAD)
      return res.status(400).json({ success: false, error: "Choose a file smaller than 25 MB" });
    if (!ALLOWED.has(mimeType)) return res.status(415).json({ success: false, error: "Supported images, videos, PDF and common audio files only" });
    const isImage = mimeType.startsWith("image/");
    const validSignature = (mimeType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8) ||
      (mimeType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
      (mimeType === "image/gif" && ["GIF87a","GIF89a"].includes(buffer.subarray(0,6).toString())) ||
      (mimeType === "image/webp" && buffer.subarray(0,4).toString() === "RIFF" && buffer.subarray(8,12).toString() === "WEBP") ||
      (mimeType.startsWith("video/") && (buffer.subarray(4,8).toString() === "ftyp" || buffer.subarray(0,4).toString() === "RIFF" || buffer.subarray(0,4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))) ||
      (mimeType === "application/pdf" && buffer.subarray(0,5).toString() === "%PDF-") ||
      (mimeType === "audio/mpeg" && (buffer.subarray(0,3).toString() === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))) ||
      (mimeType === "audio/mp4" && buffer.subarray(4,8).toString() === "ftyp") ||
      (mimeType === "audio/ogg" && buffer.subarray(0,4).toString() === "OggS") ||
      (mimeType === "audio/wav" && buffer.subarray(0,4).toString() === "RIFF" && buffer.subarray(8,12).toString() === "WAVE") ||
      (mimeType === "audio/webm" && buffer.subarray(0,4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])));
    if (!validSignature) return res.status(415).json({ success: false, error: "The file content does not match its declared image, video, PDF or audio type" });
    const extension = ({ "image/jpeg":".jpg", "image/png":".png", "image/gif":".gif", "image/webp":".webp", "video/mp4":".mp4", "video/webm":".webm", "video/quicktime":".mov", "application/pdf":".pdf", "audio/mpeg":".mp3", "audio/mp4":".m4a", "audio/ogg":".ogg", "audio/wav":".wav", "audio/webm":".webm" })[mimeType];
    const filename = `${crypto.randomUUID()}${extension}`;
    const uploadDir = path.join(__dirname, "../../uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    storedPath = path.join(uploadDir, filename);
    await fs.writeFile(storedPath, buffer, { flag: "wx" });
    const message = await Message.create({
      conversation: conversation._id, sender: req.auth.userId, text: "",
      attachment: { url: `/api/messages/${conversationId}/attachments/${filename}`, name: originalName, mimeType, size: buffer.length },
      readBy: [req.auth.userId],
    });
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();
    const populated = await Message.findById(message._id).populate("sender", "name username avatarUrl").lean();
    req.app.get("io")?.to(`conversation:${String(conversation._id)}`).emit("message:new", populated);
    return res.status(201).json({ success: true, message: populated });
  } catch (err) {
    if (storedPath) await fs.unlink(storedPath).catch(() => {});
    return next(err);
  }
}

async function getAttachment(req, res, next) {
  try {
    const { conversationId, filename } = req.params;
    if (!mongoose.isValidObjectId(conversationId) || !/^[a-f0-9-]+\.(jpg|png|gif|webp|mp4|webm|mov|pdf|mp3|m4a|ogg|wav)$/i.test(filename))
      return res.status(400).json({ success: false, error: "Invalid attachment" });
    const conversation = await Conversation.findById(conversationId).select("type participants");
    if (!conversation || !isMember(conversation, req.auth.userId))
      return res.status(404).json({ success: false, error: "Attachment not found" });
    const message = await Message.findOne({
      conversation: conversationId,
      $or: [
        { "attachment.url": `/api/messages/${conversationId}/attachments/${filename}` },
        { "attachment.url": `/uploads/${filename}` },
      ],
    }).select("attachment");
    if (!message?.attachment) return res.status(404).json({ success: false, error: "Attachment not found" });
    const filePath = path.join(__dirname, "../../uploads", filename);
    res.setHeader("Content-Type", message.attachment.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(message.attachment.name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(filePath);
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    const conversation = await Conversation.findById(req.params.conversationId).select("type participants");
    if (!conversation || !isMember(conversation, req.auth.userId))
      return res.status(404).json({ success: false, error: "Conversation not found" });
    const reader = await User.findById(req.auth.userId).select("readReceiptsEnabled");
    if (reader?.readReceiptsEnabled === false) return res.json({ success: true, readReceiptsDisabled: true });
    await Message.updateMany(
      { conversation: conversation._id, sender: { $ne: req.auth.userId }, readBy: { $ne: req.auth.userId }, deletedAt: null },
      { $addToSet: { readBy: req.auth.userId, deliveredTo: req.auth.userId } }
    );
    req.app.get("io")?.to(`conversation:${String(conversation._id)}`).emit("messages:read", {
      conversationId: String(conversation._id), userId: req.auth.userId,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function deleteMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const { scope } = req.body || {};
    if (!mongoose.isValidObjectId(messageId) || !["me", "everyone"].includes(scope))
      return res.status(400).json({ success: false, error: "Invalid delete request" });
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, error: "Message not found" });
    const conversation = await Conversation.findById(message.conversation).select("type participants admins");
    if (!conversation || !isMember(conversation, req.auth.userId))
      return res.status(404).json({ success: false, error: "Message not found" });
    if (scope === "everyone") {
      const isGroupAdmin = conversation.type === "group" &&
        conversation.admins.some((id) => String(id) === req.auth.userId);
      if (String(message.sender) !== req.auth.userId && !isGroupAdmin)
        return res.status(403).json({ success: false, error: "Only the sender or a group admin can delete this message for everyone" });
      message.deletedForEveryone = true;
      message.deletedAt = new Date();
      message.text = "";
      message.attachment = null;
    } else {
      message.hiddenFor.addToSet(req.auth.userId);
    }
    await message.save();
    const payload = { messageId: String(message._id), conversationId: String(message.conversation), scope, userId: req.auth.userId, deletedForEveryone: message.deletedForEveryone };
    const io = req.app.get("io");
    if (scope === "everyone") io?.to(`conversation:${String(message.conversation)}`).emit("message:deleted", payload);
    else io?.to(`user:${req.auth.userId}`).emit("message:hidden", payload);
    res.json({ success: true, ...payload });
  } catch (err) { next(err); }
}

async function clearHistory(req, res, next) {
  try {
    const conversation = await Conversation.findById(req.params.conversationId).select("type participants");
    if (!conversation || !isMember(conversation, req.auth.userId))
      return res.status(404).json({ success: false, error: "Conversation not found" });
    await Message.updateMany({ conversation: conversation._id, hiddenFor: { $ne: req.auth.userId } }, { $addToSet: { hiddenFor: req.auth.userId } });
    req.app.get("io")?.to(`user:${req.auth.userId}`).emit("history:cleared", { conversationId: String(conversation._id) });
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { createMessage, uploadAttachment, getAttachment, markRead, deleteMessage, clearHistory };

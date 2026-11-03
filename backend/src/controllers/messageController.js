const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const MAX_UPLOAD = 25 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);
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
    const message = await Message.create({
      conversation: conversation._id, sender: req.auth.userId,
      text: text.trim(), readBy: [req.auth.userId],
    });
    conversation.lastMessageAt = message.createdAt;
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
    const buffer = req.body;
    const mimeType = req.headers["x-file-mime"];
    const originalName = decodeURIComponent(req.headers["x-file-name"] || "attachment").slice(0, 180);
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_UPLOAD)
      return res.status(400).json({ success: false, error: "Choose a file smaller than 25 MB" });
    if (!ALLOWED.has(mimeType)) return res.status(415).json({ success: false, error: "Only JPG, PNG, GIF, WebP, MP4, WebM and MOV files are allowed" });
    const isImage = mimeType.startsWith("image/");
    const validSignature = (mimeType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8) ||
      (mimeType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
      (mimeType === "image/gif" && ["GIF87a","GIF89a"].includes(buffer.subarray(0,6).toString())) ||
      (mimeType === "image/webp" && buffer.subarray(0,4).toString() === "RIFF" && buffer.subarray(8,12).toString() === "WEBP") ||
      (mimeType.startsWith("video/") && (buffer.subarray(4,8).toString() === "ftyp" || buffer.subarray(0,4).toString() === "RIFF" || buffer.subarray(0,4).toString() === "\u001aE\u df\u a3"));
    if (!validSignature) return res.status(415).json({ success: false, error: "The file content does not match a supported image/video type" });
    const extension = ({ "image/jpeg":".jpg", "image/png":".png", "image/gif":".gif", "image/webp":".webp", "video/mp4":".mp4", "video/webm":".webm", "video/quicktime":".mov" })[mimeType];
    const filename = `${crypto.randomUUID()}${extension}`;
    const uploadDir = path.join(__dirname, "../../uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    storedPath = path.join(uploadDir, filename);
    await fs.writeFile(storedPath, buffer, { flag: "wx" });
    const message = await Message.create({
      conversation: conversation._id, sender: req.auth.userId, text: "",
      attachment: { url: `/uploads/${filename}`, name: originalName, mimeType, size: buffer.length },
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

async function markRead(req, res, next) {
  try {
    const conversation = await Conversation.findById(req.params.conversationId).select("type participants");
    if (!conversation || !isMember(conversation, req.auth.userId))
      return res.status(404).json({ success: false, error: "Conversation not found" });
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
      if (String(message.sender) !== req.auth.userId)
        return res.status(403).json({ success: false, error: "You can only delete your own message for everyone" });
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

module.exports = { createMessage, uploadAttachment, markRead, deleteMessage, clearHistory };

const mongoose = require("mongoose");
const Message = require("../models/Message");

const MAX_MESSAGE_LENGTH = 1000;
const MAX_USERNAME_LENGTH = 30;

/**
 * GET /api/messages
 * Returns the latest `limit` messages (default 100) sorted chronologically.
 */
async function getMessages(req, res, next) {
  try {
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 100);

    const messages = await Message.find()
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .lean();

    res.json(messages);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/messages
 * Validates { username, text }, stores the message and returns it.
 */
async function createMessage(req, res, next) {
  try {
    const { username, text } = req.body || {};

    const cleanUsername = typeof username === "string" ? username.trim() : "";
    const cleanText = typeof text === "string" ? text.trim() : "";

    if (!cleanUsername) {
      return res.status(400).json({ success: false, error: "username is required" });
    }
    if (cleanUsername.length > MAX_USERNAME_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `username must be at most ${MAX_USERNAME_LENGTH} characters`,
      });
    }
    if (!cleanText) {
      return res.status(400).json({
        success: false,
        error: "text is required and cannot be empty",
      });
    }
    if (cleanText.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `text must be at most ${MAX_MESSAGE_LENGTH} characters`,
      });
    }

    const message = await Message.create({
      username: cleanUsername,
      text: cleanText,
      status: "sent",
    });

    res.status(201).json({ success: true, message });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/messages/:id
 * Removes a single message by id.
 */
async function deleteMessage(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid message id" });
    }

    const message = await Message.findByIdAndDelete(id);
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/messages
 * Clears the entire chat, then broadcasts `chat_cleared` so every
 * connected client empties its message list in real time.
 */
async function clearMessages(req, res, next) {
  try {
    await Message.deleteMany({});

    const io = req.app.get("io");
    if (io) io.emit("chat_cleared", {});

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMessages, createMessage, deleteMessage, clearMessages };

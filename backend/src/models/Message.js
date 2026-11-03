const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  name: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, max: 25 * 1024 * 1024 },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, trim: true, maxlength: 4000, default: "" },
  attachment: { type: attachmentSchema, default: null },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  deletedForEveryone: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1 });
module.exports = mongoose.model("Message", messageSchema);

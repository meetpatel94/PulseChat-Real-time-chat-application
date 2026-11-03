const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["global", "direct", "group"], required: true },
  title: { type: String, trim: true, maxlength: 80, default: "" },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  memberNicknames: { type: Map, of: String, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ type: 1 }, { unique: true, partialFilterExpression: { type: "global" } });
conversationSchema.index({ type: 1, participants: 1 });
module.exports = mongoose.model("Conversation", conversationSchema);

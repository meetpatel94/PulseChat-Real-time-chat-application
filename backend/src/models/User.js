const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    username: {
      type: String, required: true, trim: true, lowercase: true,
      minlength: 3, maxlength: 24, match: /^[a-z0-9_]+$/,
    },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 160 },
    isActive: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },
    readReceiptsEnabled: { type: Boolean, default: true },
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);

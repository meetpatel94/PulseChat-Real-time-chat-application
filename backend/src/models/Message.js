const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      trim: true,
      minlength: [1, "username cannot be empty"],
      maxlength: [30, "username must be at most 30 characters"],
    },
    text: {
      type: String,
      required: [true, "text is required"],
      trim: true,
      minlength: [1, "text cannot be empty"],
      maxlength: [1000, "text must be at most 1000 characters"],
    },
    status: {
      type: String,
      enum: ["sent", "delivered"],
      default: "sent",
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

module.exports = mongoose.model("Message", messageSchema);

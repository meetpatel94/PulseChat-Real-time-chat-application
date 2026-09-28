const express = require("express");
const {
  getMessages,
  createMessage,
  deleteMessage,
  clearMessages,
} = require("../controllers/messageController");

const router = express.Router();

router.get("/", getMessages);
router.post("/", createMessage);
router.delete("/", clearMessages);
router.delete("/:id", deleteMessage);

module.exports = router;

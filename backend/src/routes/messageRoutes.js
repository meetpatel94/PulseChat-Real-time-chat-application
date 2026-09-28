const express = require("express");
const {
  getMessages,
  createMessage,
  deleteMessage,
} = require("../controllers/messageController");

const router = express.Router();

router.get("/", getMessages);
router.post("/", createMessage);
router.delete("/:id", deleteMessage);

module.exports = router;

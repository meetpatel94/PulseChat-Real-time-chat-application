const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { createMessage, markRead } = require("../controllers/messageController");
const router = express.Router();
router.use(requireAuth);
router.post("/:conversationId", createMessage);
router.post("/:conversationId/read", markRead);
module.exports = router;

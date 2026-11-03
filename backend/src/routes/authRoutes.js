const express = require("express");
const { register, login, me, searchUsers } = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);
router.get("/users", requireAuth, searchUsers);

module.exports = router;

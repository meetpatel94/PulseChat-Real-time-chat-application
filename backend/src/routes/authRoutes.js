const express = require("express");
const { register, login, me, searchUsers, updateProfile } = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);
router.patch("/profile", requireAuth, updateProfile);
router.get("/users", requireAuth, searchUsers);

module.exports = router;

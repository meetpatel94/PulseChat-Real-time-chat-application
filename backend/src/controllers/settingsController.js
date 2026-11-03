const mongoose = require("mongoose");
const User = require("../models/User");

async function getSettings(req, res, next) {
  try {
    const user = await User.findById(req.auth.userId).select("readReceiptsEnabled");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, settings: { readReceiptsEnabled: user.readReceiptsEnabled !== false } });
  } catch (err) { next(err); }
}
async function updateSettings(req, res, next) {
  try {
    const { readReceiptsEnabled } = req.body || {};
    if (typeof readReceiptsEnabled !== "boolean") return res.status(400).json({ success: false, error: "readReceiptsEnabled must be true or false" });
    await User.updateOne({ _id: req.auth.userId }, { $set: { readReceiptsEnabled } });
    res.json({ success: true, settings: { readReceiptsEnabled } });
  } catch (err) { next(err); }
}
async function listBlockedUsers(req, res, next) {
  try {
    const user = await User.findById(req.auth.userId).populate("blockedUsers", "name username avatarUrl").select("blockedUsers");
    res.json({ success: true, users: (user?.blockedUsers || []).map((u) => ({ id: String(u._id), name: u.name, username: u.username, avatarUrl: u.avatarUrl || "" })) });
  } catch (err) { next(err); }
}
async function blockUser(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId) || String(userId) === req.auth.userId) return res.status(400).json({ success: false, error: "Invalid user to block" });
    const target = await User.findOne({ _id: userId, isActive: true }).select("_id");
    if (!target) return res.status(404).json({ success: false, error: "User not found" });
    await User.updateOne({ _id: req.auth.userId }, { $addToSet: { blockedUsers: userId } });
    res.json({ success: true, blockedUserId: String(userId) });
  } catch (err) { next(err); }
}
async function unblockUser(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, error: "Invalid user id" });
    await User.updateOne({ _id: req.auth.userId }, { $pull: { blockedUsers: userId } });
    res.json({ success: true, unblockedUserId: String(userId) });
  } catch (err) { next(err); }
}
module.exports = { getSettings, updateSettings, blockUser, unblockUser, listBlockedUsers };

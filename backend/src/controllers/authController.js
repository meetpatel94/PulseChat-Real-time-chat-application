const crypto = require("crypto");
const { promisify } = require("util");
const User = require("../models/User");
const { signToken } = require("../utils/auth");

const scrypt = promisify(crypto.scrypt);
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return salt + ":" + derived.toString("hex");
}

async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function publicUser(user) {
  return {
    id: String(user._id), name: user.name, username: user.username,
    email: user.email, avatarUrl: user.avatarUrl || "", bio: user.bio || "",
    createdAt: user.createdAt,
  };
}

async function register(req, res, next) {
  try {
    const { name, username, email, password } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 60)
      return res.status(400).json({ success: false, error: "Name must be 2–60 characters" });
    if (typeof username !== "string" || !USERNAME_RE.test(username.trim()))
      return res.status(400).json({ success: false, error: "Username must be 3–24 characters (letters, numbers, underscore)" });
    if (typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.length > 254)
      return res.status(400).json({ success: false, error: "Enter a valid email address" });
    if (typeof password !== "string" || password.length < 8 || password.length > 128)
      return res.status(400).json({ success: false, error: "Password must be 8–128 characters" });

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ $or: [{ username: cleanUsername }, { email: cleanEmail }] }).lean();
    if (exists) return res.status(409).json({ success: false, error: "Username or email is already registered" });

    const user = await User.create({
      name: name.trim(), username: cleanUsername, email: cleanEmail,
      passwordHash: await hashPassword(password),
    });
    return res.status(201).json({ success: true, user: publicUser(user), token: signToken(user) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ success: false, error: "Username or email is already registered" });
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { identity, password } = req.body || {};
    if (typeof identity !== "string" || typeof password !== "string")
      return res.status(400).json({ success: false, error: "Username/email and password are required" });
    const key = identity.trim().toLowerCase();
    const user = await User.findOne({ $or: [{ username: key }, { email: key }] }).select("+passwordHash");
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash)))
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    user.lastSeenAt = new Date();
    await user.save();
    return res.json({ success: true, user: publicUser(user), token: signToken(user) });
  } catch (err) { return next(err); }
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user || !user.isActive) return res.status(401).json({ success: false, error: "Account unavailable" });
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) { return next(err); }
}

async function searchUsers(req, res, next) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
    const safeQuery = q.replace(/[^a-zA-Z0-9_ ]/g, "");
    if (safeQuery.length < 2) return res.json({ success: true, users: [] });
    const users = await User.find({
      _id: { $ne: req.auth.userId }, isActive: true, blockedUsers: { $ne: req.auth.userId },
      $or: [
        { username: { $regex: safeQuery, $options: "i" } },
        { name: { $regex: safeQuery, $options: "i" } },
      ],
    }).select("name username avatarUrl bio").limit(20).lean();
    return res.json({ success: true, users: users.map(u => ({
      id: String(u._id), name: u.name, username: u.username, avatarUrl: u.avatarUrl || "", bio: u.bio || "",
    })) });
  } catch (err) { return next(err); }
}


async function updateProfile(req, res, next) {
  try {
    const { name, username, avatarUrl, bio, currentPassword, newPassword } = req.body || {};
    const user = await User.findById(req.auth.userId).select("+passwordHash");
    if (!user || !user.isActive) return res.status(404).json({ success: false, error: "Account unavailable" });
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 60)
        return res.status(400).json({ success: false, error: "Name must be 2–60 characters" });
      user.name = name.trim();
    }
    if (username !== undefined) {
      if (typeof username !== "string" || !USERNAME_RE.test(username.trim()))
        return res.status(400).json({ success: false, error: "Username must be 3–24 characters (letters, numbers, underscore)" });
      const clean = username.trim().toLowerCase();
      const exists = await User.findOne({ username: clean, _id: { $ne: user._id } }).lean();
      if (exists) return res.status(409).json({ success: false, error: "Username is already taken" });
      user.username = clean;
    }
    if (bio !== undefined) {
      if (typeof bio !== "string" || bio.trim().length > 160)
        return res.status(400).json({ success: false, error: "Bio must be 160 characters or fewer" });
      user.bio = bio.trim();
    }
    if (avatarUrl !== undefined) {
      if (typeof avatarUrl !== "string" || (avatarUrl && (!(avatarUrl.startsWith("data:image/png;base64,") || avatarUrl.startsWith("data:image/jpeg;base64,") || avatarUrl.startsWith("data:image/webp;base64,")) || avatarUrl.length > 1400000)))
        return res.status(400).json({ success: false, error: "Profile photo must be a PNG, JPG or WebP image under 1 MB" });
      user.avatarUrl = avatarUrl;
    }
    if (newPassword !== undefined && newPassword !== "") {
      if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, user.passwordHash)))
        return res.status(401).json({ success: false, error: "Current password is incorrect" });
      if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128)
        return res.status(400).json({ success: false, error: "New password must be 8–128 characters" });
      user.passwordHash = await hashPassword(newPassword);
    }
    await user.save();
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ success: false, error: "Username is already taken" });
    return next(err);
  }
}

module.exports = { register, login, me, searchUsers, updateProfile };

const { verifyToken } = require("../utils/auth");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ success: false, error: "Authentication required" });
  try {
    const payload = verifyToken(match[1]);
    if (!payload) return res.status(401).json({ success: false, error: "Invalid or expired token" });
    req.auth = { userId: payload.sub, username: payload.username };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireAuth;

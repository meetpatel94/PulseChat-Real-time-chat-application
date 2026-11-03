const express = require("express");
const cors = require("cors");
const messageRoutes = require("./routes/messageRoutes");
const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
const authAttempts = new Map();
const authLimiter = (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || now - current.startedAt > 15 * 60 * 1000) authAttempts.set(key, { startedAt: now, count: 1 });
  else if (current.count >= 20) return res.status(429).json({ success: false, error: "Too many authentication attempts. Try again later." });
  else current.count += 1;
  if (authAttempts.size > 10000) for (const [ip, value] of authAttempts) if (now - value.startedAt > 15 * 60 * 1000) authAttempts.delete(ip);
  next();
};

// CORS — allow only the configured frontend origin
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

app.use(express.json({ limit: "3mb" }));

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/messages", messageRoutes);

// 404 + central error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;

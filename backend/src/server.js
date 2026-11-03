require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const { initializeSocket } = require("./sockets/chatSocket");
const { verifyToken } = require("./utils/auth");
const User = require("./models/User");

const PORT = process.env.PORT || 5000;

async function main() {
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("   Make sure MongoDB is running and MONGODB_URI is correct.");
    process.exit(1);
  }

  // 1. Create the HTTP server from the Express app
  const server = http.createServer(app);

  // 2. Attach Socket.io with CORS configured for the frontend origin
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  // Authenticate every realtime connection; never trust a client-supplied username.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      const payload = verifyToken(token);
      if (!payload) return next(new Error("Unauthorized"));
      const user = await User.findById(payload.sub).select("_id username isActive");
      if (!user || !user.isActive) return next(new Error("Unauthorized"));
      socket.user = { id: String(user._id), username: user.username };
      return next();
    } catch (error) { return next(new Error("Unauthorized")); }
  });

  // 3. Wire up authenticated realtime event handlers
  initializeSocket(io);

  // Expose io to Express routes so REST handlers can broadcast
  // (e.g. DELETE /api/messages emits `chat_cleared` to every client).
  app.set("io", io);

  // 4. Start listening
  server.listen(PORT, () => {
    console.log(`✅ PulseChat backend running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
  });
}

main();

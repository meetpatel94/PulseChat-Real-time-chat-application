const express = require("express");
const cors = require("cors");
const messageRoutes = require("./routes/messageRoutes");
const healthRoutes = require("./routes/healthRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

// CORS — allow only the configured frontend origin
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

app.use(express.json({ limit: "10kb" }));

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/messages", messageRoutes);

// 404 + central error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;

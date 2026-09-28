const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

/**
 * Connect to MongoDB using the MONGODB_URI environment variable.
 * Exits the process with a clear message when the connection fails.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pulsechat";
  const conn = await mongoose.connect(uri);
  console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

module.exports = connectDB;

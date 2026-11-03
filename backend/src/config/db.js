const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

/**
 * Connect to MongoDB using the MONGODB_URI environment variable.
 * Exits the process with a clear message when the connection fails.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing. Set it in backend/.env before starting the server.");
  const conn = await mongoose.connect(uri);
  console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

module.exports = connectDB;

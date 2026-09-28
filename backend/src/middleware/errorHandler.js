/**
 * 404 handler — any route that is not defined.
 */
function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Central Express error handler.
 * Converts known Mongoose errors into clean 400 responses and logs
 * unexpected errors with a 500 response.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "Invalid JSON body" });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: Object.values(err.errors).map((e) => e.message).join(", "),
    });
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, error: "Invalid id format" });
  }

  console.error("💥 Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error" });
}

module.exports = { notFound, errorHandler };

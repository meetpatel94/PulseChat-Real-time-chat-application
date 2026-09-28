/**
 * Format an ISO/Date value as a short local time, e.g. "14:05".
 */
export function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Stable id helper — messages coming from Mongoose use `_id`,
 * while plain objects may use `id`.
 */
export function messageId(message) {
  return (message && (message._id || message.id)) || "";
}

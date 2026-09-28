import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

/**
 * Fetch previous chat history (REST, from MongoDB).
 */
export async function fetchMessages(limit = 100) {
  const { data } = await api.get("/messages", { params: { limit } });
  return Array.isArray(data) ? data : (data.messages || []);
}

/**
 * Send a message via REST (fallback when the socket is not connected).
 */
export async function sendRestMessage(username, text) {
  const { data } = await api.post("/messages", { username, text });
  return data;
}

/**
 * Delete a message by id.
 */
export async function deleteMessage(id) {
  const { data } = await api.delete(`/messages/${id}`);
  return data;
}

/**
 * Clear the entire chat (all messages, for every user).
 */
export async function clearAllMessages() {
  const { data } = await api.delete("/messages");
  return data;
}

/**
 * Extract a human-readable message from any axios/network error.
 */
export function getErrorMessage(err) {
  if (err && err.response && err.response.data && err.response.data.error) {
    return err.response.data.error;
  }
  if (err && err.message === "Network Error") {
    return "Cannot reach the chat server. Is the backend running?";
  }
  return (err && err.message) || "Something went wrong";
}

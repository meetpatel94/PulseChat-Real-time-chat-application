import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;

/**
 * Create (or replace) the Socket.io connection for the given user.
 * The username is sent in the handshake `auth` payload so the server
 * can track online users without a separate login event.
 */
export function connectSocket(username) {
  disconnectSocket();

  socket = io(SOCKET_URL, {
    auth: { username },
    transports: ["websocket", "polling"],
    reconnection: true, // built-in automatic reconnection
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
let socket = null;

export function connectSocket(token) {
  disconnectSocket();
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
  return socket;
}
export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
export function getSocket() { return socket; }

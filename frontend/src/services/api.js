import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 15000 });

export function setAuthToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}
export async function registerAccount(payload) { return (await api.post("/auth/register", payload)).data; }
export async function loginAccount(payload) { return (await api.post("/auth/login", payload)).data; }
export async function getCurrentUser() { return (await api.get("/auth/me")).data.user; }
export async function searchUsers(q) { return (await api.get("/auth/users", { params: { q } })).data.users; }
export async function getConversations() { return (await api.get("/conversations")).data.conversations; }
export async function getGlobalConversation() { return (await api.get("/conversations/global")).data.conversation; }
export async function createConversation(payload) { return (await api.post("/conversations", payload)).data.conversation; }
export async function getConversationMessages(id) { return (await api.get(`/conversations/${id}/messages`)).data.messages; }
export async function markConversationRead(id) { return (await api.post(`/messages/${id}/read`)).data; }
export async function addGroupMembers(id, userIds) { return (await api.post(`/conversations/${id}/members`, { userIds })).data.conversation; }

import { useEffect, useState } from "react";
import Login from "./pages/Login.jsx";
import Chat from "./pages/Chat.jsx";
import { getCurrentUser, setAuthToken } from "./services/api.js";

const TOKEN_KEY = "pulsechat_token";

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setChecking(false); return; }
    setAuthToken(token);
    getCurrentUser()
      .then((user) => setSession({ token, user }))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setAuthToken(null); })
      .finally(() => setChecking(false));
  }, []);

  const handleAuth = ({ token, user }) => {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setSession({ token, user });
  };

  const handleUserUpdate = (user) => setSession((current) => current ? { ...current, user } : current);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setSession(null);
  };

  if (checking) return <div className="app-loading"><span className="spinner" />Securing your session…</div>;
  return session
    ? <Chat user={session.user} token={session.token} onUserUpdate={handleUserUpdate} onLogout={logout} />
    : <Login onAuth={handleAuth} />;
}

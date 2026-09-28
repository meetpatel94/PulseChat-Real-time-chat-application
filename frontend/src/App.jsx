import { useCallback, useState } from "react";
import Login from "./pages/Login.jsx";
import Chat from "./pages/Chat.jsx";

const STORAGE_KEY = "pulsechat_username";

export default function App() {
  const [username, setUsername] = useState(
    () => window.localStorage.getItem(STORAGE_KEY) || ""
  );

  const handleLogin = useCallback((name) => {
    const clean = name.trim();
    if (!clean) return;
    window.localStorage.setItem(STORAGE_KEY, clean);
    setUsername(clean);
  }, []);

  const handleLogout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUsername("");
  }, []);

  return username ? (
    <Chat username={username} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}

import { useState } from "react";
import { loginAccount, registerAccount } from "../services/api.js";

export default function Login({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", username: "", email: "", identity: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = mode === "login"
        ? await loginAccount({ identity: form.identity, password: form.password })
        : await registerAccount({ name: form.name, username: form.username, email: form.email, password: form.password });
      onAuth(result);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to connect. Please try again.");
    } finally { setBusy(false); }
  }

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-symbol">ϟ</span><span>PulseChat</span></div>
      <p className="eyebrow">YOUR SPACE. YOUR PEOPLE.</p>
      <h1>{mode === "login" ? "Welcome back." : "Create your account."}</h1>
      <p className="auth-sub">{mode === "login" ? "Sign in and pick up where you left off." : "Join conversations that move with you."}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <>
          <label>Full name<input value={form.name} onChange={change("name")} minLength={2} maxLength={60} required placeholder="Your name" /></label>
          <label>Username<input value={form.username} onChange={change("username")} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required placeholder="meetpatel" /></label>
          <label>Email<input type="email" value={form.email} onChange={change("email")} required placeholder="you@example.com" /></label>
        </>}
        {mode === "login" && <label>Username or email<input value={form.identity} onChange={change("identity")} required autoComplete="username" placeholder="you@example.com" /></label>}
        <label>Password<input type="password" value={form.password} onChange={change("password")} minLength={8} maxLength={128} required autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in →" : "Create account →"}</button>
      </form>
      <p className="auth-switch">{mode === "login" ? "New to PulseChat?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}> {mode === "login" ? "Create account" : "Sign in"}</button></p>
      <p className="auth-foot">Private by design · Real-time by nature</p>
    </section>
  </main>;
}

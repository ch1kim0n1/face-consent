import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.requestMagicLink(email.trim());
      navigate("/check-email", { state: { email } });
    } catch {
      setError("Could not send magic link.");
    }
  }

  return (
    <div className="app-shell">
      <h1>Face Consent</h1>
      <p className="muted">Your face is yours. Scanning asks permission.</p>
      <form className="card" onSubmit={submit}>
        <label className="muted" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button type="submit" className="btn-primary">Send magic link</button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>
        Demo: check the server terminal for the link if email is not configured.
      </p>
    </div>
  );
}

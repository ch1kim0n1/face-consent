import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export function DisplayNamePage() {
  const [name, setName] = useState("");
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.updateProfile({ displayName: name.trim() });
    await refresh();
    navigate("/", { replace: true });
  }

  return (
    <div className="app-shell">
      <h1>Choose a display name</h1>
      <form className="card" onSubmit={submit}>
        <input
          type="text"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="How scanners will see you"
        />
        <button type="submit" className="btn-primary">Continue</button>
      </form>
    </div>
  );
}

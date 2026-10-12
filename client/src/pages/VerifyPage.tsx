import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Missing token");
      return;
    }
    void (async () => {
      try {
        const res = await api.verifyMagicLink(token);
        setUser(res.user);
        navigate(res.needsDisplayName ? "/display-name" : "/", { replace: true });
      } catch {
        setError("Invalid or expired link.");
      }
    })();
  }, [params, navigate, setUser]);

  return (
    <div className="app-shell">
      <h1>Signing in…</h1>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}

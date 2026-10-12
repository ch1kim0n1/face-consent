import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { buildPortraitQrDataUrl } from "../lib/portraitQr";

export function MyCodePage() {
  const { user } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.enrolled || !user.avatarUrl) return;
    void (async () => {
      try {
        const { token } = await api.qrToken();
        const dataUrl = await buildPortraitQrDataUrl(token, user.avatarUrl!);
        setQr(dataUrl);
      } catch {
        setError("Could not build your code.");
      }
    })();
  }, [user]);

  return (
    <div className="app-shell">
      <Link to="/" className="muted">← Home</Link>
      <h1>My code</h1>
      {!user?.enrolled && <p className="muted">Enroll in Profile first.</p>}
      {qr && <img src={qr} alt="Portrait QR" style={{ width: "100%", borderRadius: 12 }} />}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <p className="muted">Hold this up to be scanned, or let someone use live face match.</p>
    </div>
  );
}

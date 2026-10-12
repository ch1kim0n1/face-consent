import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

export function IncomingPage() {
  const { id } = useParams<{ id: string }>();
  const [scannerName, setScannerName] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    const tick = async () => {
      const data = await api.pollConsent(id);
      if (data.status !== "pending") {
        setDone(true);
        return;
      }
      setRemainingMs(data.remainingMs);
    };
    const poll = window.setInterval(() => void tick(), 1000);
    void tick();
    void (async () => {
      const inc = await api.incomingConsent();
      setScannerName(inc.request?.scannerDisplayName ?? "Someone");
    })();
    return () => clearInterval(poll);
  }, [id]);

  async function respond(action: "accepted" | "rejected") {
    if (!id) return;
    try {
      await api.respondConsent(id, action);
      setDone(true);
    } catch {
      setDone(true);
    }
  }

  const sec = Math.ceil(remainingMs / 1000);

  return (
    <div className="app-shell">
      <Link to="/" className="muted">← Home</Link>
      <h1>Permission request</h1>
      {!done ? (
        <div className="card">
          <p>
            <strong>{scannerName ?? "Someone"}</strong> wants to view your profile.
          </p>
          <p className="muted">{sec}s remaining</p>
          <div className="row" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn-danger" onClick={() => void respond("rejected")}>
              Reject
            </button>
            <button type="button" className="btn-ok" onClick={() => void respond("accepted")}>
              Accept
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">Response sent.</p>
      )}
    </div>
  );
}

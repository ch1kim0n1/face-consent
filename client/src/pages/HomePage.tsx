import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { ensurePushSubscription } from "../lib/push";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <h1>Hi, {user?.displayName ?? "there"}</h1>
      <p className="muted">
        {user?.enrolled
          ? "You’re enrolled. Show your code or let someone scan your face."
          : "Enroll your face in Profile before scanning or sharing a code."}
      </p>
      <nav className="nav">
        <Link to="/scan">Scan</Link>
        <Link to="/code">My code</Link>
        <Link to="/profile">Profile</Link>
      </nav>
      <div className="card">
        <p className="muted">Enable notifications so you get Duo-style prompts when someone scans you.</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void ensurePushSubscription()}
        >
          Enable notifications
        </button>
      </div>
    </div>
  );
}

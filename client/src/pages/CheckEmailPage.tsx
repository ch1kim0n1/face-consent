import { Link, useLocation } from "react-router-dom";

export function CheckEmailPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <div className="app-shell">
      <h1>Check your email</h1>
      <p className="muted">
        {email ? `We sent a sign-in link to ${email}.` : "Open the magic link from your email."}
      </p>
      <p className="muted">For local demos, copy the link from the server log.</p>
      <Link to="/">Back</Link>
    </div>
  );
}

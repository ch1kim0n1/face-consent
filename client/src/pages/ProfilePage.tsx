import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Link as UserLink } from "../api";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { descriptorFromImageSource } from "../lib/face";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [links, setLinks] = useState<UserLink[]>(user?.links ?? []);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function enrollFromFile(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = url;
      });
      const result = await descriptorFromImageSource(img);
      URL.revokeObjectURL(url);
      if ("error" in result) {
        setMessage(result.error ?? "Use a single clear face in the photo.");
        return;
      }
      await api.enroll(result.descriptor, file);
      await refresh();
      setMessage("Face enrolled.");
    } catch {
      setMessage("Enrollment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLinks() {
    await api.updateProfile({ links });
    await refresh();
    setMessage("Links saved.");
  }

  function addLink() {
    if (links.length >= 8) return;
    setLinks([...links, { label: "Link", url: "https://" }]);
  }

  return (
    <div className="app-shell">
      <Link to="/" className="muted">← Home</Link>
      <h1>Profile</h1>
      {user.avatarUrl && (
        <img
          src={user.avatarUrl}
          alt=""
          style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover" }}
        />
      )}
      <div className="card">
        <p className="muted">Face enrollment (selfie or upload)</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enrollFromFile(f);
          }}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {user.enrolled ? "Replace face photo" : "Enroll face"}
        </button>
      </div>
      <div className="card">
        <p className="muted">Banner (Discord-style background)</p>
        <input
          ref={bannerRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void api.uploadBanner(f).then(() => refresh());
          }}
        />
        <button type="button" className="btn-secondary" onClick={() => bannerRef.current?.click()}>
          Upload banner
        </button>
      </div>
      <div className="card">
        <p className="muted">Social links</p>
        {links.map((l, i) => (
          <div key={i} style={{ marginBottom: "0.5rem" }}>
            <input
              type="text"
              value={l.label}
              onChange={(e) => {
                const next = [...links];
                next[i] = { ...l, label: e.target.value };
                setLinks(next);
              }}
              placeholder="Label"
            />
            <input
              type="url"
              value={l.url}
              onChange={(e) => {
                const next = [...links];
                next[i] = { ...l, url: e.target.value };
                setLinks(next);
              }}
              placeholder="https://"
              style={{ marginTop: "0.35rem" }}
            />
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addLink}>Add link</button>
        <button type="button" className="btn-primary" onClick={() => void saveLinks()}>
          Save links
        </button>
      </div>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}

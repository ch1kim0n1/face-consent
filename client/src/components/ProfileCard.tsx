import type { Link } from "../api";

type Props = {
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  links: Link[];
};

export function ProfileCard({ displayName, avatarUrl, bannerUrl, links }: Props) {
  return (
    <div className="profile-card">
      <div
        className="profile-banner"
        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
      />
      <div className="profile-body">
        {avatarUrl ? (
          <img className="profile-avatar" src={avatarUrl} alt="" />
        ) : (
          <div className="profile-avatar" />
        )}
        <h2 className="profile-name">{displayName ?? "Unknown"}</h2>
        {links.length > 0 && (
          <div className="link-row">
            {links.map((l) => (
              <a key={l.url} className="link-pill" href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

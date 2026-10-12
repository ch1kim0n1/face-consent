import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { CONSENT_TTL_MS } from "./config.js";
import type { ConsentRow, ConsentStatus, UserRow } from "./db.js";
import { parseLinks } from "./db.js";

export function expireStale(db: Database.Database, now: number) {
  db.prepare(
    `UPDATE consent_requests
     SET status = 'expired', resolved_at = ?
     WHERE status = 'pending' AND expires_at <= ?`,
  ).run(now, now);
}

export function getConsent(db: Database.Database, id: string): ConsentRow | undefined {
  return db
    .prepare(`SELECT * FROM consent_requests WHERE id = ?`)
    .get(id) as ConsentRow | undefined;
}

export function findPendingPair(
  db: Database.Database,
  ownerId: string,
  scannerId: string,
  now: number,
): ConsentRow | undefined {
  expireStale(db, now);
  return db
    .prepare(
      `SELECT * FROM consent_requests
       WHERE owner_id = ? AND scanner_id = ? AND status = 'pending' AND expires_at > ?`,
    )
    .get(ownerId, scannerId, now) as ConsentRow | undefined;
}

export function createConsent(
  db: Database.Database,
  ownerId: string,
  scannerId: string,
  now: number,
): ConsentRow {
  const id = randomUUID();
  const expiresAt = now + CONSENT_TTL_MS;
  db.prepare(
    `INSERT INTO consent_requests (id, owner_id, scanner_id, status, created_at, expires_at, resolved_at)
     VALUES (?, ?, ?, 'pending', ?, ?, NULL)`,
  ).run(id, ownerId, scannerId, now, expiresAt);
  return getConsent(db, id)!;
}

export function resolveConsent(
  db: Database.Database,
  id: string,
  action: "accepted" | "rejected",
  now: number,
): { ok: true; row: ConsentRow } | { ok: false; reason: "not_found" | "not_pending" } {
  expireStale(db, now);
  const row = getConsent(db, id);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "pending") return { ok: false, reason: "not_pending" };
  db.prepare(
    `UPDATE consent_requests SET status = ?, resolved_at = ? WHERE id = ?`,
  ).run(action, now, id);
  return { ok: true, row: getConsent(db, id)! };
}

export function publicProfileFromUser(user: UserRow, baseUrl: string) {
  return {
    displayName: user.display_name,
    avatarUrl: user.avatar_path ? `${baseUrl}/uploads/${user.avatar_path}` : null,
    bannerUrl: user.banner_path ? `${baseUrl}/uploads/${user.banner_path}` : null,
    links: parseLinks(user.links_json),
  };
}

export function consentPayloadForScanner(
  row: ConsentRow,
  owner: UserRow | undefined,
  baseUrl: string,
  now: number,
) {
  const remainingMs = Math.max(0, row.expires_at - now);
  const base = {
    id: row.id,
    status: row.status as ConsentStatus,
    remainingMs,
  };
  if (row.status === "accepted" && owner) {
    return { ...base, profile: publicProfileFromUser(owner, baseUrl) };
  }
  return base;
}

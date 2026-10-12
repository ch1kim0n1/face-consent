import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

export type Link = { label: string; url: string };

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  face_vector: string | null;
  links_json: string;
  created_at: number;
};

export type ConsentStatus = "pending" | "accepted" | "rejected" | "expired";

export type ConsentRow = {
  id: string;
  owner_id: string;
  scanner_id: string;
  status: ConsentStatus;
  created_at: number;
  expires_at: number;
  resolved_at: number | null;
};

export function openDb(dbPath: string, dataDir: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      avatar_path TEXT,
      banner_path TEXT,
      face_vector TEXT,
      links_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      subscription_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consent_requests (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      scanner_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      resolved_at INTEGER NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consent_owner_pending
      ON consent_requests(owner_id, status);
    CREATE INDEX IF NOT EXISTS idx_consent_pair
      ON consent_requests(owner_id, scanner_id, status);
  `);
  return { db, dataDir };
}

export function parseLinks(json: string): Link[] {
  const parsed = JSON.parse(json) as Link[];
  return Array.isArray(parsed) ? parsed : [];
}

export function parseVector(raw: string | null): number[] | null {
  if (!raw) return null;
  const v = JSON.parse(raw) as number[];
  if (!Array.isArray(v) || v.length !== 128) return null;
  return v;
}

export function newUserId() {
  return randomUUID();
}

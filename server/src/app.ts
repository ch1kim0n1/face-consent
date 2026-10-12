import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { cors } from "hono/cors";
import type Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  MAGIC_LINK_TTL_MS,
  MAX_IMAGE_BYTES,
  MAX_LINKS,
  SESSION_TTL_MS,
} from "./config.js";
import {
  consentPayloadForScanner,
  createConsent,
  expireStale,
  findPendingPair,
  getConsent,
  publicProfileFromUser,
  resolveConsent,
} from "./consent.js";
import { newUserId, openDb, parseLinks, parseVector, type Link, type UserRow } from "./db.js";
import { distanceForUser, findBestMatch } from "./matching.js";
import { notifyOwner, saveSubscription } from "./push.js";
import { signUserToken, verifyUserToken } from "./qr.js";

export type AppEnv = {
  db: Database.Database;
  dataDir: string;
  secret: string;
  baseUrl: string;
  clientOrigin: string;
};

function sessionUserId(db: Database.Database, token: string | undefined, now: number) {
  if (!token) return null;
  const row = db
    .prepare(`SELECT user_id, expires_at FROM sessions WHERE token = ?`)
    .get(token) as { user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at <= now) return null;
  return row.user_id;
}

function getUser(db: Database.Database, id: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

function isValidUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function saveImage(dataDir: string, userId: string, kind: string, bytes: Buffer, ext: string) {
  const name = `${userId}-${kind}-${Date.now()}.${ext}`;
  const rel = name;
  fs.writeFileSync(path.join(dataDir, name), bytes);
  return rel;
}

function enrolledUsers(db: Database.Database): { userId: string; vector: number[] }[] {
  const rows = db
    .prepare(`SELECT id, face_vector FROM users WHERE face_vector IS NOT NULL`)
    .all() as { id: string; face_vector: string }[];
  const out: { userId: string; vector: number[] }[] = [];
  for (const r of rows) {
    const v = parseVector(r.face_vector);
    if (v) out.push({ userId: r.id, vector: v });
  }
  return out;
}

export function createApp(env: AppEnv) {
  const app = new Hono<{ Variables: { auth?: { user: UserRow; now: number } } }>();

  app.use(
    "*",
    cors({
      origin: env.clientOrigin,
      credentials: true,
    }),
  );

  app.use("/api/*", async (c, next) => {
    const token = getCookie(c, "session");
    const now = Date.now();
    const userId = sessionUserId(env.db, token, now);
    if (userId) {
      const user = getUser(env.db, userId);
      if (user) c.set("auth", { user, now });
    }
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/config/public", (c) =>
    c.json({
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    }),
  );

  app.post("/api/auth/magic-link", async (c) => {
    const body = await c.req.json<{ email?: string }>();
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return c.json({ error: "Invalid email" }, 400);
    }
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    env.db
      .prepare(
        `INSERT INTO magic_links (token, email, expires_at, used) VALUES (?, ?, ?, 0)`,
      )
      .run(token, email, now + MAGIC_LINK_TTL_MS);
    const link = `${env.clientOrigin}/auth/verify?token=${token}`;
    if (process.env.RESEND_API_KEY) {
      console.log(`Magic link for ${email} (configure mail send): ${link}`);
    } else {
      console.log(`\n=== Magic link for ${email} ===\n${link}\n`);
    }
    return c.json({ ok: true });
  });

  app.get("/api/auth/verify", (c) => {
    const token = c.req.query("token");
    if (!token) return c.json({ error: "Missing token" }, 400);
    const now = Date.now();
    const row = env.db
      .prepare(`SELECT email, expires_at, used FROM magic_links WHERE token = ?`)
      .get(token) as { email: string; expires_at: number; used: number } | undefined;
    if (!row || row.used || row.expires_at <= now) {
      return c.json({ error: "Invalid or expired link" }, 400);
    }
    env.db.prepare(`UPDATE magic_links SET used = 1 WHERE token = ?`).run(token);
    let user = env.db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(row.email) as UserRow | undefined;
    if (!user) {
      const id = newUserId();
      env.db
        .prepare(
          `INSERT INTO users (id, email, display_name, avatar_path, banner_path, face_vector, links_json, created_at)
           VALUES (?, ?, NULL, NULL, NULL, NULL, '[]', ?)`,
        )
        .run(id, row.email, now);
      user = getUser(env.db, id)!;
    }
    const sessionToken = randomBytes(32).toString("base64url");
    env.db
      .prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
      .run(sessionToken, user.id, now + SESSION_TTL_MS);
    setCookie(c, "session", sessionToken, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return c.json({
      ok: true,
      needsDisplayName: !user.display_name,
      user: serializeUser(user, env),
    });
  });

  app.post("/api/auth/logout", (c) => {
    const token = getCookie(c, "session");
    if (token) env.db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    deleteCookie(c, "session", { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/api/me", (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    return c.json({ user: serializeUser(auth.user, env) });
  });

  app.patch("/api/me", async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{ displayName?: string; links?: Link[] }>();
    if (body.displayName !== undefined) {
      const name = body.displayName.trim();
      if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
        return c.json({ error: "Invalid display name" }, 400);
      }
      env.db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(name, auth.user.id);
    }
    if (body.links !== undefined) {
      if (!Array.isArray(body.links) || body.links.length > MAX_LINKS) {
        return c.json({ error: "Invalid links" }, 400);
      }
      for (const link of body.links) {
        if (!link.label?.trim() || !isValidUrl(link.url)) {
          return c.json({ error: "Invalid link" }, 400);
        }
      }
      env.db
        .prepare(`UPDATE users SET links_json = ? WHERE id = ?`)
        .run(JSON.stringify(body.links), auth.user.id);
    }
    const user = getUser(env.db, auth.user.id)!;
    return c.json({ user: serializeUser(user, env) });
  });

  app.post("/api/me/enroll", async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return c.json({ error: "Expected multipart form" }, 400);
    }
    const form = await c.req.parseBody();
    const descriptorRaw = form.descriptor;
    const avatar = form.avatar;
    if (typeof descriptorRaw !== "string") {
      return c.json({ error: "Missing descriptor" }, 400);
    }
    let descriptor: number[];
    try {
      descriptor = JSON.parse(descriptorRaw) as number[];
      if (!Array.isArray(descriptor) || descriptor.length !== 128) {
        return c.json({ error: "Invalid descriptor" }, 400);
      }
    } catch {
      return c.json({ error: "Invalid descriptor" }, 400);
    }
    if (!(avatar instanceof File)) {
      return c.json({ error: "Missing avatar" }, 400);
    }
    const buf = Buffer.from(await avatar.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
      return c.json({ error: "Image too large" }, 400);
    }
    const ext = avatar.type === "image/png" ? "png" : avatar.type === "image/webp" ? "webp" : "jpg";
    const rel = saveImage(env.dataDir, auth.user.id, "avatar", buf, ext);
    env.db
      .prepare(`UPDATE users SET face_vector = ?, avatar_path = ? WHERE id = ?`)
      .run(JSON.stringify(descriptor), rel, auth.user.id);
    const user = getUser(env.db, auth.user.id)!;
    return c.json({ user: serializeUser(user, env) });
  });

  app.post("/api/me/banner", async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const form = await c.req.parseBody();
    const banner = form.banner;
    if (!(banner instanceof File)) return c.json({ error: "Missing banner" }, 400);
    const buf = Buffer.from(await banner.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return c.json({ error: "Image too large" }, 400);
    const ext = banner.type === "image/png" ? "png" : banner.type === "image/webp" ? "webp" : "jpg";
    const rel = saveImage(env.dataDir, auth.user.id, "banner", buf, ext);
    env.db.prepare(`UPDATE users SET banner_path = ? WHERE id = ?`).run(rel, auth.user.id);
    const user = getUser(env.db, auth.user.id)!;
    return c.json({ user: serializeUser(user, env) });
  });

  app.get("/api/me/qr-token", (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    if (!auth.user.face_vector) return c.json({ error: "Not enrolled" }, 400);
    return c.json({ token: signUserToken(auth.user.id, env.secret) });
  });

  app.post("/api/push/subscribe", async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{ subscription?: unknown }>();
    if (!body.subscription) return c.json({ error: "Missing subscription" }, 400);
    saveSubscription(env.db, auth.user.id, body.subscription);
    return c.json({ ok: true });
  });

  app.get("/api/consent/incoming", (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    expireStale(env.db, auth.now);
    const row = env.db
      .prepare(
        `SELECT * FROM consent_requests
         WHERE owner_id = ? AND status = 'pending' AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(auth.user.id, auth.now) as import("./db.js").ConsentRow | undefined;
    if (!row) return c.json({ request: null });
    const scanner = getUser(env.db, row.scanner_id)!;
    return c.json({
      request: {
        id: row.id,
        scannerDisplayName: scanner.display_name,
        remainingMs: Math.max(0, row.expires_at - auth.now),
      },
    });
  });

  app.post("/api/consent/:id/respond", async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const body = await c.req.json<{ action?: string }>();
    if (body.action !== "accepted" && body.action !== "rejected") {
      return c.json({ error: "Invalid action" }, 400);
    }
    const row = getConsent(env.db, id);
    if (!row || row.owner_id !== auth.user.id) {
      return c.json({ error: "Not found" }, 404);
    }
    const result = resolveConsent(env.db, id, body.action, auth.now);
    if (!result.ok) return c.json({ error: "Not pending" }, 409);
    return c.json({ ok: true, status: result.row.status });
  });

  app.get("/api/consent/:id", (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    expireStale(env.db, auth.now);
    const row = getConsent(env.db, c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.scanner_id !== auth.user.id && row.owner_id !== auth.user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const owner = getUser(env.db, row.owner_id);
    if (row.scanner_id === auth.user.id) {
      return c.json(consentPayloadForScanner(row, owner, env.baseUrl, auth.now));
    }
    const scanner = getUser(env.db, row.scanner_id);
    return c.json({
      id: row.id,
      status: row.status,
      scannerDisplayName: scanner?.display_name,
      remainingMs: Math.max(0, row.expires_at - auth.now),
    });
  });

  async function startConsent(ownerId: string, scanner: UserRow, now: number) {
    if (ownerId === scanner.id) {
      return { error: "self", status: 400 as const };
    }
    const owner = getUser(env.db, ownerId);
    if (!owner || !owner.face_vector) {
      return { error: "not_found", status: 404 as const };
    }
    let row = findPendingPair(env.db, ownerId, scanner.id, now);
    if (!row) {
      row = createConsent(env.db, ownerId, scanner.id, now);
      const scannerName = scanner.display_name ?? "Someone";
      void notifyOwner(env.db, ownerId, scannerName, row.id);
    }
    return {
      consent: consentPayloadForScanner(row, owner, env.baseUrl, now),
    };
  }

  app.post("/api/scan/qr", async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{ token?: string }>();
    if (!body.token) return c.json({ error: "Missing token" }, 400);
    const userId = verifyUserToken(body.token, env.secret);
    if (!userId) return c.json({ error: "Invalid token" }, 400);
    if (userId === auth.user.id) {
      return c.json({ error: "self", message: "That's you." }, 400);
    }
    const result = await startConsent(userId, auth.user, auth.now);
    if ("error" in result && result.error === "self") {
      return c.json({ error: "self", message: "That's you." }, 400);
    }
    if ("error" in result) return c.json({ error: "No match" }, 404);
    return c.json(result);
  });

  app.post("/api/scan/face", async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json<{ descriptor?: number[] }>();
    if (!body.descriptor || body.descriptor.length !== 128) {
      return c.json({ error: "Invalid descriptor" }, 400);
    }
    const enrolled = enrolledUsers(env.db);
    const candidates = enrolled.map((e) => ({
      userId: e.userId,
      distance: distanceForUser(body.descriptor!, e.vector)!,
    }));
    const best = findBestMatch(body.descriptor, candidates);
    if (!best) {
      return c.json({ error: "no_match", message: "No clear match." }, 404);
    }
    if (best.userId === auth.user.id) {
      return c.json({ error: "self", message: "That's you." }, 400);
    }
    const result = await startConsent(best.userId, auth.user, auth.now);
    if ("consent" in result) return c.json(result);
    return c.json({ error: "no_match", message: "No clear match." }, 404);
  });

  app.get("/uploads/:name", (c) => {
    const name = c.req.param("name");
    if (name.includes("..") || name.includes("/")) {
      return c.text("Forbidden", 403);
    }
    const filePath = path.join(env.dataDir, name);
    if (!fs.existsSync(filePath)) return c.notFound();
    return c.body(fs.readFileSync(filePath), 200, {
      "Cache-Control": "private, max-age=3600",
    });
  });

  return app;
}

function serializeUser(user: UserRow, env: AppEnv) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    enrolled: Boolean(user.face_vector),
    avatarUrl: user.avatar_path ? `${env.baseUrl}/uploads/${user.avatar_path}` : null,
    bannerUrl: user.banner_path ? `${env.baseUrl}/uploads/${user.banner_path}` : null,
    links: parseLinks(user.links_json),
  };
}

export function createTestEnv(tmpDir: string, secret = "test-secret") {
  const dbPath = path.join(tmpDir, "test.db");
  const dataDir = path.join(tmpDir, "uploads");
  const { db } = openDb(dbPath, dataDir);
  const env: AppEnv = {
    db,
    dataDir,
    secret,
    baseUrl: "http://localhost:3001",
    clientOrigin: "http://localhost:5173",
  };
  return { env, app: createApp(env) };
}

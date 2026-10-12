import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestEnv } from "./app.js";
import { signUserToken } from "./qr.js";
import { newUserId } from "./db.js";

function vec(seed: number): number[] {
  return Array.from({ length: 128 }, (_, i) => Math.sin(seed * 100 + i));
}

function enrollUser(
  env: ReturnType<typeof createTestEnv>["env"],
  email: string,
  displayName: string,
  descriptor: number[],
) {
  const id = newUserId();
  const now = Date.now();
  env.db
    .prepare(
      `INSERT INTO users (id, email, display_name, avatar_path, banner_path, face_vector, links_json, created_at)
       VALUES (?, ?, ?, 'a.jpg', NULL, ?, '[]', ?)`,
    )
    .run(id, email, displayName, JSON.stringify(descriptor), now);
  return id;
}

describe("consent API", () => {
  let tmp: string;
  let app: ReturnType<typeof createTestEnv>["app"];
  let env: ReturnType<typeof createTestEnv>["env"];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fc-"));
    const t = createTestEnv(tmp);
    app = t.app;
    env = t.env;
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function login(email: string) {
    await app.request("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const row = env.db
      .prepare(`SELECT token FROM magic_links WHERE email = ? ORDER BY expires_at DESC LIMIT 1`)
      .get(email) as { token: string };
    const res = await app.request(`/api/auth/verify?token=${row.token}`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/session=([^;]+)/);
    return match![1];
  }

  it("clear match opens request; weak match does not", async () => {
    const ownerId = enrollUser(env, "owner@test.com", "Owner", vec(1));
    enrollUser(env, "other@test.com", "Other", vec(2));
    const scannerCookie = await login("scanner@test.com");
    env.db
      .prepare(`UPDATE users SET display_name = ? WHERE email = ?`)
      .run("Scanner", "scanner@test.com");

    const strong = await app.request("/api/scan/face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scannerCookie}`,
      },
      body: JSON.stringify({ descriptor: vec(1) }),
    });
    expect(strong.status).toBe(200);
    const body = await strong.json();
    expect(body.consent.status).toBe("pending");

    const weak = await app.request("/api/scan/face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scannerCookie}`,
      },
      body: JSON.stringify({ descriptor: vec(99) }),
    });
    expect(weak.status).toBe(404);
  });

  it("second scan returns same pending request", async () => {
    enrollUser(env, "owner@test.com", "Owner", vec(1));
    const scannerCookie = await login("scanner@test.com");
    const first = await app.request("/api/scan/face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scannerCookie}`,
      },
      body: JSON.stringify({ descriptor: vec(1) }),
    });
    const a = await first.json();
    const second = await app.request("/api/scan/face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scannerCookie}`,
      },
      body: JSON.stringify({ descriptor: vec(1) }),
    });
    const b = await second.json();
    expect(a.consent.id).toBe(b.consent.id);
  });

  it("accept returns profile; reject does not", async () => {
    enrollUser(env, "owner@test.com", "Owner", vec(1));
    env.db
      .prepare(`UPDATE users SET links_json = ? WHERE email = ?`)
      .run(JSON.stringify([{ label: "X", url: "https://x.com/u" }]), "owner@test.com");
    const ownerCookie = await login("owner@test.com");
    const scannerCookie = await login("scanner@test.com");
    const scan = await app.request("/api/scan/face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scannerCookie}`,
      },
      body: JSON.stringify({ descriptor: vec(1) }),
    });
    const { consent } = await scan.json();
    const accept = await app.request(`/api/consent/${consent.id}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${ownerCookie}`,
      },
      body: JSON.stringify({ action: "accepted" }),
    });
    expect(accept.status).toBe(200);
    const poll = await app.request(`/api/consent/${consent.id}`, {
      headers: { Cookie: `session=${scannerCookie}` },
    });
    const payload = await poll.json();
    expect(payload.status).toBe("accepted");
    expect(payload.profile.displayName).toBe("Owner");
    expect(payload.profile.links).toHaveLength(1);

    enrollUser(env, "owner2@test.com", "O2", vec(3));
    const scanner2 = await login("scanner2@test.com");
    const scan2 = await app.request("/api/scan/face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scanner2}`,
      },
      body: JSON.stringify({ descriptor: vec(3) }),
    });
    const { consent: c2 } = await scan2.json();
    const owner2 = await login("owner2@test.com");
    await app.request(`/api/consent/${c2.id}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${owner2}`,
      },
      body: JSON.stringify({ action: "rejected" }),
    });
    const denied = await app.request(`/api/consent/${c2.id}`, {
      headers: { Cookie: `session=${scanner2}` },
    });
    const deniedBody = await denied.json();
    expect(deniedBody.status).toBe("rejected");
    expect(deniedBody.profile).toBeUndefined();
  });

  it("valid QR token resolves; forged does not", async () => {
    const ownerId = enrollUser(env, "owner@test.com", "Owner", vec(1));
    const scannerCookie = await login("scanner@test.com");
    const token = signUserToken(ownerId, env.secret);
    const ok = await app.request("/api/scan/qr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scannerCookie}`,
      },
      body: JSON.stringify({ token }),
    });
    expect(ok.status).toBe(200);
    const bad = await app.request("/api/scan/qr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${scannerCookie}`,
      },
      body: JSON.stringify({ token: `${ownerId}.forged` }),
    });
    expect(bad.status).toBe(400);
  });

  it("scanner matching self opens no request", async () => {
    const id = enrollUser(env, "me@test.com", "Me", vec(1));
    const cookie = await login("me@test.com");
    const res = await app.request("/api/scan/face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${cookie}`,
      },
      body: JSON.stringify({ descriptor: vec(1) }),
    });
    expect(res.status).toBe(400);
  });
});
